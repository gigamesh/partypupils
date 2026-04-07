import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-variants";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-20">
      <h1>404</h1>
      <p className="text-muted-foreground">Page not found.</p>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        Go Home
      </Link>
    </div>
  );
}
