// The number guards on the track record page, tested directly.
//
// The page test proves the em-dash reaches the screen; this file proves WHY it
// has to, and pins the two directions separately, because they are separate
// rules and a single "prints a dash" assertion can pass while one of them
// rots:
//
//  - an absent value is absent, and
//  - a zero is a measurement.
//
// Both were verified by breaking them: `rate(null) === "0%"` and
// `rate(0) === "—"` each fail this file.

import { describe, expect, it } from "vitest";
import {
  NO_VALUE,
  biasWord,
  brier,
  edgeWord,
  gradedCount,
  missing,
  plural,
  points,
  rate,
  signedPoints,
} from "./trackFormat";

describe("missing", () => {
  it("is true for every way a number can fail to be one", () => {
    for (const value of [null, undefined, NaN, Infinity, -Infinity]) {
      expect(missing(value as number | null), String(value)).toBe(true);
    }
  });

  it("is false for zero, which is a measurement", () => {
    // The other half. A 0% hit rate and a 0.0-point error are facts about a
    // week that WAS tracked.
    expect(missing(0)).toBe(false);
    expect(missing(-0.0)).toBe(false);
  });
});

describe("rate", () => {
  it("prints a real 0% and a real 100%, because one game won is 100%", () => {
    // NOT the shared `pct()` in predictor-ui/fmt.ts, which prints "<1%" and
    // ">99%" on the grounds that a live probability never reads 0% or 100%.
    // A track record is not a live probability, and 1/1 = 100% is the number
    // B2 exists to stop anybody dividing away.
    expect(rate(0)).toBe("0%");
    expect(rate(1)).toBe("100%");
  });

  it("prints a dash for an absent rate, not 0% and not NaN", () => {
    for (const value of [null, undefined, NaN]) {
      expect(rate(value as number | null)).toBe(NO_VALUE);
    }
  });

  it("rounds a real rate to a whole percent", () => {
    expect(rate(0.667)).toBe("67%");
    expect(rate(0.3333)).toBe("33%");
  });
});

describe("points and signedPoints", () => {
  it("keeps a real zero as 0.0, and dashes an absent one", () => {
    expect(points(0)).toBe("0.0");
    expect(points(null)).toBe(NO_VALUE);
    expect(points(NaN)).toBe(NO_VALUE);
    expect(signedPoints(0)).toBe("0.0");
    expect(signedPoints(null)).toBe(NO_VALUE);
  });

  it("signs a real direction with a true minus", () => {
    expect(signedPoints(6.7)).toBe("+6.7");
    expect(signedPoints(-6.7)).toBe("−6.7");
    // Rounds before signing, so a value that rounds to zero never reads
    // "+0.0" or "−0.0".
    expect(signedPoints(0.04)).toBe("0.0");
    expect(signedPoints(-0.04)).toBe("0.0");
  });
});

describe("brier", () => {
  it("prints three places, and a dash for an absent score", () => {
    expect(brier(0.18)).toBe("0.180");
    expect(brier(0)).toBe("0.000");
    expect(brier(null)).toBe(NO_VALUE);
  });
});

describe("the words that stand in for a sign and a colour", () => {
  it("names the direction of a signed error", () => {
    expect(biasWord(6.7)).toBe("over-forecast on average");
    expect(biasWord(-6.7)).toBe("under-forecast on average");
    expect(biasWord(0)).toBe("no systematic drift either way");
    expect(biasWord(null)).toBe("not measured");
  });

  it("names which side of the line the model's probability sits on", () => {
    expect(edgeWord(3.9)).toBe("the model's probability sits above the line's");
    expect(edgeWord(-3.9)).toBe("the model's probability sits below the line's");
    expect(edgeWord(0)).toBe("level with the line");
    expect(edgeWord(null)).toBe("not measured");
  });

  it("says nothing about money in any of them", () => {
    // PRODUCT.md forbids a profit or ROI claim, and "edge" is a disagreement
    // between two probabilities rather than a return. A session that reached
    // for a money word here would change the meaning of the number.
    for (const word of [biasWord(3), edgeWord(3), biasWord(-3), edgeWord(-3)]) {
      expect(word).not.toMatch(/bet|stake|return|profit|money|win|cent|\$|ROI/i);
    }
  });
});

describe("counts", () => {
  it("pluralises and separates thousands", () => {
    expect(plural(1, "game")).toBe("1 game");
    expect(plural(0, "game")).toBe("0 games");
    expect(plural(2, "game")).toBe("2 games");
    expect(plural(1234, "game")).toBe("1,234 games");
  });

  it("says a missing count is missing rather than borrowing another number", () => {
    // The games-resolved count is the moneyline denominator and only the
    // moneyline one, so it must never stand in for ATS or totals.
    expect(gradedCount(undefined)).toBe("grade count not reported");
    expect(gradedCount(null)).toBe("grade count not reported");
    expect(gradedCount(12)).toBe("12 games graded");
    expect(gradedCount(1)).toBe("1 game graded");
  });
});
