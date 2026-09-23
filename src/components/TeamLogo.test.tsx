import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TeamLogo } from "./TeamName";

describe("TeamLogo", () => {
  it("renders the ESPN logo image for a known NFL team", () => {
    render(<TeamLogo sport="nfl" team="KC" />);
    const img = screen.getByAltText("KC logo");
    expect(img).toHaveAttribute("src", expect.stringContaining("espncdn.com"));
    expect(img).toHaveAttribute("src", expect.stringContaining("/nfl/"));
  });

  it("renders the ESPN logo image for a known CFB team", () => {
    render(<TeamLogo sport="cfb" team="Georgia" />);
    expect(screen.getByAltText("Georgia logo")).toHaveAttribute(
      "src",
      expect.stringContaining("/ncaa/"),
    );
  });

  it("falls back to the team initial when there is no mapped logo", () => {
    render(<TeamLogo sport="nfl" team="XYZ" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("X")).toBeInTheDocument();
  });

  it("falls back to the team initial when the logo image fails to load", () => {
    render(<TeamLogo sport="nfl" team="KC" />);
    fireEvent.error(screen.getByAltText("KC logo"));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("K")).toBeInTheDocument();
  });

  it("sizes the logo with the requested size variant", () => {
    const { container } = render(<TeamLogo sport="nfl" team="KC" size="lg" />);
    expect(container.querySelector("img")).toHaveClass("h-14");
    const { container: sm } = render(<TeamLogo sport="nfl" team="KC" size="sm" />);
    expect(sm.querySelector("img")).toHaveClass("h-7");
  });
});
