import { postMessage, addReaction } from './discord.js';
import { ensureTabs, setState } from './sheets.js';
import { YES, NO } from './constants.js';

async function main() {
  await ensureTabs();

  const lunch = await postMessage(`🍛 **Lunch tomorrow?**  React ${YES} Yes / ${NO} No`);
  const dinner = await postMessage(`🍽️ **Dinner tomorrow?**  React ${YES} Yes / ${NO} No`);

  // Seed both reactions so people just tap instead of hunting for the emoji.
  for (const message of [lunch, dinner]) {
    await addReaction(message.id, YES);
    await addReaction(message.id, NO);
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
