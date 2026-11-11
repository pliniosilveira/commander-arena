// The land row as a table lays it out (D-215): groups, columns, order and sizes. Pure functions.
import type { ObjectView } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { landGrow, landSpec } from '../src/ui/board/LandRow';
import {
  columnHeight,
  deepest,
  groupLands,
  LAND_STACK_MAX,
  landKey,
  landRank,
  layoutLands,
} from '../src/ui/board/lands';

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

  test('nonbasic lands follow the basic ones, grouped by card name and ordered by name', () => {
    const row = [
      land('Sunken Ruins'),
      land('Command Tower'),
      land('Forest'),
      land('Command Tower'),
      land('Arid Mesa'),
    ];
    const columns = groupLands(row);
    expect(names(columns)).toEqual([
      'Forestx1',
      'Arid Mesax1',
      'Command Towerx2',
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
    const columns = groupLands(row, LAND_STACK_MAX, (o) => o.id === aura.id);
    expect(columns.map((c) => c.objects.length).sort()).toEqual([1, 2]);
    expect(columns.some((c) => c.objects.length === 1 && c.objects[0]?.id === aura.id)).toBe(true);
  });

  test('basic lands rank by color; every nonbasic ranks after them', () => {
    expect(landRank(land('Plains'))).toBeLessThan(landRank(land('Island')));
    expect(landRank(land('Wastes'))).toBeLessThan(landRank(land('Command Tower')));
    expect(landRank(land('Snow-Covered Forest'))).toBe(landRank(land('Forest')));
  });
});

describe('the columns', () => {
  test('a column holds five; the sixth card starts a new one, and the first column never changes', () => {
    const six = many('Forest', 6);
    const columns = groupLands(six);
    expect(columns.map((c) => c.objects.length)).toEqual([5, 1]);
    expect(columns.map((c) => [c.part, c.parts, c.groupSize])).toEqual([
      [0, 2, 6],
      [1, 2, 6],
    ]);
    // A seventh land arrives: the first five stay where they were.
    const seven = groupLands([...six, land('Forest')]);
    expect(seven[0]?.objects.map((o) => o.id)).toEqual(columns[0]?.objects.map((o) => o.id));
    expect(seven.map((c) => c.objects.length)).toEqual([5, 2]);
  });

  test('eleven equal lands make three columns, and a smaller capacity makes more', () => {
    const eleven = many('Island', 11);
    expect(groupLands(eleven).map((c) => c.objects.length)).toEqual([5, 5, 1]);
    expect(groupLands(eleven, 3).map((c) => c.objects.length)).toEqual([3, 3, 3, 2]);
    expect(groupLands(eleven, 99).map((c) => c.objects.length)).toEqual([5, 5, 1]);
    expect(groupLands(eleven, 0).map((c) => c.objects.length)).toEqual(Array(11).fill(1));
  });

  test('inside a column the cards are in the order they entered, whatever the order given', () => {
    const [a, b, c] = many('Swamp', 3);
    if (a === undefined || b === undefined || c === undefined) throw new Error('lands');
    expect(groupLands([c, a, b])[0]?.objects.map((o) => o.id)).toEqual([a.id, b.id, c.id]);
  });

  test('tapping a land never moves it: the order and the columns are the same tapped or not', () => {
    const lands = many('Forest', 7);
    const tapped = lands.map((o, i) => (i % 2 === 0 ? { ...o, tapped: true } : o));
    expect(groupLands(tapped).map((c) => c.objects.map((o) => o.id))).toEqual(
      groupLands(lands).map((c) => c.objects.map((o) => o.id)),
    );
  });

  test('tapped and untapped lands of one name share a column', () => {
    const row = [
      land('Forest', { tapped: true }),
      land('Forest'),
      land('Forest', { tapped: true }),
    ];
    const columns = groupLands(row);
    expect(columns).toHaveLength(1);
    expect(columns[0]?.objects.map((o) => o.tapped)).toEqual([true, false, true]);
  });

  test('an empty row has no columns, and the same lands always give the same columns', () => {
    expect(groupLands([])).toEqual([]);
    const row = [land('Forest'), land('Plains'), land('Forest'), land('Command Tower')];
    expect(groupLands(row)).toEqual(groupLands([...row].reverse()));
    expect(deepest(groupLands(row))).toBe(2);
  });
});

describe('the size of the columns', () => {
  const spec = landSpec(1);
  const columnsOf = (lands: readonly ObjectView[]) => (capacity: number) =>
    groupLands(lands, capacity);

  test('a roomy row takes the full tile and five-deep columns', () => {
    const lands = [...many('Forest', 5), ...many('Plains', 5)];
    // D-240 (issue 137): the full tile is 88 now (70 before), and a column of five needs 164.
    const { layout } = layoutLands(columnsOf(lands), 900, 170, spec);
    expect(layout.capacity).toBe(5);
    expect(layout.tile).toBe(88);
    expect(layout.step).toBeGreaterThanOrEqual(spec.minStep);
    expect(columnHeight(5, layout.tile, layout.step)).toBeLessThanOrEqual(170);
    expect(layout.overflow).toBe(false);
  });

  test('a short row makes the columns shallower instead of the tiles unreadable', () => {
    const lands = many('Forest', 10);
    const { layout, columns } = layoutLands(columnsOf(lands), 900, 55, spec);
    expect(layout.capacity).toBeLessThan(5);
    // A stack is not drawn below the worthwhile size: the column gets shallower instead.
    expect(layout.tile).toBeGreaterThanOrEqual(spec.stackTile);
    expect(deepest(columns)).toBeLessThanOrEqual(layout.capacity);
    expect(columns.reduce((n, c) => n + c.objects.length, 0)).toBe(10);
    const tallest = columnHeight(deepest(columns), layout.tile, layout.step);
    expect(tallest).toBeLessThanOrEqual(Math.max(55, spec.minTile));
  });

  test('a row too short even for one card still draws the smallest tile', () => {
    const { layout } = layoutLands(columnsOf(many('Forest', 3)), 900, 20, spec);
    expect(layout.capacity).toBe(1);
    expect(layout.tile).toBe(spec.minTile);
  });

  test('a lot of different lands shrink the tiles to fit the width, then scroll', () => {
    const lands = Array.from({ length: 14 }, (_, i) =>
      land(`Nonbasic ${String(i).padStart(2, '0')}`),
    );
    const fit = layoutLands(columnsOf(lands), 700, 80, spec).layout;
    expect(fit.tile).toBeLessThan(70);
    expect(fit.overflow).toBe(false);
    const scroll = layoutLands(columnsOf(lands), 300, 80, spec).layout;
    expect(scroll.tile).toBe(spec.minTile);
    expect(scroll.overflow).toBe(true);
  });

  test('before the row is measured the tiles are drawn at full size with no width limit', () => {
    const { layout } = layoutLands(columnsOf(many('Forest', 2)), null, 100, spec);
    expect(layout.overflow).toBe(false);
    expect(layout.tile).toBeGreaterThan(40);
  });

  test('the text size scales the tile; deep columns ask the field for more height', () => {
    expect(landSpec(1.25).maxTile).toBeGreaterThan(landSpec(1).maxTile);
    expect(landGrow(1)).toBe(1);
    expect(landGrow(3)).toBeGreaterThan(1);
    expect(landGrow(5)).toBeGreaterThan(landGrow(3));
  });
});
