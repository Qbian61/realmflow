import { join } from 'node:path'

type AppIconPathOptions = {
  isPackaged: boolean
  resourcesPath: string
  cwd: string
}

export function resolveAppIconPath({
  isPackaged,
  resourcesPath,
  cwd
}: AppIconPathOptions): string {
  return isPackaged
    ? join(resourcesPath, 'logo.png')
    : join(cwd, 'logo.png')
}
