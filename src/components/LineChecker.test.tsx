import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { PlayerPropPrediction } from "../types";
import { QUANTILE_LEVELS } from "../lib/lineCheck";
import { LineChecker } from "./LineChecker";

const vals = QUANTILE_LEVELS.map((q) => Math.round((100 + 300 * q) * 10) / 10);
const base = { anytime_td_prob: 0.1 };
const players: PlayerPropPrediction[] = [
  { ...base, player_id: "q", player_name: "Sam Darnold", recent_team: "SEA", position: "QB", passing_yards: 250, recent_avg: { games: 4, passing_yards: 188.8 }, line_check: { yardage: { passing_yards: vals } } },
  { ...base, player_id: "w", player_name: "Jaxon Smith-Njigba", recent_team: "SEA", position: "WR", receptions: 6, line_check: { counts: { receptions: { "5.5": 0.55, "6.5": 0.4 } } } },
  { ...base, player_id: "n", player_name: "No Data", recent_team: "DEN", position: "K", line_check: {} },
];
const pick = (id: string, testid: string) => fireEvent.change(screen.getByTestId(testid), { target: { value: id } });

describe("LineChecker", () => {
  it("lists only players the model can price, grouped by team", () => {
    render(<LineChecker players={players} />);
    const opts = [...screen.getByTestId("lc-player").querySelectorAll("option")].map((o) => o.textContent);
    expect(opts.join("|")).toContain("Sam Darnold");
    expect(opts.join("|")).not.toContain("No Data");
  });

  it("player -> stat -> line returns over and under that add to 100%", () => {
    render(<LineChecker players={players} />);
    pick("q", "lc-player");
    pick("250", "lc-line");
    expect(screen.getByTestId("lc-over")).toHaveTextContent("50%");
    expect(screen.getByTestId("lc-under")).toHaveTextContent("50%");
    expect(screen.getByTestId("lc-context")).toHaveTextContent("Model projection 250");
    expect(screen.getByTestId("lc-context")).toHaveTextContent("his 4-game avg 188.8");
  });

  it("a low line is a likely over", () => {
    render(<LineChecker players={players} />);
    pick("q", "lc-player"); pick("190", "lc-line");
    expect(screen.getByTestId("lc-over")).toHaveTextContent("70%");
  });

  it("counts need a half-point line and say so", () => {
    render(<LineChecker players={players} />);
    pick("w", "lc-player"); pick("6", "lc-line");
    expect(screen.getByTestId("lc-result")).toHaveTextContent(/half-point/i);
    pick("5.5", "lc-line");
    expect(screen.getByTestId("lc-over")).toHaveTextContent("55%");
  });

  it("changing the player clears the typed line, so an answer is never shown for the wrong player", () => {
    render(<LineChecker players={players} />);
    pick("q", "lc-player"); pick("250", "lc-line");
    pick("w", "lc-player");
    expect((screen.getByTestId("lc-line") as HTMLInputElement).value).toBe("");
    expect(screen.queryByTestId("lc-over")).toBeNull();
  });

  it("says it is the model's estimate and never recommends a bet", () => {
    render(<LineChecker players={players} />);
    expect(screen.getByTestId("line-checker")).toHaveTextContent(/not betting advice/i);
    expect(screen.getByTestId("line-checker").textContent).not.toMatch(/\bbet on\b|\block\b/i);
  });

  it("renders nothing when no one can be priced", () => {
    const { container } = render(<LineChecker players={[players[2]]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
