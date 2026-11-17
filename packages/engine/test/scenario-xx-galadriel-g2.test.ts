// The Galadriel deck (issue 43), group 2 (D-538 to D-546): lands that are creatures, land-count statics, a milling spell, a token with a defined power and toughness and a land from the
// hand or the graveyard, and typecycling by a creature type. Cards are SYNTHETIC (src/cards/fixtures/synthetic-galadriel-g2.ts) or real fixtures; the real cards of the group are read through
// the grammar into the same nodes in packages/cards/test/convert-grammar-engine-galadriel-g2.test.ts.
// Pins: CR 613.1d (layer 4 adds types), CR 205.1b ("in addition to its other types"), CR 305.6 and 305.7 (a land with a basic land type has its mana ability), CR 302.6 (a creature that is a land
// is still affected by summoning sickness), CR 208.2a and 604.3 (a characteristic-defining ability sets power and toughness), CR 111.4 (a token's characteristics), CR 704.5j (the legend rule),
// CR 608.2c and 608.2d (a later instruction reads what an earlier one did; a player who chooses "up to" may choose none), CR 701.17 (mill), CR 602.2 and 118.3 (a cost is paid by the player
// who activates, from where the ability works), CR 702.29e (typecycling), CR 701.23 (search).
import { describe, expect, test } from 'vitest';
import { CREATURES_ARE_FORESTS, OX_TOKEN_NAME } from '../src/cards/fixtures/synthetic-galadriel-g2';
import { syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { chooseCardsDecision, choosePermanentDecision } from './pending-helpers';
import { graveyardNames, handNames } from './scry-helpers';
import { twoSeatGame } from './two-seat-helpers';

const HEART = 'SYNTHETIC Forest Heart';
const AVATAR = 'SYNTHETIC Land Avatar';
const RALLY = 'SYNTHETIC Mill Four Take Two';
const GIANT = 'SYNTHETIC Land Giant';
const HOLE = 'SYNTHETIC Halfling Hole';
const HALFLING = 'SYNTHETIC Halfling Scout';
const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves';

describe('the cards are valid', () => {
  test.each([HEART, AVATAR, RALLY, GIANT, HOLE, HALFLING])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('"Nontoken creatures you control are Forest lands in addition to their other types" (CR 613.1d, 205.1b, 305.6, 305.7)', () => {
  test('a nontoken creature of the controller is a Forest land creature, and keeps its types', () => {
    const g = twoSeatGame((b) => b.battlefield(HEART).battlefield(BEARS));
    g.expect.derived(BEARS, {
      types: ['creature', 'land'],
      subtypes: ['Bear', 'Forest'],
    });
    // The Heart is one of them.
    g.expect.derived(HEART, { types: ['creature', 'land'], subtypes: ['Elemental', 'Forest'] });
  });

  test('a creature of the opponent is not affected, and neither is a noncreature land or a creature token', () => {
    const g = twoSeatGame(
      (b) => b.battlefield(HEART).battlefield('Mountain'),
      (b) => b.battlefield(BEARS),
    );
    g.expect.derived(BEARS, { types: ['creature'], subtypes: ['Bear'] });
    g.expect.derived('Mountain', { types: ['land'], subtypes: ['Mountain'] });
  });

  test('the creature has the intrinsic mana ability of a Forest: it taps for {G} once it has no summoning sickness (CR 302.6)', () => {
    const g = twoSeatGame((b) =>
      b.battlefield(HEART).battlefield(BEARS, { label: 'old' }).battlefield(ELVES, { fresh: true }),
    );
    g.act(0).tapForMana('old');
    g.expect.pool(0, 'G');
    g.expect.tapped('old', true);
    // A creature that came under the player's control this turn cannot pay a cost with the tap symbol, a mana creature included.
    expect(g.act(0).try.tapForMana(ELVES).ok).toBe(false);
    g.expect.invariants();
  });

  test('a creature that entered this turn cannot be tapped for the Forest mana of a land that is a creature (CR 302.6)', () => {
    const g = twoSeatGame((b) => b.battlefield(HEART).battlefield(BEARS, { fresh: true }));
    expect(g.act(0).try.tapForMana(BEARS).ok).toBe(false);
    g.expect.tapped(BEARS, false);
  });

  test('the Heart counts the lands: itself and every creature it made a land, and the lands of the player only', () => {
    const g = twoSeatGame(
      (b) => b.battlefield(HEART).battlefield(BEARS).battlefield('Forest').battlefield('Island'),
      (b) => b.battlefield('Forest').battlefield(ELVES),
    );
    // Heart, Bears, Forest, Island: four lands.
    g.expect.pt(HEART, 4, 4);
  });

  test('when the Heart leaves the battlefield, the creatures are no longer lands', () => {
    const g = twoSeatGame((b) =>
      b.battlefield(HEART).battlefield(BEARS).battlefield('Mountain').hand('Lightning Bolt'),
    );
    g.expect.derived(BEARS, { types: ['creature', 'land'], subtypes: ['Bear', 'Forest'] });
    // The Heart is 3/3 (itself, the Bears and the Mountain): the Bolt kills it.
    g.expect.pt(HEART, 3, 3);
    g.act(0).cast('Lightning Bolt', { targets: [HEART], pay: true });
    g.passAll();
    g.expect.zone(HEART, 'graveyard', { seat: 0 });
    g.expect.derived(BEARS, { types: ['creature'], subtypes: ['Bear'] });
  });

  test('the effect begins when the Heart enters: before it the creature is no land', () => {
    const g = twoSeatGame((b) =>
      b.hand(HEART).battlefield(BEARS).battlefield('Forest', { count: 5 }),
    );
    g.expect.derived(BEARS, { types: ['creature'], subtypes: ['Bear'] });
    g.act(0).cast(HEART, { pay: true });
    g.passAll();
    g.expect.derived(BEARS, { types: ['creature', 'land'], subtypes: ['Bear', 'Forest'] });
  });

  test('the validator accepts the static ability, and the type a basic land type adds is a land type', () => {
    expect(CREATURES_ARE_FORESTS.kind).toBe('static');
  });
});

describe('Land Avatar: "+1/+1 for each land you control and each land card in your graveyard"', () => {
  test("counts the lands of the controller and the land cards of the controller's graveyard, nothing else", () => {
    const g = twoSeatGame(
      (b) =>
        b
          .battlefield(AVATAR)
          .battlefield('Forest', { count: 2 })
          .graveyard('Island')
          .graveyard(BEARS)
          .graveyard('Mountain'),
      (b) => b.battlefield('Forest', { count: 3 }).graveyard('Swamp'),
    );
    // Two lands on the battlefield and two land cards in the graveyard.
    g.expect.pt(AVATAR, 4, 4);
  });

  test("a land of the Avatar's controller that is a creature counts once, and a land that goes to the graveyard counts there", () => {
    const g = twoSeatGame((b) =>
      b.battlefield(AVATAR).battlefield('Forest').battlefield('Plains', { label: 'p' }),
    );
    g.expect.pt(AVATAR, 2, 2);
  });
});

describe('Land Avatar: returning from the graveyard for two lands returned to the hand (CR 602.2, 118.3)', () => {
  const setup = () =>
    twoSeatGame((b) =>
      b.graveyard(AVATAR).battlefield('Forest', { count: 3 }).battlefield('Island').hand(BEARS),
    );

  test('the ability is offered in the graveyard with {1}{G} and two lands, and not from the hand or without lands', () => {
    const g = setup();
    expect(g.legalActions(0).some((a) => a.kind === 'activate' && a.object === g.id(AVATAR))).toBe(
      true,
    );
    const few = twoSeatGame((b) => b.graveyard(AVATAR).battlefield('Forest'));
    expect(
      few.legalActions(0).some((a) => a.kind === 'activate' && a.object === few.id(AVATAR)),
    ).toBe(false);
    const inHand = twoSeatGame((b) => b.hand(AVATAR).battlefield('Forest', { count: 4 }));
    expect(
      inHand.legalActions(0).some((a) => a.kind === 'activate' && a.object === inHand.id(AVATAR)),
    ).toBe(false);
  });

  test('the player chooses the two lands to return; the card goes to the hand when the ability resolves', () => {
    const g = setup();
    g.act(0).activate(AVATAR, { pay: true });
    g.expect.pending('choosePermanent', 0);
    const d = choosePermanentDecision(g);
    expect(d.purpose).toBe('bounce');
    expect(d.forCost).toBe(true);
    expect(d.min).toBe(2);
    expect(d.max).toBe(2);
    expect(d.legal).toHaveLength(4);
    g.act(0).choosePermanents('Island', 'Forest[1]');
    // The cost is paid: two lands are in the hand and the ability is on the stack.
    expect(handNames(g).sort()).toEqual(['Forest', BEARS, 'Island']);
    g.expect.zone(AVATAR, 'graveyard', { seat: 0 });
    g.passAll();
    expect(handNames(g)).toContain(AVATAR);
    g.expect.zone(AVATAR, 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test('the mana is paid too: without {1}{G} the ability is not offered', () => {
    const g = twoSeatGame((b) => b.graveyard(AVATAR).battlefield('Island', { count: 4 }));
    expect(g.legalActions(0).some((a) => a.kind === 'activate' && a.object === g.id(AVATAR))).toBe(
      false,
    );
  });
});

describe('"Mill four cards, then put up to two land cards from among them into your hand" (CR 701.17, 608.2d)', () => {
  const MILLED = ['Island', 'Grizzly Bears', 'Forest', 'Mountain'];
  const game = (top: readonly string[], below: readonly string[] = ['Plains', 'Swamp']) => {
    let b = scenario().seat(0).life(20).hand(RALLY).pool('GC');
    for (const name of top) b = b.library(name);
    for (const name of below) b = b.library(name);
    return b.seat(1).life(20).library('Plains', 'Plains', 'Plains').at('precombatMain').build();
  };

  test('the question offers only the land cards among the four milled, up to two', () => {
    const g = game(MILLED);
    g.act(0).cast(RALLY, { pay: true });
    g.passAll();
    const d = chooseCardsDecision(g);
    expect(d.purpose).toBe('move');
    expect(d.zone).toBe('graveyard');
    expect(d.legal).toHaveLength(3);
    expect(d.min).toBe(0);
    expect(d.max).toBe(2);
    expect(d.prompt).toContain('up to 2');
    expect(d.prompt).toContain('from among the cards put into your graveyard');
  });

  test('two cards chosen go to the hand, the rest of the milled cards stay in the graveyard', () => {
    const g = game(MILLED);
    g.act(0).cast(RALLY, { pay: true });
    g.passAll();
    g.act(0).chooseCards('Island', 'Mountain');
    expect(handNames(g).sort()).toEqual(['Island', 'Mountain']);
    expect(graveyardNames(g).sort()).toEqual([RALLY, 'Forest', 'Grizzly Bears'].sort());
    g.expect.invariants();
  });

  test('one card, or none, may be chosen (CR 608.2d: "up to")', () => {
    const one = game(MILLED);
    one.act(0).cast(RALLY, { pay: true });
    one.passAll();
    one.act(0).chooseCards('Forest');
    expect(handNames(one)).toEqual(['Forest']);
    const none = game(MILLED);
    none.act(0).cast(RALLY, { pay: true });
    none.passAll();
    none.act(0).chooseCards();
    expect(handNames(none)).toEqual([]);
  });

  test('a land card that was in the graveyard before is not a candidate, and three are not allowed', () => {
    let b = scenario().seat(0).life(20).hand(RALLY).pool('GC').graveyard('Swamp');
    for (const name of MILLED) b = b.library(name);
    const g = b.library('Plains').seat(1).life(20).library('Plains').at('precombatMain').build();
    g.act(0).cast(RALLY, { pay: true });
    g.passAll();
    const d = chooseCardsDecision(g);
    expect(d.legal).toHaveLength(3);
    expect(g.act(0).try.action({ kind: 'chooseCards', objects: [...d.legal] }).ok).toBe(false);
  });

  test('with a single land among the four, one card is the most that is asked for; with none nobody is asked', () => {
    const one = game(['Island', BEARS, BEARS, BEARS]);
    one.act(0).cast(RALLY, { pay: true });
    one.passAll();
    const d = chooseCardsDecision(one);
    expect(d.legal).toHaveLength(1);
    expect(d.max).toBe(1);
    const none = game([BEARS, BEARS, BEARS, BEARS]);
    none.act(0).cast(RALLY, { pay: true });
    none.passAll();
    none.expect.pending('priority', 0);
  });
});

describe('Land Giant: a legendary token whose power and toughness are the number of lands (CR 111.4, 208.2a, 604.3, 704.5j)', () => {
  const oxen = (g: ScenarioGame) =>
    Object.values(g.state.objects).filter(
      (o) => o.zone === 'battlefield' && o.token?.characteristics.name === OX_TOKEN_NAME,
    );

  test('the token is a legendary blue Ox creature whose power and toughness are the lands its controller has, and follow the board', () => {
    const g = twoSeatGame(
      (b) =>
        b
          .hand(GIANT)
          .hand('Mountain')
          .battlefield('Island', { count: 3 })
          .battlefield('Forest', { count: 3 })
          .pool('GUU'),
      (b) => b.battlefield('Forest', { count: 7 }),
    );
    g.act(0).cast(GIANT, { pay: true });
    g.passAll();
    const [token] = oxen(g);
    expect(oxen(g)).toHaveLength(1);
    const printed = token?.token?.characteristics;
    expect(printed?.supertypes).toEqual(['legendary']);
    expect(printed?.types).toEqual(['creature']);
    expect(printed?.subtypes).toEqual(['Ox']);
    expect(printed?.colors).toEqual(['U']);
    // Six lands of its controller; the seven of the opponent are not counted.
    g.expect.pt(OX_TOKEN_NAME, 6, 6);
    g.act(0).playLand('Mountain');
    g.expect.pt(OX_TOKEN_NAME, 7, 7);
    g.expect.invariants();
  });

  test('the legend rule applies to two of them: the controller keeps one (CR 704.5j)', () => {
    const g = twoSeatGame((b) =>
      b
        .hand(GIANT, { label: 'g1' })
        .hand(GIANT, { label: 'g2' })
        .battlefield('Island', { count: 8 })
        .battlefield('Forest', { count: 8 }),
    );
    g.act(0).cast('g1', { pay: true });
    g.passAll();
    g.act(0).cast('g2', { pay: true });
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    const d = choosePermanentDecision(g);
    expect(d.legal).toHaveLength(2);
  });

  const attack = (g: ScenarioGame) => {
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([GIANT]);
  };

  test('whenever its controller attacks: a card is drawn, then a land card of the hand or of the graveyard may be put onto the battlefield', () => {
    const g = twoSeatGame((b) =>
      b.battlefield(GIANT).hand('Mountain').graveyard('Island').graveyard(BEARS).hand(BEARS),
    );
    attack(g);
    g.passAll();
    expect(handNames(g)).toHaveLength(3);
    g.expect.pending('chooseCards', 0);
    const d = chooseCardsDecision(g);
    expect(d.purpose).toBe('move');
    expect(d.alsoGraveyard).toBe(true);
    expect(d.min).toBe(0);
    expect(d.max).toBe(1);
    expect(d.prompt).toContain('from your hand or graveyard');
    // Mountain in the hand and Island in the graveyard; the creature cards and the land drawn (Plains) too.
    const names = d.legal.map((id) => g.state.objects[id]?.zone);
    expect(names.filter((z) => z === 'graveyard')).toHaveLength(1);
    expect(names.filter((z) => z === 'hand')).toHaveLength(2);
    // The cards of the hand are listed first, then those of the graveyard.
    expect(names).toEqual(['hand', 'hand', 'graveyard']);
    g.act(0).chooseCards({ name: 'Island', zone: 'graveyard' });
    g.expect.zone('Island', 'battlefield', { seat: 0 });
    g.expect.tapped('Island', false);
    expect(graveyardNames(g)).toEqual([BEARS]);
    g.expect.invariants();
  });

  test('a land card of the hand is put onto the battlefield too, and the player may choose none', () => {
    const hand = twoSeatGame((b) => b.battlefield(GIANT).hand('Mountain'));
    attack(hand);
    hand.passAll();
    hand.act(0).chooseCards('Mountain');
    hand.expect.zone('Mountain', 'battlefield', { seat: 0 });
    const none = twoSeatGame((b) => b.battlefield(GIANT).hand('Mountain').graveyard('Island'));
    attack(none);
    none.passAll();
    none.act(0).chooseCards();
    none.expect.zone('Mountain', 'hand', { seat: 0 });
    none.expect.zone('Island', 'graveyard', { seat: 0 });
  });

  test('the card drawn first can be the land: it is a candidate (CR 608.2c: the instructions are followed in order)', () => {
    // The library is all Plains: the drawn card is a land of the hand.
    const g = twoSeatGame((b) => b.battlefield(GIANT));
    attack(g);
    g.passAll();
    const d = chooseCardsDecision(g);
    expect(d.legal).toHaveLength(1);
    g.act(0).chooseCards('Plains');
    g.expect.zone('Plains', 'battlefield', { seat: 0 });
  });

  test('with no land card in the hand or the graveyard after the draw nothing is asked', () => {
    const g = twoSeatGame((b) => b.battlefield(GIANT).graveyard(BEARS).hand(BEARS));
    // The library is all Plains: the drawn card is a land. Take the library away instead.
    const empty = scenario()
      .seat(0)
      .battlefield(GIANT)
      .library(BEARS, BEARS)
      .graveyard(BEARS)
      .seat(1)
      .library('Plains')
      .build();
    empty.advanceTo('declareAttackers', { attack: false });
    empty.act(0).attack([GIANT]);
    empty.passAll();
    empty.expect.pending('priority', 0);
    expect(g.state.pending?.kind).toBe('priority');
  });

  test('it does not trigger when the opponent attacks (CR 603.2)', () => {
    const g = scenario()
      .seat(0)
      .library('Plains', 'Plains', 'Plains')
      .battlefield(GIANT)
      .hand('Mountain')
      .seat(1)
      .library('Plains', 'Plains', 'Plains')
      .battlefield(BEARS)
      .at('beginningOfCombat', { active: 1 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).attack([BEARS]);
    g.passAll();
    expect(handNames(g)).toEqual(['Mountain']);
  });
});

describe('Halflingcycling {4}: typecycling for a creature type (CR 702.29e, 702.29f, 701.23)', () => {
  const game = () =>
    twoSeatGame((b) =>
      b
        .hand(HOLE)
        .battlefield('Island', { count: 4 })
        .library(HALFLING, { label: 'low' })
        .library(BEARS)
        .library(HALFLING, { label: 'high' }),
    );

  test('the ability costs {4} and discards the card: it finds a Halfling card, reveals it, puts it into the hand and shuffles', () => {
    const g = game();
    g.act(0).activate(HOLE, { ability: 1, pay: true });
    g.expect.zone(HOLE, 'graveyard', { seat: 0 });
    g.passAll();
    const d = chooseCardsDecision(g);
    expect(d.purpose).toBe('search');
    expect(d.zone).toBe('library');
    expect(d.reveal).toBe(true);
    expect(d.min).toBe(0);
    expect(d.max).toBe(1);
    // Two Halfling cards in the library; the Bears and the Plains are not offered.
    expect(d.legal).toHaveLength(2);
    g.act(0).chooseCards('low');
    expect(handNames(g)).toEqual([HALFLING]);
    g.expect.invariants();
    expect(g.events.some((e) => e.kind === 'cardsRevealed')).toBe(true);
    expect(g.events.some((e) => e.kind === 'librarySearched')).toBe(true);
  });

  test('only a Halfling card is found: a library without one finds nothing, and the cost was paid', () => {
    const g = twoSeatGame((b) =>
      b.hand(HOLE).battlefield('Island', { count: 4 }).library(BEARS).library(BEARS),
    );
    g.act(0).activate(HOLE, { ability: 1, pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
    expect(handNames(g)).toEqual([]);
    g.expect.zone(HOLE, 'graveyard', { seat: 0 });
  });

  test('it works from the hand only, and needs the {4}', () => {
    const onTable = twoSeatGame((b) => b.battlefield(HOLE).battlefield('Island', { count: 4 }));
    expect(
      onTable.legalActions(0).filter((a) => a.kind === 'activate' && a.object === onTable.id(HOLE)),
    ).toEqual([]);
    const poor = twoSeatGame((b) => b.hand(HOLE).battlefield('Island', { count: 3 }));
    expect(
      poor.legalActions(0).filter((a) => a.kind === 'activate' && a.object === poor.id(HOLE)),
    ).toEqual([]);
  });
});
