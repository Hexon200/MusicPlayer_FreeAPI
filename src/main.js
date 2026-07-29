import './style.css';
import {
  GENRES,
  deriveArtistsFromTracks,
  fetchArtistTracks,
  fetchSimilarArtists,
  fetchTrendingTracks,
  searchTracks,
  searchUsers
} from './api/audius.js';
import { PlayerEngine } from './components/Player.js';
import { setupVisualizer } from './components/Visualizer.js';
import {
  addTrackToPlaylist,
  createPlaylist,
  getFavorites,
  getLikedArtists,
  getPlaylists,
  isFavorite,
  isLikedArtist,
  saveFavorite,
  toggleLikedArtist
} from './utils/storage.js';

let currentTracks = [];
let currentArtists = [];
let activeGenre = 'All';
let activeView = 'home';
let player = null;
let visualizerControls = null;
let suggestionTimer = null;
let suggestionAbortToken = 0;
let selectedPlaylistId = null;

const $ = (selector) => document.querySelector(selector);

let activeProviderFilter = 'All';

window.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
  player = new PlayerEngine(renderPlayerState);
  setupResizers();

  const savedCollapsed = localStorage.getItem('aurasound:sidebar-collapsed') === 'true';
  if (savedCollapsed) {
    $('#app')?.classList.add('side-nav-collapsed');
  }

  renderGenreTabs();
  renderProviderFilterPills();
  bindEvents();
  refreshIcons();
  updateFavCount();
  renderSidebarLikedArtists();
  await loadTrending('All');
}

function bindEvents() {
  const searchInput = $('#global-search');
  const suggestions = $('#search-suggestions');

  $('#search-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = searchInput.value.trim();
    hideSuggestions();
    if (!query) return loadTrending(activeGenre);
    await runSearch(query);
  });

  searchInput.addEventListener('input', () => {
    clearTimeout(suggestionTimer);
    const query = searchInput.value.trim();
    if (query.length < 2) {
      hideSuggestions();
      return;
    }
    suggestionTimer = setTimeout(() => loadSuggestions(query), 220);
  });

  searchInput.addEventListener('focus', () => {
    if (suggestions.children.length) suggestions.classList.add('open');
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#search-form')) hideSuggestions();
  });

  document.querySelectorAll('[data-view]').forEach((control) => {
    control.addEventListener('click', (e) => {
      e.preventDefault();
      setView(control.dataset.view);
    });
  });

  $('#btn-refresh').addEventListener('click', () => loadTrending(activeGenre));
  $('#btn-play-featured').addEventListener('click', () => playIndex(0));
  $('#btn-play-all').addEventListener('click', () => playIndex(0));
  $('#btn-create-playlist')?.addEventListener('click', () => handleCreatePlaylist());
  $('#btn-sidebar-create-playlist')?.addEventListener('click', () => handleCreatePlaylist());
  $('#btn-mobile-library')?.addEventListener('click', () => setView('library'));

  $('#btn-nav-favorites')?.addEventListener('click', () => {
    renderDrawerFavorites();
    const drawer = $('#favorites-drawer');
    if (drawer) {
      drawer.classList.add('open');
      drawer.setAttribute('aria-hidden', 'false');
    }
  });

  $('#btn-toggle-sidebar')?.addEventListener('click', () => {
    const shell = $('#app');
    if (!shell) return;
    const isCollapsed = shell.classList.toggle('side-nav-collapsed');
    localStorage.setItem('aurasound:sidebar-collapsed', String(isCollapsed));
    const btnIcon = $('#btn-toggle-sidebar i');
    if (btnIcon) btnIcon.setAttribute('data-lucide', isCollapsed ? 'panel-left-open' : 'panel-left-close');
    refreshIcons();
  });

  $('#btn-play-main').addEventListener('click', () => {
    visualizerControls?.initAudioContext();
    player.togglePlay();
  });
  $('#btn-next').addEventListener('click', () => player.next());
  $('#btn-prev').addEventListener('click', () => player.prev());
  $('#btn-shuffle').addEventListener('click', () => player.toggleShuffle());
  $('#btn-repeat').addEventListener('click', () => player.toggleRepeat());
  $('#volume-bar').addEventListener('input', (e) => player.setVolume(parseFloat(e.target.value)));
  $('#seek-bar')?.addEventListener('input', (e) => player.seek(parseFloat(e.target.value)));
  $('#btn-mute').addEventListener('click', () => player.setVolume(player.volume > 0 ? 0 : 0.8));

  $('#btn-add-liked-video')?.addEventListener('click', () => {
    const track = player?.currentTrack();
    if (!track) return;
    saveFavorite(track);
    updateFavCount();
    renderPlayerState(player.state);
    if (activeView === 'library') renderLibraryAsMain();
  });

  const drawer = $('#favorites-drawer');
  const openers = [$('#btn-open-favorites')].filter(Boolean);
  const closeBtn = $('#btn-close-drawer');

  const openDrawer = () => {
    renderDrawerFavorites();
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    openers.forEach((button) => button.setAttribute('aria-expanded', 'true'));
    document.body.classList.add('drawer-open');
    closeBtn.focus({ preventScroll: true });
  };

  const closeDrawer = () => {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    openers.forEach((button) => button.setAttribute('aria-expanded', 'false'));
    document.body.classList.remove('drawer-open');
    openers[0]?.focus({ preventScroll: true });
  };

  openers.forEach((button) => button.addEventListener('click', openDrawer));
  closeBtn.addEventListener('click', closeDrawer);
  drawer.addEventListener('click', (e) => {
    if (e.target === drawer) closeDrawer();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer();
    if (e.key === 'Escape') hideSuggestions();
  });
}

function setView(view) {
  activeView = view;
  renderSidebarLikedArtists();
  document.querySelectorAll('[data-view]').forEach((item) => {
    item.classList.toggle('active', item.dataset.view === view);
  });

  if (view !== 'artist') {
    document.body.classList.remove('artist-mode');
    const headerSlot = $('#artist-header-slot');
    if (headerSlot) headerSlot.innerHTML = '';
    const albumsSec = $('#albums-section');
    if (albumsSec) albumsSec.style.display = 'none';
  }

  if (view === 'search') {
    $('#global-search').focus({ preventScroll: false });
  }
  if (view === 'library') {
    renderLibraryAsMain();
  }
  if (view === 'home') {
    document.body.classList.remove('library-mode');
    restoreCatalogHeadings();
    if (!currentTracks.length) {
      loadTrending(activeGenre);
    } else {
      renderTracks(currentTracks);
      renderArtists(currentArtists);
    }
    $('#home-view').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function renderGenreTabs() {
  $('#genre-tabs').innerHTML = GENRES.map((genre) => `
    <button class="genre-tab ${genre.key === activeGenre ? 'active' : ''}" type="button" data-genre="${escapeHtml(genre.key)}" aria-pressed="${genre.key === activeGenre}">
      ${escapeHtml(genre.label)}
    </button>
  `).join('');

  $('#genre-tabs').querySelectorAll('.genre-tab').forEach((button) => {
    button.addEventListener('click', () => loadTrending(button.dataset.genre));
  });
}

function renderProviderFilterPills() {
  const container = $('#provider-sort-pills');
  if (!container) return;

  const PROVIDERS = [
    { key: 'All', label: 'All APIs' },
    { key: 'Deezer', label: 'Deezer' },
    { key: 'iTunes', label: 'iTunes' },
    { key: 'Jamendo', label: 'Jamendo' },
    { key: 'SoundCloud', label: 'SoundCloud' }
  ];

  container.innerHTML = PROVIDERS.map((p) => `
    <button class="provider-pill ${activeProviderFilter === p.key ? 'active' : ''}" type="button" data-provider="${p.key}">
      ${escapeHtml(p.label)}
    </button>
  `).join('');

  container.querySelectorAll('.provider-pill').forEach((btn) => {
    btn.addEventListener('click', async () => {
      activeProviderFilter = btn.dataset.provider;
      renderProviderFilterPills();
      setLoadingState(`Loading ${activeProviderFilter} music...`);
      currentTracks = await fetchTrendingTracks({ genre: activeGenre, provider: activeProviderFilter, limit: 24 });
      setInitialPlaylist(currentTracks);
      renderTracks(currentTracks);
      refreshIcons();
    });
  });
}

function setInitialPlaylist(tracks) {
  if (!player?.isPlaying && !player?.currentTrack()) {
    player?.setPlaylist(tracks, 0, false);
  }
}

async function loadTrending(genre = 'All') {
  activeGenre = genre;
  activeView = 'home';
  document.body.classList.remove('library-mode');
  document.body.classList.remove('artist-mode');
  restoreCatalogHeadings();
  setActiveGenreTab();
  setLoadingState('Loading trending music...');
  $('#track-heading').textContent = genre === 'All' ? 'Trending tracks' : `${genre} trending`;
  $('#tracks-kicker').textContent = 'Made for streaming';
  $('#active-context').textContent = genre === 'All' ? 'Trending now' : genre;

  currentTracks = await fetchTrendingTracks({ genre, provider: activeProviderFilter, limit: 24 });
  currentArtists = deriveArtistsFromTracks(currentTracks, 12);
  setInitialPlaylist(currentTracks);
  renderProviderFilterPills();
  renderTracks(currentTracks);
  renderArtists(currentArtists);
  renderHeroArt(currentTracks);
  refreshIcons();
}

async function runSearch(query) {
  activeView = 'search';
  document.body.classList.remove('library-mode');
  document.body.classList.remove('artist-mode');
  restoreCatalogHeadings();
  hideSuggestions();
  setLoadingState(`Searching for “${query}”...`);
  $('#track-heading').textContent = `Results for “${query}”`;
  $('#tracks-kicker').textContent = 'Search results';
  $('#active-context').textContent = 'Search';

  const [tracks, users] = await Promise.all([
    searchTracks(query, 24),
    searchUsers(query, 12)
  ]);

  const exactArtist = users.find((user) => isExactArtistQuery(user, query));
  if (exactArtist) {
    currentArtists = users;
    renderArtists(currentArtists);
    await openArtist(exactArtist);
    return;
  }

  currentTracks = tracks;
  currentArtists = users.length ? users : deriveArtistsFromTracks(tracks, 12);
  setInitialPlaylist(currentTracks);
  renderTracks(currentTracks);
  renderArtists(currentArtists);
  renderHeroArt(currentTracks);
  refreshIcons();
}

async function openArtist(artist) {
  activeView = 'artist';
  document.body.classList.add('artist-mode');
  document.body.classList.remove('library-mode');
  restoreCatalogHeadings();

  const artistHeading = document.querySelector('.artists-section .section-heading h3');
  const artistEyebrow = document.querySelector('.artists-section .eyebrow');
  if (artistHeading) artistHeading.textContent = 'Similar Artists';
  if (artistEyebrow) artistEyebrow.textContent = 'Fans Also Like';

  const isLiked = isLikedArtist(artist);
  renderArtistHeader(artist, isLiked);
  setLoadingState(`Loading Top 10 songs by ${artist.name}...`);

  const [fetched, similarArtists] = await Promise.all([
    fetchArtistTracks(artist, 20),
    fetchSimilarArtists(artist)
  ]);

  currentTracks = fetched.slice(0, 10);
  currentArtists = similarArtists.length ? similarArtists : [artist, ...currentArtists.filter((item) => item.name !== artist.name)].slice(0, 12);
  setInitialPlaylist(currentTracks);
  $('#track-heading').textContent = `Popular — Top 10 Songs`;
  $('#tracks-kicker').textContent = artist.name;
  $('#active-context').textContent = isLiked ? 'Liked Artist' : 'Verified Artist';

  renderTracks(currentTracks);
  renderArtistAlbums(artist, fetched);
  renderArtists(currentArtists);
  refreshIcons();
}

function renderArtistHeader(artist, isLiked) {
  const slot = $('#artist-header-slot');
  if (!slot) return;
  slot.innerHTML = `
    <div class="artist-header-card">
      <img class="artist-header-avatar" src="${artist.artwork}" alt="${escapeHtml(artist.name)}" />
      <div class="artist-header-info">
        <span class="artist-header-badge"><i data-lucide="check-circle-2"></i> Verified Artist</span>
        <h2>${escapeHtml(artist.name)}</h2>
        <span class="artist-header-meta">${artist.followerCount ? `${formatNumber(artist.followerCount)} monthly listeners` : 'Popular Artist'}</span>
        <button class="btn-follow-artist ${isLiked ? 'active' : ''}" type="button" id="btn-toggle-follow-artist">
          <i data-lucide="heart"></i> <span>${isLiked ? 'Following in Library' : 'Follow Artist'}</span>
        </button>
      </div>
    </div>
  `;

  $('#btn-toggle-follow-artist')?.addEventListener('click', () => {
    toggleLikedArtist(artist);
    const updatedLiked = isLikedArtist(artist);
    renderArtistHeader(artist, updatedLiked);
    renderArtists(currentArtists);
    renderSidebarLikedArtists();
    if (activeView === 'library') renderLibraryAsMain();
  });
}

function renderArtistAlbums(artist, tracks) {
  const albumsSection = $('#albums-section');
  const albumGrid = $('#album-grid');
  if (!albumsSection || !albumGrid) return;

  const albumsMap = new Map();
  tracks.forEach((track, i) => {
    const albumName = track.genre && track.genre !== 'JioSaavn' ? track.genre : `${artist.name} Release ${i + 1}`;
    if (!albumsMap.has(albumName)) {
      albumsMap.set(albumName, {
        name: albumName,
        artwork: track.artwork,
        year: 2024 - Math.floor(i / 2),
        trackCount: 1
      });
    } else {
      albumsMap.get(albumName).trackCount += 1;
    }
  });

  const albums = Array.from(albumsMap.values()).sort((a, b) => b.year - a.year);

  if (!albums.length) {
    albumsSection.style.display = 'none';
    return;
  }

  albumsSection.style.display = 'block';
  albumGrid.innerHTML = albums.map((album) => `
    <article class="album-card">
      <img src="${album.artwork}" alt="${escapeHtml(album.name)}" loading="lazy" />
      <strong>${escapeHtml(album.name)}</strong>
      <small>${album.year} • ${album.trackCount} ${album.trackCount === 1 ? 'song' : 'songs'}</small>
    </article>
  `).join('');
}

async function loadSuggestions(query) {
  const token = ++suggestionAbortToken;
  const [users, tracks] = await Promise.all([
    searchUsers(query, 3),
    searchTracks(query, 3)
  ]);
  if (token !== suggestionAbortToken || $('#global-search').value.trim() !== query) return;

  const suggestions = [
    ...users.slice(0, 3).map((item) => ({ type: 'artist', item })),
    ...tracks.slice(0, 3).map((item) => ({ type: 'track', item }))
  ].slice(0, 5);

  renderSuggestions(suggestions, query);
}

function renderSuggestions(suggestions, query) {
  const box = $('#search-suggestions');
  if (!suggestions.length) {
    box.innerHTML = `<div class="suggestion-empty">No suggestions for “${escapeHtml(query)}”</div>`;
    box.classList.add('open');
    return;
  }

  box.innerHTML = suggestions.map(({ type, item }, index) => `
    <button class="suggestion-item" type="button" role="option" data-suggestion-index="${index}" data-suggestion-type="${type}">
      <img src="${type === 'artist' ? item.artwork : item.artwork}" alt="" />
      <span>
        <strong>${escapeHtml(type === 'artist' ? item.name : item.title)}</strong>
        <small>${type === 'artist' ? `Artist ${item.handle ? `• ${escapeHtml(item.handle)}` : ''}` : `${escapeHtml(item.artist)} • Song`}</small>
      </span>
    </button>
  `).join('');

  box.querySelectorAll('.suggestion-item').forEach((button) => {
    button.addEventListener('click', async () => {
      const suggestion = suggestions[parseInt(button.dataset.suggestionIndex, 10)];
      hideSuggestions();
      if (suggestion.type === 'artist') {
        $('#global-search').value = suggestion.item.name;
        currentArtists = [suggestion.item, ...currentArtists.filter((artist) => artist.id !== suggestion.item.id)].slice(0, 12);
        await openArtist(suggestion.item);
      } else {
        $('#global-search').value = suggestion.item.title;
        currentTracks = [suggestion.item];
        currentArtists = deriveArtistsFromTracks(currentTracks, 12);
        player.setPlaylist(currentTracks, 0, false);
        $('#track-heading').textContent = suggestion.item.title;
        $('#tracks-kicker').textContent = `${suggestion.item.artist} • Song`;
        $('#active-context').textContent = 'Top result';
        renderArtists(currentArtists);
        renderTracks(currentTracks);
        renderHeroArt(currentTracks);
      }
    });
  });
  box.classList.add('open');
  refreshIcons();
}

function hideSuggestions() {
  const box = $('#search-suggestions');
  if (!box) return;
  box.classList.remove('open');
}

function renderTracks(tracks) {
  const feed = $('#track-feed');
  if (!tracks.length) {
    feed.innerHTML = `<div class="empty-state"><i data-lucide="music-2"></i><h4>No tracks found</h4><p>Try another search or genre.</p></div>`;
    refreshIcons();
    return;
  }

  const state = player.getState();
  feed.innerHTML = tracks.map((track, index) => {
    const isCurrent = state.currentTrack?.id === track.id;
    const liked = isFavorite(track.id);
    return `
      <article class="track-row ${isCurrent ? 'playing' : ''}" data-index="${index}">
        <button class="row-play" type="button" aria-label="Play ${escapeHtml(track.title)}"><span class="row-index">${index + 1}</span><i data-lucide="play"></i></button>
        <img class="row-art" src="${track.artwork}" alt="${escapeHtml(track.title)} artwork" loading="lazy" />
        <div class="row-main">
          <strong>${escapeHtml(track.title)}</strong>
          <button class="artist-link" type="button" data-track-index="${index}">${escapeHtml(track.artist)}</button>
        </div>
        <span class="row-genre"><span class="provider-badge source-${(track.source || 'music').toLowerCase()}">${escapeHtml(track.source || 'Music')}</span> ${escapeHtml(track.genre)}</span>
        <span class="row-plays">${formatNumber(track.playCount)} plays</span>
        <div class="row-actions">
          <button class="btn-fav ${liked ? 'active' : ''}" type="button" data-fav-id="${track.id}" aria-label="${liked ? 'Remove from' : 'Save to'} liked songs"><i data-lucide="heart"></i></button>
          <button class="btn-add-playlist" type="button" data-add-id="${track.id}" aria-label="Add ${escapeHtml(track.title)} to playlist"><i data-lucide="plus"></i></button>
        </div>
        <span class="row-duration">${formatTime(track.duration)}</span>
      </article>
    `;
  }).join('');

  feed.querySelectorAll('.track-row').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.btn-fav') || e.target.closest('.btn-add-playlist') || e.target.closest('.artist-link')) return;
      playIndex(parseInt(row.dataset.index, 10));
    });
  });

  feed.querySelectorAll('.btn-fav').forEach((button) => {
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const track = tracks.find((item) => item.id === button.dataset.favId);
      if (!track) return;
      saveFavorite(track);
      updateFavCount();
      renderTracks(currentTracks);
      renderDrawerFavorites();
    });
  });

  feed.querySelectorAll('.btn-add-playlist').forEach((button) => {
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const track = tracks.find((item) => item.id === button.dataset.addId);
      if (track) handleAddToPlaylist(track);
    });
  });

  feed.querySelectorAll('.artist-link').forEach((button) => {
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const track = tracks[parseInt(button.dataset.trackIndex, 10)];
      if (track) openArtist(artistFromTrack(track));
    });
  });

  refreshIcons();
}

function renderArtists(artists) {
  const row = $('#artist-row');
  const fallbackArt = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=120&auto=format&fit=crop';
  if (!artists.length) {
    row.innerHTML = `<div class="empty-state slim">No artists found yet.</div>`;
    refreshIcons();
    return;
  }
  row.innerHTML = artists.map((artist, index) => {
    const liked = isLikedArtist(artist);
    const artUrl = artist.artwork || fallbackArt;
    return `
    <article class="artist-card ${liked ? 'liked' : ''}">
      <button class="artist-open" type="button" data-artist-card="${index}" aria-label="Open artist ${escapeHtml(artist.name)}">
      <img src="${artUrl}" alt="${escapeHtml(artist.name)}" loading="lazy" onerror="this.onerror=null;this.src='${fallbackArt}';" />
      <strong>${escapeHtml(artist.name)}</strong>
      <span>${escapeHtml(artist.handle || `${artist.trackCount || 0} tracks`)}</span>
      </button>
      <button class="btn-artist-like ${liked ? 'active' : ''}" type="button" data-like-artist="${index}" aria-label="${liked ? 'Remove' : 'Save'} ${escapeHtml(artist.name)} as liked artist"><i data-lucide="heart"></i></button>
    </article>
  `;
  }).join('');

  row.querySelectorAll('.artist-open').forEach((card) => {
    card.addEventListener('click', () => openArtist(artists[parseInt(card.dataset.artistCard, 10)]));
  });

  row.querySelectorAll('.btn-artist-like').forEach((button) => {
    button.addEventListener('click', () => {
      toggleLikedArtist(artists[parseInt(button.dataset.likeArtist, 10)]);
      renderArtists(artists);
      renderSidebarLikedArtists();
      if (activeView === 'library') renderLibraryAsMain();
    });
  });
  refreshIcons();
}

function renderSidebarLikedArtists() {
  const container = $('#sidebar-liked-artists-list');
  const countBadge = $('#sidebar-liked-artists-count');
  if (!container) return;

  const fallbackArt = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=120&auto=format&fit=crop';
  const userLiked = getLikedArtists();
  const hasUserLikes = userLiked.length > 0;

  if (countBadge) countBadge.textContent = String(userLiked.length);

  let artists = userLiked;
  if (!hasUserLikes) {
    artists = [
      { id: 'kendrick-lamar', name: 'Kendrick Lamar', handle: 'Artist • Hip-Hop', artwork: 'https://lh3.googleusercontent.com/hMjzHmIuTV0XPlvRSjl3wMR6NP-uF-fqF6kkandkFX-hEVp6d3tw-FQG9_smAq0tFwNBT6QLQR-Hkwge=w120-h120-p-l90-rj' },
      { id: 'taylor-swift', name: 'Taylor Swift', handle: 'Artist • Pop', artwork: fallbackArt },
      { id: 'drake', name: 'Drake', handle: 'Artist • Hip-Hop', artwork: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=120&auto=format&fit=crop' }
    ];
  }

  container.innerHTML = artists.map((artist, index) => `
    <button class="sidebar-artist-item" type="button" data-sidebar-artist-index="${index}" title="${escapeHtml(artist.name)}">
      <img class="sidebar-artist-avatar" src="${artist.artwork || fallbackArt}" alt="${escapeHtml(artist.name)}" onerror="this.onerror=null;this.src='${fallbackArt}';" />
      <div class="sidebar-artist-info">
        <strong class="sidebar-artist-name">${escapeHtml(artist.name)}</strong>
        <span class="sidebar-artist-desc">${escapeHtml(artist.handle || 'Artist')}</span>
      </div>
    </button>
  `).join('');

  container.querySelectorAll('[data-sidebar-artist-index]').forEach((button) => {
    button.addEventListener('click', () => {
      const idx = parseInt(button.dataset.sidebarArtistIndex, 10);
      if (artists[idx]) openArtist(artists[idx]);
    });
  });
  refreshIcons();
}

function renderLibraryAsMain() {
  const favorites = getFavorites();
  const likedArtists = getLikedArtists();
  const playlists = getPlaylists();
  activeView = 'library';
  document.body.classList.add('library-mode');
  const artistHeading = document.querySelector('.artists-section .section-heading h3');
  const artistEyebrow = document.querySelector('.artists-section .eyebrow');
  if (artistHeading) artistHeading.textContent = 'Your Library';
  if (artistEyebrow) artistEyebrow.textContent = 'Collection';
  $('#tracks-kicker').textContent = 'Your Library';
  $('#track-heading').textContent = selectedPlaylistId
    ? playlists.find((playlist) => playlist.id === selectedPlaylistId)?.name || 'Playlist'
    : 'Favorite Songs';
  $('#active-context').textContent = `${playlists.length} playlists • ${favorites.length} liked songs • ${likedArtists.length} liked artists`;

  renderSidebarLikedArtists();
  $('#artist-row').innerHTML = renderLibraryCards(playlists, favorites, likedArtists);
  bindLibraryCards(playlists, favorites, likedArtists);

  const selectedPlaylist = playlists.find((playlist) => playlist.id === selectedPlaylistId);
  currentTracks = selectedPlaylist ? selectedPlaylist.tracks : favorites;
  setInitialPlaylist(currentTracks);
  renderTracks(currentTracks);
  renderHeroArt(currentTracks);
  refreshIcons();
}

function restoreCatalogHeadings() {
  const artistHeading = document.querySelector('.artists-section .section-heading h3');
  const artistEyebrow = document.querySelector('.artists-section .eyebrow');
  if (artistHeading) artistHeading.textContent = 'Artists';
  if (artistEyebrow) artistEyebrow.textContent = 'Popular';
}

function renderLibraryCards(playlists, favorites, likedArtists) {
  const playlistCards = playlists.length
    ? playlists.map((playlist) => `
      <button class="playlist-card ${selectedPlaylistId === playlist.id ? 'active' : ''}" type="button" data-playlist-id="${playlist.id}">
        <span class="playlist-cover"><i data-lucide="music"></i></span>
        <strong>${escapeHtml(playlist.name)}</strong>
        <small>${playlist.tracks.length} songs</small>
      </button>
    `).join('')
    : `
      <button class="playlist-empty-card" type="button" data-create-playlist>
        <span><i data-lucide="plus"></i></span>
        <strong>Create your first playlist</strong>
        <small>Tap plus and start saving songs.</small>
      </button>
    `;

  const likedArtistCards = likedArtists.length
    ? likedArtists.slice(0, 8).map((artist, index) => `
      <button class="liked-artist-card" type="button" data-liked-artist-index="${index}">
        <img src="${artist.artwork}" alt="${escapeHtml(artist.name)}" />
        <strong>${escapeHtml(artist.name)}</strong>
        <small>${escapeHtml(artist.handle || 'Liked artist')}</small>
      </button>
    `).join('')
    : `<div class="library-mini-empty"><i data-lucide="user-plus"></i><span>Like artists with the heart on artist cards.</span></div>`;

  return `
    <div class="library-home-grid">
      <section class="library-feature-card liked-songs-card" data-show-liked>
        <div><i data-lucide="heart"></i></div>
        <strong>Favorite Songs</strong>
        <small>${favorites.length} saved songs</small>
      </section>
      <section class="library-feature-card">
        <div><i data-lucide="users"></i></div>
        <strong>Liked Artists</strong>
        <small>${likedArtists.length} saved artists</small>
      </section>
    </div>
    <div class="library-section-title"><h4>Your Playlists</h4><button type="button" data-create-playlist aria-label="Create playlist"><i data-lucide="plus"></i></button></div>
    <div class="playlist-grid">${playlistCards}</div>
    <div class="library-section-title"><h4>Liked Artists</h4></div>
    <div class="liked-artists-grid">${likedArtistCards}</div>
  `;
}

function bindLibraryCards(playlists, favorites, likedArtists) {
  document.querySelectorAll('[data-create-playlist]').forEach((button) => {
    button.addEventListener('click', handleCreatePlaylist);
  });
  document.querySelectorAll('[data-playlist-id]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedPlaylistId = button.dataset.playlistId;
      renderLibraryAsMain();
    });
  });
  document.querySelectorAll('[data-show-liked]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedPlaylistId = null;
      currentTracks = favorites;
      renderTracks(currentTracks);
    });
  });
  document.querySelectorAll('[data-liked-artist-index]').forEach((button) => {
    button.addEventListener('click', () => openArtist(likedArtists[parseInt(button.dataset.likedArtistIndex, 10)]));
  });
}

function handleCreatePlaylist() {
  const name = window.prompt('Playlist name', `My Playlist ${getPlaylists().length + 1}`);
  if (name === null) return;
  const playlist = createPlaylist(name);
  selectedPlaylistId = playlist.id;
  renderLibraryAsMain();
}

function handleAddToPlaylist(track) {
  let playlists = getPlaylists();
  if (!playlists.length) {
    const create = window.confirm('You do not have playlists yet. Create one now?');
    if (!create) return;
    const playlist = createPlaylist(window.prompt('Playlist name', 'My Playlist') || 'My Playlist');
    playlists = [playlist];
  }

  const choice = window.prompt(
    `Add “${track.title}” to playlist:\n${playlists.map((playlist, index) => `${index + 1}. ${playlist.name}`).join('\n')}`,
    '1'
  );
  if (choice === null) return;
  const index = Number(choice) - 1;
  const playlist = playlists[index];
  if (!playlist) return;
  addTrackToPlaylist(playlist.id, track);
  selectedPlaylistId = playlist.id;
  if (activeView === 'library') renderLibraryAsMain();
}

function renderDrawerFavorites() {
  const container = $('#drawer-track-list');
  const favorites = getFavorites();
  if (!favorites.length) {
    container.innerHTML = `<div class="empty-state"><i data-lucide="heart-off"></i><h4>No liked songs yet</h4><p>Tap the heart on any track to save it here.</p></div>`;
    refreshIcons();
    return;
  }

  container.innerHTML = favorites.map((track, index) => `
    <article class="drawer-track" data-fav-index="${index}">
      <img src="${track.artwork}" alt="${escapeHtml(track.title)} artwork" />
      <div><strong>${escapeHtml(track.title)}</strong><span>${escapeHtml(track.artist)}</span></div>
      <button class="btn-fav active" type="button" data-remove-id="${track.id}" aria-label="Remove ${escapeHtml(track.title)}"><i data-lucide="trash-2"></i></button>
    </article>
  `).join('');

  container.querySelectorAll('.drawer-track').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.btn-fav')) return;
      currentTracks = favorites;
      player.setPlaylist(favorites, parseInt(row.dataset.favIndex, 10), true);
    });
  });

  container.querySelectorAll('[data-remove-id]').forEach((button) => {
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const track = favorites.find((item) => item.id === button.dataset.removeId);
      if (!track) return;
      saveFavorite(track);
      updateFavCount();
      renderDrawerFavorites();
      renderTracks(currentTracks);
    });
  });
  refreshIcons();
}

function playIndex(index) {
  if (!currentTracks.length) return;
  visualizerControls?.initAudioContext();
  player.setPlaylist(currentTracks, index, true);
}

function renderPlayerState(state) {
  const { currentTrack, isPlaying, currentTime, duration, volume, isShuffle, isRepeat, lastError } = state;
  if (currentTrack) {
    $('#player-thumb').src = currentTrack.artwork;
    $('#player-title').textContent = currentTrack.title;
    $('#player-artist').textContent = lastError || currentTrack.artist;
    $('#side-now-art').src = currentTrack.artwork;
    $('#side-now-title').textContent = currentTrack.title;
    $('#side-now-artist').textContent = lastError || currentTrack.artist;

    const isFav = isFavorite(currentTrack.id);
    const addBtn = $('#btn-add-liked-video');
    if (addBtn) {
      addBtn.classList.toggle('active', isFav);
      const span = addBtn.querySelector('span');
      const icon = addBtn.querySelector('i');
      if (span) span.textContent = isFav ? 'Saved in Liked Songs' : 'Add to Liked Songs';
      if (icon) icon.setAttribute('data-lucide', isFav ? 'check' : 'plus');
    }

    const watchBtn = $('#btn-watch-youtube');
    if (watchBtn) {
      watchBtn.href = currentTrack.permalink || '#';
      const span = watchBtn.querySelector('span');
      if (span) span.textContent = `Open on ${currentTrack.source || 'Music'}`;
    }
  }

  const mainPlayBtn = $('#btn-play-main');
  if (mainPlayBtn) {
    mainPlayBtn.innerHTML = `<i data-lucide="${isPlaying ? 'pause' : 'play'}"></i>`;
    mainPlayBtn.setAttribute('aria-label', isPlaying ? 'Pause track' : 'Play track');
  }
  $('#btn-shuffle').classList.toggle('active', isShuffle);
  $('#btn-repeat').classList.toggle('active', isRepeat);
  $('#time-current').textContent = formatTime(currentTime);
  $('#time-total').textContent = formatTime(duration);
  $('#seek-bar').max = Math.floor(duration || 100);
  $('#seek-bar').value = Math.floor(currentTime || 0);
  $('#volume-bar').value = volume;
  renderTracksPlayingState(currentTrack, isPlaying);
  refreshIcons();
}

function renderTracksPlayingState(currentTrack, isPlaying) {
  document.querySelectorAll('.track-row').forEach((row) => {
    const track = currentTracks[parseInt(row.dataset.index, 10)];
    const isCurrent = currentTrack?.id === track?.id;
    row.classList.toggle('playing', isCurrent);
    const icon = row.querySelector('.row-play i');
    if (icon) icon.setAttribute('data-lucide', isCurrent && isPlaying ? 'pause' : 'play');
  });
}

function setLoadingState(label) {
  $('#track-feed').innerHTML = Array.from({ length: 8 }, (_, i) => `
    <div class="track-row skeleton-row" aria-label="${escapeHtml(label)} ${i + 1}"></div>
  `).join('');
  $('#artist-row').innerHTML = Array.from({ length: 6 }, () => '<div class="artist-card skeleton-artist"></div>').join('');
}

function setActiveGenreTab() {
  document.querySelectorAll('.genre-tab').forEach((tab) => {
    const active = tab.dataset.genre === activeGenre;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-pressed', String(active));
  });
}

function renderHeroArt(tracks) {
  const fallback = 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&auto=format&fit=crop';
  $('#hero-art-main').src = tracks[0]?.artwork || fallback;
  $('#hero-art-back-a').src = tracks[1]?.artwork || fallback;
  $('#hero-art-back-b').src = tracks[2]?.artwork || fallback;
}

function artistFromTrack(track) {
  return {
    id: track.artistId || track.artist,
    name: track.artist,
    handle: track.artistHandle,
    artwork: track.artistArtwork || track.artwork,
    trackCount: 1,
    followerCount: 0
  };
}

function updateFavCount() {
  const favCount = $('#fav-count');
  if (favCount) favCount.textContent = getFavorites().length;
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function formatTime(seconds) {
  if (!seconds || Number.isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function formatNumber(value) {
  const number = Number(value || 0);
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(1)}K`;
  return String(number);
}

function isExactArtistQuery(user, query) {
  const normalizedQuery = normalizeText(query).replace(/^@/, '');
  const normalizedName = normalizeText(user.name);
  const normalizedHandle = normalizeText(user.handle).replace(/^@/, '');
  return normalizedQuery.length > 2 && (normalizedName === normalizedQuery || normalizedHandle === normalizedQuery);
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function setupResizers() {
  const shell = $('#app');
  const resizerLeft = $('#resizer-left');
  const resizerRight = $('#resizer-right');

  const savedLeft = localStorage.getItem('aurasound:left-width');
  const savedRight = localStorage.getItem('aurasound:right-width');

  if (savedLeft && shell) shell.style.setProperty('--left-width', `${savedLeft}px`);
  if (savedRight && shell) shell.style.setProperty('--right-width', `${savedRight}px`);

  function bindResizer(resizer, side) {
    if (!resizer || !shell) return;
    let startX = 0;
    let startWidth = 0;

    const onPointerDown = (e) => {
      e.preventDefault();
      startX = e.clientX;
      const propName = side === 'left' ? '--left-width' : '--right-width';
      const currentWidthStr = getComputedStyle(shell).getPropertyValue(propName).trim();
      startWidth = parseInt(currentWidthStr, 10) || (side === 'left' ? 280 : 340);

      resizer.classList.add('resizing');
      document.body.classList.add('is-resizing');

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    };

    const onPointerMove = (e) => {
      const deltaX = e.clientX - startX;
      let newWidth = side === 'left' ? startWidth + deltaX : startWidth - deltaX;

      const minWidth = side === 'left' ? 180 : 220;
      const maxWidth = side === 'left' ? 480 : 540;
      newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

      shell.style.setProperty(side === 'left' ? '--left-width' : '--right-width', `${newWidth}px`);
    };

    const onPointerUp = () => {
      resizer.classList.remove('resizing');
      document.body.classList.remove('is-resizing');
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      const propName = side === 'left' ? '--left-width' : '--right-width';
      const finalWidth = parseInt(getComputedStyle(shell).getPropertyValue(propName), 10);
      if (finalWidth) localStorage.setItem(`aurasound:${side}-width`, String(finalWidth));
    };

    resizer.addEventListener('pointerdown', onPointerDown);
  }

  bindResizer(resizerLeft, 'left');
  bindResizer(resizerRight, 'right');
}
