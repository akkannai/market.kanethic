// Nano in-memory cache: ek j upstream call ne ghana visitors vache share kare, upstream fail thay to
// last good value (stale) apay.
type Entry<T> = { value?: T; at: number; inflight?: Promise<T> };
const store = new Map<string, Entry<unknown>>();

export type Cached<T> = { value: T; at: number; stale: boolean };

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<Cached<T>> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit?.value !== undefined && now - hit.at < ttlMs) return { value: hit.value, at: hit.at, stale: false };
  if (hit?.inflight) {
    try {
      const value = await hit.inflight;
      return { value, at: Date.now(), stale: false };
    } catch (e) {
      if (hit.value !== undefined) return { value: hit.value, at: hit.at, stale: true };
      throw e;
    }
  }
  const entry: Entry<T> = hit ?? { at: 0 };
  entry.inflight = load();
  store.set(key, entry as Entry<unknown>);
  try {
    const value = await entry.inflight;
    entry.value = value;
    entry.at = Date.now();
    return { value, at: entry.at, stale: false };
  } catch (e) {
    if (entry.value !== undefined) return { value: entry.value, at: entry.at, stale: true };
    throw e;
  } finally {
    entry.inflight = undefined;
  }
}

/** Limited concurrency map; failures return undefined, kadi throw nathi karta. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<(R | undefined)[]> {
  const out: (R | undefined)[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        try {
          out[i] = await fn(items[i]);
        } catch {
          out[i] = undefined;
        }
      }
    }),
  );
  return out;
}
