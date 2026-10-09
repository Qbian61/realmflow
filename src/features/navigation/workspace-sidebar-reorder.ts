export function dropTargetIndex<T>(
  items: T[],
  sourceId: string,
  targetId: string,
  getId: (item: T) => string,
): number {
  const sourceIndex = items.findIndex((item) => getId(item) === sourceId);
  const targetIndex = items.findIndex((item) => getId(item) === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return -1;
  return targetIndex;
}
