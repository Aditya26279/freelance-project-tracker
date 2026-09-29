import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="mt-2 text-sm text-slate-600">This page doesn&apos;t exist, or the link has expired.</p>
      <Link href="/" className="btn-secondary mt-6">
        Home
      </Link>
    </div>
  );
}
