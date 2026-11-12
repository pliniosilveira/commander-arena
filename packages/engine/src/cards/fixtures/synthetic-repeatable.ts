/**
 * SYNTHETIC REPEATABLE-MODE CARDS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of "Choose three. You may choose the same mode more than once." (D-1000, CR 700.2d) on a spell, an
 * enters trigger and an activated ability, and of "Choose up to two. You may choose the same mode more than once.". Names
 * start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these
 * is the definition of a real card. Kept out of the generic deck pools of the soak games (`packages/ai/test/helpers.ts`).
 */
import type { Ability, Effect, SpellMode, TargetSpec } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const target = (id: string) => ({ kind: 'target', id }) as const;
const creature = (id: string): TargetSpec => ({
  id,
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
});
const artifact = (id: string): TargetSpec => ({
  id,
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['artifact'] } },
});
const anyPlayer = (id: string): TargetSpec => ({ id, what: { kind: 'player', filter: 'any' } });

const draw: Effect = { kind: 'draw', player: YOU, count: 1 };
const gain = (amount: number): Effect => ({ kind: 'gainLife', player: YOU, amount });
const damage = (amount: number, id: string): Effect => ({
  kind: 'dealDamage',
  amount,
  to: target(id),
});
const mode = (text: string, effect: Effect, spec?: TargetSpec): SpellMode => ({
  text,
  effect,
  ...(spec === undefined ? {} : { targets: [spec] }),
});

/** An empty effect: the `effect` of a modal ability, whose effects are in its modes (D-114). */
const NONE: Effect = { kind: 'sequence', effects: [] };

/** The modes of the Triple Charm: a mode with no target, a mode aimed at a creature and one aimed at a player. */
const TRIPLE_MODES: readonly SpellMode[] = [
  mode('Draw a card.', draw),
  mode('Deals 2 damage to target creature.', damage(2, 'hit'), creature('hit')),
  mode(
    'Target player gains 2 life.',
    { kind: 'gainLife', player: target('who'), amount: 2 },
    anyPlayer('who'),
  ),
];

const imp = (name: string, oracleText: string, abilities: readonly Ability[]): CardDefinition =>
  singleFace({
    name,
    manaCost: ['2', 'G'],
    types: ['creature'],
    subtypes: ['Imp'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 2,
    oracleText,
    abilities,
  });

export const SYNTHETIC_REPEATABLE_LIST: readonly CardDefinition[] = [
  // "Choose three. You may choose the same mode more than once. • Draw a card. • ~ deals 2 damage to target
  //  creature. • Target player gains 2 life."
  singleFace({
    name: 'SYNTHETIC Triple Charm',
    manaCost: ['2', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Choose three. You may choose the same mode more than once. • Draw a card. • Deals 2 damage to target creature. • Target player gains 2 life.',
    spell: {
      chooseModes: { min: 3, max: 3, repeatable: true },
      modes: TRIPLE_MODES,
    },
  }),
  // "Choose two. You may choose the same mode more than once. • Destroy target artifact. • You gain 1 life."
  singleFace({
    name: 'SYNTHETIC Artifact Charm',
    manaCost: ['1', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Choose two. You may choose the same mode more than once. • Destroy target artifact. • You gain 1 life.',
    spell: {
      chooseModes: { min: 2, max: 2, repeatable: true },
      modes: [
        mode(
          'Destroy target artifact.',
          { kind: 'destroy', objects: target('art') },
          artifact('art'),
        ),
        mode('You gain 1 life.', gain(1)),
      ],
    },
  }),
  // "Choose up to two. You may choose the same mode more than once. • Draw a card. • You gain 3 life."
  singleFace({
    name: 'SYNTHETIC Up To Charm',
    manaCost: ['U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      'Choose up to two. You may choose the same mode more than once. • Draw a card. • You gain 3 life.',
    spell: {
      chooseModes: { min: 0, max: 2, repeatable: true },
      modes: [mode('Draw a card.', draw), mode('You gain 3 life.', gain(3))],
    },
  }),
  // "When this creature enters, choose two. You may choose the same mode more than once. • You gain 1 life. •
  //  It deals 1 damage to target creature."
  imp(
    'SYNTHETIC Repeat Greeter',
    'When this creature enters, choose two. You may choose the same mode more than once. • You gain 1 life. • It deals 1 damage to target creature.',
    [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: NONE,
        chooseModes: { min: 2, max: 2, repeatable: true },
        modes: [
          mode('You gain 1 life.', gain(1)),
          mode('It deals 1 damage to target creature.', damage(1, 'zap'), creature('zap')),
        ],
      },
    ],
  ),
  // "{1}, {T}: Choose two. You may choose the same mode more than once. • Draw a card. • Deals 1 damage to target creature."
  singleFace({
    name: 'SYNTHETIC Repeat Totem',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      '{1}, {T}: Choose two. You may choose the same mode more than once. • Draw a card. • Deals 1 damage to target creature.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['1'] }, { kind: 'tap' }],
        effect: NONE,
        chooseModes: { min: 2, max: 2, repeatable: true },
        modes: [
          mode('Draw a card.', draw),
          mode('Deals 1 damage to target creature.', damage(1, 'ping'), creature('ping')),
        ],
      },
    ],
  }),
];
