import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { exportCityReport } from "../api/simulations";
import { useToast } from "../hooks/useToast";
import { useI18n } from "../i18n/I18nProvider";
import { sideClass } from "../utils/rtl";

export default function ExportButton({ cityId, compact = false }) {
  const { push } = useToast();
  const { t, isRtl } = useI18n();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const exportMutation = useMutation({
    mutationFn: ({ id, format }) => exportCityReport(id, format),
    onSuccess: () => push(t("export.started"), "success"),
    onError: (e) => push(e?.detail || e?.message || "Export failed.", "error")
  });

  const doExport = async (format) => {
    if (!cityId) return;
    try {
      await exportMutation.mutateAsync({ id: cityId, format });
    } finally {
      setOpen(false);
    }
  };

  useEffect(() => {
    if (!open) return undefined;
    const onClickAway = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, [open]);

  const wrapperClass = compact
    ? "relative"
    : "relative rounded-2xl border border-slate-200 bg-white p-4 shadow-sm";
  const buttonClass = compact
    ? "inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
    : "w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 py-2.5 text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div ref={wrapperRef} className={wrapperClass}>
      <button
        className={buttonClass}
        onClick={() => setOpen((v) => !v)}
        disabled={!cityId || exportMutation.isPending}
      >
        {exportMutation.isPending && <span className="inline-block h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" />}
        {exportMutation.isPending ? t("export.exporting") : t("export.button")}
      </button>
      {open && !exportMutation.isPending && (
        <div
          className={`absolute z-20 mt-2 rounded-xl border border-slate-200 bg-white shadow-md ${compact ? "w-44" : "w-[calc(100%-2rem)]"} ${sideClass(
            isRtl,
            "right-0",
            "left-0"
          )}`}
        >
          <button className={`w-full px-3 py-2.5 transition-all duration-200 hover:bg-slate-50 ${isRtl ? "text-right" : "text-left"}`} onClick={() => doExport("pdf")}>
            {t("export.pdf")}
          </button>
          <button className={`w-full px-3 py-2.5 transition-all duration-200 hover:bg-slate-50 ${isRtl ? "text-right" : "text-left"}`} onClick={() => doExport("excel")}>
            {t("export.excel")}
          </button>
        </div>
      )}
    </div>
  );
}
