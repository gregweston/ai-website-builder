const COMMONS_API_URL = 'https://commons.wikimedia.org/w/api.php';

// Wikimedia Commons is a general-purpose media repository (not a curated,
// pre-filtered stock library like Pexels), so unlike Pexels this needs its
// own content mitigation. This is a best-effort keyword filter against each
// result's categories — Commons' categorization is community-maintained, so
// this reduces risk, it does not guarantee nothing unwanted slips through.
const BLOCKED_CATEGORY_KEYWORDS = [
  'nudity',
  'nude',
  'naked',
  'sexual',
  'sex',
  'porn',
  'erotic',
  'genitalia',
  'penis',
  'vagina',
  'breasts',
  'fetish',
  'violence',
  'gore',
  'gory',
  'corpse',
  'dead body',
  'death',
  'suicide',
  'self-harm',
  'torture',
  'execution',
  'war crime',
  'massacre',
  'gun',
  'firearm',
  'weapon',
  'blood',
  'hate symbol',
  'nazi',
  'swastika',
  'racis',
  'slur',
  'drug',
  'alcohol',
  'cigarette',
  'smoking',
  'gambling'
];

function isBlockedByCategories(categories) {
  if (!Array.isArray(categories)) return false;
  return categories.some((cat) => {
    // Strip the "Category:" namespace prefix before matching — otherwise a
    // keyword like "gory" matches the literal substring in "category" itself,
    // silently blocking every single result regardless of actual content.
    const title = String(cat?.title || '')
      .replace(/^category:/i, '')
      .toLowerCase();
    return BLOCKED_CATEGORY_KEYWORDS.some((keyword) => title.includes(keyword));
  });
}

function stripHtml(str) {
  return String(str || '')
    .replace(/<[^>]*>/g, '')
    .trim();
}

function fileTitleToAlt(title) {
  return String(title || '')
    .replace(/^File:/i, '')
    .replace(/\.[a-zA-Z0-9]+$/, '')
    .replace(/_/g, ' ')
    .trim();
}

export async function searchPhotos(query, perPage = 6) {
  const url = new URL(COMMONS_API_URL);
  url.searchParams.set('action', 'query');
  url.searchParams.set('generator', 'search');
  url.searchParams.set('gsrsearch', query);
  url.searchParams.set('gsrnamespace', '6'); // File namespace
  url.searchParams.set('gsrlimit', '25'); // over-fetch since category filtering removes some
  url.searchParams.set('prop', 'imageinfo|categories');
  url.searchParams.set('iiprop', 'url|extmetadata');
  url.searchParams.set('iiurlwidth', '800');
  url.searchParams.set('cllimit', '50');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');

  const res = await fetch(url, {
    headers: {
      // Wikimedia's API etiquette policy requires a descriptive User-Agent.
      'User-Agent': 'AIWebpageBuilder/1.0 (classroom coding project; server-side image search)'
    }
  });

  if (!res.ok) {
    throw new Error(`Wikimedia Commons API error: ${res.status}`);
  }

  const data = await res.json();
  const pages = Array.isArray(data?.query?.pages) ? data.query.pages : [];

  // `index` reflects search relevance rank — sort explicitly rather than
  // trusting array order, which isn't guaranteed to match it.
  pages.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

  const results = [];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info) continue;
    if (isBlockedByCategories(page.categories)) continue;

    const thumbUrl = info.thumburl || info.url;
    if (!thumbUrl) continue;

    const artist = stripHtml(info.extmetadata?.Artist?.value);

    results.push({
      id: String(page.pageid),
      thumbnail: thumbUrl,
      fullUrl: thumbUrl,
      alt: fileTitleToAlt(page.title) || query,
      photographer: artist || 'Wikimedia Commons contributor',
      source: 'Wikimedia Commons'
    });

    if (results.length >= perPage) break;
  }

  return results;
}
