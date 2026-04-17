export default function PageLayout({ topBar, children }) {
  return (
    <div className="app-shell overflow-hidden">
      <div className="fixed inset-x-0 top-0 z-[1100]">{topBar}</div>
      <div className="mx-auto h-full max-w-[1680px] px-3 pb-3 pt-[150px] sm:px-4 sm:pt-[158px] lg:px-6 xl:pt-[116px]">
        <main className="h-full min-h-0 min-w-0 space-y-4 overflow-y-auto pr-1">{children}</main>
      </div>
    </div>
  );
}

