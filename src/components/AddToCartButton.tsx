"use client";

import { useCart, type CartItem } from "./CartProvider";
import { Button } from "@/components/ui/button";

interface AddToCartButtonProps {
  product: CartItem;
}

export function AddToCartButton({ product }: AddToCartButtonProps) {
  const { items, addItem, removeItem } = useCart();
  const inCart = items.some((i) => i.productId === product.productId);

  if (inCart) {
    return (
      <Button variant="secondary" onClick={() => removeItem(product.productId)}>
        Remove from Cart
      </Button>
    );
  }

  return (
    <Button onClick={() => addItem(product)}>
      Add to Cart
    </Button>
  );
}
