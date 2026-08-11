"use client";

import { useCart, type CartItem } from "./CartProvider";
import { Button } from "@/components/ui/button";

interface AddToCartButtonProps {
  item: CartItem;
}

export function AddToCartButton({ item }: AddToCartButtonProps) {
  const { addItem, removeItem, coverage } = useCart();
  const covered = coverage(item);

  // Granted by a bundle or the catalog rather than added directly — there's
  // nothing to remove here, so say why instead of offering a dead button.
  if (covered && covered.kind !== "self") {
    return (
      <Button variant="secondary" disabled>
        {covered.kind === "catalog" ? "Included in catalog" : `Included in ${covered.name}`}
      </Button>
    );
  }

  if (covered) {
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
