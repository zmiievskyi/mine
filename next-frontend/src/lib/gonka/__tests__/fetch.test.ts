import { fetchWithTimeout } from '../fetch';
import { FETCH_TIMEOUT_MS } from '../constants';

describe('fetchWithTimeout', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    jest.useFakeTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('returns the response when fetch resolves successfully', async () => {
    const mockResponse = { ok: true, status: 200 } as Response;
    global.fetch = jest.fn().mockResolvedValue(mockResponse);

    const result = await fetchWithTimeout('https://example.com/api');

    expect(result).toBe(mockResponse);
  });

  it('throws a timeout error when fetch does not resolve within the timeout', async () => {
    // fetch never resolves
    global.fetch = jest.fn().mockImplementation(
      (_url: string, options?: RequestInit) =>
        new Promise((_resolve, reject) => {
          // Simulate abort triggering an AbortError
          const signal = options?.signal;
          if (signal) {
            signal.addEventListener('abort', () => {
              const error = new Error('The operation was aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }
        })
    );

    const timeoutMs = 3000;
    const fetchPromise = fetchWithTimeout('https://example.com/api', {}, timeoutMs);

    // Advance fake timers past the timeout
    jest.advanceTimersByTime(timeoutMs + 1);

    await expect(fetchPromise).rejects.toThrow(
      `Request timed out after ${timeoutMs}ms`
    );
  });

  it('passes the url and merged options (including signal) through to fetch', async () => {
    const mockResponse = { ok: true, status: 200 } as Response;
    const mockFetch = jest.fn().mockResolvedValue(mockResponse);
    global.fetch = mockFetch;

    const url = 'https://example.com/data';
    const options: RequestInit = {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    };

    await fetchWithTimeout(url, options);

    expect(mockFetch).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      })
    );
  });

  it('re-throws non-abort fetch errors directly', async () => {
    const networkError = new Error('Network connection refused');
    global.fetch = jest.fn().mockRejectedValue(networkError);

    await expect(fetchWithTimeout('https://example.com/api')).rejects.toThrow(
      'Network connection refused'
    );
  });

  it('uses FETCH_TIMEOUT_MS as the default timeout when no timeout parameter is passed', async () => {
    // fetch never resolves; instead it responds to the abort signal
    global.fetch = jest.fn().mockImplementation(
      (_url: string, options?: RequestInit) =>
        new Promise((_resolve, reject) => {
          const signal = options?.signal;
          if (signal) {
            signal.addEventListener('abort', () => {
              const error = new Error('The operation was aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }
        })
    );

    const fetchPromise = fetchWithTimeout('https://example.com/api');

    // Advance time by exactly FETCH_TIMEOUT_MS — abort should fire
    jest.advanceTimersByTime(FETCH_TIMEOUT_MS);

    await expect(fetchPromise).rejects.toThrow(
      `Request timed out after ${FETCH_TIMEOUT_MS}ms`
    );
  });
});
