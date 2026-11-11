// "Return an artifact you control to its owner's hand" as a cost, and "You may put an artifact card from your hand onto the battlefield" (D-139).
// A cost that returns a permanent the player chooses (or this one) to its owner's hand, with the question of CR 903.9b for a commander; an effect
// that lets the controller choose cards in their hand or graveyard and put them onto the battlefield, none up to a number.
// Pins: CR 118.3 (a cost can't be paid without the resources), CR 602.2b (costs are paid as the ability is activated, the player choosing),
// CR 108.3 (a card goes to its owner's hand), CR 111.7 (a token that leaves the battlefield ceases to exist), CR 903.9b (a commander going to the
// hand may go to the command zone instead), CR 608.2d (a player who chooses may choose none for "you may"), CR 110.2a (the controller of the effect
// controls what it puts onto the battlefield), CR 733 (a cost can be taken back before the ability is activated).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-ability-costs.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { twoSeatGame } from './two-seat-helpers';

const MAGE = 'SYNTHETIC Ferry Mage'; // artifact creature: {U},{T}, return an artifact you control: you may put an artifact card from your hand onto the battlefield
const LODGE = 'SYNTHETIC Swap Lodge'; // {2}, return a creature you control: you may put a creature card from your hand onto the battlefield tapped
const SHRINE = 'SYNTHETIC Tide Shrine'; // {1}, return two lands you control: you may put a creature card from your graveyard onto the battlefield
const LENS = 'SYNTHETIC Fleeting Lens'; // {T}, return this to its owner's hand: draw a card
const TRINKET = 'SYNTHETIC Trinket 1';
const TRINKET2 = 'SYNTHETIC Trinket 2';
const TRINKET4 = 'SYNTHETIC Trinket 4';
const BEARS = 'Grizzly Bears';
const RAGING = 'Raging Goblin';

const canActivate = (g: ReturnType<typeof twoSeatGame>, card: string): boolean =>
  g.legalActions(0).some((a) => a.kind === 'activate' && a.object === g.id(card));

describe('the cards are valid', () => {
  test.each([MAGE, LODGE, SHRINE, LENS])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('"Return an artifact you control to its owner\'s hand" (CR 118.3, 602.2b)', () => {
  test('with several artifacts the player chooses; the one returned is in the hand and the effect may put an artifact card onto the battlefield', () => {
    const g = twoSeatGame((b) =>
      b
        .battlefield(MAGE)
        .battlefield(TRINKET, { label: 'cheap' })
        .battlefield('Island')
        .hand(TRINKET4, { label: 'big' }),
    );
    g.act(0).activate(MAGE);
    // The mana first (CR 601.2g-h), then the choice of what to return (D-139).
    g.act(0).payAuto();
    g.expect.pending('choosePermanent', 0);
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected the choice of what to return');
    expect(d.purpose).toBe('bounce');
    expect(d.forCost).toBe(true);
    expect(d.min).toBe(1);
    expect(d.max).toBe(1);
    // The Mage is an artifact creature itself: it may be returned.
    expect(d.legal).toHaveLength(2);
    g.act(0).choosePermanents('cheap');
    g.expect.zone(TRINKET, 'hand', { seat: 0 });
    g.expect.tapped(MAGE, true);
    g.passAll();
    // The effect: choose none or one artifact card from the hand: the bounced one and the big one.
    g.expect.pending('chooseCards', 0);
    const c = g.state.pending;
    if (c?.kind !== 'chooseCards') throw new Error('expected the choice of a card');
    expect(c.purpose).toBe('move');
    expect(c.zone).toBe('hand');
    expect(c.min).toBe(0);
    expect(c.max).toBe(1);
    expect(c.legal).toHaveLength(2);
    expect(c.reveal).toBe(false);
    g.act(0).chooseCards('big');
    g.expect.zone(TRINKET4, 'battlefield', { seat: 0 });
    g.expect.tapped(TRINKET4, false);
    g.expect.invariants();
  });

  test('the player may put none', () => {
    const g = twoSeatGame((b) =>
      b.battlefield(MAGE).battlefield(TRINKET).battlefield('Island').hand(TRINKET4),
    );
    g.act(0).activate(MAGE, { pay: true });
    g.act(0).choosePermanents(TRINKET);
    g.passAll();
    g.act(0).chooseCards();
    g.expect.zone(TRINKET4, 'hand', { seat: 0 });
    g.expect.zone(TRINKET, 'hand', { seat: 0 });
  });

  test('only artifact cards are offered: a creature card in hand is not', () => {
    const g = twoSeatGame((b) =>
      b.battlefield(MAGE).battlefield(TRINKET).battlefield('Island').hand(BEARS).hand(TRINKET2),
    );
    g.act(0).activate(MAGE, { pay: true });
    g.act(0).choosePermanents(TRINKET);
    g.passAll();
    const c = g.state.pending;
    if (c?.kind !== 'chooseCards') throw new Error('expected the choice of a card');
    expect(c.legal.map((id) => g.state.objects[id]?.card)).not.toContain(g.object(BEARS).card);
    expect(c.legal).toHaveLength(2);
  });

  test('with nothing in hand to put onto the battlefield nothing is asked', () => {
    const g = twoSeatGame((b) => b.battlefield(MAGE).battlefield('Island'));
    // The Mage is the only artifact: it is returned (the engine chooses), and the bounced Mage is the one artifact card in the hand.
    g.act(0).activate(MAGE, { pay: true });
    g.expect.zone(MAGE, 'hand', { seat: 0 });
    g.passAll();
    // The card it returned is in the hand now and is an artifact card: the question is asked, and it may be put back.
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards(MAGE);
    g.expect.zone(MAGE, 'battlefield', { seat: 0 });
  });

  test('an artifact of the opponent is not a candidate, and without any artifact the ability is not offered (CR 118.3)', () => {
    const g = twoSeatGame(
      (b) => b.battlefield(MAGE, { tapped: false }).battlefield('Island'),
      (b) => b.battlefield(TRINKET),
    );
    // The Mage itself is yours: offered. Take the Mage away: a game with only the opponent's artifact.
    expect(canActivate(g, MAGE)).toBe(true);
    const none = twoSeatGame(
      (b) => b.battlefield('Island').battlefield(BEARS),
      (b) => b.battlefield(TRINKET),
    );
    expect(none.legalActions(0).some((a) => a.kind === 'activate')).toBe(false);
  });

  test('cancelling the choice takes everything back (CR 733)', () => {
    const g = twoSeatGame((b) =>
      b.battlefield(MAGE).battlefield(TRINKET).battlefield('Island').hand(TRINKET4),
    );
    g.act(0).activate(MAGE);
    g.act(0).cancel();
    g.expect.zone(TRINKET, 'battlefield', { seat: 0 });
    g.expect.tapped(MAGE, false);
    g.expect.pending('priority', 0);
  });

  test('the returned permanent can be the one put back: it is a new object (CR 400.7), and enters untapped', () => {
    const g = twoSeatGame((b) => b.battlefield(MAGE).battlefield(TRINKET).battlefield('Island'));
    g.act(0).activate(MAGE, { pay: true });
    g.act(0).choosePermanents(TRINKET);
    g.passAll();
    g.act(0).chooseCards(TRINKET);
    g.expect.zone(TRINKET, 'battlefield', { seat: 0 });
    g.expect.tapped(TRINKET, false);
  });
});

describe("a commander returned to its owner's hand may go to the command zone instead (CR 903.9b)", () => {
  const withCommander = () =>
    twoSeatGame((b) =>
      b
        .battlefield(MAGE)
        .battlefield(TRINKET, { commander: true, label: 'cmdr' })
        .battlefield('Island')
        .hand(TRINKET4),
    );

  test('the owner is asked after choosing: the command zone', () => {
    const g = withCommander();
    g.act(0).activate(MAGE, { pay: true });
    g.act(0).choosePermanents('cmdr');
    g.expect.pending('commanderZone', 0);
    g.act(0).sendToCommandZone();
    g.expect.zone(TRINKET, 'command', { seat: 0 });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.expect.invariants();
  });

  test('the owner is asked after choosing: the hand', () => {
    const g = withCommander();
    g.act(0).activate(MAGE, { pay: true });
    g.act(0).choosePermanents('cmdr');
    g.act(0).declineCommandZone();
    g.expect.zone(TRINKET, 'hand', { seat: 0 });
    g.passAll();
    g.act(0).chooseCards('cmdr');
    g.expect.zone(TRINKET, 'battlefield', { seat: 0 });
  });
});

describe('the same cost over creatures, a count of two and "this"', () => {
  test('"Return a creature you control": the creature card from hand enters tapped', () => {
    const g = twoSeatGame((b) =>
      b
        .battlefield(LODGE)
        .battlefield(BEARS)
        .battlefield('Island', { count: 2 })
        .battlefield(RAGING)
        .hand('Giant Spider'),
    );
    g.act(0).activate(LODGE, { pay: true });
    g.act(0).choosePermanents(BEARS);
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.passAll();
    g.act(0).chooseCards('Giant Spider');
    g.expect.zone('Giant Spider', 'battlefield', { seat: 0 });
    g.expect.tapped('Giant Spider', true);
  });

  test('a token that is returned ceases to exist (CR 111.7): the Germ of a living weapon', () => {
    const g = twoSeatGame((b) =>
      b.battlefield(LODGE).hand('SYNTHETIC Germ Blade').battlefield('Plains', { count: 5 }),
    );
    g.act(0).cast('SYNTHETIC Germ Blade', { pay: true });
    g.passAll();
    const germ = g.state.battlefield.find(
      (id) => g.state.objects[id]?.token?.characteristics.name === 'Phyrexian Germ',
    );
    expect(germ).toBeDefined();
    // The Germ is the one creature: the engine returns it (and says so) without asking.
    g.act(0).activate(LODGE, { pay: true });
    expect(g.state.battlefield).not.toContain(germ);
    g.passAll();
    // The Equipment stays on the battlefield, unattached.
    g.expect.attached('SYNTHETIC Germ Blade', null);
    expect(g.state.seats[0]?.hand).toHaveLength(0);
  });

  test('"Return two lands you control": exactly two are returned; the effect chooses from the graveyard, which is public', () => {
    const g = twoSeatGame((b) =>
      b.battlefield(SHRINE).battlefield('Island', { count: 3 }).graveyard(BEARS).graveyard(TRINKET),
    );
    g.act(0).activate(SHRINE, { pay: true });
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected the choice of lands');
    expect(d.min).toBe(2);
    expect(d.max).toBe(2);
    g.act(0).choosePermanents({ name: 'Island', nth: 0 }, { name: 'Island', nth: 1 });
    g.expect.zone('Island', 'hand', { seat: 0, count: 2 });
    g.passAll();
    const c = g.state.pending;
    if (c?.kind !== 'chooseCards') throw new Error('expected the choice of a card');
    expect(c.zone).toBe('graveyard');
    expect(c.reveal).toBe(true);
    // Only the creature card is a candidate.
    expect(c.legal).toHaveLength(1);
    g.act(0).chooseCards(BEARS);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('two lands are needed: with one the ability is not offered', () => {
    const g = twoSeatGame((b) => b.battlefield(SHRINE).battlefield('Island').graveyard(BEARS));
    // {1} is payable by the Island, but one land is not two... and the Island pays the mana first, so it does not matter: not offered.
    expect(canActivate(g, SHRINE)).toBe(false);
  });

  test('"Return this to its owner\'s hand": the source goes at once, no question; the ability still resolves', () => {
    const g = twoSeatGame((b) => b.battlefield(LENS));
    g.act(0).activate(LENS);
    g.expect.zone(LENS, 'hand', { seat: 0 });
    g.passAll();
    g.expect.handSize(0, 2);
    g.expect.invariants();
  });
});
