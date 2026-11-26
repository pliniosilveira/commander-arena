// The Revenant Recon deck, group C: the REAL Oracle text of Hostile Desert (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a card with no override,
// is defined in an engine scenario and is played through applyAction. Pins: CR 205.1b (still a land), CR 611.2a (until end of turn), CR 613.1d (types), CR 613.4b (base power and
// toughness), CR 118.1 (a cost is paid in full: the land card exiled from the graveyard).
import { readFileSync } from 'node:fs';
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function card(name: string, text?: string) {
  const found = GOLDEN.find((c) => c.name === name);
  if (found === undefined) throw new Error(`${name} is not in the golden corpus`);
  const [face] = found.faces;
  if (face === undefined) throw new Error(`${name} has no face`);
  const source = text === undefined ? found : { ...found, faces: [{ ...face, oracleText: text }] };
  return importCard(fromGoldenCard(source), undefined, NO_OVERRIDES);
}

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const imported = card(name);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const DESERT = 'Hostile Desert';

describe('Hostile Desert: a land that becomes a 3/4 Elemental until end of turn', () => {
  const desert = real(DESERT);
  const start = (graveyard: readonly string[]) =>
    scenario()
      .seat(0)
      .life(20)
      .define(desert)
      .battlefield(DESERT, { tapped: false })
      .battlefield('Forest', 'Forest')
      .graveyard(...graveyard)
      .library('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .life(20)
      .library('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('exiling a land card from the graveyard makes it a 3/4 Elemental creature that is still a land', () => {
    const g = start(['Forest']);
    g.act(0).activate(DESERT, { ability: 1, pay: true });
    g.passAll();
    g.expect.derived(DESERT, { types: ['land', 'creature'], subtypes: ['Desert', 'Elemental'] });
    g.expect.pt(DESERT, 3, 4);
    g.expect.invariants();
  });

  test('the effect ends with the turn (CR 611.2a)', () => {
    const g = start(['Forest']);
    g.act(0).activate(DESERT, { ability: 1, pay: true });
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.derived(DESERT, { types: ['land'], subtypes: ['Desert'] });
  });

  test('without a land card in the graveyard the ability cannot be activated', () => {
    const g = start(['Lightning Bolt']);
    expect(() => g.act(0).activate(DESERT, { ability: 1, pay: true })).toThrow();
  });
});

describe('texts that are not Hostile Desert are dropped, never half run (SYNTHETIC)', () => {
  const lines = [
    "{2}, Exile a land card from your graveyard: This land becomes a 3/4 Elemental creature until your next turn. It's still a land.",
    '{2}, Exile a land card from your graveyard: This land becomes a 3/4 Elemental creature until end of turn.',
    "{2}, Exile a land card from your graveyard: Target land becomes a 3/4 Elemental creature until end of turn. It's still a land.",
    "{2}, Exile a land card from your graveyard: This land becomes a 3/4 creature until end of turn. It's still a land.",
  ];
  for (const text of lines) {
    test(text, () => {
      expect(card(DESERT, text).support.status).toBe('unsupported');
    });
  }
});

const LAZAV = 'Lazav, the Multifarious';
const BEARS = 'Grizzly Bears'; // 2/2, mana value 2
const ELVES = 'Llanowar Elves'; // 1/1, mana value 1

describe('Lazav, the Multifarious: {X}: becomes a copy of a creature card of your graveyard with mana value X (CR 707.2, 707.9a, 707.9b, 205.4a)', () => {
  const lazav = real(LAZAV);
  const start = () =>
    scenario()
      .seat(0)
      .life(20)
      .define(lazav)
      .battlefield(LAZAV)
      .battlefield('Forest', 'Forest', 'Forest')
      .graveyard(BEARS, ELVES)
      .library(...FILL)
      .seat(1)
      .life(20)
      .graveyard('Serra Angel')
      .library(...FILL)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('X = 2: it becomes a Grizzly Bears that keeps its name, is legendary, and has this ability', () => {
    const g = start();
    g.act(0).activate(LAZAV, { ability: 1, x: 2, targets: [BEARS], pay: true });
    g.passAll();
    g.expect.derived(LAZAV, { types: ['creature'], subtypes: ['Bear'], supertypes: ['legendary'] });
    g.expect.pt(LAZAV, 2, 2);
    g.expect.zone(BEARS, 'graveyard', { seat: 0, count: 1 });
    g.expect.invariants();
    // It has this ability still: it can do it again, with another X, and the copy of the copy has it too (CR 707.9b).
    g.act(0).activate(LAZAV, { ability: 0, x: 1, targets: [ELVES], pay: true });
    g.passAll();
    g.expect.pt(LAZAV, 1, 1);
    g.expect.derived(LAZAV, { supertypes: ['legendary'] });
    g.expect.invariants();
  });

  test('the effect has no end: it is still a Bear next turn', () => {
    const g = start();
    g.act(0).activate(LAZAV, { ability: 1, x: 2, targets: [BEARS], pay: true });
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.pt(LAZAV, 2, 2);
  });

  test('the card must have mana value X, be a creature card, and be in your graveyard', () => {
    const wrongX = start();
    expect(() =>
      wrongX.act(0).activate(LAZAV, { ability: 1, x: 1, targets: [BEARS], pay: true }),
    ).toThrow();
    const theirs = start();
    expect(() =>
      theirs.act(0).activate(LAZAV, { ability: 1, x: 5, targets: ['Serra Angel'], pay: true }),
    ).toThrow();
  });
});

describe('texts that are not Lazav are dropped, never half run (SYNTHETIC)', () => {
  const lines = [
    "{X}: ~ becomes a copy of target creature card in your graveyard with mana value X until end of turn, except its name is ~, it's legendary in addition to its other types, and it has this ability.",
    "{X}: ~ becomes a copy of target creature card in a graveyard with mana value X, except its name is ~, it's legendary in addition to its other types, and it has this ability.",
    "{X}: ~ becomes a copy of target creature card in your graveyard with mana value X, except its name is ~ and it's legendary in addition to its other types.",
  ];
  for (const text of lines) {
    test(text, () => {
      expect(card(LAZAV, text).support.status).toBe('unsupported');
    });
  }
});

const MASTER = 'Master of Death';
const FILL = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

describe('Master of Death: at the beginning of your upkeep, if it is in your graveyard, you may pay 1 life to return it to your hand (CR 113.6b, 603.4, 400.7)', () => {
  const master = real(MASTER);
  const start = (zones: {
    readonly mine?: 'graveyard' | 'hand';
    readonly theirs?: 'graveyard';
  }) => {
    const b = scenario()
      .define(master)
      .seat(0)
      .life(20)
      .library(...FILL);
    if (zones.mine === 'graveyard') b.graveyard(MASTER);
    if (zones.mine === 'hand') b.hand(MASTER);
    b.seat(1)
      .life(20)
      .library(...FILL);
    if (zones.theirs === 'graveyard') b.graveyard(MASTER);
    return b.at('end', { active: 1, turn: 2 }).build();
  };

  test('paying 1 life returns it to the hand', () => {
    const g = start({ mine: 'graveyard' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.passAll();
    g.expect.zone(MASTER, 'hand', { seat: 0, count: 1 });
    g.expect.zone(MASTER, 'graveyard', { seat: 0, count: 0 });
    g.expect.life(0, 19);
    g.expect.invariants();
  });

  test('declining leaves it in the graveyard and costs no life', () => {
    const g = start({ mine: 'graveyard' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    g.act(0).decline();
    g.passAll();
    g.expect.zone(MASTER, 'graveyard', { seat: 0, count: 1 });
    g.expect.life(0, 20);
  });

  test('it does nothing from the hand', () => {
    const g = start({ mine: 'hand' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    g.expect.life(0, 20);
    g.expect.zone(MASTER, 'hand', { seat: 0, count: 1 });
  });
});

describe('"it" is read only after the graveyard condition (SYNTHETIC)', () => {
  const lines = [
    'At the beginning of your upkeep, you may pay 1 life. If you do, return it to your hand.',
    'At the beginning of your upkeep, if this card is in your graveyard, you may pay 1 life. If you do, return it to its owner’s hand.',
    'At the beginning of your upkeep, if this card is in your graveyard, you may pay 1 life. If you do, return it to your hand tapped.',
  ];
  for (const text of lines) {
    test(text, () => {
      expect(card(MASTER, text).support.status).toBe('unsupported');
    });
  }
});
