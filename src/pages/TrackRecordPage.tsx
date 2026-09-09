import { useEffect, useState } from "react";
import type { GameSummary, TrackRecord, WeekPrediction } from "../types";
import { useSport } from "../context/SportContext";

const DEFAULT_SEASON = 2026;
const DEFAULT_WEEK = 1;

function verdictBadge(hit: boolean) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${hit ? "bg-win/20 text-win" : "bg-loss/20 text-loss"}`}>
      {hit ? "HIT" : "MISS"}
    </span>
  );
}

export function TrackRecordPage() {
  const { api, sport } = useSport();
  const [record, setRecord] = useState<TrackRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState(DEFAULT_SEASON);
  const [week, setWeek] = useState(DEFAULT_WEEK);
  const [games, setGames] = useState<GameSummary[]>([]);
  const [weekPredictions, setWeekPredictions] = useState<WeekPrediction[]>([]);
  const [weekLoading, setWeekLoading] = useState(false);
  const [weekError, setWeekError] = useState<string | null>(null);

  useEffect(() => {
    setRecord(null); setError(null);
    api.trackRecord().then(setRecord).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [api, sport]);

  useEffect(() => {
    setWeekLoading(true); setWeekError(null); setGames([]); setWeekPredictions([]);
    Promise.all([api.games(season, week), api.predictionsForWeek(season, week)])
      .then(([g, wp]) => { setGames(g); setWeekPredictions(wp); })
      .catch((err) => setWeekError(err instanceof Error ? err.message : String(err)))
      .finally(() => setWeekLoading(false));
  }, [api, sport, season, week]);

  const gamesById = Object.fromEntries(games.map((g) => [g.game_id, g]));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="mb-4 text-lg font-bold text-sp-text">Track Record</h2>
        {error && <p role="alert" className="text-sm text-loss">{error}</p>}
        {!record && !error && <p className="text-sm text-sp-text-faint">Loading…</p>}
        {record && (
          <div className="flex flex-col gap-2 rounded-xl border border-sp-border bg-sp-850/70 p-4">
            <p className="text-sm text-sp-text-dim">Resolved games: <span className="font-semibold text-sp-text">{record.n_resolved_games}</span></p>
            <p className="text-sm text-sp-text-dim">Moneyline accuracy: <span className="font-semibold text-sp-text">{record.pct_moneyline_correct != null ? `${Math.round(record.pct_moneyline_correct * 100)}%` : "No resolved games yet"}</span></p>
          </div>
        )}
      </div>

      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-sp-text">Week Predictions &amp; Results</h2>
          <div className="flex items-center gap-2">
            <label className="text-xs text-sp-text-faint">Season</label>
            <input
              type="number"
              value={season}
              onChange={(e) => setSeason(Number(e.target.value))}
              className="w-20 rounded-lg border border-sp-border bg-sp-850/60 px-2 py-1 text-sm text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-gold"
            />
            <label className="text-xs text-sp-text-faint">Week</label>
            <input
              type="number"
              value={week}
              onChange={(e) => setWeek(Number(e.target.value))}
              className="w-16 rounded-lg border border-sp-border bg-sp-850/60 px-2 py-1 text-sm text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-gold"
            />
          </div>
        </div>
        {weekLoading && <p className="text-sm text-sp-text-faint">Loading…</p>}
        {weekError && <p role="alert" className="text-sm text-loss">{weekError}</p>}
        {!weekLoading && !weekError && weekPredictions.length === 0 && (
          <p className="text-sm text-sp-text-faint">No tracked predictions for this week yet.</p>
        )}
        <div className="flex flex-col gap-2">
          {weekPredictions.map((wp) => {
            const game = gamesById[wp.game_id];
            const label = game ? `${game.away_team} @ ${game.home_team}` : wp.game_id;
            return (
              <div key={wp.game_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sp-border bg-sp-850/60 px-3 py-2 text-sm">
                <span className="text-sp-text font-medium">{label}</span>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-sp-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sp-text-faint">{wp.status}</span>
                  {wp.verdict && (
                    <div className="flex items-center gap-1.5 font-mono text-xs text-sp-text-dim">
                      <span>ML {verdictBadge(wp.verdict.moneyline.hit)}</span>
                      {wp.verdict.ats && <span>ATS {verdictBadge(wp.verdict.ats.hit)}</span>}
                      {wp.verdict.totals && <span>O/U {verdictBadge(wp.verdict.totals.hit)}</span>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
