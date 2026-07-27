import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RecordingType, SessionStatus } from '@prisma/client';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { ensureDir, exportsDir, MEDIA_ROOT } from '../media/media.paths';
import { FFMPEG, runProcess } from '../streaming/ffmpeg.util';

@Injectable()
export class RecordingsService {
  constructor(private prisma: PrismaService) {}

  async listSessions(params: {
    cameraId?: string;
    type?: RecordingType;
    status?: SessionStatus;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }) {
    const where: Prisma.RecordingSessionWhereInput = {
      ...(params.cameraId && { cameraId: params.cameraId }),
      ...(params.type && { type: params.type }),
      ...(params.status && { status: params.status }),
      ...((params.from || params.to) && {
        startedAt: {
          ...(params.from && { gte: new Date(params.from) }),
          ...(params.to && { lte: new Date(params.to) }),
        },
      }),
      recordings: { some: {} },
    };
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, params.pageSize ?? 20);
    const [items, total] = await Promise.all([
      this.prisma.recordingSession.findMany({
        where,
        include: {
          camera: { select: { id: true, name: true, location: true } },
          _count: { select: { recordings: true } },
          recordings: {
            orderBy: { startedAt: 'asc' },
            take: 1,
            select: { startedAt: true },
          },
        },
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.recordingSession.count({ where }),
    ]);
    const ids = items.map((s) => s.id);
    const agg = await this.prisma.recording.groupBy({
      by: ['sessionId'],
      where: { sessionId: { in: ids } },
      _sum: { duration: true, fileSize: true },
    });
    const aggMap = new Map(agg.map((a) => [a.sessionId, a._sum]));
    return {
      items: items.map((s) => ({
        ...s,
        totalDuration: aggMap.get(s.id)?.duration ?? 0,
        totalBytes: Number(aggMap.get(s.id)?.fileSize ?? 0),
      })),
      total,
      page,
      pageSize,
    };
  }

  async getSession(id: string) {
    const session = await this.prisma.recordingSession.findUnique({
      where: { id },
      include: {
        camera: { select: { id: true, name: true, location: true } },
        recordings: {
          orderBy: { startedAt: 'asc' },
          include: { keyframes: { orderBy: { timestamp: 'asc' } } },
        },
      },
    });
    if (!session) throw new NotFoundException('Session not found');
    const recordings = session.recordings.map((r) => ({
      ...r,
      url: `/media/recordings/${session.cameraId}/${r.filename}`,
      keyframes: r.keyframes.map((k) => ({
        ...k,
        url: `/media/keyframes/${session.cameraId}/${k.filename}`,
      })),
    }));
    return { ...session, recordings };
  }

  async listRecordings(params: {
    cameraId?: string;
    type?: RecordingType;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }) {
    const where: Prisma.RecordingWhereInput = {
      ...(params.cameraId && { cameraId: params.cameraId }),
      ...(params.type && { type: params.type }),
      ...((params.from || params.to) && {
        startedAt: {
          ...(params.from && { gte: new Date(params.from) }),
          ...(params.to && { lte: new Date(params.to) }),
        },
      }),
    };
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(200, params.pageSize ?? 50);
    const [items, total] = await Promise.all([
      this.prisma.recording.findMany({
        where,
        include: { camera: { select: { id: true, name: true } } },
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.recording.count({ where }),
    ]);
    return {
      items: items.map((r) => ({ ...r, url: `/media/recordings/${r.cameraId}/${r.filename}` })),
      total,
      page,
      pageSize,
    };
  }

  async getRecordingFile(id: string) {
    const rec = await this.prisma.recording.findUnique({ where: { id } });
    if (!rec) throw new NotFoundException('Recording not found');
    const file = path.join(MEDIA_ROOT, 'recordings', rec.cameraId, rec.filename);
    try {
      await fsp.access(file);
    } catch {
      throw new NotFoundException('Recording file missing on disk');
    }
    return { rec, file };
  }

  async exportSession(sessionId: string) {
    const session = await this.getSession(sessionId);
    if (!session.recordings.length) throw new NotFoundException('Session has no recordings');
    const dir = ensureDir(exportsDir());
    const outFile = path.join(dir, `session_${sessionId.slice(0, 8)}.mp4`);
    const listFile = path.join(dir, `session_${sessionId.slice(0, 8)}.txt`);
    const lines = session.recordings
      .map((r) =>
        `file '${path.join(MEDIA_ROOT, 'recordings', session.cameraId, r.filename).replace(/'/g, "'\\''")}'`,
      )
      .join('\n');
    await fsp.writeFile(listFile, lines, 'utf8');
    const res = await runProcess(
      FFMPEG,
      ['-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-y', outFile],
      120_000,
    );
    await fsp.rm(listFile, { force: true });
    if (res.code !== 0) throw new Error('Export failed: ' + res.stderr.slice(-300));
    return { file: outFile, name: `session_${sessionId.slice(0, 8)}.mp4` };
  }

  async deleteRecording(id: string) {
    const { rec, file } = await this.getRecordingFile(id).catch(async () => {
      const rec = await this.prisma.recording.findUnique({ where: { id } });
      if (!rec) throw new NotFoundException('Recording not found');
      return { rec, file: null as string | null };
    });
    const keyframes = await this.prisma.keyframe.findMany({ where: { recordingId: id } });
    for (const kf of keyframes) {
      await fsp
        .rm(path.join(MEDIA_ROOT, 'keyframes', rec.cameraId, kf.filename), { force: true })
        .catch(() => undefined);
    }
    if (file) await fsp.rm(file, { force: true }).catch(() => undefined);
    await this.prisma.recording.delete({ where: { id } });
    return { ok: true };
  }
}
