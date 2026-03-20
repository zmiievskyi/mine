import { NextResponse } from 'next/server';
import { gpuEfficiencyData, type GpuEfficiency } from '@/data/efficiency';
import {
  GONKA_ENDPOINTS,
  GPU_PRICING,
  GPU_WEIGHTS_CACHE_DURATION,
  MIN_POC_WEIGHT_THRESHOLD,
} from '@/lib/gonka/constants';
import { fetchWithTimeout } from '@/lib/gonka/fetch';

interface MlNode {
  node_id: string;
  poc_weight: number;
}

interface MlNodeGroup {
  ml_nodes: MlNode[];
}

interface Participant {
  index: string;
  weight: number;
  ml_nodes?: MlNodeGroup[];
}

interface ParticipantData {
  active_participants?: {
    participants?: Participant[];
  };
}

interface Hardware {
  type: string; // e.g., "NVIDIA H200 | 140GB"
  count: number;
}

interface HardwareNode {
  local_id: string;
  status: string;
  hardware?: Hardware[];
}

interface ParticipantHardware {
  participant: string;
  hardware_nodes?: HardwareNode[];
}

interface HardwareNodesData {
  nodes?: ParticipantHardware[];
}

function extractGpuType(hardwareType: string): string | null {
  // Hardware type format: "NVIDIA H200 | 140GB"
  if (hardwareType.includes('A100')) return 'A100';
  if (hardwareType.includes('H100')) return 'H100';
  if (hardwareType.includes('H200')) return 'H200';
  if (hardwareType.includes('B200')) return 'B200';
  return null;
}

export async function GET() {
  try {
    const [participantsRes, hardwareRes] = await Promise.all([
      fetchWithTimeout(GONKA_ENDPOINTS.participants, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      }),
      fetchWithTimeout(GONKA_ENDPOINTS.hardwareNodes, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      }),
    ]);

    if (!participantsRes.ok || !hardwareRes.ok) {
      throw new Error('Failed to fetch data from Gonka network');
    }

    const participantsData: ParticipantData = await participantsRes.json();
    const hardwareData: HardwareNodesData = await hardwareRes.json();

    // Step 1: Build node participants map
    // Maps participant_address -> node_id -> poc_weight
    const nodeParticipants = new Map<string, Map<string, number>>();

    const participants = participantsData.active_participants?.participants ?? [];
    for (const participant of participants) {
      if (!participant.ml_nodes) continue;

      for (const mlNodeGroup of participant.ml_nodes) {
        for (const node of mlNodeGroup.ml_nodes ?? []) {
          if (node.poc_weight > MIN_POC_WEIGHT_THRESHOLD) {
            if (!nodeParticipants.has(participant.index)) {
              nodeParticipants.set(participant.index, new Map());
            }
            nodeParticipants.get(participant.index)!.set(node.node_id, node.poc_weight);
          }
        }
      }
    }

    // Step 2: Process hardware nodes
    // Build: nodesHwList (GPU type -> count) and nodesHwDict (participant -> node_id -> hardware)
    const nodesHwList = new Map<string, { count: number }>();
    const nodesHwDict = new Map<string, Map<string, Hardware[]>>();

    const hardwareNodes = hardwareData.nodes ?? [];
    for (const info of hardwareNodes) {
      const address = info.participant;

      // Skip if participant doesn't have valid nodes
      if (!nodeParticipants.has(address)) continue;

      nodesHwDict.set(address, new Map());

      for (const node of info.hardware_nodes ?? []) {
        // Only include INFERENCE nodes
        if (node.status !== 'INFERENCE') continue;

        if (node.hardware) {
          nodesHwDict.get(address)!.set(node.local_id, node.hardware);

          for (const hw of node.hardware) {
            const current = nodesHwList.get(hw.type) ?? { count: 0 };
            current.count += hw.count;
            nodesHwList.set(hw.type, current);
          }
        }
      }
    }

    // Step 3: Calculate total weight per GPU type
    const totalHwWeight = new Map<string, number>();

    for (const [participantAddr, nodes] of nodesHwDict) {
      const participantNodes = nodeParticipants.get(participantAddr);
      if (!participantNodes) continue;

      for (const [nodeId, hardwareList] of nodes) {
        const weight = participantNodes.get(nodeId);
        if (weight === undefined) continue;

        for (const hw of hardwareList) {
          const gpuModel = hw.type;
          const currentWeight = totalHwWeight.get(gpuModel) ?? 0;
          totalHwWeight.set(gpuModel, currentWeight + weight);
        }
      }
    }

    // Step 4: Aggregate all variants per GPU type (e.g. all A100 variants combined)
    const aggregatedByGpuType = new Map<string, { totalWeight: number; totalCount: number }>();

    for (const [gpuType, data] of nodesHwList) {
      const totalWeight = totalHwWeight.get(gpuType) ?? 0;
      if (data.count === 0) continue;

      const simplifiedType = extractGpuType(gpuType);
      if (!simplifiedType) continue;

      const existing = aggregatedByGpuType.get(simplifiedType) ?? { totalWeight: 0, totalCount: 0 };
      existing.totalWeight += totalWeight;
      existing.totalCount += data.count;
      aggregatedByGpuType.set(simplifiedType, existing);
    }

    // Build efficiency data from aggregated variants
    const finalData: GpuEfficiency[] = [];

    for (const [gpuType, data] of aggregatedByGpuType) {
      const pricePerHour = GPU_PRICING[gpuType];
      if (!pricePerHour || data.totalCount === 0) continue;

      const weightPerGpu = data.totalWeight / data.totalCount;
      const efficiency = weightPerGpu / pricePerHour;

      finalData.push({
        name: gpuType,
        weight: weightPerGpu,
        pricePerHour,
        efficiency,
        isEstimated: gpuType === 'B200',
      });
    }

    // Sort by efficiency (highest first)
    finalData.sort((a, b) => b.efficiency - a.efficiency);

    // If no data was calculated, fall back to static data
    if (finalData.length === 0) {
      return NextResponse.json(
        {
          data: gpuEfficiencyData,
          fetchedAt: new Date().toISOString(),
          source: 'fallback',
          reason: 'No GPU data calculated from network',
        },
        {
          headers: {
            'Cache-Control': 'no-cache',
          },
        }
      );
    }

    return NextResponse.json(
      {
        data: finalData,
        fetchedAt: new Date().toISOString(),
        source: 'live',
      },
      {
        headers: {
          'Cache-Control': `s-maxage=${GPU_WEIGHTS_CACHE_DURATION}, stale-while-revalidate`,
        },
      }
    );
  } catch (error) {
    console.error('GPU weights API error:', error);

    // Return fallback data
    return NextResponse.json(
      {
        data: gpuEfficiencyData,
        fetchedAt: new Date().toISOString(),
        source: 'fallback',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      {
        status: 200, // Still return 200 with fallback data
        headers: {
          'Cache-Control': 'no-cache',
        },
      }
    );
  }
}
