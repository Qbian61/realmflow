import type {
  WorkbenchTaskField,
  WorkbenchTaskRecord,
} from "../../../../shared/workbench-tasks";

export function taskRequestId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `request-${Date.now()}-${Math.random()}`
  );
}

export function taskRecordDisplayName(
  record: WorkbenchTaskRecord,
  fields: readonly WorkbenchTaskField[],
): string {
  for (const field of fields) {
    const value = record.values[field.id];
    if (typeof value === "string" && value.trim()) return value;
  }
  return record.id;
}
