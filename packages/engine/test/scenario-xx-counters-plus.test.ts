// "If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead." (the Quandrix Unlimited deck, group A;
// Hardened Scales and the cards like it): the replacement effect `countersPlus`.
// Pins: CR 614.1a (a replacement effect with "instead"), CR 122.6 (counters put on an object: by an effect and as it enters), CR 614.5 (each effect applies once to one
// event, so two of them add up), CR 614.12 (an entering permanent as it would be on the battlefield), CR 701.34a (proliferate), CR 701.50a (connive), CR 101.2 (a
// permanent that can't have the counters gets none, so nothing is replaced), CR 613.1f (a permanent that lost its abilities replaces nothing). Every place that puts a
// +1/+1 counter asks one function (`rules/counter-bonus.ts`): one test for each. Cards are SYNTHETIC (src/cards/fixtures/synthetic-counters-plus.ts and others) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const SCALES = 'SYNTHETIC Growth Scales'; // creatures you control: that many plus one
const SCALES_TWO = 'SYNTHETIC Growth Scales Two'; // that many plus two
const OTHER = 'SYNTHETIC Other Scales'; // another creature you control (a creature itself)
const ANY = 'SYNTHETIC Any Scales'; // a permanent you control
const ARTIFACT = 'SYNTHETIC Artifact Scales'; // an artifact or creature you control
const NO_GROWTH = 'SYNTHETIC Growth Ward'; // creatures you control can't have +1/+1 counters
const BOON = 'SYNTHETIC Counter Boon'; // instant: two +1/+1 counters on target creature
const BOON_CARD = { name: BOON, zone: 'hand', nth: 0 } as const;
const GROWER = 'SYNTHETIC Grower'; // enters with two +1/+1 counters
const CHIEF = 'SYNTHETIC Chief Angel'; // each other Angel you control enters with +1/+1 counters
const ANGEL_CALLER = 'SYNTHETIC Angel Caller'; // creates a 1/1 Angel token
const SPREAD = 'SYNTHETIC Spreading Growth'; // proliferate
const CONNIVER = 'SYNTHETIC Conniver';
const FROG = 'SYNTHETIC Frog Hex'; // target creature loses all abilities until end of turn
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';
const LIB = Array.from({ length: 10 }, () => 'Plains');

const plus = (g: ScenarioGame, label: string): number | undefined =>
  g.object(label).counters['+1/+1'];

describe('the cards are valid', () => {
  test.each([SCALES, SCALES_TWO, OTHER, ANY, ARTIFACT])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('the shapes that are refused: no counter name, no extra counters, a permanent that is not on the battlefield yet', () => {
    const card = syntheticCard(SCALES);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const withRule = (rule: Record<string, unknown>) =>
      ({
        ...card,
        faces: [{ ...face, abilities: [{ kind: 'replacement', replacement: rule }] }],
      }) as never;
    const what = { types: ['creature'], controller: 'you' };
    const ok = { kind: 'countersPlus', what, counter: '+1/+1', extra: 1 };
    expect(validateCard(withRule(ok))).toEqual([]);
    expect(validateCard(withRule({ ...ok, counter: '' }))).not.toEqual([]);
    expect(validateCard(withRule({ ...ok, extra: 0 }))).not.toEqual([]);
    expect(validateCard(withRule({ ...ok, extra: 1.5 }))).not.toEqual([]);
    expect(validateCard(withRule({ ...ok, what: { ...what, zone: 'graveyard' } }))).not.toEqual([]);
  });
});

describe('an effect that puts counters (addCounters, CR 614.1a, 122.6)', () => {
  const board = (...extra: string[]) =>
    scenario()
      .seat(0)
      .library(...LIB)
      .hand(BOON, BOON)
      .battlefield('Forest', 'Forest')
      .battlefield(...extra)
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LIB)
      .battlefield(BEARS, { label: 'theirs' })
      .build();

  test('two counters become three on my creature, and the event says three', () => {
    const g = board(SCALES);
    const mark = g.mark();
    g.act(0).cast(BOON_CARD, { targets: ['mine'], pay: true });
    g.passAll();
    expect(plus(g, 'mine')).toBe(3);
    g.expect.pt('mine', 5, 5);
    g.expect.eventLog([{ kind: 'counterAdded', counter: '+1/+1', count: 3 }], { since: mark });
    g.expect.invariants();
  });

  test('the baseline: without the permanent two counters are put on', () => {
    const g = board();
    g.act(0).cast(BOON_CARD, { targets: ['mine'], pay: true });
    g.passAll();
    expect(plus(g, 'mine')).toBe(2);
  });

  test("my opponent's creature is not replaced (the ability is for the creatures of its controller)", () => {
    const g = board(SCALES);
    g.act(0).cast(BOON_CARD, { targets: ['theirs'], pay: true });
    g.passAll();
    expect(plus(g, 'theirs')).toBe(2);
  });

  test('an opponent who controls the permanent gets the bonus for their creature, not for mine', () => {
    const g = scenario()
      .seat(0)
      .library(...LIB)
      .hand(BOON)
      .battlefield('Forest')
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LIB)
      .battlefield(SCALES)
      .build();
    g.act(0).cast(BOON_CARD, { targets: ['mine'], pay: true });
    g.passAll();
    expect(plus(g, 'mine')).toBe(2);
  });

  test('two of them each apply once and add up (CR 614.5): two counters become four', () => {
    const g = board(SCALES, SCALES);
    g.act(0).cast(BOON_CARD, { targets: ['mine'], pay: true });
    g.passAll();
    expect(plus(g, 'mine')).toBe(4);
  });

  test('the extra number is the one the card says: plus two', () => {
    const g = board(SCALES_TWO);
    g.act(0).cast(BOON_CARD, { targets: ['mine'], pay: true });
    g.passAll();
    expect(plus(g, 'mine')).toBe(4);
  });

  test("a creature that can't have +1/+1 counters gets none: nothing is replaced (CR 101.2)", () => {
    const g = board(SCALES, NO_GROWTH);
    const mark = g.mark();
    g.act(0).cast(BOON_CARD, { targets: ['mine'], pay: true });
    g.passAll();
    expect(plus(g, 'mine')).toBeUndefined();
    g.expect.noEvent({ kind: 'counterAdded' }, { since: mark });
  });

  test('it only changes the kind it names: a -1/-1 counter is put on as it is', () => {
    const g = scenario()
      .seat(0)
      .library(...LIB)
      .hand('SYNTHETIC Rot Boon')
      .battlefield('Swamp')
      .battlefield(SCALES)
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LIB)
      .build();
    g.act(0).cast('SYNTHETIC Rot Boon', { targets: ['mine'], pay: true });
    g.passAll();
    expect(g.object('mine').counters['-1/-1']).toBe(1);
    expect(plus(g, 'mine')).toBeUndefined();
  });

  test('a permanent that lost all abilities replaces nothing (CR 613.1f)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIB)
      .hand(BOON, FROG)
      .battlefield('Forest', 'Forest', 'Island')
      .battlefield(OTHER, { label: 'scales' })
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LIB)
      .build();
    g.act(0).cast(FROG, { targets: ['scales'], pay: true });
    g.passAll();
    g.act(0).cast(BOON_CARD, { targets: ['mine'], pay: true });
    g.passAll();
    expect(plus(g, 'mine')).toBe(2);
  });
});

describe('what the permanent names', () => {
  test('"another creature": the permanent itself gets no more, another creature does', () => {
    const g = scenario()
      .seat(0)
      .library(...LIB)
      .hand(BOON, BOON)
      .battlefield('Forest', 'Forest')
      .battlefield(OTHER, { label: 'hydra' })
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LIB)
      .build();
    g.act(0).cast(BOON_CARD, { targets: ['hydra'], pay: true });
    g.passAll();
    expect(plus(g, 'hydra')).toBe(2);
    g.act(0).cast(BOON_CARD, { targets: ['mine'], pay: true });
    g.passAll();
    expect(plus(g, 'mine')).toBe(3);
  });

  test('"a permanent you control" and "an artifact or creature you control": a creature is one of them', () => {
    for (const card of [ANY, ARTIFACT]) {
      const g = scenario()
        .seat(0)
        .library(...LIB)
        .hand(BOON)
        .battlefield('Forest')
        .battlefield(card)
        .battlefield(BEARS, { label: 'mine' })
        .seat(1)
        .library(...LIB)
        .build();
      g.act(0).cast(BOON_CARD, { targets: ['mine'], pay: true });
      g.passAll();
      expect(plus(g, 'mine'), card).toBe(3);
    }
  });
});

describe('the other ways +1/+1 counters are put on a creature', () => {
  test('proliferate: the one counter becomes two', () => {
    const g = scenario()
      .seat(0)
      .library(...LIB)
      .hand(SPREAD)
      .battlefield('Forest')
      .battlefield(SCALES)
      .battlefield(BEARS, { label: 'grown', counters: { '+1/+1': 1 } })
      .seat(1)
      .library(...LIB)
      .build();
    g.act(0).cast(SPREAD, { pay: true });
    g.passAll();
    g.act(0).choosePermanents('grown');
    expect(plus(g, 'grown')).toBe(3);
  });

  test('connive: the creature gets two counters for one', () => {
    const g = scenario()
      .seat(0)
      .library(...LIB)
      .hand(CONNIVER, BOLT)
      .battlefield('Island', 'Island')
      .battlefield(SCALES)
      .battlefield(BEARS, { label: 'mine' })
      .build();
    g.act(0).cast(CONNIVER, { targets: ['mine'], pay: true });
    g.passAll();
    g.act(0).chooseCards({ name: BOLT, zone: 'hand', nth: 0 });
    expect(plus(g, 'mine')).toBe(2);
  });

  test('a creature that enters with counters (CR 614.12): two become three, and the event says so', () => {
    const g = scenario()
      .seat(0)
      .hand(GROWER)
      .battlefield('Forest', 'Forest', 'Forest')
      .battlefield(SCALES)
      .build();
    const mark = g.mark();
    g.act(0).cast(GROWER, { pay: true });
    g.passAll();
    expect(g.object({ name: GROWER, zone: 'battlefield' }).counters['+1/+1']).toBe(3);
    g.expect.pt(GROWER, 5, 5);
    g.expect.eventLog([{ kind: 'counterAdded', counter: '+1/+1', count: 3 }], { since: mark });
  });

  test('a token that enters with a counter another permanent gives it (Chief Angel): one becomes two', () => {
    const g = scenario()
      .seat(0)
      .hand(ANGEL_CALLER)
      .battlefield('Plains')
      .battlefield(CHIEF)
      .battlefield(SCALES)
      .build();
    g.act(0).cast(ANGEL_CALLER, { pay: true });
    g.passAll();
    expect(g.object({ name: 'Angel', zone: 'battlefield' }).counters['+1/+1']).toBe(2);
  });

  test('a creature that enters with no +1/+1 counters gets none: no counters are no event', () => {
    const g = scenario()
      .seat(0)
      .hand(ANGEL_CALLER)
      .battlefield('Plains')
      .battlefield(SCALES)
      .build();
    g.act(0).cast(ANGEL_CALLER, { pay: true });
    g.passAll();
    expect(g.object({ name: 'Angel', zone: 'battlefield' }).counters['+1/+1']).toBeUndefined();
  });

  test('"another creature": a creature that enters with counters is another creature, so it gets one more', () => {
    const g = scenario()
      .seat(0)
      .hand(GROWER)
      .battlefield('Forest', 'Forest', 'Forest')
      .battlefield(OTHER)
      .build();
    g.act(0).cast(GROWER, { pay: true });
    g.passAll();
    expect(g.object({ name: GROWER, zone: 'battlefield' }).counters['+1/+1']).toBe(3);
  });
});
