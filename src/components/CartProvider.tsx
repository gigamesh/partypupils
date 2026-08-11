"use client";

import { createContext, useContext, useCallback, useSyncExternalStore, type ReactNode } from "react";
import {
  addCartItem,
  bundleConflict,
  cartItemKey,
  coverageOf,
  hasCatalog as hasCatalogItem,
  isItemInCart,
  removeCartItem,
  type CartItem,
  type CartItemRef,
  type Coverage,
} from "@/lib/cart-rules";

export type { CartItem, CartItemRef, Coverage };

interface CartContextType {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (item: CartItemRef) => void;
  clearCart: () => void;
  itemCount: number;
  total: number;
  isInCart: (item: CartItemRef) => boolean;
  /** Why an item already counts as bought — lets the UI distinguish "in your cart" from "included in a bundle". */
  coverage: (item: CartItemRef) => Coverage | null;
  /** Why a bundle can't be added right now, or null if it can. */
  conflictFor: (bundle: { bundleId: string; bundleReleaseIds: number[] }) => "catalog" | "overlap" | null;
  hasCatalog: boolean;
}

const CartContext = createContext<CartContextType | null>(null);

const CART_KEY = "party-pupils-cart";

let listeners: (() => void)[] = [];
let snapshot: CartItem[] = [];
if (typeof window !== "undefined") {
  try {
    const stored = localStorage.getItem(CART_KEY);
    if (stored) snapshot = JSON.parse(stored);
  } catch {}
}

function getSnapshot(): CartItem[] {
  return snapshot;
}

const EMPTY_CART: CartItem[] = [];

function getServerSnapshot(): CartItem[] {
  return EMPTY_CART;
}

function subscribe(listener: () => void) {
  listeners = [...listeners, listener];
  // Load from localStorage on first subscribe (client only)
  try {
    const stored = localStorage.getItem(CART_KEY);
    if (stored) snapshot = JSON.parse(stored);
  } catch {}
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function emitChange(items: CartItem[]) {
  snapshot = items;
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  for (const listener of listeners) listener();
}

export function CartProvider({ children }: { children: ReactNode }) {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const hasCatalog = hasCatalogItem(items);

  const isInCart = useCallback((item: CartItemRef) => isItemInCart(items, item), [items]);

  const coverage = useCallback((item: CartItemRef) => coverageOf(items, item), [items]);

  const conflictFor = useCallback(
    (bundle: { bundleId: string; bundleReleaseIds: number[] }) => bundleConflict(items, bundle),
    [items],
  );

  const addItem = useCallback((item: CartItem) => {
    const next = addCartItem(items, item);
    // The rules return the same array when the add is a no-op.
    if (next !== items) emitChange(next);
  }, [items]);

  const removeItem = useCallback((item: CartItemRef) => {
    emitChange(removeCartItem(items, item));
  }, [items]);

  const clearCart = useCallback(() => {
    emitChange([]);
  }, []);

  const total = items.reduce((sum, i) => sum + i.price, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        clearCart,
        itemCount: items.length,
        total,
        isInCart,
        coverage,
        conflictFor,
        hasCatalog,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

export { cartItemKey };
