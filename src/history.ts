import type { ExerciseInstance } from './exercises';

export class InstanceHistory {
  private stack: ExerciseInstance[] = [];
  private cursor = -1;

  get index(): number { return this.cursor; }
  get length(): number { return this.stack.length; }
  get current(): ExerciseInstance | null { return this.stack[this.cursor] ?? null; }
  get canGoBack(): boolean { return this.cursor > 0; }
  get canGoForward(): boolean { return this.cursor < this.stack.length - 1; }

  push(inst: ExerciseInstance): void {
    this.stack = this.stack.slice(0, this.cursor + 1);
    this.stack.push(inst);
    this.cursor = this.stack.length - 1;
  }

  goTo(i: number): ExerciseInstance | null {
    if (this.stack.length === 0) return null;
    this.cursor = Math.max(0, Math.min(this.stack.length - 1, i));
    return this.current;
  }

  updateCurrentBpm(bpm: number): void {
    const cur = this.stack[this.cursor];
    if (cur) cur.bpm = bpm;
  }
}
