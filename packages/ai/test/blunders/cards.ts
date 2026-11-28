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

/** SYNTHETIC: "{1}: Scry 1." A cheap filler ability that changes nothing the board shows. */
export const SCRY_ORB = permanent('SYNTHETIC Scrying Orb', ['artifact'], '{1}: Scry 1.', [
  activated([{ kind: 'mana', symbols: ['1'] }], { kind: 'scry', player: YOU, count: 1 }),
]);

/** A SYNTHETIC creature token definition of the given name, types and size. */
const token = (name: string, types: readonly string[], power: number, toughness: number) =>
  ({
    kind: 'custom',
    definition: {
      name,
      manaCost: null,
      supertypes: [],
      types,
      subtypes: [name],
      colors: [],
      power,
      toughness,
      loyalty: null,
      defense: null,
      oracleText: '',
      abilities: [],
    },
  }) as const;

/** SYNTHETIC: a 2/2 creature (a commander in its tests) with "{2}, {T}: Create a 2/2 Soldier creature token." */
export const BANNER_CAPTAIN = permanent(
  'SYNTHETIC Banner Captain',
  ['creature'],
  '{2}, {T}: Create a 2/2 colorless Soldier creature token.',
  [
    activated([{ kind: 'mana', symbols: ['2'] }, { kind: 'tap' }], {
      kind: 'createToken',
      token: token('Soldier', ['creature'], 2, 2),
      count: 1,
    } as Effect),
  ],
  { power: 2, toughness: 2 },
);

/** SYNTHETIC: "{2}: Create a 1/1 colorless Servo artifact creature token. Activate only as a sorcery." A repeatable token maker. */
export const SERVO_WORKS = permanent(
  'SYNTHETIC Servo Works',
  ['artifact'],
  '{2}: Create a 1/1 colorless Servo artifact creature token. Activate only as a sorcery.',
  [
    activated(
      [{ kind: 'mana', symbols: ['2'] }],
      {
        kind: 'createToken',
        token: token('Servo', ['artifact', 'creature'], 1, 1),
        count: 1,
      } as Effect,
      { timing: 'sorcery' },
    ),
  ],
);
