// "As this creature enters, choose Believe or Doubt. • Believe — Whenever a nontoken creature you control dies, create a 2/2 black Horror enchantment creature token. • Doubt — At the
// beginning of your end step, you may return a nonland permanent you own to your hand. If you do, draw a card." (Phenomenon Investigators). SYNTHETIC cards: the real Oracle wording on
// shells that say SYNTHETIC.
// Pins: CR 108.3 and 608.2d ("you own" is the owner, whoever controls the permanent: the choice is made as the ability resolves and targets nothing), CR 400.3 (it goes to its owner's
// hand), CR 111.4 and 205.2a (a token with two card types), CR 603.10a (the creature's own death is seen by its ability), and the ruling of 2024-09-20: with no choice made the creature
// has neither ability. Built for more than one opponent: three seats.
import { validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const TEXT =
  'As this creature enters, choose Believe or Doubt.\n• Believe — Whenever a nontoken creature you control dies, create a 2/2 black Horror enchantment creature token.\n• Doubt — At the beginning of your end step, you may return a nonland permanent you own to your hand. If you do, draw a card.';
const SLEUTH = parsed('SYNTHETIC Investigators', 'Creature — Human Detective', TEXT, {
  manaCost: '{2}{U}{B}',
  power: '3',
  toughness: '4',
});
const RELIC = parsed('SYNTHETIC Plain Relic', 'Artifact', '', { manaCost: '{1}' });
const BEARS = 'Grizzly Bears';
const ANGEL = 'Serra Angel';
const MURDER = 'Murder';
const ISLANDS = Array.from({ length: 10 }, () => 'Island');
const SWAMPS = ['Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp'];

type Builder = ReturnType<typeof scenario>;
const game = (
  setup: (b: Builder) => void,
  at: { step?: 'precombatMain' | 'postcombatMain'; active?: number } = {},
) => {
  const b = scenario({ seats: 3 }).define(SLEUTH).define(RELIC);
  for (let seat = 0; seat < 3; seat += 1) b.seat(seat).library(...ISLANDS);
  setup(b);
  return b.at(at.step ?? 'precombatMain', { active: at.active ?? 0, turn: 3 }).build();
};
type Game = ReturnType<typeof game>;
const horrors = (g: Game) => g.find({ name: 'Horror', zone: 'battlefield' });
const hand = (g: Game, seat = 0) => g.state.seats[seat]?.hand.length ?? 0;

describe('the text is read', () => {
  test('the choice, and one ability for each word', () => {
    expect(SLEUTH.faces[0]?.abilities).toMatchObject([
      {
        kind: 'replacement',
        replacement: { kind: 'asEntersChoose', what: 'option', options: ['Believe', 'Doubt'] },
      },
      {
        kind: 'triggered',
        trigger: {
          kind: 'dies',
          what: { types: ['creature'], token: false, controller: 'you' },
        },
        triggerCondition: { kind: 'chosenOption', option: 'Believe' },
        effect: {
          kind: 'createToken',
          token: {
            kind: 'custom',
            definition: {
              name: 'Horror',
              types: ['enchantment', 'creature'],
              subtypes: ['Horror'],
              colors: ['B'],
              power: 2,
              toughness: 2,
            },
          },
          count: 1,
        },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'you' },
        triggerCondition: { kind: 'chosenOption', option: 'Doubt' },
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'may',
              effect: {
                kind: 'moveToZone',
                objects: { kind: 'choose', filter: { notTypes: ['land'], ownedByYou: true } },
                to: 'hand',
              },
            },
            {
              kind: 'conditional',
              condition: { kind: 'didPrevious' },
              effect: { kind: 'draw', count: 1 },
            },
          ],
        },
      },
    ]);
    // "You own", not "you control": the filter names no controller.
    const [, , doubt] = SLEUTH.faces[0]?.abilities ?? [];
    expect(JSON.stringify(doubt)).not.toContain('controller');
    expect(validateCard(SLEUTH)).toEqual([]);
  });
});

describe('"As this creature enters, choose Believe or Doubt"', () => {
  test('the choice is asked as it enters', () => {
    const g = game((b) =>
      b.seat(0).hand(SLEUTH.name).battlefield('Island', 'Island', 'Swamp', 'Swamp'),
    );
    g.act(0).cast(SLEUTH.name, { pay: true });
    g.passAll();
    g.expect.pending('chooseOption', 0);
    g.act(0).chooseOption('Doubt');
    g.expect.chosen(SLEUTH.name, { option: 'Doubt' });
  });
});

describe('Believe: "Whenever a nontoken creature you control dies, create a 2/2 black Horror enchantment creature token"', () => {
  const board = (option: 'Believe' | 'Doubt' | null) =>
    game((b) => {
      b.seat(0)
        .battlefield(SLEUTH.name, option === null ? {} : { chosen: { option } })
        .battlefield(BEARS, ...SWAMPS)
        .hand(MURDER, MURDER);
      b.seat(1).battlefield(ANGEL);
    });

  test('a nontoken creature you control dies: one Horror, an enchantment creature', () => {
    const g = board('Believe');
    g.act(0).cast(`${MURDER}[0]`, { targets: [BEARS], pay: true });
    g.passAll();
    const made = horrors(g);
    expect(made).toHaveLength(1);
    const [token] = made;
    if (token === undefined) throw new Error('no token');
    g.expect.pt(token.id, 2, 2);
    g.expect.derived(token.id, {
      types: ['enchantment', 'creature'],
      subtypes: ['Horror'],
      colors: ['B'],
    });
    expect(token.controller).toBe(0);
    g.expect.invariants();
  });

  test('the token dying does not trigger it (a nontoken creature)', () => {
    const g = board('Believe');
    g.act(0).cast(`${MURDER}[0]`, { targets: [BEARS], pay: true });
    g.passAll();
    const [token] = horrors(g);
    if (token === undefined) throw new Error('no token');
    g.act(0).cast(`${MURDER}[0]`, { targets: [token.id], pay: true });
    g.passAll();
    expect(horrors(g)).toHaveLength(0);
  });

  test("an opponent's creature dying does not trigger it", () => {
    const g = board('Believe');
    g.act(0).cast(`${MURDER}[0]`, { targets: [ANGEL], pay: true });
    g.passAll();
    g.expect.zone(ANGEL, 'graveyard');
    expect(horrors(g)).toHaveLength(0);
  });

  test('its own death is seen (CR 603.10a)', () => {
    const g = board('Believe');
    g.act(0).cast(`${MURDER}[0]`, { targets: [SLEUTH.name], pay: true });
    g.passAll();
    g.expect.zone(SLEUTH.name, 'graveyard');
    expect(horrors(g)).toHaveLength(1);
  });

  test('Doubt chosen: no token', () => {
    const g = board('Doubt');
    g.act(0).cast(`${MURDER}[0]`, { targets: [BEARS], pay: true });
    g.passAll();
    expect(horrors(g)).toHaveLength(0);
  });

  test('no choice made (ruling of 2024-09-20): neither ability', () => {
    const g = board(null);
    g.act(0).cast(`${MURDER}[0]`, { targets: [BEARS], pay: true });
    g.passAll();
    expect(horrors(g)).toHaveLength(0);
    g.advanceTo('end');
    g.expect.stack([]);
    g.passAll();
    g.expect.pending('priority');
    g.expect.zone(SLEUTH.name, 'battlefield');
  });
});

describe('Doubt: "At the beginning of your end step, you may return a nonland permanent you own to your hand. If you do, draw a card."', () => {
  /** Seat 0 owns the Investigators, a relic it controls and a relic seat 2 controls; it controls Bears that seat 1 owns. */
  const board = (option: 'Believe' | 'Doubt' = 'Doubt') => {
    const g = game(
      (b) => {
        b.seat(0)
          .battlefield(SLEUTH.name, { chosen: { option } })
          .battlefield(RELIC.name, { label: 'mine' })
          .battlefield(RELIC.name, { label: 'lent', controller: 2 })
          .battlefield('Swamp');
        b.seat(1).battlefield(BEARS, { controller: 0 }).battlefield(ANGEL);
      },
      { step: 'postcombatMain' },
    );
    g.advanceTo('end');
    return g;
  };
  const answer = (g: Game) => {
    g.passAll();
    return g.state.pending;
  };

  test('the choice is among the nonland permanents you own, whoever controls them', () => {
    const g = board();
    g.expect.stack([`${SLEUTH.name} (ability)`]);
    expect(answer(g)).toMatchObject({ kind: 'confirmOptional', seat: 0 });
    g.act(0).accept();
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error(`pending is ${d?.kind}`);
    expect(d.seat).toBe(0);
    // Not the Swamp (a land), not the Bears (controlled, owned by seat 1), not the Angel.
    expect([...d.legal].sort()).toEqual([g.id(SLEUTH.name), g.id('mine'), g.id('lent')].sort());
  });

  test('a permanent you own that an opponent controls returns to your hand, and you draw', () => {
    const g = board();
    answer(g);
    g.act(0).accept();
    const before = hand(g);
    g.act(0).choosePermanents('lent');
    expect(g.object('lent')).toMatchObject({ zone: 'hand', owner: 0 });
    expect(g.state.seats[0]?.hand).toContain(g.id('lent'));
    // The relic and the card drawn.
    expect(hand(g)).toBe(before + 2);
    g.expect.librarySize(0, ISLANDS.length - 1);
    expect(hand(g, 2)).toBe(0);
    g.expect.invariants();
  });

  test('declining returns nothing and draws nothing', () => {
    const g = board();
    answer(g);
    const before = hand(g);
    g.act(0).decline();
    expect(hand(g)).toBe(before);
    expect(g.object('lent').zone).toBe('battlefield');
    g.expect.stack([]);
    g.expect.librarySize(0, ISLANDS.length);
  });

  test('it may return itself', () => {
    const g = board();
    answer(g);
    g.act(0).accept();
    g.act(0).choosePermanents(SLEUTH.name);
    g.expect.zone(SLEUTH.name, 'hand', { seat: 0 });
    g.expect.librarySize(0, ISLANDS.length - 1);
  });

  test('nothing you own to return: no card is drawn', () => {
    // Seat 0 controls an Investigators that seat 1 owns, Bears that seat 1 owns and a land of its own.
    const g = game(
      (b) => {
        b.seat(1)
          .battlefield(SLEUTH.name, { chosen: { option: 'Doubt' }, controller: 0 })
          .battlefield(BEARS, { controller: 0 });
        b.seat(0).battlefield('Swamp');
      },
      { step: 'postcombatMain' },
    );
    g.advanceTo('end');
    g.expect.stack([`${SLEUTH.name} (ability)`]);
    g.passAll();
    if (g.state.pending?.kind === 'confirmOptional') g.act(0).accept();
    g.expect.pending('priority');
    g.expect.stack([]);
    g.expect.zone(SLEUTH.name, 'battlefield');
    g.expect.zone(BEARS, 'battlefield');
    g.expect.librarySize(0, ISLANDS.length);
    g.expect.handSize(0, 0);
  });

  test("not at another player's end step", () => {
    const g = game(
      (b) => {
        b.seat(0)
          .battlefield(SLEUTH.name, { chosen: { option: 'Doubt' } })
          .battlefield(RELIC.name);
      },
      { step: 'postcombatMain', active: 1 },
    );
    g.advanceTo('end');
    g.expect.stack([]);
  });

  test('Believe chosen: no end step trigger', () => {
    const g = board('Believe');
    g.expect.stack([]);
  });
});
