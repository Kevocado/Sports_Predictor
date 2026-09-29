import type { PlayerPropPrediction } from "../types";

// Fantasy-relevance order, not alphabetical -- QB first since passing
// yardage predictions are the most consistently meaningful, TE last since
// it's the shallowest position.
export const POSITION_ORDER = ["QB", "RB", "WR", "TE"] as const;
export type SkillPosition = (typeof POSITION_ORDER)[number];

export function isSkillPosition(position: string): position is SkillPosition {
  return (POSITION_ORDER as readonly string[]).includes(position);
}

// Whichever of the three yardage fields this prop carries, defaulting to 0 for a
// prop with none (a kicker). Reads as a fallback chain, so the reason it is safe
// to index by position alone has to be stated precisely -- the earlier comment
// here did not, and it contradicted the symbol it cited.
//
// It is NOT true that the model projects one market per position. NFL/CFB
// `models/player_props.py::POSITION_MARKETS` is a `dict[str, list[str]]` whose
// own comment reads "Each position can now have multiple markets (e.g. RB gets
// both rushing_yards and carries)", `predict_props` loops
// `for market in POSITION_MARKETS.get(position, [])`, and RB actually gets
// `[rushing_yards, carries]` while WR and TE get
// `[receiving_yards, receptions]`. So a position has several markets, and
// `PlayerPropPrediction` carries them all -- `carries` and `receptions` are
// populated too and are simply not yardage, which is why this skips them.
//
// What holds is narrower, and it is a fact about today's table rather than a
// guarantee of the symbol: of the three *yardage* fields, each position is
// currently given at most one (QB passing, RB rushing, WR/TE receiving), so in
// practice this is "whichever one exists". Nothing enforces that. If a position
// were ever given two yardage markets the `??` chain returns the first and
// silently drops the other -- keyYardage would need to sum, or take a market
// argument, at that point. `GameDetailModal.yardageBreakdown` already has to
// handle the multi-market case and reports one row per market for that reason.
export function keyYardage(prop: PlayerPropPrediction): number {
  return prop.passing_yards ?? prop.rushing_yards ?? prop.receiving_yards ?? 0;
}

export function keyStatLabel(position: string): string {
  if (position === "QB") return "Pass yds";
  if (position === "RB") return "Rush yds";
  return "Rec yds";
}

// Group by position (dropping anything that isn't a skill position -- a
// kicker or lineman pulled in by a roster fallback has no yardage/TD
// prediction worth showing), each group sorted by that position's own key
// stat, ties broken by anytime-TD probability.
export function groupByPosition(props: PlayerPropPrediction[]): Record<SkillPosition, PlayerPropPrediction[]> {
  const groups = {} as Record<SkillPosition, PlayerPropPrediction[]>;
  for (const position of POSITION_ORDER) groups[position] = [];
  for (const prop of props) {
    if (isSkillPosition(prop.position)) groups[prop.position].push(prop);
  }
  for (const position of POSITION_ORDER) {
    groups[position].sort((a, b) => keyYardage(b) - keyYardage(a) || b.anytime_td_prob - a.anytime_td_prob);
  }
  return groups;
}

// Tiered coloring for a single probability (anytime-TD chance) -- same
// visual language as the old win-probability confidence tiers, just tuned
// for a lower-magnitude stat (a 50% anytime-TD chance is already elite;
// nothing in this model realistically clears 70%).
export function tdConfidenceTone(prob: number): string {
  if (prob >= 0.45) return "bg-win/20 text-win";
  if (prob >= 0.2) return "bg-sp-gold/20 text-sp-gold";
  return "bg-sp-700/60 text-sp-text-dim";
}
