import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { StreamManagerService } from '../streaming/stream-manager.service';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { MEDIA_ROOT } from '../media/media.paths';

@ApiTags('snapshots')
@ApiBearerAuth()
@Controller('snapshots')
export class SnapshotsController {
  constructor(
    private prisma: PrismaService,
    private streams: StreamManagerService,
  ) {}

  @Post(':cameraId')
  @ApiOperation({ summary: 'Capture a live snapshot (viewers: assigned cameras only)' })
  async capture(@CurrentUser() user: AuthUser, @Param('cameraId') cameraId: string) {
    if (user.role === 'VIEWER') {
      const assigned = await this.prisma.cameraAssignment.findUnique({
        where: { userId_cameraId: { userId: user.id, cameraId } },
      });
      if (!assigned) throw new ForbiddenException('Camera not assigned');
    }
    const snap = await this.streams.captureSnapshot(cameraId, user.id);
    return { ...snap, url: `/media/snapshots/${cameraId}/${snap.filename}` };
  }

  @Get()
  @Roles('ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'List snapshots' })
  @ApiQuery({ name: 'cameraId', required: false })
  async list(@Query('cameraId') cameraId?: string) {
    const items = await this.prisma.snapshot.findMany({
      where: cameraId ? { cameraId } : undefined,
      include: {
        camera: { select: { id: true, name: true } },
        user: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return items.map((s) => ({ ...s, url: `/media/snapshots/${s.cameraId}/${s.filename}` }));
  }

  @Delete(':id')
  @Roles('ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Delete a snapshot' })
  async remove(@Param('id') id: string) {
    const snap = await this.prisma.snapshot.findUnique({ where: { id } });
    if (snap) {
      await fsp
        .rm(path.join(MEDIA_ROOT, 'snapshots', snap.cameraId, snap.filename), { force: true })
        .catch(() => undefined);
      await this.prisma.snapshot.delete({ where: { id } });
    }
    return { ok: true };
  }
}
