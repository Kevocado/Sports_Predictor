import { kickoff, parseKickoff, spread, type Segment, type Side, type Status } from "../predictor-ui";
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
// A game past kickoff with no score is Live only this long; after that the
// score feed is behind (or the game was postponed), so it's "Awaiting result".
const LIVE_WINDOW_MS = 5 * 3600_000;
const kickoffMs = (g: GameSummary) => parseKickoff(g.gameday).getTime();

function localTime(iso: string, timeZone?: string): string {
  return parseKickoff(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
}

// Spread, total, weather, rest and (CFB) conferences in plain words. nflverse
// spread_line is positive when the home team is favoured, so the home line is
// its negative.
function metaLine(g: GameSummary): string | undefined {
  const parts: string[] = [];
  if (g.spread_line != null) parts.push(spread(g.home_team, -g.spread_line));
  if (g.total_line != null) parts.push(`Total ${g.total_line}`);
  if (g.roof && g.roof !== "outdoors") parts.push(g.roof === "dome" ? "Dome" : "Roof closed");
  if (g.temp != null) parts.push(`${Math.round(g.temp)}°F`);
  if (g.wind != null) parts.push(`${Math.round(g.wind)} mph wind`);
  if (g.away_rest != null && g.home_rest != null) parts.push(`Rest ${g.away_rest} v ${g.home_rest} days`);
  if (g.div_game) parts.push("Divisional");
  if (g.home_conference || g.away_conference) {
    parts.push(`${g.away_conference || "Independent"} at ${g.home_conference || "Independent"}`);
  }
  return parts.length ? parts.join(" · ") : undefined;
}

function pickFrom(game: GameSummary, homeProb: number): { pick: CardModel["pick"]; bar: Segment[] } {
  const pick =
    homeProb === 0.5
      ? { label: "Toss-up", prob: 0.5 }
      : homeProb > 0.5
        ? { label: game.home_team, prob: homeProb }
        : { label: game.away_team, prob: 1 - homeProb };
  return {
    pick,
    bar: [
      { label: game.away_team, prob: 1 - homeProb },
      { label: game.home_team, prob: homeProb },
    ],
  };
}

/**
 * One NFL/CFB game as a family MatchCard: away left, home right (US order).
 *
 * The honesty rule: a game that has started is judged only on the pick
 * snapshotted before kickoff (the week row), never on today's model; a pick
 * rebuilt after kickoff is labelled and never counted; with no snapshot there
 * is no pick. Games still to come show the current model's pick.
 */
export function toCardModel(
  game: GameSummary,
  prediction: GamePrediction | null,
  week: WeekPrediction | undefined,
  isNext: boolean,
  timeZone?: string,
  now: number = Date.now(),
): CardModel {
  const final = isFinal(game);
  const started = final || kickoffMs(game) <= now;
  const day = kickoff(game.gameday, timeZone).split(" · ")[0];
  const model: CardModel = {
    left: { code: game.away_team, name: game.away_team },
    right: { code: game.home_team, name: game.home_team },
    centre: final ? `${game.away_score}–${game.home_score}` : localTime(game.gameday, timeZone),
    when: final ? `${day} · Final` : day,
    meta: metaLine(game),
  };

  const snapshotProb = week && week.status !== "untracked" ? week.home_win_prob : undefined;
  const homeProb = started ? snapshotProb : (prediction?.home_win_prob ?? snapshotProb);
  if (homeProb != null) Object.assign(model, pickFrom(game, homeProb));

  if (final) {
    if (!model.pick) model.status = "nopick";
    else if (week?.rebuilt) model.status = "rebuilt";
    else if (week?.status === "resolved" && week.verdict) model.status = week.verdict.moneyline.hit ? "called" : "missed";
  } else if (started) {
    if (now - kickoffMs(game) < LIVE_WINDOW_MS) model.status = "live";
    else model.when = `${day} · Awaiting result`;
  } else if (isNext) {
    model.status = "next";
  }
  return model;
}

/** Whether a game has kicked off (by the clock, or because it has a score). */
export function hasStarted(game: GameSummary, now: number = Date.now()): boolean {
  return isFinal(game) || kickoffMs(game) <= now;
}

/** "Next up": every game at the earliest kickoff still to come, in the current week only. */
export function nextUpIds(games: GameSummary[], isCurrentWeek: boolean, now: number = Date.now()): Set<string> {
  if (!isCurrentWeek) return new Set();
  const future = games.filter((g) => !isFinal(g) && kickoffMs(g) > now);
  if (future.length === 0) return new Set();
  const first = Math.min(...future.map(kickoffMs));
  return new Set(future.filter((g) => kickoffMs(g) === first).map((g) => g.game_id));
}

/** The zone(s) a week's kickoff times are shown in: "CDT", or "CDT/CST" across a clock change. */
export function kickoffZones(gamedays: string[], timeZone?: string): string {
  const zones = [...new Set(gamedays.map((iso) => kickoff(iso, timeZone).split(" ").pop() ?? ""))].filter(Boolean);
  return zones.join("/");
}

/** The week's record: resolved picks made before kickoff; rebuilt ones counted apart. */
export function weekTally(week: WeekPrediction[]): { hits: number; settled: number; rebuilt: number } {
  const resolved = week.filter((w) => w.status === "resolved" && w.verdict);
  const counted = resolved.filter((w) => !w.rebuilt);
  return {
    hits: counted.filter((w) => w.verdict!.moneyline.hit).length,
    settled: counted.length,
    rebuilt: resolved.length - counted.length,
  };
}
