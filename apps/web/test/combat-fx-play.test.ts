/**
 * The combat effects player (D-228) on a small fake page: what it adds to the layer, when, and what
 * it takes away. The look of the animations is judged in the browser (`e2e/combat-screens.e2e.ts`);
 * here: beats start staggered, a dying tile is kept as a ghost until its turn and then goes, the
 * numbers carry their signs, and `clear` leaves nothing behind.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Plan, PlannedBeat } from '../src/ui/board/combat-effects';
import { createPlayer } from '../src/ui/board/combat-fx-play';

class FakeEl {
  className = '';
  textContent = '';
  tabIndex = 0;
  style: Record<string, string> = {};
  children: FakeEl[] = [];
  attrs = new Map<string, string>();
  parent: FakeEl | null = null;
  animations = 0;
  constructor(
    readonly tag = 'div',
    private readonly rect = { left: 100, top: 100, width: 80, height: 110 },
  ) {}
  get classList() {
    return {
      add: (name: string) => {
        this.className = `${this.className} ${name}`.trim();
      },
      contains: (name: string) => this.className.split(' ').includes(name),
    };
  }
  appendChild(child: FakeEl) {
    child.parent = this;
    this.children.push(child);
    return child;
  }
  remove() {
    if (this.parent !== null) this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  replaceChildren() {
    for (const child of this.children) child.parent = null;
    this.children = [];
  }
  setAttribute(name: string, value: string) {
    this.attrs.set(name, value);
  }
  removeAttribute(name: string) {
    this.attrs.delete(name);
  }
  getBoundingClientRect() {
    return this.rect;
  }
  querySelector(selector: string): FakeEl | null {
    const name = selector.replace(/^\./, '');
    for (const child of this.children) {
      if (child.classList.contains(name)) return child;
      const deep = child.querySelector(selector);
      if (deep !== null) return deep;
    }
    return null;
  }
  querySelectorAll(): FakeEl[] {
    return this.children.flatMap((c) => [c, ...c.querySelectorAll()]);
  }
  cloneNode() {
    const copy = new FakeEl(this.tag, this.rect);
    copy.className = this.className;
    for (const [k, v] of this.attrs) copy.attrs.set(k, v);
    return copy;
  }
  animate(): { onfinish: (() => void) | null; oncancel: (() => void) | null } {
    this.animations += 1;
    const animation = {
      onfinish: null as (() => void) | null,
      oncancel: null as (() => void) | null,
    };
    pending.push(animation);
    return animation;
  }
}
Object.setPrototypeOf(FakeEl, class {});

const pending: { onfinish: (() => void) | null; oncancel: (() => void) | null }[] = [];
let tiles: Map<string, FakeEl>;
let lifeBoxes: Map<string, FakeEl>;

beforeEach(() => {
  pending.length = 0;
  tiles = new Map();
  lifeBoxes = new Map();
  vi.useFakeTimers();
  Object.assign(globalThis, {
    HTMLElement: FakeEl,
    window: { innerWidth: 1366 },
    CSS: undefined,
    document: {
      createElement: (tag: string) => new FakeEl(tag),
      createElementNS: (_ns: string, tag: string) => new FakeEl(tag),
      querySelector: (selector: string) => {
        const object = /data-object-id="([^"]+)"/.exec(selector)?.[1];
        if (object !== undefined) return tiles.get(object) ?? null;
        const seat = /data-seat="(\d+)"/.exec(selector)?.[1];
        return seat === undefined ? null : (lifeBoxes.get(seat) ?? null);
      },
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  for (const name of ['HTMLElement', 'window', 'CSS', 'document']) {
    Reflect.deleteProperty(globalThis, name);
  }
});

const timing = { start: 0, duration: 1800, impact: 500 };
const hit: PlannedBeat = {
  kind: 'hit',
  key: 'h0-o2',
  to: { kind: 'object', id: 'o2' },
  amount: 3,
  poison: false,
  loyalty: false,
  sources: ['o1'],
  ...timing,
};
const planOf = (...beats: PlannedBeat[]): Plan => ({ beats, totalMs: 4000 });
const texts = (layer: FakeEl) => layer.children.map((c) => c.textContent).filter((t) => t !== '');
const tile = (id: string, inner = true, top = 100) => {
  const el = new FakeEl('button', { left: 100, top, width: 80, height: 110 });
  el.className = 'board-tile';
  if (inner) el.appendChild(Object.assign(new FakeEl(), { className: 'board-tile-inner' }));
  tiles.set(id, el);
  return el;
};

describe('createPlayer', () => {
  test('a hit shows its number only when the blow lands, with a sign and for the right recipient', () => {
    tile('o1', true, 400);
    const victim = tile('o2');
    const layer = new FakeEl();
    const player = createPlayer(layer as unknown as HTMLElement);
    player.play(planOf(hit), 1);
    // The attacker's copy is on the way before anything lands; no number yet.
    expect(layer.children.some((c) => c.classList.contains('fx-sprite'))).toBe(true);
    expect(texts(layer)).toEqual([]);
    vi.advanceTimersByTime(499);
    expect(texts(layer)).toEqual([]);
    vi.advanceTimersByTime(2);
    expect(texts(layer)).toEqual(['−3']);
    // The blow shakes the tile that was hit and bursts rings and sparks.
    expect(victim.animations).toBeGreaterThan(0);
    expect(layer.children.some((c) => c.classList.contains('fx-ring'))).toBe(true);
    expect(layer.children.some((c) => c.classList.contains('fx-spark'))).toBe(true);
  });

  test('numbers read as poison, loyalty, life gained and life lost', () => {
    lifeBoxes.set('0', new FakeEl('button'));
    tile('o5');
    const layer = new FakeEl();
    const player = createPlayer(layer as unknown as HTMLElement);
    const after = { start: 0, duration: 1400, impact: 150 };
    player.play(
      planOf(
        { ...hit, to: { kind: 'player', seat: 0 }, poison: true, amount: 2, sources: [] },
        { ...hit, to: { kind: 'object', id: 'o5' }, loyalty: true, amount: 4, sources: [] },
        { kind: 'gain', key: 'g', seat: 0, amount: 3, ...after },
        { kind: 'loss', key: 'l', seat: 0, amount: 1, ...after },
      ),
      1,
    );
    vi.advanceTimersByTime(600);
    expect(texts(layer).sort()).toEqual(['+2 poison', '+3', '−1 life', '−4 loyalty'].sort());
  });

  test('a dying tile is kept as a ghost from the start and goes when its death has played', () => {
    const dying = tile('o2');
    const layer = new FakeEl();
    const player = createPlayer(layer as unknown as HTMLElement);
    player.play(
      planOf({
        kind: 'died',
        key: 'd0-o2',
        id: 'o2',
        name: 'Serra Angel',
        start: 700,
        duration: 2000,
        impact: 500,
      }),
      1,
    );
    const ghost = layer.children.find((c) => c.classList.contains('fx-ghost'));
    expect(ghost).toBeDefined();
    // The copy carries none of the tile's identity and takes no focus.
    expect(ghost?.attrs.has('data-object-id')).toBe(false);
    expect(ghost?.attrs.get('inert')).toBe('');
    expect(ghost?.tabIndex).toBe(-1);
    expect(dying.parent).toBeNull();
    const before = ghost?.animations ?? 0;
    vi.advanceTimersByTime(699);
    expect(ghost?.animations).toBe(before);
    vi.advanceTimersByTime(2);
    // Its turn: it cracks and dissolves, shards and a label join it, and it leaves when it ends.
    expect(ghost?.animations).toBeGreaterThan(before);
    expect(layer.children.some((c) => c.classList.contains('fx-shard'))).toBe(true);
    expect(texts(layer)).toContain('Dies');
    for (const animation of [...pending]) animation.onfinish?.();
    expect(layer.children).toHaveLength(0);
  });

  test('beats start at their own times, and clear leaves nothing on the page or waiting', () => {
    tile('o1');
    tile('o2');
    tile('o3');
    const layer = new FakeEl();
    const player = createPlayer(layer as unknown as HTMLElement);
    player.play(
      planOf(hit, {
        ...hit,
        key: 'h0-o3',
        to: { kind: 'object', id: 'o3' },
        amount: 5,
        start: 450,
      }),
      1,
    );
    vi.advanceTimersByTime(520);
    expect(texts(layer)).toEqual(['−3']);
    vi.advanceTimersByTime(430);
    expect(texts(layer)).toEqual(['−3', '−5']);
    player.clear();
    expect(layer.children).toHaveLength(0);
    // Nothing is still waiting: a late timer adds nothing.
    player.play(planOf({ ...hit, start: 3000 }), 1);
    player.clear();
    vi.advanceTimersByTime(5000);
    expect(layer.children).toHaveLength(0);
  });

  test('a recipient that is no longer on the page still gets its number, where it was', () => {
    const victim = tile('o2');
    const layer = new FakeEl();
    const player = createPlayer(layer as unknown as HTMLElement);
    player.play(planOf({ ...hit, sources: [], impact: 200 }), 1);
    tiles.delete('o2');
    victim.remove();
    vi.advanceTimersByTime(250);
    expect(texts(layer)).toEqual(['−3']);
  });
});
