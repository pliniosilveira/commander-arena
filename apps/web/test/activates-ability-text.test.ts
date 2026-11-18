// The words of issue 104 (Wizened Mentor, Gate to the Afterlife): the trigger "Whenever an opponent activates an ability of a permanent that isn't a mana ability", and a search of
// several zones for a card of a given name. Pure; no DOM.
import { type Effect, syntheticCard } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { searchText } from '../src/game/lorehold-g1-text';
import { triggerWording } from '../src/game/trigger-text';

const ability = (name: string) => {
  const found = syntheticCard(name).faces[0]?.abilities[0];
  if (found === undefined) throw new Error(`no ability for ${name}`);
  return found;
};

describe("Whenever a player activates an ability of a permanent that isn't a mana ability", () => {
  test.each([
    [
      'SYNTHETIC Ability Watcher',
      "Whenever an opponent activates an ability of a permanent that isn't a mana ability",
    ],
    [
      'SYNTHETIC Own Ability Watcher',
      "Whenever you activate an ability of a permanent that isn't a mana ability",
    ],
  ])('%s', (name, words) => {
    const a = ability(name);
    if (a.kind !== 'triggered') throw new Error('not a trigger');
    expect(triggerWording(a.trigger, { self: name })).toBe(words);
  });
});

describe('a search of several zones for a card of a given name', () => {
  const search = (patch: Record<string, unknown>): Extract<Effect, { kind: 'search' }> =>
    ({
      kind: 'search',
      player: { kind: 'you' },
      filter: { named: "God-Pharaoh's Gift" },
      max: 1,
      destinations: [{ zone: 'battlefield', count: 1 }],
      reveal: false,
      shuffle: false,
      ...patch,
    }) as never;

  test('the zones and the name are said', () => {
    expect(searchText(search({ zones: ['graveyard', 'hand', 'library'] }))).toBe(
      "Search your graveyard, hand, and/or library for a card named God-Pharaoh's Gift and put it onto the battlefield",
    );
    expect(searchText(search({ zones: ['hand', 'library'] }))).toBe(
      "Search your hand and/or library for a card named God-Pharaoh's Gift and put it onto the battlefield",
    );
  });

  test('a name with other words in the filter is not guessed at', () => {
    expect(searchText(search({ filter: { named: 'X', types: ['creature'] } }))).toBe(
      'Search your library',
    );
  });
});
