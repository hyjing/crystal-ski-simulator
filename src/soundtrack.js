const tracks = [
  { file: 'first-chair-jazz.mp3', title: 'First Chair' },
  { file: 'bluebird-jazz.mp3', title: 'Bluebird' },
  { file: 'tree-line-jazz.mp3', title: 'Tree Line' },
  { file: 'last-light-jazz.mp3', title: 'Last Light' },
  { file: 'whitepeak-jazz.mp3', title: 'Whitepeak' },
  { file: 'pine-drift-jazz.mp3', title: 'Pine Drift' },
  { file: 'ridge-cafe-jazz.mp3', title: 'Ridge Café' },
];

export class ShuffleTracks {
  constructor(random=Math.random){
    this.random=random;
    this.remaining=[];
    this.last=null;
  }

  next(){
    if(!this.remaining.length){
      this.remaining=tracks.slice();
      for(let i=this.remaining.length-1;i>0;i--){
        const j=Math.floor(this.random()*(i+1));
        [this.remaining[i],this.remaining[j]]=[this.remaining[j],this.remaining[i]];
      }
      if(this.remaining.at(-1)===this.last){
        const last=this.remaining.length-1;
        [this.remaining[0],this.remaining[last]]=[this.remaining[last],this.remaining[0]];
      }
    }
    this.last=this.remaining.pop();
    return this.last;
  }
}

export class Soundtrack {
  constructor(player, button, baseUrl, showError) {
    this.player = player;
    this.button = button;
    this.baseUrl = baseUrl;
    this.showError = showError;
    this.request = 0;
    this.playlist=new ShuffleTracks();
    player.addEventListener('ended',()=>this.next());
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

  next(){this.select(this.playlist.next());}

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
