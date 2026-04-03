"use client";

import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/components/CartProvider";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";
import { useState } from "react";

export default function CartPage() {
  const { items, removeItem, total } = useCart();
  const [loading, setLoading] = useState(false);

  async function handleCheckout() {
    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: items.map((i) => i.productId) }),
      });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch {
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center">
        <h1 className="text-3xl font-bold mb-4">Your Cart</h1>
        <p className="text-muted-foreground mb-6">Your cart is empty.</p>
        <Link href="/store" className={cn(buttonVariants())}>
          Browse Music
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-bold mb-8">Your Cart</h1>
      <div className="space-y-4">
        {items.map((item) => (
          <div
            key={item.productId}
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
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xl text-muted-foreground">
                  ♪
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <Link
                href={`/store/${item.slug}`}
                className="font-medium text-sm hover:underline"
              >
                {item.name}
              </Link>
              <p className="text-sm text-muted-foreground">
                {formatCurrency(item.price)}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeItem(item.productId)}
            >
              Remove
            </Button>
          </div>
        ))}
      </div>
      <div className="mt-6 flex items-center justify-between border-t border-border pt-6">
        <p className="text-lg font-semibold">Total: {formatCurrency(total)}</p>
        <Button onClick={handleCheckout} disabled={loading} size="lg">
          {loading ? "Redirecting..." : "Checkout"}
        </Button>
      </div>
    </div>
  );
}
