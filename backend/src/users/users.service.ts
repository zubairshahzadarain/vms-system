import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AssignCamerasDto, CreateUserDto, UpdateUserDto } from './dto/user.dto';

const USER_SELECT = {
  id: true,
  username: true,
  email: true,
  fullName: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  cameraAssignments: { select: { camera: { select: { id: true, name: true } } } },
} as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  private shape(u: any) {
    const { cameraAssignments, ...rest } = u;
    return { ...rest, assignedCameras: cameraAssignments?.map((a: any) => a.camera) ?? [] };
  }

  async list(q?: string) {
    const users = await this.prisma.user.findMany({
      where: q
        ? {
            OR: [
              { username: { contains: q, mode: 'insensitive' } },
              { fullName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          }
        : undefined,
      select: USER_SELECT,
      orderBy: { username: 'asc' },
    });
    return users.map((u) => this.shape(u));
  }

  async create(dto: CreateUserDto) {
    const exists = await this.prisma.user.findFirst({
      where: { OR: [{ username: dto.username }, { email: dto.email }] },
    });
    if (exists) throw new BadRequestException('Username or email already in use');
    const { password, ...rest } = dto;
    const user = await this.prisma.user.create({
      data: { ...rest, passwordHash: bcrypt.hashSync(password, 10) },
      select: USER_SELECT,
    });
    return this.shape(user);
  }

  async update(id: string, dto: UpdateUserDto) {
    const { password, ...rest } = dto;
    const user = await this.prisma.user
      .update({
        where: { id },
        data: {
          ...rest,
          ...(password && { passwordHash: bcrypt.hashSync(password, 10) }),
        },
        select: USER_SELECT,
      })
      .catch(() => null);
    if (!user) throw new NotFoundException('User not found');
    return this.shape(user);
  }

  async remove(id: string, actingUserId: string) {
    if (id === actingUserId) throw new BadRequestException('You cannot delete your own account');
    await this.prisma.user.delete({ where: { id } }).catch(() => {
      throw new NotFoundException('User not found');
    });
    return { ok: true };
  }

  async assignCameras(id: string, dto: AssignCamerasDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    await this.prisma.$transaction([
      this.prisma.cameraAssignment.deleteMany({ where: { userId: id } }),
      this.prisma.cameraAssignment.createMany({
        data: dto.cameraIds.map((cameraId) => ({ userId: id, cameraId })),
        skipDuplicates: true,
      }),
    ]);
    const updated = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    return this.shape(updated);
  }
}
