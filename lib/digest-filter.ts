export function filterDigestPayload<T extends { id?: number; term?: string }>(
  items: T[],
  demands: { term?: string; keyword?: string; decision?: string }[] | undefined,
  isNovel: (item: { id?: number; term?: string }) => boolean,
) {
  const kept = items.filter((item) => isNovel(item));
  const names = new Set(kept.map((item) => item.term));
  return {
    items: kept,
    demands: (demands ?? []).filter((demand) => Boolean(demand.term) && names.has(demand.term)),
    hiddenCount: items.length - kept.length,
    snapshotFiltered: kept.length !== items.length,
  };
}
