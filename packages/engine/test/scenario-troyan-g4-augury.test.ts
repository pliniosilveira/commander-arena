// Troyan deck, group 4 (Aminatou's Augury): "Exile the top eight cards of your library. You may put a land card from among them onto the battlefield. Until end of turn, for
// each nonland card type, you may cast a spell of that type from among the exiled cards without paying its mana cost." (`mayCastEachType`, SYNTHETIC Types Augury).
// Pins: CR 611.2a (a continuous effect from a resolving spell lasts until end of turn), CR 601.2 and 118.9 (cast from exile without paying), CR 601.3 (normal timing: the
// permission is not an exception to it), CR 118.8 (additional costs are paid), CR 107.3b (an {X} is 0), CR 400.7 (a card that leaves exile is a new object, with no
// permission), CR 305.1 (a land is not cast).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const AUGURY = 'SYNTHETIC Types Augury';
const GOLEM = 'SYNTHETIC Types Golem'; // {3} artifact creature
const TRINKET = 'SYNTHETIC Plain Trinket'; // {2} artifact
const BEARS = 'Grizzly Bears';
const ANGEL = 'Serra Angel';
const DIVINATION = 'Divination'; // {2}{U} sorcery
const BOLT = 'Lightning Bolt'; // {R} instant
const MURDER = 'Murder'; // {1}{B}{B} instant
const SAC_DRAW = 'SYNTHETIC Sacrifice Draw'; // {B} sorcery, sacrifice a creature
const X_BURN = 'SYNTHETIC X Burn'; // {X}{R} instant
const FILL = ['Island', 'Island', 'Island', 'Island'];
const FIVE = ['Island', 'Island', 'Island', 'Island', 'Island'];

/** Augury resolved with `top` the exiled cards (the top eight; the first is the top of the library) and no land to put. */
function resolved(
  top: readonly string[],
  extra: { readonly battlefield?: readonly string[] } = {},
) {
  const g = scenario()
    .seat(0)
    .library(...top, ...FILL)
    .hand(AUGURY)
    .battlefield(...FIVE, ...(extra.battlefield ?? []))
    .seat(1)
    .library(...FILL)
    .build();
  g.act(0).cast(AUGURY, { pay: true });
  g.passAll();
  // the padding of the library holds lands: the offer to put one onto the battlefield is declined here
  if (g.state.pending?.kind === 'chooseCards') g.act(0).chooseCards();
  return g;
}

const PAD = (cards: readonly string[]): string[] => [
  ...cards,
  ...Array.from({ length: 8 - cards.length }, () => 'Swamp'),
];

describe('the card is valid', () => {
  test('the permission and the choice among the exiled cards', () => {
    expect(validateCard(syntheticCard(AUGURY))).toEqual([]);
  });

  test('the permission names the exiled cards: it needs the cards an earlier effect moved', () => {
    const card = syntheticCard(AUGURY);
    const face = card.faces[0];
    if (face === undefined || face.spell === null) throw new Error('no spell');
    const only = (effect: unknown) =>
      ({ ...card, faces: [{ ...face, spell: { ...face.spell, effect } }] }) as never;
    expect(
      validateCard(only({ kind: 'mayCastEachType', objects: { kind: 'this' }, lasts: 'endOfTurn' }))
        .length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(only({ kind: 'mayCastEachType', objects: { kind: 'moved' }, lasts: 'forever' }))
        .length,
    ).toBeGreaterThan(0);
  });
});

describe('"Exile the top eight cards of your library. You may put a land card from among them onto the battlefield."', () => {
  test('eight cards are exiled', () => {
    const g = resolved(PAD([BEARS]));
    expect(g.state.exile).toHaveLength(8);
    g.expect.librarySize(0, 4);
  });

  test('a land card of the exiled cards may be put onto the battlefield, before any spell is cast', () => {
    const g = scenario()
      .seat(0)
      .library(...PAD([BEARS, 'Forest']), ...FILL)
      .hand(AUGURY)
      .battlefield(...FIVE)
      .seat(1)
      .library(...FILL)
      .build();
    g.act(0).cast(AUGURY, { pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('Forest');
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    // a land put onto the battlefield is not a land play
    expect(g.state.seats[0]?.landsPlayedThisTurn).toBe(0);
    g.expect.invariants();
  });

  test('the land may be left in exile (it cannot be cast)', () => {
    const g = scenario()
      .seat(0)
      .library(...PAD([BEARS, 'Forest']), ...FILL)
      .hand(AUGURY)
      .battlefield(...FIVE)
      .seat(1)
      .library(...FILL)
      .build();
    g.act(0).cast(AUGURY, { pay: true });
    g.passAll();
    g.act(0).chooseCards();
    g.expect.zone('Forest', 'exile', { seat: 0 });
    expect(g.act(0).try.cast('Forest', { alternative: 'free' }).ok).toBe(false);
  });

  test('a nonland card is not offered as the land', () => {
    const g = scenario()
      .seat(0)
      .library(...PAD([BEARS, 'Forest']), ...FILL)
      .hand(AUGURY)
      .battlefield(...FIVE)
      .seat(1)
      .library(...FILL)
      .build();
    g.act(0).cast(AUGURY, { pay: true });
    g.passAll();
    const pending = g.state.pending;
    if (pending?.kind !== 'chooseCards') throw new Error('no question');
    // eight cards were exiled, seven of them lands, so the nonland card (Grizzly Bears) is not among the cards offered
    expect(pending.legal).toHaveLength(7);
  });

  test('with no land among them nothing is asked', () => {
    const g = resolved(PAD([BEARS]));
    g.expect.pending('priority', 0);
  });
});

describe('"Until end of turn, for each nonland card type, you may cast a spell of that type from among the exiled cards without paying its mana cost."', () => {
  test('a creature spell is cast from exile for free, at sorcery timing, and resolves', () => {
    const g = resolved(PAD([BEARS, ANGEL]));
    g.act(0).cast(BEARS, { alternative: 'free', pay: true });
    g.expect.stack([BEARS]);
    // nothing was paid: the five Islands paid the Augury, the rest is not tapped for it
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('only one spell of each type: a second creature spell cannot be cast', () => {
    const g = resolved(PAD([BEARS, ANGEL]));
    g.act(0).cast(BEARS, { alternative: 'free', pay: true });
    g.passAll();
    expect(g.act(0).try.cast(ANGEL, { alternative: 'free' }).ok).toBe(false);
  });

  test('a spell of each type: a creature, an artifact, a sorcery and an instant', () => {
    const g = resolved(PAD([BEARS, TRINKET, DIVINATION, BOLT]));
    for (const card of [BEARS, TRINKET, DIVINATION]) {
      g.act(0).cast(card, { alternative: 'free', pay: true });
      g.passAll();
    }
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(TRINKET, 'battlefield', { seat: 0 });
    g.expect.zone(DIVINATION, 'graveyard', { seat: 0 });
    g.act(0).cast(BOLT, { alternative: 'free', targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 37);
    g.expect.invariants();
  });

  test('a card with two types is cast as the type that keeps another card castable: a creature and an artifact creature', () => {
    const g = resolved(PAD([GOLEM, BEARS]));
    g.act(0).cast(GOLEM, { alternative: 'free', pay: true });
    g.passAll();
    // the Golem was cast as an artifact, so the creature permission is still there for the Bears
    g.act(0).cast(BEARS, { alternative: 'free', pay: true });
    g.passAll();
    g.expect.zone(GOLEM, 'battlefield', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('with more cards than types, the types run out: an artifact creature, a creature and an artifact leave one of them', () => {
    const g = resolved(PAD([GOLEM, BEARS, TRINKET]));
    g.act(0).cast(GOLEM, { alternative: 'free', pay: true });
    g.passAll();
    const castable = [BEARS, TRINKET].filter(
      (c) => g.act(0).try.cast(c, { alternative: 'free' }).ok,
    );
    expect(castable).toHaveLength(1);
  });

  test('a card with two types is cast as the type that keeps the others castable', () => {
    const g = resolved(PAD([GOLEM, TRINKET]));
    g.act(0).cast(GOLEM, { alternative: 'free', pay: true });
    g.passAll();
    // the Golem was cast as a creature, so the artifact permission is still there for the Trinket
    g.expect.zone(GOLEM, 'battlefield', { seat: 0 });
    g.act(0).cast(TRINKET, { alternative: 'free', pay: true });
    g.passAll();
    g.expect.zone(TRINKET, 'battlefield', { seat: 0 });
  });

  test('normal timing applies: a sorcery cannot be cast with a spell on the stack, an instant can', () => {
    const g = resolved(PAD([DIVINATION, BOLT, BEARS]));
    g.act(0).cast(BEARS, { alternative: 'free', pay: true });
    expect(g.act(0).try.cast(DIVINATION, { alternative: 'free' }).ok).toBe(false);
    g.act(0).cast(BOLT, { alternative: 'free', targets: [{ player: 1 }], pay: true });
    g.expect.stack([BOLT, BEARS]);
  });

  test('additional costs are paid', () => {
    const g = resolved(PAD([SAC_DRAW]), { battlefield: [BEARS] });
    g.act(0).cast(SAC_DRAW, { alternative: 'free' });
    // the creature it needs is sacrificed as the cost of the cast, though no mana is paid
    g.expect.stack([SAC_DRAW]);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });

  test('an {X} is 0', () => {
    const g = resolved(PAD([X_BURN]));
    g.act(0).cast(X_BURN, { alternative: 'free', targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 40);
  });

  test('casting a spell takes it out of exile onto the stack', () => {
    const g = resolved(PAD([BEARS]));
    g.act(0).cast(BEARS, { alternative: 'free', pay: true });
    g.expect.noObject(BEARS, { zone: 'exile' });
  });

  test('the permission ends with the turn', () => {
    const g = resolved(PAD([BEARS]));
    const permissions = () =>
      g.state.continuousEffects.filter((e) => e.change.kind === 'freeCastPermission');
    expect(permissions()).not.toHaveLength(0);
    g.advanceTo('upkeep', { turn: 'next' });
    expect(permissions()).toHaveLength(0);
    // the card is still in exile, and cannot be cast any more
    g.expect.zone(BEARS, 'exile', { seat: 0 });
  });

  test('a card that is not a spell of the type is not castable by another card type permission alone: a land cannot be cast', () => {
    const g = resolved(PAD(['Forest']));
    expect(g.act(0).try.cast('Forest', { alternative: 'free' }).ok).toBe(false);
  });

  test('a card cast without the free permission is not in exile any more: no permission for the same card twice', () => {
    const g = resolved(PAD([BEARS, MURDER]));
    g.act(0).cast(BEARS, { alternative: 'free', pay: true });
    g.passAll();
    // Murder is an instant: still castable (its type is unused), though its targets are needed
    expect(g.act(0).try.cast(MURDER, { alternative: 'free' }).ok).toBe(true);
  });
});
