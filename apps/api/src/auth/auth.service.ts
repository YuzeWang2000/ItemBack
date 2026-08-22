import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    const email = this.config.get<string>('ADMIN_EMAIL')?.trim().toLowerCase();
    const password = this.config.get<string>('ADMIN_PASSWORD');
    if (!email || !password || password.length < 8) {
      this.logger.warn('ADMIN_EMAIL/ADMIN_PASSWORD 未正确配置；账号自动初始化已跳过');
      return;
    }
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (!existing) {
      await this.prisma.user.create({ data: { email, passwordHash: await hash(password, 12) } });
      this.logger.log(`已初始化单用户账号 ${email}`);
    }
  }

  async login(emailInput: string, password: string) {
    const email = emailInput.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !(await compare(password, user.passwordHash))) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: '邮箱或密码不正确' });
    }
    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(token);
    const days = Math.max(1, this.config.get<number>('SESSION_DAYS') ?? 30);
    const expiresAt = new Date(Date.now() + days * 86_400_000);
    await this.prisma.authSession.create({ data: { userId: user.id, tokenHash, expiresAt } });
    return { token, expiresAt, user: { id: user.id, email: user.email } };
  }

  async authenticate(token: string | undefined) {
    if (!token) return null;
    const tokenHash = this.hashToken(token);
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, email: true } } },
    });
    if (!session) return null;
    if (session.expiresAt <= new Date()) {
      await this.prisma.authSession.delete({ where: { id: session.id } }).catch(() => undefined);
      return null;
    }
    return { user: session.user, tokenHash };
  }

  async logout(token: string | undefined) {
    if (!token) return;
    await this.prisma.authSession.deleteMany({ where: { tokenHash: this.hashToken(token) } });
  }

  ensureConfigured() {
    if (!this.config.get('ADMIN_EMAIL'))
      throw new ServiceUnavailableException('管理员账号尚未配置');
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
