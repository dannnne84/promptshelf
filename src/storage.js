// Shared chrome.storage.local schema + helpers for background.js and popup.js.
// One saved item: {id, platform, title, content, kind, tags[], url, savedAt}.
// Trial state lives under its own key, set once on install.

const TRIAL_DAYS = 30;
const ITEMS_KEY = "promptshelf_items";
const TEMPLATES_KEY = "promptshelf_templates";
const TRIAL_KEY = "promptshelf_trial_started_at";
const USER_ID_KEY = "promptshelf_user_id";
const PRO_KEY = "promptshelf_pro";

// Cheap, dependency-free code-vs-prose heuristic (service worker has no DOM,
// so the real syntax highlighter only runs later in the popup). A fenced
// block is an instant yes; otherwise score common code tokens per line.
function detectKind(content) {
  if (/```/.test(content)) return "code";
  const codeTokens = /[{};]|=>|\bfunction\b|\bdef \b|\bclass \b|\bconst \b|\blet \b|\bimport \b|\bSELECT \b|#include|<\/\w+>|<!DOCTYPE/gi;
  const tokenCount = (content.match(codeTokens) || []).length;

  const lines = content.split("\n");
  if (lines.length < 2) {
    // No real line breaks (common when a chat UI collapses a selection to
    // one string) -- judge purely on token density across the whole thing.
    return tokenCount >= 3 && tokenCount / (content.length / 40) > 0.5 ? "code" : "text";
  }
  const indented = lines.filter((l) => /^\s{2,}\S/.test(l)).length;
  return (indented / lines.length > 0.3 || tokenCount / lines.length > 0.25) ? "code" : "text";
}

// Backend that talks to Stripe (the extension can't hold a secret key).
const SERVER_URL = "https://promptshelf-server.onrender.com";

const PLATFORM_BY_HOST = {
  "chatgpt.com": "ChatGPT",
  "chat.openai.com": "ChatGPT",
  "claude.ai": "Claude",
  "gemini.google.com": "Gemini",
  "www.perplexity.ai": "Perplexity",
};

function detectPlatform(url) {
  try {
    const host = new URL(url).hostname;
    return PLATFORM_BY_HOST[host] || host;
  } catch (e) {
    return "Unknown";
  }
}

async function getItems() {
  const { [ITEMS_KEY]: items } = await chrome.storage.local.get(ITEMS_KEY);
  return items || [];
}

async function saveItem(item) {
  const items = await getItems();
  items.unshift({
    id: crypto.randomUUID(),
    platform: item.platform,
    title: item.title || item.platform,
    content: item.content,
    kind: detectKind(item.content),
    tags: item.tags || [],
    url: item.url,
    savedAt: Date.now(),
  });
  await chrome.storage.local.set({ [ITEMS_KEY]: items });
  return items;
}

async function deleteItem(id) {
  const items = (await getItems()).filter((i) => i.id !== id);
  await chrome.storage.local.set({ [ITEMS_KEY]: items });
  return items;
}

async function updateTags(id, tags) {
  const items = await getItems();
  const item = items.find((i) => i.id === id);
  if (item) item.tags = tags;
  await chrome.storage.local.set({ [ITEMS_KEY]: items });
  return items;
}

// Reusable prompt templates: {id, title, body, createdAt}. Body holds
// {{blank}} tokens the popup turns into fill-in inputs before copying.
async function getTemplates() {
  const { [TEMPLATES_KEY]: templates } = await chrome.storage.local.get(TEMPLATES_KEY);
  return templates || [];
}

async function saveTemplate(template) {
  const templates = await getTemplates();
  templates.unshift({
    id: crypto.randomUUID(),
    title: template.title,
    body: template.body,
    createdAt: Date.now(),
  });
  await chrome.storage.local.set({ [TEMPLATES_KEY]: templates });
  return templates;
}

async function deleteTemplate(id) {
  const templates = (await getTemplates()).filter((t) => t.id !== id);
  await chrome.storage.local.set({ [TEMPLATES_KEY]: templates });
  return templates;
}

function templateBlanks(body) {
  const seen = new Set();
  const matches = body.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g);
  for (const m of matches) seen.add(m[1]);
  return [...seen];
}

function fillTemplate(body, values) {
  return body.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, name) => values[name] ?? "");
}

async function ensureTrialStarted() {
  const { [TRIAL_KEY]: startedAt } = await chrome.storage.local.get(TRIAL_KEY);
  if (!startedAt) {
    await chrome.storage.local.set({ [TRIAL_KEY]: Date.now() });
    return Date.now();
  }
  return startedAt;
}

async function getTrialState() {
  const { [PRO_KEY]: isPro } = await chrome.storage.local.get(PRO_KEY);
  if (isPro) return { daysLeft: Infinity, expired: false, pro: true };

  const { [TRIAL_KEY]: startedAt } = await chrome.storage.local.get(TRIAL_KEY);
  if (!startedAt) return { daysLeft: TRIAL_DAYS, expired: false };
  const elapsedDays = (Date.now() - startedAt) / (1000 * 60 * 60 * 24);
  const daysLeft = Math.max(0, Math.ceil(TRIAL_DAYS - elapsedDays));
  return { daysLeft, expired: daysLeft <= 0 };
}

async function getOrCreateUserId() {
  const { [USER_ID_KEY]: userId } = await chrome.storage.local.get(USER_ID_KEY);
  if (userId) return userId;
  const newId = crypto.randomUUID();
  await chrome.storage.local.set({ [USER_ID_KEY]: newId });
  return newId;
}

async function startCheckout() {
  const userId = await getOrCreateUserId();
  const res = await fetch(`${SERVER_URL}/create-checkout-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  const { url } = await res.json();
  if (url) chrome.tabs.create({ url });
}

// Called on popup open to pick up a subscription that started in another
// tab (Checkout happens outside the extension, so this is how the popup
// finds out it should unlock).
async function refreshProStatus() {
  const userId = await getOrCreateUserId();
  try {
    const res = await fetch(`${SERVER_URL}/subscription-status/${userId}`);
    const { active } = await res.json();
    await chrome.storage.local.set({ [PRO_KEY]: !!active });
    return !!active;
  } catch (e) {
    // Server unreachable -- keep whatever pro state was last known locally.
    const { [PRO_KEY]: isPro } = await chrome.storage.local.get(PRO_KEY);
    return !!isPro;
  }
}
