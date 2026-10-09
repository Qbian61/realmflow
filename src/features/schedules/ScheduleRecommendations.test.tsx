import { fireEvent, render, screen } from "@testing-library/react";
import { LocalizationProvider } from "../../localization/LocalizationProvider";
import { ScheduleRecommendations } from "./ScheduleRecommendations";

describe("ScheduleRecommendations", () => {
  it("uses a compact shared icon button for the recommendation action", () => {
    const recommendation = {
      id: "daily-review",
      name: "每日复盘",
      description: "每天整理项目进展",
      cronExpression: "0 18 * * *",
    };
    const onSelect = vi.fn();
    render(
      <LocalizationProvider>
        <ScheduleRecommendations
          recommendations={[recommendation]}
          onSelect={onSelect}
        />
      </LocalizationProvider>,
    );

    const action = screen.getByRole("button", {
      name: "使用推荐任务 每日复盘",
    });
    expect(action).toHaveClass(
      "ui-icon-button",
      "ui-button--compact",
      "ui-button--ghost",
    );

    fireEvent.click(action);
    expect(onSelect).toHaveBeenCalledWith(recommendation);
  });
});
