# PromptShelf

Save and search your best AI prompts across ChatGPT, Claude, Gemini, and Perplexity — one shelf, every platform. Built for developers: code snippets get real syntax highlighting, and reusable `{{fill-in-the-blank}}` templates mean you never retype the same prompt twice.

**[Get it on the Chrome Web Store →](https://chromewebstore.google.com/detail/loipddhmiinmcaimhcebfadjoephohpj)**

## Features

- **One right-click to save** (or `Ctrl+Shift+S`) — select any text on ChatGPT, Claude, Gemini, or Perplexity, save it instantly. No per-platform DOM scraping, so it doesn't break on redesigns.
- **Real syntax highlighting** — code snippets are auto-detected and rendered properly, not dumped as plain text.
- **Copy as markdown** — code items can be copied as a fenced code block, ready for GitHub issues, PRs, or Slack.
- **Reusable templates** — save a prompt once with `{{blanks}}` for the parts that change, fill them in and copy in seconds every time after.
- **100% local** — everything lives in `chrome.storage.local`. No account, no server, no data collection.

## How it works

Capture is selection-based, not DOM-scraping: right-click any selected text on a supported platform and choose "Save to PromptShelf." This means it keeps working even when a platform redesigns its UI — it never depends on reading the page's live markup, only on text being selected.

## Development

```
git clone <this repo>
```

Load it unpacked in Chrome:
1. `chrome://extensions`
2. Enable Developer mode
3. "Load unpacked" → select this folder

No build step — it's plain JS/HTML/CSS, loaded directly from `src/`.

## License

MIT
