import { join } from 'node:path'
import { existsSync } from 'node:fs'

type AppIconPathOptions = {
  isPackaged: boolean
  resourcesPath: string
  cwd: string
  exists?: (path: string) => boolean
}

export function resolveAppIconPath({
  isPackaged,
  resourcesPath,
  cwd,
  exists = existsSync
}: AppIconPathOptions): string {
  const packagedPath = join(resourcesPath, 'logo.png')
  return isPackaged && exists(packagedPath)
    ? packagedPath
    : join(cwd, 'logo.png')
}
