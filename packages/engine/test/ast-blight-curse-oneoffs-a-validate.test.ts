// Validation of what the one-offs of the Blight Curse deck need: `discard.upTo` (CR 701.9, 107.1c), `exchangeLifeWithPt` (CR 701.12g), `clash` and the condition `clashWon` (CR 701.30),
// the `repeatWhile` of a process that draws and ends in a clash, and an X total of a divided damage (CR 601.2d). A node is well-formed and executable (validateCard) only as the engine
// runs it. Cards are SYNTHETIC, defined here.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import {
  type CardDefinition,
  type Effect,
  type SpellText,
  type TargetSpec,
  validateCard,
} from '../src/index';

function sorcery(
  spell: SpellText,
  additionalCosts?: CardDefinition['faces'][0]['additionalCosts'],
) {
  return singleFace({
    name: 'SYNTHETIC One-off Probe',
    manaCost: ['2', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: '',
    spell,
    ...(additionalCosts === undefined ? {} : { additionalCosts }),
  });
}

const messages = (card: CardDefinition) => validateCard(card).map((i) => i.message);
const YOU = { kind: 'you' } as const;
const clash: Effect = { kind: 'clash' };
const draw: Effect = { kind: 'draw', player: YOU, count: 2 };

describe('discard up to N (CR 701.9)', () => {
  const discard = (extra: Record<string, unknown>): Effect =>
    ({ kind: 'discard', player: YOU, count: 2, upTo: true, ...extra }) as Effect;

  test('a discard of up to two cards validates, and what it discarded is what "that many" counts', () => {
    const card = sorcery({
      effect: {
        kind: 'sequence',
        effects: [
          discard({}),
          { kind: 'draw', player: YOU, count: { kind: 'thisWay', what: 'discarded' } },
        ],
      },
    });
    expect(validateCard(card)).toEqual([]);
  });

  test('it does not go with another way of choosing the cards', () => {
    const message =
      'upTo is true, and goes with none of anyNumber, hand, random, unless or together';
    for (const extra of [
      { anyNumber: true },
      { hand: true },
      { random: true },
      { together: true },
    ]) {
      expect(messages(sorcery({ effect: discard(extra) }))).toContain(message);
    }
  });
});

describe('exchange a life total with a power or toughness (CR 701.12g)', () => {
  const exchange = (player: unknown): Effect =>
    ({ kind: 'exchangeLifeWithPt', player, object: { kind: 'this' }, stat: 'toughness' }) as Effect;

  test('one player and a permanent validate', () => {
    expect(validateCard(sorcery({ effect: exchange(YOU) }))).toEqual([]);
  });

  test('a group of players is refused: an exchange is made by one player', () => {
    expect(messages(sorcery({ effect: exchange({ kind: 'eachOpponent' }) }))).toContain(
      'an exchange is made by one player: name a single player',
    );
  });
});

describe('clash (CR 701.30)', () => {
  test('a process that draws and ends in a clash is repeated while the controller wins it', () => {
    const card = sorcery({
      effect: {
        kind: 'repeatWhile',
        effects: [draw, clash],
        condition: { kind: 'clashWon' },
      },
    });
    expect(validateCard(card)).toEqual([]);
  });

  test('clashWon needs a clash before it in the same sequence', () => {
    const card = sorcery({
      effect: {
        kind: 'sequence',
        effects: [{ kind: 'conditional', condition: { kind: 'clashWon' }, effect: draw }],
      },
    });
    expect(messages(card)).toContain('clashWon needs a clash before it in the same sequence');
    const after = sorcery({
      effect: {
        kind: 'sequence',
        effects: [clash, { kind: 'conditional', condition: { kind: 'clashWon' }, effect: draw }],
      },
    });
    expect(validateCard(after)).toEqual([]);
  });

  test('a repeated clash is tested by clashWon, and the process draws so that it ends', () => {
    const wrongTest = sorcery({
      effect: {
        kind: 'repeatWhile',
        effects: [draw, clash],
        condition: { kind: 'dieResult', compare: { cmp: 'equal', value: 1 } },
      },
    });
    expect(messages(wrongTest)).toContain(
      'the test of a repeated clash reads who won it (clashWon)',
    );
    const noDraw = sorcery({
      effect: { kind: 'repeatWhile', effects: [clash], condition: { kind: 'clashWon' } },
    });
    expect(messages(noDraw)).toContain(
      'the repeated process ends with a mill (each pass takes cards out of a library, so the repeat ends), or draws cards and ends with a clash',
    );
  });
});

describe('a divided damage of X (CR 601.2d, 107.3a)', () => {
  const slot: TargetSpec = {
    id: 't1',
    what: { kind: 'object', filter: { types: ['creature'], zone: 'battlefield' } },
    divide: { total: { kind: 'x' } },
  };

  test('a spell with an X cost divides the X it announces', () => {
    const card = sorcery(
      {
        x: true,
        targets: [slot],
        effect: { kind: 'dealDividedDamage', to: { kind: 'target', id: 't1' } },
      },
      [{ kind: 'payXLife' }],
    );
    expect(validateCard(card)).toEqual([]);
  });

  test('a spell with no X to announce is refused', () => {
    const card = sorcery({
      targets: [slot],
      effect: { kind: 'dealDividedDamage', to: { kind: 'target', id: 't1' } },
    });
    expect(messages(card).length).toBeGreaterThan(0);
  });
});
