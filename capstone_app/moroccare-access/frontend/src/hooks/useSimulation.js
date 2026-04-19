import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { runSimulation } from "../api/simulations";

export function useSimulation() {
  const [simulationResult, setSimulationResult] = useState(null);

  const simulationMutation = useMutation({
    mutationFn: ({ cityId, payload }) => runSimulation(cityId, payload),
    onSuccess: (data) => {
      setSimulationResult(data);
    }
  });

  const runScenario = ({ cityId, payload }) => simulationMutation.mutate({ cityId, payload });

  const resetSimulation = () => {
    setSimulationResult(null);
    return { simulationResult: null, isSimulated: false };
  };

  return {
    runScenario,
    resetSimulation,
    simulationResult,
    isSimulated: Boolean(simulationResult),
    isPending: simulationMutation.isPending,
    error: simulationMutation.error
  };
}
