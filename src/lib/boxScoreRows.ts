import type { BoxScoreColumn, BoxScoreGroup, BoxScoreTotal } from "../predictor-ui";
import type { PlayerPropPrediction } from "../types";
import { POSITION_ORDER, isSkillPosition, keyYardage, type SkillPosition } from "./playerRank";

/**
 * The caller-side shaping for the predicted box score.
 *
 * `BoxScore` is presentational on purpose: it never fetches and never reorders,
 * because only this side knows that a box score is a team's projected score
 * read top to bottom, with the depth chart deciding who is above whom. So the
 * grouping, the ordering, the columns and the totals are all built here, as a
 * pure function of the prop payload, and tested without rendering anything.
 */

/** The key of the one column that is a rate rather than a quantity. */
export const TD_COLUMN_KEY = "td_pct";

type MarketKey = "passing_yards" | "rushing_yards" | "carries" | "receiving_yards" | "receptions";

// The model predicts these markets and the anytime-TD classifier, and nothing
// else (see models/player_props.py POSITION_MARKETS on both the NFL and the CFB
// API). There is deliberately no sportsbook column here: the earlier pass of
// the plan had FanDuel lines the model does not produce, and a column that can
// only ever be a dash — dashed out or otherwise — is a promise the backend
// cannot keep.
const MARKETS: Record<MarketKey, { label: string; unit: string }> = {
  passing_yards: { label: "Pass yds", unit: "passing yards" },
  rushing_yards: { label: "Rush yds", unit: "rushing yards" },
  carries: { label: "Carries", unit: "carries" },
  receiving_yards: { label: "Rec yds", unit: "receiving yards" },
  receptions: { label: "Rec", unit: "receptions" },
};

function marketColumn(market: MarketKey): BoxScoreColumn {
  const { label, unit } = MARKETS[market];
  return {
    key: market,
    label,
    // The grid is terse — "42.3" on its own is not a sentence — so each cell
    // carries a screen-reader label saying whose number it is.
    describe: (value, row) =>
      value == null
        ? `${row.name}: no ${unit} projection`
        : `${row.name}: ${value} projected ${unit}`,
  };
}

// A percentage rather than the raw 0-1 probability, because the column says
// "%" and `BoxScore` formats a plain number.
const TD_COLUMN: BoxScoreColumn = {
  key: TD_COLUMN_KEY,
  label: "TD %",
  describe: (value, row) =>
    value == null
      ? `${row.name}: no touchdown projection`
      : `${row.name}: ${value.toFixed(0)} percent chance to score a touchdown`,
};

export const BOX_SCORE_COLUMNS: Record<SkillPosition, BoxScoreColumn[]> = {
  QB: [marketColumn("passing_yards"), TD_COLUMN],
  RB: [
    marketColumn("rushing_yards"),
    marketColumn("carries"),
    marketColumn("receiving_yards"),
    marketColumn("receptions"),
    TD_COLUMN,
  ],
  WR: [marketColumn("receiving_yards"), marketColumn("receptions"), TD_COLUMN],
  TE: [marketColumn("receiving_yards"), marketColumn("receptions"), TD_COLUMN],
};

/** The columns for one position; empty for a position the model has no market for. */
export function boxScoreColumnsFor(position: string): BoxScoreColumn[] {
  return isSkillPosition(position) ? BOX_SCORE_COLUMNS[position] : [];
}

function cellValue(prop: PlayerPropPrediction, column: BoxScoreColumn): number | null {
  if (column.key === TD_COLUMN_KEY) {
    // Rounded to one decimal because the column is a percentage read to the
    // point, and 0.3 * 100 is 30.000000000000004 in binary floating point.
    return Math.round(prop.anytime_td_prob * 1000) / 10;
  }
  const value = (prop as unknown as Record<string, unknown>)[column.key];
  // null, not 0: the market is either predicted or it is absent, and an absent
  // market rendered as 0 would claim the model said "nothing".
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Starters above bench. Three ranks, not two: a row the depth chart did not
 * resolve sorts *after* the rows it did, because an unknown row can never be
 * promoted to "starter" on the strength of a number the feed did not supply.
 */
function starterRank(prop: PlayerPropPrediction): number {
  if (prop.is_starter === true) return 0;
  if (prop.is_starter === false) return 1;
  return 2;
}

function slot(prop: PlayerPropPrediction): number | null {
  return typeof prop.depth_slot === "number" && Number.isFinite(prop.depth_slot) ? prop.depth_slot : null;
}

function compareRows(a: PlayerPropPrediction, b: PlayerPropPrediction): number {
  const byRank = starterRank(a) - starterRank(b);
  if (byRank !== 0) return byRank;

  const aSlot = slot(a);
  const bSlot = slot(b);
  // Depth-chart order when the chart has it. NFL's `depth_slot` is the order
  // the players appear in the feed, which is the only claim about who is above
  // whom that is better than the model's own yardage guess.
  if (aSlot !== null && bSlot !== null && aSlot !== bSlot) return aSlot - bSlot;

  // No depth chart (CFB has none at all, and NFL's live payload does not carry
  // the field yet): fall back to the model's own projection, then the TD
  // chance, then the name. Ties broken by name so the same data always renders
  // in the same order, rather than shuffling between reloads.
  return (
    keyYardage(b) - keyYardage(a) ||
    b.anytime_td_prob - a.anytime_td_prob ||
    a.player_name.localeCompare(b.player_name)
  );
}

function teamSubtotals(rows: PlayerPropPrediction[], columns: BoxScoreColumn[], teamOrder: readonly string[]): BoxScoreTotal[] {
  // One row per team. `teamOrder` puts the game's own order on them (the modal
  // passes away-then-home, so the two totals read in the same order as the
  // scoreline at the top of the detail view); any team it does not name keeps
  // its first appearance, so the output is never silently dropped.
  const present = [...new Set(rows.map((row) => row.recent_team))];
  const teams = [...teamOrder.filter((team) => present.includes(team)), ...present.filter((team) => !teamOrder.includes(team))];
  return teams.map((team) => {
    const own = rows.filter((row) => row.recent_team === team);
    return {
      label: `${team} total`,
      values: columns.map((column, i) => {
        // A rate has no total. 0.3 + 0.1 is 0.4 — forty percent of the team
        // scoring — which is not a number a column headed "TD %" can carry.
        if (column.key === TD_COLUMN_KEY) return null;
        const numbers = own.map((row) => cellValue(row, columns[i]));
        // A total is only claimed when every row underneath it was predicted.
        // Summing 80 + 25 while one player simply has no carries projection
        // would understate the team and read as a fact -- so the cell is left
        // empty, not quietly short.
        let total = 0;
        for (const n of numbers) {
          if (n === null) return null;
          total += n;
        }
        return total;
      }),
    };
  });
}

/**
 * One group per position, in QB → RB → WR → TE order, each already ordered
 * starters-then-bench. A position with no players is omitted rather than
 * rendered as an empty block. `teamOrder` orders the totals rows; see
 * `teamSubtotals`.
 */
export function buildBoxScoreGroups(props: PlayerPropPrediction[], teamOrder: readonly string[] = []): BoxScoreGroup[] {
  const groups: BoxScoreGroup[] = [];
  for (const position of POSITION_ORDER) {
    // Matching on the position rather than testing "is this a skill position"
    // is what drops kickers and linemen: they have no market, so they have no
    // columns, so a row for them could only ever be empty.
    const players = props.filter((prop) => prop.position === position).sort(compareRows);
    if (players.length === 0) continue;
    const columns = BOX_SCORE_COLUMNS[position];
    groups.push({
      position,
      rows: players.map((prop, i) => ({
        key: prop.player_id,
        name: prop.player_name,
        position,
        team: prop.recent_team,
        order: i,
        // `?? null`, never a default of false: the field is absent on CFB (no
        // depth chart exists) and absent from the NFL weeks the snapshot has
        // not rebuilt yet. Both are "unknown", and the table has to say so.
        isStarter: prop.is_starter ?? null,
        values: columns.map((column) => cellValue(prop, column)),
        // The position's headline yardage number is the one that shouts.
        emphasisIndex: 0,
      })),
      subtotals: teamSubtotals(players, columns, teamOrder),
    });
  }
  return groups;
}
