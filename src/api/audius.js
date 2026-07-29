export const GENRES = [
  { key: 'All', label: 'All' },
  { key: 'Electronic', label: 'Electronic' },
  { key: 'Hip-Hop', label: 'Hip-Hop' },
  { key: 'Pop', label: 'Pop' },
  { key: 'R&B', label: 'R&B' },
  { key: 'Rock', label: 'Rock' },
  { key: 'Jazz', label: 'Jazz' }
];

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=500&auto=format&fit=crop';

async function api(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Multi-music API failed: ${response.status}`);
  return response.json();
}

function normalizeSong(song) {
  return {
    id: String(song.id),
    title: song.title || 'Untitled Track',
    artist: song.artist || 'Unknown Artist',
    artistId: String(song.artistId || song.artist || ''),
    artistHandle: song.artistHandle || `${song.source} Music`,
    artistArtwork: song.artistArtwork || song.artwork || FALLBACK_IMAGE,
    artwork: song.artwork || FALLBACK_IMAGE,
    genre: song.genre || 'Pop',
    playCount: Number(song.playCount || 0),
    duration: Number(song.duration || 180),
    streamUrl: song.streamUrl || '',
    permalink: song.permalink || '#',
    source: song.source || 'Music',
    isFullLength: Boolean(song.isFullLength)
  };
}

function normalizeArtist(artist) {
  return {
    id: String(artist.id || artist.name),
    name: artist.name || 'Unknown artist',
    handle: artist.handle || `${artist.source || 'Music'} Artist`,
    artwork: artist.artwork || FALLBACK_IMAGE,
    trackCount: Number(artist.trackCount || 0),
    followerCount: Number(artist.followerCount || 0),
    permalink: artist.permalink || '#',
    source: artist.source || 'Music'
  };
}

export async function fetchTrendingTracks({ genre = 'All', provider = 'All', limit = 24 } = {}) {
  try {
    const data = await api(`/api/music/trending?genre=${encodeURIComponent(genre)}&provider=${encodeURIComponent(provider)}&limit=${limit}`);
    return (data.tracks || []).map(normalizeSong).slice(0, limit);
  } catch (err) {
    console.warn('Failed to fetch multi-provider trending:', err);
    return [];
  }
}

export async function searchTracks(query, provider = 'All', limit = 24) {
  if (!query?.trim()) return [];
  try {
    const data = await api(`/api/music/search?q=${encodeURIComponent(query)}&provider=${encodeURIComponent(provider)}&limit=${limit}`);
    return (data.tracks || []).map(normalizeSong).slice(0, limit);
  } catch (err) {
    console.warn('Multi-provider search failed:', err);
    return [];
  }
}

export async function searchUsers(query, limit = 12) {
  if (!query?.trim()) return [];
  try {
    const data = await api(`/api/music/search?q=${encodeURIComponent(query)}&limit=${limit}`);
    const artists = (data.artists || []).map(normalizeArtist);
    if (artists.length) return artists.slice(0, limit);
    return deriveArtistsFromTracks((data.tracks || []).map(normalizeSong), limit);
  } catch (err) {
    return [];
  }
}

export async function fetchArtistTracks(artist, limit = 20) {
  const artistName = typeof artist === 'string' ? artist : artist?.name || '';
  if (!artistName) return [];

  try {
    const data = await api(`/api/music/artist/${encodeURIComponent(artistName)}`);
    if (data.tracks?.length) return data.tracks.map(normalizeSong).slice(0, limit);
  } catch (e) {}

  return searchTracks(artistName, 'All', Math.max(limit, 10));
}

export function deriveArtistsFromTracks(tracks, limit = 12) {
  const map = new Map();
  tracks.forEach((track) => {
    const key = track.artistId || track.artist;
    if (!key || map.has(key)) return;
    map.set(key, {
      id: key,
      name: track.artist,
      handle: track.artistHandle || `${track.source} Artist`,
      artwork: track.artistArtwork || track.artwork,
      trackCount: 1,
      followerCount: 0,
      permalink: track.permalink
    });
  });
  return Array.from(map.values()).slice(0, limit);
}

export async function fetchSimilarArtists(artist) {
  const artistName = typeof artist === 'string' ? artist : artist?.name || '';
  if (!artistName) return [];
  const results = await searchUsers(artistName, 12);
  return results.filter((item) => item.name.toLowerCase() !== artistName.toLowerCase());
}
