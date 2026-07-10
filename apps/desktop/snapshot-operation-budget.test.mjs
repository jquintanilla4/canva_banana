import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createSnapshotOperationBudget } = require('./snapshot-operation-budget.cjs');

describe('createSnapshotOperationBudget', () => {
  it('bounds concurrent operations and bytes but allows reuse after release', () => {
    const budget = createSnapshotOperationBudget({
      maxOperations: 2,
      maxBytes: 10,
      errorMessage: 'Snapshot operations are busy.',
    });
    const releaseSix = budget.reserve(6);

    expect(() => budget.reserve(5)).toThrow('busy');

    const releaseFour = budget.reserve(4);
    expect(budget.getUsage()).toEqual({ activeOperations: 2, activeBytes: 10 });
    expect(() => budget.reserve(0)).toThrow('busy');

    releaseSix();
    releaseSix(); // Repeated cleanup must not underflow the shared budget.
    const releaseFive = budget.reserve(5);
    expect(budget.getUsage()).toEqual({ activeOperations: 2, activeBytes: 9 });

    releaseFour();
    releaseFive();
    expect(budget.getUsage()).toEqual({ activeOperations: 0, activeBytes: 0 });
  });
});
