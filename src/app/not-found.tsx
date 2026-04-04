import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-20">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-muted-foreground">Page not found.</p>
      <Link
        href="/"
        className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-2.5 h-8 text-sm font-medium hover:bg-muted hover:text-foreground transition-all"
      >
        Go Home
      </Link>
    </div>
  );
}
