import { describe, it, expect } from 'vitest';

describe('toolchain', () => {
  it('runs tests in jsdom', () => {
    document.body.innerHTML = '<p>hi</p>';
    expect(document.querySelector('p')?.textContent).toBe('hi');
  });
});
