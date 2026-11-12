// What a pair gives (D-984, D-982, D-981), CR 702.95b, 611.3a, 613.1f, 613.7a, 603.10a: "As long as this creature is paired with another creature, each of those
// creatures has ..." as a layer 6 grant (and a keyword, and +N/+N, through the same subject), and the dies-and-return ability the Seraph's pair has: a partner
// that dies, the Seraph, both together (look-back: each sees the grant, whichever left first), a token, a commander, phasing.
// Pins: CR 611.3a (the set is not locked in: it is whatever the pair is at any moment), 613.1f (adding abilities is layer 6), 613.7a (the timestamp is the
// permanent's), 603.10a (a "dies" ability looks back in time), 603.7a-c (the delayed return: next upkeep, once, only the card still in the graveyard), 702.26b
// and 702.26d (phasing), 400.7 (a creature that returns is a new object, unpaired).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-soulbond.ts, synthetic-dies-return.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { derive } from '../src/rules/derive';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { settle } from './meld-helpers';

const SQUIRE = 'SYNTHETIC Soulbound Squire';
const SERAPH = 'SYNTHETIC Soulbound Seraph';
const GIANT = 'SYNTHETIC Soulbound Giant';
const GLIDER = 'SYNTHETIC Soulbound Glider';
const HOUND = 'SYNTHETIC Bonded Hound';
const BEARS = 'Grizzly Bears';
const FROG_HEX = 'SYNTHETIC Frog Hex'; // {1}{U} loses all abilities, becomes a blue Frog 1/1 until end of turn
const MURDER = 'Murder';
const BOLT = 'Lightning Bolt';
const WRATH = 'SYNTHETIC Grant Wrath';
const LIBRARY = ['Island', 'Island', 'Island', 'Island'] as const;

const wrath = singleFace({
  name: WRATH,
  manaCost: ['1'],
  types: ['sorcery'],
  colors: [],
  colorIdentity: [],
  oracleText: 'SYNTHETIC: destroy all creatures.',
  spell: {
    effect: { kind: 'destroy', objects: { kind: 'each', filter: { types: ['creature'] } } },
  },
});

/** Whether the permanent has the granted "when this creature dies, you may return it ..." ability now. */
function hasDiesReturn(g: ScenarioGame, card: string): boolean {
  return derive(g.state, g.object(card)).abilities.some(
    (a) =>
      a.kind === 'triggered' && a.trigger.kind === 'dies' && a.effect.kind === 'delayedTrigger',
  );
}

/** Seat 0 has the Seraph paired with the Bears (the Seraph placed `seraphFirst`: first = older timestamp), lands for every spell below, a Bolt and a Murder. */
function pair(
  seraphFirst = true,
  extra: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario> = (b) => b,
) {
  let b = scenario()
    .define(wrath)
    .seat(0)
    .hand(BOLT, MURDER, WRATH, FROG_HEX)
    .battlefield('Plains', { count: 2 })
    .battlefield('Swamp', { count: 3 })
    .battlefield('Mountain', { count: 3 })
    .battlefield('Island', { count: 3 });
  b = seraphFirst
    ? b
        .battlefield(SERAPH, { label: 'seraph', pairedWith: 'bears' })
        .battlefield(BEARS, { label: 'bears' })
    : b
        .battlefield(BEARS, { label: 'bears' })
        .battlefield(SERAPH, { label: 'seraph', pairedWith: 'bears' });
  return extra(
    b
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY),
  )
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
}

const resolveTop = (g: ScenarioGame) => {
  g.pass();
  g.pass();
};

describe('the grant: both creatures have the ability while paired, neither otherwise (CR 611.3a, 613.1f)', () => {
  test('the Seraph and its partner both have it', () => {
    const g = pair();
    expect(hasDiesReturn(g, 'seraph')).toBe(true);
    expect(hasDiesReturn(g, 'bears')).toBe(true);
  });

  test('an unpaired Seraph has nothing to give, and a creature that is not its partner has nothing', () => {
    const g = scenario()
      .seat(0)
      .battlefield(SERAPH, { label: 'seraph' })
      .battlefield(BEARS, { label: 'bears' })
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .build();
    expect(hasDiesReturn(g, 'seraph')).toBe(false);
    expect(hasDiesReturn(g, 'bears')).toBe(false);
  });

  test('a third creature, entering later, is not affected, and neither is one of the opponent', () => {
    const g = scenario()
      .seat(0)
      .battlefield(SERAPH, { label: 'seraph', pairedWith: 'bears' })
      .battlefield(BEARS, { label: 'bears' })
      .battlefield('Serra Angel', { label: 'serra' })
      .library(...LIBRARY)
      .seat(1)
      .battlefield(BEARS, { label: 'theirs' })
      .library(...LIBRARY)
      .build();
    expect(hasDiesReturn(g, 'serra')).toBe(false);
    expect(hasDiesReturn(g, 'theirs')).toBe(false);
  });

  test('the grant ends with the pair: the partner dies and the Seraph keeps nothing the partner had, the Seraph unpaired has none', () => {
    const g = pair();
    g.act(0).cast(BOLT, { targets: ['bears'], pay: true });
    settle(g);
    g.expect.unpaired('seraph');
    expect(hasDiesReturn(g, 'seraph')).toBe(false);
  });

  test('two pairs, two Seraphs: each pair has its own grant', () => {
    const g = scenario()
      .seat(0)
      .battlefield(SERAPH, { label: 's1', pairedWith: 'b1' })
      .battlefield(BEARS, { label: 'b1' })
      .battlefield(SERAPH, { label: 's2', pairedWith: 'b2' })
      .battlefield(BEARS, { label: 'b2' })
      .battlefield('Serra Angel', { label: 'free' })
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .build();
    for (const c of ['s1', 'b1', 's2', 'b2']) expect(hasDiesReturn(g, c)).toBe(true);
    expect(hasDiesReturn(g, 'free')).toBe(false);
    g.expect.paired('s1', 'b1');
    g.expect.paired('s2', 'b2');
    g.expect.invariants();
  });

  test('layer 6: a creature that lost all abilities after the grant has none, and the Seraph keeps its own', () => {
    const g = pair();
    g.act(0).cast(FROG_HEX, { targets: ['bears'], pay: true });
    settle(g);
    expect(hasDiesReturn(g, 'bears')).toBe(false); // the effect is newer than the Seraph's static ability (CR 613.7a)
    expect(hasDiesReturn(g, 'seraph')).toBe(true);
    g.expect.paired('seraph', 'bears'); // losing abilities does not end a pair
  });
});

describe('a pair gives other things through the same subject and condition', () => {
  test('power and toughness: each creature of the pair gets +2/+2, and only while paired', () => {
    const g = scenario()
      .seat(0)
      .battlefield(GIANT, { label: 'giant', pairedWith: 'bears' })
      .battlefield(BEARS, { label: 'bears' })
      .battlefield('Serra Angel', { label: 'serra' })
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.expect.pt('giant', 5, 5);
    g.expect.pt('bears', 4, 4);
    g.expect.pt('serra', 4, 4);
    const lone = scenario()
      .seat(0)
      .battlefield(GIANT, { label: 'giant' })
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .build();
    lone.expect.pt('giant', 3, 3);
  });

  test('a keyword: both creatures have flying while paired', () => {
    const g = scenario()
      .seat(0)
      .battlefield(GLIDER, { label: 'glider', pairedWith: 'bears' })
      .battlefield(BEARS, { label: 'bears' })
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .build();
    for (const c of ['glider', 'bears']) {
      expect(
        derive(g.state, g.object(c)).abilities.some(
          (a) => a.kind === 'keyword' && a.keyword.kind === 'flying',
        ),
      ).toBe(true);
    }
  });

  test('"as long as this creature is paired with another creature" on a creature without soulbond: paired by the other creature\'s soulbond', () => {
    const g = scenario()
      .seat(0)
      .hand(SQUIRE)
      .battlefield('Plains', { count: 2 })
      .battlefield(HOUND, { label: 'hound' })
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    const lifelink = () =>
      derive(g.state, g.object('hound')).abilities.some(
        (a) => a.kind === 'keyword' && a.keyword.kind === 'lifelink',
      );
    expect(lifelink()).toBe(false);
    g.act(0).cast(SQUIRE, { pay: true });
    resolveTop(g);
    resolveTop(g);
    g.act(0).choosePermanents('hound');
    expect(lifelink()).toBe(true);
    g.expect.invariants();
  });
});

describe('the dies ability the pair gives: a partner that dies returns at your next upkeep (CR 603.7a-c, D-982)', () => {
  test('the partner dies: its controller may return it; it comes back at the next upkeep as a new object, unpaired, under its owner', () => {
    const g = pair();
    const old = g.id('bears');
    g.act(0).cast(BOLT, { targets: ['bears'], pay: true });
    resolveTop(g); // Bolt resolves; Bears dies; the dies ability of the Bears goes on the stack
    g.expect.stack([`${BEARS} (ability)`]);
    resolveTop(g);
    g.act(0).accept();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    expect(g.state.delayedTriggers).toHaveLength(1);
    g.advanceTo('upkeep', { turn: 5 });
    resolveTop(g);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    expect(g.id(BEARS)).not.toBe(old);
    g.expect.unpaired(BEARS); // a returning creature is a new object with no pair
    g.expect.unpaired('seraph');
    g.expect.invariants();
  });

  test('declined: nothing is created', () => {
    const g = pair();
    g.act(0).cast(BOLT, { targets: ['bears'], pay: true });
    resolveTop(g);
    resolveTop(g);
    g.act(0).decline();
    expect(g.state.delayedTriggers).toEqual([]);
    g.advanceTo('upkeep', { turn: 5 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });

  test('the Seraph dies (it has the grant itself while paired): it returns at the next upkeep, unpaired', () => {
    const g = pair();
    g.act(0).cast(MURDER, { targets: ['seraph'], pay: true });
    resolveTop(g);
    g.expect.stack([`${SERAPH} (ability)`]);
    resolveTop(g);
    g.act(0).accept();
    g.advanceTo('upkeep', { turn: 5 });
    resolveTop(g);
    g.expect.zone(SERAPH, 'battlefield', { seat: 0 });
    g.expect.unpaired(SERAPH);
    g.expect.unpaired('bears');
    expect(hasDiesReturn(g, 'bears')).toBe(false);
  });

  for (const seraphFirst of [true, false]) {
    test(`both die together (Seraph ${seraphFirst ? 'older' : 'younger'}): both have the ability, two delayed abilities, both return (CR 603.10a)`, () => {
      const g = pair(seraphFirst);
      g.act(0).cast(WRATH, { pay: true });
      resolveTop(g);
      g.expect.pending('orderTriggers', 0);
      g.act(0).orderTriggers(0, 1);
      expect(g.state.stack).toHaveLength(2); // a dies ability of the Seraph and one of the Bears: each saw the grant
      for (let i = 0; i < 2; i += 1) {
        resolveTop(g);
        g.act(0).accept();
      }
      expect(g.state.delayedTriggers).toHaveLength(2);
      g.advanceTo('upkeep', { turn: 5 });
      if (g.state.pending?.kind === 'orderTriggers') g.act(0).orderTriggers(0, 1);
      settle(g);
      g.expect.zone(SERAPH, 'battlefield', { seat: 0 });
      g.expect.zone(BEARS, 'battlefield', { seat: 0 });
      g.expect.unpaired(SERAPH);
      g.expect.invariants();
    });

    test(`both die in one state-based-action check (Seraph ${seraphFirst ? 'older' : 'younger'}): both triggers fire (CR 704.3, 603.10a)`, () => {
      const damaged = (b: ReturnType<typeof scenario>) =>
        seraphFirst
          ? b
              .battlefield(SERAPH, { label: 'seraph', pairedWith: 'bears', damage: 4 })
              .battlefield(BEARS, { label: 'bears', damage: 2 })
          : b
              .battlefield(BEARS, { label: 'bears', damage: 2 })
              .battlefield(SERAPH, { label: 'seraph', pairedWith: 'bears', damage: 4 });
      const h = damaged(scenario().seat(0))
        .library(...LIBRARY)
        .seat(1)
        .library(...LIBRARY)
        .at('precombatMain', { active: 0, turn: 3 })
        .build();
      h.act(0).pass(); // state-based actions run: both die together
      expect(h.state.stack.length + h.state.pendingTriggers.length).toBe(2);
    });
  }
});

describe('a melded permanent in a pair (D-277)', () => {
  const DUSK = 'SYNTHETIC Dusk Squire';
  const DAWN = 'SYNTHETIC Dawn Squire';

  test('it has the grant as one creature; when it dies both its cards may return, as two creatures, unpaired (CR 712.21c, 603.7)', () => {
    const g = scenario()
      .seat(0)
      .hand(MURDER)
      .battlefield('Plains', { count: 2 })
      .battlefield('Swamp', { count: 3 })
      .battlefield(SERAPH, { label: 'seraph', pairedWith: 'dusk' })
      .battlefield(DUSK, { label: 'dusk', meldedWith: 'dawn' })
      .battlefield(DAWN, { label: 'dawn' })
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    expect(hasDiesReturn(g, 'dusk')).toBe(true);
    g.act(0).cast(MURDER, { targets: ['dusk'], pay: true });
    settle(g);
    // One dies ability for the one permanent that died; its "you may" is answered once.
    if (g.state.pending?.kind === 'confirmOptional') g.act(0).accept();
    settle(g);
    expect(g.state.delayedTriggers.length).toBe(2); // one for each card (CR 712.21c: "it" finds both)
    g.expect.unpaired('seraph');
    g.advanceTo('upkeep', { turn: 5 });
    if (g.state.pending?.kind === 'orderTriggers') g.act(0).orderTriggers(0, 1);
    // Each card that comes back enters: the Seraph, unpaired now, may be paired with it (its second ability); here it declines.
    for (let i = 0; i < 6; i += 1) {
      settle(g);
      if (g.state.pending?.kind !== 'choosePermanent') break;
      g.act(0).choosePermanents();
    }
    g.expect.zone(DUSK, 'battlefield', { seat: 0 });
    g.expect.zone(DAWN, 'battlefield', { seat: 0 });
    expect(g.object(DUSK).meldedWith).toBeUndefined();
    g.expect.unpaired(DUSK);
    g.expect.invariants();
  });
});

describe('a token and a commander', () => {
  const COPIER = 'SYNTHETIC Grant Copier';
  const copier = singleFace({
    name: COPIER,
    manaCost: ['1'],
    types: ['sorcery'],
    colors: [],
    colorIdentity: [],
    oracleText: "SYNTHETIC: create a token that's a copy of target creature you control.",
    spell: {
      targets: [
        {
          id: 't1',
          min: 1,
          max: 1,
          what: {
            kind: 'object',
            filter: { zone: 'battlefield', controller: 'you', types: ['creature'] },
          },
        },
      ],
      effect: {
        kind: 'createToken',
        token: { kind: 'copyOf', object: { kind: 'target', id: 't1' } },
        count: 1,
      },
    },
  });

  test('a token is paired like any creature, has the grant, and when it dies nothing is returned (CR 111.8)', () => {
    const g = scenario()
      .define(copier)
      .seat(0)
      .hand(COPIER, BOLT)
      .battlefield('Mountain', { count: 3 })
      .battlefield(SERAPH, { label: 'seraph' })
      .battlefield(BEARS, { label: 'bears' })
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(COPIER, { targets: ['bears'], pay: true });
    resolveTop(g);
    // The token Bears enters: the Seraph's second ability may pair it.
    resolveTop(g);
    const token = g.find({ name: BEARS, zone: 'battlefield' }).find((o) => o.token !== null);
    expect(token).toBeDefined();
    g.act(0).choosePermanents(token?.id ?? '');
    g.expect.paired('seraph', token?.id ?? '');
    expect(hasDiesReturn(g, token?.id ?? '')).toBe(true);
    g.act(0).cast(BOLT, { targets: [token?.id ?? ''], pay: true });
    resolveTop(g);
    g.expect.stack([`${BEARS} (ability)`]);
    resolveTop(g);
    g.act(0).accept();
    expect(g.state.delayedTriggers).toEqual([]); // a token that died has ceased to exist: nothing to return
    g.expect.unpaired('seraph');
    g.expect.invariants();
  });

  test('a commander that dies and goes to the command zone returns nothing (CR 903.9a, 603.7c)', () => {
    // The partner is the commander in this game.
    const h = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield('Mountain')
      .battlefield(SERAPH, { label: 'seraph', pairedWith: 'bears' })
      .battlefield(BEARS, { label: 'bears', commander: true })
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    h.act(0).cast(BOLT, { targets: ['bears'], pay: true });
    resolveTop(h);
    if (h.state.pending?.kind === 'commanderZone') h.act(0).sendToCommandZone();
    h.expect.zone(BEARS, 'command', { seat: 0 });
    h.expect.stack([`${BEARS} (ability)`]);
    resolveTop(h);
    h.act(0).accept();
    expect(h.state.delayedTriggers).toEqual([]);
    h.expect.unpaired('seraph');
    h.expect.invariants();
  });
});

describe('phasing: the pair survives it, and the grant is off while either is phased out (CR 702.26b, 702.26d)', () => {
  const PHASE_GUARD = 'SYNTHETIC Phase Guard';
  const phased = (target: 'bears' | 'seraph') => {
    const g = scenario()
      .seat(0)
      .hand(PHASE_GUARD, BOLT, MURDER)
      .battlefield('Plains', { count: 3 })
      .battlefield('Swamp', { count: 3 })
      .battlefield('Mountain', { count: 2 })
      .battlefield(SERAPH, { label: 'seraph', pairedWith: 'bears' })
      .battlefield(BEARS, { label: 'bears' })
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(PHASE_GUARD, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(target);
    settle(g);
    return g;
  };

  test('the Seraph is on the battlefield and its partner phased out: the Seraph has no grant meanwhile', () => {
    const g = phased('bears');
    expect(g.object('bears').zone).toBe('phased');
    expect(hasDiesReturn(g, 'seraph')).toBe(false);
    g.expect.invariants();
  });

  test('the partner dies while the Seraph is phased out: it has no grant, so nothing triggers', () => {
    const g = phased('seraph');
    expect(g.object('seraph').zone).toBe('phased');
    expect(hasDiesReturn(g, 'bears')).toBe(false);
    g.act(0).cast(BOLT, { targets: ['bears'], pay: true });
    settle(g);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    expect(g.state.stack).toEqual([]);
    // The pair ended with the partner's death (it left the battlefield): the Seraph phases in unpaired.
    g.expect.invariants();
  });

  test('the Seraph dies while its partner is phased out: it has no grant (the pair is inactive)', () => {
    const g = phased('bears');
    g.act(0).cast(MURDER, { targets: ['seraph'], pay: true });
    settle(g);
    g.expect.zone(SERAPH, 'graveyard', { seat: 0 });
    expect(g.state.stack).toEqual([]);
  });

  test("both phase in again at its controller's untap step: the pair is back and gives again", () => {
    const g = phased('bears');
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    expect(g.object('bears').zone).toBe('battlefield');
    g.expect.paired('seraph', 'bears');
    expect(hasDiesReturn(g, 'seraph')).toBe(true);
    expect(hasDiesReturn(g, 'bears')).toBe(true);
  });
});
