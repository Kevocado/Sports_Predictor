import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { SportProvider, sportFromSearch, useSport } from "./SportContext";

describe("sportFromSearch", () => {
  it("reads ?sport= and falls back to NFL", () => {
    expect(sportFromSearch("?sport=cfb")).toBe("cfb");
    expect(sportFromSearch("?sport=nfl")).toBe("nfl");
    expect(sportFromSearch("?sport=bogus")).toBe("nfl");
    expect(sportFromSearch("")).toBe("nfl");
  });
});

function Probe() {
  const { sport, setSport } = useSport();
  return <button onClick={() => setSport("cfb")}>{sport}</button>;
}

describe("SportProvider", () => {
  it("starts from the URL and writes the sport back to it, keeping other params", () => {
    window.history.replaceState(null, "", "/?sport=nfl&x=1");
    render(<SportProvider><Probe /></SportProvider>);
    expect(screen.getByRole("button")).toHaveTextContent("nfl");
    act(() => screen.getByRole("button").click());
    expect(screen.getByRole("button")).toHaveTextContent("cfb");
    expect(window.location.search).toBe("?sport=cfb&x=1");
  });
});
