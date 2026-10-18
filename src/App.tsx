import { useEffect, useState, type ReactNode } from "react";
import { SportProvider, useSport } from "./context/SportContext";
import { AppFrame } from "./predictor-ui";
import { SITES } from "./lib/sites";
import { GamesPage } from "./pages/GamesPage";
import { PlayersPage } from "./pages/PlayersPage";
import { StandingsPage } from "./pages/StandingsPage";
import { TeamHubPage } from "./pages/TeamHubPage";
import { TrackRecordPage } from "./pages/TrackRecordPage";
import { Skeleton } from "./predictor-ui";
import { preloadAll } from "./api/client";

type Tab = "games" | "teams" | "players" | "standings" | "track-record";
const TABS: [Tab, string][] = [
  ["games", "Games"],
  ["teams", "Teams"],
  ["players", "Players"],
  ["standings", "Standings"],
  ["track-record", "Track record"],
];

function tabFromSearch(search: string): Tab {
  const params = new URLSearchParams(search);
  const t = params.get("tab");
  if (t === "hub") return "teams"; // old Data Hub deep link -> Teams
  if (TABS.some(([id]) => id === t)) return t as Tab;
  return "games";
}

// The Teams panel resolves its own season (same as HubPage did); every other
// panel reads what it needs from SportContext.
function TeamsPage() {
  const { api, sport } = useSport();
  const [season, setSeason] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.currentWeek()
      .then((cw) => { if (!cancelled) setSeason(cw.season); })
      .catch(() => { if (!cancelled) setSeason(null); });
    return () => { cancelled = true; };
  }, [api]);

  if (season == null) return <Skeleton label="Loading teams…" />;
  return <TeamHubPage api={api} season={season} sport={sport} />;
}

const PANEL: Record<Tab, () => ReactNode> = {
  games: () => <GamesPage />,
  teams: () => <TeamsPage />,
  players: () => <PlayersPage />,
  standings: () => <StandingsPage />,
  "track-record": () => <TrackRecordPage />,
};

function AppShell() {
  const { sport } = useSport();
  const initial = tabFromSearch(window.location.search);
  const [tab, setTab] = useState<Tab>(initial);
  // Visited tabs stay mounted so their state survives tab switches.
  const [mountedTabs, setMountedTabs] = useState<Set<Tab>>(() => new Set([initial]));

  const showTab = (id: string) => {
    const key = id as Tab;
    setMountedTabs((prev) => new Set(prev).add(key));
    setTab(key);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", key);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  };

  // Back/forward keeps the tab in sync.
  useEffect(() => {
    const onPop = () => setTab(tabFromSearch(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Preload warms both sports after first paint and on visibility change.
  useEffect(() => {
    const timer = setTimeout(() => { void preloadAll(); }, 750);
    return () => clearTimeout(timer);
  }, []);
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
      paperTradingHref="https://40-160-91-131.sslip.io/paper.html"
      onTab={showTab}
    >
      {TABS.map(([key]) => mountedTabs.has(key) && (
        <div key={key} data-tab={key} style={{ display: tab === key ? undefined : "none" }}>
          {PANEL[key]()}
        </div>
      ))}
    </AppFrame>
  );
}

function App() {
  return <SportProvider><AppShell /></SportProvider>;
}

export default App;
