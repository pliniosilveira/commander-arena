/**
 * The Side panel setting (issues 43a and 47): the column with the stack and the controls
 * is on the right unless the player puts it on the left; the choice is remembered like the text size.
 */
import { afterEach, describe, expect, test } from 'vitest';
import { currentSidePanel, readStoredSidePanel, setSidePanel } from '../src/ui/panels/side-panel';

type Storage = { getItem(k: string): string | null; setItem(k: string, v: string): void };

function fakeWindow(store: Map<string, string> | null) {
  const localStorage: Storage =
    store === null
      ? {
          getItem() {
            throw new Error('blocked');
          },
          setItem() {
            throw new Error('blocked');
          },
        }
      : { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) };
  Object.assign(globalThis, { window: { localStorage } });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
  setSidePanel('right', false);
});

describe('the side panel setting', () => {
  test('right is the default', () => {
    expect(currentSidePanel()).toBe('right');
  });

  test('the choice is remembered and read back', () => {
    const store = new Map<string, string>();
    fakeWindow(store);
    expect(readStoredSidePanel()).toBeNull();
    setSidePanel('left', true);
    expect(currentSidePanel()).toBe('left');
    expect(store.get('commander-arena.side-panel')).toBe('left');
    expect(readStoredSidePanel()).toBe('left');
  });

  test('a choice that is not remembered still applies, and unreadable storage is no error', () => {
    fakeWindow(null);
    expect(readStoredSidePanel()).toBeNull();
    expect(() => setSidePanel('left', true)).not.toThrow();
    expect(currentSidePanel()).toBe('left');
  });

  test('garbage in storage is ignored', () => {
    fakeWindow(new Map([['commander-arena.side-panel', 'top']]));
    expect(readStoredSidePanel()).toBeNull();
  });
});
