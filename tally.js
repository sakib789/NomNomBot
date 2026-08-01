import { getBotUser, getReactors, postMessage } from './discord.js';
import { ensureTabs, appendRows, getState, setState } from './sheets.js';
import { YES, NO } from './constants.js';

/** Optional: map Discord user IDs to friendlier names via the PEOPLE_JSON secret. */
const PEOPLE = JSON.parse(process.env.PEOPLE_JSON || '{}');

const displayName = (user) => PEOPLE[user.id] || user.global_name || user.username;

async function tallyMessage(messageId, botId) {
  const [yes, no] = await Promise.all([
    getReactors(messageId, YES, botId),
    getReactors(messageId, NO, botId),
  ]);
  return { yes: yes.map(displayName), no: no.map(displayName) };
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

  // Daily totals.
  await appendRows('Meals', [
    [now, lunch.yes.length, lunch.no.length, dinner.yes.length, dinner.no.length],
  ]);

  // Per-person detail — free, since reactions tell us who voted.
  await appendRows('Responses', [
    ...lunch.yes.map((n) => [now, n, 'Lunch', 'Yes']),
    ...lunch.no.map((n) => [now, n, 'Lunch', 'No']),
    ...dinner.yes.map((n) => [now, n, 'Dinner', 'Yes']),
    ...dinner.no.map((n) => [now, n, 'Dinner', 'No']),
  ]);

  let summary =
    '**Meal count for today**\n' +
    `🍛 Lunch: ${lunch.yes.length} Yes, ${lunch.no.length} No\n` +
    `🍽️ Dinner: ${dinner.yes.length} Yes, ${dinner.no.length} No`;

  // Flag anyone who reacted both ways — with 4 people this is worth catching.
  const conflicts = [
    ...lunch.yes.filter((n) => lunch.no.includes(n)).map((n) => `${n} (lunch)`),
    ...dinner.yes.filter((n) => dinner.no.includes(n)).map((n) => `${n} (dinner)`),
  ];
  if (conflicts.length) summary += `\n⚠️ Voted both ways: ${conflicts.join(', ')}`;

  // Nudge anyone who never responded. Only works if PEOPLE_JSON is configured.
  const known = Object.values(PEOPLE);
  if (known.length) {
    const voted = new Set([...lunch.yes, ...lunch.no, ...dinner.yes, ...dinner.no]);
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
