import type {
  CalibrationSeries,
  MarketTally,
  RecordModel,
  WeekPoint,
} from "../predictor-ui";
import { marketLabel } from "../predictor-ui";
import type { GamesTrackRecord, PlayerPropsTrackRecord, PerPickRow, TrackRecord } from "../types";

type SportMarket = "moneyline" | "ats" | "totals";

const MARKETS: SportMarket[] = ["moneyline", "ats", "totals"];

/** NBA kept its own label words ("Winner pick", "Total points"); Sports uses
 *  the shared vocabulary where it exists and plain words where the wire key
 *  isn't in it (`ats` -> Spread, `totals` -> Total). */
export const labelFor = (key: SportMarket): string => {
  switch (key) {
    case "moneyline":
      return "Moneyline";
    case "ats":
      return "Spread";
    case "totals":
      return "Total";
  }
  return marketLabel(key);
};

const pctKey = (key: SportMarket) => `pct_${key}_correct` as const;
const nKey = (key: SportMarket) => `n_${key}` as const;

/** correct = rate * n, rounded. Returns null when the rate isn't reported. */
function tally(pct: number | null, n: number | undefined): { correct: number; n: number } | null {
  if (pct == null || n == null) return null;
  return { correct: Math.round(pct * n), n };
}

/** One market's whole-record tally, plus its pre-kickoff subset beside it. */
function marketTally(games: GamesTrackRecord, key: SportMarket): MarketTally {
  const counted = tally(games[pctKey(key)], games[nKey(key)]);
  const pre = games.pre_kickoff
    ? tally(games.pre_kickoff[pctKey(key)], games.pre_kickoff[nKey(key)])
    : null;
  return {
    key,
    label: labelFor(key),
    counted: counted ?? { correct: 0, n: 0 },
    ...(pre ? { preKickoff: pre } : {}),
  };
}

function weekPoint(w: { week: number; tracked: boolean; n_games: number; n_moneyline?: number; pct_moneyline_correct?: number | null }): WeekPoint {
  const correct =
    w.pct_moneyline_correct != null && w.n_moneyline != null ? Math.round(w.pct_moneyline_correct * w.n_moneyline) : 0;
  return { weekStart: `Week ${w.week}`, n: w.n_games, correct, tracked: w.tracked };
}

function calibrationSeries(player_props: PlayerPropsTrackRecord): CalibrationSeries[] {
  const buckets = player_props.anytime_td.confidence_buckets ?? [];
  const usable = buckets.filter((b) => b.n > 0 && b.hit_rate != null);
  if (usable.length === 0) return [];
  return [
    {
      key: "anytime_td",
      label: "Anytime TD",
      buckets: usable.map((b) => ({
        bucket: b.label,
        n: b.n,
        correct: b.hit_rate != null ? Math.round(b.hit_rate * b.n) : 0,
      })),
    },
  ];
}

function recentPicks(per_pick: PerPickRow[] | undefined): { id: string; label: string; pick: string; actual: string; hit: boolean | null; when: string; madeBeforeKickoff: boolean }[] {
  const rows = (per_pick ?? [])
    .filter((p) => p.counted !== false && p.made_before_kickoff)
    .sort((a, b) => b.snapshotted_at.localeCompare(a.snapshotted_at))
    .slice(0, 10);
  return rows.map((p) => ({
    id: `${p.game_id}-${p.market}-${p.snapshotted_at}`,
    label: labelFor(p.market as SportMarket),
    pick: p.pick,
    actual: p.actual,
    hit: p.hit,
    when: p.snapshotted_at,
    madeBeforeKickoff: !!p.made_before_kickoff,
  }));
}

/**
 * Sports adapter: the NFL/CFB `/track-record` payload onto the shared
 * `RecordModel`. NFL and CFB share the same graded markets (moneyline, ATS,
 * totals) and the same counting rule (every counted pick, once per game and
 * market), so one adapter serves both; `sport` only chooses the moment word.
 *
 * `headline` is `counted` per PRODUCT.md: every recorded pick leads, with the
 * pre-kickoff subset shown beside it.
 */
export function toRecordModel(record: TrackRecord): RecordModel {
  const games = record.games;
  const markets = MARKETS.map((key) => marketTally(games, key));
  const lead = markets[0]?.key ?? "moneyline";
  return {
    markets,
    lead,
    headline: "counted",
    weeks: (games.weekly ?? []).map(weekPoint),
    calibration: calibrationSeries(record.player_props),
    recent: recentPicks(games.per_pick),
  };
}
