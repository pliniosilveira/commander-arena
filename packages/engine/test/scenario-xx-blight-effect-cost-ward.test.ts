// "Blight N" outside the cost of an activated ability (Lorwyn Eclipsed): as an instruction ("draw a card and blight 1"), as the optional additional cost of a spell ("you may blight
// 1", read by "if this spell's additional cost was paid") and as the cost of Ward ("Ward—Blight 2"). All three cards here are SYNTHETIC; the real ones are played in
// packages/cards/test/convert-grammar-engine-blight-curse.test.ts.
// Pins: CR 701.68a (to blight N is to put N -1/-1 counters on a creature you control; the player chooses it), CR 701.68b (a player who can't can't choose to blight, so it is not
// asked and a cost is not paid), CR 118.8 and 601.2b (an additional cost is paid as the spell is cast; the optional one may be declined), CR 608.2c (an instruction that depends on how
// the spell was cast), CR 702.21a and 118.12a (Ward: counter the spell or ability unless its controller pays), CR 733 (cancel rewinds the cast), CR 122.6 and 101.2 (a creature that
// can't have the counters is no choice), CR 614.1a (a replacement effect of counters put on a permanent applies).
import { describe, expect, test } from 'vitest';
import type { Ability, Cost, Effect } from '../src/index';
import { isFeatureSupported, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';
import { choosePermanentDecision, confirmOptionalDecision } from './pending-helpers';

const NOTE = 'SYNTHETIC Blight Note'; // 0/4: "At the beginning of your end step, draw a card and blight 1."
const SPELL = 'SYNTHETIC Blight Study'; // sorcery: "you may blight 1"; draw two cards if it was paid, otherwise one
const CANTRIP = 'SYNTHETIC Blight Cantrip'; // sorcery: "Draw a card. Blight 1."
const WARDEN = 'SYNTHETIC Blight Warden'; // 2/2: "Ward—Blight 2."
const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4
const ELVES = 'Llanowar Elves'; // 1/1
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

const blightCost = (optional: boolean): Cost =>
  optional ? { kind: 'blight', count: 1, optional: true } : { kind: 'blight', count: 2 };

const draw = (count: number): Effect => ({ kind: 'draw', player: { kind: 'you' }, count });

const note = singleFaceCard({
  name: NOTE,
  manaCost: ['1', 'B'],
  types: ['creature'],
  subtypes: ['Treefolk'],
  colors: ['B'],
  colorIdentity: ['B'],
  power: 0,
  toughness: 4,
  oracleText: 'At the beginning of your end step, draw a card and blight 1.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'endStep', whose: 'you' },
      effect: { kind: 'sequence', effects: [draw(1), { kind: 'blight', count: 1 }] },
    },
  ],
});

const study = singleFaceCard({
  name: SPELL,
  manaCost: ['1', 'R'],
  types: ['sorcery'],
  colors: ['R'],
  colorIdentity: ['R'],
  oracleText:
    "As an additional cost to cast this spell, you may blight 1. Draw a card. If this spell's additional cost was paid, draw two cards instead.",
  additionalCosts: [blightCost(true)],
  spell: {
    effect: {
      kind: 'conditional',
      condition: { kind: 'additionalCostPaid' },
      effect: draw(2),
      else: draw(1),
    },
  },
});

const cantrip = singleFaceCard({
  name: CANTRIP,
  manaCost: ['1', 'B'],
  types: ['sorcery'],
  colors: ['B'],
  colorIdentity: ['B'],
  oracleText: 'Draw a card. Blight 1.',
  spell: { effect: { kind: 'sequence', effects: [draw(1), { kind: 'blight', count: 1 }] } },
});

const wardAbility: Ability = {
  kind: 'keyword',
  keyword: { kind: 'ward', cost: [blightCost(false)] },
};
const warden = singleFaceCard({
  name: WARDEN,
  manaCost: ['1', 'G'],
  types: ['creature'],
  subtypes: ['Bear'],
  colors: ['G'],
  colorIdentity: ['G'],
  power: 2,
  toughness: 2,
  oracleText: 'Ward—Blight 2.',
  abilities: [wardAbility],
});

describe('the cards are valid and the features are supported', () => {
  test.each([note, study, warden, cantrip])('$name', (card) => {
    expect(validateCard(card)).toEqual([]);
  });
  test.each([
    'effect:blight',
    'condition:additionalCostPaid',
    'ability:optionalBlight',
    'cost:blight',
  ] as const)('%s', (ref) => {
    expect(isFeatureSupported(ref)).toBe(true);
  });
});

describe('"Draw a card and blight 1." as an instruction (CR 701.68a)', () => {
  /** Seat 0 has the Note and `mine`; their end step comes next. */
  function start(...mine: readonly string[]) {
    return scenario()
      .define(note)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(NOTE, ...mine)
      .seat(1)
      .library(...LIBRARY)
      .at('postcombatMain', { active: 0, turn: 3 })
      .build();
  }

  test('with one creature that can take the counter (only the Note itself) it is chosen by the engine, and said so', () => {
    const g = start();
    const mark = g.mark();
    g.advanceTo('end');
    g.passAll();
    const events = g.eventsSince(mark);
    expect(events).toContainEqual(
      expect.objectContaining({ kind: 'permanentsChosen', purpose: 'blight', automatic: true }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ kind: 'counterAdded', counter: '-1/-1', count: 1 }),
    );
    g.expect.counters(NOTE, { '-1/-1': 1 });
    g.expect.pt(NOTE, -1, 3);
    g.expect.invariants();
  });

  test('with several creatures the controller chooses (not a cost, so no cancel) and only that one gets the counter', () => {
    const g = start(SPIDER, ELVES);
    g.advanceTo('end');
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    const d = choosePermanentDecision(g);
    expect(d.purpose).toBe('blight');
    expect(d.forCost).toBeUndefined();
    expect(d.min).toBe(1);
    expect(d.max).toBe(1);
    expect([...d.legal].sort()).toEqual([g.id(NOTE), g.id(SPIDER), g.id(ELVES)].sort());
    g.act(0).choosePermanents(SPIDER);
    g.expect.counters(SPIDER, { '-1/-1': 1 });
    g.expect.counters(NOTE, {});
    g.expect.counters(ELVES, {});
    g.expect.invariants();
  });

  test('a creature with 1 toughness that is chosen dies as a state-based action (CR 704.5f)', () => {
    const g = start(ELVES, SPIDER);
    g.advanceTo('end');
    g.passAll();
    g.act(0).choosePermanents(ELVES);
    g.expect.zone(ELVES, 'graveyard', { seat: 0 });
  });

  test('the creatures of the opponent are not choices (CR 701.68a: a creature you control)', () => {
    const g = scenario()
      .define(note)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(NOTE, SPIDER)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .at('postcombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('end');
    g.passAll();
    const d = choosePermanentDecision(g);
    expect(d.legal).not.toContain(g.id(BEARS));
  });

  test('with no creature that can take the counter (CR 701.68b) the instruction does nothing, and the rest of the spell is done', () => {
    const g = scenario()
      .define(cantrip)
      .seat(0)
      .hand(CANTRIP)
      .library(...LIBRARY)
      .battlefield('Swamp', { count: 2 })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    const before = g.state.seats[0]?.hand.length ?? 0;
    const mark = g.mark();
    g.act(0).cast(CANTRIP, { pay: true });
    g.passAll();
    expect(g.state.seats[0]?.hand.length).toBe(before - 1 + 1);
    expect(g.eventsSince(mark)).not.toContainEqual(
      expect.objectContaining({ kind: 'counterAdded' }),
    );
    g.expect.counters(BEARS, {});
    g.expect.pending('priority', 0);
  });
});

describe('"As an additional cost to cast this spell, you may blight 1." (CR 118.8, 701.68a)', () => {
  function start(...mine: readonly string[]) {
    return scenario()
      .define(study)
      .seat(0)
      .hand(SPELL, { label: 'study' })
      .library(...LIBRARY)
      .battlefield('Mountain', { count: 2 })
      .battlefield(...mine)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
  }
  const handSize = (g: ReturnType<typeof start>) => g.state.seats[0]?.hand.length ?? 0;

  test('after the mana is paid the caster is asked, with a choice of none; the creature chosen gets the counter and the spell draws more', () => {
    const g = start(SPIDER, ELVES);
    const before = handSize(g);
    g.act(0).cast('study', { pay: true });
    g.expect.pending('choosePermanent', 0);
    const d = choosePermanentDecision(g);
    expect(d.purpose).toBe('blight');
    expect(d.forCost).toBe(true);
    expect(d.min).toBe(0);
    expect(d.max).toBe(1);
    g.act(0).choosePermanents(SPIDER);
    g.expect.counters(SPIDER, { '-1/-1': 1 });
    g.expect.tapped({ name: 'Mountain', seat: 0, zone: 'battlefield', nth: 0 }, true);
    g.expect.stack([SPELL]);
    g.passAll();
    // The card cast left the hand (-1), and the spell drew two cards because its additional cost was paid.
    expect(handSize(g)).toBe(before - 1 + 2);
    g.expect.invariants();
  });

  test('choosing none casts the spell without the cost: no counter, and the spell draws the lesser amount', () => {
    const g = start(SPIDER, ELVES);
    const before = handSize(g);
    g.act(0).cast('study', { pay: true });
    g.act(0).choosePermanents();
    g.expect.counters(SPIDER, {});
    g.expect.counters(ELVES, {});
    g.passAll();
    expect(handSize(g)).toBe(before - 1 + 1);
  });

  test('with one creature it is still a question (the cost is optional), and with none the spell is cast at once (CR 701.68b)', () => {
    const one = start(SPIDER);
    one.act(0).cast('study', { pay: true });
    one.expect.pending('choosePermanent', 0);

    const none = start();
    const before = handSize(none);
    none.act(0).cast('study', { pay: true });
    none.expect.stack([SPELL]);
    none.expect.pending('priority', 0);
    none.passAll();
    expect(handSize(none)).toBe(before - 1 + 1);
  });

  test('cancelling at the question rewinds the whole cast (CR 733): the spell is back in the hand, the mana unspent, no counter', () => {
    const g = start(SPIDER, ELVES);
    g.act(0).cast('study', { pay: true });
    g.act(0).cancel();
    g.expect.zone(SPELL, 'hand', { seat: 0 });
    g.expect.counters(SPIDER, {});
    g.expect.tapped({ name: 'Mountain', seat: 0, zone: 'battlefield', nth: 0 }, false);
    g.expect.pending('priority', 0);
  });

  test('a creature that is not offered cannot be answered with (the opponent’s, or one that left)', () => {
    const g = scenario()
      .define(study)
      .seat(0)
      .hand(SPELL, { label: 'study' })
      .library(...LIBRARY)
      .battlefield('Mountain', { count: 2 })
      .battlefield(SPIDER)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast('study', { pay: true });
    const d = choosePermanentDecision(g);
    expect(d.legal).toEqual([g.id(SPIDER)]);
    const before = g.hash();
    const r = g.act(0).try.action({ kind: 'choosePermanents', objects: [g.id(BEARS)] });
    expect(r.ok).toBe(false);
    g.expect.hash(before);
  });

  test('the spell is castable without paying it when it is the only thing in the way: the optional cost is not a requirement', () => {
    const g = start(SPIDER);
    g.act(0).cast('study', { pay: true });
    g.act(0).choosePermanents();
    g.expect.stack([SPELL]);
  });
});

describe('"Ward—Blight 2." (CR 702.21a, 118.12a, 701.68a, 701.68b)', () => {
  /** Seat 0 holds a Bolt and Mountains, and controls `mine`; seat 1 has the Warden. */
  function start(...mine: readonly string[]) {
    return scenario()
      .define(warden)
      .seat(0)
      .hand(BOLT, { label: 'bolt' })
      .library(...LIBRARY)
      .battlefield('Mountain', { count: 2 })
      .battlefield(...mine)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(WARDEN)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
  }

  test('the question names the cost, and with one creature to take the counters accepting puts both on it; the spell resolves', () => {
    const g = start(SPIDER);
    g.act(0).cast('bolt', { targets: [WARDEN], pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    const d = confirmOptionalDecision(g);
    expect(d.purpose).toBe('ward');
    expect(d.cost).toEqual([{ kind: 'blight', count: 2 }]);
    const mark = g.mark();
    g.act(0).accept();
    const events = g.eventsSince(mark);
    expect(events).toContainEqual(
      expect.objectContaining({ kind: 'permanentsChosen', purpose: 'blight', automatic: true }),
    );
    g.expect.counters(SPIDER, { '-1/-1': 2 });
    g.expect.noEvent({ kind: 'countered' });
    g.expect.stack([BOLT]);
    g.passAll();
    g.expect.zone(WARDEN, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('with several creatures the payer who accepted chooses which gets the counters', () => {
    const g = start(SPIDER, ELVES);
    g.act(0).cast('bolt', { targets: [WARDEN], pay: true });
    g.passAll();
    g.act(0).accept();
    g.expect.pending('choosePermanent', 0);
    const d = choosePermanentDecision(g);
    expect(d.purpose).toBe('blight');
    expect([...d.legal].sort()).toEqual([g.id(SPIDER), g.id(ELVES)].sort());
    g.act(0).choosePermanents(SPIDER);
    g.expect.counters(SPIDER, { '-1/-1': 2 });
    g.expect.counters(ELVES, {});
    g.expect.stack([BOLT]);
    g.passAll();
    g.expect.zone(WARDEN, 'graveyard', { seat: 1 });
  });

  test('declining counters the spell and nothing is blighted', () => {
    const g = start(SPIDER, ELVES);
    g.act(0).cast('bolt', { targets: [WARDEN], pay: true });
    g.passAll();
    g.act(0).decline();
    g.expect.stack([]);
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    g.expect.zone(WARDEN, 'battlefield', { seat: 1 });
    g.expect.counters(SPIDER, {});
    g.expect.counters(ELVES, {});
  });

  test('a player with no creature cannot pay (CR 701.68b, 118.3): nobody is asked and the spell is countered', () => {
    const g = start();
    const mark = g.mark();
    g.act(0).cast('bolt', { targets: [WARDEN], pay: true });
    g.passAll();
    expect(g.eventsSince(mark)).toContainEqual(expect.objectContaining({ kind: 'countered' }));
    g.expect.stack([]);
    g.expect.zone(WARDEN, 'battlefield', { seat: 1 });
    g.expect.pending('priority', 0);
  });
});

describe('a replacement effect of counters put on a permanent applies to the counters of a blight instruction (CR 614.1a)', () => {
  const PLUS = 'SYNTHETIC Blight Amplifier';
  const amplifier = singleFaceCard({
    name: PLUS,
    manaCost: ['2', 'B'],
    types: ['enchantment'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText:
      'If one or more -1/-1 counters would be put on a creature you control, that many plus one -1/-1 counters are put on it instead.',
    abilities: [
      {
        kind: 'replacement',
        replacement: {
          kind: 'countersPlus',
          what: { types: ['creature'], controller: 'you' },
          counter: '-1/-1',
          extra: 1,
        },
      },
    ],
  });

  test('one counter of the instruction becomes two', () => {
    const g = scenario()
      .define(amplifier)
      .define(cantrip)
      .seat(0)
      .hand(CANTRIP)
      .library(...LIBRARY)
      .battlefield('Swamp', { count: 2 })
      .battlefield(SPIDER, PLUS)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(CANTRIP, { pay: true });
    g.passAll();
    g.expect.counters(SPIDER, { '-1/-1': 2 });
  });
});

describe('what validateCard refuses', () => {
  const issues = (face: Partial<Parameters<typeof singleFaceCard>[0]>) =>
    validateCard(
      singleFaceCard({
        name: 'SYNTHETIC Refused',
        manaCost: ['R'],
        types: ['sorcery'],
        colors: ['R'],
        colorIdentity: ['R'],
        oracleText: 'x',
        ...face,
      }),
    ).map((i) => i.message);

  test('a blight that is a mandatory additional cost of a spell', () => {
    expect(
      issues({ additionalCosts: [{ kind: 'blight', count: 1 }], spell: { effect: draw(1) } }),
    ).toEqual([expect.stringContaining('optional')]);
  });

  test('the condition without an optional blight cost', () => {
    expect(
      issues({
        spell: {
          effect: {
            kind: 'conditional',
            condition: { kind: 'additionalCostPaid' },
            effect: draw(2),
          },
        },
      }),
    ).toEqual([expect.stringContaining('additionalCostPaid')]);
  });

  test('an optional blight in the cost of an activated ability and in the cost of Ward', () => {
    const activated = issues({
      types: ['artifact'],
      abilities: [
        {
          kind: 'activated',
          cost: [{ kind: 'blight', count: 1, optional: true }],
          effect: draw(1),
        },
      ],
    });
    expect(activated).toEqual([expect.stringContaining('optional blight')]);
    const ward = issues({
      types: ['creature'],
      power: 1,
      toughness: 1,
      abilities: [
        {
          kind: 'keyword',
          keyword: { kind: 'ward', cost: [{ kind: 'blight', count: 1, optional: true }] },
        },
      ],
    });
    expect(ward).toEqual([expect.stringContaining('optional blight')]);
  });

  test('Ward whose blight is combined with another cost, and a blight of no counters', () => {
    const ward = issues({
      types: ['creature'],
      power: 1,
      toughness: 1,
      abilities: [
        {
          kind: 'keyword',
          keyword: {
            kind: 'ward',
            cost: [
              { kind: 'mana', symbols: ['1'] },
              { kind: 'blight', count: 1 },
            ],
          },
        },
      ],
    });
    expect(ward).toEqual([expect.stringContaining('only cost')]);
    expect(issues({ spell: { effect: { kind: 'blight', count: 0 } } })).toEqual([
      expect.stringContaining('positive'),
    ]);
  });
});
