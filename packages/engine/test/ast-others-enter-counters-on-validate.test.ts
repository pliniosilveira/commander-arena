// "Each other creature you control enters with an additional X +1/+1 counters on it, where X is the number of +1/+1 counters on ~" (`othersEnterWithCounters` with the count `countersOn` of
// `this`): what `validateCard` accepts and refuses. Pins: CR 614.12 (read as the other permanent enters), CR 122.1 (counters). Cards are SYNTHETIC probes built here.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import type { Ability, CardDefinition } from '../src/index';
import { validateCard } from '../src/index';

const enters = (count: unknown): Ability =>
  ({
    kind: 'replacement',
    replacement: {
      kind: 'othersEnterWithCounters',
      what: { types: ['creature'], controller: 'you' },
      counter: '+1/+1',
      count,
    },
  }) as unknown as Ability;

const creature = (ability: Ability): CardDefinition =>
  singleFace({
    name: 'SYNTHETIC Counter Reader',
    manaCost: ['3'],
    types: ['creature'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText: 'SYNTHETIC',
    abilities: [ability],
  });

const messages = (card: CardDefinition): string =>
  validateCard(card)
    .map((i) => i.message)
    .join('\n');

describe('othersEnterWithCounters counting the counters on this permanent', () => {
  test('a count of the counters of a kind, or of every kind, on this permanent is valid', () => {
    expect(
      validateCard(
        creature(enters({ kind: 'countersOn', of: { kind: 'this' }, counter: '+1/+1' })),
      ),
    ).toEqual([]);
    expect(validateCard(creature(enters({ kind: 'countersOn', of: { kind: 'this' } })))).toEqual(
      [],
    );
  });

  test('it reads this permanent only', () => {
    expect(
      messages(
        creature(enters({ kind: 'countersOn', of: { kind: 'triggerSubject' }, counter: '+1/+1' })),
      ),
    ).toMatch(/counters of this permanent only/);
  });

  test('the counter name is not empty', () => {
    expect(
      messages(creature(enters({ kind: 'countersOn', of: { kind: 'this' }, counter: '' }))),
    ).toMatch(/counter name must be non-empty/);
  });
});
