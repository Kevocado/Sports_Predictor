import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { TeamName, teamColor, teamInitial } from "./TeamName";
import { SportProvider } from "../context/SportContext";

function renderWithSport(ui: ReactElement) {
  return render(<SportProvider>{ui}</SportProvider>);
}

describe("TeamName", () => {
  it("renders the team's name and a logo avatar", () => {
    renderWithSport(<TeamName team="KC" />);
    expect(screen.getByText("KC")).toBeInTheDocument();
    expect(screen.getByAltText("KC logo")).toBeInTheDocument();
  });
  it("renders the initial avatar when the team has no logo", () => {
    renderWithSport(<TeamName team="Kansas City Chiefs" />);
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
