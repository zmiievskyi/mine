/**
 * GPU Efficiency Data
 * Hardcoded efficiency information for GPU comparison
 */

export interface GpuEfficiency {
  name: string;
  weight: number;
  pricePerHour: number;
  efficiency: number;
  isEstimated?: boolean;
}

/**
 * Static GPU efficiency data (fallback weights from Gonka network)
 * Efficiency = weight / pricePerHour (higher = better value)
 * Note: B200 uses estimated pricing for efficiency calculation
 */
export const gpuEfficiencyData: GpuEfficiency[] = [
  { name: 'A100', weight: 100.593, pricePerHour: 0.99, efficiency: 101.61 },
  { name: 'H100', weight: 305.655, pricePerHour: 1.80, efficiency: 169.81 },
  { name: 'H200', weight: 240.674, pricePerHour: 2.40, efficiency: 100.28 },
  { name: 'B200', weight: 307.853, pricePerHour: 3.02, efficiency: 101.94, isEstimated: true },
];

// Sort by efficiency (highest first) and find best value
export const sortedByEfficiency = [...gpuEfficiencyData].sort(
  (a, b) => b.efficiency - a.efficiency
);

export const maxEfficiency = sortedByEfficiency[0]?.efficiency ?? 1;
export const bestValueGpu = sortedByEfficiency[0]?.name;
