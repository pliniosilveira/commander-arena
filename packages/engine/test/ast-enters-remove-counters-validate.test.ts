// "As this creature enters, remove all counters from any number of artifacts, creatures, and enchantments. This creature enters with X +1/+1 counters on it, where X is twice the number
// of counters removed this way." (`asEntersRemoveCounters` and the count `countersRemovedAsEntered` of `entersWithCounters`): what `validateCard` accepts and refuses.
// Pins: CR 614.12 (a replacement effect of the entering permanent), CR 122.1 (counters), CR 122.6 (enters with counters). Cards are SYNTHETIC probes built here.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import type { Ability, CardDefinition, ObjectFilter } from '../src/index';
import { validateCard } from '../src/index';

const FILTER: ObjectFilter = {
  anyOf: [{ types: ['artifact'] }, { types: ['creature'] }, { types: ['enchantment'] }],
};

const REMOVE = (filter: ObjectFilter = FILTER): Ability => ({
  kind: 'replacement',
  replacement: { kind: 'asEntersRemoveCounters', filter },
});
const ENTERS_WITH = (times?: number): Ability => ({
  kind: 'replacement',
  replacement: {
    kind: 'entersWithCounters',
    counter: '+1/+1',
    count: { kind: 'countersRemovedAsEntered', ...(times === undefined ? {} : { times }) },
  },
});

const creature = (abilities: Ability[], types: ('creature' | 'instant')[] = ['creature']) =>
  singleFace({
    name: 'SYNTHETIC Remover',
    manaCost: ['3'],
    types,
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText: 'SYNTHETIC',
    abilities,
  }) satisfies CardDefinition;

const messages = (card: CardDefinition): string =>
  validateCard(card)
    .map((i) => i.message)
    .join('\n');

describe('asEntersRemoveCounters and countersRemovedAsEntered', () => {
  test('the pair is valid, with and without a multiple', () => {
    expect(validateCard(creature([REMOVE(), ENTERS_WITH(2)]))).toEqual([]);
    expect(validateCard(creature([REMOVE(), ENTERS_WITH()]))).toEqual([]);
  });

  test('the count needs the removal on the same face', () => {
    expect(messages(creature([ENTERS_WITH(2)]))).toMatch(
      /counts the counters removed as it enters/,
    );
  });

  test('the multiple is an integer of 2 or more', () => {
    expect(messages(creature([REMOVE(), ENTERS_WITH(1)]))).toMatch(/2 or more/);
    expect(messages(creature([REMOVE(), ENTERS_WITH(2.5)]))).toMatch(/2 or more/);
  });

  test('the filter names the battlefield of every player: no zone, controller or owner', () => {
    for (const bad of [
      { ...FILTER, controller: 'you' as const },
      { ...FILTER, zone: 'graveyard' as const },
    ]) {
      expect(messages(creature([REMOVE(bad), ENTERS_WITH(2)]))).toMatch(
        /no zone, controller or owner/,
      );
    }
  });

  test('it is one question: a second question as it enters is refused', () => {
    const second: Ability = {
      kind: 'replacement',
      replacement: { kind: 'asEntersChoose', what: 'color' },
    };
    expect(messages(creature([REMOVE(), second, ENTERS_WITH(2)]))).toMatch(
      /at most one ability may ask a question/,
    );
  });

  test('only a permanent asks it', () => {
    expect(validateCard(creature([REMOVE(), ENTERS_WITH(2)], ['instant'])).length).toBeGreaterThan(
      0,
    );
  });

  test('"from all permanents" (all) is valid with the empty filter, asks nothing, and so leaves room for one question', () => {
    const all: Ability = {
      kind: 'replacement',
      replacement: { kind: 'asEntersRemoveCounters', filter: {}, all: true },
    };
    const choose: Ability = {
      kind: 'replacement',
      replacement: { kind: 'asEntersChoose', what: 'color' },
    };
    expect(validateCard(creature([all, ENTERS_WITH()]))).toEqual([]);
    expect(validateCard(creature([all, choose, ENTERS_WITH()]))).toEqual([]);
  });

  test('all is true or absent', () => {
    const bad = {
      kind: 'replacement',
      replacement: { kind: 'asEntersRemoveCounters', filter: {}, all: false },
    } as unknown as Ability;
    expect(messages(creature([bad, ENTERS_WITH()]))).toMatch(/all is true or absent/);
  });
});
