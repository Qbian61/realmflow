import type { WorkspaceFile } from "../../../shared/workspace";

export function fixedLayoutFileType(file: WorkspaceFile): "pdf" | "ofd" {
  return file.name.toLowerCase().endsWith(".pdf") ||
    file.path.toLowerCase().endsWith(".pdf")
    ? "pdf"
    : "ofd";
}
