import { postMessage, addReaction } from './discord.js';
import { ensureTabs, setState } from './sheets.js';
import { YES, NO, GUEST_OPTIONS } from './constants.js';

const guestLegend = GUEST_OPTIONS.map((g) => g.emoji).join('');

const prompt = (meal, icon) =>
  `${icon} **${meal} tomorrow?**  React ${YES} Yes / ${NO} No\n` +
  `_Bringing guests? Also tap a number: ${guestLegend} (each = that many extra meals)_`;

async function main() {
  await ensureTabs();

  const lunch = await postMessage(prompt('Lunch', '🍛'));
  const dinner = await postMessage(prompt('Dinner', '🍽️'));

  // Seed every reaction so people just tap instead of hunting for emoji.
  // Order matters — this is the order they appear under the message.
  for (const message of [lunch, dinner]) {
    await addReaction(message.id, YES);
    await addReaction(message.id, NO);
    for (const { emoji } of GUEST_OPTIONS) {
      await addReaction(message.id, emoji);
    }
  }

  await setState({
    lunchMessageId: lunch.id,
    dinnerMessageId: dinner.id,
    postedAt: new Date().toISOString(),
  });

  console.log(`Posted prompts. lunch=${lunch.id} dinner=${dinner.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
