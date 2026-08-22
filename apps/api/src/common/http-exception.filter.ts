import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = exception instanceof HttpException ? exception.getResponse() : null;
    let message = '服务器暂时无法处理请求';
    let code = 'INTERNAL_ERROR';
    let details: Record<string, string[]> | undefined;

    if (typeof raw === 'string') message = raw;
    if (raw && typeof raw === 'object') {
      const body = raw as Record<string, unknown>;
      const source = body.message;
      if (Array.isArray(source)) {
        message = '提交的数据有误';
        details = { fields: source.map(String) };
      } else if (typeof source === 'string') message = source;
      if (typeof body.code === 'string') code = body.code;
    }
    if (code === 'INTERNAL_ERROR' && status < 500) code = HttpStatus[status] ?? 'REQUEST_ERROR';

    response.status(status).json({
      statusCode: status,
      code,
      message,
      ...(details ? { details } : {}),
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
    });
  }
}
