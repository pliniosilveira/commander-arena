// The land row as a table lays it out (D-215): groups, columns, order and sizes. Pure functions.
import type { ObjectView } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { landSpec } from '../src/ui/board/LandRow';
import { clusterWidth, groupLands, landKey, landRank, layoutLands } from '../src/ui/board/lands';

let next = 0;
function land(name: string, over: Partial<ObjectView> = {}): ObjectView {
  next += 1;
  const basic = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes'].includes(
    name.replace(/^Snow-Covered /, ''),
  );
  return {
    id: `o${next}`,
    owner: 0,
    controller: 0,
    zone: 'battlefield',
    name,
    manaCost: null,
    supertypes: basic ? ['basic'] : [],
    types: ['land'],
    subtypes: [],
    colors: [],
    power: null,
    toughness: null,
    oracleText: '',
    tapped: false,
    damage: 0,
    counters: {},
    isCommander: false,
    summoningSick: false,
    isToken: false,
    keywords: [],
    protector: null,
    support: 'supported',
    targets: [],
    ...over,
  };
}

const many = (name: string, n: number, over: Partial<ObjectView> = {}) =>
  Array.from({ length: n }, () => land(name, over));
const names = (columns: ReturnType<typeof groupLands>) =>
  columns.map((c) => `${c.objects[0]?.name}x${c.objects.length}`);

describe('which lands stack', () => {
  test('equal basic lands share a column and the columns are in the order of the colors', () => {
    // The order the owner saw: plains, mountain, plains, forest, mountain.
    const row = [
      land('Plains'),
      land('Mountain'),
      land('Plains'),
      land('Forest'),
      land('Mountain'),
    ];
    expect(names(groupLands(row))).toEqual(['Plainsx2', 'Mountainx2', 'Forestx1']);
  });

  test('the basic lands go in the order of the color wheel, Wastes last, snow after the plain ones', () => {
    const row = [
      land('Forest'),
      land('Wastes'),
      land('Snow-Covered Island'),
      land('Island'),
      land('Swamp'),
      land('Plains'),
      land('Mountain'),
    ];
    expect(groupLands(row).map((c) => c.objects[0]?.name)).toEqual([
      'Plains',
      'Island',
      'Snow-Covered Island',
      'Swamp',
      'Mountain',
      'Forest',
      'Wastes',
    ]);
  });

  test('nonbasic lands follow the basic ones, ordered by name, one tile each', () => {
    const row = [
      land('Sunken Ruins'),
      land('Command Tower'),
      land('Forest'),
      land('Command Tower'),
      land('Arid Mesa'),
    ];
    const columns = groupLands(row);
    // Nonbasic lands never overlap: each is a tile of its own.
    expect(names(columns)).toEqual([
      'Forestx1',
      'Arid Mesax1',
      'Command Towerx1',
      'Command Towerx1',
      'Sunken Ruinsx1',
    ]);
  });

  test('a token land never stacks with a land card of the same name', () => {
    const row = [land('Forest'), land('Forest', { isToken: true })];
    const columns = groupLands(row);
    expect(columns).toHaveLength(2);
    expect(columns.map((c) => c.objects[0]?.isToken)).toEqual([false, true]);
  });

  test('lands with different counters or a different choice or a control effect stay apart', () => {
    expect(landKey(land('Forest'))).not.toBe(landKey(land('Forest', { counters: { charge: 1 } })));
    expect(landKey(land('Forest'))).not.toBe(landKey(land('Forest', { controlEnds: 'never' })));
    expect(landKey(land('Forest'))).toBe(landKey(land('Forest', { tapped: true })));
  });

  test('a land with an Aura stands alone', () => {
    const aura = land('Forest');
    const row = [land('Forest'), aura, land('Forest')];
    const columns = groupLands(row, (o) => o.id === aura.id);
    expect(columns.map((c) => c.objects.length).sort()).toEqual([1, 2]);
  });

  test('basic lands rank by color; every nonbasic ranks after them', () => {
    expect(landRank(land('Plains'))).toBeLessThan(landRank(land('Island')));
    expect(landRank(land('Wastes'))).toBeLessThan(landRank(land('Command Tower')));
    expect(landRank(land('Snow-Covered Forest'))).toBe(landRank(land('Forest')));
  });
});

describe('the clusters', () => {
  test('all equal basic lands make one cluster, however many', () => {
    expect(groupLands(many('Forest', 11)).map((c) => c.objects.length)).toEqual([11]);
  });

  test('inside a cluster the cards are in the order they entered, whatever the order given', () => {
    const [a, b, c] = many('Swamp', 3);
    if (a === undefined || b === undefined || c === undefined) throw new Error('lands');
    expect(groupLands([c, a, b])[0]?.objects.map((o) => o.id)).toEqual([a.id, b.id, c.id]);
  });

  test('tapping a land never moves it', () => {
    const lands = many('Forest', 7);
    const tapped = lands.map((o, i) => (i % 2 === 0 ? { ...o, tapped: true } : o));
    expect(groupLands(tapped).map((c) => c.objects.map((o) => o.id))).toEqual(
      groupLands(lands).map((c) => c.objects.map((o) => o.id)),
    );
  });

  test('an empty row has no clusters, and the same lands always give the same clusters', () => {
    expect(groupLands([])).toEqual([]);
    const row = [land('Forest'), land('Plains'), land('Forest'), land('Command Tower')];
    expect(groupLands(row)).toEqual(groupLands([...row].reverse()));
  });
});

describe('the size of the row', () => {
  const spec = landSpec(1);

  test('a roomy row takes the full tile and a generous overlap', () => {
    const columns = groupLands([...many('Forest', 5), ...many('Plains', 5)]);
    const layout = layoutLands(columns, 900, 100, spec);
    expect(layout.tile).toBe(88);
    expect(layout.step).toBeGreaterThanOrEqual(spec.minStep);
    expect(layout.step).toBeLessThan(layout.width);
    expect(layout.overflow).toBe(false);
  });

  test('a tight row tightens the overlap before it shrinks the tiles', () => {
    const columns = groupLands([...many('Forest', 8), ...many('Plains', 8)]);
    const roomy = layoutLands(columns, 2000, 100, spec);
    const tight = layoutLands(columns, 560, 100, spec);
    expect(tight.tile).toBe(88);
    expect(tight.step).toBeLessThan(roomy.step);
    expect(tight.step).toBeGreaterThanOrEqual(spec.minStep);
    const total = columns.reduce(
      (n, c) => n + clusterWidth(c.objects.length, tight.width, tight.step),
      spec.gap,
    );
    expect(total).toBeLessThanOrEqual(560 + 0.5 + spec.gap);
  });

  test('the tile is no taller than the row, but never below the smallest', () => {
    expect(layoutLands(groupLands(many('Forest', 3)), 900, 60, spec).tile).toBe(60);
    expect(layoutLands(groupLands(many('Forest', 3)), 900, 20, spec).tile).toBe(spec.minTile);
  });

  test('a lot of different lands keep their tile size and scroll when the row is full', () => {
    const lands = Array.from({ length: 14 }, (_, i) =>
      land(`Nonbasic ${String(i).padStart(2, '0')}`),
    );
    const roomy = layoutLands(groupLands(lands), 2000, 80, spec);
    expect(roomy.overflow).toBe(false);
    const scroll = layoutLands(groupLands(lands), 300, 80, spec);
    expect(scroll.tile).toBe(roomy.tile);
    expect(scroll.overflow).toBe(true);
  });

  test('before the row is measured the tiles are drawn at full size with no width limit', () => {
    const layout = layoutLands(groupLands(many('Forest', 2)), null, 100, spec);
    expect(layout.overflow).toBe(false);
    expect(layout.tile).toBeGreaterThan(40);
  });

  test('the text size scales the tile', () => {
    expect(landSpec(1.25).maxTile).toBeGreaterThan(landSpec(1).maxTile);
  });
});
