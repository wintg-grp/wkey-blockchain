import Link from "next/link";

export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center px-4 py-24 bg-bg text-text">
      <div className="text-center max-w-lg">
        <div className="display text-[8rem] sm:text-[12rem] text-accent leading-none">404</div>
        <h1 className="display text-3xl sm:text-5xl text-text mt-4">Not found</h1>
        <p className="mt-4 text-text-muted">
          The block, transaction or address you're looking for doesn't exist on this network.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex items-center justify-center px-5 py-2.5 rounded-full bg-accent text-accent-fg font-semibold"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
