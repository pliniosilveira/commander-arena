// "{T}: Add {U} or {B}.": a mana ability that makes one mana of a color chosen from a list.
// Pins: CR 106.1b (the six types of mana a choice is made from), CR 111.10a (a Treasure makes mana
// of the color its controller chooses), CR 605.1a and 605.3b (a mana
// ability does not use the stack: the color is chosen as it is activated), CR 601.2g (mana is paid
// by tapping sources, so the payment planner must know which colors a source can make).
// All cards are SYNTHETIC (src/cards/fixtures/synthetic-mana.ts) or the real fixtures named.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import type { Ability, ManaColor, PayManaDecision } from '../src/index';
import {
  parseManaCost,
  planPayment,
  validateAbility,
  validateCard,
  validateCardStructure,
} from '../src/index';
import { scenario } from '../src/testing/index';

const DUAL = 'SYNTHETIC Dual Land';

describe('tapping a land that makes one of two colors (CR 605.3b)', () => {
  test('each of its two colors is on offer and the others are not', () => {
    const g = scenario().seat(0).battlefield(DUAL).build();
    g.expect.legal(0, { tap: DUAL, color: 'U' });
    g.expect.legal(0, { tap: DUAL, color: 'B' });
    for (const color of ['W', 'R', 'G', 'C'] as const) {
      g.expect.illegal(0, { tap: DUAL, color });
    }
    const offered = g
      .legalActions(0)
      .flatMap((a) => (a.kind === 'activateAbility' ? [a.color] : []));
    expect(offered.sort()).toEqual(['B', 'U']);
  });

  test('the chosen color is what goes to the pool, and the land taps (no stack)', () => {
    const g = scenario().seat(0).battlefield(DUAL, DUAL).build();
    g.act(0).tapForMana({ name: DUAL, nth: 0 }, { color: 'U' });
    g.act(0).tapForMana({ name: DUAL, nth: 1 }, { color: 'B' });
    g.expect.pool(0, 'UB');
    g.expect.stack([]);
    g.expect.noEvent({ kind: 'priorityPassed' });
  });

  test('a color outside the list is refused with a message that names the colors it makes', () => {
    const g = scenario().seat(0).battlefield(DUAL).build();
    const r = g.act(0).try.tapForMana(DUAL, { color: 'R' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('cannot make R mana');
      expect(r.error).toContain('U, B');
    }
    g.expect.tapped(DUAL, false);
    g.expect.pool(0, '');
  });

  test('no color given for a choice is refused, and says to choose', () => {
    const g = scenario().seat(0).battlefield(DUAL).build();
    const r = g.act(0).try.action({
      kind: 'activateAbility',
      source: g.id(DUAL),
      abilityIndex: 0,
      color: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('say which');
  });

  test('a list of three colors offers exactly those three', () => {
    const g = scenario().seat(0).battlefield('SYNTHETIC Tri Land').build();
    for (const color of ['W', 'U', 'B'] as const) {
      g.expect.legal(0, { tap: 'SYNTHETIC Tri Land', color });
    }
    g.expect.illegal(0, { tap: 'SYNTHETIC Tri Land', color: 'R' });
  });
});

describe('the payment planner treats it as a choice restricted to the list', () => {
  test('two of them pay black black, the Island pays the generic mana (Murder)', () => {
    const g = scenario()
      .seat(0)
      .hand('Murder')
      .battlefield(DUAL, DUAL, 'Island')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast('Murder', { targets: ['Grizzly Bears'], pay: true });
    g.expect.tapped({ name: DUAL, nth: 0 });
    g.expect.tapped({ name: DUAL, nth: 1 });
    g.expect.tapped('Island');
  });

  test('a color the lands cannot make is not payable, so the spell is not offered', () => {
    // Murder needs two black mana: one dual land makes only one of them.
    const g = scenario()
      .seat(0)
      .hand('Murder')
      .battlefield(DUAL, 'Island', 'Island')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.expect.illegal(0, { cast: 'Murder' });
  });

  test('a land of the list never pays a color outside it (Lightning Bolt wants red)', () => {
    const g = scenario().seat(0).hand('Lightning Bolt').battlefield(DUAL).build();
    g.expect.illegal(0, { cast: 'Lightning Bolt' });
  });

  test('the planner picks the color the cost needs (a plan exists whichever way the list is written)', () => {
    const plan = planPayment({
      cost: parseManaCost(['B', 'B']),
      x: 0,
      pool: [],
      sources: [
        {
          object: 'o1',
          abilityIndex: 0,
          produces: [['U'], ['B']],
          tier: 'land',
          snow: false,
          restriction: null,
        },
        {
          object: 'o2',
          abilityIndex: 0,
          produces: [['B'], ['U']],
          tier: 'land',
          snow: false,
          restriction: null,
        },
      ],
      lifeAvailable: 0,
      spell: { types: ['instant'] },
    });
    expect(plan?.taps.map((t) => t.outcome)).toEqual([1, 0]);
  });
});

describe('PayManaDecision.manaSources names the colors a source can make', () => {
  const pendingPayment = (g: ReturnType<ReturnType<typeof scenario>['build']>): PayManaDecision => {
    const d = g.state.pending;
    if (d?.kind !== 'payMana') throw new Error('expected a payMana decision');
    return d;
  };

  test('a list, any color, the commander identity: colors; a fixed source: none', () => {
    const g = scenario()
      .seat(0)
      .hand('Unsummon')
      .battlefield(DUAL, 'Island', 'Command Tower', 'Sol Ring')
      .commander('Isamaru, Hound of Konda')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast('Unsummon', { targets: ['Grizzly Bears'] });
    const sources = pendingPayment(g).manaSources;
    const colorsOf = (name: string): readonly ManaColor[] | undefined =>
      sources.find((s) => s.object === g.id(name))?.colors;
    expect(colorsOf(DUAL)).toEqual(['U', 'B']);
    expect(colorsOf('Command Tower')).toEqual(['W']);
    expect(colorsOf('Island')).toBeUndefined();
    expect(colorsOf('Sol Ring')).toBeUndefined();
  });

  test('any color lists the five colors in WUBRG order', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Make Treasures', 'Unsummon')
      .pool('CR')
      .battlefield('Island')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast('SYNTHETIC Make Treasures', { pay: true });
    g.passAll();
    g.act(0).cast('Unsummon', { targets: ['Grizzly Bears'] });
    const treasure = pendingPayment(g).manaSources.find(
      (s) => s.object === g.id({ name: 'Treasure', nth: 0 }),
    );
    expect(treasure?.colors).toEqual(['W', 'U', 'B', 'R', 'G']);
  });

  test('a manual tap must name a color of the list; one outside it is refused and nothing is tapped', () => {
    const g = scenario()
      .seat(0)
      .hand('Unsummon')
      .battlefield(DUAL)
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    const cast = g.act(0).cast('Unsummon', { targets: ['Grizzly Bears'] });
    const bad = g.act(0).try.action({
      kind: 'payManual',
      taps: [{ object: g.id(DUAL), abilityIndex: 0, color: 'R' }],
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain('cannot make R mana');
    g.expect.tapped(DUAL, false);
    g.expect.pending('payMana', 0);
    cast.payManual([{ source: DUAL, color: 'U' }]);
    g.expect.stack(['Unsummon']);
    g.expect.tapped(DUAL, true);
  });
});

describe('validation of oneOf', () => {
  const land = (production: unknown): Ability =>
    ({ kind: 'mana', cost: [{ kind: 'tap' }], production }) as Ability;

  test('two or more distinct colors are valid', () => {
    expect(validateAbility(land({ kind: 'oneOf', colors: ['U', 'B'] }))).toEqual([]);
    expect(validateAbility(land({ kind: 'oneOf', colors: ['C', 'R'] }))).toEqual([]);
  });

  test('fewer than two, a repeated color or an unknown one is rejected', () => {
    expect(validateAbility(land({ kind: 'oneOf', colors: ['U'] })).map((i) => i.path)).toEqual([
      'ability.production.colors',
    ]);
    expect(validateAbility(land({ kind: 'oneOf', colors: [] }))).toHaveLength(1);
    expect(validateAbility(land({ kind: 'oneOf', colors: ['U', 'U'] }))[0]?.message).toContain(
      'twice',
    );
    expect(validateAbility(land({ kind: 'oneOf', colors: ['U', 'X'] }))[0]?.message).toContain(
      'unknown',
    );
    expect(validateAbility(land({ kind: 'oneOf' }))).toHaveLength(1);
  });

  test('a spell effect cannot add a choice of mana: nothing would ask the color, so it is unsupported', () => {
    const spell = singleFace({
      name: 'SYNTHETIC Ritual Choice',
      manaCost: ['R'],
      types: ['instant'],
      colors: ['R'],
      colorIdentity: ['R'],
      oracleText: 'Add {R} or {G}.',
      spell: { effect: { kind: 'addMana', mana: { kind: 'oneOf', colors: ['R', 'G'] } } },
    });
    expect(validateCardStructure(spell)).toEqual([]);
    expect(
      validateCard(spell)
        .map((i) => i.message)
        .join(),
    ).toContain('not implemented');
  });

  test('the fixture dual land is a valid, supported card', () => {
    const g = scenario().seat(0).battlefield(DUAL).build();
    const def = g.state.definitions.find((d) => d.name === DUAL);
    expect(def && validateCard(def)).toEqual([]);
  });
});
