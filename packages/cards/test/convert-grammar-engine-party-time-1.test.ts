// The Party Time deck (issue 170), group "grants and type changes": the REAL Oracle text of Mutavault (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a
// card with no override, is defined in an engine scenario and is played through applyAction. Pins: CR 205.1b (a land that becomes a creature is still a land), CR 205.3m (all creature
// types), CR 611.2a (until end of turn), CR 613.1d (types), CR 613.4b (base power and toughness).
import { readFileSync } from 'node:fs';
import { CREATURE_TYPES, type CardDefinition } from '@commander-arena/engine';
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

/** A card of the golden corpus with its text replaced, imported through the grammar. */
function withText(name: string, text: string) {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const [face] = card.faces;
  if (face === undefined) throw new Error(`${name} has no face`);
  return importCard(
    fromGoldenCard({ ...card, faces: [{ ...face, oracleText: text }] }),
    undefined,
    NO_OVERRIDES,
  );
}

describe('Mutavault: {1}: becomes a 2/2 creature with all creature types until end of turn', () => {
  const MUTAVAULT = 'Mutavault';
  const vault = real(MUTAVAULT);
  const start = () =>
    scenario()
      .seat(0)
      .life(20)
      .define(vault)
      .battlefield(MUTAVAULT, { tapped: false })
      .battlefield('Plains')
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .life(20)
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('it becomes a 2/2 creature of every creature type and is still a land', () => {
    const g = start();
    g.act(0).activate(MUTAVAULT, { ability: 1, pay: true });
    g.passAll();
    g.expect.derived(MUTAVAULT, { types: ['land', 'creature'], subtypes: [...CREATURE_TYPES] });
    g.expect.pt(MUTAVAULT, 2, 2);
    g.expect.invariants();
  });

  test('the effect ends with the turn (CR 611.2a)', () => {
    const g = start();
    g.act(0).activate(MUTAVAULT, { ability: 1, pay: true });
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.derived(MUTAVAULT, { types: ['land'], subtypes: [] });
  });
});

describe('texts that are not Mutavault are dropped, never half run (SYNTHETIC)', () => {
  const lines = [
    "{1}: ~ becomes a 2/2 creature with all creature types until your next turn. It's still a land.",
    '{1}: ~ becomes a 2/2 creature with all creature types until end of turn.',
    "{1}: Target land becomes a 2/2 creature with all creature types until end of turn. It's still a land.",
    "{1}: ~ becomes a creature with all creature types until end of turn. It's still a land.",
  ];
  for (const text of lines) {
    test(text, () => {
      const imported = withText('Mutavault', text);
      expect(imported.support.status).toBe('unsupported');
    });
  }
});

describe("Nighthawk Scavenger: power is 1 plus the number of card types among cards in your opponents' graveyards", () => {
  const SCAVENGER = 'Nighthawk Scavenger';
  const scavenger = real(SCAVENGER);
  const start = () =>
    scenario()
      .seat(0)
      .define(scavenger)
      .battlefield(SCAVENGER)
      .graveyard('Lightning Bolt', 'Llanowar Elves')
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .graveyard('Grizzly Bears', 'Forest')
      .library('Plains', 'Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('it counts the card types of the opponents graveyards, not of its controller (CR 205.2a)', () => {
    const g = start();
    // Opponent: Grizzly Bears (creature) and Forest (land) = 2 types; its controller's instant and creature do not count.
    g.expect.pt(SCAVENGER, 3, 3);
  });

  test('a card type is counted once however many cards have it', () => {
    const g = scenario()
      .seat(0)
      .define(scavenger)
      .battlefield(SCAVENGER)
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .graveyard('Grizzly Bears', 'Llanowar Elves', 'Grizzly Bears')
      .library('Plains', 'Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.expect.pt(SCAVENGER, 2, 3);
  });

  test('with no cards in the opponents graveyards it is 1/3', () => {
    const g = scenario()
      .seat(0)
      .define(scavenger)
      .battlefield(SCAVENGER)
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .library('Plains', 'Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.expect.pt(SCAVENGER, 1, 3);
  });

  test('a creature put into an opponent graveyard changes it as the board changes (CR 604.3)', () => {
    const g = scenario()
      .seat(0)
      .define(scavenger)
      .battlefield(SCAVENGER)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .battlefield('Grizzly Bears')
      .library('Plains', 'Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.expect.pt(SCAVENGER, 1, 3);
    g.act(0).cast('Lightning Bolt', { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.expect.pt(SCAVENGER, 2, 3);
  });
});

describe('a printed 1+* needs a line that states the whole number (SYNTHETIC)', () => {
  const lines = [
    // "equal to the number of ..." with a printed 1+*: the ability would not say the 1.
    "~'s power is equal to the number of card types among cards in your opponents' graveyards.",
    "~'s power is equal to 2 plus the number of card types among cards in your opponents' graveyards.",
  ];
  for (const text of lines) {
    test(text, () => {
      const imported = withText('Nighthawk Scavenger', `Flying\n${text}`);
      expect(imported.support.status).toBe('unsupported');
    });
  }
});

describe('Valiant Changeling: costs {1} less for each creature type among creatures you control, by no more than {5}', () => {
  const CHANGELING = 'Valiant Changeling'; // {5}{W}{W}
  const changeling = real(CHANGELING);

  test('each creature type counts once: Grizzly Bears (Bear) and Llanowar Elves (Elf, Druid) make {2}{W}{W} (CR 601.2f)', () => {
    const g = scenario()
      .seat(0)
      .define(changeling)
      .hand(CHANGELING)
      .battlefield('Grizzly Bears', 'Llanowar Elves', 'Plains', 'Plains', 'Plains', 'Plains')
      .library('Plains', 'Plains')
      .seat(1)
      .battlefield('Grizzly Bears')
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(CHANGELING, { pay: true });
    g.expect.stack([CHANGELING]);
  });

  test('two creatures of the same type count once, and the creatures of an opponent do not count', () => {
    const g = scenario()
      .seat(0)
      .define(changeling)
      .hand(CHANGELING)
      .battlefield('Grizzly Bears', 'Grizzly Bears', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .library('Plains', 'Plains')
      .seat(1)
      .battlefield('Llanowar Elves', 'Grizzly Bears')
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    // One type (Bear): {4}{W}{W} is six mana, so five lands cannot pay it.
    expect(() => g.act(0).cast(CHANGELING, { pay: true })).toThrow();
  });

  test('a creature with every creature type takes off at most {5}', () => {
    const g = scenario()
      .seat(0)
      .define(changeling)
      .hand(CHANGELING)
      .battlefield(CHANGELING, 'Plains', 'Plains')
      .library('Plains', 'Plains')
      .seat(1)
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(CHANGELING, { pay: true });
    g.expect.stack([CHANGELING]);
  });
});

describe('Eight-and-a-Half-Tails: {1}: Target spell or permanent becomes white until end of turn', () => {
  const TAILS = 'Eight-and-a-Half-Tails';
  const tails = real(TAILS);
  const start = () =>
    scenario()
      .seat(0)
      .define(tails)
      .hand('Llanowar Elves')
      .battlefield(TAILS, 'Forest', 'Forest', 'Plains')
      .library('Plains', 'Plains')
      .seat(1)
      .battlefield('Grizzly Bears')
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('a permanent becomes white (CR 105.3, 613.1e) until the end of the turn', () => {
    const g = start();
    g.act(0).activate(TAILS, { ability: 1, targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.expect.derived('Grizzly Bears', { colors: ['W'] });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.derived('Grizzly Bears', { colors: ['G'] });
  });

  test('a spell on the stack becomes white, and the permanent it becomes is white too (ruling of 2016-06-08)', () => {
    const g = start();
    g.act(0).cast('Llanowar Elves', { pay: true });
    g.act(0).activate(TAILS, {
      ability: 1,
      targets: [{ name: 'Llanowar Elves', zone: 'stack' }],
      pay: true,
    });
    g.pass();
    g.pass();
    g.expect.derived('Llanowar Elves', { colors: ['W'] });
    g.passAll();
    g.expect.zone('Llanowar Elves', 'battlefield', { seat: 0 });
    g.expect.derived('Llanowar Elves', { colors: ['W'] });
  });
});

describe("Firja's Retribution, chapter II: Angels you control gain {T}: Destroy target creature with power less than this creature's power", () => {
  const FIRJA = "Firja's Retribution";
  const firja = real(FIRJA);
  const start = () =>
    scenario()
      .seat(0)
      .define(firja)
      .battlefield('Serra Angel', 'Grizzly Bears')
      .battlefield(FIRJA, { counters: { lore: 1 } })
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .battlefield('Grizzly Bears', 'Serra Angel')
      .library('Plains', 'Plains', 'Plains')
      .at('upkeep', { active: 0, turn: 3 })
      .build();

  test('chapter II gives your Angels the ability for the turn: the Angel taps to destroy a creature with less power', () => {
    const g = start();
    g.advanceTo('precombatMain');
    g.passAll();
    // The Angel's derived abilities: flying, vigilance, then the granted one (the index is the last).
    const angel = { name: 'Serra Angel', zone: 'battlefield', seat: 0 } as const;
    const theirAngel = { name: 'Serra Angel', zone: 'battlefield', seat: 1 } as const;
    // A creature whose power is not less (Serra Angel is 4/4 too) cannot be the target (CR 208.1).
    const other = start();
    other.advanceTo('precombatMain');
    other.passAll();
    expect(() => other.act(0).activate(angel, { ability: 2, targets: [theirAngel] })).toThrow();
    g.act(0).activate(angel, {
      ability: 2,
      targets: [{ name: 'Grizzly Bears', seat: 1, zone: 'battlefield' }],
    });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
    g.expect.zone('Serra Angel', 'battlefield', { seat: 1 });
    g.expect.tapped(angel, true);
  });
});

describe("Firja's Retribution, chapter III: Angels you control gain double strike until end of turn", () => {
  test('your Angels have double strike for the turn, other creatures and the opponent's Angels do not', () => {
    const FIRJA = "Firja's Retribution";
    const g = scenario()
      .seat(0)
      .define(real(FIRJA))
      .battlefield('Serra Angel', 'Grizzly Bears')
      .battlefield(FIRJA, { counters: { lore: 2 } })
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .battlefield('Serra Angel')
      .library('Plains', 'Plains', 'Plains')
      .at('upkeep', { active: 0, turn: 3 })
      .build();
    g.advanceTo('precombatMain');
    g.passAll();
    const mine = { name: 'Serra Angel', zone: 'battlefield', seat: 0 } as const;
    const theirs = { name: 'Serra Angel', zone: 'battlefield', seat: 1 } as const;
    g.expect.derived(mine, { keywords: ['flying', 'vigilance', 'doubleStrike'] });
    g.expect.derived('Grizzly Bears', { keywords: [] });
    g.expect.derived(theirs, { keywords: ['flying', 'vigilance'] });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.derived(mine, { keywords: ['flying', 'vigilance'] });
  });
});
