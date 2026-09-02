/**
 * Next `order` for a row appended to a list: max + 1, never the row count.
 * A count collides with an existing order once anything has been deleted,
 * and the new row lands mid-list (sidebar buttons hit this in Jo r13;
 * habits and categories had the same bug).
 */
export function nextOrder(rows: { order: number }[]): number {
  return rows.reduce((m, r) => Math.max(m, r.order), -1) + 1;
}
