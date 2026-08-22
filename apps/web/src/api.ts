import type { ApiErrorBody } from '@itemback/contracts';

export const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers:
      options.body instanceof FormData
        ? options.headers
        : { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(
      body?.message ?? '请求失败，请稍后重试',
      response.status,
      body?.code ?? 'REQUEST_FAILED',
      body?.details,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function contentUrl(id: string, download = false) {
  return `${API_BASE}/attachments/${id}/content${download ? '?download=1' : ''}`;
}
