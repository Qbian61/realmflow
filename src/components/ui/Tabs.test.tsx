import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { Tab, TabList, TabPanel, Tabs } from "./Tabs";

function TabsHarness(): JSX.Element {
  const [value, setValue] = useState("one");
  return (
    <Tabs value={value} onValueChange={setValue}>
      <TabList aria-label="Views">
        <Tab value="one">One</Tab>
        <Tab value="two">Two</Tab>
        <Tab value="three" disabled>
          Three
        </Tab>
      </TabList>
      <TabPanel value="one">First panel</TabPanel>
      <TabPanel value="two">Second panel</TabPanel>
      <TabPanel value="three">Third panel</TabPanel>
    </Tabs>
  );
}

describe("Tabs", () => {
  it("connects tabs and panels with accessible state", () => {
    render(<TabsHarness />);

    const selected = screen.getByRole("tab", { name: "One" });
    expect(selected).toHaveAttribute("aria-selected", "true");
    expect(selected).toHaveAttribute(
      "aria-controls",
      screen.getByText("First panel").id,
    );
    expect(screen.getByText("Second panel")).not.toBeVisible();
  });

  it("uses roving focus with manual activation", () => {
    render(<TabsHarness />);

    const one = screen.getByRole("tab", { name: "One" });
    const two = screen.getByRole("tab", { name: "Two" });
    one.focus();
    fireEvent.keyDown(one, { key: "ArrowRight" });

    expect(two).toHaveFocus();
    expect(one).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(two, { key: "Enter" });
    expect(two).toHaveAttribute("aria-selected", "true");
  });

  it("supports Home and End while skipping disabled tabs", () => {
    render(<TabsHarness />);

    const one = screen.getByRole("tab", { name: "One" });
    const two = screen.getByRole("tab", { name: "Two" });
    one.focus();
    fireEvent.keyDown(one, { key: "End" });
    expect(two).toHaveFocus();
    fireEvent.keyDown(two, { key: "Home" });
    expect(one).toHaveFocus();
  });
});
