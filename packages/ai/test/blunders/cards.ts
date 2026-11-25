// SYNTHETIC cards of the blunder suite: invented shapes, not real Magic cards. Each one is written out
// by hand (text and AST) so a position can hold an activated ability the agent must judge.
import type { Ability, CardDefinition, Cost, Effect } from '@commander-arena/engine';

const YOU = { kind: 'you' } as const;

function permanent(
  name: string,
  types: readonly ('artifact' | 'creature')[],
  oracleText: string,
  abilities: readonly Ability[],
  pt: { power: number; toughness: number } | null = null,
): CardDefinition {
  return {
    oracleId: null,
    name,
    layout: 'normal',
    faces: [
      {
        name,
        manaCost: ['2'],
        supertypes: [],
        types,
        subtypes: types.includes('creature') ? ['Construct'] : [],
        colors: [],
        power: pt?.power ?? null,
        toughness: pt?.toughness ?? null,
        loyalty: null,
        defense: null,
        oracleText,
        abilities,
        spell: null,
      },
    ],
    colorIdentity: [],
    support: 'supported',
  };
}

const activated = (cost: readonly Cost[], effect: Effect, extra: Partial<Ability> = {}): Ability =>
  ({ kind: 'activated', cost, effect, ...extra }) as Ability;

/** SYNTHETIC: "{3}: Draw a card." A mana sink for spare mana. */
export const LIBRARY_LAMP = permanent('SYNTHETIC Library Lamp', ['artifact'], '{3}: Draw a card.', [
  activated([{ kind: 'mana', symbols: ['3'] }], { kind: 'draw', player: YOU, count: 1 }),
]);

/** SYNTHETIC: a 1/1 creature with "{T}: This creature deals 1 damage to any target." */
export const PINGER = permanent(
  'SYNTHETIC Pinging Adept',
  ['creature'],
  '{T}: This creature deals 1 damage to any target.',
  [
    activated(
      [{ kind: 'tap' }],
      { kind: 'dealDamage', amount: 1, to: { kind: 'target', id: 't1' } },
      { targets: [{ id: 't1', what: { kind: 'anyTarget' } }] },
    ),
  ],
  { power: 1, toughness: 1 },
);

/** SYNTHETIC: "{T}: You lose 3 life." An ability that only hurts its controller. */
export const CURSED_IDOL = permanent(
  'SYNTHETIC Cursed Idol',
  ['artifact'],
  '{T}: You lose 3 life.',
  [activated([{ kind: 'tap' }], { kind: 'loseLife', player: YOU, amount: 3 })],
);
