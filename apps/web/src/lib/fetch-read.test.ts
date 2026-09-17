import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchRead } from './fetch-read';

describe('fetchRead', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('recovers from a network failure and a temporary server failure', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('{"items":[]}'));
    const result = fetchRead('/records');
    await vi.runAllTimersAsync();
    expect((await result).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([400, 401, 403, 404])('does not retry HTTP %s', async (status) => {
    fetchMock.mockResolvedValue(new Response('', { status }));
    expect((await fetchRead('/records')).status).toBe(status);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries HTTP 429 (rate-limited) and recovers', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response('{"items":[]}'));
    const result = fetchRead('/records');
    await vi.runAllTimersAsync();
    expect((await result).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('stops after three failed attempts with a useful message', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const assertion = expect(fetchRead('/records')).rejects.toThrow('Please try again');
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('bounds requests that never respond', async () => {
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    const assertion = expect(fetchRead('/records')).rejects.toThrow('Please try again');
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels the retry delay when the user leaves', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const controller = new AbortController();
    const assertion = expect(
      fetchRead('/records', { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    await assertion;
    await vi.runAllTimersAsync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
