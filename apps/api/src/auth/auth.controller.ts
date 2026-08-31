import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Public } from '../common/public.decorator';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';
import { LoginDto } from './login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: '使用单用户管理员账号登录' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    this.auth.ensureConfigured();
    const result = await this.auth.login(dto.email, dto.password);
    response.cookie('itemback_session', result.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get('COOKIE_SECURE', 'true').toLowerCase() !== 'false',
      expires: result.expiresAt,
      path: '/',
    });
    return { user: result.user };
  }

  @Post('logout')
  @HttpCode(204)
  @ApiCookieAuth()
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(request.cookies?.itemback_session as string | undefined);
    response.clearCookie('itemback_session', { path: '/' });
  }

  @Get('me')
  @ApiCookieAuth()
  me(@Req() request: AuthenticatedRequest) {
    return { user: request.user };
  }
}
