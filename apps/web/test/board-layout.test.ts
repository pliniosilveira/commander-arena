import type { GameView, ObjectView } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { splitAttachments, stripStep, stripWidth } from '../src/ui/board/attach';
import { groupEqual } from '../src/ui/board/group';
import { fitTiles, handStep, layoutRow, type RowSpec } from '../src/ui/board/layout';
import { rowSpec } from '../src/ui/board/Row';
import {
  bandBackground,
  combatRoles,
  commanderDamageTaken,
  cornerStat,
  counterChips,
  frameColors,
  frameImage,
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

describe('groupEqual (A19)', () => {
  test('identical tokens collapse into one group at the first position', () => {
    const a = obj();
    const bear = obj({ name: 'Bear', isToken: false });
    const b = obj();
    const entries = groupEqual([a, bear, b]);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ kind: 'group' });
    expect(entries[0]?.kind === 'group' && entries[0].objects.map((o) => o.id)).toEqual([
      a.id,
      b.id,
    ]);
    expect(entries[1]).toEqual({ kind: 'single', object: bear });
  });

  test('equal cards group as equal tokens do, and a card never groups with a token of its name', () => {
    expect(groupEqual([obj({ isToken: false }), obj({ isToken: false })])).toHaveLength(1);
    const entries = groupEqual([obj({ isToken: false }), obj()]);
    expect(entries.map((e) => e.kind)).toEqual(['single', 'single']);
  });

  test('a commander never groups, and a group needs the size the caller asks for', () => {
    const commanders = [obj({ isCommander: true }), obj({ isCommander: true })];
    expect(groupEqual(commanders).map((e) => e.kind)).toEqual(['single', 'single']);
    expect(groupEqual([obj(), obj()], undefined, 3)).toHaveLength(2);
    expect(groupEqual([obj(), obj(), obj()], undefined, 3)).toHaveLength(1);
  });

  test('a lone token stays a single tile', () => {
    expect(groupEqual([obj()])).toEqual([{ kind: 'single', object: expect.anything() }]);
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
    ['owner', { owner: 1 }],
    ['summoning sickness', { summoningSick: true }],
    ['the face that is up', { face: 1 }],
    ['being face down', { faceDown: true, faceDownBy: 'manifest' }],
    ['a used loyalty ability', { loyaltyUsed: true }],
    ['a kick', { kicked: true, kicks: 1 }],
    ['a regeneration shield', { regenerationShields: 1 }],
    ['a choice made as it entered', { chosen: { color: 'R' } }],
    ['a control effect', { controlEnds: 'endOfTurn' }],
    ['rules text', { oracleText: 'Haste' }],
    ['support', { support: 'unsupported' }],
  ] as [string, Partial<ObjectView>][])('permanents differing in %s do not group', (_, over) => {
    const entries = groupEqual([obj(), obj(over)]);
    expect(entries.map((e) => e.kind)).toEqual(['single', 'single']);
  });

  test('counter and keyword order does not matter', () => {
    const entries = groupEqual([
      obj({ counters: { a: 1, b: 2 }, keywords: ['flying', 'haste'] }),
      obj({ counters: { b: 2, a: 1 }, keywords: ['haste', 'flying'] }),
    ]);
    expect(entries).toHaveLength(1);
  });

  test('the caller can keep tokens apart by state the view does not carry', () => {
    const a = obj();
    const b = obj();
    const entries = groupEqual([a, b], (o) => (o.id === a.id ? 'attacking' : ''));
    expect(entries.map((e) => e.kind)).toEqual(['single', 'single']);
  });
});

const spec: RowSpec = { tileH: 100, preferredW: 74, minW: 56, gap: 6 };

describe('row layout (A19)', () => {
  const cards = (n: number, name: string) =>
    Array.from({ length: n }, () => obj({ isToken: false, name }));

  test('an unmeasured row draws at the preferred size', () => {
    const layout = layoutRow([obj(), obj()], null, spec);
    expect(layout).toMatchObject({ tileW: 74, grouped: false, overflow: false });
    expect(layout.entries).toHaveLength(2);
  });

  test('a row with room keeps the preferred width', () => {
    expect(fitTiles(3, 800, spec)).toEqual({ tileW: 74, overflow: false });
  });

  test('tiles shrink as the row fills, never below the minimum', () => {
    const ten = fitTiles(10, 700, spec);
    expect(ten.tileW).toBeLessThan(74);
    expect(ten.tileW).toBeGreaterThanOrEqual(56);
    expect(ten.overflow).toBe(false);
    expect(10 * ten.tileW + 9 * 6).toBeLessThanOrEqual(700);
    expect(fitTiles(20, 700, spec)).toEqual({ tileW: 56, overflow: true });
  });

  test('a tapped tile takes the room of an untapped one: it is tilted, not turned', () => {
    const row = [obj({ name: 'A' }), obj({ name: 'B', tapped: true }), obj({ name: 'C' })];
    expect(layoutRow(row, 234, spec)).toMatchObject({ tileW: 74, overflow: false });
  });

  test('three or more equal permanents always stand as one group, cards as well as tokens', () => {
    const layout = layoutRow([...cards(3, 'Bears'), obj(), obj(), obj()], 2000, spec);
    expect(layout.grouped).toBe(true);
    expect(layout.entries.map((e) => e.kind)).toEqual(['group', 'group']);
    expect(layout.tileW).toBe(74);
    expect(layoutRow(cards(3, 'Bears'), null, spec).entries).toHaveLength(1);
  });

  test('two equal permanents stay apart while the row keeps the preferred size', () => {
    const layout = layoutRow(cards(2, 'Bears'), 800, spec);
    expect(layout.grouped).toBe(false);
    expect(layout.entries).toHaveLength(2);
  });

  // Issue 368: a row that only fits by shrinking its tiles groups its pairs first, so the cards stay readable.
  test('two equal permanents group before the tiles have to shrink', () => {
    const row = [...cards(2, 'Bears'), ...cards(2, 'Elves'), ...cards(2, 'Wolves')];
    expect(fitTiles(6, 300, spec).tileW).toBeLessThan(74);
    const layout = layoutRow(row, 300, spec);
    expect(layout.grouped).toBe(true);
    expect(layout.entries).toHaveLength(3);
    expect(layout.tileW).toBe(74);
    expect(layout.overflow).toBe(false);
  });

  test('permanents that all differ shrink, then scroll', () => {
    const row = Array.from({ length: 10 }, (_, i) => obj({ name: `Card ${i}` }));
    const shrunk = layoutRow(row, 700, spec);
    expect(shrunk).toMatchObject({ grouped: false, overflow: false });
    expect(shrunk.tileW).toBeLessThan(74);
    const tight = layoutRow([...row, ...row.map((o) => ({ ...o, name: `${o.name}b` }))], 600, spec);
    expect(tight).toMatchObject({ grouped: false, overflow: true, tileW: 56 });
    expect(tight.entries).toHaveLength(20);
  });

  test('what the player acts on keeps a permanent out of the group of its equals', () => {
    const row = cards(4, 'Bears');
    const attacking = row[0]?.id;
    const layout = layoutRow(row, 2000, spec, (o) => (o.id === attacking ? 'attacking' : ''));
    expect(layout.entries.map((e) => e.kind)).toEqual(['single', 'group']);
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
    expect(stripStep(1)).toBe(30);
    expect(stripStep(3)).toBe(30);
    expect(stripWidth(0)).toBe(0);
    expect(stripWidth(2)).toBe(60);
    expect(stripWidth(3)).toBe(90);
    expect(stripStep(6)).toBe(15);
    expect(stripWidth(6)).toBeLessThanOrEqual(90);
    expect(stripStep(20)).toBe(10);
  });

  test('strips take width, not height: the tiles keep their size and shrink only when the row is full', () => {
    const plain = rowSpec('creature', 140);
    const wide = rowSpec('creature', 140, stripWidth(10));
    expect(wide.tileH).toBe(plain.tileH);
    expect(wide.extraW).toBe(stripWidth(10));
    expect(fitTiles(3, 420, wide).tileW).toBeLessThan(fitTiles(3, 420, plain).tileW);
    // A tile has the shape of a card's top: wider than tall.
    expect(plain.preferredW).toBeGreaterThan(plain.tileH);
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
    const entries = groupEqual([a, bWithAura]);
    expect(entries.map((e) => e.kind)).toEqual(['single', 'single']);
    // Two tokens with nothing attached still group.
    expect(groupEqual([obj(), obj()])).toHaveLength(1);
  });
});

describe('the colours a card is framed in (issue 22)', () => {
  const of = (colors: string[], types: string[], landMana?: string[]) =>
    frameColors({ colors, types, ...(landMana === undefined ? {} : { landMana }) } as never);

  test('a card has its own colours; a land the colours of its mana, colourless left out', () => {
    expect(of(['G'], ['creature'])).toEqual(['G']);
    expect(of([], ['artifact'], ['C'])).toEqual([]);
    expect(of([], ['land'], ['U'])).toEqual(['U']);
    expect(of([], ['land'], ['W', 'U', 'C'])).toEqual(['W', 'U']);
    expect(of([], ['land'], ['C'])).toEqual([]);
    expect(of([], ['land'])).toEqual([]);
    // A land with a colour of its own (Dryad Arbor) keeps it.
    expect(of(['G'], ['land', 'creature'], ['G'])).toEqual(['G']);
  });

  test('the border is always an image: one colour, two on the diagonal, gold, grey', () => {
    expect(frameImage(['R'])).toBe('linear-gradient(var(--card-r), var(--card-r))');
    expect(frameImage(['W', 'U'])).toBe(
      'linear-gradient(135deg, var(--card-w) 50%, var(--card-u) 50%)',
    );
    expect(frameImage(['W', 'U', 'B'])).toBe(
      'linear-gradient(var(--card-multi), var(--card-multi))',
    );
    expect(frameImage([])).toBe('linear-gradient(var(--card-colorless), var(--card-colorless))');
  });
});
