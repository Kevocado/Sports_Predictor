import { useEffect, useState } from "react";
import type { GamePrediction, GameSummary } from "../types";
import { useSport } from "../context/SportContext";
import { sortByConfidence } from "../lib/confidenceSort";
import { GameCard } from "../components/GameCard";
import { GameDetailModal } from "../components/GameDetailModal";

const FALLBACK_SEASON = 2026;
const PREDICTION_CONCURRENCY = 4;
type SortMode = "chronological" | "confidence";

// A full week's worth of games fired as one Promise.all was hammering the
// backend with 15+ simultaneous prediction requests and occasionally
// tripping intermittent 500s under that burst. A small worker pool keeps
// the same total requests but only a handful in flight at once.
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export function GamesPage() {
  const { api, sport } = useSport();
  const [season, setSeason] = useState(FALLBACK_SEASON);
  const [week, setWeek] = useState(1);
  const [currentWeek, setCurrentWeek] = useState<{ season: number; week: number } | null>(null);
  const [games, setGames] = useState<GameSummary[]>([]);
  const [predictions, setPredictions] = useState<Record<string, GamePrediction>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("chronological");
  const [conferenceFilter, setConferenceFilter] = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<GameSummary | null>(null);

  // On sport switch, jump straight to that sport's current week rather than
  // always restarting at week 1 (which for CFB/NFL is usually long over by
  // the time anyone's looking).
  useEffect(() => {
    let cancelled = false;
    api.currentWeek()
      .then((cw) => {
        if (cancelled) return;
        setCurrentWeek(cw);
        setSeason(cw.season);
        setWeek(cw.week);
      })
      .catch(() => { if (!cancelled) setCurrentWeek(null); });
    return () => { cancelled = true; };
  }, [api, sport]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setGames([]); setPredictions({}); setSelectedGame(null);
    api.games(season, week).then(async (fetchedGames) => {
      if (cancelled) return;
      setGames(fetchedGames);
      const entries = await mapWithConcurrency(fetchedGames, PREDICTION_CONCURRENCY, async (g) => {
        // One retry: a single backend under a burst of concurrent requests
        // can drop a request transiently even with the concurrency cap
        // above, and a permanent "Loading…" badge for the rest of the
        // page's life is worse than one extra round trip.
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try { const p = await api.gamePrediction(season, week, g.game_id); return [g.game_id, p] as const; }
          catch { /* fall through to retry, or give up after the last attempt */ }
        }
        return null;
      });
      if (cancelled) return;
      setPredictions(Object.fromEntries(entries.filter((e): e is [string, GamePrediction] => e !== null)));
    }).catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [api, season, week]);

  // Get all unique conferences for filter chips
  const allConferences = new Set<string>();
  for (const game of games) {
    if (game.home_conference) allConferences.add(game.home_conference);
    if (game.away_conference) allConferences.add(game.away_conference);
  }
  const conferenceFilters = Array.from(allConferences).sort();

  // Apply conference filter if selected
  const filteredGames = conferenceFilter
    ? games.filter(g => {
        const homeConf = g.home_conference || 'Independent';
        const awayConf = g.away_conference || 'Independent';
        return homeConf === conferenceFilter || awayConf === conferenceFilter;
      })
    : games;

  const orderedGames = sortMode === "confidence" 
    ? sortByConfidence(filteredGames, predictions) 
    : [...filteredGames].sort((a, b) => new Date(a.gameday).getTime() - new Date(b.gameday).getTime());
  
  const isCurrentWeek = currentWeek != null && currentWeek.season === season && currentWeek.week === week;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeek((w) => Math.max(1, w - 1))}
            disabled={week <= 1}
            aria-label="Previous week"
            className="rounded-lg border border-sp-border bg-sp-850/60 px-2.5 py-1.5 text-sp-text-dim transition hover:text-sp-text disabled:cursor-not-allowed disabled:opacity-40"
          >
            &larr;
          </button>
          <h2 className="text-lg font-bold text-sp-text">
            {season} &middot; Week {week}
          </h2>
          <button
            onClick={() => setWeek((w) => w + 1)}
            aria-label="Next week"
            className="rounded-lg border border-sp-border bg-sp-850/60 px-2.5 py-1.5 text-sp-text-dim transition hover:text-sp-text"
          >
            &rarr;
          </button>
          {!isCurrentWeek && currentWeek && (
            <button
              onClick={() => { setSeason(currentWeek.season); setWeek(currentWeek.week); }}
              className="rounded-lg border border-sp-gold/40 bg-sp-gold/10 px-2.5 py-1.5 text-xs font-medium text-sp-gold transition hover:bg-sp-gold/20"
            >
              Jump to current week
            </button>
          )}
        </div>
        <div className="flex gap-1 rounded-lg border border-sp-border bg-sp-850/60 p-1">
          {(["chronological", "confidence"] as const).map((mode) => (
            <button key={mode} onClick={() => setSortMode(mode)} className={`rounded-md px-3 py-1 text-xs font-medium transition ${sortMode === mode ? "bg-sp-gold text-sp-950" : "text-sp-text-dim hover:text-sp-text"}`}>
              {mode === "chronological" ? "Kickoff order" : "Sort by confidence"}
            </button>
          ))}
        </div>
      </div>

      {/* Conference filter chips */}
      {conferenceFilters.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setConferenceFilter(null)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${conferenceFilter === null ? "bg-sp-gold text-sp-950" : "border border-sp-border bg-sp-850/60 text-sp-text-dim hover:text-sp-text"}`}
          >
            All
          </button>
          {conferenceFilters.map((conf) => (
            <button
              key={conf}
              onClick={() => setConferenceFilter(conf === conferenceFilter ? null : conf)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${conferenceFilter === conf ? "bg-sp-gold text-sp-950" : "border border-sp-border bg-sp-850/60 text-sp-text-dim hover:text-sp-text"}`}
            >
              {conf}
            </button>
          ))}
        </div>
      )}

      {loading && <p className="text-sm text-sp-text-faint">Loading…</p>}
      {error && <p role="alert" className="text-sm text-loss">{error}</p>}
      {!loading && !error && orderedGames.length === 0 && (
        <p className="text-sm text-sp-text-faint">No games scheduled for this week.</p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {orderedGames.map((game) => {
          // Only show conference badges for CFB
          const showConf = sport === "cfb";
          const homeConf = game.home_conference || 'Independent';
          const awayConf = game.away_conference || 'Independent';
          return (
            <div key={game.game_id} className="relative">
              {showConf && homeConf && awayConf && (
                <div className="absolute -top-3 right-2 z-10 flex gap-1">
                  <span className="rounded bg-sp-900 px-1.5 py-0.5 text-[10px] font-semibold text-sp-text-dim border border-sp-border/50">
                    {homeConf}
                  </span>
                  <span className="rounded bg-sp-900 px-1.5 py-0.5 text-[10px] font-semibold text-sp-text-dim border border-sp-border/50">
                    {awayConf}
                  </span>
                </div>
              )}
              <GameCard 
                game={game} 
                prediction={predictions[game.game_id] ?? null} 
                onClick={() => setSelectedGame(game)} 
              />
            </div>
          );
        })}
      </div>
      
      {selectedGame && <GameDetailModal game={selectedGame} api={api} onClose={() => setSelectedGame(null)} />}
    </div>
  );
}
