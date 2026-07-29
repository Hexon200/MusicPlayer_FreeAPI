const FAVORITES_KEY = 'mood_music_favorites_v1';
const LIKED_ARTISTS_KEY = 'aura_liked_artists_v1';
const PLAYLISTS_KEY = 'aura_user_playlists_v1';
const RECENT_MOOD_KEY = 'mood_music_recent_mood_v1';

function readJson(key, fallback) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch (e) {
    console.error(`Error reading ${key} from localStorage`, e);
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Error saving ${key}`, e);
  }
  return value;
}

export function getFavorites() {
  return readJson(FAVORITES_KEY, []);
}

export function saveFavorite(track) {
  const favorites = getFavorites();
  const exists = favorites.some((t) => t.id === track.id);
  const updated = exists ? favorites.filter((t) => t.id !== track.id) : [track, ...favorites];
  return writeJson(FAVORITES_KEY, updated);
}

export function isFavorite(trackId) {
  return getFavorites().some((t) => t.id === trackId);
}

function getArtistKey(artist) {
  if (!artist) return '';
  if (typeof artist === 'string') return artist.toLowerCase().trim();
  const idStr = String(artist.id || '').trim();
  const handleStr = (artist.handle && artist.handle !== 'YouTube Music') ? String(artist.handle).trim().toLowerCase() : '';
  const nameStr = String(artist.name || '').toLowerCase().trim();
  return idStr || handleStr || nameStr;
}

export function getLikedArtists() {
  const current = readJson(LIKED_ARTISTS_KEY, []);
  const legacy = readJson('mood_music_liked_artists', []);
  const fallbackArtwork = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=120&auto=format&fit=crop';

  const combinedMap = new Map();
  [...current, ...legacy].forEach((artist) => {
    if (!artist) return;
    const key = getArtistKey(artist);
    if (key && !combinedMap.has(key)) {
      combinedMap.set(key, {
        ...artist,
        artwork: artist.artwork || fallbackArtwork
      });
    }
  });

  const merged = Array.from(combinedMap.values());
  if (legacy.length > 0) {
    writeJson(LIKED_ARTISTS_KEY, merged);
    try { localStorage.removeItem('mood_music_liked_artists'); } catch (e) {}
  }
  return merged;
}

export function toggleLikedArtist(artist) {
  if (!artist) return [];
  const likedArtists = getLikedArtists();
  const targetKey = getArtistKey(artist);
  const exists = likedArtists.some((item) => getArtistKey(item) === targetKey);
  const normalized = {
    id: artist.id || artist.name,
    name: artist.name,
    handle: artist.handle && artist.handle !== 'YouTube Music' ? artist.handle : '',
    artwork: artist.artwork,
    followerCount: artist.followerCount || 0,
    trackCount: artist.trackCount || 0
  };
  const updated = exists
    ? likedArtists.filter((item) => getArtistKey(item) !== targetKey)
    : [normalized, ...likedArtists];
  return writeJson(LIKED_ARTISTS_KEY, updated);
}

export function isLikedArtist(artist) {
  if (!artist) return false;
  const targetKey = getArtistKey(artist);
  if (!targetKey) return false;
  return getLikedArtists().some((item) => getArtistKey(item) === targetKey);
}

export function getPlaylists() {
  return readJson(PLAYLISTS_KEY, []);
}

export function createPlaylist(name = 'My Playlist') {
  const playlists = getPlaylists();
  const trimmed = String(name || '').trim() || `My Playlist ${playlists.length + 1}`;
  const playlist = {
    id: `playlist-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: trimmed,
    tracks: [],
    createdAt: new Date().toISOString()
  };
  return writeJson(PLAYLISTS_KEY, [playlist, ...playlists])[0];
}

export function addTrackToPlaylist(playlistId, track) {
  const playlists = getPlaylists();
  const updated = playlists.map((playlist) => {
    if (playlist.id !== playlistId) return playlist;
    const exists = playlist.tracks.some((item) => item.id === track.id);
    return exists ? playlist : { ...playlist, tracks: [track, ...playlist.tracks] };
  });
  writeJson(PLAYLISTS_KEY, updated);
  return updated.find((playlist) => playlist.id === playlistId);
}

export function removeTrackFromPlaylist(playlistId, trackId) {
  const playlists = getPlaylists();
  const updated = playlists.map((playlist) => (
    playlist.id === playlistId
      ? { ...playlist, tracks: playlist.tracks.filter((track) => track.id !== trackId) }
      : playlist
  ));
  return writeJson(PLAYLISTS_KEY, updated);
}

export function getSavedMood() {
  return localStorage.getItem(RECENT_MOOD_KEY) || 'chill';
}

export function saveMood(mood) {
  localStorage.setItem(RECENT_MOOD_KEY, mood);
}
