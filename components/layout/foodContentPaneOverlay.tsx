'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface FoodContentPaneContextValue {
  open: boolean;
  register: (active: boolean) => void;
}

const FoodContentPaneContext = createContext<FoodContentPaneContextValue>({
  open: false,
  register: () => {},
});

/**
 * Counts explicit Food content-pane modals. Nested open/close restores the
 * underlying modal instead of re-enabling app chrome early.
 */
export function FoodContentPaneOverlayProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const register = useCallback((active: boolean) => {
    setCount((current) => Math.max(0, current + (active ? 1 : -1)));
  }, []);
  const value = useMemo(
    () => ({ open: count > 0, register }),
    [count, register],
  );

  return (
    <FoodContentPaneContext.Provider value={value}>
      {children}
    </FoodContentPaneContext.Provider>
  );
}

export function useFoodContentPaneOpen(): boolean {
  return useContext(FoodContentPaneContext).open;
}

export function useRegisterFoodContentPane(active: boolean) {
  const { register } = useContext(FoodContentPaneContext);

  useEffect(() => {
    if (!active) return undefined;
    register(true);
    return () => register(false);
  }, [active, register]);
}
