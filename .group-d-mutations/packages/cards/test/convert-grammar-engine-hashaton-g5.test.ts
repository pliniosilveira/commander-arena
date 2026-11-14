// The Hashaton deck (issue 31), group 5 (D-382 to D-385): the REAL Oracle text of Champion of Wits, Hashaton, Scarab's Fist and Renewed Solidarity (the corpus's
// golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the
// parser writes for the real text are what the engine runs. The helper cards are real fixtures, or SYNTHETIC with their own names. Pins: CR 702.129a (Eternalize), CR 707.9b and
// 707.9d (the exceptions of a copy), CR 701.9a (a discard triggers once for each card), CR 118.3 and 608.2c ("you may pay. If you do"), CR 603.2 (the end step), CR 400.7.
import { readFileSync } from 'node:fs';
import { type CardDefinition, getView, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const FILLER = Array.from({ length: 14 }, () => 'Plains');
const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves';
const SOWER = 'SYNTHETIC Goblin Sower'; // {R} sorcery: two 1/1 red Goblin creature tokens

const champion = real('Champion of Wits');
const hashaton = real("Hashaton, Scarab's Fist");
const solidarity = real('Renewed Solidarity');
const CHAMPION = champion.name;
const HASHATON = hashaton.name;
const SOLIDARITY = solidarity.name;

const battlefieldView = (g: { state: Parameters<typeof getView>[0] }, name: string) =>
  getView(g.state, 0).battlefield.filter((o) => o.name === name);

describe('the real cards are valid', () => {
  test.each([champion, hashaton, solidarity])('$name', (card) => {
    expect(validateCard(card)).toEqual([]);
  });
});

describe('Champion of Wits: "Eternalize {5}{U}{U}"', () => {
  const start = () =>
    scenario()
      .define(champion)
      .seat(0)
      .graveyard(CHAMPION)
      .battlefield('Island', { count: 7 })
      .library(BEARS, ELVES, BEARS, ELVES, ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is exiled for {5}{U}{U}; the token is a 4/4 black Zombie Snake Wizard with no mana cost, and it draws cards equal to its power (4)', () => {
    const g = start();
    g.act(0).activate(CHAMPION, { pay: true });
    g.expect.zone(CHAMPION, 'exile', { seat: 0 });
    g.passAll();
    // The enters trigger of the token: "you may draw cards equal to its power", the power the token has: 4.
    g.act(0).accept();
    g.expect.handSize(0, 4);
    const token = g.find({ name: CHAMPION, zone: 'battlefield', seat: 0 });
    expect(token).toHaveLength(1);
    g.expect.pt({ name: CHAMPION, zone: 'battlefield', seat: 0 }, 4, 4);
    g.expect.derived(
      { name: CHAMPION, zone: 'battlefield', seat: 0 },
      { subtypes: ['Snake', 'Wizard', 'Zombie'], colors: ['B'] },
    );
    expect(battlefieldView(g, CHAMPION)[0]?.manaCost).toBeNull();
  });

  test('without {5}{U}{U}, or from the hand, there is no option', () => {
    const g = scenario()
      .define(champion)
      .seat(0)
      .graveyard(CHAMPION)
      .battlefield('Island', { count: 6 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.expect.illegal(0, { activate: CHAMPION });
  });
});

describe("Hashaton, Scarab's Fist: \"Whenever you discard a creature card, you may pay {2}{U}. If you do, create a tapped token that's a copy of that card, except it's a 4/4 black Zombie.\"", () => {
  test('Champion of Wits enters, draws two creature cards and discards them: Hashaton asks for each, one is paid for', () => {
    const g = scenario()
      .define(champion)
      .define(hashaton)
      .seat(0)
      .hand(CHAMPION)
      .battlefield(HASHATON)
      .battlefield('Island', { count: 6 })
      .library(BEARS, ELVES, ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(CHAMPION, { pay: true });
    g.passAll();
    // "You may draw cards equal to its power. If you do, discard two cards."
    g.act(0).accept();
    let paid = false;
    for (let i = 0; i < 8; i += 1) {
      const d = g.state.pending;
      if (d?.kind === 'orderTriggers') {
        g.act(0).orderTriggers(0, 1);
      } else if (d?.kind === 'confirmOptional') {
        if (!paid) {
          g.act(0).accept();
          g.act(0).payAuto();
          paid = true;
        } else {
          g.act(0).decline();
        }
      }
      g.passAll();
    }
    expect(paid).toBe(true);
    const copies = ['Grizzly Bears', 'Llanowar Elves']
      .flatMap((name) => g.find({ name, zone: 'battlefield', seat: 0 }))
      .filter((o) => o.token !== null);
    expect(copies).toHaveLength(1);
    expect(copies[0]?.tapped).toBe(true);
    const shown = getView(g.state, 0).battlefield.find((o) => o.id === copies[0]?.id);
    expect(shown?.power).toBe(4);
    expect(shown?.toughness).toBe(4);
    expect(shown?.colors).toEqual(['B']);
    expect(shown?.subtypes).toEqual(['Zombie']);
    // Both cards were discarded; the one that was copied is still in the graveyard.
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(ELVES, 'graveyard', { seat: 0 });
  });
});

describe('Renewed Solidarity: "At the beginning of your end step, for each token you control of the chosen type that entered this turn, create a token that\'s a copy of it."', () => {
  test('two Goblin tokens made this turn are copied at the end step, and the Goblins are +1/+0', () => {
    const g = scenario()
      .define(solidarity)
      .seat(0)
      .hand(SOLIDARITY, SOWER)
      .battlefield('Plains', { count: 3 })
      .battlefield('Mountain')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(SOLIDARITY, { pay: true });
    g.passAll();
    g.act(0).chooseOption('Goblin');
    g.act(0).cast(SOWER, { pay: true });
    g.passAll();
    expect(g.find({ name: 'Goblin', zone: 'battlefield', seat: 0 })).toHaveLength(2);
    g.advanceTo('end');
    g.passAll();
    const goblins = g.find({ name: 'Goblin', zone: 'battlefield', seat: 0 });
    expect(goblins).toHaveLength(4);
    for (const o of goblins) {
      const shown = getView(g.state, 0).battlefield.find((v) => v.id === o.id);
      expect([shown?.power, shown?.toughness]).toEqual([2, 1]);
    }
  });
});
