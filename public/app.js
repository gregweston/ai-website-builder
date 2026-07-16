const chatLog = document.getElementById('chat-log');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const preview = document.getElementById('preview');
const previewPanel = document.querySelector('.preview-panel');
const turnCounterEl = document.getElementById('turn-counter');
const startOverBtn = document.getElementById('start-over-btn');
const submitGalleryBtn = document.getElementById('submit-gallery-btn');
const menuTrigger = document.getElementById('menu-trigger');
const menuDropdown = document.getElementById('menu-dropdown');
const downloadBtn = document.getElementById('download-btn');
const uploadBtn = document.getElementById('upload-btn');
const uploadFileInput = document.getElementById('upload-file-input');
const helpBtn = document.getElementById('help-btn');
const helpModal = document.getElementById('help-modal');
const helpCloseBtn = document.getElementById('help-close-btn');
const appSubtitle = document.getElementById('app-subtitle');
const helpTitle = document.getElementById('help-title');
const helpBodyWebpage = document.getElementById('help-body-webpage');
const helpBodyApp = document.getElementById('help-body-app');

// The project type ('webpage' or 'app') is fixed for this whole deployment
// via the MODE env var (see src/config.js) — the server tells us which one
// on load, and there's no in-app way to switch. `currentMode` is set once
// in init() and only read afterward.
const MODE_COPY = {
  webpage: {
    subtitle: 'AI-Powered Webpage Builder',
    helpTitle: 'How to build your webpage',
    greeting: "Hi! I'm here to help you build your own webpage. What do you want to make? 🎉",
    freshStart: 'Fresh start! What would you like to build? 🎉',
    downloadName: 'my-page.html'
  },
  app: {
    subtitle: 'AI-Powered App Designer',
    helpTitle: 'How to design your app',
    greeting: "Hi! I'm here to help you design your own mobile app. What should the first screen be? 🎉",
    freshStart: 'Fresh start! What kind of app do you want to design? 🎉',
    downloadName: 'my-app.html'
  }
};

let sending = false;
let currentMode = 'webpage';

// The server keeps session state in memory only — a restart, redeploy, or
// free-tier spin-down wipes it. We mirror the page HTML and a lightweight
// copy of the chat log into localStorage so a student's work and
// conversation survive both that and an ordinary page reload (see init()
// and POST /api/restore). Fine for this app since each student uses their
// own laptop/browser.
const PAGE_STORAGE_KEY = 'classBuildingTool.pageHtml';
const CHAT_LOG_STORAGE_KEY = 'classBuildingTool.chatLog';
const MAX_STORED_LOG_ENTRIES = 100;

function savePageToStorage(html) {
  try {
    localStorage.setItem(PAGE_STORAGE_KEY, html);
  } catch (err) {
    // Storage disabled (private browsing, quota) — not critical, just skip.
  }
}

function loadPageFromStorage() {
  try {
    return localStorage.getItem(PAGE_STORAGE_KEY);
  } catch (err) {
    return null;
  }
}

function loadChatLogFromStorage() {
  try {
    const raw = localStorage.getItem(CHAT_LOG_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function appendToChatLogStorage(entry) {
  try {
    const entries = loadChatLogFromStorage();
    entries.push(entry);
    localStorage.setItem(CHAT_LOG_STORAGE_KEY, JSON.stringify(entries.slice(-MAX_STORED_LOG_ENTRIES)));
  } catch (err) {
    // Storage disabled/full — not critical, just skip.
  }
}

function clearChatLogStorage() {
  try {
    localStorage.removeItem(CHAT_LOG_STORAGE_KEY);
  } catch (err) {
    // ignore
  }
}

function updatePreview(html) {
  if (typeof html === 'string') {
    preview.srcdoc = html;
    savePageToStorage(html);
  }
}

function updateTurnCounter(turnCount, maxTurns) {
  if (typeof turnCount === 'number' && typeof maxTurns === 'number') {
    turnCounterEl.textContent = `${turnCount}/${maxTurns} messages`;
  }
}

// Applies the deployment's fixed project type to the UI (preview chrome,
// header copy, help text) — called once in init() with whatever mode the
// server reports.
function applyMode(mode) {
  currentMode = mode;
  const copy = MODE_COPY[mode];
  previewPanel.className = `preview-panel mode-${mode}`;
  appSubtitle.textContent = copy.subtitle;
  helpTitle.textContent = copy.helpTitle;
  helpBodyWebpage.hidden = mode !== 'webpage';
  helpBodyApp.hidden = mode !== 'app';
}

// `persist: false` is used when replaying history already saved to
// localStorage, so we don't append a duplicate copy of it.
function addBubble(role, text, { persist = true } = {}) {
  const bubble = document.createElement('div');
  bubble.className = `bubble ${role}`;
  bubble.textContent = text;
  chatLog.appendChild(bubble);
  chatLog.scrollTop = chatLog.scrollHeight;
  if (persist) {
    appendToChatLogStorage({ type: role, text });
  }
  return bubble;
}

function addTypingIndicator() {
  const bubble = document.createElement('div');
  bubble.className = 'bubble assistant typing';
  bubble.innerHTML =
    '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
  chatLog.appendChild(bubble);
  chatLog.scrollTop = chatLog.scrollHeight;
  return bubble;
}

// `interactive: false` renders the photo grid as historical/read-only —
// used when replaying saved history, since the tool call a click would
// resolve doesn't survive a reload.
function addImageChoices(query, photos, { persist = true, interactive = true } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'bubble assistant image-choices';
  if (!interactive) {
    wrap.classList.add('chosen');
  }

  const label = document.createElement('p');
  label.textContent = photos.length
    ? `Here are some photos for "${query}" — pick one!`
    : `I couldn't find photos for "${query}". Try asking for something else.`;
  wrap.appendChild(label);

  if (photos.length) {
    const grid = document.createElement('div');
    grid.className = 'photo-grid';
    photos.forEach((photo) => {
      const img = document.createElement('img');
      img.src = photo.thumbnail;
      img.alt = photo.alt || query;
      img.title = `Photo by ${photo.photographer || 'unknown'} on ${photo.source || 'Pexels'}`;
      if (interactive) {
        img.addEventListener('click', () => selectImage(photo, wrap));
      } else {
        img.style.cursor = 'default';
      }
      grid.appendChild(img);
    });
    wrap.appendChild(grid);
  }

  chatLog.appendChild(wrap);
  chatLog.scrollTop = chatLog.scrollHeight;

  if (persist) {
    appendToChatLogStorage({ type: 'image_choices', query, photos });
  }
}

function replaySavedChatLog(entries) {
  entries.forEach((entry) => {
    if (entry.type === 'image_choices') {
      addImageChoices(entry.query, entry.photos || [], { persist: false, interactive: false });
    } else {
      addBubble(entry.type, entry.text, { persist: false });
    }
  });
}

async function selectImage(photo, choicesEl) {
  if (sending) return;
  choicesEl.querySelectorAll('img').forEach((img) => {
    img.style.pointerEvents = 'none';
  });
  choicesEl.classList.add('chosen');

  setSending(true);
  const typingBubble = addTypingIndicator();
  try {
    const res = await fetch('/api/select-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl: photo.fullUrl, alt: photo.alt })
    });
    const data = await res.json();
    typingBubble.remove();
    if (!res.ok) {
      addBubble('error', data.error || 'Something went wrong picking that photo.');
    } else {
      handleResult(data);
    }
  } catch (err) {
    typingBubble.remove();
    addBubble('error', 'Hmm, something went wrong picking that photo. Try again?');
  } finally {
    setSending(false);
  }
}

function handleResult(data) {
  if (data.type === 'error') {
    addBubble('error', data.text || 'Something went wrong.');
  } else if (data.type === 'image_search') {
    if (data.text) addBubble('assistant', data.text);
    addImageChoices(data.query, data.photos || []);
  } else if (data.text) {
    addBubble('assistant', data.text);
  }
  updatePreview(data.pageHtml);
  updateTurnCounter(data.turnCount, data.maxTurns);
}

function setSending(isSending) {
  sending = isSending;
  chatInput.disabled = isSending;
  chatForm.querySelector('button').disabled = isSending;
  startOverBtn.disabled = isSending;
  submitGalleryBtn.disabled = isSending;
  uploadBtn.disabled = isSending;
}

function closeMenu() {
  menuDropdown.hidden = true;
  menuTrigger.setAttribute('aria-expanded', 'false');
}

menuTrigger.addEventListener('click', () => {
  const isOpen = !menuDropdown.hidden;
  menuDropdown.hidden = isOpen;
  menuTrigger.setAttribute('aria-expanded', String(!isOpen));
});

// Close the menu whenever any item inside it is clicked (the action itself
// is handled by that item's own listener below) — covers the plain "View
// Gallery" link too, not just the buttons.
menuDropdown.addEventListener('click', (e) => {
  if (e.target.closest('.menu-item')) {
    closeMenu();
  }
});

document.addEventListener('click', (e) => {
  if (!menuDropdown.hidden && !e.target.closest('.menu-wrap')) {
    closeMenu();
  }
});

function openHelpModal() {
  helpModal.hidden = false;
}

function closeHelpModal() {
  helpModal.hidden = true;
}

helpBtn.addEventListener('click', openHelpModal);
helpCloseBtn.addEventListener('click', closeHelpModal);
helpModal.addEventListener('click', (e) => {
  if (e.target === helpModal) closeHelpModal(); // click on the backdrop, not the content
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !menuDropdown.hidden) {
    closeMenu();
  }
  if (e.key === 'Escape' && !helpModal.hidden) {
    closeHelpModal();
  }
});

// The live preview is a separate iframe document — clicks inside it never
// bubble to this page's click listener above, so "click outside" alone
// misses the (very common) case of clicking into the preview panel. When
// focus moves into an iframe, the parent window blurs and its activeElement
// becomes that <iframe>, which we can detect instead.
window.addEventListener('blur', () => {
  setTimeout(() => {
    if (document.activeElement === preview && !menuDropdown.hidden) {
      closeMenu();
    }
  }, 0);
});

downloadBtn.addEventListener('click', () => {
  const html = preview.srcdoc || '';
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = MODE_COPY[currentMode || 'webpage'].downloadName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

uploadBtn.addEventListener('click', () => {
  if (sending) return;
  uploadFileInput.click();
});

uploadFileInput.addEventListener('change', async () => {
  const file = uploadFileInput.files[0];
  uploadFileInput.value = ''; // allow re-selecting the same file next time
  if (!file || sending) return;

  const html = await file.text();

  setSending(true);
  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageHtml: html })
    });
    const data = await res.json();
    if (!res.ok) {
      addBubble('error', data.error || 'Something went wrong uploading that file.');
      return;
    }
    chatLog.innerHTML = '';
    clearChatLogStorage();
    updatePreview(data.pageHtml);
    updateTurnCounter(data.turnCount, data.maxTurns);
    addBubble('assistant', "Got it — I've loaded your uploaded page! What would you like to change? 🎉");
  } catch (err) {
    addBubble('error', "I couldn't connect — check that the server is running.");
  } finally {
    setSending(false);
  }
});

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const message = chatInput.value.trim();
  if (!message || sending) return;

  addBubble('user', message);
  chatInput.value = '';
  setSending(true);
  const typingBubble = addTypingIndicator();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    const data = await res.json();
    typingBubble.remove();
    if (!res.ok) {
      addBubble('error', data.error || 'Something went wrong.');
    } else {
      handleResult(data);
    }
  } catch (err) {
    typingBubble.remove();
    addBubble('error', "I couldn't connect — check that the server is running.");
  } finally {
    setSending(false);
  }
});

startOverBtn.addEventListener('click', async () => {
  if (sending) return;
  const confirmed = window.confirm('Start over with a blank project? This clears your current project and chat history.');
  if (!confirmed) return;

  setSending(true);
  try {
    const res = await fetch('/api/reset', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      addBubble('error', data.error || 'Something went wrong starting over.');
      return;
    }
    chatLog.innerHTML = '';
    clearChatLogStorage();
    updatePreview(data.pageHtml);
    updateTurnCounter(data.turnCount, data.maxTurns);
    addBubble('assistant', MODE_COPY[currentMode].freshStart);
  } catch (err) {
    addBubble('error', "I couldn't connect — check that the server is running.");
  } finally {
    setSending(false);
  }
});

submitGalleryBtn.addEventListener('click', async () => {
  if (sending) return;
  const studentName = window.prompt("What's your name? (Shown with your page in the class gallery.)");
  if (studentName === null) return; // cancelled

  setSending(true);
  try {
    const res = await fetch('/api/gallery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentName })
    });
    const data = await res.json();
    if (!res.ok) {
      addBubble('error', data.error || 'Something went wrong submitting to the gallery.');
      return;
    }
    addBubble('assistant', '🎉 Submitted! Your page is now in the class gallery.');
  } catch (err) {
    addBubble('error', "I couldn't connect — check that the server is running.");
  } finally {
    setSending(false);
  }
});

(async function init() {
  try {
    const res = await fetch('/api/session');
    const data = await res.json();

    applyMode(data.mode);

    let pageHtml = data.pageHtml;
    let turnCount = data.turnCount;
    let maxTurns = data.maxTurns;
    let restored = false;

    const savedHtml = loadPageFromStorage();
    if (savedHtml && savedHtml !== data.pageHtml) {
      // The browser has a saved page the server doesn't know about — most
      // likely the server session was lost (restart/redeploy/spin-down).
      // Push it back so the student doesn't lose their work.
      try {
        const restoreRes = await fetch('/api/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageHtml: savedHtml })
        });
        const restoreData = await restoreRes.json();
        if (restoreRes.ok) {
          pageHtml = restoreData.pageHtml;
          turnCount = restoreData.turnCount;
          maxTurns = restoreData.maxTurns;
          restored = true;
        }
      } catch (err) {
        // Fall through and use the server's own (fresh) state.
      }
    }

    updatePreview(pageHtml);
    updateTurnCounter(turnCount, maxTurns);

    const savedLog = loadChatLogFromStorage();
    if (savedLog.length > 0) {
      replaySavedChatLog(savedLog);
    } else {
      addBubble('assistant', MODE_COPY[data.mode].greeting);
    }

    if (restored) {
      addBubble('assistant', "Looks like the project needed a restart — I've restored your work! 🎉", { persist: false });
    }
  } catch (err) {
    addBubble('error', "I couldn't connect to the server. Ask a teacher for help!");
  }
})();
