import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-20">
      <h1>404</h1>
      <p className="text-muted-foreground">Page not found.</p>
      <Button href="/" variant="outline">
        Go Home
      </Button>
    </div>
  );
}
