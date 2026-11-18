// Omen cards (Tarkir: Dragonstorm): a card with a permanent face and a sorcery or instant face with the Omen subtype, on the Adventure machinery (cast either face from the hand, only
// the face cast exists on the stack), whose reminder text "Then shuffle this card into its owner's library" replaces the exile of an Adventure. The CR text for the Omen rule was not available
// when this was written, so the rule number is not cited: the behaviour is that of the printed reminder text. Cards are SYNTHETIC: a creature and an Omen built from the Adventure fixture.
// Also: "You may cast sorcery spells and Dragon spells as though they had flash." (CR 601.3b, 702.8a) with a choice of a card type and a creature type.
import { describe, expect, test } from 'vitest';
import {
  type CardDefinition,
  checkInvariants,
  getLegalActions,
  syntheticCard,
  validateCard,
} from '../src/index';
import { scenario } from '../src/testing/index';
import { viewOf } from './layout-helpers';

const OWL = syntheticCard('SYNTHETIC Wise Owl // Peek');
const OMEN_NAME = 'SYNTHETIC Sky Drake // Gust';
const OMEN: CardDefinition = {
  ...OWL,
  name: OMEN_NAME,
  faces: OWL.faces.map((f, i) =>
    i === 0
      ? { ...f, name: 'Sky Drake', subtypes: ['Dragon'] }
      : { ...f, name: 'Gust', subtypes: ['Omen'] },
  ),
};

describe("an Omen resolves into its owner's library, shuffled", () => {
  const build = () =>
    scenario()
      .define(OMEN)
      .seat(0)
      .hand(OMEN_NAME)
      .library('Plains', 'Plains', 'Plains')
      .battlefield('Island', 'Island', 'Island')
      .seat(1)
      .library('Forest', 'Forest')
      .build();

  test('the card is valid and offers both faces', () => {
    expect(validateCard(OMEN)).toEqual([]);
    const g = build();
    const faces = getLegalActions(g.state, 0)
      .filter((a) => a.kind === 'castSpell')
      .map((a) => (a.kind === 'castSpell' ? a.face : undefined));
    expect(faces).toEqual([0, 1]);
  });

  test('on the stack it is the Omen alone; resolving, it does its text and goes to the library, not exile or graveyard', () => {
    const g = build();
    g.act(0).cast(OMEN_NAME, { face: 1, pay: true });
    expect(viewOf(g, OMEN_NAME).name).toBe('Gust');
    g.passAll();
    g.expect.handSize(0, 1); // Gust drew a card
    g.expect.zone(OMEN_NAME, 'library', { seat: 0 });
    g.expect.noObject(OMEN_NAME, { zone: 'exile' });
    g.expect.noObject(OMEN_NAME, { zone: 'graveyard' });
    expect(g.object(OMEN_NAME).onAdventure).toBeUndefined();
    expect(g.state.seats[0]?.library.length).toBe(3); // 3 Plains - 1 drawn + the card
    expect(checkInvariants(g.state)).toEqual([]);
  });

  test("the owner's library is shuffled as it goes in (an event)", () => {
    const g = build();
    g.act(0).cast(OMEN_NAME, { face: 1, pay: true });
    g.passAll();
    expect(g.events.some((e) => e.kind === 'libraryShuffled' && e.seat === 0)).toBe(true);
  });

  test('the creature is cast from the hand as an ordinary card, and a countered Omen goes to the graveyard', () => {
    const g = scenario()
      .define(OMEN)
      .seat(0)
      .hand(OMEN_NAME)
      .library('Plains', 'Plains')
      .battlefield('Island', 'Island', 'Island', 'Island', 'Island')
      .seat(1)
      .hand('Counterspell')
      .battlefield('Island', 'Island')
      .build();
    g.act(0).cast(OMEN_NAME, { face: 1, pay: true });
    g.pass(0);
    g.act(1).cast('Counterspell', { targets: [{ name: 'Gust' }], pay: true });
    g.passAll();
    g.expect.zone(OMEN_NAME, 'graveyard', { seat: 0 });
    g.expect.noObject(OMEN_NAME, { zone: 'library' });
  });

  test('cast again after shuffling back: the library card is not castable (it is not an Adventure in exile)', () => {
    const g = build();
    g.act(0).cast(OMEN_NAME, { face: 1, pay: true });
    g.passAll();
    const castable = getLegalActions(g.state, 0).filter((a) => a.kind === 'castSpell');
    expect(castable).toEqual([]);
  });
});

describe('"You may cast sorcery spells and Dragon spells as though they had flash." (CR 601.3b)', () => {
  const GIVER: CardDefinition = {
    ...syntheticCard('SYNTHETIC Swift Cheapskate'),
    name: 'SYNTHETIC Storm Giver',
    faces: syntheticCard('SYNTHETIC Swift Cheapskate').faces.map((f) => ({
      ...f,
      abilities: [
        {
          kind: 'static' as const,
          static: {
            kind: 'castAsThoughFlash' as const,
            spells: {
              controller: 'you' as const,
              anyOf: [{ types: ['sorcery' as const] }, { subtypes: ['Dragon'] }],
            },
          },
        },
      ],
    })),
  };
  const GIVER_NAME = 'SYNTHETIC Storm Giver';
  const opponentsTurn = (...hand: string[]) =>
    scenario()
      .define(GIVER)
      .define(OMEN)
      .seat(0)
      .hand(...hand)
      .library('Plains', 'Plains')
      .battlefield(GIVER_NAME, 'Island', 'Island', 'Island', 'Island')
      .seat(1)
      .at('precombatMain', { active: 1, priority: 0 })
      .build();

  test("a sorcery and a Dragon creature are castable on the opponent's turn, a non-Dragon creature is not", () => {
    const g = opponentsTurn(OMEN_NAME, 'Grizzly Bears', 'Divination');
    g.expect.legal(0, { cast: OMEN_NAME, face: 0 }); // the Dragon creature
    g.expect.legal(0, { cast: OMEN_NAME, face: 1 }); // the sorcery Omen
    g.expect.legal(0, { cast: 'Divination' }); // a sorcery
    g.expect.illegal(0, { cast: 'Grizzly Bears' });
  });

  test('without the permanent, none of them is castable then', () => {
    const g = scenario()
      .define(OMEN)
      .seat(0)
      .hand(OMEN_NAME, 'Divination')
      .battlefield('Island', 'Island', 'Island', 'Island')
      .seat(1)
      .at('precombatMain', { active: 1, priority: 0 })
      .build();
    g.expect.illegal(0, { cast: OMEN_NAME, face: 0 });
    g.expect.illegal(0, { cast: OMEN_NAME, face: 1 });
    g.expect.illegal(0, { cast: 'Divination' });
  });
});
