import { describe, expect, it } from "vitest";
import { CFB_LOGOS, NFL_LOGOS, teamLogoUrl } from "./teamLogos";

describe("teamLogoUrl", () => {
  it("returns an ESPN logo URL for a known NFL abbreviation", () => {
    const url = teamLogoUrl("nfl", "KC");
    expect(url).toMatch(/^https:\/\/a\.espncdn\.com\/i\/teamlogos\/nfl\/500\/kc\.png$/);
  });

  it("maps the app's LA abbreviation to the Rams (LAR) logo", () => {
    expect(teamLogoUrl("nfl", "LA")).toMatch(/\/lar\.png$/);
  });

  it("maps the app's WAS abbreviation to the Commanders (WSH) logo", () => {
    expect(teamLogoUrl("nfl", "WAS")).toMatch(/\/wsh\.png$/);
  });

  it("gives the stale OAK duplicate the Raiders (LV) logo instead of nothing", () => {
    expect(teamLogoUrl("nfl", "OAK")).toBe(teamLogoUrl("nfl", "LV"));
  });

  it("returns an ESPN logo URL for a known CFB school name", () => {
    const url = teamLogoUrl("cfb", "Ohio State");
    expect(url).toMatch(/^https:\/\/a\.espncdn\.com\/i\/teamlogos\/ncaa\/500\/\d+\.png$/);
  });

  it("is case- and whitespace-tolerant for CFB names", () => {
    expect(teamLogoUrl("cfb", "  ohio state ")).toBe(teamLogoUrl("cfb", "Ohio State"));
  });

  it("returns undefined for a team with no mapped logo", () => {
    expect(teamLogoUrl("nfl", "XYZ")).toBeUndefined();
    expect(teamLogoUrl("cfb", "Somewhere State")).toBeUndefined();
  });

  it("covers every NFL map entry with a valid URL", () => {
    for (const [abbr, url] of Object.entries(NFL_LOGOS)) {
      expect(url, abbr).toMatch(/^https:\/\//);
    }
    expect(Object.keys(NFL_LOGOS).length).toBeGreaterThanOrEqual(32);
  });

  it("covers a large CFB map", () => {
    expect(Object.keys(CFB_LOGOS).length).toBeGreaterThanOrEqual(138);
  });
});
