const variantMap = {
  primary: "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-300",
  success: "bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-300",
  danger: "bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-300",
  neutral: "bg-slate-200 text-slate-800 hover:bg-slate-300 focus:ring-slate-300",
  outline: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 focus:ring-slate-300"
};

export default function Button({
  children,
  className = "",
  variant = "primary",
  loading = false,
  disabled = false,
  ...props
}) {
  const isDisabled = disabled || loading;
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 active:scale-[0.99] focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${variantMap[variant] || variantMap.primary} ${className}`}
      disabled={isDisabled}
      {...props}
    >
      {loading && <span className="inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />}
      {children}
    </button>
  );
}
