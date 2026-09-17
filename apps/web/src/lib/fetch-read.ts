const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const UNAVAILABLE_MESSAGE = 'We couldn’t load your records. Please try again.';

function waitForRetry(delay: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delay);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Retry transient failures for read-only requests, with a bounded wait per attempt. */
export async function fetchRead(url: string, init: Omit<RequestInit, 'method' | 'body'> = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    init.signal?.throwIfAborted();
    const controller = new AbortController();
    const onAbort = () => controller.abort(init.signal?.reason);
    init.signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(url, { ...init, method: 'GET', signal: controller.signal });
      if (!RETRYABLE_STATUSES.has(response.status)) return response;
      void response.body?.cancel().catch(() => undefined);
    } catch (error) {
      init.signal?.throwIfAborted();
      if (!(error instanceof TypeError) && !controller.signal.aborted) throw error;
    } finally {
      clearTimeout(timer);
      init.signal?.removeEventListener('abort', onAbort);
    }
    if (attempt < 2) await waitForRetry(1000 * (attempt + 1), init.signal);
  }
  throw new Error(UNAVAILABLE_MESSAGE);
}
