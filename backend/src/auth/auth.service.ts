import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private events: EventsService,
  ) {}

  async login(username: string, password: string, ip?: string) {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user || !user.isActive || !bcrypt.compareSync(password, user.passwordHash)) {
      throw new UnauthorizedException('Invalid credentials');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await this.events.emit({
      type: 'USER_LOGIN',
      severity: 'INFO',
      userId: user.id,
      description: `User ${user.username} logged in${ip ? ` from ${ip}` : ''}`,
      autoClose: true,
    });
    const token = this.jwt.sign({ sub: user.id, username: user.username, role: user.role });
    return { token, user: this.sanitize(user) };
  }

  async logout(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      await this.events.emit({
        type: 'USER_LOGOUT',
        severity: 'INFO',
        userId: user.id,
        description: `User ${user.username} logged out`,
        autoClose: true,
      });
    }
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { cameraAssignments: { select: { cameraId: true } } },
    });
    if (!user) throw new UnauthorizedException();
    return {
      ...this.sanitize(user),
      assignedCameraIds: user.cameraAssignments.map((a) => a.cameraId),
    };
  }

  sanitize(user: any) {
    const { passwordHash, cameraAssignments, ...rest } = user;
    return rest;
  }
}
