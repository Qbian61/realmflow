import { RotateCcw } from "lucide-react";
import type { WorkspaceBinding, WorkspaceEntry } from "../../../shared/workspace";
import WorkspaceTree from "./WorkspaceTree";

type ArtifactFileBrowserProps = {
  activePath?: string;
  binding: WorkspaceBinding;
  entriesByDirectory: Record<string, WorkspaceEntry[]>;
  expandedDirectories: Set<string>;
  labels: {
    changeDirectory: string;
    fileList: string;
  };
  onChangeDirectory: () => void;
  onOpenFile: (path: string) => void;
  onToggleDirectory: (path: string) => void;
};

export function ArtifactFileBrowser({
  activePath,
  binding,
  entriesByDirectory,
  expandedDirectories,
  labels,
  onChangeDirectory,
  onOpenFile,
  onToggleDirectory,
}: ArtifactFileBrowserProps): JSX.Element {
  return (
    <section className="artifact-file-browser" aria-label={labels.fileList}>
      <div className="artifact-file-browser-heading">
        <span title={binding.rootPath}>{binding.rootName}</span>
        <button
          type="button"
          aria-label={labels.changeDirectory}
          title={labels.changeDirectory}
          onClick={onChangeDirectory}
        >
          <RotateCcw size={14} />
        </button>
      </div>
      <WorkspaceTree
        entriesByDirectory={entriesByDirectory}
        expandedDirectories={expandedDirectories}
        activePath={activePath}
        onToggleDirectory={onToggleDirectory}
        onOpenFile={onOpenFile}
      />
    </section>
  );
}
