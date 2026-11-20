// Jump-start (CR 702.133a), the keyword of Radical Idea (the Quick Draw deck, issue 121): "You may cast this card from your graveyard by discarding a card in addition to paying its
// other costs. If you do, exile this card instead of putting it anywhere else any time it would leave the stack." (SYNTHETIC Jump Draw, SYNTHETIC Jump X Drain,
// src/cards/fixtures/synthetic-jump-start.ts.) Pins: CR 702.133a (cast from the graveyard, any card discarded as an additional cost, the mana cost still paid, exiled afterwards, never put
// anywhere else), CR 601.2b and 601.2f-h (the discard is chosen and paid with the mana; the cast can be taken back, CR 733), CR 118.3 (a cost that cannot be paid is not paid: no card in
// hand, no jump-start), CR 307.1 (a sorcery's own timing applies), CR 400.7.
import { describe, expect, test } from 'vitest';
import { getLegalActions, syntheticCard, validateCard } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';
import { chooseCardsDecision } from './pending-helpers';

const DRAW = 'SYNTHETIC Jump Draw'; // {1}{U} instant, jump-start: draw a card
const XDRAIN = 'SYNTHETIC Jump X Drain'; // {X}{U} sorcery, jump-start: gain X life
const PLAIN = 'SYNTHETIC Calamity Gain Two'; // {1}{R} sorcery, no jump-start
const FILLER = ['Island', 'Island', 'Island', 'Island'] as const;

type Builder = ReturnType<typeof scenario>;

function game(
  graveyard: readonly string[],
  hand: readonly string[],
  extra: (b: Builder) => void = () => {},
) {
  const b = scenario()
    .seat(0)
    .library(...FILLER)
    .pool('UUUUUU');
  for (const card of graveyard) b.graveyard(card);
  for (const card of hand) b.hand(card);
  extra(b);
  return b
    .seat(1)
    .library(...FILLER)
    .at('precombatMain', { active: 0 })
    .build();
}

const jumpStartOption = (g: ScenarioGame, name: string) => {
  const card = g.find({ name, zone: 'graveyard', seat: 0 })[0];
  return getLegalActions(g.state, 0).filter(
    (a) => a.kind === 'castSpell' && a.object === card?.id && a.alternative === 'jumpStart',
  );
};

describe('the cards are valid', () => {
  for (const name of [DRAW, XDRAIN]) {
    test(name, () => expect(validateCard(syntheticCard(name))).toEqual([]));
  }
});

describe('"You may cast this card from your graveyard by discarding a card" (CR 702.133a)', () => {
  test('with a card in hand the card in the graveyard can be cast with jump-start, and only then', () => {
    const g = game([DRAW], [PLAIN]);
    expect(jumpStartOption(g, DRAW)).toHaveLength(1);
    const card = g.find({ name: DRAW, zone: 'graveyard', seat: 0 })[0];
    const plain = getLegalActions(g.state, 0).filter(
      (a) => a.kind === 'castSpell' && a.object === card?.id && a.alternative === undefined,
    );
    expect(plain).toEqual([]);
  });

  test('with no card in hand it is not offered: an empty hand is no cost (CR 118.3)', () => {
    expect(jumpStartOption(game([DRAW], []), DRAW)).toEqual([]);
  });

  test('a card without jump-start in the graveyard is not offered', () => {
    expect(jumpStartOption(game([PLAIN], ['Island']), PLAIN)).toEqual([]);
  });

  test('a card with jump-start in the hand is cast the ordinary way and is not offered with jump-start', () => {
    const g = game([], [DRAW, 'Island']);
    const card = g.find({ name: DRAW, zone: 'hand', seat: 0 })[0];
    const options = getLegalActions(g.state, 0).filter(
      (a) => a.kind === 'castSpell' && a.object === card?.id,
    );
    expect(options.some((a) => a.kind === 'castSpell' && a.alternative === 'jumpStart')).toBe(
      false,
    );
    expect(options.length).toBeGreaterThan(0);
  });

  test('casting it: the mana cost is paid, a card of the hand is discarded, and the spell is exiled afterwards', () => {
    const g = game([DRAW], ['Island', PLAIN]);
    g.act(0).cast(DRAW, { alternative: 'jumpStart', pay: true });
    // Any card of the hand may be discarded: the choice is the caster's.
    const d = chooseCardsDecision(g);
    expect(d).toMatchObject({ purpose: 'discard', zone: 'hand', min: 1, max: 1, forCost: true });
    expect(d.legal).toHaveLength(2);
    g.act(0).chooseCards({ name: PLAIN, zone: 'hand', seat: 0 });
    g.expect.zone(PLAIN, 'graveyard', { seat: 0 });
    g.expect.stack([DRAW]);
    g.passAll();
    // CR 702.133a: it is exiled instead of going to the graveyard; the spell did its work.
    g.expect.zone(DRAW, 'exile');
    expect(jumpStartOption(g, DRAW)).toEqual([]);
    expect(g.state.seats[0]?.hand).toHaveLength(2);
    g.expect.invariants();
  });

  test('with exactly one card in hand nothing is chosen: it is discarded', () => {
    const g = game([DRAW], [PLAIN]);
    g.act(0).cast(DRAW, { alternative: 'jumpStart', pay: true });
    expect(g.state.pending?.kind).not.toBe('chooseCards');
    g.expect.zone(PLAIN, 'graveyard', { seat: 0 });
  });

  test('the mana cost is still paid: with too little mana it is not offered', () => {
    const poor = scenario()
      .seat(0)
      .library(...FILLER)
      .graveyard(DRAW)
      .hand('Island')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    expect(jumpStartOption(poor, DRAW)).toEqual([]);
  });

  test('taking the cast back (CR 733) returns the card to the graveyard and the discard to the hand', () => {
    const g = game([DRAW], ['Island', PLAIN]);
    g.act(0).cast(DRAW, { alternative: 'jumpStart', pay: true });
    g.act(0).cancel();
    g.expect.zone(DRAW, 'graveyard', { seat: 0 });
    expect(g.state.seats[0]?.hand).toHaveLength(2);
    g.expect.pending('priority', 0);
  });

  test('an {X} spell: X is announced and paid, as the mana cost is paid', () => {
    const g = game([XDRAIN], ['Island']);
    g.act(0).cast(XDRAIN, { alternative: 'jumpStart', x: 3, pay: true });
    g.passAll();
    g.expect.life(0, 43);
    g.expect.zone(XDRAIN, 'exile');
  });

  test('sorcery timing applies to a sorcery: not during the opponent’s turn', () => {
    const g = game([XDRAIN], ['Island']);
    g.advanceTo('upkeep', { turn: 'next' });
    expect(jumpStartOption(g, XDRAIN)).toEqual([]);
  });

  test('a card in the opponent’s graveyard is not cast by you', () => {
    const g = game([], ['Island'], (b) => b.seat(1).graveyard(DRAW));
    const card = g.find({ name: DRAW, zone: 'graveyard', seat: 1 })[0];
    expect(
      getLegalActions(g.state, 0).filter((a) => a.kind === 'castSpell' && a.object === card?.id),
    ).toEqual([]);
  });
});
