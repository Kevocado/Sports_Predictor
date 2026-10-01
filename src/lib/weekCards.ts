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
 * snapshotted before kickoff (the week row), never on today's model; with no
 * snapshot there is no pick. Games still to come show the current model's pick.
 *
 * A pick recorded after its own kickoff gets the `rebuilt` STATUS, which renders
 * as "Made after kickoff" (`predictor-ui/StatusBadge.tsx`). That is disclosure,
 * not exclusion: `weekTally` counts it, and the track record counts it. The one
 * thing the card must never do is call it something other than what it is.
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

/**
 * The week's record line, in words this repo owns.
 *
 * The tally is NOT handed to `RoundNavigator`, and the reason is that
 * component's line is copy the hub owns: "N/M picks made before kickoff
 * correct". Passing it a count that includes a pick made after kickoff would
 * make those words false on this site -- the exact substitution the 2026-10-01
 * reversal exists to prevent, which is a post-kickoff number presented as a
 * pre-game one. So the words live here, where they change with the rule.
 */
export function weekRecordLine(tally: WeekTally): string | null {
  if (tally.settled === 0) return null;
  return `${tally.hits}/${tally.settled} picks counted correct`;
}

/**
 * The secondary figure, beside the first: the same rows filtered to the picks
 * made before their own kickoff, with its own n.
 *
 * Stated even when it equals the headline's `n`, because a reader who sees
 * "5/5 picks counted correct" cannot tell from that alone whether every one of
 * the five was made in time -- and that is the question this figure answers.
 */
export function weekPreKickoffLine(tally: WeekTally): string | null {
  if (tally.settled === 0) return null;
  const { hits, settled } = tally.preKickoff;
  return `${hits} of ${settled} made before kickoff`;
}

/**
 * The week's record, in the two figures the whole site now uses.
 *
 * `hits`/`settled` count EVERY resolved pick, whenever it was made: the same
 * population as the track record's headline. `preKickoff` is the subset made
 * before kickoff, with its own n, which is the honest read of live performance.
 *
 * The `rebuilt` flag on a row still means what it always meant -- this pick was
 * snapshotted at or after its own game's kickoff -- and it is a fact about TIMING
 * and nothing else. Before 2026-10-01 (predictor-hub #66) this function left those
 * rows out of the count, which meant a re-run model could make a past game's pick
 * stop counting and the record emptied out on every model change.
 *
 * There is deliberately no `rebuilt` key on the return: a tally that reports a
 * post-kickoff count as a peer of `settled` is one line away from a caller
 * rendering it as "excluded". The subset is named for what it is.
 */
export interface WeekTally {
  hits: number;
  settled: number;
  preKickoff: { hits: number; settled: number };
}

export function weekTally(week: WeekPrediction[]): WeekTally {
  const resolved = week.filter((w) => w.status === "resolved" && w.verdict);
  const hit = (w: WeekPrediction) => w.verdict!.moneyline.hit;
  const inTime = resolved.filter((w) => !w.rebuilt);
  return {
    hits: resolved.filter(hit).length,
    settled: resolved.length,
    preKickoff: { hits: inTime.filter(hit).length, settled: inTime.length },
  };
}
