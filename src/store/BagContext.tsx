import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ShopRelease } from '../types';

/**
 * The record bag.
 *
 * Just the release ids and quantities a fan has picked — prices and stock always
 * come from the API, so a bag left open overnight can never quote a stale price.
 * Persisted to localStorage so a phone that reloads mid-checkout keeps its bag.
 */
const STORAGE_KEY = '7h-bag-v1';

export interface BagLine {
  releaseId: string;
  quantity: number;
}

interface BagContextValue {
  lines: BagLine[];
  count: number;
  quantityOf: (releaseId: string) => number;
  add: (releaseId: string, quantity?: number) => void;
  setQuantity: (releaseId: string, quantity: number) => void;
  remove: (releaseId: string) => void;
  clear: () => void;
  /** Bag lines with the live catalogue row attached, for rendering totals. */
  detailed: (releases: ShopRelease[]) => { release: ShopRelease; quantity: number; lineTotal: number }[];
  subtotal: (releases: ShopRelease[]) => number;
}

const BagContext = createContext<BagContextValue | null>(null);

const readBag = (): BagLine[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((line) => line && typeof line.releaseId === 'string')
      .map((line) => ({ releaseId: line.releaseId, quantity: Math.max(1, Math.floor(Number(line.quantity) || 1)) }));
  } catch {
    return [];
  }
};

export function BagProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<BagLine[]>(() => readBag());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      /* storage unavailable — the bag still works for this visit */
    }
  }, [lines]);

  const add = useCallback((releaseId: string, quantity = 1) => {
    setLines((current) => {
      const existing = current.find((line) => line.releaseId === releaseId);
      if (existing) {
        return current.map((line) =>
          line.releaseId === releaseId ? { ...line, quantity: line.quantity + quantity } : line,
        );
      }
      return [...current, { releaseId, quantity: Math.max(1, quantity) }];
    });
  }, []);

  const setQuantity = useCallback((releaseId: string, quantity: number) => {
    setLines((current) => {
      if (quantity <= 0) return current.filter((line) => line.releaseId !== releaseId);
      return current.map((line) => (line.releaseId === releaseId ? { ...line, quantity } : line));
    });
  }, []);

  const remove = useCallback((releaseId: string) => {
    setLines((current) => current.filter((line) => line.releaseId !== releaseId));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<BagContextValue>(() => {
    const quantityOf = (releaseId: string) =>
      lines.find((line) => line.releaseId === releaseId)?.quantity ?? 0;

    const detailed = (releases: ShopRelease[]) =>
      lines
        .map((line) => {
          const release = releases.find((item) => item.id === line.releaseId);
          if (!release) return null;
          return { release, quantity: line.quantity, lineTotal: release.priceUsd * line.quantity };
        })
        .filter((line): line is { release: ShopRelease; quantity: number; lineTotal: number } => Boolean(line));

    const subtotal = (releases: ShopRelease[]) =>
      detailed(releases).reduce((sum, line) => sum + line.lineTotal, 0);

    return {
      lines,
      count: lines.reduce((sum, line) => sum + line.quantity, 0),
      quantityOf,
      add,
      setQuantity,
      remove,
      clear,
      detailed,
      subtotal,
    };
  }, [lines, add, setQuantity, remove, clear]);

  return <BagContext.Provider value={value}>{children}</BagContext.Provider>;
}

export function useBag() {
  const context = useContext(BagContext);
  if (!context) throw new Error('useBag must be used inside <BagProvider>');
  return context;
}
