import { translate } from "./localization/translate";
import {
  getPrimaryNavigation,
  getWorkspacePages,
} from "./navigation";

const t = translate.bind(null, "zh-CN");

describe("workspace navigation metadata", () => {
  it("keeps the primary sidebar focused on starting a conversation", () => {
    expect(getPrimaryNavigation(t).map(({ path }) => path)).toEqual([
      "/chat/new",
    ]);
  });

  it("keeps moved destinations in the cacheable workspace page registry", () => {
    expect(getWorkspacePages(t).map(({ path }) => path)).toEqual([
      "/",
      "/chat/new",
      "/capabilities",
      "/workflows",
    ]);
  });
});
