import { useEffect, useState } from "react";
import { useSport } from "../context/SportContext";
import { PlayersPage } from "./PlayersPage";
import { StandingsPage } from "./StandingsPage";
import { TrackRecordPage } from "./TrackRecordPage";
import { PowerRankingsPanel } from "../components/PowerRankingsPanel";

type HubSubTab = "players" | "rankings" | "standings" | "track-record";
const SUBTABS = [["players", "Player Hub"], ["rankings", "Power Rankings"], ["standings", "Standings"], ["track-record", "Track Record"]] as const;

/**
 * The Hub consolidates everything that is not the game list: player props,
 * power rankings, standings, and the track record. The panel components
 * fetch their own data; the hub only resolves the season for the rankings
 * panel (behind the client's TTL cache).
 */
export function HubPage() {
  const { api } = useSport();
  const [subtab, setSubtab] = useState<HubSubTab>("players");
  const [season, setSeason] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.currentWeek()
      .then((cw) => { if (!cancelled) setSeason(cw.season); })
      .catch(() => { if (!cancelled) setSeason(null); });
    return () => { cancelled = true; };
  }, [api]);

  return (
    <div>
      <nav aria-label="Hub sections" className="mb-5 flex gap-1 rounded-lg border border-sp-border bg-sp-850/60 p-1">
        {SUBTABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSubtab(key)}
            className={`rounded-md px-3.5 py-1.5 font-display text-sm font-semibold uppercase tracking-wider transition ${subtab === key ? "bg-sp-gold text-sp-950" : "text-sp-text-dim hover:text-sp-text"}`}
          >
            {label}
          </button>
        ))}
      </nav>
      {subtab === "players" ? <PlayersPage />
        : subtab === "rankings" ? (season != null
          ? <PowerRankingsPanel api={api} season={season} />
          : <p className="text-sm text-sp-text-faint">Loading…</p>)
        : subtab === "standings" ? <StandingsPage />
        : <TrackRecordPage />}
    </div>
  );
}
