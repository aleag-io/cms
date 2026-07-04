export type ApiErrorKind =
  | 'unauthorized'
  | 'forbidden'
  | 'server'
  | 'network'
  | 'unknown';

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly kind: ApiErrorKind,
    public readonly payload?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export type ApiEnvelope<T> =
  | (T & { ok?: true })
  | { ok: false; error?: string };

function errorKind(status: number): ApiErrorKind {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status >= 500) return 'server';
  return 'unknown';
}

function fallbackMessage(status: number, statusText: string): string {
  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) return 'You do not have access to this area.';
  return `Request failed (${status} ${statusText}).`;
}

async function parseJsonBody(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (!raw) return null;

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function redirectToLogin() {
  if (typeof window !== 'undefined') {
    const url = new URL('/login', window.location.href);
    url.searchParams.set('reason', 'session_expired');
    window.location.assign(url.toString());
  }
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(path, {
      ...init,
      headers: {
        accept: 'application/json',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch (err) {
    throw new ApiClientError(
      0,
      err instanceof Error ? err.message : 'Network request failed.',
      'network',
    );
  }

  const data = (await parseJsonBody(response)) as ApiEnvelope<T> | null;
  const apiError =
    data && typeof data === 'object' && 'ok' in data && data.ok === false
      ? data.error
      : undefined;

  if (!response.ok || apiError) {
    if (response.status === 401) {
      redirectToLogin();
    }
    throw new ApiClientError(
      response.status,
      apiError ?? fallbackMessage(response.status, response.statusText),
      errorKind(response.status),
      data,
    );
  }

  if (data === null) {
    throw new ApiClientError(
      response.status,
      fallbackMessage(response.status, response.statusText),
      errorKind(response.status),
    );
  }

  return data as T;
}

export function isApiClientError(err: unknown): err is ApiClientError {
  return err instanceof ApiClientError;
}
