/** Deterministic PRNG from a string seed — same profile always gets same noise */
export function seedRandom(seed: string): () => number {
  let state = 0;
  for (let i = 0; i < seed.length; i++) {
    state = (Math.imul(31, state) + seed.charCodeAt(i)) | 0;
  }
  return () => {
    state = Math.imul(state ^ (state >>> 16), 2246822507);
    state = Math.imul(state ^ (state >>> 13), 3266489909);
    state ^= state >>> 16;
    return (state >>> 0) / 4294967296;
  };
}

export function seedInt(seed: string, min: number, max: number): number {
  const rand = seedRandom(seed);
  return Math.floor(rand() * (max - min + 1)) + min;
}
