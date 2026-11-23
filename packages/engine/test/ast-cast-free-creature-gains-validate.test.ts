// Validation of `castFree.creatureGains` (Strago and Relm, issue 97; CR 608.2g, 613.1f): what is accepted, and what is refused with a message, never half run. SYNTHETIC card.
import { describe, expect, test } from 'vitest';
import { type CardDefinition, syntheticCard, validateCard } from '../src/index';

/** The card with its first ability replaced by `ability`. */
function withAbility(name: string, ability: unknown): CardDefinition {
  const card = syntheticCard(name);
  const [face] = card.faces;
  if (face === undefined) throw new Error('no face');
  return { ...card, faces: [{ ...face, abilities: [ability] }] } as never;
}

const messages = (card: CardDefinition) => validateCard(card).map((i) => i.message);

const NAME = 'SYNTHETIC Rivendell Warden';
const haste = { kind: 'keyword', keyword: { kind: 'haste' } };
const sacrifice = {
  kind: 'triggered',
  trigger: { kind: 'endStep', whose: 'each' },
  effect: { kind: 'sacrifice', objects: { kind: 'this' } },
};
const creature = { types: ['creature'] };

/** An ability that exiles from the top of the library of each player until a creature and casts it with `cast`. */
const ability = (cast: Record<string, unknown>) => ({
  kind: 'triggered',
  trigger: { kind: 'attacks', what: { kind: 'this' } },
  effect: {
    kind: 'sequence',
    effects: [
      { kind: 'exileUntilFound', players: { kind: 'eachOpponent' }, filter: creature },
      { kind: 'castFree', objects: { kind: 'moved' }, filter: creature, ...cast },
    ],
  },
});

describe('castFree with creatureGains', () => {
  test.each([[{ creatureGains: [haste, sacrifice] }], [{ creatureGains: [haste] }], [{}]])(
    '%o is valid',
    (cast) => {
      expect(messages(withAbility(NAME, ability(cast)))).toEqual([]);
    },
  );

  test.each([
    [{ creatureGains: [] }, 'creatureGains is a list of abilities'],
    [{ creatureGains: 'haste' }, 'creatureGains is a list of abilities'],
    [{ creatureGains: [haste], max: 2 }, 'creatureGains is a list of abilities'],
    [{ creatureGains: [haste], play: true }, 'creatureGains is a list of abilities'],
  ])('%o is refused', (cast, message) => {
    expect(messages(withAbility(NAME, ability(cast))).join('\n')).toContain(message);
  });

  test('only the cards an effect before moved are cast with it', () => {
    const card = withAbility(NAME, {
      kind: 'triggered',
      trigger: { kind: 'attacks', what: { kind: 'this' } },
      effect: {
        kind: 'castFree',
        objects: { kind: 'choose', filter: { zone: 'hand', ...creature } },
        creatureGains: [haste],
      },
    });
    expect(messages(card).join('\n')).toContain('creatureGains is a list of abilities');
  });
});
