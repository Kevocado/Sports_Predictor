import { kickoff, spread, type Segment, type Side, type Status } from "../predictor-ui";
import type { GamePrediction, GameSummary, WeekPrediction } from "../types";

export type CardModel = {
  left: Side;
  right: Side;
  centre: string;
  status?: Status;
  pick?: { label: string; prob: number };
  when: string;
  meta?: string;
  bar?: Segment[];
};

const isFinal = (g: GameSummary) => g.home_score != null && g.away_score != null;

function localTime(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
}

// Spread, total, weather and rest in plain words. nflverse spread_line is
// positive when the home team is favoured, so the home line is its negative.
function metaLine(g: GameSummary): string | undefined {
  const parts: string[] = [];
  if (g.spread_line != null) parts.push(spread(g.home_team, -g.spread_line));
  if (g.total_line != null) parts.push(`Total ${g.total_line}`);
  if (g.temp != null) parts.push(`${Math.round(g.temp)}°F`);
  if (g.wind != null) parts.push(`${Math.round(g.wind)} mph wind`);
  if (g.away_rest != null && g.home_rest != null) parts.push(`Rest ${g.away_rest} v ${g.home_rest} days`);
  if (g.div_game) parts.push("Divisional");
  return parts.length ? parts.join(" · ") : undefined;
}

/**
 * One NFL/CFB game as a family MatchCard: away left, home right (US order),
 * the favourite as the pick, and a final judged only on its pre-kickoff
 * verdict. A final with no snapshot is "No pick yet", never a miss.
 */
export function toCardModel(
  game: GameSummary,
  prediction: GamePrediction | null,
  week: WeekPrediction | undefined,
  isNext: boolean,
  timeZone?: string,
): CardModel {
  const final = isFinal(game);
  const day = kickoff(game.gameday, timeZone).split(" · ")[0];
  const model: CardModel = {
    left: { code: game.away_team, name: game.away_team },
    right: { code: game.home_team, name: game.home_team },
    centre: final ? `${game.away_score}–${game.home_score}` : localTime(game.gameday, timeZone),
    when: final ? `${day} · Final` : day,
    meta: metaLine(game),
  };

  const homeProb = prediction?.home_win_prob ?? (week?.status === "resolved" ? week.home_win_prob : undefined);
  const untrackedFinal = final && week?.status === "untracked";
  if (homeProb != null && !untrackedFinal) {
    const homeFav = homeProb >= 0.5;
    model.pick = { label: homeFav ? game.home_team : game.away_team, prob: homeFav ? homeProb : 1 - homeProb };
    model.bar = [
      { label: game.away_team, prob: 1 - homeProb },
      { label: game.home_team, prob: homeProb },
    ];
  }

  if (final) {
    if (week?.status === "resolved" && week.verdict) model.status = week.verdict.moneyline.hit ? "called" : "missed";
    else if (!model.pick || untrackedFinal) model.status = "nopick";
  } else if (isNext) {
    model.status = "next";
  }
  return model;
}

/** The time zone the page's kickoff times are shown in ("CDT"), said once per page. */
export function kickoffZone(iso: string, timeZone?: string): string {
  return kickoff(iso, timeZone).split(" ").pop() ?? "";
}

/** The week's record: resolved pre-kickoff picks only (snapshots are refused after kickoff). */
export function weekTally(week: WeekPrediction[]): { hits: number; settled: number; rebuilt: number } {
  const resolved = week.filter((w) => w.status === "resolved" && w.verdict);
  return { hits: resolved.filter((w) => w.verdict!.moneyline.hit).length, settled: resolved.length, rebuilt: 0 };
}
