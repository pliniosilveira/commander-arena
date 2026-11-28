// The Peace Offering deck (issue 112), group C: the REAL Oracle text of Kwain, Itinerant Meddler, Selvala, Explorer Returned, Tempt with Bunnies, Tempt with Discovery and Intellectual
// Offering (the golden corpus, taken from the issue) goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the
// nodes the parser writes for the real text are what the engine runs. Pins: CR 101.4 (APNAP order of the offers), 608.2d (each player's choice), 121.1 (drawing), 701.23 and 701.24
// (searching and shuffling), 701.20a (revealing), 605.1a (an ability that moves cards out of a library is not a mana ability), 608.2c (counting what was done this way).
// Built for more than one opponent: every offer is played with three seats, an opponent who declines beside one who accepts.
import { readFileSync } from 'node:fs';
import { type CardDefinition, type SeatId, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const kwain = real('Kwain, Itinerant Meddler');
const selvala = real('Selvala, Explorer Returned');
const bunnies = real('Tempt with Bunnies');
const discovery = real('Tempt with Discovery');
const offering = real('Intellectual Offering');

const ISLANDS = Array.from({ length: 10 }, () => 'Island');
const BEARS = 'Grizzly Bears';
const GOBLIN = 'Raging Goblin';

describe('every card is valid', () => {
  test.each([
    ['Kwain, Itinerant Meddler', kwain],
    ['Selvala, Explorer Returned', selvala],
    ['Tempt with Bunnies', bunnies],
    ['Tempt with Discovery', discovery],
    ['Intellectual Offering', offering],
  ] as const)('%s', (_name, card) => {
    expect(validateCard(card)).toEqual([]);
  });
});

describe('what the grammar writes for the real text', () => {
  const face = (card: CardDefinition) => {
    const [only] = card.faces;
    if (only === undefined) throw new Error(`${card.name} has no face`);
    return only;
  };

  test('Kwain: an offer to each player, then life for the players who drew', () => {
    expect(face(kwain).abilities).toMatchObject([
      {
        kind: 'activated',
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'playersMay',
              players: { kind: 'eachPlayer' },
              runsAs: 'chooser',
              effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
            },
            { kind: 'gainLife', player: { kind: 'actedThisWay', act: 'drew' }, amount: 1 },
          ],
        },
      },
    ]);
  });

  test('Selvala: an activated ability that uses the stack, not a mana ability (CR 605.1a)', () => {
    expect(face(selvala).abilities).toMatchObject([
      {
        kind: 'activated',
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'revealTopBranches',
              player: { kind: 'eachPlayer' },
              branches: [{ ifMatches: { notTypes: ['land'] }, asController: true }],
            },
            { kind: 'draw', player: { kind: 'eachPlayer' }, count: 1 },
          ],
        },
      },
    ]);
  });

  test('Tempt with Bunnies: the offer, then the same again once for each opponent who accepted', () => {
    const effect = face(bunnies).spell?.effect;
    expect(effect).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'draw' },
        { kind: 'createToken' },
        { kind: 'playersMay', players: { kind: 'eachOpponent' }, runsAs: 'chooser' },
        { kind: 'repeat', times: { kind: 'thisWay', what: 'playersAccepted' } },
      ],
    });
  });

  test('Tempt with Discovery: no search shuffles; the players who searched shuffle at the end', () => {
    const effect = face(discovery).spell?.effect;
    expect(effect).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'search', player: { kind: 'you' }, shuffle: false },
        { kind: 'search', player: { kind: 'eachOpponent' }, optional: true, shuffle: false },
        {
          kind: 'repeat',
          times: {
            kind: 'playerCount',
            of: { kind: 'actedThisWay', act: 'searched', of: { kind: 'eachOpponent' } },
          },
          effect: { kind: 'search', player: { kind: 'you' }, shuffle: false },
        },
        { kind: 'shuffle', player: { kind: 'actedThisWay', act: 'searched' } },
      ],
    });
  });
});

describe('the words are read only where the engine can run them', () => {
  const read = (typeLine: string, text: string) =>
    importCard(
      syntheticCard({
        name: 'SYNTHETIC Not Read',
        typeLine,
        oracleText: text.replaceAll('~', 'SYNTHETIC Not Read'),
        power: '1',
        toughness: '1',
      }),
      undefined,
      NO_OVERRIDES,
    ).support.status;

  test.each([
    // The opponents who took the offer are counted only after an offer to each opponent.
    'Draw a card. For each opponent who does, you draw a card and you create a 1/1 white Rabbit creature token.',
    // Every search is of one kind of card.
    'Search your library for a land card and put it onto the battlefield. Each opponent may search their library for a basic land card and put it onto the battlefield. For each opponent who searches a library this way, search your library for a land card and put it onto the battlefield. Then each player who searched a library this way shuffles.',
    // The searches are shuffled only when the text says so.
    'Each opponent may search their library for a land card and put it onto the battlefield. For each opponent who searches a library this way, search your library for a land card and put it onto the battlefield.',
  ])('Sorcery: %s', (text) => {
    expect(read('Sorcery', text)).toBe('unsupported');
  });

  test.each([
    // An offer to the opponents only is not this one.
    '{T}: Each opponent may draw a card, then each opponent who drew a card this way gains 1 life.',
    // Selvala's reveal counts the nonland cards, not the lands.
    '{T}: Each player reveals the top card of their library. For each land card revealed this way, add {G} and you gain 1 life. Then each player draws a card.',
  ])('Creature: %s', (text) => {
    expect(read('Creature — Elf', text)).toBe('unsupported');
  });

  test('"that player" of "all nonland permanents that player controls" is the opponent chosen before it', () => {
    expect(
      read(
        'Instant',
        'Choose an opponent. Untap all nonland permanents you control and all nonland permanents that player controls.',
      ),
    ).toBe('supported');
    // With no player named before it, "that player" names nobody.
    expect(read('Instant', 'Untap all nonland permanents that player controls.')).toBe(
      'unsupported',
    );
  });
});

describe('Kwain, Itinerant Meddler (CR 101.4, 608.2d, 121.1)', () => {
  const board = () =>
    scenario({ seats: 3 })
      .define(kwain)
      .seat(0)
      .life(20)
      .library(...ISLANDS)
      .battlefield(kwain.name)
      .seat(1)
      .life(20)
      .library(...ISLANDS)
      .seat(2)
      .life(20)
      .library(...ISLANDS)
      .at('precombatMain', { active: 0 })
      .build();

  test('each player is asked in turn order; those who drew gain 1 life, the one who declined neither', () => {
    const g = board();
    g.act(0).activate(kwain.name, { pay: true });
    // The ability uses the stack.
    expect(g.state.stack).toHaveLength(1);
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.pending('confirmOptional', 1);
    g.act(1).decline();
    g.expect.pending('confirmOptional', 2);
    // Nothing happens until the last player has answered (CR 101.4).
    g.expect.handSize(0, 0);
    g.act(2).accept();
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.handSize(1, 0);
    g.expect.handSize(2, 1);
    g.expect.life(0, 21);
    g.expect.life(1, 20);
    g.expect.life(2, 21);
    g.expect.invariants();
  });

  test('when everyone declines, nobody draws and nobody gains life', () => {
    const g = board();
    g.act(0).activate(kwain.name, { pay: true });
    g.passAll();
    g.act(0).decline();
    g.act(1).decline();
    g.act(2).decline();
    g.passAll();
    for (const seat of [0, 1, 2] as const) {
      g.expect.handSize(seat, 0);
      g.expect.life(seat, 20);
    }
  });
});

describe('Selvala, Explorer Returned (CR 701.20a, 605.1a, 608.2c, 106.4)', () => {
  const board = () =>
    scenario({ seats: 3 })
      .define(selvala)
      .seat(0)
      .life(20)
      .library(BEARS, ...ISLANDS)
      .battlefield(selvala.name)
      .seat(1)
      .life(20)
      .library('Island', ...ISLANDS)
      .seat(2)
      .life(20)
      .library(GOBLIN, ...ISLANDS)
      .at('precombatMain', { active: 0 })
      .build();

  test('it is not a mana ability: it goes on the stack, and the opponents can respond', () => {
    const g = board();
    g.act(0).activate(selvala.name, { pay: true });
    expect(g.state.stack).toHaveLength(1);
    g.expect.pool(0, '');
  });

  test('{G} and 1 life for each nonland card revealed, then every player draws the card revealed', () => {
    const g = board();
    g.act(0).activate(selvala.name, { pay: true });
    g.passAll();
    // Grizzly Bears and Raging Goblin are not lands; the Island is.
    g.expect.pool(0, 'GG');
    g.expect.life(0, 22);
    g.expect.life(1, 20);
    g.expect.life(2, 20);
    g.expect.zone(BEARS, 'hand', { seat: 0, count: 1 });
    g.expect.zone('Island', 'hand', { seat: 1, count: 1 });
    g.expect.zone(GOBLIN, 'hand', { seat: 2, count: 1 });
    g.expect.invariants();
  });
});

describe('Tempt with Bunnies: the tempting offer (CR 101.4, 608.2d, 121.1, 111.2)', () => {
  const board = () =>
    scenario({ seats: 3 })
      .define(bunnies)
      .seat(0)
      .library(...ISLANDS)
      .hand(bunnies.name)
      .battlefield('Plains', 'Plains', 'Plains')
      .seat(1)
      .library(...ISLANDS)
      .seat(2)
      .library(...ISLANDS)
      .at('precombatMain', { active: 0 })
      .build();

  test('each opponent who accepts draws and makes a Rabbit, and you do it again once for each of them', () => {
    const g = board();
    g.act(0).cast(bunnies.name, { pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 1);
    g.act(1).accept();
    g.expect.pending('confirmOptional', 2);
    g.act(2).accept();
    g.passAll();
    // Yours: one for the spell and one for each of the two opponents who accepted.
    g.expect.zone('Rabbit', 'battlefield', { seat: 0, count: 3 });
    g.expect.zone('Rabbit', 'battlefield', { seat: 1, count: 1 });
    g.expect.zone('Rabbit', 'battlefield', { seat: 2, count: 1 });
    g.expect.handSize(0, 3);
    g.expect.handSize(1, 1);
    g.expect.handSize(2, 1);
    g.expect.derived('Rabbit[0]', { colors: ['W'], subtypes: ['Rabbit'] });
    g.expect.invariants();
  });

  test('an opponent who declines gets nothing and gives you nothing', () => {
    const g = board();
    g.act(0).cast(bunnies.name, { pay: true });
    g.passAll();
    g.act(1).decline();
    g.act(2).accept();
    g.passAll();
    g.expect.zone('Rabbit', 'battlefield', { seat: 0, count: 2 });
    g.expect.zone('Rabbit', 'battlefield', { seat: 1, count: 0 });
    g.expect.zone('Rabbit', 'battlefield', { seat: 2, count: 1 });
    g.expect.handSize(0, 2);
    g.expect.handSize(1, 0);
  });

  test('when no opponent accepts you only get the first card and Rabbit', () => {
    const g = board();
    g.act(0).cast(bunnies.name, { pay: true });
    g.passAll();
    g.act(1).decline();
    g.act(2).decline();
    g.passAll();
    g.expect.zone('Rabbit', 'battlefield', { seat: 0, count: 1 });
    g.expect.handSize(0, 1);
  });
});

describe('Tempt with Discovery: the tempting offer (CR 101.4, 701.23, 701.24)', () => {
  const LANDS = ['Forest', 'Swamp', BEARS, BEARS, BEARS];
  const board = () =>
    scenario({ seats: 3 })
      .define(discovery)
      .seat(0)
      .library('Mountain', ...LANDS)
      .hand(discovery.name)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest')
      .seat(1)
      .library(...LANDS)
      .seat(2)
      .library(...LANDS)
      .at('precombatMain', { active: 0 })
      .build();

  const shuffledSince = (g: ReturnType<typeof board>, mark: number) =>
    g
      .eventsSince(mark)
      .filter((e) => e.kind === 'libraryShuffled')
      .map((e) => (e as { seat: SeatId }).seat);

  test('you search, each opponent who accepts searches, you search again for each of them, then every searcher shuffles once', () => {
    const g = board();
    g.act(0).cast(discovery.name, { pay: true });
    g.passAll();
    const mark = g.mark();
    g.act(0).chooseCards('Swamp');
    g.expect.pending('confirmOptional', 1);
    g.act(1).accept();
    g.act(1).chooseCards('Forest');
    g.expect.pending('confirmOptional', 2);
    g.act(2).decline();
    // One opponent searched, so you search once more.
    g.act(0).chooseCards('Forest');
    g.passAll();
    expect(g.find({ name: 'Forest', zone: 'battlefield', seat: 0 })).toHaveLength(5);
    expect(g.find({ name: 'Swamp', zone: 'battlefield', seat: 0 })).toHaveLength(1);
    g.expect.zone('Forest', 'battlefield', { seat: 1, count: 1 });
    g.expect.zone('Forest', 'battlefield', { seat: 2, count: 0 });
    g.expect.zone('Swamp', 'battlefield', { seat: 2, count: 0 });
    // CR 701.24: the players who searched shuffle, each once; the one who declined does not.
    expect(shuffledSince(g, mark).sort()).toEqual([0, 1]);
    g.expect.invariants();
  });

  test('two opponents who accept give you two more searches', () => {
    const g = board();
    g.act(0).cast(discovery.name, { pay: true });
    g.passAll();
    g.act(0).chooseCards('Forest');
    g.act(1).accept();
    g.act(1).chooseCards('Forest');
    g.act(2).accept();
    g.act(2).chooseCards('Swamp');
    g.act(0).chooseCards('Swamp');
    g.act(0).chooseCards('Mountain');
    g.passAll();
    expect(g.find({ name: 'Forest', zone: 'battlefield', seat: 0 })).toHaveLength(5);
    expect(g.find({ name: 'Swamp', zone: 'battlefield', seat: 0 })).toHaveLength(1);
    expect(g.find({ name: 'Mountain', zone: 'battlefield', seat: 0 })).toHaveLength(1);
    g.expect.zone('Swamp', 'battlefield', { seat: 2, count: 1 });
  });

  test('with no opponent accepting, you search once and shuffle', () => {
    const g = board();
    g.act(0).cast(discovery.name, { pay: true });
    g.passAll();
    const mark = g.mark();
    g.act(0).chooseCards('Swamp');
    g.act(1).decline();
    g.act(2).decline();
    g.passAll();
    g.expect.zone('Swamp', 'battlefield', { seat: 0, count: 1 });
    expect(shuffledSince(g, mark)).toEqual([0]);
  });
});

describe('Intellectual Offering (CR 608.2d, 102.2, 701.26b)', () => {
  const board = () =>
    scenario({ seats: 3 })
      .define(offering)
      .seat(0)
      .library(...ISLANDS)
      .hand(offering.name)
      .battlefield('Island', 'Island', 'Island', 'Island', 'Island')
      .battlefield(BEARS, { tapped: true, label: 'mine' })
      .battlefield('Island', { tapped: true, label: 'my land' })
      .seat(1)
      .library(...ISLANDS)
      .battlefield(BEARS, { tapped: true, label: 'first' })
      .battlefield('Island', { tapped: true, label: 'first land' })
      .seat(2)
      .library(...ISLANDS)
      .battlefield(BEARS, { tapped: true, label: 'second' })
      .at('precombatMain', { active: 0 })
      .build();

  test('you and the first opponent chosen draw three; your nonland permanents and those of the second opponent chosen untap', () => {
    const g = board();
    g.act(0).cast(offering.name, { pay: true });
    g.passAll();
    // CR 608.2d: the opponents are chosen as the spell resolves, one for each paragraph, and may differ (the rulings).
    g.expect.pending('chooseOption', 0);
    g.act(0).chooseOption('seat:1');
    g.expect.pending('chooseOption', 0);
    g.act(0).chooseOption('seat:2');
    g.passAll();
    g.expect.handSize(0, 3);
    g.expect.handSize(1, 3);
    g.expect.handSize(2, 0);
    g.expect.tapped('mine', false);
    g.expect.tapped('second', false);
    // Lands stay tapped, and the opponent not chosen for the untap keeps its creature tapped.
    g.expect.tapped('my land', true);
    g.expect.tapped('first', true);
    g.expect.tapped('first land', true);
    g.expect.invariants();
  });
});
