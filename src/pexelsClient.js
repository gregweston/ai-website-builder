const PEXELS_API_URL = 'https://api.pexels.com/v1/search';

// Pexels's curated library is already filtered for general/commercial use —
// a reasonable baseline for a classroom. We only ever return search results;
// there is no open text search exposed to the frontend.
export async function searchPhotos(query, perPage = 6) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    throw new Error('PEXELS_API_KEY is not set');
  }

  const url = new URL(PEXELS_API_URL);
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', String(perPage));
  url.searchParams.set('orientation', 'landscape');

  const res = await fetch(url, {
    headers: { Authorization: apiKey }
  });

  if (!res.ok) {
    throw new Error(`Pexels API error: ${res.status}`);
  }

  const data = await res.json();
  return (data.photos || []).map((p) => ({
    id: p.id,
    thumbnail: p.src.medium,
    fullUrl: p.src.large,
    alt: p.alt || query,
    photographer: p.photographer
  }));
}
