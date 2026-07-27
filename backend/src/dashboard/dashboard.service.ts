import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import * as os from 'os';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { StorageService } from '../streaming/storage.service';
import { StreamManagerService } from '../streaming/stream-manager.service';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private streams: StreamManagerService,
    private storage: StorageService,
    private events: EventsService,
    private realtime: RealtimeGateway,
  ) {}

  async getStats() {
    const [total, online, offline, disabled, cameras, recordingsToday, eventsSummary, recentEvents, storage] =
      await Promise.all([
        this.prisma.camera.count(),
        this.prisma.camera.count({ where: { status: 'ONLINE' } }),
        this.prisma.camera.count({ where: { status: 'OFFLINE' } }),
        this.prisma.camera.count({ where: { status: 'DISABLED' } }),
        this.prisma.camera.findMany({
          select: {
            id: true,
            name: true,
            location: true,
            status: true,
            lastHeartbeat: true,
            isEnabled: true,
            fps: true,
            resolution: true,
          },
          orderBy: { name: 'asc' },
        }),
        this.prisma.recording.aggregate({
          where: { startedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
          _count: true,
          _sum: { fileSize: true, duration: true },
        }),
        this.events.summary(),
        this.events.recent(10),
        this.storage.getStats(),
      ]);

    const counts = this.streams.counts();
    const recordingMap = new Map(counts.activeRecordings.map((r) => [r.cameraId, r.type]));

    return {
      cameras: { total, online, offline, disabled },
      activeLiveStreams: counts.liveStreams,
      activeRecordings: counts.activeRecordings,
      recordingsToday: {
        segments: recordingsToday._count,
        bytes: Number(recordingsToday._sum.fileSize ?? 0),
        seconds: recordingsToday._sum.duration ?? 0,
      },
      storage,
      events: eventsSummary,
      recentEvents,
      cameraHealth: cameras.map((c) => ({
        ...c,
        isRecording: recordingMap.has(c.id),
        recordingType: recordingMap.get(c.id) ?? null,
      })),
      activeUsers: this.realtime.getOnlineUsers(),
      system: {
        uptimeSeconds: Math.round((Date.now() - this.streams.bootedAt) / 1000),
        hostUptimeSeconds: Math.round(os.uptime()),
        loadAvg: os.loadavg(),
        memory: { total: os.totalmem(), free: os.freemem() },
        now: new Date().toISOString(),
      },
    };
  }

  @Interval(5000)
  async push() {
    if (!this.realtime.staffConnected()) return;
    const stats = await this.getStats().catch(() => null);
    if (stats) this.realtime.emitDashboard(stats);
  }
}
