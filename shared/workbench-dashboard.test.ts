import {
  sortDashboardExceptions,
  sortDashboardSpaces,
  summarizeDashboardCompletion,
  type DashboardExceptionRow,
  type DashboardSpaceRow,
} from "./workbench-dashboard";

describe("workbench dashboard domain", () => {
  it("counts completion by distinct requirement ID and intersects the numerator", () => {
    expect(
      summarizeDashboardCompletion(
        ["requirement-1", "requirement-1", "requirement-2"],
        ["requirement-1", "requirement-1", "outside-range"],
      ),
    ).toEqual({
      enteredExecutionCount: 2,
      completedCount: 1,
      completionRate: 0.5,
    });
  });

  it("returns no completion rate when the denominator is zero", () => {
    expect(summarizeDashboardCompletion([], ["outside-range"])).toEqual({
      enteredExecutionCount: 0,
      completedCount: 0,
      completionRate: undefined,
    });
  });

  it("sorts spaces by health, recency, and stable ID", () => {
    const rows: DashboardSpaceRow[] = [
      space("healthy", 400, "space-d"),
      space("failed", 100, "space-c"),
      space("waiting_user", 500, "space-b"),
      space("failed", 100, "space-a"),
      space("running", 600, "space-e"),
    ];

    expect(sortDashboardSpaces(rows).map(({ id }) => id)).toEqual([
      "space-a",
      "space-c",
      "space-b",
      "space-e",
      "space-d",
    ]);
  });

  it("sorts exceptions by impact, blocking, wait, time, and stable ID", () => {
    const rows: DashboardExceptionRow[] = [
      exceptionRow("node", false, 100, 500, "exception-e"),
      exceptionRow("workspace", true, 300, 400, "exception-c"),
      exceptionRow("workspace", true, 100, 300, "exception-b"),
      exceptionRow("workspace", true, 100, 300, "exception-a"),
      exceptionRow("requirement", true, 50, 900, "exception-d"),
    ];

    expect(sortDashboardExceptions(rows).map(({ id }) => id)).toEqual([
      "exception-a",
      "exception-b",
      "exception-c",
      "exception-d",
      "exception-e",
    ]);
  });
});

function space(
  health: DashboardSpaceRow["health"],
  updatedAt: number,
  id: string,
): DashboardSpaceRow {
  return {
    id,
    label: id,
    health,
    activeRequirements: 0,
    waitingForUser: 0,
    runtimeExceptions: 0,
    completedRequirements: 0,
    totalRequirements: 0,
    updatedAt,
  };
}

function exceptionRow(
  impact: DashboardExceptionRow["impact"],
  blocksSuccessors: boolean,
  waitingSince: number,
  occurredAt: number,
  id: string,
): DashboardExceptionRow {
  return {
    id,
    kind: "system",
    impact,
    blocksSuccessors,
    waitingSince,
    occurredAt,
    workspaceId: "space-1",
    workspaceLabel: "Space",
    requirementId: "requirement-1",
    requirementTitle: "Requirement",
    title: id,
  };
}
