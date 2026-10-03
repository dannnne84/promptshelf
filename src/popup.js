// Shelf UI: renders saved items, live-filters by search text, lets the
// user edit tags inline and delete. No framework — the list is small
// enough (personal prompt library, not a feed) that a plain re-render
// on every change is simpler and fast enough.
let allItems = [];

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function matches(item, q) {
  if (!q) return true;
  const hay = (item.content + " " + item.title + " " + item.platform + " " + item.tags.join(" ")).toLowerCase();
  return hay.includes(q.toLowerCase());
}

function render() {
  const q = document.getElementById("search").value.trim();
  const list = document.getElementById("list");
  const filtered = allItems.filter((i) => matches(i, q));

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty">${
      allItems.length === 0
        ? "Nothing saved yet.<br>Select text on ChatGPT, Claude, Gemini, or Perplexity and right-click → Save to PromptShelf."
        : "No matches for that search."
    }</div>`;
    return;
  }

  list.innerHTML = filtered.map((item) => `
    <div class="item" data-id="${item.id}">
      <div class="item-head">
        <span class="platform-dot"></span>
        <span class="platform">${escapeHtml(item.platform)}</span>
        <span class="when">${timeAgo(item.savedAt)}</span>
      </div>
      <div class="content${item.kind === "code" ? "" : " prose"}">${
        item.kind === "code"
          ? `<pre><code class="hljs">${escapeHtml(item.content)}</code></pre>`
          : escapeHtml(item.content)
      }</div>
      <div class="item-foot">
        <span class="tags"><input type="text" class="tag-input" placeholder="add tags..." value="${escapeHtml(item.tags.join(", "))}"></span>
        <span class="actions">
          <button class="copy">copy</button>
          ${item.kind === "code" ? '<button class="copy-md">copy md</button>' : ""}
          <button class="del">delete</button>
        </span>
      </div>
    </div>
  `).join("");

  list.querySelectorAll("pre code.hljs").forEach((block) => hljs.highlightElement(block));

  list.querySelectorAll(".copy").forEach((btn) => {
    btn.onclick = async (e) => {
      const id = e.target.closest(".item").dataset.id;
      const item = allItems.find((i) => i.id === id);
      await navigator.clipboard.writeText(item.content);
      const original = btn.textContent;
      btn.textContent = "copied";
      setTimeout(() => { btn.textContent = original; }, 1200);
    };
  });
  list.querySelectorAll(".copy-md").forEach((btn) => {
    btn.onclick = async (e) => {
      const id = e.target.closest(".item").dataset.id;
      const item = allItems.find((i) => i.id === id);
      // highlightAuto misreads plain HTML/XML as "php-template" fairly
      // often (a known highlight.js quirk on generic markup) -- markup
      // is common enough in a coding tool to special-case it directly.
      const lang = /<!DOCTYPE|<html[\s>]/i.test(item.content)
        ? "html"
        : hljs.highlightAuto(item.content).language || "";
      await navigator.clipboard.writeText(`\`\`\`${lang}\n${item.content}\n\`\`\``);
      const original = btn.textContent;
      btn.textContent = "copied";
      setTimeout(() => { btn.textContent = original; }, 1200);
    };
  });
  list.querySelectorAll(".del").forEach((btn) => {
    btn.onclick = async (e) => {
      const id = e.target.closest(".item").dataset.id;
      allItems = await deleteItem(id);
      render();
    };
  });
  list.querySelectorAll(".tag-input").forEach((input) => {
    input.onchange = async (e) => {
      const id = e.target.closest(".item").dataset.id;
      const tags = e.target.value.split(",").map((t) => t.trim()).filter(Boolean);
      allItems = await updateTags(id, tags);
    };
  });
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

async function renderTrial() {
  const trial = await getTrialState();
  const el = document.getElementById("trialLine");
  const upgradeEl = document.getElementById("upgrade");
  if (trial.pro) {
    el.textContent = "Pro";
    el.className = "trial";
    upgradeEl.style.display = "none";
  } else if (trial.expired) {
    el.textContent = "Trial expired";
    el.className = "trial expired";
    upgradeEl.style.display = "block";
  } else if (trial.daysLeft <= 5) {
    el.textContent = `${trial.daysLeft} day${trial.daysLeft === 1 ? "" : "s"} left in trial`;
    el.className = "trial warn";
  } else {
    el.textContent = `${trial.daysLeft} days left in trial`;
    el.className = "trial";
  }
}

// -------- tabs --------
document.querySelectorAll(".tab").forEach((tab) => {
  tab.onclick = () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const isTemplates = tab.dataset.tab === "templates";
    document.getElementById("savedPane").style.display = isTemplates ? "none" : "block";
    document.getElementById("templatesPane").style.display = isTemplates ? "block" : "none";
  };
});

// -------- templates --------
let allTemplates = [];

function renderTemplates() {
  const list = document.getElementById("tplList");
  if (allTemplates.length === 0) {
    list.innerHTML = `<div class="empty">No templates yet.<br>Save one above for a prompt you reuse often — mark the parts that change with {{blanks}}.</div>`;
    return;
  }
  list.innerHTML = allTemplates.map((t) => `
    <div class="tpl-item" data-id="${t.id}">
      <div class="tpl-title">${escapeHtml(t.title)}</div>
      <div class="tpl-body">${escapeHtml(t.body)}</div>
      <div class="tpl-actions">
        <button class="use">Use</button>
        <button class="del">delete</button>
      </div>
    </div>
  `).join("");

  list.querySelectorAll(".use").forEach((btn) => {
    btn.onclick = (e) => {
      const id = e.target.closest(".tpl-item").dataset.id;
      openFillOverlay(allTemplates.find((t) => t.id === id));
    };
  });
  list.querySelectorAll(".del").forEach((btn) => {
    btn.onclick = async (e) => {
      const id = e.target.closest(".tpl-item").dataset.id;
      allTemplates = await deleteTemplate(id);
      renderTemplates();
    };
  });
}

document.getElementById("tplSaveBtn").onclick = async () => {
  const title = document.getElementById("tplTitle").value.trim();
  const body = document.getElementById("tplBody").value.trim();
  if (!title || !body) return;
  allTemplates = await saveTemplate({ title, body });
  document.getElementById("tplTitle").value = "";
  document.getElementById("tplBody").value = "";
  renderTemplates();
};

// -------- fill-in-the-blanks overlay --------
let activeTemplate = null;

function openFillOverlay(template) {
  activeTemplate = template;
  const blanks = templateBlanks(template.body);
  document.getElementById("fillTitle").textContent = template.title;
  const fields = document.getElementById("fillFields");
  fields.innerHTML = blanks.length
    ? blanks.map((b) => `<label>${escapeHtml(b)}</label><input data-blank="${escapeHtml(b)}" type="text">`).join("")
    : `<div class="empty" style="padding:8px 0">No blanks in this template — just fill &amp; copy.</div>`;
  document.getElementById("fillOverlay").style.display = "flex";
  const firstInput = fields.querySelector("input");
  if (firstInput) firstInput.focus();
}

function closeFillOverlay() {
  document.getElementById("fillOverlay").style.display = "none";
  activeTemplate = null;
}

document.getElementById("fillCancel").onclick = closeFillOverlay;
document.getElementById("fillOverlay").onclick = (e) => {
  if (e.target.id === "fillOverlay") closeFillOverlay();
};
document.getElementById("fillCopy").onclick = async () => {
  if (!activeTemplate) return;
  const values = {};
  document.querySelectorAll("#fillFields input").forEach((input) => {
    values[input.dataset.blank] = input.value;
  });
  const filled = fillTemplate(activeTemplate.body, values);
  await navigator.clipboard.writeText(filled);
  const btn = document.getElementById("fillCopy");
  const original = btn.textContent;
  btn.textContent = "Copied!";
  setTimeout(() => { btn.textContent = original; closeFillOverlay(); }, 700);
};

document.getElementById("search").addEventListener("input", render);
document.getElementById("upgradeBtn").addEventListener("click", startCheckout);

(async () => {
  allItems = await getItems();
  render();
  allTemplates = await getTemplates();
  renderTemplates();
  await refreshProStatus(); // pick up a subscription completed in another tab
  renderTrial();
})();
