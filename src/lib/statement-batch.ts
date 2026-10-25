/** Keep simultaneous document scans bounded; each outcome belongs to its own item. */
export async function runStatementBatch<T>(
  items: T[],
  scan: (item: T) => Promise<void>,
  failed: (item: T, error: unknown) => void,
): Promise<void> {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const item = items[next++];
      if (item === undefined) continue;
      try { await scan(item); }
      catch (error) { failed(item, error); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, items.length) }, worker));
}