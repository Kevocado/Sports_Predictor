import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TeamName, teamColor, teamInitial } from "./TeamName";

describe("TeamName", () => {
  it("renders the team's name and first-letter initial", () => {
    render(<TeamName team="Kansas City Chiefs" />);
    expect(screen.getByText("Kansas City Chiefs")).toBeInTheDocument();
    expect(screen.getByText("K")).toBeInTheDocument();
  });
  it("derives a deterministic color for the same team name", () => {
    expect(teamColor("Texas")).toBe(teamColor("Texas"));
  });
  it("falls back to ? for an empty team name", () => {
    expect(teamInitial("")).toBe("?");
  });
});
