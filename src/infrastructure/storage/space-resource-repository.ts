import {
  isSpaceResource,
  type SpaceResource,
  type SpaceResourceStore
} from '../../domain/space-resource'
import { isRecord } from '../../domain/workspace'

export function decodeSpaceResourceStore(
  value: unknown
): SpaceResourceStore | null {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !isRecord(value.resourcesBySpace)
  ) {
    return null
  }
  const resourcesBySpace = Object.fromEntries(
    Object.entries(value.resourcesBySpace).filter(
      (entry): entry is [string, SpaceResource[]] =>
        Array.isArray(entry[1]) && entry[1].every(isSpaceResource)
    )
  )
  return { resourcesBySpace }
}

export function encodeSpaceResourceStore(
  store: SpaceResourceStore
): unknown {
  return { version: 1, ...store }
}
