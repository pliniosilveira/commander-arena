// The counting nodes of issue 104: the `extreme` amount (the greater or the lesser of two amounts, CR 608.2c), the `opponentCount` amount (CR 102.2, 102.3) and the target slot
// `upToAmount` (up to as many targets as an amount says as the ability triggers, CR 107.3c, 603.3d). A node that the engine runs in one place only is refused elsewhere with a message,
// never accepted and half run. The runs through applyAction are in packages/cards/test/convert-grammar-engine-counting.test.ts.
import { describe, expect, test } from 'vitest';
import { type Amount, type CardDefinition, syntheticCard, validateCard } from '../src/index';
import { amountOf } from '../src/rules/amounts';
import { scenario } from '../src/testing/index';

const messages = (card: CardDefinition) => validateCard(card).map((i) => i.message);

/** The synthetic card with its first ability replaced by `ability`. */
function withAbility(ability: unknown): CardDefinition {
  const card = syntheticCard('SYNTHETIC Plain Zombie');
  const [face] = card.faces;
  if (face === undefined) throw new Error('no face');
  return { ...card, faces: [{ ...face, abilities: [ability] }] } as never;
}

const COUNT = (zone?: string) => ({
  kind: 'countOf',
  filter: { subtypes: ['Zombie'], controller: 'you', ...(zone === undefined ? {} : { zone }) },
});
const draw = (count: unknown) => ({ kind: 'draw', player: { kind: 'you' }, count });
const enters = { kind: 'entersBattlefield', what: { kind: 'this' } };
const triggered = (extra: Record<string, unknown>, effect: unknown = draw(1)) => ({
  kind: 'triggered',
  trigger: enters,
  effect,
  ...extra,
});
const slot = (extra: Record<string, unknown>) => ({
  id: 't1',
  what: { kind: 'object', filter: { zone: 'graveyard', subtypes: ['Zombie'], controller: 'you' } },
  ...extra,
});

describe('the amount `extreme`', () => {
  test('valid with two or more amounts, either pick', () => {
    for (const pick of ['greater', 'lesser']) {
      expect(
        messages(withAbility(triggered({}, draw({ kind: 'extreme', pick, of: [COUNT(), 2] })))),
        pick,
      ).toEqual([]);
    }
  });

  test.each([
    [{ kind: 'extreme', pick: 'greater', of: [COUNT()] }, 'at least two amounts'],
    [{ kind: 'extreme', pick: 'greatest', of: [COUNT(), 2] }, 'the greater or the lesser'],
    [{ kind: 'extreme', pick: 'lesser', of: [COUNT(), { kind: 'x' }] }, 'X'],
  ])('%j is refused: %s', (amount, text) => {
    expect(messages(withAbility(triggered({}, draw(amount)))).join(' | ')).toContain(text);
  });

  test('is the greater or the lesser of what its parts are now (CR 608.2c)', () => {
    const g = scenario().seat(0).battlefield('Island').seat(1).at('precombatMain').build();
    const read = (amount: Amount) => amountOf(g.state, amount, { controller: 0, source: null }, []);
    expect(read({ kind: 'extreme', pick: 'greater', of: [3, 5, 4] })).toBe(5);
    expect(read({ kind: 'extreme', pick: 'lesser', of: [3, 5, 4] })).toBe(3);
    expect(read({ kind: 'extreme', pick: 'greater', of: [2, 2] })).toBe(2);
    // Parts that are themselves amounts: half of 5 rounded down is 2, which is less than 3.
    expect(
      read({
        kind: 'extreme',
        pick: 'lesser',
        of: [{ kind: 'half', of: 5, round: 'down' }, 3],
      }),
    ).toBe(2);
  });
});

describe('the amount `opponentCount`', () => {
  test('is the opponents of the controller still in the game (CR 102.2)', () => {
    const g = scenario().seat(0).battlefield('Island').seat(1).at('precombatMain').build();
    const ctx = { controller: 0, source: null } as const;
    expect(amountOf(g.state, { kind: 'opponentCount' }, ctx, [])).toBe(1);
    // CR 102.3: in a game of more players every player but you is an opponent; a player who has lost the game is no longer in it.
    const [first, second] = g.state.seats;
    if (first === undefined || second === undefined) throw new Error('no seats');
    const four = {
      ...g.state,
      seats: [first, second, { ...second, id: 2 }, { ...second, id: 3 }],
    } as typeof g.state;
    expect(amountOf(four, { kind: 'opponentCount' }, ctx, [])).toBe(3);
    const lost = {
      ...four,
      seats: four.seats.map((s) => (s.id === 3 ? { ...s, hasLost: true } : s)),
    } as typeof g.state;
    expect(amountOf(lost, { kind: 'opponentCount' }, ctx, [])).toBe(2);
  });
});

describe('the target slot `upToAmount`', () => {
  const effect = {
    kind: 'moveToZone',
    objects: { kind: 'target', id: 't1' },
    to: 'battlefield',
    controller: 'you',
  };

  test('valid in a triggered ability, with an amount that reads the game', () => {
    for (const upToAmount of [{ kind: 'opponentCount' }, COUNT(), 2]) {
      expect(
        messages(withAbility(triggered({ targets: [slot({ upToAmount })] }, effect))),
        JSON.stringify(upToAmount),
      ).toEqual([]);
    }
  });

  test('refused in a spell or an activated ability: only a trigger puts it on the stack with the number fixed', () => {
    const activated = {
      kind: 'activated',
      cost: [{ kind: 'tap' }],
      targets: [slot({ upToAmount: { kind: 'opponentCount' } })],
      effect,
    };
    expect(messages(withAbility(activated)).join(' | ')).toContain('only a slot of a triggered');
  });

  test.each([
    [{ upToAmount: { kind: 'opponentCount' }, max: 2 }, 'no min, max or other count'],
    [{ upToAmount: { kind: 'opponentCount' }, min: 0 }, 'no min, max or other count'],
    [{ upToAmount: { kind: 'opponentCount' }, anyNumber: true }, 'no min, max or other count'],
    [{ upToAmount: { kind: 'opponentCount' }, countX: true }, 'no min, max or other count'],
    [{ upToAmount: { kind: 'x' } }, 'X'],
    [{ upToAmount: { kind: 'powerOf', of: { kind: 'target', id: 't1' } } }, 'not'],
  ])('%j is refused: %s', (extra, text) => {
    expect(
      messages(withAbility(triggered({ targets: [slot(extra)] }, effect))).join(' | '),
    ).toContain(text);
  });
});
