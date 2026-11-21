// Elemental Incarnation cycle (the Dance of the Elements deck): "Evoke—Exile a red card from your hand." and "up to one target player puts all the cards from their graveyard on the bottom
// of their library in a random order." The cards here are SYNTHETIC: their texts are written like the Oracle text of Fury and Endurance (the real text is not in the golden corpus of this
// checkout, and the CR text was not available, so only rule numbers the repository's own comments already use are cited): CR 702.74a (Evoke), 118.9 (an alternative cost), 601.2b and
// 601.2h (the cost is announced and paid as the spell is cast), 603.3 (the sacrifice is a triggered ability), 401.4 (the bottom of a library), 404.1 (a graveyard), 108.3 (the owner),
// 115.1 (targets), 733 (cancelling a cast restores everything).
import { applyAction, getLegalActions, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const REMINDER =
  "(You may cast this spell for its evoke cost. If you do, it's sacrificed when it enters.)";

const FIREBRAND = parsed(
  'SYNTHETIC Parsed Pitch Firebrand',
  'Creature — Elemental Incarnation',
  `Double strike\nWhen ~ enters, you gain 4 life.\nEvoke—Exile a red card from your hand. ${REMINDER}`,
  { manaCost: '{3}{R}{R}', power: '3', toughness: '3', colors: ['R'] },
);

const TENDRIL = parsed(
  'SYNTHETIC Parsed Pitch Tendril',
  'Creature — Elemental Incarnation',
  `Flash\nReach\nWhen ~ enters, up to one target player puts all the cards from their graveyard on the bottom of their library in a random order.\nEvoke—Exile a green card from your hand. ${REMINDER}`,
  { manaCost: '{3}{G}{G}', power: '4', toughness: '4', colors: ['G'] },
);

const RED_SPELL = 'Lightning Bolt';
const GREEN_CARD = 'Grizzly Bears';

describe('Evoke—Exile a red card from your hand', () => {
  test('the card is valid and lists an evoke cost with the exile of a red card of the hand', () => {
    expect(validateCard(FIREBRAND)).toEqual([]);
    expect(FIREBRAND.faces[0]?.alternativeCosts).toEqual([
      {
        kind: 'evoke',
        cost: [{ kind: 'mana', symbols: ['0'] }],
        exileFromHand: { colors: ['R'], zone: 'hand' },
      },
    ]);
  });

  const build = (hand: readonly string[]) =>
    scenario()
      .define(FIREBRAND)
      .seat(0)
      .hand(FIREBRAND.name, ...hand)
      .seat(1)
      .build();

  test('with a red card in the hand the evoke cast is offered for no mana; the ordinary cast is not', () => {
    const g = build([RED_SPELL]);
    g.expect.legal(0, { cast: FIREBRAND.name, alternative: 'evoke' });
    g.expect.illegal(0, { cast: FIREBRAND.name });
  });

  test('the card cast is never the card exiled: alone in the hand it cannot be evoked', () => {
    const g = build([]);
    g.expect.illegal(0, { cast: FIREBRAND.name, alternative: 'evoke' });
  });

  test('only a red card pays it: a green card does not', () => {
    const g = build([GREEN_CARD]);
    g.expect.illegal(0, { cast: FIREBRAND.name, alternative: 'evoke' });
  });

  test('the cast asks which card to exile; it is exiled, and the creature is sacrificed when it enters', () => {
    const g = build([RED_SPELL, GREEN_CARD]);
    g.act(0).cast(FIREBRAND.name, { alternative: 'evoke' });
    g.expect.pending('chooseCards', 0);
    // Only the red card is a choice, and exactly one.
    const shown = (g.view(0).pendingCards ?? []).map((o) => o.name);
    expect(shown).toEqual([RED_SPELL]);
    g.act(0).chooseCards(RED_SPELL);
    // The card is exiled as the cost is paid (CR 601.2h), after the choice.
    g.act(0).choose({ kind: 'payAuto' });
    g.expect.zone(RED_SPELL, 'exile', { seat: 0, count: 1 });
    g.expect.zone(GREEN_CARD, 'hand', { seat: 0, count: 1 });
    g.expect.zone(FIREBRAND.name, 'stack');
    g.passAll();
    // The creature entered: its own trigger (gain 4) and the evoke sacrifice both triggered, and the controller orders them (CR 603.3b).
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(1, 0);
    g.passAll();
    g.expect.zone(FIREBRAND.name, 'graveyard', { seat: 0, count: 1 });
    g.expect.life(0, 44);
    g.expect.invariants();
  });

  test('exiling nothing is not an answer', () => {
    const g = build([RED_SPELL]);
    g.act(0).cast(FIREBRAND.name, { alternative: 'evoke' });
    g.expect.pending('chooseCards', 0);
    const pending = g.state.pending;
    if (pending?.kind !== 'chooseCards') throw new Error('no chooseCards');
    expect(pending.min).toBe(1);
    expect(pending.max).toBe(1);
    expect(applyAction(g.state, 0, { kind: 'chooseCards', objects: [] }).ok).toBe(false);
  });

  test('cancelling the cast before it is paid exiles nothing (CR 733)', () => {
    const g = build([RED_SPELL]);
    const before = g.positionHash();
    g.act(0).cast(FIREBRAND.name, { alternative: 'evoke' });
    g.act(0).chooseCards(RED_SPELL);
    g.act(0).cancel();
    g.expect.position(before);
  });

  test('the cast for its mana cost exiles nothing', () => {
    const g = scenario()
      .define(FIREBRAND)
      .seat(0)
      .hand(FIREBRAND.name, RED_SPELL)
      .battlefield('Mountain', { count: 5 })
      .seat(1)
      .build();
    g.act(0).cast(FIREBRAND.name, { pay: true });
    g.passAll();
    g.expect.zone(FIREBRAND.name, 'battlefield', { seat: 0 });
    g.expect.zone(RED_SPELL, 'hand', { seat: 0, count: 1 });
  });

  test('the view says the evoke cost exiles a card of the hand', () => {
    const g = build([RED_SPELL]);
    const card = g.view(0).seats[0]?.hand?.find((o) => o.name === FIREBRAND.name);
    expect(card?.alternativeCosts).toEqual([
      {
        kind: 'evoke',
        cost: ['0'],
        exileFromHand: { colors: ['R'], zone: 'hand' },
      },
    ]);
    expect(
      getLegalActions(g.state, 0).some((a) => a.kind === 'castSpell' && a.alternative === 'evoke'),
    ).toBe(true);
  });
});

const GRAVEYARD = ['Island', 'Mountain', 'Forest', 'Grizzly Bears', 'Lightning Bolt', 'Divination'];

describe('up to one target player puts all the cards from their graveyard on the bottom of their library in a random order', () => {
  const build = (seed: number) =>
    scenario()
      .define(TENDRIL)
      .seed(seed)
      .seat(0)
      .hand(TENDRIL.name)
      .battlefield('Forest', { count: 5 })
      .library('Plains', 'Swamp')
      .graveyard(...GRAVEYARD)
      .seat(1)
      .library('Plains')
      .graveyard('Llanowar Elves')
      .build();

  /** The names of the cards in seat 0's library, top first. */
  const libraryNames = (g: ReturnType<typeof build>): string[] => {
    const names = ['Plains', 'Swamp', ...GRAVEYARD];
    const byId = new Map<string, string>();
    for (const name of names) {
      for (const o of g.find({ name, zone: 'library', seat: 0 })) byId.set(o.id, name);
    }
    return (g.state.seats[0]?.library ?? []).map((id) => byId.get(id) ?? '?');
  };

  const resolveEnter = (g: ReturnType<typeof build>, player: 0 | 1) => {
    g.act(0).cast(TENDRIL.name, { pay: true });
    g.passAll();
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player });
    g.passAll();
  };

  test('the card is valid and lowers to one move of the target player graveyard', () => {
    expect(validateCard(TENDRIL)).toEqual([]);
  });

  test('the cards go to the bottom of the target library, under what was there, and the graveyard is empty', () => {
    const g = build(1);
    resolveEnter(g, 0);
    g.expect.zone('Island', 'graveyard', { count: 0 });
    g.expect.zone('Lightning Bolt', 'graveyard', { count: 0 });
    g.expect.librarySize(0, 8);
    // What was on top of the library is still on top.
    expect(libraryNames(g).slice(0, 2)).toEqual(['Plains', 'Swamp']);
    // The other player's graveyard is untouched.
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 1, count: 1 });
    g.expect.invariants();
  });

  test('the order comes from the seeded generator: the same seed gives the same order, another seed another one', () => {
    const order = (seed: number) => {
      const g = build(seed);
      resolveEnter(g, 0);
      return libraryNames(g).slice(2);
    };
    expect(order(7)).toEqual(order(7));
    const orders = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => order(seed).join(',')));
    expect(orders.size).toBeGreaterThan(1);
    expect([...order(3)].sort()).toEqual(
      ['Divination', 'Grizzly Bears', 'Forest', 'Island', 'Lightning Bolt', 'Mountain'].sort(),
    );
  });

  test('the target may be the other player: their cards go to the bottom of their library', () => {
    const g = build(1);
    resolveEnter(g, 1);
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 1, count: 0 });
    g.expect.librarySize(1, 2);
    g.expect.zone('Island', 'graveyard', { seat: 0, count: 1 });
  });

  test('up to one: with no target chosen nothing moves', () => {
    const g = build(1);
    g.act(0).cast(TENDRIL.name, { pay: true });
    g.passAll();
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets();
    g.passAll();
    g.expect.zone('Island', 'graveyard', { seat: 0, count: 1 });
    g.expect.librarySize(0, 2);
  });
});

describe('Evoke on a creature with the graveyard effect', () => {
  // Both triggers go on the stack as it enters and the controller orders them (CR 603.3b): the first named is put on the stack first, so it resolves last.
  test.each([
    [
      'the evoke sacrifice resolves first: the creature is in the graveyard when its own trigger moves it',
      [0, 1],
      'library',
    ],
    [
      'the enters trigger resolves first: the creature is sacrificed after the graveyard was moved',
      [1, 0],
      'graveyard',
    ],
  ] as const)('%s', (_name, order, where) => {
    const g = scenario()
      .define(TENDRIL)
      .seat(0)
      .hand(TENDRIL.name, GREEN_CARD)
      .graveyard('Island')
      .library('Plains')
      .seat(1)
      .build();
    g.act(0).cast(TENDRIL.name, { alternative: 'evoke' });
    g.act(0).chooseCards(GREEN_CARD);
    g.act(0).choose({ kind: 'payAuto' });
    g.passAll();
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(...order);
    g.act(0).chooseTargets({ player: 0 });
    g.passAll();
    g.expect.zone(TENDRIL.name, where, { seat: 0, count: 1 });
    g.expect.zone(TENDRIL.name, 'battlefield', { count: 0 });
    g.expect.zone(GREEN_CARD, 'exile', { seat: 0, count: 1 });
    g.expect.zone('Island', 'library', { seat: 0, count: 1 });
    g.expect.invariants();
  });
});
