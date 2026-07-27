import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

interface Presence {
  userId: string;
  username: string;
  fullName: string;
  role: string;
  connectedAt: string;
}

/**
 * Socket.IO gateway pushing real-time updates to the UI:
 *  - camera.status   { cameraId, status, lastHeartbeat }
 *  - recording.status{ cameraId, recording, type }
 *  - event.new       full event row           (staff only)
 *  - dashboard.stats aggregated dashboard payload (staff only)
 *  - presence.update online users list        (staff only)
 *
 * Staff (ADMIN/OPERATOR) join the "staff" room; viewers join per-camera rooms
 * for their assigned cameras so they only receive relevant status updates.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private log = new Logger('Realtime');
  private online = new Map<string, Presence>(); // socketId -> presence

  constructor(
    private jwt: JwtService,
    private prisma: PrismaService,
  ) {}

  async handleConnection(socket: Socket) {
    try {
      const token =
        (socket.handshake.auth?.token as string) ||
        this.cookieToken(socket.handshake.headers.cookie);
      const payload: any = this.jwt.verify(token || '', {
        secret: process.env.JWT_SECRET || 'dev-secret',
      });
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.isActive) throw new Error('inactive');

      this.online.set(socket.id, {
        userId: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        connectedAt: new Date().toISOString(),
      });

      if (user.role === 'VIEWER') {
        const assigned = await this.prisma.cameraAssignment.findMany({
          where: { userId: user.id },
        });
        for (const a of assigned) socket.join(`camera:${a.cameraId}`);
      } else {
        socket.join('staff');
        const cams = await this.prisma.camera.findMany({ select: { id: true } });
        for (const c of cams) socket.join(`camera:${c.id}`);
      }
      this.pushPresence();
    } catch {
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket) {
    this.online.delete(socket.id);
    this.pushPresence();
  }

  private cookieToken(cookieHeader?: string): string | undefined {
    if (!cookieHeader) return undefined;
    const m = cookieHeader.match(/(?:^|;\s*)vms_token=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : undefined;
  }

  getOnlineUsers(): Presence[] {
    const seen = new Map<string, Presence>();
    for (const p of this.online.values()) if (!seen.has(p.userId)) seen.set(p.userId, p);
    return [...seen.values()];
  }

  private pushPresence() {
    this.server?.to('staff').emit('presence.update', this.getOnlineUsers());
  }

  emitCameraStatus(cameraId: string, status: string, lastHeartbeat?: Date) {
    this.server?.to(`camera:${cameraId}`).emit('camera.status', {
      cameraId,
      status,
      lastHeartbeat: lastHeartbeat?.toISOString(),
    });
  }

  emitRecordingStatus(cameraId: string, recording: boolean, type?: string) {
    this.server?.to(`camera:${cameraId}`).emit('recording.status', { cameraId, recording, type });
  }

  emitEvent(event: unknown) {
    this.server?.to('staff').emit('event.new', event);
  }

  emitEventUpdated(event: unknown) {
    this.server?.to('staff').emit('event.updated', event);
  }

  emitDashboard(stats: unknown) {
    this.server?.to('staff').emit('dashboard.stats', stats);
  }

  staffConnected(): boolean {
    return (this.server?.sockets?.adapter?.rooms?.get('staff')?.size ?? 0) > 0;
  }
}
