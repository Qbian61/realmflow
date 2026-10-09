import { memo, useEffect, useMemo, useState } from 'react'
import { resolveProviderBrandLogo } from './provider-brand-icons'

type ProviderLogoProps = {
  id: string
  name: string
  size?: number
  className?: string
}

function extractInitials(name: string): string {
  const words = name
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean)

  if (words.length > 1) {
    return words
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase()
  }
  return (words[0] ?? '?').slice(0, 2).toUpperCase()
}

function ProviderLogoComponent({
  id,
  name,
  size = 18,
  className
}: ProviderLogoProps): JSX.Element {
  const brandLogo = useMemo(
    () => resolveProviderBrandLogo(id, name),
    [id, name]
  )
  const [imageFailed, setImageFailed] = useState(false)
  useEffect(() => {
    setImageFailed(false)
  }, [brandLogo])
  const style = { width: size, height: size }
  const sharedProps = {
    'aria-hidden': true,
    className: ['provider-logo', className].filter(Boolean).join(' '),
    'data-provider-logo': id,
    'data-testid': `provider-logo-${id}`,
    style
  }

  if (brandLogo && !imageFailed) {
    return (
      <span {...sharedProps}>
        <img
          alt=""
          src={brandLogo}
          width={Math.round(size * 0.94)}
          height={Math.round(size * 0.94)}
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
        />
      </span>
    )
  }

  return (
    <span {...sharedProps} className={`${sharedProps.className} is-fallback`}>
      {extractInitials(name)}
    </span>
  )
}

export const ProviderLogo = memo(ProviderLogoComponent)
