import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RecordingType, SessionStatus } from '@prisma/client';
import { Response } from 'express';
import { RecordingsService } from './recordings.service';
import { StreamManagerService } from '../streaming/stream-manager.service';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('recordings')
@ApiBearerAuth()
@Controller('recordings')
@Roles('ADMIN', 'OPERATOR')
export class RecordingsController {
  constructor(
    private recordings: RecordingsService,
    private streams: StreamManagerService,
  ) {}

  @Get('sessions')
  @ApiOperation({ summary: 'List recording sessions with totals' })
  @ApiQuery({ name: 'cameraId', required: false })
  @ApiQuery({ name: 'type', required: false, enum: RecordingType })
  @ApiQuery({ name: 'status', required: false, enum: SessionStatus })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  listSessions(
    @Query('cameraId') cameraId?: string,
    @Query('type') type?: RecordingType,
    @Query('status') status?: SessionStatus,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.recordings.listSessions({
      cameraId,
      type,
      status,
      from,
      to,
      page: page ? parseInt(page) : undefined,
      pageSize: pageSize ? parseInt(pageSize) : undefined,
    });
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: 'Session detail: ordered segments + keyframe timeline' })
  getSession(@Param('id') id: string) {
    return this.recordings.getSession(id);
  }

  @Get('sessions/:id/export')
  @ApiOperation({ summary: 'Download the whole session merged into a single MP4' })
  async exportSession(@Param('id') id: string, @Res() res: Response) {
    const { file, name } = await this.recordings.exportSession(id);
    res.download(file, name);
  }

  @Get()
  @ApiOperation({ summary: 'List recording segments with filters' })
  @ApiQuery({ name: 'cameraId', required: false })
  @ApiQuery({ name: 'type', required: false, enum: RecordingType })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  list(
    @Query('cameraId') cameraId?: string,
    @Query('type') type?: RecordingType,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.recordings.listRecordings({
      cameraId,
      type,
      from,
      to,
      page: page ? parseInt(page) : undefined,
      pageSize: pageSize ? parseInt(pageSize) : undefined,
    });
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download a single recording segment' })
  async download(@Param('id') id: string, @Res() res: Response) {
    const { rec, file } = await this.recordings.getRecordingFile(id);
    res.download(file, rec.filename);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete a recording segment and its keyframes (admin)' })
  remove(@Param('id') id: string) {
    return this.recordings.deleteRecording(id);
  }

  @Post('record/:cameraId/start')
  @ApiOperation({ summary: 'Start MANUAL recording on a camera' })
  startManual(@Param('cameraId') cameraId: string) {
    return this.streams.startRecording(cameraId, 'MANUAL');
  }

  @Post('record/:cameraId/stop')
  @ApiOperation({ summary: 'Stop the active recording on a camera' })
  async stopManual(@Param('cameraId') cameraId: string) {
    await this.streams.stopRecording(cameraId);
    return { ok: true };
  }
}
