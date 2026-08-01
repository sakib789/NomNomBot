# Meal Planner Discord Bot

Posts two prompts to Discord every evening, tallies the ✅/❌ reactions the next
morning, logs everything to Google Sheets, and posts a summary.

Runs entirely on GitHub Actions cron — no server, no always-on process, free.

```
17:00  →  🍛 Lunch tomorrow?   React ✅ Yes / ❌ No
          Bringing guests? Also tap a number: 1️⃣2️⃣3️⃣

          🍽️ Dinner tomorrow?  React ✅ Yes / ❌ No
          Bringing guests? Also tap a number: 1️⃣2️⃣3️⃣

10:00  →  Meal count for today
          🍛 Lunch: 3 Yes, 1 No, +2 guests → 5 meals
          🍽️ Dinner: 2 Yes, 2 No → 2 meals

          📊 Total meals to cook: 7
```

## Guest meals

Alongside ✅/❌, each prompt carries number reactions. The rule is
**(people who tapped an emoji) × (that emoji's value)**, summed:

| Reactions | Guest meals |
| --- | --- |
| 1 person taps 1️⃣ | 1 |
| 2 people tap 1️⃣ | 2 |
| 3 people tap 2️⃣ | 6 |
| 2 tap 1️⃣ and 1 taps 3️⃣ | 5 |

Total meals for a sitting = ✅ count + guest meals. To offer bigger numbers, add
entries to `GUEST_OPTIONS` in `src/constants.js`.

---

## 1. Discord setup

1. Go to <https://discord.com/developers/applications> → **New Application**.
2. **Bot** tab → **Reset Token** → copy it. You only see it once.
3. **OAuth2 → URL Generator** → scope **`bot`**, then permissions:
   - View Channels
   - Send Messages
   - Add Reactions
   - **Read Message History** ← easy to miss, and reaction reads fail with 403 without it
4. Open the generated URL and add the bot to your server.
5. Discord **Settings → Advanced → Developer Mode** on, then right-click your
   channel → **Copy Channel ID**.

You do *not* need any Privileged Gateway Intents. This bot never opens a gateway
connection; it only makes REST calls.

## 2. Google Sheets setup

1. Create a blank Google Sheet. Copy its ID from the URL:
   `docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`
2. Go to <https://console.cloud.google.com> → create a project.
3. **APIs & Services → Library** → enable **Google Sheets API**.
4. **APIs & Services → Credentials → Create Credentials → Service Account**.
   Name it anything, skip the optional role steps.
5. Open the service account → **Keys → Add Key → Create new key → JSON**. Download it.
6. Open the JSON and copy the `client_email` value
   (`something@your-project.iam.gserviceaccount.com`).
7. **Share your Google Sheet with that email address, as Editor.** This is the step
   people forget — without it every write fails with a 403.

The `Meals`, `Responses`, and `State` tabs are created automatically on first run.

## 3. GitHub setup

Push this folder to a repository, then go to
**Settings → Secrets and variables → Actions**.

Under **Secrets**, add:

| Secret | Value |
| --- | --- |
| `DISCORD_BOT_TOKEN` | the bot token from step 1 |
| `DISCORD_CHANNEL_ID` | the channel ID from step 1 |
| `GOOGLE_SHEET_ID` | the sheet ID from step 2 |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | the **entire contents** of the downloaded JSON key file, pasted as-is |

Under **Variables** (optional), add `PEOPLE_JSON` to get friendly names and
"who hasn't voted" nudges:

```json
{"111111111111111111": "Alice", "222222222222222222": "Bob"}
```

(Right-click a user in Discord → Copy User ID.)

## 4. Set your timezone

**GitHub Actions cron is always UTC** — there is no timezone setting. The workflows
ship configured for Singapore (UTC+8). Subtract your UTC offset from the local hour
you want:

| Your timezone | 17:00 local → cron | 10:00 local → cron |
| --- | --- | --- |
| UTC+8 (Singapore) | `0 9 * * *` | `0 2 * * *` |
| UTC+6 (Dhaka) | `0 11 * * *` | `0 4 * * *` |
| UTC+5:30 (India) | `30 11 * * *` | `30 4 * * *` |
| UTC+0 (London, winter) | `0 17 * * *` | `0 10 * * *` |
| UTC-5 (New York, winter) | `0 22 * * *` | `0 15 * * *` |

Edit the `cron:` line in both `.github/workflows/*.yml`.

If your region observes daylight saving, the bot will drift by an hour twice a year.
Adjust the cron then, or just live with it.

## 5. Test it

Go to the **Actions** tab → **Post meal prompts** → **Run workflow**. Check that the
messages appear in Discord with both reactions attached and that a `State` tab shows
up in your Sheet.

React to them, then run **Tally meal counts** manually. You should get the summary
message plus new rows in `Meals` and `Responses`.

Once both work, the cron schedules take over. Nothing else to do.

---

## Notes and known quirks

**Scheduled runs can be late.** GitHub delays cron under load, typically by 5–15
minutes. Fine for meal planning; don't build anything time-critical on it.

**Cron gets disabled on idle repos.** GitHub switches off scheduled workflows after
around 60 days with no repository activity. Push a commit or trigger a run manually
now and then to keep it alive.

**Double-voting is flagged, not blocked.** Discord lets someone react ✅ *and* ❌.
They'll be counted in both columns and named in the summary under "Voted both ways".

**The tally reads whatever is there at 10:00.** Late reactions after that are ignored.

**Why not Google Apps Script?** Discord's Cloudflare layer rejects requests without a
proper `User-Agent`, returning `403` with error code `40333`. Apps Script silently
strips custom `User-Agent` headers and can't be made to send one, so it cannot talk
to the Discord API at all. That header is set in `src/discord.js` — don't remove it.
