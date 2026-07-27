import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { keyframesDir, MEDIA_ROOT } from '../media/media.paths';

export interface StorageStats {
  usedBytes: number;
  byCategory: Record<string, number>;
  diskTotalBytes: number;
  diskFreeBytes: number;
  quotaBytes: number;
  usedPercentOfQuota: number;
}

const QUOTA_BYTES =
  parseFloat(process.env.MAX_STORAGE_GB || '5') * 1024 * 1024 * 1024;

@Injectable()
export class StorageService {
  private log = new Logger('Storage');
  private cache?: { stats: StorageStats; at: number };

  constructor(
    private prisma: PrismaService,
    private events: EventsService,
  ) {}

  private async dirSize(dir: string): Promise<number> {
    let total = 0;
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return 0;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) total += await this.dirSize(p);
      else {
        try {
          total += (await fsp.stat(p)).size;
        } catch {
          /* file rotated away */
        }
      }
    }
    return total;
  }

  async getStats(force = false): Promise<StorageStats> {
    if (!force && this.cache && Date.now() - this.cache.at < 30_000) return this.cache.stats;
    const categories = ['live', 'recordings', 'keyframes', 'snapshots', 'exports'];
    const byCategory: Record<string, number> = {};
    for (const c of categories) {
      byCategory[c] = await this.dirSize(path.join(MEDIA_ROOT, c));
    }
    const usedBytes = Object.values(byCategory).reduce((a, b) => a + b, 0);
    let diskTotalBytes = 0;
    let diskFreeBytes = 0;
    try {
      const st = await fsp.statfs(MEDIA_ROOT);
      diskTotalBytes = st.bsize * st.blocks;
      diskFreeBytes = st.bsize * st.bavail;
    } catch {
      /* statfs unsupported */
    }
    const stats: StorageStats = {
      usedBytes,
      byCategory,
      diskTotalBytes,
      diskFreeBytes,
      quotaBytes: QUOTA_BYTES,
      usedPercentOfQuota: QUOTA_BYTES ? Math.round((usedBytes / QUOTA_BYTES) * 1000) / 10 : 0,
    };
    this.cache = { stats, at: Date.now() };
    return stats;
  }

  /** Retention: prune oldest recordings when above quota; raise storage events. */
  @Interval(60_000)
  async retentionSweep() {
    const stats = await this.getStats(true);
    if (stats.usedBytes > QUOTA_BYTES * 0.9) {
      const already = await this.events.hasRecentOpen('STORAGE_FULL', undefined, 10 * 60_000);
      if (!already) {
        await this.events.emit({
          type: 'STORAGE_FULL',
          severity: stats.usedBytes > QUOTA_BYTES ? 'CRITICAL' : 'WARNING',
          description: `Storage at ${stats.usedPercentOfQuota}% of ${(QUOTA_BYTES / 1024 ** 3).toFixed(1)} GB quota`,
        });
      }
    }
    if (stats.usedBytes <= QUOTA_BYTES) return;

    let toFree = stats.usedBytes - QUOTA_BYTES * 0.85;
    const oldest = await this.prisma.recording.findMany({
      orderBy: { startedAt: 'asc' },
      take: 200,
      include: { keyframes: true },
    });
    let removed = 0;
    for (const rec of oldest) {
      if (toFree <= 0) break;
      const file = path.join(MEDIA_ROOT, 'recordings', rec.cameraId, rec.filename);
      await fsp.rm(file, { force: true }).catch(() => undefined);
      for (const kf of rec.keyframes) {
        await fsp.rm(path.join(keyframesDir(rec.cameraId), kf.filename), { force: true }).catch(() => undefined);
      }
      await this.prisma.recording.delete({ where: { id: rec.id } }).catch(() => undefined);
      toFree -= Number(rec.fileSize);
      removed++;
    }
    if (removed) this.log.warn(`retention pruned ${removed} oldest recording segments`);
  }
}
