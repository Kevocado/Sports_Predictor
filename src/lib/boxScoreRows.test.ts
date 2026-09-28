import { describe, expect, it } from "vitest";
import { BOX_SCORE_COLUMNS, boxScoreColumnsFor, buildBoxScoreGroups, TD_COLUMN_KEY } from "./boxScoreRows";
import type { PlayerPropPrediction } from "../types";
import type { BoxScoreColumn } from "../predictor-ui";
import type { SkillPosition } from "./playerRank";

function prop(over: Partial<PlayerPropPrediction> & { player_id: string }): PlayerPropPrediction {
  return {
    player_name: over.player_id,
    recent_team: "MIA",
    position: "WR",
    anytime_td_prob: 0.1,
    ...over,
  } as PlayerPropPrediction;
}

/** A prop with NO markets at all, so "the model produced nothing" is reachable. */
function bareProp(player_id: string, over: Partial<PlayerPropPrediction> = {}): PlayerPropPrediction {
  return prop({ player_id, anytime_td_prob: undefined as unknown as number, ...over });
}

const labels = (position: keyof typeof BOX_SCORE_COLUMNS) => BOX_SCORE_COLUMNS[position].map((c) => c.label);

describe("the box score's columns — the model's own markets and nothing else", () => {
  // The model predicts exactly these markets (see models/player_props.py
  // POSITION_MARKETS on both APIs) plus the anytime-TD classifier. A column
  // for a market the model does not produce would have to be rendered as a
  // dash on every single row, so it is not rendered at all.
  it("gives a QB the passing market and the TD chance", () => {
    expect(labels("QB")).toEqual(["Pass yds", "TD %"]);
  });

  it("gives an RB only the markets the model produces for a running back", () => {
    // POSITION_MARKETS on the NFL API is RB: ["rushing_yards", "carries"] with
    // no receiving key, so `Rec yds` and `Rec` could only ever be a dash here.
    // The plan asked for them and then, two lines later, said the columns are
    // "exactly the model's markets" -- the first instruction wins, and a column
    // that is permanently blank is not shipped.
    expect(labels("RB")).toEqual(["Rush yds", "Carries", "TD %"]);
    expect(labels("RB")).not.toContain("Rec yds");
    expect(labels("RB")).not.toContain("Rec");
  });

  it("gives a WR and a TE the receiving and TD columns", () => {
    expect(labels("WR")).toEqual(["Rec yds", "Rec", "TD %"]);
    expect(labels("TE")).toEqual(["Rec yds", "Rec", "TD %"]);
  });

  it("ships no FanDuel column in any position, not even a dashed-out one", () => {
    // An earlier pass of the plan had sportsbook columns the model does not
    // produce. They were ruled out: a permanently-empty column is a promise
    // the backend cannot keep, and a dashed-out one is worse — it advertises
    // the gap on every row instead of once, in this comment.
    const everyColumn = Object.values(BOX_SCORE_COLUMNS).flat();
    for (const column of everyColumn) {
      expect(`${column.key} ${column.label}`).not.toMatch(/fan\s*duel|\bFD\b/i);
    }
    // The whole set of markets, across every position, is the model's:
    // five yardage/count markets plus the anytime-TD classifier.
    expect([...new Set(everyColumn.map((c) => c.key))].sort()).toEqual([
      "carries",
      "passing_yards",
      "receiving_yards",
      "receptions",
      "rushing_yards",
      TD_COLUMN_KEY,
    ]);
  });

  it("uses a column per position, and none for a position it does not model", () => {
    expect(boxScoreColumnsFor("QB").map((c) => c.label)).toEqual(["Pass yds", "TD %"]);
    expect(boxScoreColumnsFor("K")).toEqual([]);
  });
});

describe("grouping by position", () => {
  it("emits QB, RB, WR then TE, and omits a position with no players", () => {
    const groups = buildBoxScoreGroups([
      prop({ player_id: "w1", position: "WR" }),
      prop({ player_id: "q1", position: "QB" }),
      prop({ player_id: "r1", position: "RB" }),
    ]);
    expect(groups.map((g) => g.position)).toEqual(["QB", "RB", "WR"]);
  });

  it("drops a position the model has no market for", () => {
    // A kicker or a lineman can reach the props list through a roster
    // fallback. There is no yardage market for them, so there is nothing to
    // put in a box score row.
    const groups = buildBoxScoreGroups([
      prop({ player_id: "k1", position: "K" }),
      prop({ player_id: "w1", position: "WR" }),
    ]);
    expect(groups.map((g) => g.position)).toEqual(["WR"]);
    expect(groups[0].rows.map((r) => r.name)).toEqual(["w1"]);
  });

  it("carries the row data the table needs: name, team, key and position", () => {
    const groups = buildBoxScoreGroups([prop({ player_id: "00-1", player_name: "Tyreek Hill", recent_team: "MIA" })]);
    expect(groups[0].rows[0]).toMatchObject({
      key: "00-1",
      name: "Tyreek Hill",
      team: "MIA",
      position: "WR",
    });
  });
});

describe("row order — starters first, then bench, in depth-chart order", () => {
  const nfl = [
    prop({ player_id: "b2", position: "WR", is_starter: false, depth_slot: 41, receiving_yards: 90 }),
    prop({ player_id: "s1", position: "WR", is_starter: true, depth_slot: 0, receiving_yards: 40 }),
    prop({ player_id: "b1", position: "WR", is_starter: false, depth_slot: 40, receiving_yards: 20 }),
    prop({ player_id: "s2", position: "WR", is_starter: true, depth_slot: 1, receiving_yards: 60 }),
  ];

  it("orders starters before bench whatever order the feed arrived in", () => {
    const names = buildBoxScoreGroups(nfl)[0].rows.map((r) => r.name);
    expect(names).toEqual(["s1", "s2", "b1", "b2"]);
  });

  it("orders within each tier by depth_slot, not by projected yards", () => {
    // s1 is the depth-chart starter with fewer projected yards than s2. Sorting
    // on the yardage would put the backup first, which is the exact assumption
    // a depth chart exists to remove.
    const rows = buildBoxScoreGroups(nfl)[0].rows;
    expect(rows.slice(0, 2).map((r) => r.values[0])).toEqual([40, 60]);
    expect(rows.map((r) => r.order)).toEqual([0, 1, 2, 3]);
  });

  it("carries the real starter flag through to the row", () => {
    const rows = buildBoxScoreGroups(nfl)[0].rows;
    expect(rows.map((r) => r.isStarter)).toEqual([true, true, false, false]);
  });

  it("treats a missing is_starter as unknown, never as a bench flag", () => {
    // NFL's live prop payload does not carry the field yet (the snapshot's
    // reused weeks predate it). `false` would claim this player is known to be
    // on the bench, which is an assertion about depth-chart data we do not have.
    const rows = buildBoxScoreGroups([prop({ player_id: "x", is_starter: undefined })])[0].rows;
    expect(rows[0].isStarter).toBeNull();
  });

  it("puts an unknown row after the rows the depth chart did resolve", () => {
    const rows = buildBoxScoreGroups([
      prop({ player_id: "unknown", is_starter: null, depth_slot: null, receiving_yards: 10 }),
      prop({ player_id: "bench", is_starter: false, depth_slot: 9, receiving_yards: 20 }),
      prop({ player_id: "starter", is_starter: true, depth_slot: 3, receiving_yards: 30 }),
    ])[0].rows;
    expect(rows.map((r) => r.name)).toEqual(["starter", "bench", "unknown"]);
  });
});

describe("CFB, which has no depth chart at all", () => {
  // CFBD's athlete object carries id/name/stat and no starter field, verified
  // upstream. So every CFB prop is is_starter: null, and the table has to say
  // so on screen rather than inventing a flag from the yardage order.
  const cfb = [
    prop({ player_id: "third", position: "WR", is_starter: null, depth_slot: null, receiving_yards: 20 }),
    prop({ player_id: "first", position: "WR", is_starter: null, depth_slot: null, receiving_yards: 90 }),
    prop({ player_id: "second", position: "WR", is_starter: null, depth_slot: null, receiving_yards: 50 }),
  ];

  it("leaves every row's starter state null so the UI can say 'projected order'", () => {
    const rows = buildBoxScoreGroups(cfb)[0].rows;
    expect(rows.every((r) => r.isStarter === null)).toBe(true);
  });

  it("still orders the rows deterministically, by the model's own projection", () => {
    const names = buildBoxScoreGroups(cfb)[0].rows.map((r) => r.name);
    expect(names).toEqual(["first", "second", "third"]);
  });

  it("is stable across reloads of the same data", () => {
    const shuffled = [cfb[1], cfb[2], cfb[0]];
    expect(buildBoxScoreGroups(shuffled)[0].rows.map((r) => r.name)).toEqual(["first", "second", "third"]);
  });
});

describe("cell values", () => {
  it("reads each column from its own market", () => {
    const [row] = buildBoxScoreGroups([
      prop({ player_id: "rb", position: "RB", rushing_yards: 84.2, carries: 19.4, receiving_yards: 12.5, receptions: 2.1, anytime_td_prob: 0.307 }),
    ])[0].rows;
    expect(row.values).toEqual([84.2, 19.4, 30.7]); // no Rec yds / Rec: RB has no receiving market
  });

  it("is null for a market the model did not produce, and never zero", () => {
    // A WR, because a WR genuinely has receiving columns -- this is a real
    // absent value rather than a column the position never carries. (The RB
    // equivalent stopped existing when RB lost its never-populated receiving
    // columns; keeping the test here keeps the principle covered.)
    const [row] = buildBoxScoreGroups([bareProp("wr", { position: "WR", receiving_yards: 62.0 })])[0].rows;
    // receptions and the TD chance are absent from this payload. 0 would claim
    // the model predicted no catches and no touchdowns.
    expect(row.values).toEqual([62.0, null, null]);
    expect(row.values).not.toContain(0);
  });

  it("is null for a market the model did not produce on an RB too", () => {
    const [row] = buildBoxScoreGroups([bareProp("rb", { position: "RB", rushing_yards: 84.2 })])[0].rows;
    // carries and the TD chance are absent. 0 would claim no carries.
    expect(row.values).toEqual([84.2, null, null]);
    expect(row.values).not.toContain(0);
  });

  it("shows the touchdown chance as a percentage, since the column says %", () => {
    const [row] = buildBoxScoreGroups([prop({ player_id: "qb", position: "QB", passing_yards: 250, anytime_td_prob: 0.8438 })])[0].rows;
    const tdIndex = BOX_SCORE_COLUMNS.QB.findIndex((c) => c.key === TD_COLUMN_KEY);
    expect(row.values[tdIndex]).toBe(84.4);
  });

  it("rounds the percentage to a point, so 30% does not render as 30.000000000000004", () => {
    const [row] = buildBoxScoreGroups([prop({ player_id: "wr", position: "WR", anytime_td_prob: 0.3 })])[0].rows;
    expect(row.values[2]).toBe(30);
  });
});

describe("per-team subtotals", () => {
  const both = [
    prop({ player_id: "m1", recent_team: "MIA", position: "RB", rushing_yards: 80, carries: 18, anytime_td_prob: 0.3 }),
    prop({ player_id: "m2", recent_team: "MIA", position: "RB", rushing_yards: 25, carries: 6, anytime_td_prob: 0.1 }),
    prop({ player_id: "k1", recent_team: "KC", position: "RB", rushing_yards: 100, carries: 20, anytime_td_prob: 0.5 }),
  ];

  it("sums only that team's own rows, in the column it sits under", () => {
    const [group] = buildBoxScoreGroups(both);
    const mia = group.subtotals!.find((t) => t.label === "MIA total")!;
    const kc = group.subtotals!.find((t) => t.label === "KC total")!;
    expect(mia.values).toEqual([105, 24, null]); // RB: 3 columns, no receiving market
    expect(kc.values).toEqual([100, 20, null]);
  });

  it("leaves the TD% total empty, because a rate has no total", () => {
    // 0.3 + 0.1 is 0.4 -- forty percent of the team scoring, which is not a
    // number any column headed "TD %" can honestly carry.
    const [group] = buildBoxScoreGroups(both);
    // Look the column up rather than hard-coding an index. RB used to be five
    // columns wide, so the TD column sat at [4]; when its never-populated
    // receiving columns went it moved to [2] and this test was reading off the
    // end of the array -- passing on `undefined` in some runs and failing in
    // others depending on the row count.
    const tdIndex = BOX_SCORE_COLUMNS[group.position as SkillPosition].findIndex(
      (c: BoxScoreColumn) => c.key === TD_COLUMN_KEY,
    );
    expect(tdIndex).toBeGreaterThan(-1);
    for (const total of group.subtotals!) expect(total.values[tdIndex]).toBeNull();
  });

  it("leaves a total empty when any of that team's rows is missing the market", () => {
    // Summing 80 + 25 while the second player simply had no carries prediction
    // would understate the team and look like a fact.
    const [group] = buildBoxScoreGroups([
      prop({ player_id: "m1", position: "RB", rushing_yards: 80, carries: 18 }),
      prop({ player_id: "m2", position: "RB", rushing_yards: 25 }),
    ]);
    const mia = group.subtotals![0];
    expect(mia.values[0]).toBe(105);
    expect(mia.values[1]).toBeNull();
  });

  it("gives every team in the group its own row, and no row a shared total", () => {
    const [group] = buildBoxScoreGroups(both);
    // First appearance in the group, which is the order the rows are already in.
    expect(group.subtotals!.map((t) => t.label)).toEqual(["KC total", "MIA total"]);
    expect(group.subtotals![0].values[0]).not.toBe(group.subtotals![1].values[0]);
  });

  it("orders the totals rows by the game's own order when it is given one", () => {
    // The modal passes away-then-home so the two totals read in the same order
    // as the scoreline at the top of the detail view.
    const [group] = buildBoxScoreGroups(both, ["MIA", "KC"]);
    expect(group.subtotals!.map((t) => t.label)).toEqual(["MIA total", "KC total"]);
  });

  it("never drops a team the given order does not name", () => {
    const [group] = buildBoxScoreGroups(both, ["MIA"]);
    expect(group.subtotals!.map((t) => t.label)).toEqual(["MIA total", "KC total"]);
  });

  it("sums a position's own group, so two positions never share a total", () => {
    const groups = buildBoxScoreGroups([
      prop({ player_id: "rb", position: "RB", rushing_yards: 80 }),
      prop({ player_id: "qb", position: "QB", passing_yards: 260 }),
    ]);
    expect(groups[0].position).toBe("QB");
    expect(groups[0].subtotals![0].values).toEqual([260, null]);
    expect(groups[1].subtotals![0].values).toEqual([80, null, null]);
  });
});
