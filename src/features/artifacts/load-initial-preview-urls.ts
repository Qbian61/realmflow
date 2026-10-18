import type { WorkspaceApi, WorkspaceFile } from "../../../shared/workspace";

export async function loadInitialPreviewUrls(
  api: WorkspaceApi,
  requirementId: string,
  files: readonly WorkspaceFile[],
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    files
      .filter((file) => file.kind === "html" || file.kind === "image")
      .map(async (file) => {
        try {
          return [
            file.path,
            await api.getPreviewUrl(requirementId, file.path),
          ] as const;
        } catch {
          return undefined;
        }
      }),
  );
  return Object.fromEntries(
    entries.filter(
      (entry): entry is readonly [string, string] => entry !== undefined,
    ),
  );
}
