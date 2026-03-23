/**
 * @jest-environment node
 *
 * API route tests run in the Node.js environment so that next/server globals
 * (Request, Response, Headers) are available without a DOM polyfill.
 */

// Mock the fetch utility before importing the route (Jest hoists this call)
jest.mock('@/lib/gonka/fetch', () => ({
  fetchWithTimeout: jest.fn(),
}));

import { fetchWithTimeout } from '@/lib/gonka/fetch';
import { GET } from '../route';
import { gpuEfficiencyData } from '@/data/efficiency';
import { GPU_PRICING, GPU_WEIGHTS_CACHE_DURATION } from '@/lib/gonka/constants';

// Silence console.error output produced by the catch branch
jest.spyOn(console, 'error').mockImplementation(() => {});

const mockedFetch = fetchWithTimeout as jest.MockedFunction<typeof fetchWithTimeout>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Response-like object that fetchWithTimeout returns. */
function mockResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

/**
 * Participant payload factory.
 * Each entry in `nodes` is { nodeId, pocWeight }.
 */
function makeParticipantsPayload(
  participants: Array<{
    index: string;
    nodes: Array<{ nodeId: string; pocWeight: number }>;
  }>
) {
  return {
    active_participants: {
      participants: participants.map(({ index, nodes }) => ({
        index,
        weight: 1000,
        ml_nodes: [
          {
            ml_nodes: nodes.map(({ nodeId, pocWeight }) => ({
              node_id: nodeId,
              poc_weight: pocWeight,
            })),
          },
        ],
      })),
    },
  };
}

/**
 * Hardware payload factory.
 * Groups multiple hardware nodes under the correct participant entry.
 */
function makeHardwarePayload(
  nodes: Array<{
    participant: string;
    nodeId: string;
    status: string;
    hardware: Array<{ type: string; count: number }>;
  }>
) {
  const byParticipant = new Map<
    string,
    Array<{ nodeId: string; status: string; hardware: Array<{ type: string; count: number }> }>
  >();
  for (const n of nodes) {
    if (!byParticipant.has(n.participant)) byParticipant.set(n.participant, []);
    byParticipant.get(n.participant)!.push({
      nodeId: n.nodeId,
      status: n.status,
      hardware: n.hardware,
    });
  }

  return {
    nodes: Array.from(byParticipant.entries()).map(([participant, hwNodes]) => ({
      participant,
      hardware_nodes: hwNodes.map(({ nodeId, status, hardware }) => ({
        local_id: nodeId,
        status,
        hardware,
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/gpu-weights', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. Happy path – live data returned
  it('returns live data with source "live" when both APIs succeed', async () => {
    const participants = makeParticipantsPayload([
      { index: 'participant1', nodes: [{ nodeId: 'node1', pocWeight: 300 }] },
    ]);
    const hardware = makeHardwarePayload([
      {
        participant: 'participant1',
        nodeId: 'node1',
        status: 'INFERENCE',
        hardware: [{ type: 'NVIDIA H100 | 80GB', count: 8 }],
      },
    ]);

    mockedFetch
      .mockResolvedValueOnce(mockResponse(participants))
      .mockResolvedValueOnce(mockResponse(hardware));

    const response = await GET();
    const body = await response.json();

    expect(body.source).toBe('live');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.fetchedAt).toBeDefined();
  });

  // 2. Efficiency calculation
  it('calculates efficiency correctly from known weight and GPU price', async () => {
    const pocWeight = 400;
    const gpuCount = 8;
    const participants = makeParticipantsPayload([
      { index: 'p1', nodes: [{ nodeId: 'n1', pocWeight }] },
    ]);
    const hardware = makeHardwarePayload([
      {
        participant: 'p1',
        nodeId: 'n1',
        status: 'INFERENCE',
        hardware: [{ type: 'NVIDIA A100 | 80GB', count: gpuCount }],
      },
    ]);

    mockedFetch
      .mockResolvedValueOnce(mockResponse(participants))
      .mockResolvedValueOnce(mockResponse(hardware));

    const response = await GET();
    const body = await response.json();
    const a100 = body.data.find((d: { name: string }) => d.name === 'A100');

    expect(a100).toBeDefined();

    // weightPerGpu = totalWeight / totalCount = pocWeight / gpuCount
    const expectedWeightPerGpu = pocWeight / gpuCount;
    const expectedEfficiency = expectedWeightPerGpu / GPU_PRICING['A100'];

    expect(a100.weight).toBeCloseTo(expectedWeightPerGpu, 5);
    expect(a100.efficiency).toBeCloseTo(expectedEfficiency, 5);
    expect(a100.pricePerHour).toBe(GPU_PRICING['A100']);
  });

  // 3. Aggregates multiple variants of the same GPU type
  it('aggregates multiple hardware string variants of the same GPU type into one entry', async () => {
    const participants = makeParticipantsPayload([
      {
        index: 'p1',
        nodes: [
          { nodeId: 'n1', pocWeight: 200 },
          { nodeId: 'n2', pocWeight: 400 },
        ],
      },
    ]);
    const hardware = makeHardwarePayload([
      {
        participant: 'p1',
        nodeId: 'n1',
        status: 'INFERENCE',
        hardware: [{ type: 'NVIDIA A100 | 80GB', count: 8 }],
      },
      {
        participant: 'p1',
        nodeId: 'n2',
        status: 'INFERENCE',
        hardware: [{ type: 'NVIDIA A100 SXM4 | 80GB', count: 8 }],
      },
    ]);

    mockedFetch
      .mockResolvedValueOnce(mockResponse(participants))
      .mockResolvedValueOnce(mockResponse(hardware));

    const response = await GET();
    const body = await response.json();

    // Both variants collapse into a single A100 entry
    const a100Entries = body.data.filter((d: { name: string }) => d.name === 'A100');
    expect(a100Entries).toHaveLength(1);

    // totalWeight = 200 + 400 = 600, totalCount = 8 + 8 = 16
    const expectedWeightPerGpu = (200 + 400) / (8 + 8);
    expect(a100Entries[0].weight).toBeCloseTo(expectedWeightPerGpu, 5);
  });

  // 4. Filters nodes at or below MIN_POC_WEIGHT_THRESHOLD (100)
  it('excludes nodes with poc_weight at or below threshold 100 (strictly > is required)', async () => {
    const participants = makeParticipantsPayload([
      {
        index: 'p1',
        nodes: [
          { nodeId: 'n1', pocWeight: 100 }, // exactly at threshold – excluded (strictly >)
          { nodeId: 'n2', pocWeight: 50 },  // below threshold – excluded
        ],
      },
    ]);
    const hardware = makeHardwarePayload([
      {
        participant: 'p1',
        nodeId: 'n1',
        status: 'INFERENCE',
        hardware: [{ type: 'NVIDIA H100 | 80GB', count: 8 }],
      },
      {
        participant: 'p1',
        nodeId: 'n2',
        status: 'INFERENCE',
        hardware: [{ type: 'NVIDIA H100 | 80GB', count: 8 }],
      },
    ]);

    mockedFetch
      .mockResolvedValueOnce(mockResponse(participants))
      .mockResolvedValueOnce(mockResponse(hardware));

    const response = await GET();
    const body = await response.json();

    // No valid node weights → falls back to static data
    expect(body.source).toBe('fallback');
  });

  // 4b. A node just above the threshold IS included
  it('includes nodes with poc_weight strictly above the threshold (101)', async () => {
    const participants = makeParticipantsPayload([
      { index: 'p1', nodes: [{ nodeId: 'n1', pocWeight: 101 }] },
    ]);
    const hardware = makeHardwarePayload([
      {
        participant: 'p1',
        nodeId: 'n1',
        status: 'INFERENCE',
        hardware: [{ type: 'NVIDIA H100 | 80GB', count: 8 }],
      },
    ]);

    mockedFetch
      .mockResolvedValueOnce(mockResponse(participants))
      .mockResolvedValueOnce(mockResponse(hardware));

    const response = await GET();
    const body = await response.json();

    expect(body.source).toBe('live');
    expect(body.data.some((d: { name: string }) => d.name === 'H100')).toBe(true);
  });

  // 5. Only INFERENCE status nodes are processed
  it('skips hardware nodes whose status is not INFERENCE', async () => {
    const participants = makeParticipantsPayload([
      { index: 'p1', nodes: [{ nodeId: 'n1', pocWeight: 300 }] },
    ]);
    const hardware = makeHardwarePayload([
      {
        participant: 'p1',
        nodeId: 'n1',
        status: 'OFFLINE', // not INFERENCE
        hardware: [{ type: 'NVIDIA H100 | 80GB', count: 8 }],
      },
    ]);

    mockedFetch
      .mockResolvedValueOnce(mockResponse(participants))
      .mockResolvedValueOnce(mockResponse(hardware));

    const response = await GET();
    const body = await response.json();

    // No INFERENCE nodes → no data calculated → fallback
    expect(body.source).toBe('fallback');
  });

  // 6. Unknown GPU type is ignored
  it('ignores hardware types that do not match any known GPU (e.g. NVIDIA T4)', async () => {
    const participants = makeParticipantsPayload([
      { index: 'p1', nodes: [{ nodeId: 'n1', pocWeight: 300 }] },
    ]);
    const hardware = makeHardwarePayload([
      {
        participant: 'p1',
        nodeId: 'n1',
        status: 'INFERENCE',
        hardware: [{ type: 'NVIDIA T4 | 16GB', count: 8 }],
      },
    ]);

    mockedFetch
      .mockResolvedValueOnce(mockResponse(participants))
      .mockResolvedValueOnce(mockResponse(hardware));

    const response = await GET();
    const body = await response.json();

    // T4 is not in GPU_PRICING → extractGpuType returns null → no data → fallback
    expect(body.source).toBe('fallback');
    expect(body.data).toEqual(gpuEfficiencyData);
  });

  // 7. B200 gets isEstimated: true
  it('sets isEstimated to true for B200 entries', async () => {
    const participants = makeParticipantsPayload([
      { index: 'p1', nodes: [{ nodeId: 'n1', pocWeight: 500 }] },
    ]);
    const hardware = makeHardwarePayload([
      {
        participant: 'p1',
        nodeId: 'n1',
        status: 'INFERENCE',
        hardware: [{ type: 'NVIDIA B200 | 192GB', count: 8 }],
      },
    ]);

    mockedFetch
      .mockResolvedValueOnce(mockResponse(participants))
      .mockResolvedValueOnce(mockResponse(hardware));

    const response = await GET();
    const body = await response.json();
    const b200 = body.data.find((d: { name: string }) => d.name === 'B200');

    expect(b200).toBeDefined();
    expect(b200.isEstimated).toBe(true);
  });

  // 7b. Non-B200 entries do NOT have isEstimated: true
  it('does not set isEstimated for H100 entries', async () => {
    const participants = makeParticipantsPayload([
      { index: 'p1', nodes: [{ nodeId: 'n1', pocWeight: 500 }] },
    ]);
    const hardware = makeHardwarePayload([
      {
        participant: 'p1',
        nodeId: 'n1',
        status: 'INFERENCE',
        hardware: [{ type: 'NVIDIA H100 | 80GB', count: 8 }],
      },
    ]);

    mockedFetch
      .mockResolvedValueOnce(mockResponse(participants))
      .mockResolvedValueOnce(mockResponse(hardware));

    const response = await GET();
    const body = await response.json();
    const h100 = body.data.find((d: { name: string }) => d.name === 'H100');

    expect(h100).toBeDefined();
    expect(h100.isEstimated).toBe(false);
  });

  // 8. Fallback when fetchWithTimeout throws
  it('returns fallback data with source "fallback" and error field when fetch throws', async () => {
    mockedFetch.mockRejectedValue(new Error('Network error'));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.source).toBe('fallback');
    expect(body.error).toBe('Network error');
    expect(body.data).toEqual(gpuEfficiencyData);
    expect(body.fetchedAt).toBeDefined();
  });

  // 9. Fallback when one API response is not ok
  it('returns fallback data when a response has ok: false', async () => {
    mockedFetch
      .mockResolvedValueOnce(mockResponse(null, false)) // participants not ok
      .mockResolvedValueOnce(mockResponse({}, true));

    const response = await GET();
    const body = await response.json();

    expect(body.source).toBe('fallback');
    expect(body.error).toBeDefined();
    expect(body.data).toEqual(gpuEfficiencyData);
  });

  // 10. Fallback when APIs return valid JSON but no GPU data matches
  it('falls back to static data when APIs succeed but no GPU data can be calculated', async () => {
    const participants = makeParticipantsPayload([
      { index: 'p1', nodes: [{ nodeId: 'n1', pocWeight: 300 }] },
    ]);
    const hardware = { nodes: [] }; // empty – no hardware nodes at all

    mockedFetch
      .mockResolvedValueOnce(mockResponse(participants))
      .mockResolvedValueOnce(mockResponse(hardware));

    const response = await GET();
    const body = await response.json();

    expect(body.source).toBe('fallback');
    expect(body.reason).toBe('No GPU data calculated from network');
    expect(body.data).toEqual(gpuEfficiencyData);
  });

  // 11a. Cache-Control header for live data
  it('sets correct Cache-Control header for live responses', async () => {
    const participants = makeParticipantsPayload([
      { index: 'p1', nodes: [{ nodeId: 'n1', pocWeight: 300 }] },
    ]);
    const hardware = makeHardwarePayload([
      {
        participant: 'p1',
        nodeId: 'n1',
        status: 'INFERENCE',
        hardware: [{ type: 'NVIDIA H100 | 80GB', count: 8 }],
      },
    ]);

    mockedFetch
      .mockResolvedValueOnce(mockResponse(participants))
      .mockResolvedValueOnce(mockResponse(hardware));

    const response = await GET();
    const cacheControl = response.headers.get('Cache-Control');

    expect(cacheControl).toContain(`s-maxage=${GPU_WEIGHTS_CACHE_DURATION}`);
    expect(cacheControl).toContain('stale-while-revalidate');
  });

  // 11b. Cache-Control: no-cache for fallback triggered by fetch error
  it('sets Cache-Control: no-cache for fallback responses caused by fetch errors', async () => {
    mockedFetch.mockRejectedValue(new Error('timeout'));

    const response = await GET();
    const cacheControl = response.headers.get('Cache-Control');

    expect(cacheControl).toBe('no-cache');
  });

  // 11c. Cache-Control: no-cache when fallback triggered by empty calculated data
  it('sets Cache-Control: no-cache when fallback is triggered by empty data result', async () => {
    const participants = makeParticipantsPayload([
      { index: 'p1', nodes: [{ nodeId: 'n1', pocWeight: 300 }] },
    ]);
    const hardware = { nodes: [] };

    mockedFetch
      .mockResolvedValueOnce(mockResponse(participants))
      .mockResolvedValueOnce(mockResponse(hardware));

    const response = await GET();
    const cacheControl = response.headers.get('Cache-Control');

    expect(cacheControl).toBe('no-cache');
  });

  // 12. Participants without ml_nodes are skipped gracefully
  it('handles participants missing ml_nodes without throwing', async () => {
    const participants = {
      active_participants: {
        participants: [
          { index: 'p1', weight: 500 }, // no ml_nodes field at all
          {
            index: 'p2',
            weight: 500,
            ml_nodes: [{ ml_nodes: [{ node_id: 'n2', poc_weight: 300 }] }],
          },
        ],
      },
    };
    const hardware = makeHardwarePayload([
      {
        participant: 'p2',
        nodeId: 'n2',
        status: 'INFERENCE',
        hardware: [{ type: 'NVIDIA H200 | 141GB', count: 8 }],
      },
    ]);

    mockedFetch
      .mockResolvedValueOnce(mockResponse(participants))
      .mockResolvedValueOnce(mockResponse(hardware));

    const response = await GET();
    const body = await response.json();

    // p1 is skipped silently; p2 contributes valid H200 data
    expect(body.source).toBe('live');
    expect(body.data.some((d: { name: string }) => d.name === 'H200')).toBe(true);
  });

  // Bonus: result is sorted by efficiency descending
  it('returns data sorted by efficiency descending', async () => {
    // Two GPUs with different weights → different efficiency ratios
    const participants = makeParticipantsPayload([
      {
        index: 'p1',
        nodes: [
          { nodeId: 'n1', pocWeight: 500 }, // H100 node
          { nodeId: 'n2', pocWeight: 200 }, // H200 node
        ],
      },
    ]);
    const hardware = makeHardwarePayload([
      {
        participant: 'p1',
        nodeId: 'n1',
        status: 'INFERENCE',
        hardware: [{ type: 'NVIDIA H100 | 80GB', count: 8 }],
      },
      {
        participant: 'p1',
        nodeId: 'n2',
        status: 'INFERENCE',
        hardware: [{ type: 'NVIDIA H200 | 141GB', count: 8 }],
      },
    ]);

    mockedFetch
      .mockResolvedValueOnce(mockResponse(participants))
      .mockResolvedValueOnce(mockResponse(hardware));

    const response = await GET();
    const body = await response.json();

    const efficiencies: number[] = body.data.map((d: { efficiency: number }) => d.efficiency);
    for (let i = 1; i < efficiencies.length; i++) {
      expect(efficiencies[i - 1]).toBeGreaterThanOrEqual(efficiencies[i]);
    }
  });
});
