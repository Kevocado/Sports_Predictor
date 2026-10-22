import type {
  CalibrationSeries,
  MarketTally,
  RecordModel,
  WeekPoint,
} from "../predictor-ui";
import { marketLabel } from "../predictor-ui";
import type { GameCalibration, GamesTrackRecord, PlayerPropsTrackRecord, PerPickRow, TrackRecord } from "../types";

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

type RawBucket = { lo: number; hi: number; n: number; hit_rate: number | null };

/**
 * The backend's game buckets are over the HOME side's probability (0-25%, 25-50%, 50-75%, 75-100% of "home wins" /
 * "home covers" / "goes over"). The chart is "how sure was the pick": a 30% home chance is a 70% pick on the other side,
 * and that pick was right when the home side did NOT win. So a bucket whose upper edge is at or below 50% is mirrored
 * (confidence 1-hi..1-lo, right = n - hits) and merged with the bucket it lands on; otherwise the chart's axis (which
 * starts at 45%) would silently drop every away-leaning pick.
 */
export function foldGameBuckets(buckets: RawBucket[]): { bucket: string; n: number; correct: number }[] {
  const merged = new Map<string, { lo: number; hi: number; n: number; correct: number }>();
  const add = (lo: number, hi: number, n: number, correct: number) => {
    const key = `${lo.toFixed(4)}-${hi.toFixed(4)}`;
    const held = merged.get(key) ?? { lo, hi, n: 0, correct: 0 };
    held.n += n;
    held.correct += correct;
    merged.set(key, held);
  };
  for (const b of buckets) {
    if (b.n <= 0 || b.hit_rate == null) continue;
    const hits = Math.round(b.hit_rate * b.n);
    if (b.hi <= 0.5) add(1 - b.hi, 1 - b.lo, b.n, b.n - hits);
    else if (b.lo >= 0.5) add(b.lo, b.hi, b.n, hits);
    // a bucket straddling 50% cannot be assigned to one side: left out rather than guessed
  }
  return [...merged.values()]
    .sort((x, y) => x.lo - y.lo)
    .map((m) => ({ bucket: `${Math.round(m.lo * 100)}-${Math.round(m.hi * 100)}%`, n: m.n, correct: m.correct }));
}

function calibrationSeries(cal: GameCalibration | undefined, player_props: PlayerPropsTrackRecord): CalibrationSeries[] {
  const series: CalibrationSeries[] = [];

  // Games markets: moneyline, spread (ats), total — from the backend's
  // get_calibration() buckets, converted to the hub's bucket shape.
  if (cal) {
    const markets: { key: string; label: string; buckets: { lo: number; hi: number; n: number; hit_rate: number | null }[] }[] = [
      { key: "moneyline", label: "Moneyline", buckets: cal.winner },
      { key: "ats", label: "Spread", buckets: cal.spread },
      { key: "totals", label: "Total", buckets: cal.total },
    ];
    for (const m of markets) {
      const folded = foldGameBuckets(m.buckets);
      if (folded.length === 0) continue;
      series.push({ key: m.key, label: m.label, buckets: folded });
    }
  }

  // Player props: anytime TD confidence buckets.
  const tdBuckets = player_props.anytime_td.confidence_buckets ?? [];
  const usableTd = tdBuckets.filter((b) => b.n > 0 && b.hit_rate != null);
  if (usableTd.length > 0) {
    series.push({
      key: "anytime_td",
      label: "Anytime TD",
      buckets: usableTd.map((b) => ({
        bucket: b.label,
        n: b.n,
        correct: b.hit_rate != null ? Math.round(b.hit_rate * b.n) : 0,
      })),
    });
  }

  return series;
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
    // The API puts the buckets at the top level of the response; an older shape nested them under games.
    calibration: calibrationSeries(record.calibration ?? record.games.calibration, record.player_props),
    recent: recentPicks(games.per_pick),
  };
}
