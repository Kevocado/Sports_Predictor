import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { cfbApi, nflApi } from "../api/client";
import type { Sport, SportApi } from "../types";

interface SportContextValue {
  sport: Sport;
  setSport: (sport: Sport) => void;
  api: SportApi;
}

const SportContext = createContext<SportContextValue | null>(null);

export function SportProvider({ children }: { children: ReactNode }) {
  const [sport, setSport] = useState<Sport>("nfl");
  const value = useMemo<SportContextValue>(
    () => ({ sport, setSport, api: sport === "nfl" ? nflApi : cfbApi }),
    [sport],
  );
  return <SportContext.Provider value={value}>{children}</SportContext.Provider>;
}

export function useSport(): SportContextValue {
  const ctx = useContext(SportContext);
  if (!ctx) throw new Error("useSport must be used within a SportProvider");
  return ctx;
}
