// Issue 104 (God-Pharaoh's Gift, The Scarab God): "you may exile a creature card from your graveyard. If you do, create a token that's a copy of that card, except it's a 4/4 black Zombie.
// It gains haste until end of turn." and "{2}{U}{B}: Exile target creature card from a graveyard. Create a token that's a copy of it, except it's a 4/4 black Zombie."
// Pins: CR 608.2d (the player chooses the card and may choose none), CR 608.2c ("if you do" reads what the offer did), CR 400.7 (the exiled card is a new object, what `moved` names),
// CR 707.2 and 111.4 (a token that is a copy has the copiable values of the card), CR 707.9b (the exception sets the final P/T, color and creature types: they are the copiable values),
// CR 707.9d (a characteristic-defining ability the exception overrides is not copied), CR 702.10 (haste), CR 514.2 (until end of turn). Cards are SYNTHETIC
// (src/cards/fixtures/synthetic-graveyard-copy.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { getView, syntheticCard, validateCard } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';

const IDOL = 'SYNTHETIC Grave Idol'; // {7} artifact: the shape of God-Pharaoh's Gift
const SCHOLAR = 'SYNTHETIC Grave Reader'; // mills a card first, then the same offer
const SCARAB = 'SYNTHETIC Grave Scarab'; // the activated ability of The Scarab God
const BEARS = 'Grizzly Bears'; // {1}{G} Bear 2/2
const ELVES = 'Llanowar Elves'; // {G} Elf Druid 1/1, {T}: add {G}
const FILLER = Array.from({ length: 14 }, () => 'Plains');

const bf = (name: string, seat: 0 | 1 = 0) => ({ name, zone: 'battlefield', seat }) as const;
const tokens = (g: ScenarioGame, name: string, seat: 0 | 1 = 0) =>
  g.find({ name, zone: 'battlefield', seat }).filter((o) => o.token !== null);

describe('the cards are valid', () => {
  test.each([IDOL, SCHOLAR, SCARAB])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('a moveToZone into exile is only a choice of cards in the hand or the graveyard', () => {
    const card = syntheticCard(IDOL);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const withMove = (objects: unknown) =>
      ({
        ...card,
        faces: [
          {
            ...face,
            abilities: [
              {
                kind: 'triggered',
                trigger: { kind: 'step', step: 'beginCombat', whose: 'you' },
                effect: { kind: 'moveToZone', objects, to: 'exile' },
              },
            ],
          },
        ],
      }) as never;
    const choose = (zone: string) => ({
      kind: 'choose',
      filter: { zone, controller: 'you', types: ['creature'] },
    });
    expect(validateCard(withMove(choose('graveyard')))).toEqual([]);
    expect(validateCard(withMove(choose('hand')))).toEqual([]);
    expect(validateCard(withMove(choose('battlefield'))).length).toBeGreaterThan(0);
    expect(validateCard(withMove({ kind: 'this' })).length).toBeGreaterThan(0);
  });

  test('a copy may be made from the card the effect before it moved, and only after such an effect', () => {
    const card = syntheticCard(IDOL);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const copy = {
      kind: 'createToken',
      token: { kind: 'copyOf', object: { kind: 'moved' } },
      count: 1,
    };
    const only = (effect: unknown) =>
      ({
        ...card,
        faces: [
          {
            ...face,
            abilities: [
              {
                kind: 'triggered',
                trigger: { kind: 'step', step: 'beginCombat', whose: 'you' },
                effect,
              },
            ],
          },
        ],
      }) as never;
    expect(validateCard(only(copy)).length).toBeGreaterThan(0);
  });
});

describe('"At the beginning of combat on your turn, you may exile a creature card from your graveyard. If you do, create a token that\'s a copy of that card, except it\'s a 4/4 black Zombie. It gains haste until end of turn."', () => {
  const start = (graveyard: readonly string[] = [BEARS]): ScenarioGame =>
    scenario()
      .seat(0)
      .graveyard(...graveyard)
      .battlefield(IDOL)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is exiled and the token is a 4/4 black Zombie copy of it with haste', () => {
    const g = start();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    // One card to choose from: the player is still offered it (they may choose none).
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards(BEARS);
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.noObject(BEARS, { zone: 'graveyard' });
    g.passAll();
    expect(tokens(g, BEARS)).toHaveLength(1);
    g.expect.pt(bf(BEARS), 4, 4);
    g.expect.derived(bf(BEARS), {
      types: ['creature'],
      subtypes: ['Zombie'],
      colors: ['B'],
      keywords: ['haste'],
    });
    g.expect.invariants();
  });

  test('the haste lasts until end of turn only (CR 514.2)', () => {
    const g = start();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.act(0).chooseCards(BEARS);
    g.passAll();
    g.expect.derived(bf(BEARS), { keywords: ['haste'] });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.derived(bf(BEARS), { keywords: [] });
  });

  test('declining the offer exiles nothing and makes no token (CR 608.2d, 608.2c)', () => {
    const g = start();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.act(0).chooseCards();
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    expect(tokens(g, BEARS)).toHaveLength(0);
    g.expect.invariants();
  });

  test('with no creature card in the graveyard nothing is asked and nothing is made', () => {
    const g = start([]);
    g.advanceTo('beginningOfCombat');
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    expect(tokens(g, BEARS)).toHaveLength(0);
  });

  test("it is the controller's graveyard that is searched, and only for creature cards", () => {
    const g = scenario()
      .seat(0)
      .graveyard('Lightning Bolt')
      .battlefield(IDOL)
      .library(...FILLER)
      .seat(1)
      .graveyard(ELVES)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    // No creature card in your graveyard: the opponent's is not offered, and nothing is asked.
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.zone(ELVES, 'graveyard', { seat: 1 });
  });

  test('with two creature cards the one chosen is the one copied', () => {
    const g = start([BEARS, ELVES]);
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.act(0).chooseCards(ELVES);
    g.passAll();
    expect(tokens(g, ELVES)).toHaveLength(1);
    expect(tokens(g, BEARS)).toHaveLength(0);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.pt(bf(ELVES), 4, 4);
    // The copy keeps the abilities of the card (CR 707.2): {T}: add {G}.
    g.expect.derived(bf(ELVES), { subtypes: ['Zombie'] });
  });

  test('the token keeps the rest of the copiable values (the mana cost) and is a token (CR 707.2, 111.4)', () => {
    const g = start([ELVES]);
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.act(0).chooseCards(ELVES);
    g.passAll();
    const shown = getView(g.state, 0).battlefield.find((o) => o.name === ELVES);
    expect(shown?.isToken).toBe(true);
    expect(shown?.manaCost).toEqual(['G']);
  });
});

describe('"If you do" reads the offer, not an instruction before it (CR 608.2c)', () => {
  const start = () =>
    scenario()
      .seat(0)
      .graveyard(BEARS)
      .battlefield(SCHOLAR)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card milled first does not make a declined offer "done": nothing is drawn', () => {
    const g = start();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.act(0).chooseCards();
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.handSize(0, 0);
  });

  test('an accepted offer is done: a card is drawn', () => {
    const g = start();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.act(0).chooseCards(BEARS);
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.handSize(0, 1);
  });
});

describe('"{2}{U}{B}: Exile target creature card from a graveyard. Create a token that\'s a copy of it, except it\'s a 4/4 black Zombie."', () => {
  const start = (): ScenarioGame =>
    scenario()
      .seat(0)
      .battlefield(SCARAB, 'Island', 'Island', 'Swamp', 'Swamp')
      .library(...FILLER)
      .seat(1)
      .graveyard(ELVES)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test("a creature card of the opponent's graveyard is exiled and copied as a 4/4 black Zombie under your control", () => {
    const g = start();
    g.act(0).activate(SCARAB, {
      pay: true,
      targets: [{ name: ELVES, zone: 'graveyard', seat: 1 }],
    });
    g.passAll();
    g.expect.zone(ELVES, 'exile', { seat: 1 });
    expect(tokens(g, ELVES, 0)).toHaveLength(1);
    g.expect.pt(bf(ELVES), 4, 4);
    g.expect.derived(bf(ELVES), { subtypes: ['Zombie'], colors: ['B'] });
  });
});
