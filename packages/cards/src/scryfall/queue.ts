/**
 * The one shared request queue of the Scryfall client (SPEC 6.2). Every API call goes through it.
 *
 * - `/cards/collection`, `/cards/named`, `/cards/search` and `/cards/random` start at least
 *   500 ms apart (2 per second); every other `api.scryfall.com` endpoint at least 100 ms apart
 *   (10 per second), and the four limited endpoints count towards that budget too. Files on
 *   `*.scryfall.io` are not limited.
 * - Requests of one class run one at a time, in submission order. Spacing is measured with the
 *   injected clock and waited with the injected `sleep`.
 * - HTTP 429 stops the whole queue: nothing new starts until the back-off has passed, which is
 *   the `Retry-After` seconds when the server sends them, else 1 s, 2 s, 4 s, up to 3 retries.
 * - A network error or a 5xx answer retries up to 2 times (1 s, 2 s) and then becomes a typed
 *   failure. Nothing here throws for network trouble.
 * - Every request sends `Accept: application/json`, a POST also `Content-Type:
 *   application/json`, and `User-Agent` only when one is given (browsers ignore it).
 *
 * Browser-safe: the fetch function, the clock and `sleep` are injected.
 */

export type ScryfallFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface RequestQueueOptions {
  readonly fetch: ScryfallFetch;
  /** Milliseconds on a monotonic clock. */
  readonly now: () => number;
  readonly sleep: (ms: number) => Promise<void>;
  /** Sent as `User-Agent`; for Node tools only, because browsers do not allow it. */
  readonly userAgent?: string | undefined;
  /** Retries after HTTP 429. Default 3. */
  readonly maxRateLimitRetries?: number | undefined;
  /** Retries after a network error or a 5xx answer. Default 2. */
  readonly maxErrorRetries?: number | undefined;
  /** First back-off, doubled per retry. Default 1000. */
  readonly backoffBaseMs?: number | undefined;
  /** A `Retry-After` above this is not waited for: the request fails. Default 60000. */
  readonly maxRetryAfterMs?: number | undefined;
  /** Abort a request after this long (0 disables it). Default 30000. */
  readonly timeoutMs?: number | undefined;
}

export interface QueueRequest {
  readonly url: string;
  /** Default GET. */
  readonly method?: 'GET' | 'POST' | undefined;
  /** The JSON body of a POST. */
  readonly json?: unknown;
}

/** Any answer other than 429 and 5xx, 4xx included: the caller decides what 404 or 400 mean. */
export interface QueueResponse {
  readonly kind: 'response';
  readonly status: number;
  readonly ok: boolean;
  /** The parsed body, or undefined when it was empty or not JSON. */
  readonly json: unknown;
  /** How many times the request was sent. */
  readonly attempts: number;
}

export interface QueueFailure {
  readonly kind: 'failure';
  readonly reason: 'network' | 'server' | 'rate-limited';
  readonly message: string;
  /** The last HTTP status, or null after a network error. */
  readonly status: number | null;
  readonly attempts: number;
}

export type QueueOutcome = QueueResponse | QueueFailure;

export interface RequestQueue {
  request(request: QueueRequest): Promise<QueueOutcome>;
}

type RateClass = 'search' | 'api' | 'file';

interface Gate {
  readonly key: string;
  readonly spacingMs: number;
}

const SEARCH_SPACING_MS = 500;
const API_SPACING_MS = 100;
const SEARCH_PATH = /^\/cards\/(collection|named|search|random)\/?$/;
const API_GATE: Gate = { key: 'api', spacingMs: API_SPACING_MS };
const SEARCH_GATE: Gate = { key: 'search', spacingMs: SEARCH_SPACING_MS };

function classify(url: string): { rateClass: RateClass; gates: readonly Gate[] } {
  let host = '';
  let pathname = '';
  try {
    const parsed = new URL(url);
    host = parsed.hostname.toLowerCase();
    pathname = parsed.pathname;
  } catch {
    // fetch reports a malformed URL as a network error; treat it as an ordinary API call.
  }
  if (host === 'scryfall.io' || host.endsWith('.scryfall.io')) {
    return { rateClass: 'file', gates: [] };
  }
  if (host === 'api.scryfall.com' && SEARCH_PATH.test(pathname)) {
    return { rateClass: 'search', gates: [API_GATE, SEARCH_GATE] };
  }
  return { rateClass: 'api', gates: [API_GATE] };
}

/** Retry-After as delta-seconds. An HTTP date or anything else yields undefined. */
function retryAfterSeconds(value: string | null): number | undefined {
  if (value === null || !/^\s*\d{1,6}\s*$/.test(value)) return undefined;
  return Number(value.trim());
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Creates the queue. Create it once and hand the same instance to every client call. */
export function createRequestQueue(options: RequestQueueOptions): RequestQueue {
  const maxRateLimitRetries = options.maxRateLimitRetries ?? 3;
  const maxErrorRetries = options.maxErrorRetries ?? 2;
  const backoffBaseMs = options.backoffBaseMs ?? 1000;
  const maxRetryAfterMs = options.maxRetryAfterMs ?? 60_000;
  const timeoutMs = options.timeoutMs ?? 30_000;

  const lastStart = new Map<string, number>();
  const tails = new Map<RateClass, Promise<unknown>>();
  /** Nothing limited starts before this time (set by HTTP 429). */
  let pausedUntil = Number.NEGATIVE_INFINITY;

  /** Waits until every gate and the 429 pause allow a start, then records the start. */
  async function waitForTurn(gates: readonly Gate[]): Promise<void> {
    for (;;) {
      const now = options.now();
      let earliest = pausedUntil;
      for (const gate of gates) {
        const last = lastStart.get(gate.key);
        if (last !== undefined) earliest = Math.max(earliest, last + gate.spacingMs);
      }
      if (earliest <= now) {
        for (const gate of gates) lastStart.set(gate.key, now);
        return;
      }
      await options.sleep(earliest - now);
    }
  }

  function headersFor(method: string): Record<string, string> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (method === 'POST') headers['Content-Type'] = 'application/json';
    if (options.userAgent) headers['User-Agent'] = options.userAgent;
    return headers;
  }

  async function execute(request: QueueRequest, gates: readonly Gate[]): Promise<QueueOutcome> {
    const method = request.method ?? 'GET';
    const limited = gates.length > 0;
    const headers = headersFor(method);
    const body = request.json === undefined ? undefined : JSON.stringify(request.json);
    let rateLimitRetries = 0;
    let errorRetries = 0;

    for (let attempt = 1; ; attempt++) {
      await waitForTurn(gates);
      const init: RequestInit = { method, headers };
      if (body !== undefined) init.body = body;
      if (timeoutMs > 0 && typeof AbortSignal.timeout === 'function') {
        init.signal = AbortSignal.timeout(timeoutMs);
      }

      let status = 0;
      let text = '';
      let retryAfter: number | undefined;
      let problem: { reason: 'network' | 'server'; message: string } | null = null;
      try {
        const response = await options.fetch(request.url, init);
        status = response.status;
        retryAfter = retryAfterSeconds(response.headers.get('retry-after'));
        text = await response.text();
      } catch (error) {
        problem = { reason: 'network', message: describeError(error) };
      }

      if (problem === null && status === 429) {
        rateLimitRetries++;
        const waitMs =
          retryAfter !== undefined
            ? retryAfter * 1000
            : backoffBaseMs * 2 ** (rateLimitRetries - 1);
        if (rateLimitRetries > maxRateLimitRetries || waitMs > maxRetryAfterMs) {
          return {
            kind: 'failure',
            reason: 'rate-limited',
            message: `HTTP 429 from Scryfall after ${attempt} attempt(s)`,
            status,
            attempts: attempt,
          };
        }
        // Stop the whole queue, not only this request.
        if (limited) pausedUntil = Math.max(pausedUntil, options.now() + waitMs);
        else await options.sleep(waitMs);
        continue;
      }

      if (problem === null && status >= 500) {
        problem = { reason: 'server', message: `HTTP ${status} from Scryfall` };
      }
      if (problem !== null) {
        errorRetries++;
        if (errorRetries > maxErrorRetries) {
          return {
            kind: 'failure',
            reason: problem.reason,
            message: problem.message,
            status: status === 0 ? null : status,
            attempts: attempt,
          };
        }
        await options.sleep(backoffBaseMs * 2 ** (errorRetries - 1));
        continue;
      }

      let json: unknown;
      try {
        json = text === '' ? undefined : JSON.parse(text);
      } catch {
        json = undefined;
      }
      return {
        kind: 'response',
        status,
        ok: status >= 200 && status < 300,
        json,
        attempts: attempt,
      };
    }
  }

  return {
    request(request) {
      const { rateClass, gates } = classify(request.url);
      // Files are not limited: they neither wait for each other nor for a 429 pause.
      if (rateClass === 'file') return execute(request, gates);
      const previous = tails.get(rateClass) ?? Promise.resolve();
      const run = previous.then(() => execute(request, gates));
      tails.set(
        rateClass,
        run.catch(() => undefined),
      );
      return run;
    },
  };
}
