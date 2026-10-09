export function highestSequence(values: string[], pattern: RegExp): number {
  return values.reduce((highest, value) => {
    const sequence = Number(value.match(pattern)?.[1] ?? 0)
    return Math.max(highest, sequence)
  }, 0)
}

export function moveBefore<T>(
  items: T[],
  sourceKey: string,
  targetKey: string,
  getKey: (item: T) => string = (item) =>
    (item as { path: string }).path
): T[] {
  const sourceIndex = items.findIndex((item) => getKey(item) === sourceKey)
  const targetIndex = items.findIndex((item) => getKey(item) === targetKey)
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return items
  }
  const next = [...items]
  const [source] = next.splice(sourceIndex, 1)
  next.splice(next.findIndex((item) => getKey(item) === targetKey), 0, source)
  return next
}

export function moveToIndex<T>(
  items: T[],
  sourceKey: string,
  targetIndex: number,
  getKey: (item: T) => string = (item) =>
    (item as { path: string }).path
): T[] {
  const sourceIndex = items.findIndex((item) => getKey(item) === sourceKey)
  const boundedTarget = Math.max(0, Math.min(targetIndex, items.length - 1))
  if (sourceIndex < 0 || sourceIndex === boundedTarget) return items
  const next = [...items]
  const [source] = next.splice(sourceIndex, 1)
  next.splice(boundedTarget, 0, source)
  return next
}
