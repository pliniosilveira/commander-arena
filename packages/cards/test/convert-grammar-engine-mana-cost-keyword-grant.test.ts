// A permanent gives the cards of its controller's hand miracle or the cards of its graveyard escape, with the cost made from the card's mana cost (CR 702.94a, 702.138a, 118.9, 118.7a):
// the Oracle text of two creatures (cards named SYNTHETIC, the wordings are those of the real cards) goes through the grammar and is played through applyAction, so the nodes the parser
// writes are what the engine runs. The enchantments are the engine's SYNTHETIC fixtures.
import { type Action, getLegalActions } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';
import { dropped, read, readAll } from './parser-p5-helpers';

const SEER = parsed(
  'SYNTHETIC Veil Piercer',
  'Legendary Creature — Human Wizard',
  'Each enchantment card in your hand has miracle. Its miracle cost is equal to its mana cost reduced by {4}.',
  { manaCost: '{1}{W}{U}{B}', power: '2', toughness: '4', colors: ['W', 'U', 'B'] },
);
const KEYS = parsed(
  'SYNTHETIC Master of Keys',
  'Legendary Enchantment Creature — Horror',
  "Each enchantment card in your graveyard has escape. The escape cost is equal to the card's mana cost plus exile three other cards from your graveyard.",
  { manaCost: '{W}{U}{B}', power: '1', toughness: '1', colors: ['W', 'U', 'B'] },
);
const GRAND = 'SYNTHETIC Grand Shrine'; // {5}{W}
const FILLER = ['Grizzly Bears', 'Giant Spider', 'Typhoid Rats', 'Youthful Knight'];

const MIRACLE =
  'Each enchantment card in your hand has miracle. Its miracle cost is equal to its mana cost reduced by {4}.';
const ESCAPE =
  "Each enchantment card in your graveyard has escape. The escape cost is equal to the card's mana cost plus exile three other cards from your graveyard.";

describe('the lines read as the engine node', () => {
  test('miracle in the hand', () => {
    expect(readAll(MIRACLE, 'creature').abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'grantKeywordFromManaCost',
          what: { types: ['enchantment'] },
          grant: { kind: 'miracle', reduce: 4 },
        },
      },
    ]);
  });

  test('escape in the graveyard', () => {
    expect(readAll(ESCAPE, 'creature').abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'grantKeywordFromManaCost',
          what: { types: ['enchantment'] },
          grant: { kind: 'escape', exile: 3 },
        },
      },
    ]);
  });

  test('another card type and another number', () => {
    const abilities = readAll(
      'Each creature card in your hand has miracle. Its miracle cost is equal to its mana cost reduced by {2}.',
      'creature',
    ).abilities;
    expect(abilities).toMatchObject([
      { static: { what: { types: ['creature'] }, grant: { kind: 'miracle', reduce: 2 } } },
    ]);
  });

  test('wordings the engine does not run stay dropped, whole', () => {
    const lines = [
      // Another zone for the keyword, another cost, coloured mana, only the first sentence.
      'Each enchantment card in your graveyard has miracle. Its miracle cost is equal to its mana cost reduced by {4}.',
      'Each enchantment card in your hand has miracle. Its miracle cost is equal to its mana cost reduced by {W}.',
      'Each enchantment card in your hand has miracle.',
      "Each enchantment card in your graveyard has escape. The escape cost is equal to the card's mana cost.",
      "Each enchantment card in your opponents' graveyards has escape. The escape cost is equal to the card's mana cost plus exile three other cards from your graveyard.",
    ];
    for (const text of lines)
      expect(read(text, 'creature').unparsed.length, text).toBeGreaterThan(0);
    expect(dropped('Each enchantment card in your hand has miracle.', 'creature').reason).toBe(
      'unrecognised',
    );
  });
});

describe('the name of a card that starts with an article is not a way to call it', () => {
  test('"The escape cost" is not read as the card', () => {
    // A legendary card named "The Master of Keys" must not make every "The" in its text a reference to itself.
    const card = parsed('The Master of Keys', 'Legendary Enchantment Creature — Horror', ESCAPE, {
      manaCost: '{X}{W}{U}{B}',
      power: '0',
      toughness: '0',
      colors: ['W', 'U', 'B'],
    });
    expect(card.support).toBe('supported');
  });
});

const escapeOptions = (state: Parameters<typeof getLegalActions>[0]): Action[] =>
  getLegalActions(state, 0).filter((a) => a.kind === 'castSpell' && a.alternative === 'escape');

describe('the whole text of the card with an {X} enters with X counters and mills twice X', () => {
  test('X = 2: two +1/+1 counters and four cards milled', () => {
    const card = parsed(
      'The Master of Keys',
      'Legendary Enchantment Creature — Horror',
      `Flying\nWhen ~ enters, put X +1/+1 counters on it and mill twice X cards.\n${ESCAPE}`,
      { manaCost: '{X}{W}{U}{B}', power: '1', toughness: '1', colors: ['W', 'U', 'B'] },
    );
    expect(card.support).toBe('supported');
    const g = scenario()
      .define(card)
      .seat(0)
      .hand(card.name)
      .battlefield('Plains')
      .battlefield('Island')
      .battlefield('Swamp')
      .battlefield('Plains', { count: 2 })
      .library(...FILLER, ...FILLER)
      .seat(1)
      .build();
    g.act(0).cast(card.name, { x: 2, pay: true });
    g.passAll();
    expect(g.object({ name: card.name, zone: 'battlefield' }).counters['+1/+1']).toBe(2);
    expect(g.state.seats[0]?.graveyard).toHaveLength(4);
  });
});

describe('played', () => {
  test('the graveyard enchantment is cast for its mana cost and three other cards', () => {
    const g = scenario()
      .define(KEYS)
      .seat(0)
      .graveyard(GRAND, ...FILLER.slice(0, 3))
      .battlefield(KEYS.name)
      .battlefield('Plains', { count: 6 })
      .seat(1)
      .build();
    expect(escapeOptions(g.state)).toHaveLength(1);
    g.act(0).cast(GRAND, { alternative: 'escape', pay: true });
    for (const name of FILLER.slice(0, 3)) g.expect.zone(name, 'exile', { seat: 0 });
    g.pass();
    g.pass();
    g.expect.zone(GRAND, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('two other cards are too few', () => {
    const g = scenario()
      .define(KEYS)
      .seat(0)
      .graveyard(GRAND, ...FILLER.slice(0, 2))
      .battlefield(KEYS.name)
      .battlefield('Plains', { count: 6 })
      .seat(1)
      .build();
    expect(escapeOptions(g.state)).toEqual([]);
  });

  test('the enchantment drawn first this turn is revealed and cast for its mana cost reduced by {4}', () => {
    const g = scenario()
      .define(SEER)
      .seat(0)
      .battlefield(SEER.name)
      .battlefield('Plains', { count: 2 })
      .library(GRAND)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('upkeep', { active: 0, turn: 3 })
      .build();
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.pass();
    g.pass();
    g.act(0).accept();
    g.act(0).payAuto();
    g.expect.stack([GRAND]);
    g.expect.invariants();
    g.pass();
    g.pass();
    g.expect.zone(GRAND, 'battlefield', { seat: 0 });
  });
});
