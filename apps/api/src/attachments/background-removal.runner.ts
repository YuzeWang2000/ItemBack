import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import path from 'node:path';
export const BACKGROUND_ALGORITHM_VERSION = 'apple-vision-foreground-v1';

interface HelperResponse {
  ok: boolean;
  imageBase64?: string;
  algorithmVersion: string;
  errorCode?: string;
  message?: string;
}

export class BackgroundRemovalRunnerError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly unavailable = false,
  ) {
    super(message);
  }
}

export function validateTransparentPng(output: Buffer, maxBytes: number) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  let valid =
    output.length <= maxBytes && output.length >= 45 && output.subarray(0, 8).equals(signature);
  valid = valid && output.readUInt32BE(8) === 13 && output.toString('ascii', 12, 16) === 'IHDR';
  const width = valid ? output.readUInt32BE(16) : 0;
  const height = valid ? output.readUInt32BE(20) : 0;
  const colorType = valid ? output[25] : -1;
  valid = valid && width > 0 && height > 0 && width <= 100_000 && height <= 100_000;
  valid = valid && [8, 16].includes(output[24]) && [4, 6].includes(colorType);
  let offset = 8;
  let hasImageData = false;
  let hasEnd = false;
  while (valid && offset + 12 <= output.length) {
    const length = output.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > output.length) {
      valid = false;
      break;
    }
    const type = output.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') hasImageData = true;
    if (type === 'IEND') {
      hasEnd = length === 0 && end === output.length;
      break;
    }
    offset = end;
  }
  valid = valid && hasImageData && hasEnd;
  if (!valid) {
    throw new BackgroundRemovalRunnerError(
      'INVALID_HELPER_OUTPUT',
      '本地抠图结果不是有效的透明 PNG',
    );
  }
}

@Injectable()
export class BackgroundRemovalRunner {
  constructor(private readonly config: ConfigService) {}

  isConfigured() {
    const mode = this.mode();
    return mode === 'command'
      ? process.platform === 'darwin'
      : Boolean(
          this.config.get<string>('VISION_HELPER_URL') &&
          this.config.get<string>('VISION_HELPER_TOKEN'),
        );
  }

  async process(input: Buffer): Promise<Buffer> {
    if (!this.isConfigured()) {
      throw new BackgroundRemovalRunnerError(
        'BACKGROUND_REMOVAL_UNAVAILABLE',
        '当前部署未配置 macOS 本地系统抠图助手',
        true,
      );
    }
    const request = JSON.stringify({ imageBase64: input.toString('base64') });
    let responseText: string;
    try {
      responseText =
        this.mode() === 'http' ? await this.http(request) : await this.command(request);
    } catch {
      throw new BackgroundRemovalRunnerError(
        'VISION_HELPER_UNREACHABLE',
        '无法连接 macOS 本地系统抠图助手',
        true,
      );
    }
    let response: HelperResponse;
    try {
      response = JSON.parse(responseText) as HelperResponse;
    } catch {
      throw new BackgroundRemovalRunnerError(
        'INVALID_HELPER_RESPONSE',
        '本地系统抠图返回了无效结果',
      );
    }
    if (!response.ok || !response.imageBase64) {
      throw new BackgroundRemovalRunnerError(
        response.errorCode || 'BACKGROUND_REMOVAL_FAILED',
        response.message || '本地系统抠图失败',
        response.errorCode === 'VISION_UNAVAILABLE',
      );
    }
    if (response.algorithmVersion !== BACKGROUND_ALGORITHM_VERSION) {
      throw new BackgroundRemovalRunnerError(
        'ALGORITHM_VERSION_MISMATCH',
        '本地抠图助手版本不匹配',
      );
    }
    const output = Buffer.from(response.imageBase64, 'base64');
    this.validatePng(output);
    return output;
  }

  private mode() {
    return this.config.get<string>('VISION_HELPER_MODE') === 'http' ? 'http' : 'command';
  }

  private async command(request: string) {
    const configured = this.config.get<string>('VISION_HELPER_PATH');
    const executable = configured
      ? path.resolve(configured)
      : path.resolve(
          process.cwd(),
          '../../native/background-removal-helper/.build/release/itemback-vision-helper',
        );
    return new Promise<string>((resolve, reject) => {
      const child = spawn(executable, [], { stdio: ['pipe', 'pipe', 'ignore'] });
      const chunks: Buffer[] = [];
      let size = 0;
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('helper timed out'));
      }, 120_000);
      child.stdout.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 50 * 1024 * 1024) {
          child.kill('SIGKILL');
          reject(new Error('helper output too large'));
        } else {
          chunks.push(chunk);
        }
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(Buffer.concat(chunks).toString('utf8'));
        else reject(new Error(`helper exited with ${code}`));
      });
      child.stdin.end(request);
    });
  }

  private async http(request: string) {
    const url = this.config.getOrThrow<string>('VISION_HELPER_URL');
    const token = this.config.getOrThrow<string>('VISION_HELPER_TOKEN');
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: request,
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`helper returned ${response.status}`);
    return response.text();
  }

  private validatePng(output: Buffer) {
    const max = Math.max(1, this.config.get<number>('VISION_MAX_OUTPUT_MB') ?? 40) * 1024 * 1024;
    validateTransparentPng(output, max);
  }
}
