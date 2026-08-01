import { google } from 'googleapis';
import { requireEnv } from './discord.js';

const SHEET_ID = requireEnv('GOOGLE_SHEET_ID');

const TABS = {
  Meals: ['Logged at', 'Lunch Yes', 'Lunch No', 'Dinner Yes', 'Dinner No'],
  Responses: ['Time', 'Person', 'Meal', 'Answer'],
  State: ['key', 'value'],
};

let client;

async function sheets() {
  if (client) return client;

  const credentials = JSON.parse(requireEnv('GOOGLE_SERVICE_ACCOUNT_JSON'));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  client = google.sheets({ version: 'v4', auth: await auth.getClient() });
  return client;
}

/** Create any missing tabs and write their header rows. Safe to call every run. */
export async function ensureTabs() {
  const api = await sheets();
  const meta = await api.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const existing = new Set(meta.data.sheets.map((s) => s.properties.title));

  const missing = Object.keys(TABS).filter((t) => !existing.has(t));
  if (missing.length === 0) return;

  await api.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: missing.map((title) => ({ addSheet: { properties: { title } } })),
    },
  });

  for (const title of missing) {
    await api.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${title}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [TABS[title]] },
    });
  }
  console.log(`Created tabs: ${missing.join(', ')}`);
}

export async function appendRows(tab, rows) {
  if (rows.length === 0) return;
  const api = await sheets();
  await api.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

/**
 * GitHub Actions runs are stateless, so the message IDs from the evening job
 * are parked in a `State` tab for the morning job to pick up.
 */
export async function getState() {
  const api = await sheets();
  const res = await api.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'State!A2:B50',
  });
  const state = {};
  for (const [key, value] of res.data.values || []) {
    if (key) state[key] = value;
  }
  return state;
}

export async function setState(state) {
  const api = await sheets();
  await api.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: 'State!A2:B50' });
  const rows = Object.entries(state);
  if (rows.length === 0) return;
  await api.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: 'State!A2',
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });
}
