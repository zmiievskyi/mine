/**
 * @jest-environment node
 */
import { FRESH_BLOCK_THRESHOLD } from '@/lib/gonka/constants';

// Mock the fetch utility before importing the route
jest.mock('@/lib/gonka/fetch', () => ({
  fetchWithTimeout: jest.fn(),
}));

import { fetchWithTimeout } from '@/lib/gonka/fetch';
import { GET } from '../route';

const mockFetchWithTimeout = fetchWithTimeout as jest.MockedFunction<
  typeof fetchWithTimeout
>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock Response whose .json() resolves to the given payload. */
function mockResponse(payload: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(payload),
  } as unknown as Response;
}

/** Chain-status payload (snake_case) */
function chainStatusPayload(opts: {
  catchingUp?: boolean;
  blockHeight?: string;
  blockTime?: string;
}) {
  return {
    result: {
      sync_info: {
        catching_up: opts.catchingUp ?? false,
        latest_block_height: opts.blockHeight ?? '12345',
        latest_block_time: opts.blockTime ?? new Date().toISOString(),
      },
    },
  };
}

/** Epoch payload */
function epochPayload(epochId: number) {
  return { active_participants: { epoch_id: epochId } };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/network-status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns status "live" when block age is within threshold and catching_up is false', async () => {
    const freshBlockTime = new Date(Date.now() - 30_000).toISOString(); // 30s ago

    mockFetchWithTimeout
      .mockResolvedValueOnce(
        mockResponse(chainStatusPayload({ catchingUp: false, blockTime: freshBlockTime }))
      )
      .mockResolvedValueOnce(mockResponse(epochPayload(1)));

    const res = await GET();
    const body = await res.json();

    expect(body.status).toBe('live');
    expect(body.blockHeight).toBe(12345);
    expect(body.epochId).toBe(1);
  });

  it('returns status "syncing" when catching_up is true regardless of block age', async () => {
    // Block time is fresh (10s ago) but node is catching up
    const freshBlockTime = new Date(Date.now() - 10_000).toISOString();

    mockFetchWithTimeout
      .mockResolvedValueOnce(
        mockResponse(chainStatusPayload({ catchingUp: true, blockTime: freshBlockTime }))
      )
      .mockResolvedValueOnce(mockResponse(epochPayload(5)));

    const res = await GET();
    const body = await res.json();

    expect(body.status).toBe('syncing');
  });

  it('returns status "stale" when block age exceeds threshold and catching_up is false', async () => {
    const staleBlockTime = new Date(
      Date.now() - (FRESH_BLOCK_THRESHOLD + 60) * 1000
    ).toISOString(); // 3 minutes ago

    mockFetchWithTimeout
      .mockResolvedValueOnce(
        mockResponse(chainStatusPayload({ catchingUp: false, blockTime: staleBlockTime }))
      )
      .mockResolvedValueOnce(mockResponse(epochPayload(2)));

    const res = await GET();
    const body = await res.json();

    expect(body.status).toBe('stale');
  });

  it('returns status "unknown" with HTTP 200 when fetchWithTimeout throws', async () => {
    mockFetchWithTimeout.mockRejectedValue(new Error('Request timed out after 5000ms'));

    const res = await GET();
    const body = await res.json();

    expect(body.status).toBe('unknown');
    expect(body.blockHeight).toBeNull();
    expect(body.blockAge).toBeNull();
    expect(body.epochId).toBeNull();
    // Route always returns 200 so the client can show an "unknown" state
    expect(res.status).toBe(200);
  });

  it('returns status "unknown" when any API response has ok: false', async () => {
    mockFetchWithTimeout
      .mockResolvedValueOnce(mockResponse({}, false)) // non-ok chain response
      .mockResolvedValueOnce(mockResponse(epochPayload(3)));

    const res = await GET();
    const body = await res.json();

    expect(body.status).toBe('unknown');
  });

  it('handles camelCase response format (syncInfo / catchingUp / latestBlockHeight)', async () => {
    const freshBlockTime = new Date(Date.now() - 20_000).toISOString();

    // camelCase variant — no wrapping `result` key
    const camelChainData = {
      syncInfo: {
        catchingUp: false,
        latestBlockHeight: '99999',
        latestBlockTime: freshBlockTime,
      },
    };

    mockFetchWithTimeout
      .mockResolvedValueOnce(mockResponse(camelChainData))
      .mockResolvedValueOnce(mockResponse(epochPayload(10)));

    const res = await GET();
    const body = await res.json();

    expect(body.status).toBe('live');
    expect(body.blockHeight).toBe(99999);
  });

  it('calculates blockAge correctly in seconds from the block time', async () => {
    const ageSeconds = 45;
    const knownNow = new Date('2026-03-23T10:00:00Z');
    const blockTime = new Date(knownNow.getTime() - ageSeconds * 1000).toISOString();

    // Pin Date.now() so the route's `new Date()` aligns with our knownNow
    jest.useFakeTimers();
    jest.setSystemTime(knownNow);

    mockFetchWithTimeout
      .mockResolvedValueOnce(
        mockResponse(chainStatusPayload({ catchingUp: false, blockTime }))
      )
      .mockResolvedValueOnce(mockResponse(epochPayload(7)));

    const res = await GET();
    const body = await res.json();

    jest.useRealTimers();

    expect(body.blockAge).toBeCloseTo(ageSeconds, 1);
    expect(body.status).toBe('live'); // 45s < 120s threshold
  });

  it('extracts epochId from active_participants.epoch_id in the epoch response', async () => {
    const freshBlockTime = new Date(Date.now() - 5_000).toISOString();

    mockFetchWithTimeout
      .mockResolvedValueOnce(
        mockResponse(chainStatusPayload({ catchingUp: false, blockTime: freshBlockTime }))
      )
      .mockResolvedValueOnce(mockResponse(epochPayload(42)));

    const res = await GET();
    const body = await res.json();

    expect(body.epochId).toBe(42);
  });

  it('always sets Cache-Control to no-cache, no-store, must-revalidate', async () => {
    const freshBlockTime = new Date(Date.now() - 10_000).toISOString();

    // Happy-path call
    mockFetchWithTimeout
      .mockResolvedValueOnce(
        mockResponse(chainStatusPayload({ catchingUp: false, blockTime: freshBlockTime }))
      )
      .mockResolvedValueOnce(mockResponse(epochPayload(1)));

    const successRes = await GET();
    expect(successRes.headers.get('Cache-Control')).toBe(
      'no-cache, no-store, must-revalidate'
    );

    // Error-path call
    jest.clearAllMocks();
    mockFetchWithTimeout.mockRejectedValue(new Error('timeout'));

    const errorRes = await GET();
    expect(errorRes.headers.get('Cache-Control')).toBe(
      'no-cache, no-store, must-revalidate'
    );
  });
});
