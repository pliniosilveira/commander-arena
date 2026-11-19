// Issue 104 (CR 702.128, 707.9b): the REAL Oracle text of Angel of Sanctions and Vizier of Many Faces (the Scryfall data of the deck support issue, the same lines as the golden corpus)
// goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are
// what the engine runs. Helper cards are real fixtures.
import { type CardDefinition, getView, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  [
    '{"oracleId":"3c49e98d-d33b-47fa-8b07-b38b367de2c7","name":"Angel of Sanctions","layout":"normal","colorIdentity":["W"],"edhrecRank":8732,"faces":[{"name":"Angel of Sanctions","manaCost":"{3}{W}{W}","typeLine":"Creature — Angel","oracleText":"Flying\\nWhen this creature enters, you may exile target nonland permanent an opponent controls until this creature leaves the battlefield.\\nEmbalm {5}{W} ({5}{W}, Exile this card from your graveyard: Create a token that\'s a copy of it, except it\'s a white Zombie Angel with no mana cost. Embalm only as a sorcery.)","power":"3","toughness":"4","loyalty":null,"defense":null,"colors":["W"]}],"source":"deck-support workflow (Scryfall API), issue #104","acceptance":true}',
    '{"oracleId":"55bceb83-bbba-477f-98ce-6e0a80b91080","name":"Vizier of Many Faces","layout":"normal","colorIdentity":["U"],"edhrecRank":4363,"faces":[{"name":"Vizier of Many Faces","manaCost":"{2}{U}{U}","typeLine":"Creature — Shapeshifter Cleric","oracleText":"You may have this creature enter as a copy of any creature on the battlefield, except if this creature was embalmed, the token has no mana cost, it\'s white, and it\'s a Zombie in addition to its other types.\\nEmbalm {3}{U}{U}","power":"0","toughness":"0","loyalty":null,"defense":null,"colors":["U"]}],"source":"deck-support workflow (Scryfall API), issue #104","acceptance":true}',
  ].join('\n'),
);

/** The real card, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the test data`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const FILLER = Array.from({ length: 14 }, () => 'Plains');
const BEARS = 'Grizzly Bears';

const angel = real('Angel of Sanctions');
const vizier = real('Vizier of Many Faces');
const ANGEL = angel.name;
const VIZIER = vizier.name;

const battlefieldView = (g: { state: Parameters<typeof getView>[0] }, name: string) =>
  getView(g.state, 0).battlefield.filter((o) => o.name === name);

describe('the real cards are valid', () => {
  test.each([angel, vizier])('$name', (card) => {
    expect(validateCard(card)).toEqual([]);
  });
});

describe('Angel of Sanctions: "Embalm {5}{W}"', () => {
  const start = (lands = 6) =>
    scenario()
      .define(angel)
      .seat(0)
      .graveyard(ANGEL)
      .battlefield('Plains', { count: lands })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .battlefield('Llanowar Elves')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is exiled for {5}{W}; the token is a white Zombie Angel with no mana cost, 3/4 with flying, and its enters ability exiles a permanent of the opponent', () => {
    const g = start();
    g.act(0).activate(ANGEL, { pay: true });
    g.expect.zone(ANGEL, 'exile', { seat: 0 });
    g.passAll();
    const token = g.find({ name: ANGEL, zone: 'battlefield', seat: 0 });
    expect(token).toHaveLength(1);
    expect(token[0]?.token).not.toBeNull();
    g.expect.pt({ name: ANGEL, zone: 'battlefield', seat: 0 }, 3, 4);
    g.expect.derived(
      { name: ANGEL, zone: 'battlefield', seat: 0 },
      { subtypes: ['Angel', 'Zombie'], colors: ['W'], keywords: ['flying', 'embalm'] },
    );
    expect(battlefieldView(g, ANGEL)[0]?.manaCost).toBeNull();
    // "When this creature enters, you may exile target nonland permanent an opponent controls": the copy has the ability too.
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.passAll();
    g.expect.noObject('Llanowar Elves', { zone: 'battlefield' });
    g.expect.zone('Llanowar Elves', 'exile', { seat: 1 });
  });

  test('without {5}{W}, from the hand, or in combat, there is no option', () => {
    start(5).expect.illegal(0, { activate: ANGEL });
    scenario()
      .define(angel)
      .seat(0)
      .hand(ANGEL)
      .battlefield('Plains', { count: 6 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build()
      .expect.illegal(0, { activate: ANGEL });
    scenario()
      .define(angel)
      .seat(0)
      .graveyard(ANGEL)
      .battlefield('Plains', { count: 6 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('beginningOfCombat', { active: 0, turn: 3 })
      .build()
      .expect.illegal(0, { activate: ANGEL });
  });
});

describe('Vizier of Many Faces: "You may have this creature enter as a copy of any creature on the battlefield, except if this creature was embalmed, ..." and "Embalm {3}{U}{U}"', () => {
  test('cast from the hand it is just a copy: the creature chosen, its colors, its types and its mana cost', () => {
    const g = scenario()
      .define(vizier)
      .seat(0)
      .hand(VIZIER)
      .battlefield('Island', { count: 4 })
      .battlefield(BEARS)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(VIZIER, { pay: true });
    g.passAll();
    g.act(0).choosePermanents(BEARS);
    const bears = g.find({ name: BEARS, zone: 'battlefield', seat: 0 });
    expect(bears).toHaveLength(2);
    g.expect.derived(`${BEARS}[1]`, { subtypes: ['Bear'], colors: ['G'] });
    g.expect.pt(`${BEARS}[1]`, 2, 2);
    expect(battlefieldView(g, BEARS).every((o) => o.manaCost !== null)).toBe(true);
  });

  test('embalmed for {3}{U}{U} it enters as a copy of the creature chosen, but white, a Zombie in addition and with no mana cost', () => {
    const g = scenario()
      .define(vizier)
      .seat(0)
      .graveyard(VIZIER)
      .battlefield('Island', { count: 5 })
      .battlefield(BEARS)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(VIZIER, { pay: true });
    g.expect.zone(VIZIER, 'exile', { seat: 0 });
    g.passAll();
    g.act(0).choosePermanents(BEARS);
    expect(g.find({ name: BEARS, zone: 'battlefield', seat: 0 })).toHaveLength(2);
    g.expect.derived(`${BEARS}[0]`, { subtypes: ['Bear'], colors: ['G'] });
    g.expect.derived(`${BEARS}[1]`, { subtypes: ['Bear', 'Zombie'], colors: ['W'] });
    g.expect.pt(`${BEARS}[1]`, 2, 2);
    expect(battlefieldView(g, BEARS).filter((o) => o.manaCost === null)).toHaveLength(1);
    g.expect.invariants();
  });
});
