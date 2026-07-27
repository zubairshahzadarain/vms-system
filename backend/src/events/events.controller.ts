import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { EventStatus, EventType, Severity } from '@prisma/client';
import { EventsService } from './events.service';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('events')
@ApiBearerAuth()
@Controller('events')
@Roles('ADMIN', 'OPERATOR')
export class EventsController {
  constructor(private events: EventsService) {}

  @Get()
  @ApiOperation({ summary: 'List events with filters & pagination' })
  @ApiQuery({ name: 'type', required: false, enum: EventType })
  @ApiQuery({ name: 'severity', required: false, enum: Severity })
  @ApiQuery({ name: 'status', required: false, enum: EventStatus })
  @ApiQuery({ name: 'cameraId', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  list(
    @Query('type') type?: EventType,
    @Query('severity') severity?: Severity,
    @Query('status') status?: EventStatus,
    @Query('cameraId') cameraId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.events.list({
      type,
      severity,
      status,
      cameraId,
      from,
      to,
      q,
      page: page ? parseInt(page) : undefined,
      pageSize: pageSize ? parseInt(pageSize) : undefined,
    });
  }

  @Get('summary')
  @ApiOperation({ summary: 'Open/critical event counters' })
  summary() {
    return this.events.summary();
  }

  @Post(':id/close')
  @ApiOperation({ summary: 'Acknowledge & close an event' })
  close(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.events.close(id, user.id);
  }
}
