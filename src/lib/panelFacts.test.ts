/** The v2 panel's figures, mapped from this site's own data.
 *
 *  Written before the wiring, because the mapping is where a number can go
 *  wrong in a way no component test would notice: the components already prove
 *  they render what they are given, and what they are given is decided here.
 */
import { describe, expect, it } from "vitest";

import { barPick, panelFacts } from "./panelFacts";
import type { MarketTile, Segment } from "../predictor-ui";
import type { GamePrediction, GameSummary } from "../types";

const game = {
  game_id: "401585", season: 2026, week: 3, gameday: "2026-09-24",
  home_team: "KC", away_team: "BAL",
  home_score: null, away_score: null,
  spread_line: -2.5, total_line: 44.5,
} as unknown as GameSummary;

const pred = (over: Partial<GamePrediction> = {}): GamePrediction => ({
  home_win_prob: 0.38, away_win_prob: 0.62,
  home_cover_prob: null, away_cover_prob: null,
  over_prob: null, under_prob: null,
  predicted_margin: -3.4, predicted_total: 45.2,
  ...over,
});

/** The number a formatted figure carries, sign and all: "KC +2.5" -> 2.5,
 *  "model −3.4" -> -3.4, "KC PK" -> 0. (The family's minus is U+2212, which
 *  `Number()` does not read, and `PK` is a line of exactly zero.) */
const shown = (s: string): number => {
  if (s.endsWith("PK")) return 0;
  // The family's minus first: U+2212 is not in `[0-9+-]`, so stripping the
  // non-numerics before translating it would silently turn a negative figure
  // positive — and this helper exists to check signs.
  return Number(s.replaceAll("−", "-").replace(/[^\d.+-]/g, ""));
};

/** Market line minus model margin, as the READER computes it from the two
 *  strings on the tile. This is the disagreement the tile is for, so it is
 *  measured from the rendered text and never from the values that produced it. */
const shownGap = (tile: MarketTile): number =>
  shown(tile.value) - shown(String(tile.sub).split(" ").pop()!);

describe("panelFacts", () => {
  it("maps the §7a NFL fixture exactly", () => {
    // The mock's own numbers, so the render and the spec cannot disagree.
    const { tiles, segments } = panelFacts(game, pred());
    expect(segments.map((s) => `${s.label} ${s.prob}`)).toEqual(["KC 0.38", "BAL 0.62"]);
    expect(tiles.map((t) => `${t.market}:${t.value}`)).toEqual([
      "moneyline:62%",
      "spread:KC +2.5",
      "total:45.2",
    ]);
    expect(tiles[0].sub).toBe("win · BAL");
    expect(tiles[1].sub).toBe("model +3.4");
    expect(tiles[2].sub).toBe("total pts · line 44.5");
  });

  it("gives the moneyline tile the LEADING side, not the underdog's number", () => {
    // A tile whose value is the underdog's 38% answers a question nobody asked,
    // and the bar beneath already carries both figures.
    const { tiles } = panelFacts(game, pred({ home_win_prob: 0.38, away_win_prob: 0.62 }));
    expect(tiles[0].value).toBe("62%");
    const flipped = panelFacts(game, pred({ home_win_prob: 0.62, away_win_prob: 0.38 }));
    expect(flipped.tiles[0].sub).toBe("win · KC");
  });

  it("tags every segment with the market a factor can reference", () => {
    // §13c's highlight is a lookup on this key. An untagged segment cannot be
    // highlighted and the linkage silently does nothing.
    const { segments } = panelFacts(game, pred());
    expect(segments.every((s) => s.market === "moneyline")).toBe(true);
  });

  it("omits a market the data does not carry, rather than passing an empty tile", () => {
    const { tiles } = panelFacts(
      { ...game, spread_line: null, total_line: null },
      pred({ predicted_margin: null, predicted_total: null }),
    );
    expect(tiles.map((t) => t.market)).toEqual(["moneyline"]);
    expect(tiles.every((t) => t.value !== "")).toBe(true);
  });

  it("omits the spread tile when the model has no margin, and keeps the total", () => {
    // They are independent: a site can carry a total with no spread.
    const { tiles } = panelFacts(game, pred({ predicted_margin: null }));
    expect(tiles.map((t) => t.market)).toEqual(["moneyline", "total"]);
  });

  it("omits the spread tile when the market has no line", () => {
    const { tiles } = panelFacts({ ...game, spread_line: null }, pred());
    expect(tiles.map((t) => t.market)).toEqual(["moneyline", "total"]);
  });

  it("treats a missing or nonsensical probability as absent, never as 0", () => {
    // 0% is a claim. A field that did not arrive is not a claim, and rendering
    // it as one is the same class of error as a model inventing a figure.
    for (const bad of [undefined, null, 1.4, -0.2, Number.NaN]) {
      const { tiles, segments } = panelFacts(game, pred({ home_win_prob: bad as never, predicted_margin: null, predicted_total: null }));
      expect(segments).toEqual([]);
      expect(tiles).toEqual([]);
    }
  });

  it("returns nothing at all before the prediction has loaded", () => {
    // The panel is rendered before `gamePrediction` resolves, and an empty
    // object of tiles is what keeps it from flashing a row of dashes.
    expect(panelFacts(game, null)).toEqual({ tiles: [], segments: [] });
    expect(panelFacts(game, undefined)).toEqual({ tiles: [], segments: [] });
  });

  it("names the spread tile's team from the FIELD, not from who the model favours", () => {
    // `spread_line` is the home team's own line (game_outcome.py:78-81: "the
    // home team's expected margin ... the home team covers when margin >
    // spread_line"), so the home team is named whichever way the model leans.
    // Picking the name off the probabilities instead is the defect: the model
    // favouring the away side relabelled the home team's line with the away
    // team's name, and the old test pinned that output as correct.
    //
    // The two arms are the same line rendered under two different model
    // opinions, which is the point: only the tile's own `sub` should move.
    const homeFavoured = panelFacts(game, pred({ home_win_prob: 0.62, away_win_prob: 0.38 }));
    const awayFavoured = panelFacts(game, pred({ home_win_prob: 0.38, away_win_prob: 0.62 }));
    expect(homeFavoured.tiles[1].value).toBe("KC +2.5");
    expect(awayFavoured.tiles[1].value).toBe("KC +2.5");
  });

  it("converts the line into the home team's terms, and the model's margin with it", () => {
    // `spread_line: -2.5` is nflverse's home-frame number, so in the home team's
    // own terms it is +2.5 — RECEIVING 2.5, not giving it. The model's -3.4 is
    // home minus away, which in the same terms is +3.4. Both are flipped once,
    // together, so the two figures on screen are in one convention and their
    // difference is the disagreement: |3.4 - 2.5| = 0.9 points, about the home
    // team, which is what `-3.4 - (-2.5)` says in the payload.
    //
    // Flipping only the line is the trap this guards: "KC +2.5" beside
    // "model -3.4" reads as 5.9 points of disagreement and the tile's whole
    // subject is the disagreement.
    const { tiles } = panelFacts(game, pred());
    expect(tiles[1].value).toBe("KC +2.5");
    expect(tiles[1].sub).toBe("model +3.4");
  });

  it("keeps the real disagreement when the model favours the AWAY team and the two sides have opposite signs", () => {
    // The case the old test got wrong, in its worst shape. The market has the
    // home team GIVING 2.5 (`spread_line: 2.5`) while the model has them LOSING
    // by 3.4 — opposite signs in the home frame, so the model is 5.9 points more
    // bearish on the home team than the market is.
    //
    // Under the old rule this rendered `spread(away_team, 2.5)` = "BAL +2.5": the
    // away team RECEIVING 2.5, which is the market's line read upside down and
    // relabelled, and it looked entirely plausible next to a 62% away probability.
    const { tiles } = panelFacts(
      { ...game, spread_line: 2.5 },
      pred({ home_win_prob: 0.38, away_win_prob: 0.62, predicted_margin: -3.4 }),
    );
    expect(tiles[1].value).toBe("KC −2.5");
    expect(tiles[1].sub).toBe("model +3.4");
    // The two displayed figures differ by the payload's own disagreement, and
    // they show it on the right side: the model's +3.4 is the larger number.
    expect(Math.abs(shownGap(tiles[1]))).toBeCloseTo(5.9, 5);
  });

  it("keeps every spread tile's arithmetic equal to the payload's, in every sign combination", () => {
    // The invariant the tile exists for, as arithmetic rather than as two pinned
    // strings: whatever the model and the market say, the gap between the two
    // DISPLAYED numbers is `predicted_margin - spread_line` from the payload. A
    // single unflipped half would break this in exactly one of the four
    // quadrants, which is why it is swept rather than sampled.
    for (const margin of [-3.4, 0, 3.4]) {
      for (const line of [-2.5, 0, 2.5]) {
        const { tiles } = panelFacts({ ...game, spread_line: line }, pred({ predicted_margin: margin }));
        expect(shownGap(tiles[1]), `margin ${margin}, line ${line}`).toBeCloseTo(margin - line, 5);
      }
    }
  });

  it("draws the spread tile from the line and the margin alone, never from a probability", () => {
    // The team is named because `spread_line` is the home team's field, so the
    // win probabilities are not evidence for anything this tile shows and a
    // missing one is not a reason to drop a market the data does carry. The old
    // guard required both probabilities precisely because it was choosing a team
    // between them.
    // `as never` on the probabilities, as the nonsense-value test above does:
    // `GamePrediction` types them as plain `number`, so reaching the absent case
    // the guard is really about needs the cast, and it is the cast the runtime
    // check exists to survive.
    const { tiles } = panelFacts(
      game,
      pred({ home_win_prob: null as never, away_win_prob: undefined as never, predicted_margin: -3.4 }),
    );
    expect(tiles.map((t) => t.market)).toEqual(["spread", "total"]);
  });
});

/** The bar joins the pick to a segment BY LABEL (`pickIndex` in
 *  `ProbabilityBar`), so a pick whose wording is not one of this site's segment
 *  labels accents nothing. NFL and CFB both build the pick from the same
 *  `game["home_team"]` string this site labels segments with, so the two agree
 *  today — by coincidence of two call sites, not by contract. These tests are
 *  what holds the coincidence harmless rather than load-bearing. */
const segments: Segment[] = [
  { label: "KC", prob: 0.38, market: "moneyline" },
  { label: "BAL", prob: 0.62, market: "moneyline" },
];

describe("barPick", () => {
  it("passes the NFL/CFB vocabulary straight through, unchanged in every field", () => {
    // The shape the services actually send today: the bare team name, which is
    // already a segment label. Nothing is rewritten, and nothing is dropped.
    const pick = { label: "BAL", side: "away" };
    expect(barPick(pick, segments)).toEqual({ label: "BAL", side: "away" });
  });

  it("translates the family's '<team> win' wording onto a segment this site can name", () => {
    // PL's shape, and the one that bit it. If NFL or CFB reword to this, the bar
    // keeps accenting the right segment instead of going blank under a verdict
    // that names a pick. Both sides, because the home side is segment 0 and an
    // implementation that returned index 0 by accident would pass that half.
    expect(barPick({ label: "BAL win" }, segments).label).toBe("BAL");
    expect(barPick({ label: "KC win" }, segments).label).toBe("KC");
  });

  it("carries the rest of the pick through the translation untouched", () => {
    // Only the STRING moves. The pick's identity is the service's, derived
    // server-side from the validated facts, and a translation that invented or
    // dropped a field would be a second opinion wearing the service's clothes.
    expect(barPick({ label: "BAL win", side: "away_ml" }, segments)).toEqual({
      label: "BAL", side: "away_ml",
    });
  });

  it("fails CLOSED on a label it cannot place, returning it unchanged", () => {
    // The unplaceable case, and the reason "unchanged" is the contract: a label
    // the bar cannot match must leave nothing accented — the panel's correct
    // rendering of a bundle with no pick — rather than accenting the nearest
    // segment to a claim nobody made. A team from another game, a reword this
    // helper does not know, an empty label: all of them resolve to -1, never to
    // a guess. This is a SUFFICIENT condition for safety and a guard against
    // regression, not evidence about the service's current wording.
    for (const label of ["BUF win", "Chiefs win", "Ravens to win", "", " win"]) {
      expect(barPick({ label }, segments).label, label).toBe(label);
    }
  });

  it("does not translate a segment label that merely ends in ' win'", () => {
    // A team name that happens to end in the suffix must not be truncated into a
    // different team. No current NFL/CFB name does, but truncating a match that
    // is already exact would be the worst version of this bug: it would place a
    // pick on a segment nobody named.
    const win = [{ label: "Draw win", prob: 0.5 }];
    expect(barPick({ label: "Draw win" }, win).label).toBe("Draw win");
    // And a segment that only matches AFTER the strip does get placed.
    const bare = [{ label: "Draw", prob: 0.5 }];
    expect(barPick({ label: "Draw win" }, bare).label).toBe("Draw");
  });

  it("translates against the segments it is given, not against a guess at the roster", () => {
    // The bar's own labels are the only vocabulary that matters, so a pick naming
    // a team this game does not feature cannot be placed onto it.
    expect(barPick({ label: "BUF win" }, segments).label).toBe("BUF win");
    expect(barPick({ label: "BUF win" }, []).label).toBe("BUF win");
  });
});
