import type { FrontendDistrict } from "../types/api";
import type { LayerKey } from "../types/ui";

export const LAYER_OPTIONS: { value: LayerKey; label: string; description: string }[] = [
  {
    value: "accessibility",
    label: "Accessibility score",
    description: "Predicted baseline accessibility index (higher is better)."
  },
  {
    value: "travel_time",
    label: "Travel time",
    description: "Estimated travel-time proxy in minutes (lower is better)."
  },
  {
    value: "2sfca",
    label: "2SFCA score",
    description: "Two-step floating catchment area access indicator."
  },
  {
    value: "risk",
    label: "Underserved risk",
    description: "Current underserved classification from model output."
  },
  {
    value: "priority",
    label: "Priority action",
    description: "Planning urgency derived from district ranking."
  }
];

export function mapLayerValue(row: FrontendDistrict, layer: LayerKey): number {
  if (layer === "travel_time") return row.travelTimeMin;
  if (layer === "2sfca") return row.score2sfca;
  if (layer === "risk") return row.underserved;
  if (layer === "priority") return Number((row as FrontendDistrict & { priorityScore?: number }).priorityScore || 0);
  return row.accessibilityScore;
}

