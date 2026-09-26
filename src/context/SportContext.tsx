import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { cfbApi, nflApi } from "../api/client";
import type { Sport, SportApi } from "../types";

interface SportContextValue {
  sport: Sport;
  setSport: (sport: Sport) => void;
  api: SportApi;
}

const SportContext = createContext<SportContextValue | null>(null);

/** The sport named in the URL (?sport=nfl|cfb); anything else is NFL. */
export function sportFromSearch(search: string): Sport {
  return new URLSearchParams(search).get("sport") === "cfb" ? "cfb" : "nfl";
}

export function SportProvider({ children }: { children: ReactNode }) {
  // The URL owns the sport, so the family switcher's links, Back and shared
  // links all land on the right sport.
  const [sport, setSportState] = useState<Sport>(() => sportFromSearch(window.location.search));
  const value = useMemo<SportContextValue>(() => {
    const setSport = (next: Sport) => {
      const params = new URLSearchParams(window.location.search);
      params.set("sport", next);
      window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}${window.location.hash}`);
      setSportState(next);
    };
    return { sport, setSport, api: sport === "nfl" ? nflApi : cfbApi };
  }, [sport]);
  return <SportContext.Provider value={value}>{children}</SportContext.Provider>;
}

export function useSport(): SportContextValue {
  const ctx = useContext(SportContext);
  if (!ctx) throw new Error("useSport must be used within a SportProvider");
  return ctx;
}
