export const createRandomSeed = (): number => { // Generate a random seed value.
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') { // Prefer crypto RNG when available.
    const arr = new Uint32Array(1); // Allocate one 32-bit slot.
    crypto.getRandomValues(arr); // Fill with secure random bits.
    return arr[0]; // Return the generated seed.
  }
  return Math.floor(Math.random() * 0xffffffff); // Fallback to Math.random().
};
