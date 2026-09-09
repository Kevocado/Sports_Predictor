import type { PlayerPropPrediction } from "../types";

// Fantasy-relevance order, not alphabetical -- QB first since passing
// yardage predictions are the most consistently meaningful, TE last since
// it's the shallowest position.
export const POSITION_ORDER = ["QB", "RB", "WR", "TE"] as const;
export type SkillPosition = (typeof POSITION_ORDER)[number];

export function isSkillPosition(position: string): position is SkillPosition {
  return (POSITION_ORDER as readonly string[]).includes(position);
}

// Every player prop only ever has ONE of these three populated (the model
// only predicts the yardage market that matches the player's own
// position -- see NFL/CFB's models/player_props.py POSITION_YARDAGE_MARKET)
// so this is really just "whichever one exists," not a real fallback chain.
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
// visual language as ConfidenceBadge's win-probability tiers, just tuned
// for a lower-magnitude stat (a 50% anytime-TD chance is already elite;
// nothing in this model realistically clears 70%).
export function tdConfidenceTone(prob: number): string {
  if (prob >= 0.45) return "bg-win/20 text-win";
  if (prob >= 0.2) return "bg-sp-gold/20 text-sp-gold";
  return "bg-sp-700/60 text-sp-text-dim";
}
