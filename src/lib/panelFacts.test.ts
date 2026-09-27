/** The v2 panel's figures, mapped from this site's own data.
 *
 *  Written before the wiring, because the mapping is where a number can go
 *  wrong in a way no component test would notice: the components already prove
 *  they render what they are given, and what they are given is decided here.
 */
import { describe, expect, it } from "vitest";

import { panelFacts } from "./panelFacts";
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

describe("panelFacts", () => {
  it("maps the §7a NFL fixture exactly", () => {
    // The mock's own numbers, so the render and the spec cannot disagree.
    const { tiles, segments } = panelFacts(game, pred());
    expect(segments.map((s) => `${s.label} ${s.prob}`)).toEqual(["KC 0.38", "BAL 0.62"]);
    expect(tiles.map((t) => `${t.market}:${t.value}`)).toEqual([
      "moneyline:62%",
      "spread:BAL −2.5",
      "total:45.2",
    ]);
    expect(tiles[0].sub).toBe("win · BAL");
    expect(tiles[1].sub).toBe("model −3.4");
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

  it("names the spread's favoured team from the probabilities, not from the line", () => {
    // A negative spread_line means the home team is giving points, and getting
    // this backwards would put the reader's team on the wrong side of their own
    // number — so it is pinned both ways.
    const homeFavoured = panelFacts(game, pred({ home_win_prob: 0.62, away_win_prob: 0.38 }));
    expect(homeFavoured.tiles[1].value).toBe("KC −2.5");
    const awayFavoured = panelFacts(game, pred({ home_win_prob: 0.38, away_win_prob: 0.62 }));
    expect(awayFavoured.tiles[1].value).toBe("BAL −2.5");
  });
});
