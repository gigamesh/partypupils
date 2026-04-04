"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export interface CartItem {
  releaseId?: number;
  trackId?: number;
  name: string;
  slug: string;
  price: number;
  coverImageUrl: string | null;
  releaseName?: string;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (item: CartItem) => void;
  clearCart: () => void;
  itemCount: number;
  total: number;
  isInCart: (item: { releaseId?: number; trackId?: number }) => boolean;
}

const CartContext = createContext<CartContextType | null>(null);

const CART_KEY = "party-pupils-cart";

function cartItemKey(item: { releaseId?: number; trackId?: number }): string {
  return item.releaseId ? `release-${item.releaseId}` : `track-${item.trackId}`;
}

function loadInitialItems(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(CART_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItemsRaw] = useState<CartItem[]>(loadInitialItems);

  const setItems = useCallback((updater: CartItem[] | ((prev: CartItem[]) => CartItem[])) => {
    setItemsRaw((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      localStorage.setItem(CART_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const isInCart = useCallback(
    (item: { releaseId?: number; trackId?: number }) => {
      const key = cartItemKey(item);
      return items.some((i) => cartItemKey(i) === key);
    },
    [items]
  );

  const addItem = useCallback((item: CartItem) => {
    setItems((prev) => {
      const key = cartItemKey(item);
      if (prev.some((i) => cartItemKey(i) === key)) return prev;
      return [...prev, item];
    });
  }, [setItems]);

  const removeItem = useCallback((item: { releaseId?: number; trackId?: number }) => {
    const key = cartItemKey(item);
    setItems((prev) => prev.filter((i) => cartItemKey(i) !== key));
  }, [setItems]);

  const clearCart = useCallback(() => {
    setItems([]);
  }, [setItems]);

  const total = items.reduce((sum, i) => sum + i.price, 0);

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, clearCart, itemCount: items.length, total, isInCart }}
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
