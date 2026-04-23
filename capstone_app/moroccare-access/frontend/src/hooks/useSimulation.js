import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { runSimulation } from "../api/simulations";

export function useSimulation() {
  const [simulationResult, setSimulationResult] = useState(null);
  const [comparisonResult, setComparisonResult] = useState(null);

  const simulationMutation = useMutation({
    mutationFn: ({ cityId, payload }) => runSimulation(cityId, payload),
    onMutate: () => {
      setComparisonResult(null);
    },
    onSuccess: (data) => {
      setSimulationResult(data);
      setComparisonResult(null);
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
