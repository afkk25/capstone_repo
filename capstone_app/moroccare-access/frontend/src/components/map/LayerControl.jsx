import Card from "../ui/Card";
import Button from "../ui/Button";

const OPTIONS = [
  { value: "accessibility", label: "Accessibility" },
  { value: "2sfca", label: "2SFCA" },
  { value: "population", label: "Population density" },
  { value: "facilities", label: "Facilities" },
  { value: "transport", label: "Transport stops" }
];

export default function LayerControl({ activeLayer, onChange }) {
  return (
    <Card title="Map Layer">
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((o) => (
          <Button
            key={o.value}
            variant={activeLayer === o.value ? "primary" : "outline"}
            className="!px-3 !py-1.5 !text-xs"
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </Button>
        ))}
      </div>
    </Card>
  );
}
