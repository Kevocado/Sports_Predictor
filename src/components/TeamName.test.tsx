import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { TeamName, teamCode } from "./TeamName";
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
  it("falls back to a neutral family chip with the team's initials, not an invented team colour", () => {
    const { container } = renderWithSport(<TeamName team="Kansas City Chiefs" />);
    // (Kansas City Chiefs has no mapped logo in the CFB/NFL table under this name.)
    expect(screen.getByText("Kansas City Chiefs")).toBeInTheDocument();
    expect(screen.getByText("KCC")).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/linear-gradient/);
  });
  it("builds short codes from team names", () => {
    expect(teamCode("KC")).toBe("KC");
    expect(teamCode("Ohio State")).toBe("OS");
    expect(teamCode("Louisiana-Monroe")).toBe("LM");
    expect(teamCode("Army")).toBe("ARMY");
    expect(teamCode("")).toBe("?");
  });
});
