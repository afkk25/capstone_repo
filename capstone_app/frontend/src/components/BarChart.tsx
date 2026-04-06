type BarChartItem = {
  label: string;
  value: number;
};

type Props = {
  title: string;
  data: BarChartItem[];
};

export default function BarChart({ title, data }: Props) {
  const maxValue = Math.max(...data.map((item) => item.value), 1);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-slate-800">{title}</h2>
      <div className="space-y-3">
        {data.map((item) => {
          const widthPct = Math.max((item.value / maxValue) * 100, 2);
          return (
            <div key={item.label}>
              <div className="mb-1 flex items-center justify-between text-sm text-slate-600">
                <span>{item.label}</span>
                <span>{item.value.toFixed(1)}</span>
              </div>
              <div className="h-3 w-full rounded bg-slate-100">
                <div
                  className="h-3 rounded bg-blue-500"
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

