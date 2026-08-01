import { getBotUser, getReactors, postMessage } from './discord.js';
import { ensureTabs, appendRows, getState, setState } from './sheets.js';
import { YES, NO, GUEST_OPTIONS } from './constants.js';

/** Optional: map Discord user IDs to friendlier names via the PEOPLE_JSON variable. */
const PEOPLE = JSON.parse(process.env.PEOPLE_JSON || '{}');

const displayName = (user) => PEOPLE[user.id] || user.global_name || user.username;

/**
 * Count one prompt. Guest meals follow the rule:
 * (people who reacted with an emoji) × (that emoji's value), summed.
 */
async function tallyMessage(messageId, botId) {
  const yes = await getReactors(messageId, YES, botId);
  const no = await getReactors(messageId, NO, botId);

  const guests = []; // { name, value } — one entry per person per number tapped
  let guestMeals = 0;

  for (const { emoji, value } of GUEST_OPTIONS) {
    const users = await getReactors(messageId, emoji, botId);
    guestMeals += users.length * value;
    for (const user of users) {
      guests.push({ name: displayName(user), value });
    }
  }

  return {
    yes: yes.map(displayName),
    no: no.map(displayName),
    guests,
    guestMeals,
    total: yes.length + guestMeals,
  };
}

const line = (icon, label, t) =>
  `${icon} ${label}: ${t.yes.length} Yes, ${t.no.length} No` +
  (t.guestMeals ? `, +${t.guestMeals} guest${t.guestMeals === 1 ? '' : 's'}` : '') +
  ` → **${t.total} meal${t.total === 1 ? '' : 's'}**`;

/** Names appearing more than once picked several numbers — almost always a mistake. */
function multiPickers(tally) {
  const seen = new Map();
  for (const g of tally.guests) seen.set(g.name, (seen.get(g.name) || 0) + 1);
  return [...seen.entries()].filter(([, n]) => n > 1).map(([name]) => name);
}

async function main() {
  await ensureTabs();

  const state = await getState();
  if (!state.lunchMessageId || !state.dinnerMessageId) {
    console.log('No pending prompts found in State tab — nothing to tally.');
    return;
  }

  const bot = await getBotUser();
  const lunch = await tallyMessage(state.lunchMessageId, bot.id);
  const dinner = await tallyMessage(state.dinnerMessageId, bot.id);

  const now = new Date().toISOString();
  const dayTotal = lunch.total + dinner.total;

  // Daily totals.
  await appendRows('Meals', [
    [
      now,
      lunch.yes.length, lunch.no.length, lunch.guestMeals, lunch.total,
      dinner.yes.length, dinner.no.length, dinner.guestMeals, dinner.total,
      dayTotal,
    ],
  ]);

  // Per-person detail. Guest rows carry the number in the Guests column.
  await appendRows('Responses', [
    ...lunch.yes.map((n) => [now, n, 'Lunch', 'Yes', '']),
    ...lunch.no.map((n) => [now, n, 'Lunch', 'No', '']),
    ...lunch.guests.map((g) => [now, g.name, 'Lunch', 'Guest', g.value]),
    ...dinner.yes.map((n) => [now, n, 'Dinner', 'Yes', '']),
    ...dinner.no.map((n) => [now, n, 'Dinner', 'No', '']),
    ...dinner.guests.map((g) => [now, g.name, 'Dinner', 'Guest', g.value]),
  ]);

  let summary =
    '**Meal count for today**\n' +
    line('🍛', 'Lunch', lunch) + '\n' +
    line('🍽️', 'Dinner', dinner) + '\n' +
    `\n📊 **Total meals to cook: ${dayTotal}**`;

  // Flag anyone who reacted both Yes and No.
  const conflicts = [
    ...lunch.yes.filter((n) => lunch.no.includes(n)).map((n) => `${n} (lunch)`),
    ...dinner.yes.filter((n) => dinner.no.includes(n)).map((n) => `${n} (dinner)`),
  ];
  if (conflicts.length) summary += `\n⚠️ Voted both ways: ${conflicts.join(', ')}`;

  // Flag anyone who tapped more than one number.
  const multi = [
    ...multiPickers(lunch).map((n) => `${n} (lunch)`),
    ...multiPickers(dinner).map((n) => `${n} (dinner)`),
  ];
  if (multi.length) summary += `\n⚠️ Picked multiple guest numbers: ${multi.join(', ')}`;

  // Nudge anyone who never responded. Needs PEOPLE_JSON to be set.
  const known = Object.values(PEOPLE);
  if (known.length) {
    const voted = new Set([
      ...lunch.yes, ...lunch.no, ...lunch.guests.map((g) => g.name),
      ...dinner.yes, ...dinner.no, ...dinner.guests.map((g) => g.name),
    ]);
    const missing = known.filter((n) => !voted.has(n));
    if (missing.length) summary += `\n_No response from: ${missing.join(', ')}_`;
  }

  await postMessage(summary);

  // Clear so a missed evening run can't be double-counted tomorrow.
  await setState({});

  console.log(summary);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
