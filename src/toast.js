// Tiny confirmation toast, shown after a context-menu save. Plain DOM,
// no framework — one element, fades itself out, nothing to clean up
// beyond the timers below.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== "promptshelf-toast") return;

  const el = document.createElement("div");
  el.textContent = msg.text;
  el.style.cssText = [
    "position:fixed", "bottom:24px", "right:24px", "z-index:2147483647",
    "background:#111827", "color:#e5e7eb", "padding:10px 16px",
    "border-radius:8px", "font:13px system-ui,sans-serif",
    "box-shadow:0 4px 16px rgba(0,0,0,.3)", "opacity:0",
    "transition:opacity .2s",
  ].join(";");
  document.body.appendChild(el);

  requestAnimationFrame(() => { el.style.opacity = "1"; });
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 250);
  }, 2000);
});
