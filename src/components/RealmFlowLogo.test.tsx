import { fireEvent, render, screen } from "@testing-library/react";
import { RealmFlowLogo } from "./RealmFlowLogo";

describe("RealmFlowLogo", () => {
  it("renders a decorative image with stable dimensions and list loading hints", () => {
    render(<RealmFlowLogo size={28} loading="lazy" />);

    const frame = screen.getByTestId("realmflow-logo");
    const image = frame.querySelector("img");
    expect(frame).toHaveStyle({ width: "28px", height: "28px" });
    expect(image).toHaveAttribute("alt", "");
    expect(image).toHaveAttribute("aria-hidden", "true");
    expect(image).toHaveAttribute("width", "28");
    expect(image).toHaveAttribute("height", "28");
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveAttribute("decoding", "async");
  });

  it("keeps the same frame and shows a local fallback when decoding fails", () => {
    render(<RealmFlowLogo size={28} />);

    fireEvent.error(screen.getByTestId("realmflow-logo").querySelector("img")!);

    expect(screen.getByTestId("realmflow-logo")).toHaveTextContent("R");
    expect(
      screen.getByTestId("realmflow-logo").querySelector("img"),
    ).toBeNull();
  });
});
