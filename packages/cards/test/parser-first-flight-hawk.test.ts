// The First Flight starter commander decks, the group of Cartographer's Hawk: "When this creature deals combat damage to a player who controls more lands than you, return it to
// its owner's hand. If you do, you may search your library for a Plains card, put it onto the battlefield tapped, then shuffle." The first line of each block is the real Oracle text
// of the card; the others are SYNTHETIC siblings and the near misses the grammar must not read. The engine runs what is lowered in convert-grammar-engine-first-flight-hawk.test.ts.
import { describe, expect, test } from 'vitest';
import { read as readFace } from './parser-p5-helpers';

const read = (text: string) => readFace(text, 'creature');

const NOT_READ = (text: string) => {
  const parsed = read(text);
  expect(parsed.abilities, text).toEqual([]);
  expect(parsed.unparsed, text).toHaveLength(1);
};

const SEARCH = {
  kind: 'search',
  player: { kind: 'you' },
  filter: { subtypes: ['Plains'] },
  max: 1,
  destinations: [{ zone: 'battlefield', tapped: true, count: 1 }],
  reveal: false,
  shuffle: true,
  optional: true,
};

const HOME = { kind: 'moveToZone', objects: { kind: 'this' }, to: 'hand' };

describe("Cartographer's Hawk: the trigger (CR 603.2, 510.2, 109.4)", () => {
  test('the real text: a condition of the event on the player damaged, then the return and the optional search', () => {
    const parsed = read(
      "When this creature deals combat damage to a player who controls more lands than you, return it to its owner's hand. If you do, you may search your library for a Plains card, put it onto the battlefield tapped, then shuffle.",
    );
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'dealsCombatDamage', what: { kind: 'this' }, to: 'player' },
        triggerCondition: { kind: 'triggerPlayerHasMore', stat: 'lands' },
        effect: {
          kind: 'sequence',
          effects: [
            HOME,
            { kind: 'conditional', condition: { kind: 'didPrevious' }, effect: SEARCH },
          ],
        },
      },
    ]);
  });

  test('"Whenever" and creatures instead of lands (SYNTHETIC)', () => {
    const parsed = read(
      "Whenever this creature deals combat damage to a player who controls more creatures than you, return it to its owner's hand.",
    );
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'dealsCombatDamage', what: { kind: 'this' }, to: 'player' },
        triggerCondition: { kind: 'triggerPlayerHasMore', stat: 'creatures' },
        effect: HOME,
      },
    ]);
  });

  test('an opponent who controls more lands (SYNTHETIC)', () => {
    const parsed = read(
      "Whenever this creature deals combat damage to an opponent who controls more lands than you, return it to its owner's hand.",
    );
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'dealsCombatDamage', what: { kind: 'this' }, to: 'opponent' },
        triggerCondition: { kind: 'triggerPlayerHasMore', stat: 'lands' },
        effect: HOME,
      },
    ]);
  });

  test('the same trigger with no condition is unchanged', () => {
    const parsed = read(
      "Whenever this creature deals combat damage to a player, return it to its owner's hand.",
    );
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'dealsCombatDamage', what: { kind: 'this' }, to: 'player' },
        effect: HOME,
      },
    ]);
  });
});

describe('the near misses are not read', () => {
  test.each([
    // another count
    "Whenever this creature deals combat damage to a player who controls more cards than you, return it to its owner's hand.",
    // not "more ... than you"
    "Whenever this creature deals combat damage to a player who controls at least as many lands as you, return it to its owner's hand.",
    "Whenever this creature deals combat damage to a player who controls more lands, return it to its owner's hand.",
    "Whenever this creature deals combat damage to a player who controls more lands than each opponent, return it to its owner's hand.",
    // a creature has no lands to count
    "Whenever this creature deals combat damage to a creature who controls more lands than you, return it to its owner's hand.",
    // a planeswalker is not a player
    "Whenever this creature deals combat damage to a player or planeswalker who controls more lands than you, return it to its owner's hand.",
  ])('%s', NOT_READ);

  test('"If you do, you may search" after something that is not an instruction the engine can tell was done is not read', () => {
    NOT_READ(
      'Whenever this creature attacks, if you do, you may search your library for a Plains card, put it onto the battlefield tapped, then shuffle.',
    );
  });

  test('"If you do" with an optional clause other than a search is not read', () => {
    NOT_READ(
      "Whenever this creature deals combat damage to a player, return it to its owner's hand. If you do, you may scry 2.",
    );
  });
});
