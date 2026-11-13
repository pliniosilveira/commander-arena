// The Hashaton deck (issue 31), group 9 (D-390 to D-395): the REAL Oracle text of Rona, Herald of Invasion // Rona, Tolarian Obliterator (the corpus's golden.jsonl,
// taken from the issue) goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the
// real text are what the engine runs. The helper cards are real fixtures. Pins: CR 107.4f (a Phyrexian mana symbol is paid with its color or 2 life), CR 602.5d (activate only as a
// sorcery), CR 701.27a and 712.18 (transform: the same object, the other face up), CR 712.8e (the back face has its own characteristics), CR 603.2 and 603.2c (one trigger for each source
// that deals damage), CR 701.13 (the card is exiled at random from a hand), CR 400.7j (it names the card), CR 305.1 and 110.2a (a land put onto the battlefield enters under the control
// of the player who puts it), CR 608.2g and 118.9 (cast without paying its mana cost), CR 608.2c ("Otherwise").
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

const RONA_CARD = real('Rona, Herald of Invasion // Rona, Tolarian Obliterator');
const RONA = RONA_CARD.name;
const BOLT = 'Lightning Bolt'; // {R} instant, 3 damage to any target
const BEARS = 'Grizzly Bears'; // {1}{G} 2/2
const FOREST = 'Forest';
const DIVINATION = 'Divination'; // {2}{U} sorcery, draw two
const ISAMARU = 'Isamaru, Hound of Konda'; // {W} legendary creature
const FILLER = Array.from({ length: 12 }, () => 'Plains');

describe('the card is supported, both faces', () => {
  test('it reads as supported and is valid', () => {
    expect(validateCard(RONA_CARD)).toEqual([]);
    expect(RONA_CARD.layout).toBe('transform');
    expect(RONA_CARD.faces).toHaveLength(2);
  });

  test('the front face has the untap trigger, the loot and the transform; the back face the trample and the damage trigger', () => {
    const [front, back] = RONA_CARD.faces;
    expect(front?.abilities.map((a) => a.kind)).toEqual(['triggered', 'activated', 'activated']);
    expect(back?.abilities.map((a) => a.kind)).toEqual(['keyword', 'triggered']);
  });
});

describe('{5}{B/P}: Transform ~. Activate only as a sorcery.', () => {
  const game = (
    life: number,
    lands: readonly string[],
    step: 'precombatMain' | 'beginningOfCombat' = 'precombatMain',
  ) =>
    scenario()
      .define(RONA_CARD)
      .seat(0)
      .life(life)
      .battlefield(RONA)
      .battlefield(...lands)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at(step, { active: 0, turn: 3 })
      .build();
  const FIVE = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains'];

  test('five lands pay {5}, 2 life pays {B/P}: it transforms into the 5/5 with trample (the same object)', () => {
    const g = game(40, FIVE);
    const before = g.id(RONA);
    g.expect.legal(0, { activate: RONA, ability: 2 });
    g.act(0).activate(RONA, { ability: 2, pay: true });
    g.passAll();
    g.expect.life(0, 38);
    expect(g.id(RONA)).toBe(before);
    const v = g.view(0).battlefield.find((o) => o.id === before);
    expect(v?.name).toBe('Rona, Tolarian Obliterator');
    expect(v?.power).toBe(5);
    expect(v?.toughness).toBe(5);
    expect(v?.keywords).toContain('trample');
    expect(v?.subtypes).toEqual(['Phyrexian', 'Wizard']);
    g.expect.invariants();
  });

  test('a Swamp pays the {B}: no life is paid', () => {
    const g = game(40, [...FIVE, 'Swamp']);
    g.act(0).activate(RONA, { ability: 2, pay: true });
    g.passAll();
    g.expect.life(0, 40);
    g.expect.tapped('Swamp');
    expect(g.view(0).battlefield.find((o) => o.id === g.id(RONA))?.power).toBe(5);
  });

  test('four lands are not enough, and 2 life is not payable at 2 life (the planner keeps 1)', () => {
    game(40, FIVE.slice(1)).expect.illegal(0, { activate: RONA, ability: 2 });
    const poor = game(2, FIVE);
    poor.expect.illegal(0, { activate: RONA, ability: 2 });
  });

  test('only at sorcery speed (CR 602.5d): not in combat', () => {
    const g = game(40, FIVE, 'beginningOfCombat');
    g.expect.illegal(0, { activate: RONA, ability: 2 });
  });
});

describe('the front face: the untap trigger and the loot', () => {
  test('{T}: Draw a card, then discard a card.', () => {
    const g = scenario()
      .define(RONA_CARD)
      .seat(0)
      .battlefield(RONA)
      .hand(BEARS)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(RONA, { ability: 1 });
    g.passAll();
    g.expect.tapped(RONA);
    // the discard is a choice: the hand holds the card drawn and Grizzly Bears
    g.expect.pending('chooseCards', 0);
  });

  test('Whenever you cast a legendary spell, untap Rona.', () => {
    const g = scenario()
      .define(RONA_CARD)
      .seat(0)
      .battlefield(RONA, { tapped: true })
      .battlefield('Plains')
      .hand(ISAMARU)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.expect.tapped(RONA);
    g.act(0).cast(ISAMARU, { pay: true });
    g.passAll();
    g.expect.tapped(RONA, false);
  });
});

describe('Rona, Tolarian Obliterator: "Whenever a source deals damage to ~, ..."', () => {
  /** Rona is already transformed: it is the back face on the battlefield, the opponent hits it with the Bolt. */
  function hit(hand: readonly string[], seed = 1) {
    const g = scenario()
      .define(RONA_CARD)
      .seed(seed)
      .seat(0)
      .battlefield(RONA, { face: 1 })
      .library(...FILLER)
      .seat(1)
      .hand(BOLT, ...hand)
      .battlefield('Mountain')
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).pass();
    g.act(1).cast(`${BOLT}[0]`, { targets: [RONA], pay: true });
    g.pass();
    g.pass();
    return g;
  }

  test('a land: the controller of Rona may put it onto the battlefield under their control', () => {
    const g = hit([FOREST]);
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    const forest = g.object(FOREST);
    expect(forest.zone).toBe('battlefield');
    expect(forest.controller).toBe(0);
    expect(forest.owner).toBe(1);
  });

  test('a spell: the controller of Rona may cast it without paying its mana cost', () => {
    const g = hit([DIVINATION]);
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards({ name: DIVINATION, seat: 1 });
    g.passAll();
    // Divination: two cards drawn by the player who cast it
    expect(g.state.seats[0]?.hand.length).toBe(2);
    g.expect.invariants();
  });

  test('a creature card is put onto the battlefield by the cast, under the control of the player who cast it', () => {
    const g = hit([BEARS]);
    g.passAll();
    g.act(0).chooseCards({ name: BEARS, seat: 1 });
    g.passAll();
    expect(g.object(BEARS).controller).toBe(0);
  });

  test('an empty hand does nothing', () => {
    const g = hit([]);
    g.passAll();
    g.expect.pending('priority', 0);
    expect(g.view(0).exile).toEqual([]);
  });

  test('the front face has no such trigger: the same Bolt on Rona, Herald of Invasion exiles nothing', () => {
    const g = scenario()
      .define(RONA_CARD)
      .seat(0)
      .battlefield(RONA)
      .library(...FILLER)
      .seat(1)
      .hand(BOLT, FOREST)
      .battlefield('Mountain')
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [RONA], pay: true });
    g.passAll();
    // the 1/3 died; nothing was exiled
    g.expect.zone(RONA, 'graveyard', { seat: 0 });
    expect(g.view(0).exile).toEqual([]);
  });
});
