// "When this creature enters, you may exile up to three other target creatures from the battlefield and/or creature cards from graveyards. When this creature leaves
// the battlefield, return the exiled cards to their owners' hands." (D-270): a target slot of two zones, and the cards of a linked exile returned to hand.
// Pins: CR 115.1 and 115.2 (a spell or ability may say it can target an object in another zone: one slot may name permanents and cards of graveyards), CR 601.2c
// and 603.3d (a variable number of targets is announced as the triggered ability is put on the stack), CR 115.6 (an ability that requires targets may allow zero),
// CR 603.5 ("you may" is asked as the ability resolves), CR 608.2b (a target that is no longer in the zone it was in is illegal and is not affected), CR 702.11b (hexproof is
// a permanent's), CR 607.2a (linked abilities: the leaves trigger returns the cards the enters trigger exiled, all of them), CR 400.3 (a card goes to its owner's hand),
// CR 400.7 (a permanent that left is a new object and has exiled nothing), CR 111.7 (a token that left the battlefield ceases to exist).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-cross-zone.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { targetAnswerError } from '../src/rules/target-choice';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { targetsDecision } from './pending-helpers';

const BANISHER = 'SYNTHETIC Linked Banisher';
const MANDATORY = 'SYNTHETIC Mandatory Banisher';
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const HEXPROOF = 'SYNTHETIC Hexproof Bear';
const MURDER = 'Murder';
const UNSUMMON = 'Unsummon';
const ISLANDS = ['Island', 'Island'] as const;
const TOKENMAKER = 'SYNTHETIC Landfall Tokenmaker';
const BANISHER_ABILITY = (name: string) => `${name} (ability)`;
const PLAINS6 = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;
const SWAMPS = ['Swamp', 'Swamp', 'Swamp'] as const;
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

describe('the cards are valid', () => {
  test.each([BANISHER, MANDATORY])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('a slot of two zones is read only by exile, in a triggered ability with no modes', () => {
    const card = syntheticCard(BANISHER);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const trigger = face.abilities.find((a) => a.kind === 'triggered');
    if (trigger?.kind !== 'triggered') throw new Error('no trigger');
    const withEffect = (effect: unknown) => ({
      ...card,
      faces: [
        {
          ...face,
          abilities: [{ ...trigger, effect }, ...face.abilities.filter((a) => a !== trigger)],
        },
      ],
    });
    // Another effect naming the slot: it would have to say what it does to a card in a graveyard.
    // biome-ignore lint/suspicious/noExplicitAny: a deliberately malformed card for the validator
    const destroy = withEffect({ kind: 'destroy', objects: { kind: 'target', id: 't1' } }) as any;
    expect(validateCard(destroy).map((i) => i.message)).toContainEqual(
      expect.stringContaining('is read only by exile'),
    );
    // An exile of it inside a sequence with another effect that names it too.
    const both = withEffect({
      kind: 'sequence',
      effects: [
        { kind: 'exile', objects: { kind: 'target', id: 't1' }, linked: true },
        { kind: 'moveToZone', objects: { kind: 'target', id: 't1' }, to: 'hand' },
      ],
      // biome-ignore lint/suspicious/noExplicitAny: a deliberately malformed card for the validator
    }) as any;
    expect(validateCard(both).map((i) => i.message)).toContainEqual(
      expect.stringContaining('is read only by exile'),
    );
    // A slot of two zones on a spell, on an activated ability, or with a divide or onePerOpponent: refused.
    const slot = trigger.targets?.[0];
    if (slot === undefined) throw new Error('no slot');
    const onSpell = {
      ...card,
      faces: [
        {
          ...face,
          types: ['instant'],
          power: null,
          toughness: null,
          abilities: [],
          spell: {
            targets: [slot],
            effect: { kind: 'exile', objects: { kind: 'target', id: 't1' } },
          },
        },
      ],
      // biome-ignore lint/suspicious/noExplicitAny: a deliberately malformed card for the validator
    } as any;
    expect(validateCard(onSpell).map((i) => i.message)).toContainEqual(
      expect.stringContaining('only in a triggered ability of a permanent'),
    );
    const activated = {
      ...card,
      faces: [
        {
          ...face,
          abilities: [
            {
              kind: 'activated',
              cost: [{ kind: 'tap' }],
              targets: [slot],
              effect: { kind: 'exile', objects: { kind: 'target', id: 't1' } },
            },
          ],
        },
      ],
      // biome-ignore lint/suspicious/noExplicitAny: a deliberately malformed card for the validator
    } as any;
    expect(validateCard(activated).map((i) => i.message)).toContainEqual(
      expect.stringContaining('only in a triggered ability of a permanent'),
    );
    const divided = {
      ...card,
      faces: [
        {
          ...face,
          abilities: [{ ...trigger, targets: [{ ...slot, onePerOpponent: true }] }],
        },
      ],
      // biome-ignore lint/suspicious/noExplicitAny: a deliberately malformed card for the validator
    } as any;
    expect(validateCard(divided).map((i) => i.message)).toContainEqual(
      expect.stringContaining('takes a count (min and max)'),
    );
  });

  test('"other" is read only where the source is on the battlefield as the targets are chosen (CR 115.1, 115.2)', () => {
    const card = syntheticCard(BANISHER);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const trigger = face.abilities.find((a) => a.kind === 'triggered');
    if (trigger?.kind !== 'triggered') throw new Error('no trigger');
    const on = (t: unknown, extra: object = {}) =>
      ({
        ...card,
        faces: [{ ...face, abilities: [{ ...trigger, trigger: t, ...extra }] }],
        // biome-ignore lint/suspicious/noExplicitAny: a deliberately malformed card for the validator
      }) as any;
    const refused = expect.stringContaining('says "other"');
    // The source is a card of a graveyard (or in exile) when its look-back trigger chooses targets: it would be a legal target the text leaves out.
    for (const t of [
      { kind: 'dies', what: { kind: 'this' } },
      { kind: 'leavesBattlefield', what: { kind: 'this' } },
      { kind: 'cycled' },
    ]) {
      expect(
        validateCard(on(t)).map((i) => i.message),
        t.kind,
      ).toContainEqual(refused);
    }
    // An ability that works from the graveyard has its source there.
    expect(
      validateCard(on({ kind: 'upkeep', whose: 'you' }, { functionsIn: 'graveyard' })).map(
        (i) => i.message,
      ),
    ).toContainEqual(refused);
    // The source is on the battlefield: entering, attacking, a step.
    for (const t of [
      { kind: 'entersBattlefield', what: { kind: 'this' } },
      { kind: 'attacks', what: { kind: 'this' } },
      { kind: 'upkeep', whose: 'you' },
      { kind: 'endStep', whose: 'each' },
      { kind: 'step', step: 'draw', whose: 'you' },
    ]) {
      expect(
        validateCard(on(t)).map((i) => i.message),
        t.kind,
      ).not.toContainEqual(refused);
    }
    // Without "other" the source may be a target, so any trigger is read.
    const slot = trigger.targets?.[0];
    if (slot?.what.kind !== 'objectOrGraveyardCard') throw new Error('no cross-zone slot');
    const plain = on(
      { kind: 'dies', what: { kind: 'this' } },
      { targets: [{ ...slot, what: { ...slot.what, filter: { types: ['creature'] } } }] },
    );
    expect(validateCard(plain).map((i) => i.message)).not.toContainEqual(refused);
  });

  test('the card half is a card of any graveyard, the permanent half is on the battlefield', () => {
    const card = syntheticCard(BANISHER);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const trigger = face.abilities.find((a) => a.kind === 'triggered');
    if (trigger?.kind !== 'triggered') throw new Error('no trigger');
    const slot = trigger.targets?.[0];
    if (slot?.what.kind !== 'objectOrGraveyardCard') throw new Error('no cross-zone slot');
    const bad = (what: unknown) =>
      ({
        ...card,
        faces: [{ ...face, abilities: [{ ...trigger, targets: [{ ...slot, what }] }] }],
        // biome-ignore lint/suspicious/noExplicitAny: a deliberately malformed card for the validator
      }) as any;
    const wrongZone = bad({ ...slot.what, card: { zone: 'exile', types: ['creature'] } });
    expect(validateCard(wrongZone).map((i) => i.message)).toContainEqual(
      expect.stringContaining('zone "graveyard"'),
    );
    const noZone = bad({ ...slot.what, card: { types: ['creature'] } });
    expect(validateCard(noZone).map((i) => i.message)).toContainEqual(
      expect.stringContaining('zone "graveyard"'),
    );
    const yours = bad({ ...slot.what, card: { zone: 'graveyard', controller: 'you' } });
    expect(validateCard(yours).map((i) => i.message)).toContainEqual(
      expect.stringContaining('zone "graveyard"'),
    );
    const zoned = bad({ ...slot.what, filter: { types: ['creature'], zone: 'graveyard' } });
    expect(validateCard(zoned).map((i) => i.message)).toContainEqual(
      expect.stringContaining('the permanent half is on the battlefield'),
    );
  });
});

/** Casts the Banisher and lets it resolve: its enters trigger is the next thing to happen (targets are asked). */
function enters(g: ScenarioGame, name = BANISHER) {
  g.act(0).cast(name, { pay: true });
  g.pass();
  g.pass();
  return g;
}

/** Seat 0 has the Banisher and mana; both players have creatures on the battlefield and in the graveyard. */
const board = () =>
  scenario()
    .seat(0)
    .library(...LIBRARY)
    .hand(BANISHER)
    .battlefield(...PLAINS6)
    .battlefield(BEARS, { label: 'myBears' })
    .graveyard(BEARS, { label: 'myDead' })
    .graveyard('Lightning Bolt', { label: 'myBolt' })
    .graveyard('Plains', { label: 'myLand' })
    .seat(1)
    .library(...LIBRARY)
    .battlefield(SPIDER, { label: 'theirSpider' })
    .battlefield('Sol Ring', { label: 'theirRing' })
    .graveyard('Serra Angel', { label: 'theirDead' })
    .graveyard('Counterspell', { label: 'theirSpell' })
    .build();

describe('the slot: up to three other targets, on the battlefield or in a graveyard', () => {
  test('the decision offers every other creature and every creature card of both graveyards, up to three, none needed', () => {
    const g = enters(board());
    g.expect.pending('targets', 0);
    g.expect.stack([BANISHER_ABILITY(BANISHER)]);
    const d = targetsDecision(g);
    expect(d.specs).toHaveLength(1);
    expect(d.specs[0]).toMatchObject({ specId: 't1', min: 0, max: 3 });
    const legal = (d.specs[0]?.legal ?? []).map((t) => (t.kind === 'object' ? t.id : -1));
    expect([...legal].sort()).toEqual(
      [g.id('myBears'), g.id('theirSpider'), g.id('myDead'), g.id('theirDead')].sort(),
    );
    // Not the Banisher itself ("other"), not a noncreature permanent, not a noncreature card of a graveyard.
    for (const name of ['theirRing', 'myBolt', 'myLand', 'theirSpell']) {
      expect(legal, name).not.toContain(g.id(name));
    }
    expect(legal).not.toContain(g.id(BANISHER));
    g.expect.invariants();
  });

  test('a creature with hexproof on the battlefield is not offered to an opponent, a card in a graveyard has none to protect it', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(BANISHER)
      .battlefield(...PLAINS6)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(HEXPROOF, { label: 'hex' })
      .battlefield(BEARS, { label: 'bears' })
      .build();
    enters(g);
    const legal = (targetsDecision(g).specs[0]?.legal ?? []).map((t) =>
      t.kind === 'object' ? t.id : -1,
    );
    expect(legal).toEqual([g.id('bears')]);
  });

  test('four targets are refused, three of any mix are allowed, none is allowed', () => {
    const g = enters(board());
    const d = targetsDecision(g);
    const pick = (...names: string[]) =>
      names.map((n) => ({ kind: 'object' as const, id: g.id(n), specId: 't1' }));
    expect(targetAnswerError(d, pick('myBears', 'theirSpider', 'myDead', 'theirDead'))).toMatch(
      /Choose 0 to 3/,
    );
    expect(targetAnswerError(d, pick('myBears', 'myDead', 'theirDead'))).toBeNull();
    expect(targetAnswerError(d, pick('theirSpider'))).toBeNull();
    expect(targetAnswerError(d, [])).toBeNull();
    // The same object twice is refused (CR 601.2c), and a noncreature card of a graveyard is not a legal target.
    expect(targetAnswerError(d, pick('myDead', 'myDead'))).toBe('Targets must be different');
    expect(targetAnswerError(d, pick('myBolt'))).toBe('That is not a legal target');
  });

  test('with nothing else to target, the ability goes on the stack with no target (CR 115.6)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(BANISHER)
      .battlefield(...PLAINS6)
      .seat(1)
      .library(...LIBRARY)
      .build();
    enters(g);
    // No legal target and none needed: the ability goes on the stack with no targets, and nothing is asked.
    g.expect.stack([BANISHER_ABILITY(BANISHER)]);
    g.expect.pending('priority', 0);
    g.pass();
    g.pass();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.zone(BANISHER, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });
});

describe('the enters trigger exiles them, each from the zone it is in', () => {
  test('a creature on the battlefield and a creature card from each graveyard are exiled, each owned by its owner', () => {
    const g = enters(board());
    g.act(0).chooseTargets('theirSpider', 'myDead', 'theirDead');
    g.expect.stack([BANISHER_ABILITY(BANISHER)]);
    g.pass();
    g.pass();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.zone(SPIDER, 'exile', { seat: 1 });
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.zone('Serra Angel', 'exile', { seat: 1 });
    // What was not chosen stays: my own Bears on the battlefield, the noncreature cards, the Banisher.
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone('Lightning Bolt', 'graveyard', { seat: 0 });
    g.expect.zone('Sol Ring', 'battlefield', { seat: 1 });
    g.expect.zone(BANISHER, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('declining the "may" exiles nothing, though the cards became targets', () => {
    const g = enters(board());
    g.act(0).chooseTargets('theirSpider', 'theirDead');
    g.pass();
    g.pass();
    g.act(0).decline();
    g.expect.zone(SPIDER, 'battlefield', { seat: 1 });
    g.expect.zone('Serra Angel', 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('a target that became illegal as the ability resolves is not exiled, the others are (CR 608.2b)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(BANISHER)
      .battlefield(...PLAINS6)
      .seat(1)
      .library(...LIBRARY)
      .hand(MURDER)
      .battlefield(...SWAMPS)
      .battlefield(SPIDER, { label: 'spider' })
      .graveyard('Serra Angel', { label: 'angel' })
      .build();
    enters(g);
    g.act(0).chooseTargets('spider', 'angel');
    g.pass();
    // In response the opponent destroys their own Spider: the card in the graveyard is a new object, no longer the target.
    g.act(1).cast(MURDER, { targets: ['spider'], pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.zone('Serra Angel', 'exile', { seat: 1 });
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });
});

describe("the leaves trigger returns every exiled card to its owner's hand", () => {
  /** The Banisher has exiled these (a creature of each player on the battlefield, a creature card of each graveyard) and now Seat 1 destroys it. */
  function exiledThree(extra?: (b: ReturnType<typeof scenario>) => void) {
    const b = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(BANISHER)
      .battlefield(...PLAINS6)
      .battlefield(BEARS, { label: 'myBears' })
      .graveyard(BEARS, { label: 'myDead' })
      .seat(1)
      .library(...LIBRARY)
      .hand(MURDER)
      .battlefield(...SWAMPS)
      .battlefield(SPIDER, { label: 'theirSpider' })
      .graveyard('Serra Angel', { label: 'theirDead' });
    extra?.(b);
    const g = b.build();
    enters(g);
    g.act(0).chooseTargets('theirSpider', 'myDead', 'theirDead');
    g.pass();
    g.pass();
    g.act(0).accept();
    return g;
  }

  test("when it dies, each card goes to its owner's hand: the Spider and the Angel to the opponent, the Bears card to me", () => {
    const g = exiledThree();
    g.expect.zone(SPIDER, 'exile', { seat: 1 });
    g.pass();
    g.act(1).cast(MURDER, { targets: [BANISHER], pay: true });
    g.passAll();
    g.expect.zone(BANISHER, 'graveyard', { seat: 0 });
    // The leaves trigger is on the stack, then resolves: all three cards, to their owners' hands.
    g.expect.zone(SPIDER, 'hand', { seat: 1 });
    g.expect.zone('Serra Angel', 'hand', { seat: 1 });
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.zone(SPIDER, 'exile', { seat: 1, count: 0 });
    // What I never exiled stays where it was.
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test("when it is returned to its owner's hand the cards come back too (any way of leaving the battlefield)", () => {
    const g = exiledThree((b) =>
      b
        .seat(1)
        .hand(UNSUMMON)
        .battlefield(...ISLANDS),
    );
    g.pass();
    g.act(1).cast(UNSUMMON, { targets: [BANISHER], pay: true });
    g.passAll();
    g.expect.zone(BANISHER, 'hand', { seat: 0 });
    g.expect.zone(SPIDER, 'hand', { seat: 1 });
    g.expect.zone('Serra Angel', 'hand', { seat: 1 });
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test("a creature I control that the opponent owns goes to the opponent's hand, its owner (CR 108.3, 400.3)", () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(BANISHER)
      .battlefield(...PLAINS6)
      .seat(1)
      .library(...LIBRARY)
      .hand(MURDER)
      .battlefield(...SWAMPS)
      .battlefield(SPIDER, { controller: 0, label: 'stolen' })
      .build();
    enters(g);
    g.act(0).chooseTargets('stolen');
    g.pass();
    g.pass();
    g.act(0).accept();
    g.expect.zone(SPIDER, 'exile', { seat: 1 });
    g.pass();
    g.act(1).cast(MURDER, { targets: [BANISHER], pay: true });
    g.passAll();
    g.expect.zone(SPIDER, 'hand', { seat: 1 });
    g.expect.invariants();
  });

  test('a token that was exiled has ceased to exist: nothing is returned for it (CR 111.7)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(BANISHER, 'Forest')
      .battlefield(...PLAINS6)
      .battlefield(TOKENMAKER, { label: 'maker' })
      .seat(1)
      .library(...LIBRARY)
      .hand(MURDER)
      .battlefield(...SWAMPS)
      .build();
    g.act(0).playLand('Forest');
    g.passAll();
    const tokens = g.find({ name: 'Soldier' });
    expect(tokens.length).toBeGreaterThan(0);
    enters(g);
    g.act(0).chooseTargets('Soldier');
    g.pass();
    g.pass();
    g.act(0).accept();
    expect(g.find({ name: 'Soldier' })).toHaveLength(0);
    g.pass();
    g.act(1).cast(MURDER, { targets: [BANISHER], pay: true });
    g.passAll();
    expect(g.find({ name: 'Soldier' })).toHaveLength(0);
    g.expect.invariants();
  });

  test('two Banishers each return only the cards they exiled', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(BANISHER)
      .battlefield(...PLAINS6)
      .battlefield(BANISHER, { label: 'first' })
      .battlefield(BEARS, { label: 'bears' })
      .seat(1)
      .library(...LIBRARY)
      .hand(MURDER)
      .battlefield(...SWAMPS)
      .battlefield(SPIDER, { label: 'spider' })
      .build();
    // The first (placed on the battlefield) exiled nothing; the second exiles the Bears.
    enters(g);
    g.act(0).chooseTargets('bears');
    g.pass();
    g.pass();
    g.act(0).accept();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    // The first one leaves: it exiled nothing, so the Bears stay exiled.
    g.pass();
    g.act(1).cast(MURDER, { targets: ['first'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.zone(SPIDER, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });
});

describe('the Banisher leaves before its enters trigger resolves (CR 607.2a, 400.7)', () => {
  test('the leaves trigger resolves first and returns nothing; the cards the enters trigger exiles afterwards stay exiled', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(BANISHER)
      .battlefield(...PLAINS6)
      .seat(1)
      .library(...LIBRARY)
      .hand(MURDER)
      .battlefield(...SWAMPS)
      .battlefield(SPIDER, { label: 'spider' })
      .graveyard('Serra Angel', { label: 'angel' })
      .build();
    enters(g);
    g.act(0).chooseTargets('spider', 'angel');
    g.pass();
    // In response the opponent destroys the Banisher: its leaves trigger goes above the enters trigger.
    g.act(1).cast(MURDER, { targets: [BANISHER], pay: true });
    g.passAll();
    g.expect.zone(BANISHER, 'graveyard', { seat: 0 });
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    // The permanent that exiled them is gone: nothing remembers them, so nothing ever returns them.
    g.expect.zone(SPIDER, 'exile', { seat: 1 });
    g.expect.zone('Serra Angel', 'exile', { seat: 1 });
    g.passAll();
    g.expect.zone(SPIDER, 'exile', { seat: 1 });
    g.expect.zone('Serra Angel', 'exile', { seat: 1 });
    g.expect.invariants();
  });
});

describe('a Banisher that must exile one target of either zone', () => {
  test("it has exactly one target, of either zone, and the card goes back to its owner's hand when it leaves", () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(MANDATORY)
      .battlefield(...PLAINS6)
      .seat(1)
      .library(...LIBRARY)
      .hand(MURDER)
      .battlefield(...SWAMPS)
      .battlefield(BEARS, { label: 'bears' })
      .graveyard('Serra Angel', { label: 'angel' })
      .build();
    enters(g, MANDATORY);
    g.expect.pending('targets', 0);
    const d = targetsDecision(g);
    expect(d.specs[0]).toMatchObject({ min: 1, max: 1 });
    expect(targetAnswerError(d, [])).toMatch(/Choose 1 to 1/);
    g.act(0).chooseTargets('angel');
    g.pass();
    g.pass();
    g.expect.zone('Serra Angel', 'exile', { seat: 1 });
    g.pass();
    g.act(1).cast(MURDER, { targets: [MANDATORY], pay: true });
    g.passAll();
    g.expect.zone('Serra Angel', 'hand', { seat: 1 });
    g.expect.invariants();
  });
});
