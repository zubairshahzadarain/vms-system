import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CameraStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StreamManagerService } from '../streaming/stream-manager.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateCameraDto, UpdateCameraDto } from './dto/camera.dto';

@Injectable()
export class CamerasService {
  constructor(
    private prisma: PrismaService,
    private streams: StreamManagerService,
  ) {}

  /** Viewers only see cameras assigned to them. */
  private async scopeFor(user: AuthUser): Promise<Prisma.CameraWhereInput> {
    if (user.role !== 'VIEWER') return {};
    const assigned = await this.prisma.cameraAssignment.findMany({
      where: { userId: user.id },
      select: { cameraId: true },
    });
    return { id: { in: assigned.map((a) => a.cameraId) } };
  }

  async list(
    user: AuthUser,
    filters: { q?: string; groupId?: string; status?: CameraStatus } = {},
  ) {
    const scope = await this.scopeFor(user);
    const cameras = await this.prisma.camera.findMany({
      where: {
        AND: [
          scope,
          filters.q
            ? {
                OR: [
                  { name: { contains: filters.q, mode: 'insensitive' } },
                  { location: { contains: filters.q, mode: 'insensitive' } },
                ],
              }
            : {},
          filters.groupId ? { groupId: filters.groupId } : {},
          filters.status ? { status: filters.status } : {},
        ],
      },
      include: { group: true },
      orderBy: { name: 'asc' },
    });
    return cameras.map((cam) => this.withRuntime(cam, user));
  }

  async get(user: AuthUser, id: string) {
    const scope = await this.scopeFor(user);
    const cam = await this.prisma.camera.findFirst({
      where: { AND: [{ id }, scope] },
      include: { group: true },
    });
    if (!cam) throw new NotFoundException('Camera not found');
    return this.withRuntime(cam, user);
  }

  private withRuntime(cam: any, user: AuthUser) {
    const rec = this.streams.isRecording(cam.id);
    const { rtspUrl, ...rest } = cam;
    return {
      ...rest,
      ...(user.role !== 'VIEWER' && { rtspUrl }),
      isRecording: rec.recording,
      recordingType: rec.type ?? null,
      hlsUrl: `/media/live/${cam.id}/index.m3u8`,
    };
  }

  async create(dto: CreateCameraDto) {
    const cam = await this.prisma.camera.create({
      data: { ...dto, status: dto.isEnabled === false ? 'DISABLED' : 'OFFLINE' },
      include: { group: true },
    });
    if (cam.isEnabled) await this.streams.startCamera(cam);
    return cam;
  }

  async update(id: string, dto: UpdateCameraDto) {
    const before = await this.prisma.camera.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Camera not found');
    const after = await this.prisma.camera.update({
      where: { id },
      data: dto,
      include: { group: true },
    });
    await this.streams.onCameraUpdated(before, after);
    return after;
  }

  async remove(id: string) {
    const cam = await this.prisma.camera.findUnique({ where: { id } });
    if (!cam) throw new NotFoundException('Camera not found');
    await this.streams.onCameraDeleted(id);
    await this.prisma.camera.delete({ where: { id } });
    return { ok: true };
  }

  async setEnabled(id: string, enabled: boolean) {
    return this.update(id, { isEnabled: enabled });
  }

  async testConnection(user: AuthUser, id: string, overrideUrl?: string) {
    let url = overrideUrl;
    if (!url) {
      const cam = await this.prisma.camera.findUnique({ where: { id } });
      if (!cam) throw new NotFoundException('Camera not found');
      url = cam.rtspUrl;
    }
    if (user.role === 'VIEWER') throw new ForbiddenException();
    return this.streams.testConnection(url);
  }

  listGroups() {
    return this.prisma.cameraGroup.findMany({
      include: { _count: { select: { cameras: true } } },
      orderBy: { name: 'asc' },
    });
  }

  createGroup(name: string) {
    return this.prisma.cameraGroup.create({ data: { name } });
  }

  async deleteGroup(id: string) {
    await this.prisma.cameraGroup.delete({ where: { id } });
    return { ok: true };
  }
}
