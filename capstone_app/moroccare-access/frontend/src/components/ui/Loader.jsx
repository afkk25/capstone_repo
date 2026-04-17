export function Spinner({ size = "md", className = "" }) {
  const sizeMap = {
    sm: "h-3.5 w-3.5",
    md: "h-5 w-5",
    lg: "h-7 w-7"
  };
  return <span className={`inline-block rounded-full border-2 border-slate-400 border-t-transparent animate-spin ${sizeMap[size] || sizeMap.md} ${className}`} />;
}

export function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-xl bg-slate-200/70 ${className}`} />;
}

export default function Loader({ label = "Loading...", className = "" }) {
  return (
    <div className={`inline-flex items-center gap-2 text-sm text-slate-600 ${className}`}>
      <Spinner />
      <span>{label}</span>
    </div>
  );
}
