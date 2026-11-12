const tracks = [
  { file: 'first-chair-jazz.mp3', title: 'First Chair' },
  { file: 'bluebird-jazz.mp3', title: 'Bluebird' },
  { file: 'tree-line-jazz.mp3', title: 'Tree Line' },
  { file: 'last-light-jazz.mp3', title: 'Last Light' },
];

function hash(text) {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.codePointAt(0), 16777619);
  return value >>> 0;
}

// Randomize the order within each resort, then deal tracks evenly across its trails.
export function assignTrailMusic(resort, routeIds) {
  const shuffled = routeIds.map(id => ({ id, rank: hash(`trail:${resort}:${id}`) }))
    .sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
  const playlist = tracks.map(track => ({ track, rank: hash(`music:${resort}:${track.file}`) }))
    .sort((a, b) => a.rank - b.rank);
  return new Map(shuffled.map(({ id }, i) => [id, playlist[i % playlist.length].track]));
}

export class Soundtrack {
  constructor(player, button, baseUrl, showError) {
    this.player = player;
    this.button = button;
    this.baseUrl = baseUrl;
    this.showError = showError;
    this.request = 0;
    this.hidden = document.hidden;
    this.enabled = false;
    try { this.enabled = sessionStorage.getItem('ski-music') === 'on'; } catch {}
    this.volume = .65;
    player.volume = this.volume;
    button.addEventListener('click', () => {
      this.enabled = !this.enabled || this.blocked;
      this.blocked = false;
      this.save();
      this.refresh();
    });
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.hidden;
      this.refresh();
    });
  }

  select(track) {
    if (this.track === track) return;
    this.track = track;
    this.button.disabled = !track;
    this.refresh();
  }

  mix(duck, dt) {
    const target = .65 * (1 - Math.max(0, Math.min(1, duck)) * .55);
    this.volume += (target - this.volume) * (1 - Math.exp(-dt * 3));
    this.player.volume = this.volume;
  }

  save() {
    try { sessionStorage.setItem('ski-music', this.enabled ? 'on' : 'off'); } catch {}
  }

  updateButton() {
    const on = this.enabled && !this.blocked;
    this.button.textContent = this.blocked ? '继续音乐' : on ? '音乐开' : '音乐关';
    this.button.setAttribute('aria-pressed', String(on));
    this.button.title = this.track ? `背景音乐 · ${this.track.title}` : '背景音乐';
  }

  async refresh() {
    const request = ++this.request;
    this.updateButton();
    if (!this.enabled || this.hidden || !this.track) {
      this.player.pause();
      return;
    }

    const src = `${this.baseUrl}assets/music/${this.track.file}`;
    if (this.player.getAttribute('src') !== src) this.player.src = src;
    try {
      await this.player.play();
      if (request !== this.request) return;
      this.blocked = false;
    } catch (error) {
      if (request !== this.request) return;
      if (error.name === 'NotAllowedError') {
        this.blocked = true;
      } else {
        this.enabled = false;
        this.save();
        this.showError('背景音乐暂时无法播放');
      }
    }
    this.updateButton();
  }
}
