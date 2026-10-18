"use client";

import { createContext, useContext, useEffect, useState } from "react";

// Título de la sección que se muestra en el Header (junto a "NOC Dashboard /
// <breadcrumb>"). Las páginas lo publican con <PageHeader/>; el Header lo lee.
export type PageHeaderValue = { title: string; subtitle?: string };

const ValueContext = createContext<PageHeaderValue | null>(null);
const SetContext = createContext<(v: PageHeaderValue | null) => void>(() => {});

export function PageHeaderProvider({ children }: { children: React.ReactNode }) {
  const [value, setValue] = useState<PageHeaderValue | null>(null);
  return (
    <SetContext.Provider value={setValue}>
      <ValueContext.Provider value={value}>{children}</ValueContext.Provider>
    </SetContext.Provider>
  );
}

export function usePageHeaderValue(): PageHeaderValue | null {
  return useContext(ValueContext);
}

// Componente sin UI: mientras esté montado, el Header muestra este título.
export function PageHeader({ title, subtitle }: PageHeaderValue) {
  const set = useContext(SetContext);
  useEffect(() => {
    set({ title, subtitle });
    return () => set(null);
  }, [set, title, subtitle]);
  return null;
}
