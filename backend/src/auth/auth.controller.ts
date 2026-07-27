import { Body, Controller, Get, HttpCode, Ip, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from '../common/decorators/public.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: false, // set true behind HTTPS in production
  path: '/',
  maxAge: 12 * 60 * 60 * 1000,
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login with username & password; sets httpOnly JWT cookie and returns token' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
    @Ip() ip: string,
  ) {
    const result = await this.auth.login(dto.username, dto.password, ip);
    res.cookie('vms_token', result.token, COOKIE_OPTS);
    return result;
  }

  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Logout: clears auth cookie and emits USER_LOGOUT event' })
  async logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user.id);
    res.clearCookie('vms_token', { path: '/' });
    return { ok: true };
  }

  @Get('me')
  @ApiOperation({ summary: 'Current authenticated user profile with assigned camera ids' })
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }
}
