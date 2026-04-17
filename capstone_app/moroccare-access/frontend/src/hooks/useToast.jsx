import { createContext, useCallback, useContext, useMemo, useState } from "react";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const remove = useCallback((id) => setItems((prev) => prev.filter((x) => x.id !== id)), []);

  const push = useCallback((message, type = "error") => {
    const id = `${Date.now()}-${Math.random()}`;
    setItems((prev) => [...prev, { id, message, type }]);
    setTimeout(() => remove(id), 3500);
  }, [remove]);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed top-4 right-4 z-[1300] space-y-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={`px-3 py-2 rounded shadow text-sm text-white ${t.type === "error" ? "bg-red-600" : "bg-emerald-600"}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
