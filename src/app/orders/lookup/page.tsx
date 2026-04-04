"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function OrderLookupPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/orders/send-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (res.ok) {
      setSent(true);
    } else if (res.status === 404) {
      setError("No orders found for that email address.");
    } else {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-2xl font-bold mb-4">Check your inbox</h1>
        <p className="text-muted-foreground">
          We sent a link to <span className="font-medium text-foreground">{email}</span>.
          Click it to access your orders and downloads. The link expires in 1 hour.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <h1 className="text-2xl font-bold mb-2">Find Your Orders</h1>
      <p className="text-muted-foreground mb-6">
        Enter the email you used at checkout and we&apos;ll send you a link to access your downloads.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Sending..." : "Send Download Link"}
        </Button>
      </form>
    </div>
  );
}
