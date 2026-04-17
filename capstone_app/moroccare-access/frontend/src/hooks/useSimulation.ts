import { useMutation } from "@tanstack/react-query";
import { runComparison, runSimulation } from "../api/simulations";
import type { SimulationRequest } from "../types/api";

export function useSimulation(onSuccess?: (payload: { simulation: unknown; comparison: unknown }) => void) {
  const compareMutation = useMutation({
    mutationFn: ({ cityId, params }: { cityId: string; params: SimulationRequest }) => runComparison(cityId, params)
  });

  const simulationMutation = useMutation({
    mutationFn: ({ cityId, params }: { cityId: string; params: SimulationRequest }) => runSimulation(cityId, params),
    onSuccess: async (simulation, vars) => {
      try {
        const comparison = await compareMutation.mutateAsync({ cityId: vars.cityId, params: vars.params });
        onSuccess?.({ simulation, comparison });
      } catch {
        // Keep simulation result visible even if comparison request fails.
        onSuccess?.({ simulation, comparison: null });
      }
    }
  });

  return {
    simulationMutation,
    compareMutation
  };
}

