// Counter Blitz deck, group D: Yuna's Whistle, read from its real Oracle text and run by the engine.
// "Reveal cards from the top of your library until you reveal a creature card. Put that card into your hand and the rest on the bottom of your library in a random order.
// When you reveal a creature card this way, put X +1/+1 counters on target creature you control, where X is the mana value of that card."
// CR 701.20 (reveal), CR 401.4 (bottom in a random order), CR 603.12 (reflexive trigger), CR 202.3 (mana value).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const WHISTLE = real("Yuna's Whistle");

const cast = (library: readonly string[]) => {
  const g = scenario()
    .define(WHISTLE)
    .seat(0)
    .library(...library)
    .hand(WHISTLE.name)
    .battlefield('Grizzly Bears', 'Forest', 'Forest', 'Forest')
    .seat(1)
    .at('precombatMain', { active: 0 })
    .build();
  g.act(0).cast(WHISTLE.name, { pay: true });
  g.passAll();
  return g;
};

describe("Yuna's Whistle", () => {
  test('parses: a reflexive ability that is created when the card found is a creature, with X its mana value', () => {
    const spell = WHISTLE.faces[0]?.spell;
    expect(spell?.effect).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'revealUntil', put: 'hand', filter: { types: ['creature'] } },
        {
          kind: 'reflexive',
          ifMoved: true,
          carriesMoved: true,
          ifMovedMatches: { types: ['creature'] },
          effect: {
            kind: 'addCounters',
            counter: '+1/+1',
            count: { kind: 'manaValueOf', of: { kind: 'moved' } },
          },
        },
      ],
    });
  });

  test('the creature found goes to the hand, the others to the bottom, and the Bears get counters equal to its mana value', () => {
    const g = cast(['Plains', 'Island', 'Giant Spider', 'Swamp', 'Mountain']);
    g.expect.zone('Giant Spider', 'hand');
    g.expect.librarySize(0, 4);
    g.passAll();
    g.expect.counters('Grizzly Bears', { '+1/+1': 4 });
    g.expect.invariants();
  });

  test('no creature card in the library: the whole library is revealed and no ability is created', () => {
    const g = cast(['Plains', 'Island', 'Swamp']);
    g.expect.librarySize(0, 3);
    g.expect.stack([]);
    g.expect.counters('Grizzly Bears', {});
    expect(g.find({ name: 'Giant Spider' }).length).toBe(0);
  });
});
