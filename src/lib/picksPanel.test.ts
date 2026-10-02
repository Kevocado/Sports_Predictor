// Task 4 (frontend): the picks panel for NFL and CFB.
//
// Every test here is about a sentence the reader would be shown, because that
// is the whole of this task's risk. The numbers are already measured and
// already on the track-record page; what can go wrong on a picks row is the
// wording around them.
//
// Fixtures are MOCKS of the two backends' contracts, transcribed field for
// field from each repo's source at the SHAs named in each case. NFL#24 was open
// and unmerged when this was written, so its `/out` route and its gating of the
// props path are transcribed from that branch, not from a running deployment.
// CFB's shapes are from its merged origin/main.

import { describe, expect, it } from "vitest";
import type { PlayerPropPrediction, PlayerPropsTrackRecord, TrackRecord } from "../types";
import {
  buildPicksPanel,
  positionCategories,
} from "./picksPanel";

// ---------------------------------------------------------------------------
// Fixtures, transcribed from the backends.
// ---------------------------------------------------------------------------

function prop(over: Partial<PlayerPropPrediction> & Pick<PlayerPropPrediction, "player_id" | "player_name" | "position" | "anytime_td_prob">): PlayerPropPrediction {
  return { recent_team: "KC", ...over } as PlayerPropPrediction;
}

/** The QB passing-TD call as NFL_Predictor flattens it, transcribed field for
 *  field from `origin/main` after NFL#26: `models/player_props.py::predict_props`
 *  writes `passing_td_{line,line_source,side,mu,over_prob,under_prob,prob,distribution}`
 *  onto the same props row. QB-only, and omitted entirely when the model is
 *  absent.
 *
 *  The `mu`, line, side and probability pairs below are internally CONSISTENT
 *  with `models/qb_passing_td.py`: the line is the nearest half point to `mu`
 *  (`floor(mu) + 0.5`), and the side is whichever tail is larger. Both calls
 *  appear on purpose, because whether the line lands above or below `mu` decides
 *  them: `mu` 2.94 rounds to a line of 2.5 (below mu -> Over), `mu` 2.31 rounds
 *  to 2.5 (above mu -> Under). A fixture with only one of them would hide a
 *  sign error. `passing_td_prob` is `call_prob`, i.e. the larger of the two. */
function qbPassingTd(call: {
  mu: number;
  line: number;
  side: "over" | "under";
  overProb: number;
  underProb: number;
}): Pick<PlayerPropPrediction, "passing_td_line" | "passing_td_line_source" | "passing_td_side" | "passing_td_mu" | "passing_td_over_prob" | "passing_td_under_prob" | "passing_td_prob" | "passing_td_distribution"> {
  return {
    passing_td_line: call.line,
    passing_td_line_source: "model_line",
    passing_td_side: call.side,
    passing_td_mu: call.mu,
    passing_td_over_prob: call.overProb,
    passing_td_under_prob: call.underProb,
    passing_td_prob: Math.max(call.overProb, call.underProb),
    passing_td_distribution: "poisson",
  };
}

/** NFL#24 (branch d495047) `GET /players/{season}/{week}/props`: a bare array,
 *  `anytime_td_prob` for every position plus that position's yardage markets
 *  (`POSITION_MARKETS`, `models/player_props.py`), `is_starter` null when the
 *  depth chart is unavailable -- which the branch says is "unknown", never
 *  "not a starter".
 *
 *  The `anytime_td_prob` values are POST-NFL#26. Since the label became
 *  `rushing_tds + receiving_tds` (`ANYTIME_TD_LABEL_VERSION = 2`), a
 *  quarterback's number is his own RUSHING and receiving, so the old
 *  passing-dominated 0.84 no longer exists for one: Rodgers is at 0.06 and
 *  Stafford -- the mobile one with real goal-line carries -- at 0.21. That is
 *  not a cosmetic edit. The old fixture encoded the very behaviour Kevin's
 *  decision removed, and a test suite that still passed it would have been
 *  asserting the wrong thing. */
const nflSlate: PlayerPropPrediction[] = [
  prop({ player_id: "00-1", player_name: "A. Rodgers", position: "QB", anytime_td_prob: 0.06, passing_yards: 239.9, ...qbPassingTd({ mu: 3.12, line: 3.5, side: "under", overProb: 0.33, underProb: 0.67 }) }),
  prop({ player_id: "00-2", player_name: "M. Stafford", position: "QB", anytime_td_prob: 0.21, passing_yards: 265.7, ...qbPassingTd({ mu: 2.94, line: 2.5, side: "over", overProb: 0.6, underProb: 0.4 }) }),
  prop({ player_id: "00-3", player_name: "J. Hurts", position: "QB", anytime_td_prob: 0.12, passing_yards: 251.2, ...qbPassingTd({ mu: 2.31, line: 2.5, side: "under", overProb: 0.38, underProb: 0.62 }) }),
  prop({ player_id: "00-4", player_name: "K. Swift", position: "RB", anytime_td_prob: 0.30, rushing_yards: 88.1, carries: 17.2 }),
  prop({ player_id: "00-5", player_name: "D. Cook", position: "RB", anytime_td_prob: 0.41, rushing_yards: 95.4, carries: 18.9 }),
  prop({ player_id: "00-6", player_name: "A. Gibson", position: "RB", anytime_td_prob: 0.19, rushing_yards: 74.2, carries: 14.1 }),
  prop({ player_id: "00-7", player_name: "D. Hopkins", position: "WR", anytime_td_prob: 0.28, receiving_yards: 64.3, receptions: 5.2 }),
  prop({ player_id: "00-8", player_name: "M. Stefon", position: "WR", anytime_td_prob: 0.33, receiving_yards: 71.9, receptions: 6.1 }),
  // Travis Kelce, TE -- the out player, seeded across SEVERAL markets so an
  // implementation that only checks one of them still shows him ranked. On the
  // post-#26 label his 0.55 is a receiving-TD probability, which is what makes
  // him the top TD row before the injury gate removes him.
  prop({ player_id: "00-9", player_name: "T. Kelce", position: "TE", anytime_td_prob: 0.55, receiving_yards: 58.4, receptions: 5.5 }),
  prop({ player_id: "00-10", player_name: "L. Kelce", position: "TE", anytime_td_prob: 0.12, receiving_yards: 22.0, receptions: 1.8 }),
];

/** The slate that makes Kevin's rule load-bearing rather than incidental.
 *
 *  P. Mahomes is seeded with the HIGHEST rush-or-receive number in the slate --
 *  above all three of the others -- while his own passing call is the strongest
 *  on the board. So a panel that simply ranked by `anytime_td_prob` would put
 *  him first under "Rush or receiving TD" on nothing but the fact that he is a
 *  quarterback with a number, and only the QB floor in `picksPanel.ts` stops
 *  it. Every other value here is below the floor too, so removing it empties
 *  the category rather than shuffling it, which makes the red-check
 *  unambiguous.
 *
 *  His rush-or-receive number is 0.12 rather than 0.00 because that is what a
 *  payload for such a player actually looks like: the classifier is never
 * exactly zero, and a filter written against `=== 0` would not have caught him. */
const qbPassingOnlySlate: PlayerPropPrediction[] = [
  prop({ player_id: "01-1", player_name: "P. Mahomes", position: "QB", anytime_td_prob: 0.12, passing_yards: 271.4, ...qbPassingTd({ mu: 3.34, line: 3.5, side: "under", overProb: 0.4, underProb: 0.6 }) }),
  prop({ player_id: "01-2", player_name: "D. Cook", position: "RB", anytime_td_prob: 0.11, rushing_yards: 95.4, carries: 18.9 }),
  prop({ player_id: "01-3", player_name: "M. Stefon", position: "WR", anytime_td_prob: 0.09, receiving_yards: 71.9, receptions: 6.1 }),
  prop({ player_id: "01-4", player_name: "L. Kelce", position: "TE", anytime_td_prob: 0.08, receiving_yards: 22.0, receptions: 1.8 }),
];

/** CFB's `/props`, transcribed from CFB_Predictor `origin/main` (dfd3e21).
 *
 *  Two deliberate differences from the NFL slate, and both matter:
 *
 *  1. **CFB's `anytime_td` still sums passing TDs**
 *     (`features/player_usage.py::build_player_training_frame` adds
 *     `passing_tds`). So a CFB quarterback's number is legitimately high, the
 *     category keeps its "Anytime TD" title here, and the NFL QB floor must
 *     NOT be applied to this panel. 0.72 and 0.61 are the shape CFB's label
 *     really produces.
 *  2. **The `passing_td_*` fields are carried anyway**, which no real CFB
 *     payload does -- CFB has no `passing_tds` model. Seeding them is what
 *     makes the "unchanged" pin below prove something: if the panel ever grew
 *     the category off the presence of the fields alone, this slate would
 *     grow it and the byte-for-byte comparison against `origin/main` would
 *     fail. CFB's panel has to be immune to the fields being present. */
const cfbSlate: PlayerPropPrediction[] = [
  { ...prop({ player_id: "02-1", player_name: "J. Burrow", position: "QB", anytime_td_prob: 0.72, passing_yards: 288.4, ...qbPassingTd({ mu: 3.44, line: 3.5, side: "under", overProb: 0.45, underProb: 0.55 }) }), recent_team: "LSU" },
  { ...prop({ player_id: "02-2", player_name: "J. Daniels", position: "QB", anytime_td_prob: 0.61, passing_yards: 254.9, ...qbPassingTd({ mu: 2.88, line: 2.5, side: "over", overProb: 0.58, underProb: 0.42 }) }), recent_team: "ALA" },
  { ...prop({ player_id: "02-3", player_name: "B. Bowens", position: "WR", anytime_td_prob: 0.44, receiving_yards: 71.2, receptions: 5.8 }), recent_team: "ALA" },
  { ...prop({ player_id: "02-4", player_name: "Z. Carter", position: "RB", anytime_td_prob: 0.38, rushing_yards: 92.6, carries: 17.3 }), recent_team: "LSU" },
  { ...prop({ player_id: "02-5", player_name: "D. Smith", position: "WR", anytime_td_prob: 0.21, receiving_yards: 48.3, receptions: 4.1 }), recent_team: "LSU" },
  { ...prop({ player_id: "02-6", player_name: "J. Milroe", position: "QB", anytime_td_prob: 0.14, passing_yards: 198.2, ...qbPassingTd({ mu: 1.12, line: 1.5, side: "under", overProb: 0.31, underProb: 0.69 }) }), recent_team: "ALA" },
];

const cfbGame = { home_team: "ALA", away_team: "LSU" };

/** NFL#24 `GET /players/{season}/{week}/out`: its own route, so `/props` stays a
 *  bare array for the three consumers that need one. Always 200 with a list --
 *  never a 503, because "we could not check" and "nobody is out" are different
 *  facts. */
const nflOut = [
  {
    player_id: "00-9",
    player_name: "T. Kelce",
    recent_team: "KC",
    report_status: "Out",
    report_season: 2026,
    report_week: 12,
    source: "NFL official injury report",
  },
];

/** NFL `GET /track-record`, as served 2026-10-01: `anytime_td` graded with
 *  `n_resolved: 346`, a Brier score and three buckets. Yardage markets carry
 *  `mean_absolute_error` plus NFL's LIST shape `by_position`. */
const nflTrack: TrackRecord = {
  games: {} as TrackRecord["games"],
  player_props: {
    anytime_td: {
      n_resolved: 346,
      n_called: 31,
      hit_rate_when_called: 0.8387,
      brier_score: 0.1516,
      confidence_buckets: [
        { label: "50-60%", n: 5, hit_rate: 0.6 },
        { label: "60-70%", n: 3, hit_rate: 0.6667 },
        { label: "70%+", n: 23, hit_rate: 0.913 },
      ],
    },
    passing_yards: { n_resolved: 34, mean_absolute_error: 66.76, mean_signed_error: -11.06, by_position: [{ position: "QB", n_resolved: 34, mean_absolute_error: 66.76 }] },
    rushing_yards: { n_resolved: 90, mean_absolute_error: 21.5, mean_signed_error: -0.15, by_position: [{ position: "RB", n_resolved: 90, mean_absolute_error: 21.5 }] },
    receiving_yards: { n_resolved: 222, mean_absolute_error: 22.25, mean_signed_error: 3.87, by_position: [{ position: "WR", n_resolved: 222, mean_absolute_error: 22.25 }] },
    carries: { n_resolved: 0, mean_absolute_error: null, mean_signed_error: null },
    receptions: { n_resolved: 0, mean_absolute_error: null, mean_signed_error: null },
  } as PlayerPropsTrackRecord,
};

/** CFB merged origin/main (d36a4b4, #26): same props shape, and a track record
 *  whose yardage blocks use the BARE MAP `mae_by_position`, not NFL's list. */
const cfbTrack: TrackRecord = {
  games: {} as TrackRecord["games"],
  player_props: {
    anytime_td: {
      n_resolved: 1443,
      n_called: 185,
      hit_rate_when_called: 0.6649,
      brier_score: 0.1698,
      confidence_buckets: [
        { label: "50-60%", n: 54, hit_rate: 0.3889 },
        { label: "60-70%", n: 30, hit_rate: 0.7 },
        { label: "70%+", n: 101, hit_rate: 0.802 },
      ],
    },
    passing_yards: { n_resolved: 258, mean_absolute_error: 65.67, mean_signed_error: 17.41, mae_by_position: { QB: 65.67 } },
    rushing_yards: { n_resolved: 427, mean_absolute_error: 27.37, mean_signed_error: 3.62, mae_by_position: { RB: 27.37 } },
    receiving_yards: { n_resolved: 759, mean_absolute_error: 21.87, mean_signed_error: 1.22, mae_by_position: { WR: 21.87 } },
    carries: { n_resolved: 0, mean_absolute_error: null, mean_signed_error: null, mae_by_position: {} },
    receptions: { n_resolved: 0, mean_absolute_error: null, mean_signed_error: null, mae_by_position: {} },
  } as PlayerPropsTrackRecord,
};

const game = { home_team: "KC", away_team: "BAL" };

// ---------------------------------------------------------------------------

describe("buildPicksPanel categories", () => {
  it("puts each position's own market under its own heading and never another's", () => {
    const panel = buildPicksPanel({ sport: "nfl", props: nflSlate, out: nflOut, track: nflTrack.player_props, game });
    expect(panel.categories.map((c) => c.category)).toEqual(["Rush or receiving TD", "QB passing TDs", "QB passing yards", "RB rushing yards", "WR/TE receiving yards"]);
    for (const cat of panel.categories) {
      for (const row of cat.rows) {
        if (cat.category === "QB passing yards") expect(row.detail).toBe("Pass yds");
        if (cat.category === "RB rushing yards") expect(row.detail).toBe("Rush yds");
        if (cat.category === "WR/TE receiving yards") expect(row.detail).toBe("Rec yds");
      }
    }
  });

  it("renders at most three rows per category, and never a fourth", () => {
    const panel = buildPicksPanel({ sport: "nfl", props: nflSlate, out: nflOut, track: nflTrack.player_props, game });
    for (const cat of panel.categories) expect(cat.rows.length).toBeLessThanOrEqual(3);
    // Three exist per category here, so the ceiling binds rather than the cap.
    expect(panel.categories.find((c) => c.category === "QB passing yards")!.rows).toHaveLength(3);
    // Both new TD headings fill too. A cap that only binds on three of five
    // lists is a cap that will not bind on the other two.
    expect(panel.categories.find((c) => c.category === "Rush or receiving TD")!.rows).toHaveLength(3);
    expect(panel.categories.find((c) => c.category === "QB passing TDs")!.rows).toHaveLength(3);
  });

  it("shows fewer than three rather than padding when the slate is thinner", () => {
    const thin = nflSlate.filter((p) => p.position === "QB");
    const panel = buildPicksPanel({ sport: "nfl", props: thin, out: [], track: nflTrack.player_props, game });
    for (const cat of panel.categories) expect(cat.rows.length).toBeLessThanOrEqual(3);
    // Three QBs exist, so the TD list legitimately fills three. The claim being
    // pinned is that nothing is PADDED: the yardage list has exactly the three
    // that exist, and the categories with no player at all are gone rather than
    // present and empty.
    expect(panel.categories.find((c) => c.category === "QB passing yards")!.rows).toHaveLength(3);
    expect(panel.categories.map((c) => c.category)).not.toContain("RB rushing yards");
    // A slate of two must render two, not three.
    const two = nflSlate.filter((p) => p.position === "QB").slice(0, 2);
    const twoPanel = buildPicksPanel({ sport: "nfl", props: two, out: [], track: nflTrack.player_props, game });
    expect(twoPanel.categories.find((c) => c.category === "QB passing yards")!.rows).toHaveLength(2);
  });

  it("drops a category entirely when no player in the game has that market", () => {
    const qbOnly = nflSlate.filter((p) => p.position === "QB");
    const panel = buildPicksPanel({ sport: "nfl", props: qbOnly, out: [], track: nflTrack.player_props, game });
    expect(panel.categories.map((c) => c.category)).toEqual(["Rush or receiving TD", "QB passing TDs", "QB passing yards"]);
  });

  it("ranking is the model's own number for that market, highest first", () => {
    const panel = buildPicksPanel({ sport: "nfl", props: nflSlate, out: nflOut, track: nflTrack.player_props, game });
    const rb = panel.categories.find((c) => c.category === "RB rushing yards")!;
    expect(rb.rows.map((r) => r.value)).toEqual([95.4, 88.1, 74.2]);
    const td = panel.categories.find((c) => c.category === "Rush or receiving TD")!;
    expect(td.rows[0].value).toBeGreaterThan(td.rows[1].value);
  });

  it("keeps a category to ONE market: a carries row never appears under receiving yards", () => {
    const panel = buildPicksPanel({ sport: "nfl", props: nflSlate, out: nflOut, track: nflTrack.player_props, game });
    const yardageCategories = ["QB passing yards", "RB rushing yards", "WR/TE receiving yards"];
    for (const cat of panel.categories) {
      if (!yardageCategories.includes(cat.category)) continue;
      for (const row of cat.rows) expect(["Pass yds", "Rush yds", "Rec yds"]).toContain(row.detail);
    }
    // And the two TD headings carry no yardage detail either: the call is the
    // detail under "QB passing TDs" and the market's own name under the other.
    const td = panel.categories.find((c) => c.category === "Rush or receiving TD")!;
    for (const row of td.rows) expect(row.detail).toBe("Rush or receiving TD");
  });
});

describe("Kevin's rule: passing TDs cannot put a quarterback in the TD category (2026-10-01)", () => {
  // THE load-bearing test of this change, and the one that was red-checked by
  // deleting the `QB_RUSH_OR_RECEIVE_TD_MIN` filter from `picksPanel.ts` and
  // re-running this file.
  //
  // `qbPassingOnlySlate` is built so that ranking alone CANNOT satisfy the rule:
  // P. Mahomes carries the highest rush-or-receive number on the slate, above
  // all three of the others, and the strongest passing call. Without the floor
  // he is the first row under "Rush or receiving TD" and this fails.
  it("never lists a quarterback whose TD case is his passing arm", () => {
    const panel = buildPicksPanel({ sport: "nfl", props: qbPassingOnlySlate, out: [], track: nflTrack.player_props, game });
    const td = panel.categories.find((c) => c.category === "Rush or receiving TD")!;
    expect(td.rows.map((r) => r.name)).not.toContain("P. Mahomes");
    // He is on this panel for exactly two of its five headings: the QB
    // passing-TD call (his arm, which IS the market there) and QB passing
    // yards (a yardage projection that says nothing about touchdowns). He is on
    // NEITHER rush-or-receive list. Written as a total across the panel so a
    // future category cannot quietly put him back on the TD board.
    const where = (name: string) => panel.categories.filter((c) => c.rows.some((r) => r.name === name)).map((c) => c.category);
    expect(where("P. Mahomes")).toEqual(["QB passing TDs", "QB passing yards"]);
  });

  it("does not merely drop him to make room -- the three rows are non-quarterbacks", () => {
    const panel = buildPicksPanel({ sport: "nfl", props: qbPassingOnlySlate, out: [], track: nflTrack.player_props, game });
    const td = panel.categories.find((c) => c.category === "Rush or receiving TD")!;
    expect(td.rows).toHaveLength(3);
    for (const row of td.rows) expect(row.name).not.toMatch(/Mahomes/);
  });

  it("still lists a quarterback whose OWN rushing earns him the board", () => {
    // The same slate as above, with Mahomes' rush-or-receive number RAISED to
    // 0.44 -- above every one of the three others. Nothing else changes: same
    // player, same position, same passing call, same code path, and now he is
    // on the TD board.
    //
    // This is the half of the rule a "never a quarterback" filter would fail,
    // and the half a filter written against the WRONG field (`passing_td_prob`
    // instead of `anytime_td_prob`) would also fail, because both of his
    // passing numbers are unchanged here.
    const earned = qbPassingOnlySlate.map((p) =>
      p.player_id === "01-1" ? prop({ ...p, anytime_td_prob: 0.44 }) : p,
    );
    const td = buildPicksPanel({ sport: "nfl", props: earned, out: [], track: nflTrack.player_props, game })
      .categories.find((c) => c.category === "Rush or receiving TD")!;
    expect(td.rows.map((r) => r.name)).toEqual(["P. Mahomes", "D. Cook", "M. Stefon"]);
    expect(td.rows[0].value).toBe(0.44);
  });

  it("titles NFL's list by what its number measures, and only NFL's", () => {
    const nfl = buildPicksPanel({ sport: "nfl", props: nflSlate, out: nflOut, track: nflTrack.player_props, game });
    expect(nfl.categories.map((c) => c.category)).toContain("Rush or receiving TD");
    expect(nfl.categories.map((c) => c.category)).not.toContain("Anytime TD");
    // CFB's label still sums passing TDs, so its heading keeps the old name --
    // renaming it there would put a claim on a number that does not mean it.
    const cfb = buildPicksPanel({ sport: "cfb", props: cfbSlate, out: [], track: cfbTrack.player_props, game: cfbGame });
    expect(cfb.categories.map((c) => c.category)).toContain("Anytime TD");
  });
});

describe("QB passing TDs: the model's own over/under call on its own line", () => {
  it("renders the top three QBs by the called side's probability", () => {
    const panel = buildPicksPanel({ sport: "nfl", props: nflSlate, out: nflOut, track: nflTrack.player_props, game });
    const cat = panel.categories.find((c) => c.category === "QB passing TDs")!;
    expect(cat.rows).toHaveLength(3);
    // Rodgers 0.67 > Hurts 0.62 > Stafford 0.60. The order is deliberately NOT
    // the passing-yards order (Stafford 265.7 > Hurts 251.2 > Rodgers 239.9), so
    // a sort that reached for the wrong field would be visible here.
    expect(cat.rows.map((r) => [r.name, r.value])).toEqual([
      ["A. Rodgers", 0.67],
      ["J. Hurts", 0.62],
      ["M. Stafford", 0.6],
    ]);
  });

  it("carries the CALL in detail and the called side's probability as the value", () => {
    const panel = buildPicksPanel({ sport: "nfl", props: nflSlate, out: nflOut, track: nflTrack.player_props, game });
    const cat = panel.categories.find((c) => c.category === "QB passing TDs")!;
    expect(cat.rows.map((r) => r.detail)).toEqual(["Under 3.5", "Under 2.5", "Over 2.5"]);
    // The value is the side that is named. A row that said "Over 2.5" and drew
    // the UNDER probability would be the worst defect this category has, so the
    // pairing is asserted per row rather than as a set.
    for (const row of cat.rows) {
      const over = row.detail.startsWith("Over");
      const p = nflSlate.find((x) => x.player_name === row.name)!;
      const expected = over ? p.passing_td_over_prob : p.passing_td_under_prob;
      expect(row.value, `${row.name} shows ${row.detail}`).toBe(expected);
      expect(row.value).toBe(p.passing_td_prob);
      expect(row.kind).toBe("probability");
    }
  });

  it("keeps the rows to the player, the team and the prediction -- nothing else", () => {
    const panel = buildPicksPanel({ sport: "nfl", props: nflSlate, out: nflOut, track: nflTrack.player_props, game });
    const cat = panel.categories.find((c) => c.category === "QB passing TDs")!;
    for (const row of cat.rows) {
      expect(Object.keys(row).sort()).toEqual(["detail", "key", "kind", "name", "team", "value"]);
      // No provenance, no record, no Brier, no n, no error estimate, no ±.
      const prose = JSON.stringify(row);
      for (const bit of ["brier", "hit_rate", "n_resolved", "graded", "uncalibrated", "MAE", "±", "provenance", "margin", "record", "bucket", "model_line"]) {
        expect(prose, `a passing-TD row must not carry "${bit}"`).not.toContain(bit);
      }
    }
  });

  it("never names the line a book, a market or a price -- it is derived from the projection", () => {
    const panel = buildPicksPanel({ sport: "nfl", props: nflSlate, out: nflOut, track: nflTrack.player_props, game });
    const cat = panel.categories.find((c) => c.category === "QB passing TDs")!;
    const prose = [cat.category, ...cat.rows.map((r) => `${r.name} ${r.team} ${r.detail}`)].join(" | ").toLowerCase();
    // "model line" is the one honest description and it is deliberately NOT on
    // the row: the panel's other headings say what the number is, and Kevin's
    // rule is that a row carries the player and the prediction.
    for (const w of ["line", "book", "sportsbook", "market", "price", "odds", "edge", "over/", "total", "vegas", "consensus", "against the line"]) {
      expect(prose, `a passing-TD row must not describe the line as "${w}"`).not.toMatch(new RegExp(`\\b${w.replace("/", "\\/").replace(" ", "\\s+")}`));
    }
  });

  it("drops a QB row with no call rather than drawing a bare percentage under the heading", () => {
    // `passing_td_prob` with no line and no side is not a pick: the heading
    // promises "Over 2.5" and the row could not say which. Half a call is not
    // rendered.
    const halfCall = [
      prop({ player_id: "03-1", player_name: "A. Halfcall", position: "QB", anytime_td_prob: 0.4, passing_yards: 240, passing_td_prob: 0.62 }),
      ...nflSlate.filter((p) => p.position === "QB"),
    ];
    const panel = buildPicksPanel({ sport: "nfl", props: halfCall, out: [], track: nflTrack.player_props, game });
    const cat = panel.categories.find((c) => c.category === "QB passing TDs")!;
    expect(cat.rows.map((r) => r.name)).not.toContain("A. Halfcall");
    // A row with an unrecognised side is dropped on the same rule.
    const badSide = [
      prop({ player_id: "03-2", player_name: "B. Sideshow", position: "QB", anytime_td_prob: 0.4, passing_yards: 240, passing_td_line: 2.5, passing_td_side: "maybe", passing_td_prob: 0.7 }),
      ...nflSlate.filter((p) => p.position === "QB"),
    ];
    expect(buildPicksPanel({ sport: "nfl", props: badSide, out: [], track: nflTrack.player_props, game })
      .categories.find((c) => c.category === "QB passing TDs")!.rows.map((r) => r.name)).not.toContain("B. Sideshow");
  });

  it("omits the category entirely when no QB in the game carries a call", () => {
    // Every QB field absent: an artifact directory trained before NFL#26 emits
    // none of them, and a heading with nothing under it is not a heading.
    const noCall = nflSlate.map((p) => ({
      ...p,
      passing_td_line: undefined,
      passing_td_side: undefined,
      passing_td_prob: undefined,
    }));
    const panel = buildPicksPanel({ sport: "nfl", props: noCall, out: [], track: nflTrack.player_props, game });
    expect(panel.categories.map((c) => c.category)).not.toContain("QB passing TDs");
    // And the other TD list is untouched by their absence.
    expect(panel.categories.map((c) => c.category)).toContain("Rush or receiving TD");
  });

  it("removes an out quarterback from this category too", () => {
    const outEntry = { player_id: "00-1", player_name: "A. Rodgers", recent_team: "KC", report_status: "Out", report_season: 2026, report_week: 12, source: "NFL official injury report" };
    const panel = buildPicksPanel({ sport: "nfl", props: nflSlate, out: [outEntry], track: nflTrack.player_props, game });
    const cat = panel.categories.find((c) => c.category === "QB passing TDs")!;
    expect(cat.rows.map((r) => r.name)).not.toContain("A. Rodgers");
    expect(panel.out.map((o) => o.name)).toEqual(["A. Rodgers"]);
  });
});

describe("CFB's panel is unchanged: the new categories are NFL's alone", () => {
  // PINNED, not asserted by comment. This literal is the exact output of
  // `buildPicksPanel` on `cfbSlate` as it stood on `origin/main` (18b2722),
  // copied from a run of that code, not written by hand.
  //
  // The comparison includes the QB category question twice over, because the
  // `cfbSlate` fixture deliberately carries `passing_td_*` fields that no real
  // CFB payload has. CFB must be immune to those fields EXISTING, not merely
  // to their absence today.
  const CFB_PANEL_ON_ORIGIN_MAIN = {
    title: "Model's top calls",
    categories: [
      {
        category: "Anytime TD",
        rows: [
          { key: "td-02-1", name: "J. Burrow", team: "LSU", detail: "Anytime TD", value: 0.72, kind: "probability" },
          { key: "td-02-2", name: "J. Daniels", team: "ALA", detail: "Anytime TD", value: 0.61, kind: "probability" },
          { key: "td-02-3", name: "B. Bowens", team: "ALA", detail: "Anytime TD", value: 0.44, kind: "probability" },
        ],
      },
      {
        category: "QB passing yards",
        rows: [
          { key: "passing_yards-02-1", name: "J. Burrow", team: "LSU", detail: "Pass yds", value: 288.4, kind: "projection" },
          { key: "passing_yards-02-2", name: "J. Daniels", team: "ALA", detail: "Pass yds", value: 254.9, kind: "projection" },
          { key: "passing_yards-02-6", name: "J. Milroe", team: "ALA", detail: "Pass yds", value: 198.2, kind: "projection" },
        ],
      },
      {
        category: "RB rushing yards",
        rows: [{ key: "rushing_yards-02-4", name: "Z. Carter", team: "LSU", detail: "Rush yds", value: 92.6, kind: "projection" }],
      },
      {
        category: "WR/TE receiving yards",
        rows: [
          { key: "receiving_yards-02-3", name: "B. Bowens", team: "ALA", detail: "Rec yds", value: 71.2, kind: "projection" },
          { key: "receiving_yards-02-5", name: "D. Smith", team: "LSU", detail: "Rec yds", value: 48.3, kind: "projection" },
        ],
      },
    ],
    out: [],
    availability:
      "No availability check for this sport: there is no injury report or depth-chart feed to check against, " +
      "so no player above has been confirmed or ruled out. That is the absence of a check, not a claim that nobody is out.",
  };

  it("renders byte-identical to what origin/main rendered, on a slate that HAS the NFL fields", () => {
    const panel = buildPicksPanel({ sport: "cfb", props: cfbSlate, out: [], track: cfbTrack.player_props, game: cfbGame });
    expect(JSON.parse(JSON.stringify(panel))).toEqual(CFB_PANEL_ON_ORIGIN_MAIN);
  });

  it("grows no QB passing-TD heading, even though the fields are sitting right there", () => {
    const panel = buildPicksPanel({ sport: "cfb", props: cfbSlate, out: [], track: cfbTrack.player_props, game: cfbGame });
    expect(panel.categories.map((c) => c.category)).not.toContain("QB passing TDs");
    // Proof the fixture could have produced one: three CFB quarterbacks carry a
    // complete call. The panel declines them on the sport, not on a missing
    // field, which is the difference between today's behaviour and a rule.
    const calls = cfbSlate.filter((p) => p.position === "QB" && typeof p.passing_td_prob === "number" && typeof p.passing_td_line === "number" && typeof p.passing_td_side === "string");
    expect(calls.length).toBe(3);
  });

  it("does not apply the NFL QB floor to CFB quarterbacks", () => {
    // CFB's `anytime_td` label still sums passing TDs
    // (`features/player_usage.py::build_player_training_frame`), so its
    // quarterbacks' numbers are legitimately what they are. Filtering them by a
    // rush-or-receive floor would change CFB's panel on a definition CFB has not
    // adopted. Burrow at 0.72 and Daniels at 0.61 are both under the NFL
    // floor's *premise* and above its number -- and both stay.
    const panel = buildPicksPanel({ sport: "cfb", props: cfbSlate, out: [], track: cfbTrack.player_props, game: cfbGame });
    const td = panel.categories.find((c) => c.category === "Anytime TD")!;
    expect(td.rows.map((r) => r.name)).toEqual(["J. Burrow", "J. Daniels", "B. Bowens"]);
  });
});

describe("an out player leaves the ranking entirely", () => {
  it("removes him from every category even though he is seeded across several markets", () => {
    // The rule has to hold for the rush-or-receive list AND both of his yardage
    // markets. He outranks every WR/TE on TD and every receiving row on yards.
    const panel = buildPicksPanel({ sport: "nfl", props: nflSlate, out: nflOut, track: nflTrack.player_props, game });
    expect(panel.out.map((p) => p.name)).toEqual(["T. Kelce"]);
    const everyRowName = panel.categories.flatMap((c) => c.rows.map((r) => r.name));
    expect(everyRowName).not.toContain("T. Kelce");
    for (const cat of panel.categories) {
      for (const row of cat.rows) expect(row.out).not.toBe(true);
    }
  });

  it("does not backfill his slot with a fourth player -- the cap is a cap", () => {
    const panel = buildPicksPanel({ sport: "nfl", props: nflSlate, out: nflOut, track: nflTrack.player_props, game });
    expect(panel.categories.find((c) => c.category === "Rush or receiving TD")!.rows).toHaveLength(3);
    // WR/TE receiving has four players, one of them out, so three remain -- and
    // three is already the ceiling, so there was never room for a fourth to be
    // swapped in. The TD list is the load-bearing case: Kelce is its top row,
    // and the list still shows three, filled from below, never four.
    expect(panel.categories.find((c) => c.category === "WR/TE receiving yards")!.rows).toHaveLength(3);
    expect(panel.categories.every((c) => c.rows.length <= 3)).toBe(true);
  });

  it("names him exactly once, below the lists, with a source and a date in words", () => {
    const panel = buildPicksPanel({ sport: "nfl", props: nflSlate, out: nflOut, track: nflTrack.player_props, game });
    const occurrences = JSON.stringify(panel).split('"T. Kelce"').length - 1;
    expect(occurrences).toBe(1);
    const entry = panel.out[0];
    expect(entry.source).toBe("NFL official injury report");
    expect(entry.dated).toMatch(/\w/);
    expect(entry.dated).not.toMatch(/^\d+$/); // never a bare epoch
  });

  it("ignores an out entry for a player who is not in this game's slate at all", () => {
    // NFL#24 filters these server-side, but the frontend must not attribute a
    // removal that never happened if it is handed one anyway.
    const panel = buildPicksPanel({
      sport: "nfl",
      props: nflSlate,
      out: [{ ...nflOut[0], player_id: "00-nobody", player_name: "Nobody Here" }],
      track: nflTrack.player_props,
      game,
    });
    expect(panel.out).toEqual([]);
  });
});

describe("a row is the player and the prediction, nothing else (Kevin, 2026-10-01)", () => {
  it("carries exactly six fields on EVERY row, including the two new TD categories", () => {
    const panel = buildPicksPanel({ sport: "nfl", props: nflSlate, out: nflOut, track: nflTrack.player_props, game });
    for (const c of panel.categories) {
      for (const r of c.rows) {
        expect(Object.keys(r).sort()).toEqual(["detail", "key", "kind", "name", "team", "value"]);
      }
    }
  });

  it("never composes a claim of an edge, a price or a guarantee -- no odds feed exists", () => {
    const panel = buildPicksPanel({ sport: "nfl", props: nflSlate, out: nflOut, track: nflTrack.player_props, game });
    // Only the WORDS a reader sees. `JSON.stringify(panel)` would also match
    // `PickRow.value` -- the shared component's own required field name, which
    // is the number on the row and not a claim about it -- so serialising the
    // whole object makes this assertion pass for the wrong reason. Word
    // boundaries on the adjective forms too, so "value" cannot hide inside
    // "valued" without being caught and "edge" cannot ride along in "knowledge".
    const prose = [
      panel.title,
      panel.availability,
      ...panel.categories.flatMap((c) => [c.category, ...c.rows.flatMap((r) => [r.name, r.team ?? "", r.detail])]),
      ...panel.out.flatMap((o) => [o.name, o.team ?? "", o.source, o.dated]),
    ].join(" | ").toLowerCase();
    for (const word of ["lock", "guaranteed", "guarantee", "best bet", "edge", "value", "valued", "odds", "line movement", "moneyline", "sharp", "juice", "sportsbook", "against the spread"]) {
      expect(prose, `reader-visible wording must not contain "${word}"`).not.toMatch(new RegExp(`\\b${word.replace(/ /g, "\\s+")}\\b`));
    }
    // The scan has to have seen the new rows, or passing it means nothing about
    // them. Fifteen rows: three per category across five categories.
    expect(panel.categories).toHaveLength(5);
    expect(panel.categories.flatMap((c) => c.rows)).toHaveLength(15);
  });

  it("draws no ± and no record text on the QB passing-TD rows specifically", () => {
    const panel = buildPicksPanel({ sport: "nfl", props: nflSlate, out: nflOut, track: nflTrack.player_props, game });
    const rows = panel.categories.find((c) => c.category === "QB passing TDs")!.rows;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const json = JSON.stringify(row);
      for (const bit of ["±", "brier", "hit_rate", "n_resolved", "n_called", "graded", "record", "bucket", "margin", "provenance"]) {
        expect(json, `a passing-TD row must not contain "${bit}"`).not.toContain(bit);
      }
      expect(row.margin).toBeUndefined();
      expect(row.provenance).toBeUndefined();
    }
  });
});

describe("CFB: the flag for a sport with no availability feed at all", () => {
  it("claims no CFB player is available, in any wording", () => {
    const panel = buildPicksPanel({ sport: "cfb", props: nflSlate, out: [], track: cfbTrack.player_props, game });
    const text = JSON.stringify(panel).toLowerCase();
    expect(text).not.toMatch(/\b(is|are|confirmed|cleared|expected) to play\b/);
    expect(text).not.toContain("available");
  });

  it("words its empty out list as the ABSENCE of a feed, never as nobody being out", () => {
    const panel = buildPicksPanel({ sport: "cfb", props: nflSlate, out: [], track: cfbTrack.player_props, game });
    expect(panel.out).toEqual([]);
    // "Nobody is out" and "we have no feed to check" are different facts and a
    // reader must not be able to confuse them.
    expect(panel.availability.toLowerCase()).toContain("no availability check");
    // The refusal has to be a real refusal, and it has to be recognisable as
    // one. Stripping the negating clauses first is the point: a naive
    // /nobody is out/ scan flags the phrase inside "...not a claim that nobody is
    // out", which is the required wording rather than the defect being hunted.
    const asserted = panel.availability
      .toLowerCase()
      .replace(/,?\s*(that is )?not a claim that nobody is out\.?/g, "")
      .replace(/,?\s*so no player above has been confirmed or ruled out\.?/g, "");
    expect(asserted).not.toMatch(/no players? are out|nobody is out|all players|everyone is/i);
    expect(asserted.toLowerCase()).toContain("no injury report or depth-chart feed");
  });

  it("says the same thing when CFB is handed an out list it cannot have", () => {
    const panel = buildPicksPanel({ sport: "cfb", props: nflSlate, out: nflOut, track: cfbTrack.player_props, game });
    expect(panel.out).toEqual([]);
    expect(panel.availability.toLowerCase()).toContain("no availability check");
  });

  it("distinguishes NFL's empty out list from CFB's: NFL's route ran and found nobody", () => {
    const panel = buildPicksPanel({ sport: "nfl", props: nflSlate, out: [], track: nflTrack.player_props, game });
    expect(panel.availability).not.toContain("no availability check");
    expect(panel.availability).toMatch(/checked|nobody listed/i);
  });
});

describe("CFB never grows a targets market", () => {
  it("has no targets category, and the source field is refused rather than drawn", () => {
    const withTargets = [
      ...nflSlate,
      // `targets` is not on `PlayerPropPrediction` at all -- it is structurally
      // NaN in CFB's source data. Cast so the point lands: even IF a backend grew
      // the field, this panel must not rank it or name it.
      prop({ player_id: "00-t", player_name: "T. Target", position: "WR", anytime_td_prob: 0.9, receiving_yards: 99, ...({ targets: 7.5 } as object) }),
    ];
    const panel = buildPicksPanel({ sport: "cfb", props: withTargets, out: [], track: cfbTrack.player_props, game });
    expect(JSON.stringify(panel).toLowerCase()).not.toContain("targets");
    expect(positionCategories()).not.toContain("targets");
  });
});

describe("only the game's own players are ranked", () => {
  it("drops a player on a third team the fixture does not feature", () => {
    const slate = [...nflSlate, prop({ player_id: "00-x", player_name: "X. Nobody", position: "QB", anytime_td_prob: 0.99, passing_yards: 400, recent_team: "SF" })];
    const panel = buildPicksPanel({ sport: "nfl", props: slate, out: [], track: nflTrack.player_props, game });
    const names = panel.categories.flatMap((c) => c.rows.map((r) => r.name));
    expect(names).not.toContain("X. Nobody");
  });
});

describe("positionCategories", () => {
  it("covers exactly the markets the model actually projects per position", () => {
    expect(positionCategories()).toEqual([
      { position: "QB", market: "passing_yards", category: "QB passing yards", detail: "Pass yds" },
      { position: "RB", market: "rushing_yards", category: "RB rushing yards", detail: "Rush yds" },
      { position: ["WR", "TE"], market: "receiving_yards", category: "WR/TE receiving yards", detail: "Rec yds" },
    ]);
  });
});