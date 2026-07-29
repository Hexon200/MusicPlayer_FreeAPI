export class PlayerEngine {
  constructor(onStateChange) {
    this.playlist = [];
    this.currentIndex = -1;
    this.isPlaying = false;
    this.currentTime = 0;
    this.duration = 0;
    this.volume = 0.8;
    this.isShuffle = false;
    this.isRepeat = false;
    this.lastError = '';
    this.onStateChange = onStateChange;

    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';
    this.audio.volume = this.volume;

    this.initListeners();
  }

  initListeners() {
    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this.lastError = '';
      this.notify();
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this.notify();
    });

    this.audio.addEventListener('timeupdate', () => {
      this.currentTime = this.audio.currentTime || 0;
      this.duration = this.audio.duration || this.currentTrack()?.duration || 0;
      this.notify();
    });

    this.audio.addEventListener('ended', () => {
      this.isPlaying = false;
      if (this.isRepeat) {
        this.audio.currentTime = 0;
        this.audio.play();
      } else {
        this.next();
      }
    });

    this.audio.addEventListener('error', (err) => {
      console.warn('Audio stream error:', err);
      this.isPlaying = false;
      this.lastError = 'Stream unavailable. Trying next track...';
      this.notify();
      setTimeout(() => this.next(), 1000);
    });
  }

  setPlaylist(tracks, startIndex = 0, shouldPlay = false) {
    this.playlist = Array.isArray(tracks) ? tracks : [];
    if (!this.playlist.length) {
      this.currentIndex = -1;
      this.currentTime = 0;
      this.duration = 0;
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.notify();
      return;
    }

    this.currentIndex = Math.min(Math.max(startIndex, 0), this.playlist.length - 1);
    this.selectCurrent(shouldPlay);
  }

  selectCurrent(shouldPlay = false) {
    const track = this.currentTrack();
    if (!track) return;

    this.currentTime = 0;
    this.duration = Number(track.duration || 0);
    this.lastError = '';

    if (track.streamUrl) {
      if (this.audio.src !== track.streamUrl) {
        this.audio.src = track.streamUrl;
        this.audio.currentTime = 0;
      }
      if (shouldPlay) {
        this.play();
      } else {
        this.notify();
      }
    } else {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.notify();
    }
  }

  playTrack(index, shouldPlay = true) {
    if (!this.playlist.length) return;
    this.currentIndex = (index + this.playlist.length) % this.playlist.length;
    this.selectCurrent(shouldPlay);
  }

  play() {
    const track = this.currentTrack();
    if (track?.streamUrl) {
      this.audio.play().catch((err) => {
        console.warn('Playback blocked or stream error:', err);
        this.isPlaying = false;
        this.lastError = 'Click play to start stream.';
        this.notify();
      });
    }
  }

  pause() {
    this.audio.pause();
    this.isPlaying = false;
    this.notify();
  }

  togglePlay() {
    if (!this.currentTrack() && this.playlist.length) {
      this.playTrack(0, true);
      return;
    }
    if (this.audio.paused) {
      this.play();
    } else {
      this.pause();
    }
  }

  next() {
    if (!this.playlist.length) return;
    const nextIndex = this.isShuffle
      ? Math.floor(Math.random() * this.playlist.length)
      : (this.currentIndex + 1) % this.playlist.length;
    this.playTrack(nextIndex, true);
  }

  prev() {
    if (!this.playlist.length) return;
    const prevIndex = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
    this.playTrack(prevIndex, true);
  }

  seek(seconds) {
    if (this.audio.duration) {
      this.audio.currentTime = seconds;
      this.currentTime = seconds;
      this.notify();
    }
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    this.audio.volume = this.volume;
    this.notify();
  }

  toggleShuffle() {
    this.isShuffle = !this.isShuffle;
    this.notify();
  }

  toggleRepeat() {
    this.isRepeat = !this.isRepeat;
    this.notify();
  }

  currentTrack() {
    return this.playlist[this.currentIndex] || null;
  }

  getState() {
    return {
      currentTrack: this.currentTrack(),
      isPlaying: this.isPlaying,
      currentTime: this.currentTime,
      duration: this.duration || this.currentTrack()?.duration || 0,
      volume: this.volume,
      isShuffle: this.isShuffle,
      isRepeat: this.isRepeat,
      lastError: this.lastError,
      currentIndex: this.currentIndex,
      playlistLength: this.playlist.length
    };
  }

  notify() {
    this.onStateChange?.(this.getState());
  }
}
