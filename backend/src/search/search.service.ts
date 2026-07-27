import { Injectable } from '@nestjs/common';
import { EventType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators/current-user.decorator';

export interface SearchParams {
  q?: string;
  types: string[];
  from?: string;
  to?: string;
  cameraId?: string;
  groupId?: string;
  status?: string;
  eventType?: EventType;
  limit: number;
}

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async search(user: AuthUser, p: SearchParams) {
    const dateRange =
      p.from || p.to
        ? {
            ...(p.from && { gte: new Date(p.from) }),
            ...(p.to && { lte: new Date(p.to) }),
          }
        : undefined;

    const result: Record<string, unknown> = {};

    if (p.types.includes('cameras')) {
      const where: Prisma.CameraWhereInput = {
        ...(p.q && {
          OR: [
            { name: { contains: p.q, mode: 'insensitive' } },
            { location: { contains: p.q, mode: 'insensitive' } },
          ],
        }),
        ...(p.cameraId && { id: p.cameraId }),
        ...(p.groupId && { groupId: p.groupId }),
        ...(p.status && ['ONLINE', 'OFFLINE', 'DISABLED'].includes(p.status)
          ? { status: p.status as any }
          : {}),
      };
      result.cameras = await this.prisma.camera.findMany({
        where,
        include: { group: true },
        take: p.limit,
        orderBy: { name: 'asc' },
      });
    }

    if (p.types.includes('recordings') && user.role !== 'VIEWER') {
      const where: Prisma.RecordingWhereInput = {
        ...(p.cameraId && { cameraId: p.cameraId }),
        ...(p.groupId && { camera: { groupId: p.groupId } }),
        ...(dateRange && { startedAt: dateRange }),
        ...(p.q && {
          OR: [
            { filename: { contains: p.q, mode: 'insensitive' } },
            { camera: { name: { contains: p.q, mode: 'insensitive' } } },
          ],
        }),
      };
      const recs = await this.prisma.recording.findMany({
        where,
        include: { camera: { select: { id: true, name: true } } },
        take: p.limit,
        orderBy: { startedAt: 'desc' },
      });
      result.recordings = recs.map((r) => ({
        ...r,
        url: `/media/recordings/${r.cameraId}/${r.filename}`,
      }));
    }

    if (p.types.includes('events') && user.role !== 'VIEWER') {
      const where: Prisma.EventWhereInput = {
        ...(p.q && { description: { contains: p.q, mode: 'insensitive' } }),
        ...(p.cameraId && { cameraId: p.cameraId }),
        ...(p.groupId && { camera: { groupId: p.groupId } }),
        ...(p.eventType && { type: p.eventType }),
        ...(p.status && ['OPEN', 'CLOSED'].includes(p.status) ? { status: p.status as any } : {}),
        ...(dateRange && { createdAt: dateRange }),
      };
      result.events = await this.prisma.event.findMany({
        where,
        include: {
          camera: { select: { id: true, name: true } },
          user: { select: { id: true, username: true } },
        },
        take: p.limit,
        orderBy: { createdAt: 'desc' },
      });
    }

    if (p.types.includes('users') && user.role === 'ADMIN') {
      result.users = (
        await this.prisma.user.findMany({
          where: p.q
            ? {
                OR: [
                  { username: { contains: p.q, mode: 'insensitive' } },
                  { fullName: { contains: p.q, mode: 'insensitive' } },
                  { email: { contains: p.q, mode: 'insensitive' } },
                ],
              }
            : undefined,
          take: p.limit,
          orderBy: { username: 'asc' },
        })
      ).map(({ passwordHash, ...u }) => u);
    }

    return result;
  }
}
