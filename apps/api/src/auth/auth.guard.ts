import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../common/public.decorator';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.cookies?.itemback_session as string | undefined;
    const authenticated = await this.auth.authenticate(token);
    if (!authenticated) {
      throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: '请先登录' });
    }
    request.user = authenticated.user;
    request.sessionTokenHash = authenticated.tokenHash;
    return true;
  }
}
