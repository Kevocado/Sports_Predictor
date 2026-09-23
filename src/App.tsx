import { useEffect, useState } from "react";
import { SportProvider, useSport } from "./context/SportContext";
import { SportToggle } from "./components/SportToggle";
import { GamesPage } from "./pages/GamesPage";
import { HubPage } from "./pages/HubPage";
import { preloadAll } from "./api/client";

type Tab = "games" | "hub";
const TABS = [["games","Games"],["hub","Hub"]] as const;

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
    <div className="mx-auto min-h-screen max-w-6xl px-6 py-8" data-sport={sport}>
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="clip-corner flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-sp-gold to-sp-600 font-black text-sp-950">SP</div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-sp-text">Sports Predictor</h1>
            <p className="text-xs text-sp-text-faint">NFL &amp; CFB game and player predictions</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <SportToggle />
          <nav className="flex gap-1 rounded-lg border border-sp-border bg-sp-850/60 p-1">
            {TABS.map(([key, label]) => (
              <button key={key} onClick={() => showTab(key)} className={`rounded-md px-3.5 py-1.5 font-display text-sm font-semibold uppercase tracking-wider transition ${tab === key ? "bg-sp-gold text-sp-950" : "text-sp-text-dim hover:text-sp-text"}`}>{label}</button>
            ))}
          </nav>
        </div>
      </header>
      <main>
        {TABS.map(([key]) => mountedTabs.has(key) && (
          <div key={key} data-tab={key} style={{ display: tab === key ? undefined : "none" }}>
            {key === "games" ? <GamesPage /> : <HubPage />}
          </div>
        ))}
      </main>
    </div>
  );
}

function App() {
  return <SportProvider><AppShell /></SportProvider>;
}

export default App;
