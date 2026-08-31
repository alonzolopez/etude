export class SessionTimer {
  private startedAt: number | null = null;
  private zeroFired = false;

  constructor(
    private durationMinutes: number,
    private now: () => number = Date.now,
  ) {}

  start(): void { this.startedAt = this.now(); }

  get remainingMs(): number {
    if (this.startedAt === null) return this.durationMinutes * 60_000;
    return this.durationMinutes * 60_000 - (this.now() - this.startedAt);
  }

  get isOvertime(): boolean { return this.remainingMs < 0; }

  crossedZero(): boolean {
    if (!this.zeroFired && this.isOvertime) {
      this.zeroFired = true;
      return true;
    }
    return false;
  }

  formatted(): string {
    const ms = Math.abs(this.remainingMs);
    const totalSec = Math.floor(ms / 1000);
    const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const ss = String(totalSec % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }
}
