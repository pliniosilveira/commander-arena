// Group D of the Revenant Recon deck: cards imported through the grammar (never a fixture), defined in an engine scenario and played through applyAction. Every card name starts with
// "SYNTHETIC"; the wording of each text is that of the real card the deck issue names, taken from the golden corpus.
import { getView } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;
const BEARS = 'Grizzly Bears';

type Builder = ReturnType<typeof scenario>;

function main(mine: (b: Builder) => Builder, theirs: (b: Builder) => Builder = (b) => b) {
  const a = mine(
    scenario()
      .seat(0)
      .life(20)
      .library(...FILLER),
  );
  return theirs(
    a
      .seat(1)
      .life(20)
      .library(...FILLER),
  )
    .at('precombatMain', { active: 0 })
    .build();
}

// ---- Ransom Note: a modal ability whose modes are "Cloak the top card of your library.", "Goad target creature." and "Draw a card." (CR 701.58a, 701.15a, 700.2).

const NOTE = parsed(
  'SYNTHETIC Parsed Ransom Note',
  'Artifact — Clue',
  'When ~ enters, surveil 1.\n{2}, Sacrifice ~: Choose one —\n• Cloak the top card of your library.\n• Goad target creature.\n• Draw a card.',
  { manaCost: '{1}' },
);

const note = (g: ScenarioGame) => g.act(0).activate(NOTE.name, { modes: [0], pay: true });

describe('modal activated ability with cloak, goad and draw (Ransom Note)', () => {
  const setup = () =>
    main(
      (b) => b.define(NOTE).battlefield(NOTE.name).battlefield('Forest', { count: 2 }),
      (b) => b.battlefield(BEARS),
    );

  test('mode 1 cloaks the top card of your library: a face-down creature with ward {2}', () => {
    const g = setup();
    const before = g.state.seats[0]?.library.length ?? 0;
    note(g);
    g.passAll();
    g.expect.zone(NOTE.name, 'graveyard', { seat: 0 });
    expect(g.state.seats[0]?.library.length).toBe(before - 1);
    const down = g.state.battlefield
      .map((id) => g.state.objects[id])
      .filter((o) => o?.faceDown?.by === 'cloak');
    expect(down).toHaveLength(1);
    g.expect.invariants();
  });

  test('mode 2 goads the target creature', () => {
    const g = setup();
    g.act(0).activate(NOTE.name, { modes: [1], targets: [BEARS], pay: true });
    g.passAll();
    const bears = getView(g.state, 1).battlefield.find((o) => o.id === g.id(BEARS));
    expect(bears?.goadedBy).toEqual([0]);
    g.expect.invariants();
  });

  test('mode 3 draws a card', () => {
    const g = setup();
    const hand = g.state.seats[0]?.hand.length ?? 0;
    g.act(0).activate(NOTE.name, { modes: [2], pay: true });
    g.passAll();
    expect(g.state.seats[0]?.hand.length).toBe(hand + 1);
  });
});

// ---- Twilight Prophet: "reveal the top card of your library and put it into your hand", then life from "that card's mana value" (CR 701.20a, 400.3, 608.2c, 202.3).

const PROPHET = parsed(
  'SYNTHETIC Parsed Prophet',
  'Creature — Vampire Cleric',
  "Flying\nAscend (If you control ten or more permanents, you get the city's blessing for the rest of the game.)\nAt the beginning of your upkeep, if you have the city's blessing, reveal the top card of your library and put it into your hand. Each opponent loses X life and you gain X life, where X is that card's mana value.",
  { manaCost: '{2}{B}{B}', colors: ['B'], power: '2', toughness: '4' },
);

describe("Twilight Prophet: reveal the top card, put it into your hand, drain by that card's mana value", () => {
  /** Three seats, seat 2's turn is ending: the next upkeep is seat 0's. */
  const game = (blessed: boolean, top: string) => {
    const b = scenario({ seats: 3 })
      .define(PROPHET)
      .seat(0)
      .life(20)
      .battlefield(PROPHET.name)
      .library(top, ...FILLER)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .seat(2)
      .life(20)
      .library(...FILLER);
    return (blessed ? b.seat(0).citysBlessing() : b).at('endOfCombat', { active: 2 }).build();
  };
  const toUpkeep = (g: ScenarioGame) => {
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
  };

  test('with the blessing the top card goes to your hand and every opponent loses its mana value', () => {
    // Serra Angel is {3}{W}{W}: mana value 5.
    const g = game(true, 'Serra Angel');
    toUpkeep(g);
    g.expect.zone('Serra Angel', 'hand', { seat: 0 });
    g.expect.life(0, 25);
    g.expect.life(1, 15);
    g.expect.life(2, 15);
    g.expect.invariants();
  });

  test('a land has mana value 0: nobody loses or gains life', () => {
    const g = game(true, 'Forest');
    toUpkeep(g);
    g.expect.zone('Forest', 'hand', { seat: 0 });
    g.expect.life(0, 20);
    g.expect.life(1, 20);
  });

  test('without the blessing nothing happens', () => {
    const g = game(false, 'Serra Angel');
    toUpkeep(g);
    g.expect.life(1, 20);
    g.expect.life(0, 20);
  });
});

// ---- Final-Word Phantom: "During each opponent's end step, you may cast spells as though they had flash." (CR 513.1, 601.3b).

const PHANTOM = parsed(
  'SYNTHETIC Parsed Phantom',
  'Creature — Spirit Detective',
  "Flash\nFlying\nDuring each opponent's end step, you may cast spells as though they had flash.",
  { manaCost: '{2}{U}', colors: ['U'], power: '1', toughness: '4' },
);

describe("Final-Word Phantom: spells at instant speed during each opponent's end step", () => {
  const board = (step: 'end' | 'postcombatMain', active: 0 | 1) =>
    scenario()
      .define(PHANTOM)
      .seat(0)
      .hand(BEARS)
      .battlefield(PHANTOM.name)
      .battlefield('Forest', { count: 4 })
      .seat(1)
      .at(step, { active, priority: 0 })
      .build();

  test("a creature spell is cast and resolves in an opponent's end step", () => {
    const g = board('end', 1);
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test("not in an opponent's main phase, and not in its controller's own end step", () => {
    expect(g2(board('postcombatMain', 1)).ok).toBe(false);
    expect(g2(board('end', 0)).ok).toBe(false);
  });
});

/** Tries to cast the Bears from seat 0's hand. */
const g2 = (g: ScenarioGame) => g.act(0).try.cast(BEARS);

// ---- Marvo, Deep Operative: "Whenever ~ attacks, clash with defending player." and "Whenever you win a clash, draw a card. Then you may cast a spell from your hand with mana value 8
// or less without paying its mana cost." (CR 701.30, 508.5, 608.2g, 118.9).

const MARVO = parsed(
  'SYNTHETIC Parsed Marvo',
  'Legendary Creature — Octopus Rogue',
  'Whenever ~ attacks, clash with defending player.\nWhenever you win a clash, draw a card. Then you may cast a spell from your hand with mana value 8 or less without paying its mana cost.',
  { manaCost: '{3}{U}{B}', colors: ['U', 'B'], power: '1', toughness: '8' },
);
const SPIDER = 'Giant Spider'; // {3}{G}: mana value 4
const PLAINS = 'Plains';
const SPELL = 'Lightning Bolt'; // an instant that could be cast free, to seat 1's face

describe('Marvo: clash with the defending player, and win a clash', () => {
  /** Three seats; seat 0 attacks seat 1 with Marvo. `mine` and `theirs` are the tops of the two libraries; seat 2 holds a Spider on top that must stay out of it. */
  const attack = (mine: readonly string[], theirs: readonly string[]) => {
    const g = scenario({ seats: 3 })
      .define(MARVO)
      .seat(0)
      .library(...mine, ...FILLER)
      .battlefield(MARVO.name)
      .hand(SPELL)
      .seat(1)
      .library(...theirs, ...FILLER)
      .seat(2)
      .library(SPIDER, ...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: MARVO.name, target: { player: 1 } }]);
    g.passAll();
    return g;
  };

  test('the clash is with the defending player: both of their cards are revealed, the third seat is not asked', () => {
    const g = attack([SPIDER], [BEARS]);
    g.expect.pending('confirmOptional', 0);
    g.act(0).decline();
    g.expect.pending('confirmOptional', 1);
    g.act(1).decline();
    g.expect.librarySize(2, FILLER.length + 1);
    g.expect.invariants();
  });

  test('winning draws a card, then the free cast of a spell with mana value 8 or less is offered', () => {
    const g = attack([SPIDER, SPELL], [BEARS]);
    g.act(0).decline();
    g.act(1).decline();
    // The Spider (4) beats the Bears (2): "whenever you win a clash" draws the Spider.
    g.passAll();
    g.expect.zone(SPIDER, 'hand', { seat: 0 });
    g.expect.pending('chooseCards', 0);
    // The Spider just drawn is cast without paying its mana cost: it resolves onto the battlefield with no mana spent.
    g.act(0).chooseCards(SPIDER);
    g.passAll();
    g.expect.zone(SPIDER, 'battlefield', { seat: 0 });
    g.expect.zone(SPELL, 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test('losing or tying triggers nothing', () => {
    const g = attack([BEARS], [SPIDER]);
    g.act(0).decline();
    g.act(1).decline();
    g.passAll();
    g.expect.handSize(0, 1);
    const tie = attack([BEARS], [BEARS]);
    tie.act(0).decline();
    tie.act(1).decline();
    tie.passAll();
    tie.expect.handSize(0, 1);
  });

  test("the opponent's win of a clash with Marvo's controller is not Marvo's controller's win", () => {
    const g = attack([PLAINS], [SPIDER]);
    g.act(0).decline();
    g.act(1).decline();
    g.expect.noEvent({ kind: 'clashWon', seat: 0 });
  });
});
