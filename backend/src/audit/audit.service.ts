import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  log(entry: {
    userId?: string;
    action: string;
    resource: string;
    resourceId?: string;
    details?: unknown;
    ip?: string;
  }) {
    return this.prisma.auditLog
      .create({
        data: {
          userId: entry.userId,
          action: entry.action,
          resource: entry.resource,
          resourceId: entry.resourceId,
          details: (entry.details as Prisma.InputJsonValue) ?? undefined,
          ip: entry.ip,
        },
      })
      .catch(() => undefined);
  }

  async list(params: {
    userId?: string;
    resource?: string;
    q?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }) {
    const where: Prisma.AuditLogWhereInput = {
      ...(params.userId && { userId: params.userId }),
      ...(params.resource && { resource: params.resource }),
      ...(params.q && { action: { contains: params.q, mode: 'insensitive' } }),
      ...((params.from || params.to) && {
        createdAt: {
          ...(params.from && { gte: new Date(params.from) }),
          ...(params.to && { lte: new Date(params.to) }),
        },
      }),
    };
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, params.pageSize ?? 30);
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, username: true, fullName: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
}
