import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import SectionCard from "./layout/SectionCard";
import { useI18n } from "../i18n/I18nProvider";
import { swapChartMargin, toLocaleNumber } from "../utils/rtl";

export default function ChartsPanel({ topRows = [], bottomRows = [], distributionRows = [], underservedCount = 0, servedCount = 0 }) {
  const { isRtl, language } = useI18n();
  return (
    <SectionCard title="Comparison charts" subtitle="District-level quick insights">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rtl-chart h-60 rounded-xl border border-slate-200 p-2">
          <div className="mb-2 text-xs font-medium text-slate-600">Top / bottom districts</div>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={[...topRows, ...bottomRows]} margin={swapChartMargin(isRtl, { top: 8, right: 12, left: 12, bottom: 8 })}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="districtName" hide />
              <YAxis tickFormatter={(value) => toLocaleNumber(value, language)} />
              <Tooltip
                contentStyle={{ direction: isRtl ? "rtl" : "ltr", textAlign: isRtl ? "right" : "left" }}
                formatter={(value) => toLocaleNumber(value, language)}
              />
              <Bar dataKey="accessibilityScore">
                {[...topRows, ...bottomRows].map((row) => (
                  <Cell key={row.id} fill={row.underserved ? "#ef4444" : "#22c55e"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rtl-chart h-60 rounded-xl border border-slate-200 p-2">
          <div className="mb-2 text-xs font-medium text-slate-600">Accessibility distribution</div>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={distributionRows} margin={swapChartMargin(isRtl, { top: 8, right: 12, left: 12, bottom: 8 })}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="bucket" hide />
              <YAxis tickFormatter={(value) => toLocaleNumber(value, language)} />
              <Tooltip
                contentStyle={{ direction: isRtl ? "rtl" : "ltr", textAlign: isRtl ? "right" : "left" }}
                formatter={(value) => toLocaleNumber(value, language)}
              />
              <Bar dataKey="count" fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rtl-chart h-60 rounded-xl border border-slate-200 p-2">
          <div className="mb-2 text-xs font-medium text-slate-600">Served vs underserved</div>
          <ResponsiveContainer width="100%" height="90%">
            <PieChart>
              <Pie
                data={[
                  { name: "Underserved", value: underservedCount },
                  { name: "Served", value: servedCount }
                ]}
                dataKey="value"
                outerRadius={70}
                innerRadius={38}
              >
                <Cell fill="#ef4444" />
                <Cell fill="#22c55e" />
              </Pie>
              <Tooltip
                contentStyle={{ direction: isRtl ? "rtl" : "ltr", textAlign: isRtl ? "right" : "left" }}
                formatter={(value) => toLocaleNumber(value, language)}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </SectionCard>
  );
}

