"use client";

import { useCart, type CartItem } from "./CartProvider";
import { Button } from "@/components/ui/button";

interface AddToCartButtonProps {
  item: CartItem;
}

export function AddToCartButton({ item }: AddToCartButtonProps) {
  const { addItem, removeItem, isInCart } = useCart();
  const inCart = isInCart(item);

  if (inCart) {
    return (
      <Button variant="secondary" onClick={() => removeItem(item)}>
        Remove from Cart
      </Button>
    );
  }

  return (
    <Button onClick={() => addItem(item)}>
      Add to Cart
    </Button>
  );
}
