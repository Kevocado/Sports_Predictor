import { useEffect, useState } from "react";
import type { GamePrediction, GameSummary } from "../types";
import { useSport } from "../context/SportContext";
import { sortByConfidence } from "../lib/confidenceSort";
import { GameCard } from "../components/GameCard";
import { GameDetailModal } from "../components/GameDetailModal";

const SEASON = 2026;
const WEEK = 1;
type SortMode = "chronological" | "confidence";

export function GamesPage() {
  const { api, sport } = useSport();
  const [games, setGames] = useState<GameSummary[]>([]);
  const [predictions, setPredictions] = useState<Record<string, GamePrediction>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("chronological");
  const [selectedGame, setSelectedGame] = useState<GameSummary | null>(null);

  useEffect(() => {
    setLoading(true); setError(null); setGames([]); setPredictions({}); setSelectedGame(null);
    api.games(SEASON, WEEK).then(async (fetchedGames) => {
      setGames(fetchedGames);
      const entries = await Promise.all(fetchedGames.map(async (g) => {
        try { const p = await api.gamePrediction(SEASON, WEEK, g.game_id); return [g.game_id, p] as const; }
        catch { return null; }
      }));
      setPredictions(Object.fromEntries(entries.filter((e): e is [string, GamePrediction] => e !== null)));
    }).catch((err) => setError(err instanceof Error ? err.message : String(err))).finally(() => setLoading(false));
  }, [api, sport]);

  const orderedGames = sortMode === "confidence" ? sortByConfidence(games, predictions) : [...games].sort((a, b) => new Date(a.gameday).getTime() - new Date(b.gameday).getTime());

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-sp-text">Week {WEEK} Games</h2>
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {orderedGames.map((game) => (
          <GameCard key={game.game_id} game={game} prediction={predictions[game.game_id] ?? null} onClick={() => setSelectedGame(game)} />
        ))}
      </div>
      {selectedGame && <GameDetailModal game={selectedGame} api={api} onClose={() => setSelectedGame(null)} />}
    </div>
  );
}
