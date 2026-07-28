import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Camera, CameraStatus, RecordingType } from '@prisma/client';
import { ChildProcessWithoutNullStreams } from 'child_process';
import * as chokidar from 'chokidar';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  ensureDir,
  keyframesDir,
  liveDir,
  recordingsDir,
  snapshotsDir,
} from '../media/media.paths';
import {
  FFMPEG,
  keyframeArgs,
  liveHlsArgs,
  motionDetectArgs,
  probe,
  recordSegmentArgs,
  runProcess,
  snapshotArgs,
  spawnFfmpeg,
} from './ffmpeg.util';

interface RecorderRuntime {
  proc: ChildProcessWithoutNullStreams;
  sessionId: string;
  prefix: string;
  type: RecordingType;
  dir: string;
  watcher: chokidar.FSWatcher;
  lastFile?: string;
  stopping: boolean;
  eventStopTimer?: NodeJS.Timeout;
}

interface CameraRuntime {
  cam: Camera;
  live?: ChildProcessWithoutNullStreams;
  liveStartedAt: number;
  liveStopping: boolean;
  restartTimer?: NodeJS.Timeout;
  backoffMs: number;
  recorder?: RecorderRuntime;
  motion?: ChildProcessWithoutNullStreams;
  motionStopping: boolean;
  motionRestartTimer?: NodeJS.Timeout;
  lastMotionEventAt: number;
  status: CameraStatus;
  everOnline: boolean;
  lastHbWrite: number;
  /** throttles continuous-recording recovery attempts */
  lastRecoveryAt?: number;
}

const SEGMENT_SECONDS = parseInt(process.env.SEGMENT_SECONDS || '60');
const KEYFRAME_INTERVAL = parseInt(process.env.KEYFRAME_INTERVAL_SECONDS || '30');
const MOTION_THRESHOLD = process.env.MOTION_THRESHOLD || '0.05';
const MOTION_DEBOUNCE_MS = 15_000;
const EVENT_RECORDING_TAIL_MS = 45_000;

@Injectable()
export class StreamManagerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private log = new Logger('StreamManager');
  private runtimes = new Map<string, CameraRuntime>();
  private shuttingDown = false;
  readonly bootedAt = Date.now();

  constructor(
    private prisma: PrismaService,
    private events: EventsService,
    private realtime: RealtimeGateway,
  ) {}

  async onApplicationBootstrap() {
    // Sessions left ACTIVE by a previous crash are marked FAILED.
    await this.prisma.recordingSession.updateMany({
      where: { status: 'ACTIVE' },
      data: { status: 'FAILED', endedAt: new Date() },
    });
    const cameras = await this.prisma.camera.findMany({ where: { isEnabled: true } });
    cameras.forEach((cam, i) => setTimeout(() => this.startCamera(cam), i * 1000));
    const disabled = await this.prisma.camera.findMany({ where: { isEnabled: false } });
    for (const cam of disabled) {
      if (cam.status !== 'DISABLED') {
        await this.prisma.camera.update({ where: { id: cam.id }, data: { status: 'DISABLED' } });
      }
    }
  }

  async onApplicationShutdown() {
    this.shuttingDown = true;
    await Promise.all([...this.runtimes.keys()].map((id) => this.stopCamera(id, false)));
  }

  // ---------------------------------------------------------------- lifecycle

  async startCamera(cam: Camera) {
    if (this.shuttingDown || !cam.isEnabled) return;
    const rt = this.getRuntime(cam);
    rt.cam = cam;
    this.startLive(rt);
    if (cam.continuousRecording && !rt.recorder) {
      await this.startRecording(cam.id, 'CONTINUOUS').catch((e) =>
        this.log.warn(`continuous recording failed for ${cam.name}: ${e.message}`),
      );
    }
    if (cam.motionDetection) this.startMotion(rt);
  }

  async stopCamera(cameraId: string, markDisabled = true) {
    const rt = this.runtimes.get(cameraId);
    if (!rt) return;
    if (rt.restartTimer) clearTimeout(rt.restartTimer);
    if (rt.motionRestartTimer) clearTimeout(rt.motionRestartTimer);
    rt.liveStopping = true;
    rt.motionStopping = true;
    if (rt.live) rt.live.kill('SIGKILL');
    if (rt.motion) rt.motion.kill('SIGKILL');
    if (rt.recorder) await this.stopRecording(cameraId).catch(() => undefined);
    this.runtimes.delete(cameraId);
    if (markDisabled && !this.shuttingDown) {
      await this.prisma.camera
        .update({ where: { id: cameraId }, data: { status: 'DISABLED' } })
        .catch(() => undefined);
      this.realtime.emitCameraStatus(cameraId, 'DISABLED');
    }
  }

  async onCameraUpdated(before: Camera, after: Camera) {
    const rt = this.runtimes.get(after.id);
    if (!after.isEnabled) {
      if (rt) await this.stopCamera(after.id);
      return;
    }
    if (!rt || !before.isEnabled) {
      await this.startCamera(after);
      return;
    }
    rt.cam = after;
    const streamChanged =
      before.rtspUrl !== after.rtspUrl || before.transcode !== after.transcode;
    if (streamChanged) {
      await this.stopCamera(after.id, false);
      await this.startCamera(after);
      return;
    }
    if (before.continuousRecording !== after.continuousRecording) {
      if (after.continuousRecording && !rt.recorder) {
        await this.startRecording(after.id, 'CONTINUOUS').catch(() => undefined);
      } else if (!after.continuousRecording && rt.recorder?.type === 'CONTINUOUS') {
        await this.stopRecording(after.id);
      }
    }
    if (before.motionDetection !== after.motionDetection) {
      if (after.motionDetection && !rt.motion) this.startMotion(rt);
      else if (!after.motionDetection && rt.motion) {
        rt.motionStopping = true;
        rt.motion.kill('SIGKILL');
      }
    }
  }

  async onCameraDeleted(cameraId: string) {
    await this.stopCamera(cameraId, false);
    for (const dir of [liveDir(cameraId), recordingsDir(cameraId), keyframesDir(cameraId), snapshotsDir(cameraId)]) {
      await fsp.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private getRuntime(cam: Camera): CameraRuntime {
    let rt = this.runtimes.get(cam.id);
    if (!rt) {
      // Seed in-memory status from the persisted value. Hardcoding OFFLINE here
      // would desync the two: markOffline() short-circuits when it thinks the
      // camera is already offline, so a DB row left at ONLINE (e.g. after an
      // rtspUrl edit tore down the old runtime) would never be corrected.
      const known: CameraStatus = cam.status === 'ONLINE' ? 'ONLINE' : 'OFFLINE';
      rt = {
        cam,
        liveStartedAt: 0,
        liveStopping: false,
        backoffMs: 5000,
        motionStopping: false,
        lastMotionEventAt: 0,
        status: known,
        everOnline: known === 'ONLINE',
        lastHbWrite: 0,
      };
      this.runtimes.set(cam.id, rt);
    }
    return rt;
  }

  /** Buffers the last few stderr lines of a pipeline so failures are diagnosable from logs/events. */
  private captureStderrTail(proc: ChildProcessWithoutNullStreams, maxLines = 8): () => string {
    const lines: string[] = [];
    let buf = '';
    proc.stderr.on('data', (chunk) => {
      buf += chunk.toString();
      const parts = buf.split('\n');
      buf = parts.pop() ?? '';
      for (const line of parts) {
        if (!line.trim()) continue;
        lines.push(line.trim());
        if (lines.length > maxLines) lines.shift();
      }
    });
    return () => lines.join(' | ') || '(no ffmpeg output captured)';
  }

  // ---------------------------------------------------------------- live HLS

  private startLive(rt: CameraRuntime) {
    if (rt.live || this.shuttingDown) return;
    const dir = ensureDir(liveDir(rt.cam.id));
    // wipe stale playlist so health checks don't see old segments as fresh
    fs.rmSync(path.join(dir, 'index.m3u8'), { force: true });
    const args = liveHlsArgs(rt.cam.rtspUrl, dir, rt.cam.transcode, rt.cam.fps);
    const proc = spawnFfmpeg(args);
    rt.live = proc;
    rt.liveStartedAt = Date.now();
    rt.liveStopping = false;
    this.log.log(`live pipeline started for ${rt.cam.name}`);

    const stderrTail = this.captureStderrTail(proc);
    proc.on('close', (code) => {
      if (rt.live === proc) rt.live = undefined;
      if (this.shuttingDown || rt.liveStopping) return;
      this.log.warn(
        `live pipeline for ${rt.cam.name} exited (code ${code}), retry in ${rt.backoffMs}ms — ${stderrTail()}`,
      );
      void this.markOffline(rt);
      rt.restartTimer = setTimeout(() => {
        rt.backoffMs = Math.min(rt.backoffMs * 2, 60_000);
        this.startLive(rt);
      }, rt.backoffMs);
    });
    proc.on('error', () => proc.kill('SIGKILL'));
  }

  /** Watches HLS playlist freshness to derive camera health & heartbeats. */
  @Interval(5000)
  async healthCheck() {
    if (this.shuttingDown) return;
    for (const rt of this.runtimes.values()) {
      const playlist = path.join(liveDir(rt.cam.id), 'index.m3u8');
      let ageMs = Infinity;
      try {
        ageMs = Date.now() - (await fsp.stat(playlist)).mtimeMs;
      } catch {
        /* playlist not yet written */
      }
      const fresh = ageMs < 20_000;
      if (fresh) {
        rt.backoffMs = 5000;
        await this.markOnline(rt);
      } else if (rt.liveStartedAt && Date.now() - rt.liveStartedAt > 30_000) {
        // No fresh video for 30s+. Delivered frames — not process liveness — are
        // the source of truth: an ffmpeg that is up but failing to pull (auth
        // rejected, source gone) must still read as OFFLINE.
        if (rt.live) {
          this.log.warn(`stale playlist for ${rt.cam.name}; restarting live pipeline`);
          rt.live.kill('SIGKILL');
        }
        await this.markOffline(rt);
      }

      // Reconcile desired vs actual recording state: a camera configured for
      // continuous recording must always have an active recorder. Without this,
      // a manual stop (or a failed restart) leaves it permanently idle while
      // its config still claims 24/7 coverage — a silent gap in the footage.
      if (rt.cam.isEnabled && rt.cam.continuousRecording && !rt.recorder && rt.status === 'ONLINE') {
        if (Date.now() - (rt.lastRecoveryAt ?? 0) > 15_000) {
          rt.lastRecoveryAt = Date.now();
          this.log.warn(`no recorder for continuous camera ${rt.cam.name}; restarting`);
          void this.startRecording(rt.cam.id, 'CONTINUOUS').catch(() => undefined);
        }
      }
    }
  }

  private async markOnline(rt: CameraRuntime) {
    const now = Date.now();
    const statusChanged = rt.status !== 'ONLINE';
    if (statusChanged || now - rt.lastHbWrite > 15_000) {
      rt.lastHbWrite = now;
      await this.prisma.camera
        .update({
          where: { id: rt.cam.id },
          data: { status: 'ONLINE', lastHeartbeat: new Date() },
        })
        .catch(() => undefined);
      this.realtime.emitCameraStatus(rt.cam.id, 'ONLINE', new Date());
    }
    if (statusChanged) {
      rt.status = 'ONLINE';
      if (rt.everOnline) {
        await this.events.emit({
          type: 'CAMERA_RECONNECTED',
          severity: 'INFO',
          cameraId: rt.cam.id,
          description: `Camera ${rt.cam.name} is back online`,
          autoClose: true,
        });
      }
      rt.everOnline = true;
    }
  }

  private async markOffline(rt: CameraRuntime) {
    if (rt.status === 'OFFLINE') return;
    rt.status = 'OFFLINE';
    await this.prisma.camera
      .update({ where: { id: rt.cam.id }, data: { status: 'OFFLINE' } })
      .catch(() => undefined);
    this.realtime.emitCameraStatus(rt.cam.id, 'OFFLINE');
    if (rt.everOnline) {
      await this.events.emit({
        type: 'CAMERA_OFFLINE',
        severity: 'CRITICAL',
        cameraId: rt.cam.id,
        description: `Camera ${rt.cam.name} went offline (stream lost)`,
      });
    }
  }

  // ---------------------------------------------------------------- recording

  async startRecording(cameraId: string, type: RecordingType): Promise<{ sessionId: string }> {
    const cam = await this.prisma.camera.findUnique({ where: { id: cameraId } });
    if (!cam) throw new NotFoundException('Camera not found');
    if (!cam.isEnabled) throw new ConflictException('Camera is disabled');
    const rt = this.getRuntime(cam);
    if (rt.recorder) {
      throw new ConflictException(`Camera is already recording (${rt.recorder.type})`);
    }

    const session = await this.prisma.recordingSession.create({
      data: { cameraId, type },
    });
    const dir = ensureDir(recordingsDir(cameraId));
    const prefix = session.id.slice(0, 8);
    const proc = spawnFfmpeg(recordSegmentArgs(cam.rtspUrl, dir, prefix, SEGMENT_SECONDS));

    const watcher = chokidar.watch(dir, { ignoreInitial: true, depth: 0 });
    const recorder: RecorderRuntime = {
      proc,
      sessionId: session.id,
      prefix,
      type,
      dir,
      watcher,
      stopping: false,
    };
    rt.recorder = recorder;

    watcher.on('add', (filePath) => {
      if (!path.basename(filePath).startsWith(prefix + '_')) return;
      const prev = recorder.lastFile;
      recorder.lastFile = filePath;
      if (prev && prev !== filePath) {
        void this.finalizeSegment(cam, session.id, type, prev);
      }
    });

    const stderrTail = this.captureStderrTail(proc);
    proc.on('close', async (code) => {
      const wasStopping = recorder.stopping;
      if (rt.recorder === recorder) rt.recorder = undefined;
      if (recorder.eventStopTimer) clearTimeout(recorder.eventStopTimer);
      await watcher.close().catch(() => undefined);
      if (recorder.lastFile) {
        await this.finalizeSegment(cam, session.id, type, recorder.lastFile);
      }
      await this.prisma.recordingSession.update({
        where: { id: session.id },
        data: { status: wasStopping ? 'COMPLETED' : 'FAILED', endedAt: new Date() },
      });
      this.realtime.emitRecordingStatus(cameraId, false);
      if (!wasStopping && !this.shuttingDown) {
        // dedupe: a flaky source (e.g. a rate-limited public demo RTSP server)
        // can crash-loop every few seconds — don't flood the events feed
        const alreadyFlagged = await this.events.hasRecentOpen('RECORDING_FAILURE', cameraId, 5 * 60_000);
        if (!alreadyFlagged) {
          await this.events.emit({
            type: 'RECORDING_FAILURE',
            severity: 'CRITICAL',
            cameraId,
            description: `Recording pipeline for ${cam.name} exited unexpectedly (code ${code}): ${stderrTail()}`,
          });
        }
        // continuous recordings restart automatically after a short delay
        if (type === 'CONTINUOUS') {
          setTimeout(() => {
            const fresh = this.runtimes.get(cameraId);
            if (fresh?.cam.isEnabled && fresh.cam.continuousRecording && !fresh.recorder) {
              void this.startRecording(cameraId, 'CONTINUOUS').catch(() => undefined);
            }
          }, 10_000);
        }
      } else {
        await this.events.emit({
          type: 'RECORDING_STOPPED',
          severity: 'INFO',
          cameraId,
          description: `${type} recording stopped for ${cam.name}`,
          autoClose: true,
        });
      }
    });

    await this.events.emit({
      type: 'RECORDING_STARTED',
      severity: 'INFO',
      cameraId,
      description: `${type} recording started for ${cam.name}`,
      autoClose: true,
    });
    this.realtime.emitRecordingStatus(cameraId, true, type);
    return { sessionId: session.id };
  }

  async stopRecording(cameraId: string): Promise<void> {
    const rt = this.runtimes.get(cameraId);
    const recorder = rt?.recorder;
    if (!recorder) throw new ConflictException('Camera is not recording');
    recorder.stopping = true;
    if (recorder.eventStopTimer) clearTimeout(recorder.eventStopTimer);
    // 'q' asks ffmpeg to finish the current segment and exit cleanly
    try {
      recorder.proc.stdin.write('q');
    } catch {
      /* stdin gone */
    }
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        recorder.proc.kill('SIGKILL');
        resolve();
      }, 6000);
      recorder.proc.once('close', () => {
        clearTimeout(t);
        resolve();
      });
    });
  }

  private async finalizeSegment(
    cam: Camera,
    sessionId: string,
    type: RecordingType,
    filePath: string,
  ) {
    try {
      const stat = await fsp.stat(filePath);
      if (stat.size < 1024) return; // discard empty stubs
      const info = await probe(filePath, { timeoutMs: 20_000 });
      const startedAt = this.parseSegmentTimestamp(filePath) ?? new Date(stat.mtimeMs);
      const duration = info.duration ?? SEGMENT_SECONDS;
      const endedAt = new Date(startedAt.getTime() + duration * 1000);
      const recording = await this.prisma.recording.create({
        data: {
          sessionId,
          cameraId: cam.id,
          type,
          filename: path.basename(filePath),
          startedAt,
          endedAt,
          duration,
          fileSize: BigInt(stat.size),
        },
      });
      await this.extractKeyframes(cam.id, recording.id, filePath, startedAt, duration);
    } catch (e: any) {
      this.log.warn(`failed to finalize segment ${filePath}: ${e.message}`);
    }
  }

  private parseSegmentTimestamp(filePath: string): Date | null {
    const m = path.basename(filePath).match(/_(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.mp4$/);
    if (!m) return null;
    const [, y, mo, d, h, mi, s] = m.map(Number) as unknown as number[];
    // container runs in UTC; strftime writes local (=UTC) time
    return new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  }

  private async extractKeyframes(
    cameraId: string,
    recordingId: string,
    filePath: string,
    startedAt: Date,
    duration: number,
  ) {
    const dir = ensureDir(keyframesDir(cameraId));
    const pattern = path.join(dir, `${recordingId}_%03d.jpg`);
    const res = await runProcess(FFMPEG, keyframeArgs(filePath, pattern, KEYFRAME_INTERVAL), 60_000);
    if (res.code !== 0) {
      this.log.warn(`keyframe extraction failed for ${filePath}`);
      return;
    }
    const files = (await fsp.readdir(dir)).filter((f) => f.startsWith(recordingId + '_')).sort();
    if (!files.length) return;
    await this.prisma.keyframe.createMany({
      data: files.map((filename, i) => ({
        recordingId,
        cameraId,
        filename,
        timestamp: new Date(startedAt.getTime() + Math.min(i * KEYFRAME_INTERVAL, duration) * 1000),
      })),
    });
  }

  // ---------------------------------------------------------------- motion

  private startMotion(rt: CameraRuntime) {
    if (rt.motion || this.shuttingDown || !rt.cam.motionDetection) return;
    const proc = spawnFfmpeg(motionDetectArgs(rt.cam.rtspUrl, parseFloat(MOTION_THRESHOLD) as any));
    rt.motion = proc;
    rt.motionStopping = false;
    this.log.log(`motion pipeline started for ${rt.cam.name}`);

    let buffer = '';
    proc.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      if (buffer.length > 8192) buffer = buffer.slice(-2048);
      if (buffer.includes('lavfi.scene_score')) {
        buffer = '';
        void this.handleMotion(rt);
      }
    });
    const stderrTail = this.captureStderrTail(proc);
    proc.on('close', (code) => {
      if (rt.motion === proc) rt.motion = undefined;
      if (this.shuttingDown || rt.motionStopping) return;
      this.log.warn(`motion pipeline for ${rt.cam.name} exited (code ${code}) — ${stderrTail()}`);
      rt.motionRestartTimer = setTimeout(() => this.startMotion(rt), 15_000);
    });
  }

  private async handleMotion(rt: CameraRuntime) {
    const now = Date.now();
    if (now - rt.lastMotionEventAt < MOTION_DEBOUNCE_MS) {
      const rec = rt.recorder;
      if (rec?.type === 'EVENT' && rec.eventStopTimer) {
        clearTimeout(rec.eventStopTimer);
        rec.eventStopTimer = setTimeout(
          () => void this.stopRecording(rt.cam.id).catch(() => undefined),
          EVENT_RECORDING_TAIL_MS,
        );
      }
      return;
    }
    rt.lastMotionEventAt = now;
    await this.events.emit({
      type: 'MOTION_DETECTED',
      severity: 'WARNING',
      cameraId: rt.cam.id,
      description: `Motion detected on ${rt.cam.name} (${rt.cam.location})`,
    });
    if (!rt.recorder) {
      try {
        await this.startRecording(rt.cam.id, 'EVENT');
        const rec = rt.recorder as RecorderRuntime | undefined;
        if (rec) {
          rec.eventStopTimer = setTimeout(
            () => void this.stopRecording(rt.cam.id).catch(() => undefined),
            EVENT_RECORDING_TAIL_MS,
          );
        }
      } catch {
        /* recorder busy or camera disabled */
      }
    }
  }

  // ---------------------------------------------------------------- utilities

  async captureSnapshot(cameraId: string, userId?: string, source = 'LIVE') {
    const cam = await this.prisma.camera.findUnique({ where: { id: cameraId } });
    if (!cam) throw new NotFoundException('Camera not found');
    const dir = ensureDir(snapshotsDir(cameraId));
    const filename = `snap_${Date.now()}.jpg`;
    const res = await runProcess(FFMPEG, snapshotArgs(cam.rtspUrl, path.join(dir, filename)), 20_000);
    if (res.code !== 0) {
      throw new ConflictException('Snapshot failed: camera unreachable');
    }
    return this.prisma.snapshot.create({
      data: { cameraId, userId, filename, source },
      include: { camera: { select: { id: true, name: true } } },
    });
  }

  async testConnection(rtspUrl: string) {
    try {
      const info = await probe(rtspUrl, { rtsp: true, timeoutMs: 15_000 });
      return { ok: true, ...info };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  isRecording(cameraId: string): { recording: boolean; type?: RecordingType } {
    const rec = this.runtimes.get(cameraId)?.recorder;
    return rec ? { recording: true, type: rec.type } : { recording: false };
  }

  counts() {
    let liveStreams = 0;
    const activeRecordings: { cameraId: string; type: RecordingType }[] = [];
    for (const rt of this.runtimes.values()) {
      if (rt.live && rt.status === 'ONLINE') liveStreams++;
      if (rt.recorder) activeRecordings.push({ cameraId: rt.cam.id, type: rt.recorder.type });
    }
    return { liveStreams, activeRecordings };
  }
}
