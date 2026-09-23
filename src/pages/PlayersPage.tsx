import { useEffect, useMemo, useState } from "react";
import type { PlayerPropPrediction } from "../types";
import { useSport } from "../context/SportContext";
import { POSITION_ORDER, groupByPosition, keyStatLabel, keyYardage, tdConfidenceTone } from "../lib/playerRank";

const FALLBACK_SEASON = 2026;

const POSITION_LABEL: Record<string, string> = {
  QB: "Quarterbacks",
  RB: "Running backs",
  WR: "Wide receivers",
  TE: "Tight ends",
};

export function PlayersPage() {
  const { api, sport } = useSport();
  const [season, setSeason] = useState(FALLBACK_SEASON);
  const [week, setWeek] = useState(1);
  const [props, setProps] = useState<PlayerPropPrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Follow the sport's actual current week rather than a hardcoded
  // season/week, matching GamesPage's own current-week lookup.
  useEffect(() => {
    let cancelled = false;
    api.currentWeek()
      .then((cw) => { if (!cancelled) { setSeason(cw.season); setWeek(cw.week); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [api, sport]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setProps([]);
    api.playerProps(season, week)
      .then((fetched) => { if (!cancelled) setProps(fetched); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [api, season, week]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return props;
    return props.filter((p) => p.player_name.toLowerCase().includes(query) || p.recent_team.toLowerCase().includes(query));
  }, [props, search]);

  const grouped = useMemo(() => groupByPosition(filtered), [filtered]);
  const hasAny = POSITION_ORDER.some((position) => grouped[position].length > 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-sp-text">Week {week} Player Predictions</h2>
          <p className="text-xs text-sp-text-faint">Best bets by position, ranked by projected yardage.</p>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search player or team…"
          className="rounded-lg border border-sp-border bg-sp-850/60 px-3 py-1.5 text-sm text-sp-text placeholder:text-sp-text-faint focus:outline-none focus:ring-1 focus:ring-sp-gold"
        />
      </div>
      {loading && <p className="text-sm text-sp-text-faint">Loading…</p>}
      {error && <p role="alert" className="text-sm text-loss">{error}</p>}
      {!loading && !error && !hasAny && (
        <p className="text-sm text-sp-text-faint">No player predictions available for this week yet.</p>
      )}
      <div className="flex flex-col gap-8">
        {POSITION_ORDER.map((position) => {
          const players = grouped[position];
          if (players.length === 0) return null;
          return (
            <section key={position}>
              <h3 className="mb-3 flex items-baseline gap-2 text-sm font-bold uppercase tracking-wide text-sp-text-faint">
                {POSITION_LABEL[position]}
                <span className="text-xs font-normal text-sp-text-dim">({players.length})</span>
              </h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {players.map((prop, i) => (
                  <div key={prop.player_id} className="flex items-center justify-between gap-3 rounded-lg border border-sp-border bg-sp-850/60 px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-4 shrink-0 text-right font-mono text-xs text-sp-text-faint">{i + 1}</span>
                      <span className="truncate text-sp-text font-medium">
                        {prop.player_name}{" "}
                        <span className="text-xs text-sp-text-faint font-normal">({prop.recent_team})</span>
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 font-mono text-xs text-sp-text-dim">
                      <span>{keyStatLabel(position)} {Math.round(keyYardage(prop))}</span>
                      <span className={`rounded px-1.5 py-0.5 font-semibold ${tdConfidenceTone(prop.anytime_td_prob)}`}>
                        TD {Math.round(prop.anytime_td_prob * 100)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
