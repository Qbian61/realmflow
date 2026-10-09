import { useEffect, useState } from "react";
import { InlineAlert } from "../../components/ui";

type ArtifactImagePreviewProps = {
  src?: string;
  alt: string;
  failedLabel: string;
  retryLabel: string;
};

export function ArtifactImagePreview({
  src,
  alt,
  failedLabel,
  retryLabel,
}: ArtifactImagePreviewProps): JSX.Element {
  const [failed, setFailed] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    setFailed(false);
    setRetryVersion(0);
  }, [src]);

  return (
    <div className="artifact-image-preview">
      {failed ? (
        <InlineAlert
          tone="danger"
          role="alert"
          title={failedLabel}
          actionLabel={retryLabel}
          onAction={() => {
            setFailed(false);
            setRetryVersion((current) => current + 1);
          }}
        />
      ) : (
        <img
          key={retryVersion}
          src={src}
          alt={alt}
          loading="eager"
          decoding="async"
          data-media-layout="contained"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
