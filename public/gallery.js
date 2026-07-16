const galleryGrid = document.getElementById('gallery-grid');
const galleryEmpty = document.getElementById('gallery-empty');
const pageModal = document.getElementById('page-modal');
const modalPreview = document.getElementById('modal-preview');
const modalStudentName = document.getElementById('modal-student-name');
const modalIframe = document.getElementById('modal-iframe');
const modalCloseBtn = document.getElementById('modal-close-btn');

// Shared phone-chrome markup (notch/status bar/home indicator) reused for
// every app-mode thumbnail — kept in one place so the status bar icons
// aren't duplicated per card.
const PHONE_CHROME_HTML = `
  <div class="phone-notch"></div>
  <div class="phone-status-bar">
    <span class="phone-time">9:41</span>
    <div class="phone-status-icons" aria-hidden="true">
      <svg width="18" height="10" viewBox="0 0 18 10" fill="currentColor"><rect x="0" y="6" width="3" height="4" rx="0.5"/><rect x="5" y="4" width="3" height="6" rx="0.5"/><rect x="10" y="2" width="3" height="8" rx="0.5"/><rect x="15" y="0" width="3" height="10" rx="0.5"/></svg>
      <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor"><path d="M8 10.5a1.2 1.2 0 100-2.4 1.2 1.2 0 000 2.4zM4.6 6.6a4.8 4.8 0 016.8 0l-1.4 1.4a2.8 2.8 0 00-4 0L4.6 6.6zM2 4a8.4 8.4 0 0112 0L12.6 5.4a6.4 6.4 0 00-9.2 0L2 4z"/></svg>
      <svg width="25" height="12" viewBox="0 0 25 12" fill="none"><rect x="0.5" y="0.5" width="21" height="11" rx="2.5" stroke="currentColor"/><rect x="2" y="2" width="16" height="8" rx="1" fill="currentColor"/><rect x="22.5" y="4" width="2" height="4" rx="1" fill="currentColor"/></svg>
    </div>
  </div>
`;

// Submissions made before mode tracking was added have no `mode` field —
// treat those the same as an explicit 'webpage' (plain modal, no phone chrome).
function modeOf(entry) {
  return entry.mode === 'app' ? 'app' : 'webpage';
}

function openModal(entry) {
  modalStudentName.textContent = entry.studentName;
  modalIframe.srcdoc = entry.html;
  modalPreview.className = `modal-preview mode-${modeOf(entry)}`;
  pageModal.hidden = false;
}

function closeModal() {
  pageModal.hidden = true;
  modalIframe.srcdoc = ''; // stop any scripts/audio in the embedded page
}

modalCloseBtn.addEventListener('click', closeModal);
pageModal.addEventListener('click', (e) => {
  if (e.target === pageModal) closeModal(); // click on the backdrop, not the content
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !pageModal.hidden) closeModal();
});

function createCard(entry) {
  const card = document.createElement('div');
  card.className = 'gallery-card';

  const heading = document.createElement('h2');
  heading.textContent = entry.studentName;
  card.appendChild(heading);

  const mode = modeOf(entry);
  const thumbWrap = document.createElement('div');
  thumbWrap.className = `gallery-thumb-wrap mode-${mode}`;

  const phoneFrame = document.createElement('div');
  phoneFrame.className = 'phone-frame';
  phoneFrame.innerHTML = PHONE_CHROME_HTML;

  const phoneScreen = document.createElement('div');
  phoneScreen.className = 'phone-screen';

  const iframe = document.createElement('iframe');
  iframe.className = 'gallery-thumb-iframe';
  iframe.srcdoc = entry.html;
  iframe.title = `${entry.studentName}'s ${mode === 'app' ? 'app' : 'page'}`;
  iframe.sandbox = 'allow-scripts allow-forms';
  phoneScreen.appendChild(iframe);
  phoneFrame.appendChild(phoneScreen);

  const homeIndicator = document.createElement('div');
  homeIndicator.className = 'phone-home-indicator';
  phoneFrame.appendChild(homeIndicator);

  thumbWrap.appendChild(phoneFrame);

  // The iframe is a separate document — clicks inside it never bubble to
  // this page's listeners, so an invisible overlay catches the click instead.
  const overlay = document.createElement('button');
  overlay.type = 'button';
  overlay.className = 'gallery-thumb-overlay';
  overlay.setAttribute('aria-label', `View ${entry.studentName}'s page full size`);
  overlay.addEventListener('click', () => openModal(entry));
  thumbWrap.appendChild(overlay);

  card.appendChild(thumbWrap);
  return card;
}

async function loadGallery() {
  try {
    const res = await fetch('/api/gallery');
    const data = await res.json();
    const submissions = data.submissions || [];

    galleryGrid.innerHTML = '';
    if (submissions.length === 0) {
      galleryEmpty.hidden = false;
      return;
    }
    galleryEmpty.hidden = true;
    submissions.forEach((entry) => {
      galleryGrid.appendChild(createCard(entry));
    });
  } catch (err) {
    galleryEmpty.hidden = false;
    galleryEmpty.textContent = "Couldn't load the gallery — check that the server is running.";
  }
}

loadGallery();
