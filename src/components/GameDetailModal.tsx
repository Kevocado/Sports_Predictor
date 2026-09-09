import { useEffect, useState } from "react";
import type { GamePrediction, GameSummary, PlayerPropPrediction, SportApi } from "../types";
import { TeamName } from "./TeamName";
import { MarketBar } from "./MarketBar";

export function filterPlayerPropsForGame(
  props: PlayerPropPrediction[],
  game: Pick<GameSummary, "home_team" | "away_team">,
): PlayerPropPrediction[] {
  return props.filter((prop) => prop.recent_team === game.home_team || prop.recent_team === game.away_team);
}

interface Props { game: GameSummary; api: SportApi; onClose: () => void; }

export function GameDetailModal({ game, api, onClose }: Props) {
  const [prediction, setPrediction] = useState<GamePrediction | null>(null);
  const [predictionError, setPredictionError] = useState<string | null>(null);
  const [allProps, setAllProps] = useState<PlayerPropPrediction[] | null>(null);
  const [propsLoading, setPropsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setPrediction(null); setPredictionError(null); setAllProps(null); setPropsLoading(true);
    
    // Fetch main game prediction
    api.gamePrediction(game.season, game.week, game.game_id)
      .then((r) => { if (!cancelled) setPrediction(r); })
      .catch((e) => { if (!cancelled) setPredictionError(e instanceof Error ? e.message : String(e)); });
    
    // Fetch player props safely (fails silently to an empty array so it doesn't break UI)
    api.playerProps(game.season, game.week)
      .then((r) => { if (!cancelled) setAllProps(r); })
      .catch(() => { if (!cancelled) setAllProps([]); })
      .finally(() => { if (!cancelled) setPropsLoading(false); });

    return () => { cancelled = true; };
  }, [api, game.season, game.week, game.game_id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const gameProps = allProps ? filterPlayerPropsForGame(allProps, game) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-modal-in relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-sp-border bg-sp-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-sp-border px-6 py-4">
          <span className="text-sm font-semibold text-sp-text-dim">Game Detail & Model Projections</span>
          <button onClick={onClose} className="rounded-full p-1.5 text-sp-text-dim transition hover:bg-sp-800 hover:text-sp-text" aria-label="Close">✕</button>
        </div>
        <div className="overflow-y-auto px-6 py-6 space-y-6">
          
          {/* Header Matchup */}
          <div className="flex items-center justify-center gap-10">
            <TeamName team={game.away_team} size="lg" />
            <span className="text-2xl font-black text-sp-text-faint">at</span>
            <TeamName team={game.home_team} size="lg" />
          </div>

          {/* Match Markets Section */}
          <section>
            <div className="mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-sp-text-faint">Match Markets</h3>
              <p className="text-[11px] text-sp-text-dim">Win probability (straight-up), point spread cover chance, and total points line.</p>
            </div>
            {predictionError && <p className="text-xs text-loss">{predictionError}</p>}
            {!prediction && !predictionError && <p className="text-xs text-sp-text-faint">Loading match markets…</p>}
            {prediction && <div className="flex flex-col gap-1.5">
              <MarketBar label={`${game.home_team} win`} prob={prediction.home_win_prob} />
              <MarketBar label={`${game.away_team} win`} prob={prediction.away_win_prob} />
              {prediction.home_cover_prob != null && <MarketBar label={`${game.home_team} covers spread`} prob={prediction.home_cover_prob} />}
              {prediction.away_cover_prob != null && <MarketBar label={`${game.away_team} covers spread`} prob={prediction.away_cover_prob} />}
              {prediction.over_prob != null && <MarketBar label="Over total points" prob={prediction.over_prob} />}
              {prediction.under_prob != null && <MarketBar label="Under total points" prob={prediction.under_prob} />}
            </div>}
          </section>

          {/* Player Props Section */}
          <section>
            <div className="mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-sp-text-faint">Model Player Projections</h3>
              <p className="text-[11px] text-sp-text-dim">Predicted touchdown probabilities and expected yardage milestones from your machine learning models.</p>
            </div>
            {propsLoading && <p className="text-xs text-sp-text-faint">Loading player projections…</p>}
            {!propsLoading && gameProps && gameProps.length === 0 && (
              <p className="text-xs text-sp-text-faint rounded-lg bg-sp-850/40 p-3 border border-sp-border/40">
                No player projection props available for this specific game yet. (Ensure your backend player-props route catches external API timeouts gracefully).
              </p>
            )}
            {gameProps && gameProps.length > 0 && <div className="flex flex-col gap-1.5">
              {gameProps.map((prop) => (
                <div key={prop.player_id} className="flex items-center justify-between rounded-lg bg-sp-850/60 px-3 py-2 text-sm">
                  <span className="text-sp-text font-medium">{prop.player_name} <span className="text-xs text-sp-text-faint font-normal">({prop.position} · {prop.recent_team})</span></span>
                  <div className="flex items-center gap-3 font-mono text-xs text-sp-text-dim">
                    <span>TD {Math.round(prop.anytime_td_prob * 100)}%</span>
                    {prop.passing_yards != null && <span>Pass {Math.round(prop.passing_yards)}yd</span>}
                    {prop.rushing_yards != null && <span>Rush {Math.round(prop.rushing_yards)}yd</span>}
                    {prop.receiving_yards != null && <span>Rec {Math.round(prop.receiving_yards)}yd</span>}
                  </div>
                </div>
              ))}
            </div>}
          </section>

        </div>
      </div>
    </div>
  );
}