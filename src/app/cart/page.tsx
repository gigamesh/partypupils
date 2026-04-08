"use client";

import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/components/CartProvider";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";
import { useState } from "react";

export default function CartPage() {
  const { items, removeItem, total } = useCart();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCheckout() {
    setLoading(true);
    setError("");
    try {
      const cartItems = items.map((i) => ({
        releaseId: i.releaseId,
        trackId: i.trackId,
        catalogPurchase: i.catalogPurchase,
      }));
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cartItems }),
      });
      if (!res.ok) {
        setError("Checkout failed. Please try again.");
        setLoading(false);
        return;
      }
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center">
        <h1>Your Cart</h1>
        <p className="text-muted-foreground mb-6">Your cart is empty.</p>
        <Link href="/music" className={cn(buttonVariants())}>
          Browse Music
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1>Your Cart</h1>
      <div className="space-y-4">
        {items.map((item) => {
          const key = item.catalogPurchase ? "catalog" : item.releaseId ? `release-${item.releaseId}` : `track-${item.trackId}`;
          return (
            <div
              key={key}
              className="flex items-center gap-4 rounded-lg border border-border p-4"
            >
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded bg-muted">
                {item.coverImageUrl ? (
                  <Image
                    src={item.coverImageUrl}
                    alt={item.name}
                    fill
                    className="object-cover"
                    sizes="64px"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xl text-muted-foreground">
                    ♪
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                {item.catalogPurchase ? (
                  <span className="font-medium text-sm">{item.name}</span>
                ) : (
                  <Link
                    href={`/music/${item.slug}`}
                    className="font-medium text-sm hover:underline"
                  >
                    {item.releaseName ? `${item.releaseName} — ${item.name}` : item.name}
                  </Link>
                )}
                <p className="text-sm text-muted-foreground">
                  {formatCurrency(item.price)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="lg"
                onClick={() => removeItem(item)}
              >
                Remove
              </Button>
            </div>
          );
        })}
      </div>
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      <div className="mt-6 flex items-center justify-between border-t border-border pt-6">
        <p className="text-lg font-semibold">Total: {formatCurrency(total)}</p>
        <Button onClick={handleCheckout} disabled={loading} size="lg">
          {loading ? "Redirecting..." : "Checkout"}
        </Button>
      </div>
    </div>
  );
}
