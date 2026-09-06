import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SportToggle } from "./SportToggle";
import { SportProvider, useSport } from "../context/SportContext";
function ActiveSportLabel() {
  const { sport } = useSport();
  return <span data-testid="active-sport">{sport}</span>;
}
describe("SportToggle", () => {
  it("switches the active sport in SportContext when clicked", () => {
    render(
      <SportProvider>
        <SportToggle />
        <ActiveSportLabel />
      </SportProvider>,
    );
    expect(screen.getByTestId("active-sport")).toHaveTextContent("nfl");
    fireEvent.click(screen.getByText("CFB"));
    expect(screen.getByTestId("active-sport")).toHaveTextContent("cfb");
  });
});
