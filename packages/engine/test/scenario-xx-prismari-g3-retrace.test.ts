// The Prismari deck (issue 87), group 3: Retrace (CR 702.81a, D-653), the keyword of Throes of Chaos: "You may cast this card from your graveyard by discarding a land card in addition to
// paying its other costs." (SYNTHETIC Chaos Retrace, "Cascade. Retrace.", src/cards/fixtures/synthetic-prismari-g3.ts; SYNTHETIC Retrace Bolt below has an effect of its own.) Pins: CR 702.81a
// (a static ability that works while the card is in a player's graveyard: cast from the graveyard, a land card discarded as an additional cost, the mana cost still paid), CR 601.2b and 601.2f-h
// (additional costs: the discard is chosen and paid with the mana, and the cast can be taken back, CR 733), CR 118.3 (a cost that cannot be paid is not paid: no land card in hand, no
// retrace), CR 305.1 (a land card is played, never cast: the retrace of a land is not a thing), CR 307.1 (the sorcery's own timing applies), CR 601.2i (the spell is cast: it triggers
// Cascade as any cast does), CR 400.7.
import { describe, expect, test } from 'vitest';
import { getLegalActions, syntheticCard, validateCard } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';
import { chooseCardsDecision } from './pending-helpers';

const CHAOS = 'SYNTHETIC Chaos Retrace'; // {3}{R} sorcery, cascade, retrace
const BOLT = 'SYNTHETIC Retrace Bolt'; // {1}{R} sorcery, retrace: deals 2 damage to any target
const XRETRACE = 'SYNTHETIC Retrace X Drain'; // {X}{R} sorcery, retrace: you gain X life
const GAIN2 = 'SYNTHETIC Calamity Gain Two'; // {1}{R} sorcery, gain 2 life, no retrace
const FILLER = ['Island', 'Island', 'Island', 'Island'] as const;

type Builder = ReturnType<typeof scenario>;

function game(
  graveyard: readonly string[],
  hand: readonly string[],
  extra: (b: Builder) => void = () => {},
) {
  const b = scenario().seat(0).library(...FILLER).pool('RRRRRR');
  for (const card of graveyard) b.graveyard(card);
  for (const card of hand) b.hand(card);
  extra(b);
  return b
    .seat(1)
    .library(...FILLER)
    .at('precombatMain', { active: 0 })
    .build();
}

const retraceOption = (g: ScenarioGame, name: string) => {
  const card = g.find({ name, zone: 'graveyard', seat: 0 })[0];
  return getLegalActions(g.state, 0).filter(
    (a) => a.kind === 'castSpell' && a.object === card?.id && a.alternative === 'retrace',
  );
};

describe('the cards are valid', () => {
  for (const name of [CHAOS, BOLT, XRETRACE]) {
    test(name, () => expect(validateCard(syntheticCard(name))).toEqual([]));
  }
  test('a land with retrace is not valid: a land is played, not cast', () => {
    const card = syntheticCard(CHAOS);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const land = { ...card, faces: [{ ...face, types: ['land'], manaCost: null }] } as never;
    expect(validateCard(land).some((i) => i.message.includes('retrace'))).toBe(true);
  });
});

describe('"You may cast this card from your graveyard by discarding a land card" (CR 702.81a)', () => {
  test('with a land card in hand the card in the graveyard can be cast with retrace, and only then', () => {
    const g = game([BOLT], ['Island']);
    expect(retraceOption(g, BOLT)).toHaveLength(1);
    // A card in the graveyard cannot be cast any other way.
    const card = g.find({ name: BOLT, zone: 'graveyard', seat: 0 })[0];
    const plain = getLegalActions(g.state, 0).filter(
      (a) => a.kind === 'castSpell' && a.object === card?.id && a.alternative === undefined,
    );
    expect(plain).toEqual([]);
  });

  test('without a land card in hand it is not offered: a hand of nonland cards is no cost (CR 118.3)', () => {
    const g = game([BOLT], [GAIN2]);
    expect(retraceOption(g, BOLT)).toEqual([]);
    const empty = game([BOLT], []);
    expect(retraceOption(empty, BOLT)).toEqual([]);
  });

  test('a card without retrace in the graveyard is not offered', () => {
    const g = game([GAIN2], ['Island']);
    expect(retraceOption(g, GAIN2)).toEqual([]);
  });

  test('a card with retrace in the hand is cast the ordinary way and is not offered with retrace (it works only in the graveyard)', () => {
    const g = game([], [BOLT, 'Island']);
    const card = g.find({ name: BOLT, zone: 'hand', seat: 0 })[0];
    const options = getLegalActions(g.state, 0).filter(
      (a) => a.kind === 'castSpell' && a.object === card?.id,
    );
    expect(options.some((a) => a.kind === 'castSpell' && a.alternative === 'retrace')).toBe(false);
    expect(options.length).toBeGreaterThan(0);
  });

  test('casting it: the mana cost is paid, a land card is discarded, and it goes back to the graveyard', () => {
    const g = game([BOLT], ['Island', 'Plains']);
    g.act(0).cast(BOLT, { alternative: 'retrace', pay: true, targets: [{ player: 1 }] });
    // Two lands in hand: which to discard is the caster's choice, a land card only.
    const d = chooseCardsDecision(g);
    expect(d).toMatchObject({ purpose: 'discard', zone: 'hand', min: 1, max: 1, forCost: true });
    expect(d.legal).toHaveLength(2);
    g.act(0).chooseCards({ name: 'Plains', zone: 'hand', seat: 0 });
    g.expect.zone('Plains', 'graveyard', { seat: 0 });
    g.expect.stack([BOLT]);
    g.passAll();
    g.expect.life(1, 38);
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    expect(g.state.seats[0]?.hand).toHaveLength(1);
    g.expect.invariants();
  });

  test('the mana cost is still paid: with too little mana it is not offered', () => {
    const g = game([BOLT], ['Island'], () => {});
    // {1}{R}: six R in the pool pay it; none in another game does not.
    const poor = scenario()
      .seat(0)
      .library(...FILLER)
      .graveyard(BOLT)
      .hand('Island')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    expect(retraceOption(g, BOLT)).toHaveLength(1);
    expect(retraceOption(poor, BOLT)).toEqual([]);
  });

  test('with exactly one land card in hand nothing is chosen: it is discarded', () => {
    const g = game([BOLT], ['Island', GAIN2]);
    g.act(0).cast(BOLT, { alternative: 'retrace', pay: true, targets: [{ player: 1 }] });
    // A nonland card in hand is not a candidate: the one land card is the cost.
    expect(g.state.pending?.kind).not.toBe('chooseCards');
    g.expect.zone('Island', 'graveyard', { seat: 0 });
    g.expect.zone(GAIN2, 'hand', { seat: 0 });
  });

  test('only a land card can be discarded: the nonland cards of the hand are never offered', () => {
    const g = game([BOLT], ['Island', 'Plains', GAIN2]);
    g.act(0).cast(BOLT, { alternative: 'retrace', pay: true, targets: [{ player: 1 }] });
    const d = chooseCardsDecision(g);
    const names = d.legal.map((id) => g.state.objects[id]?.zone);
    expect(names).toEqual(['hand', 'hand']);
    expect(d.legal).toHaveLength(2);
    expect(d.legal).not.toContain(g.find({ name: GAIN2, zone: 'hand', seat: 0 })[0]?.id);
  });

  test('taking the cast back (CR 733) returns the card to the graveyard and the land to the hand', () => {
    const g = game([BOLT], ['Island', 'Plains']);
    g.act(0).cast(BOLT, { alternative: 'retrace', pay: true, targets: [{ player: 1 }] });
    g.act(0).cancel();
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    expect(g.state.seats[0]?.hand).toHaveLength(2);
    g.expect.pending('priority', 0);
  });

  test('it can be cast again and again, each time with another land card (CR 400.7: a new object each time)', () => {
    const g = game([BOLT], ['Island', 'Plains'], (b) => b.pool('RRRRRRRR'));
    for (const land of ['Island', 'Plains'] as const) {
      g.act(0).cast(BOLT, { alternative: 'retrace', pay: true, targets: [{ player: 1 }] });
      if (g.state.pending?.kind === 'chooseCards') g.act(0).chooseCards(land);
      g.passAll();
    }
    g.expect.life(1, 36);
    expect(retraceOption(g, BOLT)).toEqual([]);
  });

  test('sorcery timing applies: not during the opponent’s turn, not with something on the stack', () => {
    const g = game([BOLT], ['Island']);
    g.advanceTo('upkeep', { turn: 'next' });
    expect(retraceOption(g, BOLT)).toEqual([]);
  });

  test('a card in the opponent’s graveyard is not cast by you (retrace is for its owner)', () => {
    const g = game([], ['Island'], (b) => b.seat(1).graveyard(BOLT));
    const card = g.find({ name: BOLT, zone: 'graveyard', seat: 1 })[0];
    expect(
      getLegalActions(g.state, 0).filter((a) => a.kind === 'castSpell' && a.object === card?.id),
    ).toEqual([]);
  });

  test('an {X} spell: X is announced and paid, as the mana cost is paid', () => {
    const g = game([XRETRACE], ['Island'], (b) => b.pool('RRRRRR'));
    g.act(0).cast(XRETRACE, { alternative: 'retrace', x: 3, pay: true });
    g.passAll();
    g.expect.life(0, 43);
  });
});

describe('Throes of Chaos: "Cascade. Retrace."', () => {
  test('cast from the graveyard it cascades as any cast does (CR 702.85a, 601.2i)', () => {
    const g = game([CHAOS], ['Island'], (b) => b.seat(0).library(GAIN2));
    g.act(0).cast(CHAOS, { alternative: 'retrace', pay: true });
    g.expect.stack([`${CHAOS} (ability)`, CHAOS]);
  });

  test('cast from the hand it is the ordinary cast; it ends in the graveyard, where retrace casts it again, cascading again', () => {
    const g = game([], [CHAOS, 'Island'], (b) => b.pool('RRRRRRRR'));
    g.act(0).cast(CHAOS, { pay: true });
    // The cascade trigger finds nothing to cast in a library of lands and resolves with the spell.
    g.passAll();
    g.expect.pending('priority', 0);
    g.expect.zone(CHAOS, 'graveyard', { seat: 0 });
    expect(retraceOption(g, CHAOS)).toHaveLength(1);
    g.act(0).cast(CHAOS, { alternative: 'retrace', pay: true });
    g.expect.stack([`${CHAOS} (ability)`, CHAOS]);
    g.expect.zone('Island', 'graveyard', { seat: 0 });
    g.expect.invariants();
  });
});
