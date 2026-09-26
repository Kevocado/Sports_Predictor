import { describe, expect, it } from "vitest";
import { epa, share, signedInt } from "./hubFormat";

describe("hubFormat", () => {
  it("prints EPA to 2 decimals, signed, with a true minus", () => {
    expect(epa(-0.123)).toBe("−0.12");
    expect(epa(0.1)).toBe("+0.10");
    expect(epa(0)).toBe("0.00");
    expect(epa(null)).toBe("—");
  });

  it("prints a share as a whole percent", () => {
    expect(share(0.253)).toBe("25%");
    expect(share(null)).toBe("—");
  });

  it("prints a whole-number margin signed", () => {
    expect(signedInt(5)).toBe("+5");
    expect(signedInt(-3)).toBe("−3");
    expect(signedInt(0)).toBe("0");
    expect(signedInt(null)).toBe("—");
  });
});
