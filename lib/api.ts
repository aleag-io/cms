export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function handle(fn: () => Promise<Response>): Promise<Response> {
  return fn().catch((err: unknown) => {
    if (err instanceof ApiError) {
      return Response.json({ ok: false, error: err.message }, { status: err.status });
    }
    console.error('[API Error]', err);
    return Response.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 },
    );
  });
}
