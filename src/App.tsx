import { useEffect, useState } from "react";
import { SportProvider, useSport } from "./context/SportContext";
import { AppFrame } from "./predictor-ui";
import { SITES } from "./lib/sites";
import { GamesPage } from "./pages/GamesPage";
import { HubPage } from "./pages/HubPage";
import { preloadAll } from "./api/client";

type Tab = "games" | "hub";
const TABS = [["games", "Games"], ["hub", "Data Hub"]] as const;

function AppShell() {
  const [tab, setTab] = useState<Tab>("games");
  // Visited tabs stay mounted so their state survives tab switches; only
  // the active tab is visible. Unvisited tabs are not mounted at all.
  const [mountedTabs, setMountedTabs] = useState<Set<Tab>>(() => new Set<Tab>(["games"]));
  const { sport } = useSport();

  const showTab = (key: Tab) => {
    setMountedTabs((prev) => new Set(prev).add(key));
    setTab(key);
  };

  // Start the cross-sport preload shortly after first paint. Fire-and-forget:
  // every call is behind the client's TTL cache, and preloadAll is best-effort.
  useEffect(() => {
    const timer = setTimeout(() => { void preloadAll(); }, 750);
    return () => clearTimeout(timer);
  }, []);

  // Re-warm both sports in the background whenever the tab becomes visible
  // again (device wakeup, tab switch back). Best-effort and non-blocking:
  // the 10-minute TTL cache means a recent warm is a no-op, and anything
  // already on screen keeps showing its data while the refresh happens.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void preloadAll();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  return (
    <AppFrame
      sport={sport}
      sportName={sport === "nfl" ? "NFL" : "CFB"}
      sites={SITES}
      tabs={TABS.map(([id, label]) => ({ id, label }))}
      activeTab={tab}
      onTab={(id) => showTab(id as Tab)}
    >
      {TABS.map(([key]) => mountedTabs.has(key) && (
        <div key={key} data-tab={key} style={{ display: tab === key ? undefined : "none" }}>
          {key === "games" ? <GamesPage /> : <HubPage />}
        </div>
      ))}
    </AppFrame>
  );
}

function App() {
  return <SportProvider><AppShell /></SportProvider>;
}

export default App;
