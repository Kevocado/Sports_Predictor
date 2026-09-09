import { useEffect, useMemo, useState } from "react";
import type { PlayerPropPrediction } from "../types";
import { useSport } from "../context/SportContext";

const SEASON = 2026;
const WEEK = 1;

export function PlayersPage() {
  const { api, sport } = useSport();
  const [props, setProps] = useState<PlayerPropPrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true); setError(null); setProps([]);
    api.playerProps(SEASON, WEEK)
      .then(setProps)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [api, sport]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matches = query
      ? props.filter((p) => p.player_name.toLowerCase().includes(query) || p.recent_team.toLowerCase().includes(query))
      : props;
    return [...matches].sort((a, b) => b.anytime_td_prob - a.anytime_td_prob);
  }, [props, search]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-sp-text">Week {WEEK} Player Predictions</h2>
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
      {!loading && !error && filtered.length === 0 && (
        <p className="text-sm text-sp-text-faint">No player predictions available for this week yet.</p>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((prop) => (
          <div key={prop.player_id} className="flex items-center justify-between rounded-lg border border-sp-border bg-sp-850/60 px-3 py-2 text-sm">
            <span className="text-sp-text font-medium">
              {prop.player_name}{" "}
              <span className="text-xs text-sp-text-faint font-normal">({prop.position} · {prop.recent_team})</span>
            </span>
            <div className="flex items-center gap-3 font-mono text-xs text-sp-text-dim">
              <span>TD {Math.round(prop.anytime_td_prob * 100)}%</span>
              {prop.passing_yards != null && <span>Pass {Math.round(prop.passing_yards)}yd</span>}
              {prop.rushing_yards != null && <span>Rush {Math.round(prop.rushing_yards)}yd</span>}
              {prop.receiving_yards != null && <span>Rec {Math.round(prop.receiving_yards)}yd</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
