import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { EventType } from '@prisma/client';
import { SearchService } from './search.service';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('search')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(private search: SearchService) {}

  @Get()
  @ApiOperation({
    summary:
      'Unified search across cameras, recordings, events and users with date/camera/group/status/event-type filters',
  })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'types', required: false, description: 'CSV of cameras,recordings,events,users (default all allowed)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'cameraId', required: false })
  @ApiQuery({ name: 'groupId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'eventType', required: false, enum: EventType })
  @ApiQuery({ name: 'limit', required: false })
  run(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('types') types?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('cameraId') cameraId?: string,
    @Query('groupId') groupId?: string,
    @Query('status') status?: string,
    @Query('eventType') eventType?: EventType,
    @Query('limit') limit?: string,
  ) {
    return this.search.search(user, {
      q,
      types: types ? types.split(',') : ['cameras', 'recordings', 'events', 'users'],
      from,
      to,
      cameraId,
      groupId,
      status,
      eventType,
      limit: Math.min(100, limit ? parseInt(limit) : 25),
    });
  }
}
