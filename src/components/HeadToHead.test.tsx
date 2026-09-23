import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HeadToHead } from "./HeadToHead";
import type { HeadToHeadMeeting } from "../types";

const meetings: HeadToHeadMeeting[] = [
  { game_id: "m1", season: 2025, gameday: "2025-11-02", home_team: "Ravens", away_team: "Chiefs", home_score: 27, away_score: 24 },
  { game_id: "m2", season: 2024, gameday: "2024-10-06", home_team: "Chiefs", away_team: "Ravens", home_score: 17, away_score: 17 },
];

describe("HeadToHead", () => {
  it("renders each past meeting with its score", () => {
    render(<HeadToHead meetings={meetings} />);
    expect(screen.getByText("2025 · Chiefs at Ravens")).toBeInTheDocument();
    expect(screen.getByText("2024 · Ravens at Chiefs")).toBeInTheDocument();
    expect(screen.getByText("24–27", { exact: false })).toBeInTheDocument();
  });

  it("names the winner, or nothing on a tie", () => {
    render(<HeadToHead meetings={meetings} />);
    expect(screen.getByText("Ravens won")).toBeInTheDocument();
    expect(screen.queryByText("Chiefs won")).not.toBeInTheDocument();
  });

  it("shows an empty state when there are no past meetings", () => {
    render(<HeadToHead meetings={[]} />);
    expect(screen.getByText(/no past meetings/i)).toBeInTheDocument();
  });
});
