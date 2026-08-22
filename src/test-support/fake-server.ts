/**
 * A stand-in for `/v1` that records what the client actually sent.
 *
 * Lives outside `__tests__` on purpose: Jest treats every file under a
 * `__tests__` directory as a suite, and a helper module there fails as a
 * suite with no tests.
 *
 * The fake responses are structural rather than real `Response` objects —
 * `httpFetch` only ever touches `ok`, `status`, `statusText`, `headers.get`,
 * and `json()`, so matching that surface keeps the helper honest about the
 * coupling instead of dragging in a polyfill.
 */

export type RecordedRequest = {
  method: string;
  url: string;
  /** Path without the origin or query string, e.g. `/v1/auth/refresh`. */
  path: string;
  headers: Record<string, string>;
  /** Parsed request body, or undefined when none was sent. */
  body: unknown;
  /** Exactly what went on the wire — the idempotency fingerprint's input. */
  rawBody: string | undefined;
};

export type FakeResponseInit = {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
};

type Handler = (request: RecordedRequest) => FakeResponseInit | Promise<FakeResponseInit>;

/** A single response, for tests that exercise parsing rather than routing. */
export function fakeResponse(init: FakeResponseInit): Response {
  return makeResponse(init);
}

function makeResponse(init: FakeResponseInit): Response {
  const status = init.status ?? 200;
  const headers = new Map<string, string>(
    Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  );

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `Status ${status}`,
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    json: async () => {
      if (init.body === undefined) throw new Error('No JSON body');
      return init.body;
    },
  } as unknown as Response;
}

export class FakeServer {
  readonly requests: RecordedRequest[] = [];
  private readonly routes = new Map<string, Handler>();
  private originalFetch: typeof globalThis.fetch | undefined;

  /** `on('POST', '/v1/auth/refresh', () => ({ body: … }))` */
  on(method: string, path: string, handler: Handler): this {
    this.routes.set(`${method.toUpperCase()} ${path}`, handler);
    return this;
  }

  /** Every request the client made to `path`, in order. */
  callsTo(method: string, path: string): RecordedRequest[] {
    return this.requests.filter(
      (r) => r.method === method.toUpperCase() && r.path === path,
    );
  }

  install(): void {
    this.originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      // `fetch` accepts a string, a URL, or a Request; the client only ever
      // passes a string, but blind `String(input)` on a Request would yield
      // "[object Object]" and route every call to the same wrong place.
      let url: string;
      if (typeof input === 'string') url = input;
      else if (input instanceof URL) url = input.href;
      else url = (input as Request).url;

      const method = (init?.method ?? 'GET').toUpperCase();
      const rawBody = typeof init?.body === 'string' ? init.body : undefined;

      // Strip origin and query — routes are declared by path alone.
      const withoutOrigin = url.replace(/^https?:\/\/[^/]+/, '');
      const path = withoutOrigin.split('?')[0] ?? withoutOrigin;

      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(
        (init?.headers ?? {}) as Record<string, string>,
      )) {
        headers[key.toLowerCase()] = value;
      }

      const recorded: RecordedRequest = {
        method,
        url,
        path,
        headers,
        body: rawBody === undefined ? undefined : JSON.parse(rawBody),
        rawBody,
      };
      this.requests.push(recorded);

      const handler = this.routes.get(`${method} ${path}`);
      if (!handler) {
        throw new Error(`FakeServer: no route for ${method} ${path}`);
      }

      return makeResponse(await handler(recorded));
    }) as typeof globalThis.fetch;
  }

  restore(): void {
    if (this.originalFetch) globalThis.fetch = this.originalFetch;
  }
}

/** A network that is simply not there — what offline looks like to `fetch`. */
export function installOfflineFetch(): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new TypeError('Network request failed');
  }) as typeof globalThis.fetch;
  return () => {
    globalThis.fetch = original;
  };
}

/** The token envelope both `/login` and `/refresh` return. */
export function tokenPayload(overrides: {
  access?: string;
  refresh?: string;
  expiresIn?: number;
}): Record<string, unknown> {
  return {
    access_token: overrides.access ?? 'access-1',
    refresh_token: overrides.refresh ?? 'refresh-1',
    expires_in: overrides.expiresIn ?? 900,
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'driver@stlaurent.example.ca',
      role: 'driver',
      first_name: 'Camille',
      last_name: 'Roy',
      organization_id: '22222222-2222-4222-8222-222222222222',
    },
  };
}

/** The server's failure envelope. */
export function errorPayload(
  code: string,
  message = 'Something went wrong',
  details: Record<string, unknown> = {},
): Record<string, unknown> {
  return { error: { code, message, details } };
}
