import { useMutation } from "@tanstack/react-query";
import { runSimulation } from "../api/simulations";
import type { SimulationRequest } from "../types/api";

export function useSimulation(onSuccess?: (payload: { simulation: unknown; comparison: unknown }) => void) {
  const compareMutation = useMutation({
    mutationFn: async () => null
  });

  const simulationMutation = useMutation({
    mutationFn: ({ cityId, params }: { cityId: string; params: SimulationRequest }) => runSimulation(cityId, params),
    onSuccess: (simulation) => {
      if (import.meta.env.DEV) {
        console.log("Simulation raw response", simulation);
        console.log("Normalized simulation result", simulation);
      }
      onSuccess?.({ simulation, comparison: null });
    }
  });

  return {
    simulationMutation,
    compareMutation
  };
}

