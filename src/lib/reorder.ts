// Moves one item up/down among its siblings and returns the new sort_order
// for every sibling whose value has to change. Working from the ordered id
// list (not raw sort_order values) keeps it correct even when several rows
// share the same value, e.g. all 0 or a gap left by a delete.
export function computeReorder(
  siblings: { id: string; sort_order: number }[],
  id: string,
  direction: "up" | "down"
): { id: string; sort_order: number }[] | null {
  const ordered = [...siblings].sort((a, b) => a.sort_order - b.sort_order);
  const index = ordered.findIndex((s) => s.id === id);
  if (index === -1) return null;

  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= ordered.length) return null;

  const ids = ordered.map((s) => s.id);
  [ids[index], ids[target]] = [ids[target], ids[index]];

  const current = new Map(ordered.map((s) => [s.id, s.sort_order]));
  return ids
    .map((sid, i) => ({ id: sid, sort_order: i + 1 }))
    .filter((next) => current.get(next.id) !== next.sort_order);
}

export function nextSortOrder(siblings: { sort_order: number }[]): number {
  return siblings.reduce((max, s) => Math.max(max, s.sort_order), 0) + 1;
}
