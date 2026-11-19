// The Troyan deck (issue 337), group 4: the REAL Oracle text of Rashmi, Eternities Crafter (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a card with
// no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs. The helper cards
// are real fixtures. Pins: CR 601.2i and 603.2 (the trigger of the first spell cast each turn, resolved before that spell), CR 701.20a (the top card is revealed), CR 608.2g and
// 118.9 (cast without paying its mana cost during the resolution), CR 113.7a and 608.2h (the mana value of the spell that caused it as it last was on the stack).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
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

const RASHMI_CARD = real('Rashmi, Eternities Crafter');
const RASHMI = RASHMI_CARD.name;
const DIVINATION = 'Divination'; // {2}{U} sorcery, draw two
const COUNTERSPELL = 'Counterspell'; // {U}{U}
const BEARS = 'Grizzly Bears'; // {1}{G} 2/2
const ANGEL = 'Serra Angel'; // {3}{W}{W}
const FILL = ['Island', 'Island', 'Island', 'Island'];

describe('the card is supported and valid', () => {
  test('one triggered ability, the first spell each turn', () => {
    expect(validateCard(RASHMI_CARD)).toEqual([]);
    expect(RASHMI_CARD.faces[0]?.abilities).toMatchObject([
      { kind: 'triggered', trigger: { kind: 'castSpell', by: 'you', nth: 1 } },
    ]);
  });
});

describe('Rashmi, Eternities Crafter', () => {
  const game = (top: readonly string[], hand: readonly string[] = [DIVINATION]) =>
    scenario()
      .define(RASHMI_CARD)
      .seat(0)
      .library(...top, ...FILL)
      .hand(...hand)
      .battlefield(RASHMI, 'Island', 'Island', 'Island', 'Island')
      .seat(1)
      .library(...FILL)
      .build();

  test('a card with a lesser mana value is cast without paying, before the spell that caused the trigger resolves', () => {
    const g = game([BEARS]);
    g.act(0).cast(DIVINATION, { pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.stack([BEARS, DIVINATION]);
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(DIVINATION, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('a card with a greater mana value goes into the hand', () => {
    const g = game([ANGEL]);
    g.act(0).cast(DIVINATION, { pay: true });
    g.passAll();
    g.expect.zone(ANGEL, 'hand', { seat: 0 });
  });

  test('a land card goes into the hand', () => {
    const g = game(['Island']);
    g.act(0).cast(DIVINATION, { pay: true });
    g.passAll();
    g.expect.zone('Island', 'hand', { seat: 0 });
  });

  test('declining puts the card into the hand', () => {
    const g = game([BEARS]);
    g.act(0).cast(DIVINATION, { pay: true });
    g.passAll();
    g.act(0).decline();
    g.expect.zone(BEARS, 'hand', { seat: 0 });
  });

  test('it works on the turn of an opponent: the first spell I cast that turn (CR 603.2)', () => {
    const g = scenario()
      .define(RASHMI_CARD)
      .seat(0)
      .library('Lightning Bolt', ...FILL)
      .hand(COUNTERSPELL)
      .battlefield(RASHMI, 'Island', 'Island')
      .seat(1)
      .library(...FILL)
      .hand(DIVINATION)
      .battlefield('Island', 'Island', 'Island')
      .at('precombatMain', { active: 1, turn: 4 })
      .build();
    g.act(1).cast(DIVINATION, { pay: true });
    g.act(1).pass();
    g.act(0).cast(COUNTERSPELL, { targets: [DIVINATION], pay: true });
    // the trigger is mine although it is not my turn; Counterspell has mana value 2, Lightning Bolt 1
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).decline();
    g.expect.zone('Lightning Bolt', 'hand', { seat: 0 });
  });
});

describe("Aminatou's Augury", () => {
  const AUGURY_CARD = real("Aminatou's Augury");
  const AUGURY = AUGURY_CARD.name;
  const EIGHT = ['Island', 'Island', 'Island', 'Island', 'Island', 'Island', 'Island', 'Island'];
  const game = (top: readonly string[]) =>
    scenario()
      .define(AUGURY_CARD)
      .seat(0)
      .library(...top, ...FILL)
      .hand(AUGURY)
      .battlefield(...EIGHT)
      .seat(1)
      .library(...FILL)
      .build();
  const PAD = ['Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp'];

  test('the card is supported and valid', () => {
    expect(validateCard(AUGURY_CARD)).toEqual([]);
  });

  test('the land is put onto the battlefield first; then a creature and an instant are cast for free, at their timing', () => {
    const g = game([BEARS, 'Lightning Bolt', 'Forest', ...PAD.slice(0, 5)]);
    g.act(0).cast(AUGURY, { pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('Forest');
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    g.act(0).cast(BEARS, { alternative: 'free', pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.act(0).cast('Lightning Bolt', { alternative: 'free', targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 37);
    g.expect.invariants();
  });

  test('one spell of each type: a second creature is not cast; a land is not cast', () => {
    const g = game([BEARS, ANGEL, 'Forest', ...PAD.slice(0, 5)]);
    g.act(0).cast(AUGURY, { pay: true });
    g.passAll();
    g.act(0).chooseCards();
    g.act(0).cast(BEARS, { alternative: 'free', pay: true });
    g.passAll();
    expect(g.act(0).try.cast(ANGEL, { alternative: 'free' }).ok).toBe(false);
    expect(g.act(0).try.cast('Forest', { alternative: 'free' }).ok).toBe(false);
  });
});
