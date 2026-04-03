"use client";

import { useEffect } from "react";
import { useCart } from "@/components/CartProvider";

export function ClearCart() {
  const { clearCart } = useCart();
  useEffect(() => {
    clearCart();
  }, [clearCart]);
  return null;
}
