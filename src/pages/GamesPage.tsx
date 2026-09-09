import { useEffect, useState } from "react";
import type { GamePrediction, GameSummary } from "../types";
import { useSport } from "../context/SportContext";
import { sortByConfidence } from "../lib/confidenceSort";
import { GameCard } from "../components/GameCard";
import { GameDetailModal } from "../components/GameDetailModal";

const FALLBACK_SEASON = 2026;
type SortMode = "chronological" | "confidence";

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
    setLoading(true); setError(null); setGames([]); setPredictions({}); setSelectedGame(null);
    api.games(season, week).then(async (fetchedGames) => {
      setGames(fetchedGames);
      const entries = await Promise.all(fetchedGames.map(async (g) => {
        try { const p = await api.gamePrediction(season, week, g.game_id); return [g.game_id, p] as const; }
        catch { return null; }
      }));
      setPredictions(Object.fromEntries(entries.filter((e): e is [string, GamePrediction] => e !== null)));
    }).catch((err) => setError(err instanceof Error ? err.message : String(err))).finally(() => setLoading(false));
  }, [api, season, week]);

  const orderedGames = sortMode === "confidence" ? sortByConfidence(games, predictions) : [...games].sort((a, b) => new Date(a.gameday).getTime() - new Date(b.gameday).getTime());
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
      {loading && <p className="text-sm text-sp-text-faint">Loading…</p>}
      {error && <p role="alert" className="text-sm text-loss">{error}</p>}
      {!loading && !error && orderedGames.length === 0 && (
        <p className="text-sm text-sp-text-faint">No games scheduled for this week.</p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {orderedGames.map((game) => (
          <GameCard key={game.game_id} game={game} prediction={predictions[game.game_id] ?? null} onClick={() => setSelectedGame(game)} />
        ))}
      </div>
      {selectedGame && <GameDetailModal game={selectedGame} api={api} onClose={() => setSelectedGame(null)} />}
    </div>
  );
}
