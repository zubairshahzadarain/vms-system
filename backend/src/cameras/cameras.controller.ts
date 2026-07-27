import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CameraStatus } from '@prisma/client';
import { CamerasService } from './cameras.service';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import {
  CreateCameraDto,
  CreateGroupDto,
  TestConnectionDto,
  UpdateCameraDto,
} from './dto/camera.dto';

@ApiTags('cameras')
@ApiBearerAuth()
@Controller('cameras')
export class CamerasController {
  constructor(private cameras: CamerasService) {}

  @Get()
  @ApiOperation({ summary: 'List cameras (viewers: assigned only) with live/recording runtime state' })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'groupId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: CameraStatus })
  list(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('groupId') groupId?: string,
    @Query('status') status?: CameraStatus,
  ) {
    return this.cameras.list(user, { q, groupId, status });
  }

  @Get('groups')
  @ApiOperation({ summary: 'List camera groups' })
  listGroups() {
    return this.cameras.listGroups();
  }

  @Post('groups')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create camera group (admin)' })
  createGroup(@Body() dto: CreateGroupDto) {
    return this.cameras.createGroup(dto.name);
  }

  @Delete('groups/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete camera group (admin)' })
  deleteGroup(@Param('id') id: string) {
    return this.cameras.deleteGroup(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get camera detail' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.cameras.get(user, id);
  }

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Add camera (admin)' })
  create(@Body() dto: CreateCameraDto) {
    return this.cameras.create(dto);
  }

  @Put(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Edit camera (admin)' })
  update(@Param('id') id: string, @Body() dto: UpdateCameraDto) {
    return this.cameras.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete camera (admin)' })
  remove(@Param('id') id: string) {
    return this.cameras.remove(id);
  }

  @Post(':id/enable')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Enable camera and start its pipelines (admin)' })
  enable(@Param('id') id: string) {
    return this.cameras.setEnabled(id, true);
  }

  @Post(':id/disable')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Disable camera and stop its pipelines (admin)' })
  disable(@Param('id') id: string) {
    return this.cameras.setEnabled(id, false);
  }

  @Post(':id/test')
  @Roles('ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Test RTSP connection; returns codec/resolution/fps' })
  test(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: TestConnectionDto,
  ) {
    return this.cameras.testConnection(user, id, dto.rtspUrl);
  }
}
