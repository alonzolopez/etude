export function comboOf(e: KeyboardEvent): string {
  const k = e.key === ' ' ? 'space' : e.key.toLowerCase();
  return e.shiftKey && k.startsWith('arrow') ? `shift+${k}` : k;
}

function inTextInput(): boolean {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}

export class Hotkeys {
  private map = new Map<string, (e: KeyboardEvent) => void>();
  private listener = (e: KeyboardEvent) => this.handle(e);

  bind(combo: string, fn: (e: KeyboardEvent) => void): void { this.map.set(combo, fn); }
  clear(): void { this.map.clear(); }
  attach(): void { window.addEventListener('keydown', this.listener); }
  detach(): void { window.removeEventListener('keydown', this.listener); }

  handle(e: KeyboardEvent): void {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const combo = comboOf(e);
    if (inTextInput()) {
      if (combo === 'escape') {
        (document.activeElement as HTMLElement).blur();
        e.preventDefault();
        return;
      }
      if (combo !== 'enter') return; // spec §4.2: literal typing wins
    }
    const fn = this.map.get(combo);
    if (fn) {
      e.preventDefault();
      fn(e);
    }
  }
}
