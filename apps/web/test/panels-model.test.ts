import type { ObjectView } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import type { LogEntry } from '../src/game/protocol';
import {
  arrowBetween,
  center,
  clipBox,
  edgePoint,
  facingEdge,
  loopArrow,
} from '../src/ui/panels/arrows';
import {
  filterLog,
  groupByTurn,
  nameLinker,
  previewTarget,
  turnHeading,
} from '../src/ui/panels/log-model';
import { applyTheme, currentTheme, readStoredTheme } from '../src/ui/panels/theme';

const box = (left: number, top: number, w: number, h: number) => ({
  left,
  top,
  right: left + w,
  bottom: top + h,
});

describe('arrow geometry', () => {
  test('facingEdge reduces a box to the edge that faces a target wholly on one side', () => {
    const item = box(1000, 400, 280, 60);
    // A target far up and to the left: the arrow leaves the middle of the left edge.
    const left = facingEdge(item, box(100, 50, 120, 60));
    expect(left).toEqual({ left: 1000, right: 1000, top: 400, bottom: 460 });
    const arrow = arrowBetween(left, box(100, 50, 120, 60));
    expect(arrow?.from).toEqual({ x: 1000, y: 430 });
    expect(facingEdge(item, box(1400, 50, 120, 60))).toEqual({
      left: 1280,
      right: 1280,
      top: 400,
      bottom: 460,
    });
    // A target above, overlapping in x: unchanged.
    expect(facingEdge(item, box(1100, 50, 120, 60))).toBe(item);
  });

  test('clipBox keeps what shows and pulls a box scrolled out of sight to the list edge', () => {
    const list = box(1000, 100, 280, 150);
    // Inside: unchanged.
    expect(clipBox(box(1000, 120, 280, 40), list)).toEqual(box(1000, 120, 280, 40));
    // Half below the edge: only the visible half.
    expect(clipBox(box(1000, 230, 280, 40), list)).toEqual(box(1000, 230, 280, 20));
    // Below the list: a 2px strip on its bottom edge, never far off screen.
    expect(clipBox(box(1000, 700, 280, 40), list)).toEqual(box(1000, 248, 280, 2));
    // Above the list: a 2px strip on its top edge.
    expect(clipBox(box(1000, -300, 280, 40), list)).toEqual(box(1000, 100, 280, 2));
  });

  test('edgePoint leaves the box on the side facing the target', () => {
    const b = box(0, 0, 100, 40);
    expect(edgePoint(b, { x: 300, y: 20 })).toEqual({ x: 100, y: 20 });
    expect(edgePoint(b, { x: -50, y: 20 })).toEqual({ x: 0, y: 20 });
    expect(edgePoint(b, { x: 50, y: 500 })).toEqual({ x: 50, y: 40 });
    // Diagonal: the ray hits the nearer wall first.
    expect(edgePoint(b, { x: 250, y: 220 })).toEqual({ x: 70, y: 40 });
  });

  test('edgePoint grows the box by the padding', () => {
    expect(edgePoint(box(0, 0, 100, 40), { x: 300, y: 20 }, 3)).toEqual({ x: 103, y: 20 });
  });

  test('an arrow runs from the source edge to just outside the target edge', () => {
    const arrow = arrowBetween(box(0, 0, 100, 40), box(400, 0, 100, 40), { gap: 3 });
    expect(arrow).not.toBeNull();
    if (arrow === null) return;
    expect(arrow.from).toEqual({ x: 100, y: 20 });
    expect(arrow.to).toEqual({ x: 397, y: 20 });
    expect(arrow.head[0]).toEqual(arrow.to);
    expect(arrow.path.startsWith('M100 20 Q')).toBe(true);
    expect(arrow.headPoints.split(' ')).toHaveLength(3);
  });

  test('the head is a triangle pointing along the shaft', () => {
    const arrow = arrowBetween(box(0, 0, 40, 40), box(300, 0, 40, 40), {
      bend: 0,
      headSize: 10,
    });
    if (arrow === null) throw new Error('expected an arrow');
    const [tip, a, b] = arrow.head;
    // With no bend the shaft is horizontal, so the wings sit 10 px behind the tip, 5 px apart each.
    expect(a.x).toBeCloseTo(tip.x - 10);
    expect(b.x).toBeCloseTo(tip.x - 10);
    expect(Math.abs(a.y - b.y)).toBeCloseTo(10);
    expect(center(box(0, 0, 40, 40))).toEqual({ x: 20, y: 20 });
  });

  test('the sign of bend picks the side the shaft bows to', () => {
    const from = box(0, 0, 40, 40);
    const to = box(300, 0, 40, 40);
    const up = arrowBetween(from, to, { bend: 0.2 });
    const down = arrowBetween(from, to, { bend: -0.2 });
    if (up === null || down === null) throw new Error('expected arrows');
    expect(up.control.y).toBeGreaterThan(20);
    expect(down.control.y).toBeLessThan(20);
  });

  test('nothing is drawn for nested, touching or overlapping boxes', () => {
    expect(arrowBetween(box(0, 0, 100, 100), box(20, 20, 10, 10))).toBeNull();
    expect(arrowBetween(box(20, 20, 10, 10), box(0, 0, 100, 100))).toBeNull();
    expect(arrowBetween(box(0, 0, 100, 40), box(101, 0, 100, 40))).toBeNull();
  });
});

describe('loop arrows', () => {
  test('two stacked items get a loop out of the left edges that ends pointing right', () => {
    const upper = box(1000, 40, 260, 50);
    const lower = box(1000, 94, 260, 50);
    expect(arrowBetween(upper, lower)).toBeNull();
    const loop = loopArrow(upper, lower);
    if (loop === null) throw new Error('expected a loop');
    expect(loop.from).toEqual({ x: 1000, y: 65 });
    expect(loop.to).toEqual({ x: 997, y: 119 });
    expect(loop.control.x).toBeLessThan(1000);
    const [tip, a, b] = loop.head;
    expect(tip).toEqual(loop.to);
    expect(a.x).toBeLessThan(tip.x);
    expect(b.x).toBeLessThan(tip.x);
  });

  test('no loop for nested boxes', () => {
    expect(loopArrow(box(0, 0, 100, 100), box(20, 20, 10, 10))).toBeNull();
  });
});

const entry = (
  id: number,
  turn: number,
  level: 'major' | 'detail',
  objects: LogEntry['objects'] = [],
): LogEntry => ({
  id,
  turn,
  seat: null,
  level,
  text: `entry ${id}`,
  objects,
  rule: null,
});

describe('log model', () => {
  const log = [
    entry(1, 0, 'major'),
    entry(2, 1, 'detail'),
    entry(3, 1, 'major'),
    entry(4, 2, 'major'),
    entry(5, 2, 'detail'),
  ];

  test('major only drops detail entries; all keeps everything', () => {
    expect(filterLog(log, { detail: false }).map((e) => e.id)).toEqual([1, 3, 4]);
    expect(filterLog(log, { detail: true })).toHaveLength(5);
  });

  test('entries are grouped by consecutive turn, in order', () => {
    const groups = groupByTurn(filterLog(log, { detail: true }));
    expect(groups.map((g) => [g.turn, g.entries.map((e) => e.id)])).toEqual([
      [0, [1]],
      [1, [2, 3]],
      [2, [4, 5]],
    ]);
    expect(groupByTurn([])).toEqual([]);
  });

  test('a group disappears when its only entries are filtered out', () => {
    const groups = groupByTurn(filterLog([entry(1, 3, 'detail')], { detail: false }));
    expect(groups).toEqual([]);
  });

  test('turn headings', () => {
    expect(turnHeading(0)).toBe('Setup');
    expect(turnHeading(4)).toBe('Turn 4');
  });

  test('the preview target is the first mentioned object that still exists', () => {
    const e = entry(1, 1, 'major', ['o1', 'o2', 'o3']);
    expect(previewTarget(e, new Set(['o3', 'o2']))).toBe('o2');
    expect(previewTarget(e, new Set())).toBeNull();
    expect(previewTarget(entry(2, 1, 'major'), new Set(['o1']))).toBeNull();
  });
});

describe('card names in the log (issue 34)', () => {
  const named = (id: string, name: string) => ({ id, name }) as unknown as ObjectView;
  const index = (...list: ObjectView[]) => new Map(list.map((o) => [o.id, o]));

  test('each name of an object in view becomes its own piece, the rest stays text', () => {
    const link = nameLinker(index(named('o1', 'Lightning Bolt'), named('o2', 'Serra Angel')));
    expect(link('You cast Lightning Bolt targeting Serra Angel.', [])).toEqual([
      { kind: 'text', text: 'You cast ' },
      { kind: 'name', text: 'Lightning Bolt', id: 'o1' },
      { kind: 'text', text: ' targeting ' },
      { kind: 'name', text: 'Serra Angel', id: 'o2' },
      { kind: 'text', text: '.' },
    ]);
  });

  test('the longest name wins and a name must stand whole', () => {
    const link = nameLinker(index(named('o1', 'Zombie'), named('o2', 'Zombie Token')));
    expect(link('Zombie Token dies', [])).toEqual([
      { kind: 'name', text: 'Zombie Token', id: 'o2' },
      { kind: 'text', text: ' dies' },
    ]);
    expect(link('Zombies attack', [])).toEqual([{ kind: 'text', text: 'Zombies attack' }]);
  });

  test('the object the entry mentions is preferred over another with the same name', () => {
    const link = nameLinker(index(named('o10', 'Zombie'), named('o11', 'Zombie')));
    expect(link('Zombie dies', ['o11'])).toEqual([
      { kind: 'name', text: 'Zombie', id: 'o11' },
      { kind: 'text', text: ' dies' },
    ]);
  });

  test('a card that left the battlefield links to its new object by name; punctuation in names is safe', () => {
    const link = nameLinker(index(named('g1', 'Ghoulcaller Gisa'), named('g2', 'Zul Ashur (X)')));
    expect(link('Ghoulcaller Gisa dies. Zul Ashur (X) enters.', ['o99'])).toEqual([
      { kind: 'name', text: 'Ghoulcaller Gisa', id: 'g1' },
      { kind: 'text', text: ' dies. ' },
      { kind: 'name', text: 'Zul Ashur (X)', id: 'g2' },
      { kind: 'text', text: ' enters.' },
    ]);
  });

  test('with nothing in view the line is plain text', () => {
    expect(nameLinker(new Map())('You pass.', [])).toEqual([{ kind: 'text', text: 'You pass.' }]);
  });
});

describe('theme without a browser', () => {
  test('reading the stored theme fails soft when storage is unavailable', () => {
    expect(readStoredTheme()).toBeNull();
  });

  test('applying a theme sets the attribute and survives blocked storage', () => {
    const root = { dataset: {} as Record<string, string> };
    const doc = globalThis as { document?: unknown };
    const before = doc.document;
    doc.document = { documentElement: root };
    try {
      applyTheme('light', true);
      expect(root.dataset.theme).toBe('light');
      expect(currentTheme()).toBe('light');
      applyTheme('dark', false);
      expect(currentTheme()).toBe('dark');
    } finally {
      doc.document = before;
    }
  });
});
