"use client";

import { createContext, useContext, useCallback, useSyncExternalStore, type ReactNode } from "react";

export interface CartItem {
  releaseId?: number;
  trackId?: number;
  catalogPurchase?: boolean;
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
  isInCart: (item: { releaseId?: number; trackId?: number; catalogPurchase?: boolean }) => boolean;
  hasCatalog: boolean;
}

const CartContext = createContext<CartContextType | null>(null);

const CART_KEY = "party-pupils-cart";

function cartItemKey(item: { releaseId?: number; trackId?: number; catalogPurchase?: boolean }): string {
  if (item.catalogPurchase) return "catalog";
  return item.releaseId ? `release-${item.releaseId}` : `track-${item.trackId}`;
}

let listeners: (() => void)[] = [];
let snapshot: CartItem[] = [];

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

  const hasCatalog = items.some((i) => i.catalogPurchase);

  const isInCart = useCallback(
    (item: { releaseId?: number; trackId?: number; catalogPurchase?: boolean }) => {
      if (item.catalogPurchase) return hasCatalog;
      if (hasCatalog) return true;
      const key = cartItemKey(item);
      return items.some((i) => cartItemKey(i) === key);
    },
    [items, hasCatalog]
  );

  const addItem = useCallback((item: CartItem) => {
    if (item.catalogPurchase) {
      emitChange([item]);
      return;
    }
    if (items.some((i) => i.catalogPurchase)) return;
    const key = cartItemKey(item);
    if (items.some((i) => cartItemKey(i) === key)) return;
    emitChange([...items, item]);
  }, [items]);

  const removeItem = useCallback((item: { releaseId?: number; trackId?: number; catalogPurchase?: boolean }) => {
    const key = cartItemKey(item);
    emitChange(items.filter((i) => cartItemKey(i) !== key));
  }, [items]);

  const clearCart = useCallback(() => {
    emitChange([]);
  }, []);

  const total = items.reduce((sum, i) => sum + i.price, 0);

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, clearCart, itemCount: items.length, total, isInCart, hasCatalog }}
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
