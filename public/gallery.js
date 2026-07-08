const galleryGrid = document.getElementById('gallery-grid');
const galleryEmpty = document.getElementById('gallery-empty');
const pageModal = document.getElementById('page-modal');
const modalStudentName = document.getElementById('modal-student-name');
const modalIframe = document.getElementById('modal-iframe');
const modalCloseBtn = document.getElementById('modal-close-btn');

function openModal(entry) {
  modalStudentName.textContent = entry.studentName;
  modalIframe.srcdoc = entry.html;
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

  const thumbWrap = document.createElement('div');
  thumbWrap.className = 'gallery-thumb-wrap';

  const iframe = document.createElement('iframe');
  iframe.className = 'gallery-thumb-iframe';
  iframe.srcdoc = entry.html;
  iframe.title = `${entry.studentName}'s page`;
  iframe.sandbox = 'allow-scripts allow-forms';
  thumbWrap.appendChild(iframe);

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
