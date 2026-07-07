const chatLog = document.getElementById('chat-log');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const preview = document.getElementById('preview');
const turnCounterEl = document.getElementById('turn-counter');

let sending = false;

// The server keeps session state in memory only — a restart, redeploy, or
// free-tier spin-down wipes it. We mirror the page HTML into localStorage so
// a student's work can be restored into a fresh server session (see init()
// and POST /api/restore). Fine for this app since each student uses their
// own laptop/browser.
const STORAGE_KEY = 'classBuildingTool.pageHtml';

function savePageToStorage(html) {
  try {
    localStorage.setItem(STORAGE_KEY, html);
  } catch (err) {
    // Storage disabled (private browsing, quota) — not critical, just skip.
  }
}

function loadPageFromStorage() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    return null;
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

function addBubble(role, text) {
  const bubble = document.createElement('div');
  bubble.className = `bubble ${role}`;
  bubble.textContent = text;
  chatLog.appendChild(bubble);
  chatLog.scrollTop = chatLog.scrollHeight;
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

function addImageChoices(query, photos) {
  const wrap = document.createElement('div');
  wrap.className = 'bubble assistant image-choices';

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
      img.title = `Photo by ${photo.photographer || 'unknown'} on Pexels`;
      img.addEventListener('click', () => selectImage(photo, wrap));
      grid.appendChild(img);
    });
    wrap.appendChild(grid);
  }

  chatLog.appendChild(wrap);
  chatLog.scrollTop = chatLog.scrollHeight;
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
}

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

(async function init() {
  try {
    const res = await fetch('/api/session');
    const data = await res.json();

    const savedHtml = loadPageFromStorage();
    if (savedHtml && savedHtml !== data.pageHtml) {
      // The browser has a saved page the server doesn't know about — most
      // likely the server session was lost (restart/redeploy/spin-down).
      // Push it back so the student doesn't lose their work.
      const restoreRes = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageHtml: savedHtml })
      });
      const restoreData = await restoreRes.json();
      if (restoreRes.ok) {
        preview.srcdoc = restoreData.pageHtml; // already matches savedHtml; avoid re-saving redundantly
        updateTurnCounter(restoreData.turnCount, restoreData.maxTurns);
        addBubble('assistant', "Welcome back! I've restored your page — what would you like to do next? 🎉");
        return;
      }
    }

    updatePreview(data.pageHtml);
    updateTurnCounter(data.turnCount, data.maxTurns);
    addBubble('assistant', "Hi! I'm here to help you build your own webpage. What do you want to make? 🎉");
  } catch (err) {
    addBubble('error', "I couldn't connect to the server. Ask a teacher for help!");
  }
})();
