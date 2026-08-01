const API = 'https://discord.com/api/v10';

// A proper User-Agent is REQUIRED. Discord's Cloudflare layer rejects requests
// with a missing or generic one (403 / error code 40333). This is exactly why
// Google Apps Script cannot talk to the Discord API: it silently strips this header.
const USER_AGENT = 'DiscordBot (https://github.com/meal-planner-bot, 1.0.0)';

const TOKEN = requireEnv('DISCORD_BOT_TOKEN');
const CHANNEL_ID = requireEnv('DISCORD_CHANNEL_ID');

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Call the Discord REST API with retries for rate limits, transient 5xx,
 * and Cloudflare hiccups.
 */
async function call(path, { method = 'GET', body } = {}, attempt = 1) {
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bot ${TOKEN}`,
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (res.ok) {
    // Reaction PUTs return 204 No Content.
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  const text = await res.text();

  // 429 = rate limited. Honour Discord's retry_after.
  if (res.status === 429 && attempt <= 5) {
    let waitMs = 1000 * attempt;
    try {
      const parsed = JSON.parse(text);
      if (parsed.retry_after) waitMs = Math.ceil(parsed.retry_after * 1000) + 250;
    } catch {}
    console.warn(`Rate limited on ${method} ${path}; waiting ${waitMs}ms`);
    await sleep(waitMs);
    return call(path, { method, body }, attempt + 1);
  }

  // Transient server errors and Cloudflare blocks: back off and retry.
  const isCloudflareBlock = text.includes('40333');
  if ((res.status >= 500 || isCloudflareBlock) && attempt <= 4) {
    const waitMs = 1500 * attempt;
    console.warn(`${res.status} on ${method} ${path}; retry ${attempt} in ${waitMs}ms`);
    await sleep(waitMs);
    return call(path, { method, body }, attempt + 1);
  }

  if (isCloudflareBlock) {
    throw new Error(
      `Cloudflare blocked this request (error 40333) on ${method} ${path}. ` +
        `Verify the User-Agent header is being sent.`
    );
  }

  throw new Error(`Discord ${method} ${path} failed ${res.status}: ${text}`);
}

/** The bot's own user object. Used to exclude its seed reactions from the tally. */
export function getBotUser() {
  return call('/users/@me');
}

export function postMessage(content) {
  return call(`/channels/${CHANNEL_ID}/messages`, { method: 'POST', body: { content } });
}

export async function addReaction(messageId, emoji) {
  await call(
    `/channels/${CHANNEL_ID}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`,
    { method: 'PUT' }
  );
  await sleep(350); // stay comfortably inside per-route rate limits
}

/** Everyone who reacted with `emoji`, excluding the bot itself. */
export async function getReactors(messageId, emoji, botId) {
  const users = await call(
    `/channels/${CHANNEL_ID}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}?limit=100`
  );
  return (users || []).filter((u) => u.id !== botId);
}

export { CHANNEL_ID };
