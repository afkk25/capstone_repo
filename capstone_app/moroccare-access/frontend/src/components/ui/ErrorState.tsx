export default function ErrorState({ message = "Something went wrong." }: { message?: string }) {
  return <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{message}</div>;
}

