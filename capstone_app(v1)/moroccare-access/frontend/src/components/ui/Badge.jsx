const badgeStyles = {
  neutral: "bg-slate-100 text-slate-700 border-slate-200",
  success: "bg-emerald-100 text-emerald-700 border-emerald-200",
  warning: "bg-amber-100 text-amber-700 border-amber-200",
  danger: "bg-rose-100 text-rose-700 border-rose-200",
  info: "bg-blue-100 text-blue-700 border-blue-200"
};

export default function Badge({ children, tone = "neutral", className = "" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-all duration-200 ${badgeStyles[tone] || badgeStyles.neutral} ${className}`}
    >
      {children}
    </span>
  );
}
