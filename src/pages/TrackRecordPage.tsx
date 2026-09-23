import { useEffect, useState } from "react";
import type { TrackRecord, YardageTrackRecord } from "../types";
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

function AccuracyCard({ label, accuracy, sublabel }: { label: string; accuracy: number | null | undefined; sublabel?: string }) {
  const width = accuracy == null ? 0 : Math.round(accuracy * 100);
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-sp-border bg-sp-850/70 p-4" data-testid="accuracy-50-marker">
      <span className="text-xs text-sp-text-faint">{label}</span>
      <span className="text-2xl font-bold text-sp-text">{pct(accuracy)}</span>
      <div className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-sp-800" data-testid="accuracy-bar" aria-hidden="true">
        <span className="block h-full rounded-full bg-sp-gold" style={{ width: `${width}%` }} />
        <div className="absolute inset-y-0 left-1/2 w-px bg-sp-text-faint/60" />
      </div>
      {sublabel && <span className="text-[11px] text-sp-text-dim">{sublabel}</span>}
    </div>
  );
}

const YARDAGE_MARKET_LABEL: Record<string, string> = {
  passing_yards: "Passing yards", rushing_yards: "Rushing yards", receiving_yards: "Receiving yards",
  receptions: "Receptions", carries: "Carries",
};

function biasLabel(market: YardageTrackRecord): string | undefined {
  if (market.mean_signed_error == null || market.n_resolved === 0) return undefined;
  const rounded = Math.round(Math.abs(market.mean_signed_error) * 10) / 10;
  if (rounded === 0) return "no systematic bias";
  return market.mean_signed_error > 0 ? `overpredicts by ~${rounded}` : `underpredicts by ~${rounded}`;
}

function YardageCard({ market, marketKey }: { market: YardageTrackRecord; marketKey: string }) {
  const unit = marketKey === "receptions" || marketKey === "carries" ? "" : " yd";
  return (
    <StatCard
      label={YARDAGE_MARKET_LABEL[marketKey] ?? marketKey}
      value={market.mean_absolute_error != null ? `±${Math.round(market.mean_absolute_error * 10) / 10}${unit}` : "—"}
      sublabel={biasLabel(market) ?? "avg. error"}
    />
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
        <h2 className="mb-1 font-display text-2xl font-semibold uppercase tracking-wide text-sp-text">Track Record</h2>
        <p className="mb-4 text-xs text-sp-text-faint">How good the model actually is, in aggregate — not a game-by-game log.</p>

        <h3 className="mb-2 font-display text-sm font-semibold uppercase tracking-wider text-sp-text-faint">Game predictions</h3>
        {games.n_resolved === 0 ? (
          <p className="text-sm text-sp-text-faint">No resolved games yet — check back once this week's games are final.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <AccuracyCard label="Moneyline accuracy" accuracy={games.pct_moneyline_correct} sublabel={`${games.n_resolved} games`} />
              <AccuracyCard label="Spread (ATS) accuracy" accuracy={games.pct_ats_correct} />
              <AccuracyCard label="Total (O/U) accuracy" accuracy={games.pct_totals_correct} />
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
        <h3 className="mb-2 font-display text-sm font-semibold uppercase tracking-wider text-sp-text-faint">Player prop predictions</h3>
        {player_props.anytime_td.n_resolved === 0 && player_props.passing_yards.n_resolved === 0 &&
         player_props.rushing_yards.n_resolved === 0 && player_props.receiving_yards.n_resolved === 0 ? (
          <p className="text-sm text-sp-text-faint">No resolved player props yet — check back once this week's games are final.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <AccuracyCard
                label="Anytime-TD hit rate"
                accuracy={player_props.anytime_td.hit_rate_when_called}
                sublabel={player_props.anytime_td.n_called != null ? `${player_props.anytime_td.n_called} calls (≥50%)` : undefined}
              />
              <YardageCard marketKey="passing_yards" market={player_props.passing_yards} />
              <YardageCard marketKey="rushing_yards" market={player_props.rushing_yards} />
              <YardageCard marketKey="receiving_yards" market={player_props.receiving_yards} />
              {player_props.receptions && player_props.receptions.n_resolved > 0 && (
                <YardageCard marketKey="receptions" market={player_props.receptions} />
              )}
              {player_props.carries && player_props.carries.n_resolved > 0 && (
                <YardageCard marketKey="carries" market={player_props.carries} />
              )}
            </div>
            {player_props.anytime_td.confidence_buckets && player_props.anytime_td.confidence_buckets.some((b) => b.n > 0) && (
              <div className="mt-4 flex flex-col gap-1.5 rounded-xl border border-sp-border bg-sp-850/40 p-4">
                <span className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-sp-text-faint">Anytime-TD hit rate by confidence</span>
                {player_props.anytime_td.confidence_buckets.map((bucket) => (
                  <div key={bucket.label} className="flex items-center gap-3 text-xs">
                    <span className="w-16 shrink-0 text-sp-text-dim">{bucket.label}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-sp-850">
                      {bucket.hit_rate != null && (
                        <div className="h-full rounded-full bg-sp-gold" style={{ width: `${Math.max(4, bucket.hit_rate * 100)}%` }} />
                      )}
                    </div>
                    <span className="w-24 shrink-0 text-right font-mono text-sp-text-dim">
                      {bucket.n > 0 ? `${pct(bucket.hit_rate)} (${bucket.n})` : "no calls"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
