"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate-600">
        {process.env.NODE_ENV === "development" ? error.message : "The action could not be completed. Please try again."}
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <button onClick={reset} className="btn-primary">
          Try again
        </button>
        <button onClick={() => history.back()} className="btn-secondary">
          Go back
        </button>
      </div>
    </div>
  );
}
