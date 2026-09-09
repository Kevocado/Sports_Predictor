import { useEffect, useState } from "react";
import type { TrackRecord } from "../types";
import { useSport } from "../context/SportContext";

function pct(value: number | null | undefined): string {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

function StatCard({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-sp-border bg-sp-850/70 p-4">
      <span className="text-xs text-sp-text-faint">{label}</span>
      <span className="text-2xl font-bold text-sp-text">{value}</span>
      {sublabel && <span className="text-[11px] text-sp-text-dim">{sublabel}</span>}
    </div>
  );
}

export function TrackRecordPage() {
  const { api, sport } = useSport();
  const [record, setRecord] = useState<TrackRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRecord(null); setError(null);
    api.trackRecord().then(setRecord).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [api, sport]);

  if (error) return <p role="alert" className="text-sm text-loss">{error}</p>;
  if (!record) return <p className="text-sm text-sp-text-faint">Loading…</p>;

  const { games, player_props } = record;
  const maxTrendGames = Math.max(1, ...games.weekly_trend.map((w) => w.n_games));

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h2 className="mb-1 text-lg font-bold text-sp-text">Track Record</h2>
        <p className="mb-4 text-xs text-sp-text-faint">How good the model actually is, in aggregate — not a game-by-game log.</p>

        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sp-text-faint">Game predictions</h3>
        {games.n_resolved === 0 ? (
          <p className="text-sm text-sp-text-faint">No resolved games yet — check back once this week's games are final.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Moneyline accuracy" value={pct(games.pct_moneyline_correct)} sublabel={`${games.n_resolved} games`} />
              <StatCard label="Spread (ATS) accuracy" value={pct(games.pct_ats_correct)} />
              <StatCard label="Total (O/U) accuracy" value={pct(games.pct_totals_correct)} />
              <StatCard label="Games resolved" value={String(games.n_resolved)} />
            </div>
            {games.weekly_trend.length > 0 && (
              <div className="mt-4 flex flex-col gap-1.5 rounded-xl border border-sp-border bg-sp-850/40 p-4">
                <span className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-sp-text-faint">Moneyline accuracy by week</span>
                {games.weekly_trend.map((w) => (
                  <div key={w.week} className="flex items-center gap-3 text-xs">
                    <span className="w-14 shrink-0 text-sp-text-dim">Week {w.week}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-sp-850">
                      <div className="h-full rounded-full bg-sp-gold" style={{ width: `${Math.max(4, (w.n_games / maxTrendGames) * w.pct_moneyline_correct * 100)}%` }} />
                    </div>
                    <span className="w-20 shrink-0 text-right font-mono text-sp-text-dim">{pct(w.pct_moneyline_correct)} ({w.n_games})</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sp-text-faint">Player prop predictions</h3>
        {player_props.anytime_td.n_resolved === 0 && player_props.passing_yards.n_resolved === 0 &&
         player_props.rushing_yards.n_resolved === 0 && player_props.receiving_yards.n_resolved === 0 ? (
          <p className="text-sm text-sp-text-faint">No resolved player props yet — check back once this week's games are final.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label="Anytime-TD hit rate"
              value={pct(player_props.anytime_td.hit_rate_when_called)}
              sublabel={player_props.anytime_td.n_called != null ? `${player_props.anytime_td.n_called} calls (≥50%)` : undefined}
            />
            <StatCard
              label="Passing yards"
              value={player_props.passing_yards.mean_absolute_error != null ? `±${Math.round(player_props.passing_yards.mean_absolute_error)} yd` : "—"}
              sublabel="avg. error"
            />
            <StatCard
              label="Rushing yards"
              value={player_props.rushing_yards.mean_absolute_error != null ? `±${Math.round(player_props.rushing_yards.mean_absolute_error)} yd` : "—"}
              sublabel="avg. error"
            />
            <StatCard
              label="Receiving yards"
              value={player_props.receiving_yards.mean_absolute_error != null ? `±${Math.round(player_props.receiving_yards.mean_absolute_error)} yd` : "—"}
              sublabel="avg. error"
            />
          </div>
        )}
      </div>
    </div>
  );
}
