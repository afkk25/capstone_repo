import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { runComparison, runSimulation } from "../api/simulations";

function isPointInterventionPayload(payload) {
  return Boolean(payload && typeof payload === "object" && "intervention_type" in payload);
}

export function useSimulation() {
  const [simulationResult, setSimulationResult] = useState(null);
  const [comparisonResult, setComparisonResult] = useState(null);

  const simulationMutation = useMutation({
    mutationFn: ({ cityId, payload }) => runSimulation(cityId, payload),
    onMutate: () => {
      setComparisonResult(null);
    },
    onSuccess: async (data, variables) => {
      setSimulationResult(data);
      if (isPointInterventionPayload(variables.payload)) {
        setComparisonResult(null);
        return;
      }
      try {
        const comparison = await runComparison(variables.cityId, variables.payload);
        setComparisonResult(comparison);
      } catch {
        setComparisonResult(null);
      }
    }
  });

  const runScenario = ({ cityId, payload }) => simulationMutation.mutate({ cityId, payload });

  const resetSimulation = () => {
    setSimulationResult(null);
    setComparisonResult(null);
    return { simulationResult: null, isSimulated: false };
  };

  return {
    runScenario,
    resetSimulation,
    simulationResult,
    comparisonResult,
    isSimulated: Boolean(simulationResult),
    isPending: simulationMutation.isPending,
    error: simulationMutation.error
  };
}
