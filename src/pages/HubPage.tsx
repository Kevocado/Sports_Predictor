import { useEffect, useState } from "react";
import { useSport } from "../context/SportContext";
import { Skeleton } from "../predictor-ui";
import { PlayersPage } from "./PlayersPage";
import { StandingsPage } from "./StandingsPage";
import { TeamHubPage } from "./TeamHubPage";
import { TrackRecordPage } from "./TrackRecordPage";

type HubSubTab = "teams" | "players" | "standings" | "track-record";
const SUBTABS = [["teams", "Teams"], ["players", "Players"], ["standings", "Standings"], ["track-record", "Track record"]] as const;

/**
 * The Hub consolidates everything that is not the game list: season team
 * and player tables (efficiency, form, leaders, this week's projections),
 * standings, and the track record. The panel components fetch their own data; the hub only
 * resolves the season for the team panel (behind the client's TTL cache).
 */
export function HubPage() {
  const { api, sport } = useSport();
  const [subtab, setSubtab] = useState<HubSubTab>("teams");
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
      <nav aria-label="Hub sections" className="mb-5 flex max-w-full gap-1 overflow-x-auto rounded-lg border border-sp-border bg-sp-850/60 p-1 sm:w-fit">
        {SUBTABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={subtab === key}
            onClick={() => setSubtab(key)}
            className={`whitespace-nowrap rounded-md px-3.5 py-1.5 font-display text-sm font-semibold uppercase tracking-wider transition ${subtab === key ? "bg-sp-gold text-sp-950" : "text-sp-text-dim hover:text-sp-text"}`}
          >
            {label}
          </button>
        ))}
      </nav>
      {subtab === "players" ? <PlayersPage />
        : subtab === "teams" ? (season != null
          ? <TeamHubPage api={api} season={season} sport={sport} />
          : <Skeleton label="Loading teams…" />)
        : subtab === "standings" ? <StandingsPage />
        : <TrackRecordPage />}
    </div>
  );
}
