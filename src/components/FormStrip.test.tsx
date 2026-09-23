import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormStrip } from "./FormStrip";
import type { FormEntry } from "../types";

const entries: FormEntry[] = [
  { game_id: "g1", opponent: "Chiefs", is_home: true, result: "W", team_score: 24, opponent_score: 17, gameday: "2026-09-07" },
  { game_id: "g2", opponent: "Bills", is_home: false, result: "L", team_score: 10, opponent_score: 31, gameday: "2026-09-14" },
  { game_id: "g3", opponent: "Jets", is_home: true, result: "T", team_score: 20, opponent_score: 20, gameday: "2026-09-21" },
];

describe("FormStrip", () => {
  it("renders one badge per recent game with W/L/T", () => {
    const { container } = render(<FormStrip entries={entries} />);
    const badges = container.querySelectorAll("span");
    expect(badges).toHaveLength(3);
    expect(screen.getByText("W")).toBeInTheDocument();
    expect(screen.getByText("L")).toBeInTheDocument();
    expect(screen.getByText("T")).toBeInTheDocument();
  });

  it("exposes each game's score in the badge title", () => {
    render(<FormStrip entries={entries} />);
    expect(screen.getByText("W")).toHaveAttribute("title", expect.stringContaining("24-17"));
    expect(screen.getByText("L")).toHaveAttribute("title", expect.stringContaining("10-31"));
  });

  it("renders nothing when there are no recent games", () => {
    const { container } = render(<FormStrip entries={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
