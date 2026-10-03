// Service worker. Core save path: right-click a selection on any of the
// 4 AI platforms -> "Save to PromptShelf" -> stored locally, no DOM
// scraping needed (scraping each platform's live chat markup is fragile
// and breaks on every redesign; selection-based capture doesn't care
// what the page looks like, only that text is selected).
importScripts("storage.js");

const MENU_ID = "promptshelf-save-selection";

function createMenu() {
  // removeAll first: onInstalled fires on every dev reload (reason
  // "update"), and re-creating an id Chrome still has registered fails
  // silently via chrome.runtime.lastError -- no thrown exception, no
  // console output, the menu item just never (re)appears. This makes
  // registration idempotent regardless of how many times it reloads.
  chrome.contextMenus.removeAll(() => {
    // documentUrlPatterns scoped to the 4 platforms looked right but
    // doesn't fire when a selection is made inside a same-page iframe
    // with a different URL (ChatGPT renders some message content in
    // sandboxed frames) -- Chrome matches the FRAME's URL, not the tab's.
    // Rather than chase every possible frame URL, show the item
    // everywhere and let the click handler enforce which platforms are
    // actually supported (same PLATFORM_BY_HOST map storage.js already
    // has, imported into this scope).
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "Save to PromptShelf",
      contexts: ["selection"],
    });
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureTrialStarted();
  createMenu();
});
// onInstalled only fires on install/update, not on every service-worker
// wake -- re-register on startup too so a browser restart (which tears
// down and respawns the worker) doesn't lose the menu item.
chrome.runtime.onStartup.addListener(createMenu);

// Shared by both the right-click menu and the Ctrl+Shift+S hotkey --
// same save path, same platform/trial checks either way.
async function trySave(tab, selectionText) {
  if (!selectionText || !tab?.id) return;

  const host = (() => { try { return new URL(tab.url).hostname; } catch { return ""; } })();
  if (!PLATFORM_BY_HOST[host]) {
    chrome.tabs.sendMessage(tab.id, { type: "promptshelf-toast", text: "PromptShelf only saves from ChatGPT, Claude, Gemini, or Perplexity" });
    return;
  }

  const trial = await getTrialState();
  if (trial.expired) {
    chrome.tabs.sendMessage(tab.id, { type: "promptshelf-toast", text: "Trial expired — open PromptShelf to upgrade" });
    return;
  }

  try {
    await saveItem({
      platform: detectPlatform(tab.url),
      title: tab.title,
      content: selectionText,
      url: tab.url,
    });
    console.log("[PromptShelf] saved item from", tab.url);
  } catch (e) {
    console.error("[PromptShelf] save failed", e);
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: "promptshelf-toast", text: "Saved to PromptShelf" });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  console.log("[PromptShelf] context menu clicked", info.menuItemId);
  if (info.menuItemId !== MENU_ID) return;
  trySave(tab, info.selectionText);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "save-selection") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  const [{ result: selectionText }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.getSelection().toString(),
  });
  trySave(tab, selectionText);
});
