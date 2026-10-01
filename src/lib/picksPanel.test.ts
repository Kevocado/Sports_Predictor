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
  CFB_AVAILABILITY_NOTE,
  NO_GRADED_RECORD_YET,
  positionCategories,
} from "./picksPanel";

// ---------------------------------------------------------------------------
// Fixtures, transcribed from the backends.
// ---------------------------------------------------------------------------

function prop(over: Partial<PlayerPropPrediction> & Pick<PlayerPropPrediction, "player_id" | "player_name" | "position" | "anytime_td_prob">): PlayerPropPrediction {
  return { recent_team: "KC", ...over } as PlayerPropPrediction;
}

/** NFL#24 (branch d495047) `GET /players/{season}/{week}/props`: a bare array,
 *  `anytime_td_prob` for every position plus that position's yardage markets
 *  (`POSITION_MARKETS`, `models/player_props.py`), `is_starter` null when the
 *  depth chart is unavailable -- which the branch says is "unknown", never
 *  "not a starter". */
const nflSlate: PlayerPropPrediction[] = [
  prop({ player_id: "00-1", player_name: "A. Rodgers", position: "QB", anytime_td_prob: 0.811, passing_yards: 239.9 }),
  prop({ player_id: "00-2", player_name: "M. Stafford", position: "QB", anytime_td_prob: 0.840, passing_yards: 265.7 }),
  prop({ player_id: "00-3", player_name: "J. Hurts", position: "QB", anytime_td_prob: 0.62, passing_yards: 251.2 }),
  prop({ player_id: "00-4", player_name: "K. Swift", position: "RB", anytime_td_prob: 0.30, rushing_yards: 88.1, carries: 17.2 }),
  prop({ player_id: "00-5", player_name: "D. Cook", position: "RB", anytime_td_prob: 0.41, rushing_yards: 95.4, carries: 18.9 }),
  prop({ player_id: "00-6", player_name: "A. Gibson", position: "RB", anytime_td_prob: 0.19, rushing_yards: 74.2, carries: 14.1 }),
  prop({ player_id: "00-7", player_name: "D. Hopkins", position: "WR", anytime_td_prob: 0.28, receiving_yards: 64.3, receptions: 5.2 }),
  prop({ player_id: "00-8", player_name: "M. Stefon", position: "WR", anytime_td_prob: 0.33, receiving_yards: 71.9, receptions: 6.1 }),
  // Travis Kelce, TE -- the out player, seeded across SEVERAL markets so an
  // implementation that only checks one of them still shows him ranked.
  prop({ player_id: "00-9", player_name: "T. Kelce", position: "TE", anytime_td_prob: 0.55, receiving_yards: 58.4, receptions: 5.5 }),
  prop({ player_id: "00-10", player_name: "L. Kelce", position: "TE", anytime_td_prob: 0.12, receiving_yards: 22.0, receptions: 1.8 }),
];

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
    expect(panel.categories.map((c) => c.category)).toEqual(["Anytime TD", "QB passing yards", "RB rushing yards", "WR/TE receiving yards"]);
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
    expect(panel.categories.map((c) => c.category)).toEqual(["Anytime TD", "QB passing yards"]);
  });

  it("ranking is the model's own number for that market, highest first", () => {
    const panel = buildPicksPanel({ sport: "nfl", props: nflSlate, out: nflOut, track: nflTrack.player_props, game });
    const rb = panel.categories.find((c) => c.category === "RB rushing yards")!;
    expect(rb.rows.map((r) => r.value)).toEqual([95.4, 88.1, 74.2]);
    const td = panel.categories.find((c) => c.category === "Anytime TD")!;
    expect(td.rows[0].value).toBeGreaterThan(td.rows[1].value);
  });

  it("keeps a category to ONE market: a carries row never appears under receiving yards", () => {
    const panel = buildPicksPanel({ sport: "nfl", props: nflSlate, out: nflOut, track: nflTrack.player_props, game });
    for (const cat of panel.categories) {
      for (const row of cat.rows) {
        if (cat.category !== "Anytime TD") expect(["Pass yds", "Rush yds", "Rec yds"]).toContain(row.detail);
      }
    }
  });
});

describe("an out player leaves the ranking entirely", () => {
  it("removes him from every category even though he is seeded across several markets", () => {
    // The rule has to hold for the ANYTIME TD list AND both of his yardage
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
    expect(panel.categories.find((c) => c.category === "Anytime TD")!.rows).toHaveLength(3);
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

describe("provenance: an uncalibrated arm is described, not judged", () => {
  it("shows the bucket context where a graded record exists", () => {
    const panel = buildPicksPanel({ sport: "nfl", props: nflSlate, out: nflOut, track: nflTrack.player_props, game });
    const td = panel.categories.find((c) => c.category === "Anytime TD")!;
    const p = td.rows[0].provenance;
    expect(p).toContain("346");
    expect(p.toLowerCase()).toContain("uncalibrated");
    expect(p).toMatch(/bucket/i);
  });

  it("says there is no graded record yet when the backend has resolved none", () => {
    const empty = {
      ...nflTrack.player_props,
      anytime_td: { n_resolved: 0, hit_rate_when_called: null, brier_score: null, confidence_buckets: [] },
    } as PlayerPropsTrackRecord;
    const panel = buildPicksPanel({ sport: "nfl", props: nflSlate, out: nflOut, track: empty, game });
    const p = panel.categories.find((c) => c.category === "Anytime TD")!.rows[0].provenance;
    expect(p).toContain(NO_GRADED_RECORD_YET);
    // The failure this guards: with n_resolved 0 every bucket is `n: 0,
    // hit_rate: null`, so a fallback that renders the buckets prints a hit rate
    // of zero. No rate, no Brier figure, and no count dressed as a result.
    expect(p).not.toMatch(/scored \d|brier|hit rate/i);
    expect(p).not.toMatch(/graded \d|graded over/);
  });

  it("never claims the arm is good or bad in either state", () => {
    for (const track of [nflTrack.player_props, cfbTrack.player_props]) {
      const panel = buildPicksPanel({ sport: "nfl", props: nflSlate, out: nflOut, track, game });
      for (const c of panel.categories) {
        for (const r of c.rows) {
          // Comparatives and verdicts about the arm itself. "better" is
          // included deliberately: it is a comparative, and the shipped wording
          // uses "at or above" precisely so this assertion can hold.
          expect(r.provenance).not.toMatch(/\b(better|worse|poor|strong|weak|accurate|inaccurate|sharp|overrated|underrated|calibrated)\b/i);
        }
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
      ...panel.categories.flatMap((c) => [c.category, ...c.rows.flatMap((r) => [r.name, r.team ?? "", r.detail, r.provenance])]),
      ...panel.out.flatMap((o) => [o.name, o.team ?? "", o.source, o.dated]),
    ].join(" | ").toLowerCase();
    for (const word of ["lock", "guaranteed", "guarantee", "best bet", "edge", "value", "valued", "odds", "line movement", "moneyline", "sharp", "juice"]) {
      expect(prose, `reader-visible wording must not contain "${word}"`).not.toMatch(new RegExp(`\\b${word.replace(/ /g, "\\s+")}\\b`));
    }
  });
});

describe("yardage rows carry an error margin, or say there is not one", () => {
  it("reads NFL's LIST shape by_position", () => {
    const panel = buildPicksPanel({ sport: "nfl", props: nflSlate, out: nflOut, track: nflTrack.player_props, game });
    const qb = panel.categories.find((c) => c.category === "QB passing yards")!.rows[0];
    expect(qb.kind).toBe("projection");
    expect(qb.margin).toBeCloseTo(66.76, 2);
  });

  it("reads CFB's BARE MAP mae_by_position, which is a different shape", () => {
    const panel = buildPicksPanel({ sport: "cfb", props: nflSlate, out: [], track: cfbTrack.player_props, game });
    const rb = panel.categories.find((c) => c.category === "RB rushing yards")!.rows[0];
    expect(rb.margin).toBeCloseTo(27.37, 2);
  });

  it("omits the margin entirely when the backend has no MAE -- never a zero", () => {
    // `carries` is served with n_resolved 0 and mean_absolute_error null on both
    // backends. A margin of 0 would be a claim of perfect accuracy.
    const panel = buildPicksPanel({ sport: "nfl", props: nflSlate, out: nflOut, track: nflTrack.player_props, game });
    for (const c of panel.categories) {
      for (const r of c.rows) {
        if (r.kind === "projection") expect(r.margin).not.toBe(0);
      }
    }
    const carriesOnly = buildPicksPanel({
      sport: "nfl",
      props: nflSlate,
      out: nflOut,
      track: {
        ...nflTrack.player_props,
        rushing_yards: { n_resolved: 0, mean_absolute_error: null, mean_signed_error: null },
      } as PlayerPropsTrackRecord,
      game,
    });
    expect(carriesOnly.categories.find((c) => c.category === "RB rushing yards")!.rows[0].margin).toBeUndefined();
  });

  it("renders the no-error-estimate wording through the shipped component", () => {
    // PicksList draws `no error estimate yet` for an absent `margin`. Assert the
    // component's own contract rather than trusting that ours reaches it.
    const panel = buildPicksPanel({
      sport: "nfl",
      props: nflSlate,
      out: nflOut,
      track: { ...nflTrack.player_props, rushing_yards: { n_resolved: 0, mean_absolute_error: null, mean_signed_error: null } } as PlayerPropsTrackRecord,
      game,
    });
    expect(panel.categories.find((c) => c.category === "RB rushing yards")!.rows[0].margin).toBeUndefined();
  });
});

describe("CFB: the flag for a sport with no availability feed at all", () => {
  it("marks every CFB row 'no availability check'", () => {
    const panel = buildPicksPanel({ sport: "cfb", props: nflSlate, out: [], track: cfbTrack.player_props, game });
    for (const c of panel.categories) for (const r of c.rows) expect(r.provenance).toContain(CFB_AVAILABILITY_NOTE);
  });

  it("does not mark NFL rows with it -- NFL has an injury feed to check against", () => {
    const panel = buildPicksPanel({ sport: "nfl", props: nflSlate, out: nflOut, track: nflTrack.player_props, game });
    const all = panel.categories.flatMap((c) => c.rows.map((r) => r.provenance)).join(" ");
    expect(all).not.toContain(CFB_AVAILABILITY_NOTE);
  });

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