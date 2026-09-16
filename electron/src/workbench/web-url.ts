export function normalizeWebUrl(value: string): string {
  const trimmedValue = value.trim()
  const candidate = /^[A-Za-z][A-Za-z\d+.-]*:/.test(trimmedValue)
    ? trimmedValue
    : `https://${trimmedValue}`
  const url = new URL(candidate)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS URLs are supported')
  }
  return url.toString()
}
