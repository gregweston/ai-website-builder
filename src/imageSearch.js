import { searchPhotos as searchPexels } from './pexelsClient.js';
import { searchPhotos as searchWikimedia } from './wikimediaClient.js';

// Selects the image search provider. Defaults to Pexels (a curated stock
// library, pre-filtered for general/commercial use) since it's the safer
// baseline for a classroom tool. Set IMAGE_PROVIDER=wikimedia to search
// Wikimedia Commons instead — a much broader library (including real named
// people, landmarks, etc.) but not pre-curated for kid-safety, so
// wikimediaClient.js applies its own category-based filtering.
export async function searchPhotos(query, perPage = 6) {
  const provider = (process.env.IMAGE_PROVIDER || 'pexels').toLowerCase();
  if (provider === 'wikimedia') {
    return searchWikimedia(query, perPage);
  }
  return searchPexels(query, perPage);
}
