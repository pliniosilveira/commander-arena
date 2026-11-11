import type { GameView, ObjectView } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { splitAttachments, stripReserve, stripStep } from '../src/ui/board/attach';
import { groupTokens } from '../src/ui/board/group';
import { fitTiles, handStep, layoutRow, type RowSpec } from '../src/ui/board/layout';
import { rowSpec } from '../src/ui/board/Row';
import {
  bandBackground,
  combatRoles,
  commanderDamageTaken,
  cornerStat,
  counterChips,
  rowKindOf,
} from '../src/ui/board/resolve';

let next = 0;
function obj(over: Partial<ObjectView> = {}): ObjectView {
  next += 1;
  return {
    id: `o${next}`,
    owner: 0,
    controller: 0,
    zone: 'battlefield',
    name: 'Goblin',
    manaCost: null,
    supertypes: [],
    types: ['creature'],
    subtypes: ['Goblin'],
    colors: ['R'],
    power: 1,
    toughness: 1,
    oracleText: '',
    tapped: false,
    damage: 0,
    counters: {},
    isCommander: false,
    summoningSick: false,
    isToken: true,
    keywords: [],
    protector: null,
    support: 'supported',
    targets: [],
    ...over,
  };
}

describe('groupTokens (A19)', () => {
  test('identical tokens collapse into one group at the first position', () => {
    const a = obj();
    const bear = obj({ name: 'Bear', isToken: false });
    const b = obj();
    const entries = groupTokens([a, bear, b]);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ kind: 'group' });
    expect(entries[0]?.kind === 'group' && entries[0].objects.map((o) => o.id)).toEqual([
      a.id,
      b.id,
    ]);
    expect(entries[1]).toEqual({ kind: 'single', object: bear });
  });

  test('nontoken permanents never group, however identical', () => {
    const entries = groupTokens([obj({ isToken: false }), obj({ isToken: false })]);
    expect(entries.map((e) => e.kind)).toEqual(['single', 'single']);
  });

  test('a lone token stays a single tile', () => {
    expect(groupTokens([obj()])).toEqual([{ kind: 'single', object: expect.anything() }]);
  });

  test.each([
    ['tapped state', { tapped: true }],
    ['counters', { counters: { '+1/+1': 1 } }],
    ['name', { name: 'Soldier' }],
    ['colors', { colors: ['W' as const] }],
    ['power', { power: 2 }],
    ['keywords', { keywords: ['flying'] }],
    ['damage', { damage: 1 }],
    ['controller', { controller: 1 }],
  ] satisfies [string, Partial<ObjectView>][])('tokens differing in %s do not group', (_, over) => {
    const entries = groupTokens([obj(), obj(over)]);
    expect(entries.map((e) => e.kind)).toEqual(['single', 'single']);
  });

  test('counter and keyword order does not matter', () => {
    const entries = groupTokens([
      obj({ counters: { a: 1, b: 2 }, keywords: ['flying', 'haste'] }),
      obj({ counters: { b: 2, a: 1 }, keywords: ['haste', 'flying'] }),
    ]);
    expect(entries).toHaveLength(1);
  });

  test('the caller can keep tokens apart by state the view does not carry', () => {
    const a = obj();
    const b = obj();
    const entries = groupTokens([a, b], (o) => (o.id === a.id ? 'attacking' : ''));
    expect(entries.map((e) => e.kind)).toEqual(['single', 'single']);
  });
});

const spec: RowSpec = { tileH: 100, preferredW: 74, minW: 56, gap: 6 };

describe('row layout (A19)', () => {
  test('an unmeasured row draws at the preferred size without grouping', () => {
    const layout = layoutRow([obj(), obj()], null, spec);
    expect(layout).toMatchObject({ tileW: 74, grouped: false, overflow: false });
    expect(layout.entries).toHaveLength(2);
  });

  test('a row with room keeps the preferred width', () => {
    const fit = fitTiles([false, false, false], 800, spec);
    expect(fit).toEqual({ tileW: 74, overflow: false });
  });

  test('tiles shrink as the row fills, never below the minimum', () => {
    const six = fitTiles(Array(10).fill(false), 700, spec);
    expect(six.tileW).toBeLessThan(74);
    expect(six.tileW).toBeGreaterThanOrEqual(56);
    expect(six.overflow).toBe(false);
    expect(10 * six.tileW + 9 * 6).toBeLessThanOrEqual(700);
    const tight = fitTiles(Array(20).fill(false), 700, spec);
    expect(tight.tileW).toBe(56);
    expect(tight.overflow).toBe(true);
  });

  test('a tapped tile needs its height as room', () => {
    const upright = fitTiles([false, false, false, false], 300, spec);
    const oneTapped = fitTiles([true, false, false, false], 300, spec);
    expect(oneTapped.tileW).toBeLessThan(upright.tileW);
  });

  test('below the minimum width identical tokens group; the row stops overflowing', () => {
    const tokens = Array.from({ length: 24 }, () => obj());
    const layout = layoutRow(tokens, 600, spec);
    expect(layout.grouped).toBe(true);
    expect(layout.entries).toHaveLength(1);
    expect(layout.overflow).toBe(false);
  });

  test('nontoken permanents that do not fit scroll instead of grouping', () => {
    const cards = Array.from({ length: 20 }, () => obj({ isToken: false }));
    const layout = layoutRow(cards, 600, spec);
    expect(layout.grouped).toBe(false);
    expect(layout.overflow).toBe(true);
    expect(layout.entries).toHaveLength(20);
    expect(layout.tileW).toBe(56);
  });

  test('tokens are only grouped when the plain row does not fit', () => {
    const tokens = Array.from({ length: 4 }, () => obj());
    expect(layoutRow(tokens, 800, spec).grouped).toBe(false);
  });
});

describe('hand fan', () => {
  test('a short hand spreads out, a long one overlaps but keeps a readable edge', () => {
    expect(handStep(1, 108, 800)).toBe(114);
    expect(handStep(3, 108, 800)).toBe(114);
    const step = handStep(12, 108, 800);
    expect(step).toBeLessThan(108);
    expect(108 + 11 * step).toBeLessThanOrEqual(800);
    expect(handStep(40, 108, 800)).toBe(26);
  });
});

describe('frame helpers', () => {
  test('colour bands use tokens only', () => {
    expect(bandBackground([])).toBe('var(--card-colorless)');
    expect(bandBackground(['G'])).toBe('var(--card-g)');
    expect(bandBackground(['W', 'U'])).toContain('var(--card-w)');
    expect(bandBackground(['W', 'U', 'B'])).toBe('var(--card-multi)');
  });

  test('rows: a land creature is a creature; artifacts and walkers are other', () => {
    expect(rowKindOf(obj({ types: ['land', 'creature'] }))).toBe('creature');
    expect(rowKindOf(obj({ types: ['land'] }))).toBe('land');
    expect(rowKindOf(obj({ types: ['artifact'] }))).toBe('other');
    expect(rowKindOf(obj({ types: ['planeswalker'] }))).toBe('other');
  });

  test('the corner shows loyalty or defense on the battlefield, else power and toughness', () => {
    expect(cornerStat(obj({ types: ['planeswalker'], counters: { loyalty: 4 } }))).toEqual({
      kind: 'loyalty',
      text: '4',
    });
    expect(cornerStat(obj({ types: ['battle'], counters: { defense: 5 } }))?.kind).toBe('defense');
    expect(cornerStat(obj({ power: 3, toughness: 4 }))).toEqual({ kind: 'pt', text: '3/4' });
    expect(
      cornerStat(obj({ types: ['planeswalker'], zone: 'hand', power: null, toughness: null })),
    ).toBeNull();
    expect(cornerStat(obj({ types: ['land'], power: null, toughness: null }))).toBeNull();
  });

  test('counter chips leave out loyalty and defense, which the corner shows', () => {
    const chips = counterChips(obj({ counters: { loyalty: 3, '+1/+1': 2, charge: 0 } }));
    expect(chips).toEqual([{ name: '+1/+1', count: 2 }]);
  });
});

function view(over: Partial<GameView>): GameView {
  return {
    viewer: 0,
    turn: 3,
    activeSeat: 0,
    phase: 'combat',
    step: 'declareBlockers',
    prioritySeat: 0,
    seats: [],
    battlefield: [],
    exile: [],
    stack: [],
    combat: null,
    pending: null,
    decidingSeat: null,
    commanderDamage: {},
    result: null,
    ...over,
  } as GameView;
}

describe('combat roles and commander damage', () => {
  test('attackers name their target, blockers name whom they block', () => {
    const attacker = obj({ name: 'Serra Angel' });
    const blocker = obj({ name: 'Giant Spider', controller: 1 });
    const walker = obj({ name: 'Jace', types: ['planeswalker'] });
    const roles = combatRoles(
      view({
        battlefield: [attacker, blocker, walker],
        combat: {
          attackers: [
            {
              object: attacker.id,
              target: { kind: 'permanent', object: walker.id },
              blocked: true,
              blockedBy: [blocker.id],
            },
          ],
        },
      }),
    );
    expect(roles.get(attacker.id)).toEqual({
      kind: 'attacker',
      target: 'Jace',
      blocked: true,
      number: 1,
      blockers: 1,
      tentative: false,
    });
    expect(roles.get(blocker.id)).toEqual({
      kind: 'blocker',
      blocks: ['Serra Angel'],
      pairs: [{ number: 1, attacker: attacker.id, name: 'Serra Angel' }],
      tentative: false,
    });
  });

  test('outside combat nobody has a role', () => {
    expect(combatRoles(view({})).size).toBe(0);
  });

  test('commander damage is named when exactly one opposing commander can be resolved', () => {
    const commander = obj({ name: 'Yargle', owner: 1, controller: 1, isCommander: true });
    const bare = { graveyard: [], command: [], hand: null };
    const seats = [
      { id: 0, ...bare },
      { id: 1, ...bare },
    ] as unknown as GameView['seats'];
    const v = view({ seats, battlefield: [commander], commanderDamage: { '0:card7': 5 } });
    expect(commanderDamageTaken(v, 0)).toEqual([{ source: 'Yargle', amount: 5 }]);
    expect(commanderDamageTaken(v, 1)).toEqual([]);
    const two = view({ seats, battlefield: [commander], commanderDamage: { '0:a': 5, '0:b': 2 } });
    expect(commanderDamageTaken(two, 0)).toEqual([
      { source: null, amount: 5 },
      { source: null, amount: 2 },
    ]);
  });
});

describe('attachments are drawn under their host (CR 301.5, 303.4)', () => {
  const bear = () => obj({ name: 'Bear', isToken: false, types: ['creature'], subtypes: ['Bear'] });
  const aura = (host: ObjectView, over: Partial<ObjectView> = {}) =>
    obj({
      name: 'Might Aura',
      isToken: false,
      types: ['enchantment'],
      subtypes: ['Aura'],
      attachedTo: host.id,
      ...over,
    });
  const gear = (over: Partial<ObjectView> = {}) =>
    obj({
      name: 'Blade',
      isToken: false,
      types: ['artifact'],
      subtypes: ['Equipment'],
      ...over,
    });

  test('an attached Aura and Equipment hang under the host, oldest first, and have no tile', () => {
    const host = bear();
    const a = aura(host);
    const e = gear({ attachedTo: host.id });
    const loose = bear();
    const hostView = { ...host, attachments: [e.id, a.id] };
    const { byHost, attached } = splitAttachments([a, hostView, e, loose]);
    expect(byHost.get(host.id)?.map((o) => o.id)).toEqual([e.id, a.id]);
    expect(byHost.has(loose.id)).toBe(false);
    expect([...attached].sort()).toEqual([a.id, e.id].sort());
  });

  test('an unattached Equipment is an ordinary tile of its own', () => {
    const host = bear();
    const idle = gear();
    const { byHost, attached } = splitAttachments([host, idle]);
    expect(byHost.size).toBe(0);
    expect(attached.has(idle.id)).toBe(false);
  });

  test('the host may belong to the other player: the Aura still goes under it', () => {
    const theirs = obj({ ...bear(), controller: 1 });
    const mine = aura(theirs, { controller: 0 });
    const { byHost, attached } = splitAttachments([theirs, mine]);
    expect(byHost.get(theirs.id)?.map((o) => o.id)).toEqual([mine.id]);
    expect(attached.has(mine.id)).toBe(true);
  });

  test('an Aura on an Equipment is flattened under the creature at the bottom of the chain', () => {
    const host = bear();
    const e = gear({ attachedTo: host.id });
    const a = aura(e);
    const { byHost, attached } = splitAttachments([host, e, a]);
    expect(byHost.get(host.id)?.map((o) => o.id)).toEqual([e.id, a.id]);
    expect(byHost.has(e.id)).toBe(false);
    expect(attached.size).toBe(2);
  });

  test('a host that is not on the battlefield, or a cycle, never hides an object', () => {
    const lost = gear({ attachedTo: 'o99999' });
    const x = gear();
    const y = gear({ attachedTo: x.id });
    const cycle = { ...x, attachedTo: y.id };
    const { byHost, attached } = splitAttachments([lost, cycle, y]);
    expect(byHost.size).toBe(0);
    expect(attached.size).toBe(0);
  });

  test('strips take up to three full steps of room, then are squeezed into the same space', () => {
    expect(stripStep(1)).toBe(14);
    expect(stripStep(3)).toBe(14);
    expect(stripReserve(0)).toBe(0);
    expect(stripReserve(2)).toBe(28);
    expect(stripReserve(3)).toBe(42);
    expect(stripStep(6)).toBe(7);
    expect(stripReserve(6)).toBeLessThanOrEqual(42);
    expect(stripStep(20)).toBe(5);
  });

  test('a row with a host keeps room for its strips by drawing the tiles smaller', () => {
    const plain = rowSpec('creature', 140);
    const reserved = rowSpec('creature', 140, stripReserve(2));
    // The row is the room the tile fits in: 140 - 2 * 6 padding (the cap, 136, is above it).
    expect(plain.tileH).toBe(128);
    expect(reserved.tileH).toBe(100); // 140 - 2 * 6 padding - 28 for two strips
    expect(reserved.preferredW).toBeLessThan(plain.preferredW);
  });

  test('the biggest tiles are a quarter bigger than before issue 137 (108, 84 and 70)', () => {
    // A row with all the room it wants: the cap of the kind. Before D-240 these were 108, 84 and 70.
    expect(rowSpec('creature', 400).tileH).toBe(136);
    expect(rowSpec('other', 400).tileH).toBe(105);
    expect(rowSpec('land', 400).tileH).toBe(88);
    expect(136 / 108).toBeGreaterThan(1.2);
    expect(136 / 108).toBeLessThan(1.3);
    expect(105 / 84).toBeCloseTo(1.25, 2);
    expect(88 / 70).toBeGreaterThan(1.25);
    // A short row still decides the size (the minimum a tile is drawn at is 40).
    expect(rowSpec('creature', 100).tileH).toBe(88);
  });

  test('tokens that differ in their attachments never group', () => {
    const a = obj();
    const b = obj();
    const bWithAura: ObjectView = { ...b, attachments: ['o900'] };
    const entries = groupTokens([a, bWithAura]);
    expect(entries.map((e) => e.kind)).toEqual(['single', 'single']);
    // Two tokens with nothing attached still group.
    expect(groupTokens([obj(), obj()])).toHaveLength(1);
  });
});
