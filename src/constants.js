export const YES = '✅';
export const NO = '❌';

/**
 * Guest meal options, as keycap number emoji.
 *
 * Rule: for each emoji, (number of people who reacted) × (its value) = meals.
 * Those products are summed to get the total guest meals.
 *
 *   1 person taps 1️⃣  → 1 × 1 = 1 meal
 *   2 people tap 1️⃣   → 2 × 1 = 2 meals
 *   3 people tap 2️⃣   → 3 × 2 = 6 meals
 *
 * To offer more, add entries here — 4️⃣ and 5️⃣ work the same way. Each one adds
 * a reaction to every prompt though, so keep the list short enough to stay tidy.
 */
export const GUEST_OPTIONS = [
  { emoji: '1️⃣', value: 1 },
  { emoji: '2️⃣', value: 2 },
  { emoji: '3️⃣', value: 3 },
];
