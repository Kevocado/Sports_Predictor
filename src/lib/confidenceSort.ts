import type { GamePrediction, GameSummary } from "../types";

export function sortByConfidence(
  games: GameSummary[],
  predictions: Record<string, GamePrediction>,
): GameSummary[] {
  const confidence = (game: GameSummary): number => {
    const prediction = predictions[game.game_id];
    if (!prediction) return -1;
    return Math.max(prediction.home_win_prob, prediction.away_win_prob);
  };
  return [...games].sort((a, b) => confidence(b) - confidence(a));
}
