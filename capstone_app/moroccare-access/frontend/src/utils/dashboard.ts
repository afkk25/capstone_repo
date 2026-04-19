import type { FrontendDistrict } from "../types/api";
import type { LayerKey } from "../types/ui";

export const LAYER_OPTIONS: { value: LayerKey; label: string; description: string }[] = [
  {
    value: "accessibility",
    label: "map.accessibilityScore",
    description: "map.accessibilityScore"
  },
  {
    value: "travel_time",
    label: "map.travelTime",
    description: "map.travelTime"
  },
  {
    value: "2sfca",
    label: "details.sfca",
    description: "details.sfca"
  },
  {
    value: "risk",
    label: "details.underserved",
    description: "details.underserved"
  },
  {
    value: "priority",
    label: "map.priority",
    description: "map.priority"
  }
];

export function mapLayerValue(row: FrontendDistrict, layer: LayerKey): number {
  if (layer === "travel_time") return row.travelTimeMin;
  if (layer === "2sfca") return row.score2sfca;
  if (layer === "risk") return row.underserved;
  if (layer === "priority") return Number((row as FrontendDistrict & { priorityScore?: number }).priorityScore || 0);
  return row.accessibilityScore;
}

