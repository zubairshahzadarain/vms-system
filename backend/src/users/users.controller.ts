import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { AssignCamerasDto, CreateUserDto, UpdateUserDto } from './dto/user.dto';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@Roles('ADMIN')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users (admin)' })
  @ApiQuery({ name: 'q', required: false })
  list(@Query('q') q?: string) {
    return this.users.list(q);
  }

  @Post()
  @ApiOperation({ summary: 'Create user (admin)' })
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update user; pass password to reset it (admin)' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete user (admin)' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.users.remove(id, user.id);
  }

  @Put(':id/cameras')
  @ApiOperation({ summary: 'Set camera assignments for a viewer (admin)' })
  assign(@Param('id') id: string, @Body() dto: AssignCamerasDto) {
    return this.users.assignCameras(id, dto);
  }
}
