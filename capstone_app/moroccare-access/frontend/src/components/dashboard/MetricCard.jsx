import Card from "../ui/Card";
import Badge from "../ui/Badge";
import { Skeleton } from "../ui/Loader";

export default function MetricCard({
  title,
  value,
  icon = null,
  tone = "neutral",
  trend = null,
  helper = null,
  loading = false
}) {
  if (loading) {
    return (
      <Card className="h-full">
        <div className="space-y-3">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="h-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs uppercase tracking-wide text-slate-500 font-medium">{title}</div>
        {icon && <div className="text-slate-400">{icon}</div>}
      </div>
      <div className="mt-2 whitespace-nowrap text-2xl font-bold text-slate-900">{value}</div>
      <div className="mt-2 flex items-center gap-2">
        {trend !== null && <Badge tone={tone}>{trend}</Badge>}
        {helper && <span className="text-xs text-slate-500">{helper}</span>}
      </div>
    </Card>
  );
}
