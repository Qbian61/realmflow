import { Button } from "../../components/ui";

type ArtifactBinaryPreviewProps = {
  name: string;
  unsupportedLabel: string;
  showInFinderLabel: string;
  onShowInFinder: () => void;
};

export function ArtifactBinaryPreview({
  name,
  unsupportedLabel,
  showInFinderLabel,
  onShowInFinder,
}: ArtifactBinaryPreviewProps): JSX.Element {
  return (
    <div className="artifact-binary-preview" role="status">
      <strong>{name}</strong>
      <span>{unsupportedLabel}</span>
      <Button type="button" variant="neutral" onClick={onShowInFinder}>
        {showInFinderLabel}
      </Button>
    </div>
  );
}
