export class BeatScheduler {
  bpm = 100;
  horizon = 0.1;
  private isRunning = false;
  // ctx.currentTime + 0.05 captured at start(); used only for the first
  // beat of a run, before anything has actually been scheduled.
  private startAnchor: number | null = null;
  // Time of the last beat actually scheduled since start(); null until the
  // first beat of this run has been scheduled.
  private lastScheduled: number | null = null;

  constructor(
    private ctx: { currentTime: number },
    private onSchedule: (t: number) => void,
  ) {}

  get running(): boolean {
    return this.isRunning;
  }

  start(): void {
    this.isRunning = true;
    this.startAnchor = this.ctx.currentTime + 0.05;
    this.lastScheduled = null;
  }

  stop(): void {
    this.isRunning = false;
    this.startAnchor = null;
    this.lastScheduled = null;
  }

  tick(): void {
    if (!this.isRunning) return;
    // Recompute the next candidate from the last *scheduled* beat (or the
    // start anchor, before any beat has been scheduled) using the CURRENT
    // bpm on every pass, rather than pre-advancing a stored "next beat"
    // value at schedule time. This is what makes a bpm change between
    // ticks retime the still-pending beat instead of only affecting beats
    // scheduled after the change.
    let candidate = this.lastScheduled === null ? this.startAnchor! : this.lastScheduled + 60 / this.bpm;
    while (candidate < this.ctx.currentTime + this.horizon) {
      this.onSchedule(candidate);
      this.lastScheduled = candidate;
      candidate = this.lastScheduled + 60 / this.bpm;
    }
  }
}

export class Metronome {
  onBeat?: (audioTime: number) => void;
  private scheduler: BeatScheduler;
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private ctx: AudioContext,
    private click: AudioBuffer,
    private out: GainNode,
  ) {
    this.scheduler = new BeatScheduler(ctx, (t) => this.playClick(t));
    document.addEventListener('visibilitychange', () => {
      this.scheduler.horizon = document.hidden ? 1.5 : 0.1; // spec §11.8
    });
  }

  private playClick(t: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.click;
    src.connect(this.out);
    src.start(t);
    this.onBeat?.(t);
  }

  get bpm(): number { return this.scheduler.bpm; }
  setBpm(v: number): void {
    // NaN/Infinity (e.g. a corrupt etude.bpm) would poison every beat
    // computation and silently stop the scheduler: ignore it, keep the bpm.
    if (!Number.isFinite(v)) return;
    this.scheduler.bpm = Math.max(20, Math.min(400, Math.round(v)));
  }
  get running(): boolean { return this.scheduler.running; }

  start(): void {
    if (this.running) return;
    this.scheduler.start();
    this.interval = setInterval(() => this.scheduler.tick(), 25);
  }

  stop(): void {
    this.scheduler.stop();
    if (this.interval !== null) clearInterval(this.interval);
    this.interval = null;
  }

  toggle(): void { this.running ? this.stop() : this.start(); }
}

export function createChime(ctx: AudioContext, out: GainNode): () => void {
  return () => {
    // two soft tones (spec §6): E5 then A5
    for (const [freq, at] of [[659.25, 0], [880, 0.18]] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      const t0 = ctx.currentTime + at;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.4, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
      osc.connect(gain).connect(out);
      osc.start(t0);
      osc.stop(t0 + 0.55);
    }
  };
}
