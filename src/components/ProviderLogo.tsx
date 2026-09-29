import { useState } from 'react'

import { getProviderLabel, resolveProvider } from '../providers/catalog'

interface ProviderLogoProps {
  provider: string
}

export function ProviderLogo({ provider }: ProviderLogoProps) {
  const [failedLogo, setFailedLogo] = useState<string | null>(null)
  const entry = resolveProvider(provider)
  const label = getProviderLabel(provider)
  const logo = entry?.logo ?? null
  const initials = label.split(/\s+/).map((word) => word[0]).join('').slice(0, 2).toUpperCase()

  return (
    <span className="provider-logo">
      {logo && failedLogo !== logo ? (
        <img alt={`Logo de ${label}`} onError={() => setFailedLogo(logo)} src={logo} />
      ) : (
        <span aria-label={`Logo indisponible pour ${label}`} className="provider-logo__fallback" role="img">
          {initials || '?'}
        </span>
      )}
    </span>
  )
}
