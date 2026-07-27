import { Injectable } from '@nestjs/common';
import { EventStatus, EventType, Prisma, Severity } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

export interface EmitEventInput {
  type: EventType;
  severity?: Severity;
  cameraId?: string;
  userId?: string;
  description: string;
  /** auto-closed informational events (logins etc.) */
  autoClose?: boolean;
}

const EVENT_INCLUDE = {
  camera: { select: { id: true, name: true, location: true } },
  user: { select: { id: true, username: true, fullName: true } },
  closedBy: { select: { id: true, username: true } },
} as const;

@Injectable()
export class EventsService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeGateway,
  ) {}

  async emit(input: EmitEventInput) {
    const event = await this.prisma.event.create({
      data: {
        type: input.type,
        severity: input.severity ?? 'INFO',
        cameraId: input.cameraId,
        userId: input.userId,
        description: input.description,
        status: input.autoClose ? 'CLOSED' : 'OPEN',
        closedAt: input.autoClose ? new Date() : undefined,
      },
      include: EVENT_INCLUDE,
    });
    this.realtime.emitEvent(event);
    return event;
  }

  async list(params: {
    type?: EventType;
    severity?: Severity;
    status?: EventStatus;
    cameraId?: string;
    from?: string;
    to?: string;
    q?: string;
    page?: number;
    pageSize?: number;
  }) {
    const where: Prisma.EventWhereInput = {
      ...(params.type && { type: params.type }),
      ...(params.severity && { severity: params.severity }),
      ...(params.status && { status: params.status }),
      ...(params.cameraId && { cameraId: params.cameraId }),
      ...(params.q && { description: { contains: params.q, mode: 'insensitive' } }),
      ...((params.from || params.to) && {
        createdAt: {
          ...(params.from && { gte: new Date(params.from) }),
          ...(params.to && { lte: new Date(params.to) }),
        },
      }),
    };
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, params.pageSize ?? 25);
    const [items, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        include: EVENT_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.event.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async close(id: string, userId: string) {
    const event = await this.prisma.event.update({
      where: { id },
      data: { status: 'CLOSED', closedAt: new Date(), closedById: userId },
      include: EVENT_INCLUDE,
    });
    this.realtime.emitEventUpdated(event);
    return event;
  }

  async summary() {
    const [open, openCritical, openWarning, last24h] = await Promise.all([
      this.prisma.event.count({ where: { status: 'OPEN' } }),
      this.prisma.event.count({ where: { status: 'OPEN', severity: 'CRITICAL' } }),
      this.prisma.event.count({ where: { status: 'OPEN', severity: 'WARNING' } }),
      this.prisma.event.count({
        where: { createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } },
      }),
    ]);
    return { open, openCritical, openWarning, last24h };
  }

  recent(limit = 10) {
    return this.prisma.event.findMany({
      include: EVENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /** true if a similar open event exists within the given window (dedupe helper) */
  async hasRecentOpen(type: EventType, cameraId: string | undefined, windowMs: number) {
    const found = await this.prisma.event.findFirst({
      where: {
        type,
        ...(cameraId && { cameraId }),
        createdAt: { gte: new Date(Date.now() - windowMs) },
      },
    });
    return !!found;
  }
}
