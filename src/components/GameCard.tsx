import type { GamePrediction, GameSummary } from "../types";
import { TeamName } from "./TeamName";
import { ProbabilityBar } from "./ProbabilityBar";
import { ConfidenceBadge } from "./ConfidenceBadge";

function formatKickoff(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return { date: d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }), time: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) };
}

export function GameCard({ game, prediction, onClick }: { game: GameSummary; prediction: GamePrediction | null; onClick: () => void }) {
  const { date, time } = formatKickoff(game.gameday);
  const isFinal = game.home_score != null && game.away_score != null;
  return (
    <div role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => e.key === "Enter" && onClick()} className="clip-corner flex cursor-pointer flex-col gap-3 rounded-xl border border-sp-border bg-sp-850/70 p-4 transition hover:border-sp-gold/40">
      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-sp-text-faint">
        <span>{date} &middot; {time}</span>
        {isFinal ? (
          <span className="rounded bg-sp-700/60 px-1.5 py-0.5 text-sp-text-dim">Final</span>
        ) : prediction ? (
          <ConfidenceBadge homeWinProb={prediction.home_win_prob} awayWinProb={prediction.away_win_prob} />
        ) : (
          <span className="rounded bg-sp-700/60 px-1.5 py-0.5 text-sp-text-dim">Loading…</span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-1 items-center justify-between gap-2">
          <TeamName team={game.away_team} />
          {isFinal && <span className="font-mono text-sm font-semibold text-sp-text">{game.away_score}</span>}
        </div>
        <span className="px-1 text-xs font-medium uppercase text-sp-text-faint">at</span>
        <div className="flex flex-1 items-center justify-between gap-2">
          <TeamName team={game.home_team} />
          {isFinal && <span className="font-mono text-sm font-semibold text-sp-text">{game.home_score}</span>}
        </div>
      </div>
      {prediction ? <ProbabilityBar home={prediction.home_win_prob} away={prediction.away_win_prob} homeLabel={game.home_team} awayLabel={game.away_team} /> : <div className="h-2.5 w-full animate-pulse rounded-full bg-sp-850" />}
      {game.spread_line != null && <p className="text-[11px] text-sp-text-faint">Spread {game.spread_line} · Total {game.total_line ?? "—"}</p>}
      {prediction && (game.home_total_yards || game.away_total_yards) && (
        <div className="flex flex-wrap gap-2 text-[11px] text-sp-text-dim">
          {game.home_total_yards && (
            <span>{game.home_team} Yds: {game.home_total_yards}</span>
          )}
          {game.away_total_yards && (
            <span>{game.away_team} Yds: {game.away_total_yards}</span>
          )}
        </div>
      )}
    </div>
  );
}
