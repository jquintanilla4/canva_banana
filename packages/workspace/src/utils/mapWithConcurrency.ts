export const mapWithConcurrency = async <T, R>(
  items: readonly T[],
  maxConcurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
  if (!Number.isSafeInteger(maxConcurrency) || maxConcurrency <= 0) {
    throw new Error('Concurrency limit must be a positive integer.');
  }
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(maxConcurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex); // Preserve input order while workers finish independently.
    }
  }));
  return results;
};
