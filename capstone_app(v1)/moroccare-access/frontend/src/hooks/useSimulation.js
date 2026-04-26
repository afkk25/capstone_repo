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
      if (import.meta.env.DEV) {
        console.log("Simulation raw response", data);
      }
      setSimulationResult(data);
      if (import.meta.env.DEV) {
        console.log("Normalized simulation result", data);
      }
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
