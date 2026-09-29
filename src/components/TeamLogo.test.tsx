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

  it("falls back to a code chip named for the team when there is no mapped logo", () => {
    const { container } = render(<TeamLogo sport="cfb" team="Nowhere State" />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("img", { name: "Nowhere State" })).toHaveTextContent("NS");
  });

  it("keeps the badge slot (same size) when the logo fails to load, so the card stays aligned", () => {
    const { container } = render(<TeamLogo sport="nfl" team="KC" size="md" />);
    fireEvent.error(screen.getByAltText("KC logo"));
    expect(container.querySelector("img")).toBeNull();
    expect(container.firstElementChild).toHaveClass("h-10");
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("sizes the logo with the requested size variant", () => {
    const { container } = render(<TeamLogo sport="nfl" team="KC" size="lg" />);
    expect(container.querySelector("img")).toHaveClass("h-14");
    const { container: sm } = render(<TeamLogo sport="nfl" team="KC" size="sm" />);
    expect(sm.querySelector("img")).toHaveClass("h-7");
  });

  it("adds no chip when the team is already written as its code (the name beside it says it)", () => {
    const { container } = render(<TeamLogo sport="nfl" team="QQQ" />);
    expect(container.textContent).toBe("");
  });
});
