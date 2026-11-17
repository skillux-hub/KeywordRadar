export const PAGE_SIZES = [20, 50, 100] as const;
export const DETAIL_SIZES = [10, 20, 50] as const;

export function parsePage(value: string | null | undefined) {
  const page = Number(value || 1);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function parseSize(value: string | null | undefined, fallback = 20, allowed: readonly number[] = PAGE_SIZES) {
  const size = Number(value || fallback);
  return allowed.includes(size) ? size : fallback;
}

export function pageWindow(page: number, totalPages: number): (number | "ellipsis")[] {
  const pages = Math.max(1, totalPages);
  const current = Math.min(Math.max(1, page), pages);
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
  const tokens: (number | "ellipsis")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(pages - 1, current + 1);
  if (start > 2) tokens.push("ellipsis");
  for (let index = start; index <= end; index += 1) tokens.push(index);
  if (end < pages - 1) tokens.push("ellipsis");
  tokens.push(pages);
  return tokens;
}

export function slicePage<T>(items: T[], page: number, size: number) {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(page, pages);
  const start = (current - 1) * size;
  return { items: items.slice(start, start + size), total, page: current, size };
}
