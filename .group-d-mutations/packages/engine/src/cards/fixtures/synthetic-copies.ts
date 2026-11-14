/**
 * SYNTHETIC COPY CARDS: COPYING A SPELL, STORM AND REPLICATE. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests and the soak games of D-129: the effect that copies a spell (CR 707.10, 707.10c), with and
 * without new targets, from a target slot, from a trigger and from an activated ability, and Storm (CR 702.40a) on
 * instants, sorceries and a permanent, and Replicate (CR 702.56a). Names start with "SYNTHETIC "; oracleId is null. The text describes what the
 * AST does; it is not Oracle text, and none of these copies a real card's definition.
 */
import type { Ability, Effect, ObjectFilter, TargetSpec } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const X = { kind: 'x' } as const;
const T1 = { kind: 'target', id: 't1' } as const;
const ANY_TARGET: TargetSpec = { id: 't1', what: { kind: 'anyTarget' } };
const CREATURE_TARGET: TargetSpec = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
};
/** "instant or sorcery spell". */
const INSTANT_OR_SORCERY: ObjectFilter = {
  stackKind: 'spell',
  anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
};
const SPELL_TARGET: TargetSpec = {
  id: 't1',
  what: { kind: 'object', filter: INSTANT_OR_SORCERY },
};
const MY_SPELL_TARGET: TargetSpec = {
  id: 't1',
  what: { kind: 'object', filter: { ...INSTANT_OR_SORCERY, controller: 'you' } },
};
const damage = (
  amount: number | typeof X,
  to: Extract<Effect, { kind: 'dealDamage' }>['to'],
): Effect => ({
  kind: 'dealDamage',
  amount,
  to,
});
const loseLife = (amount: number | typeof X): Effect => ({
  kind: 'loseLife',
  player: { kind: 'eachOpponent' },
  amount,
});
const replicate = (...symbols: string[]): Ability => ({
  kind: 'keyword',
  keyword: { kind: 'replicate', cost: [{ kind: 'mana', symbols }] },
});
const KICKER_ONE: Ability = {
  kind: 'keyword',
  keyword: { kind: 'kicker', cost: [{ kind: 'mana', symbols: ['1'] }] },
};

export const SYNTHETIC_COPY_LIST: readonly CardDefinition[] = [
  // ---- The effect (CR 707.10)
  // "Copy target instant or sorcery spell. You may choose new targets for the copy."
  singleFace({
    name: 'SYNTHETIC Twin Spell',
    manaCost: ['U', 'U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Copy target instant or sorcery spell. You may choose new targets for the copy.',
    spell: {
      targets: [SPELL_TARGET],
      effect: { kind: 'copySpell', spell: T1, newTargets: 'may' },
    },
  }),
  // "Copy target instant or sorcery spell." (the copy has the same targets)
  singleFace({
    name: 'SYNTHETIC Exact Twin',
    manaCost: ['U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Copy target instant or sorcery spell.',
    spell: {
      targets: [SPELL_TARGET],
      effect: { kind: 'copySpell', spell: T1, newTargets: 'no' },
    },
  }),
  // "Copy target instant or sorcery spell. You may choose new targets for the copy. Draw a card." (a copy, then more)
  singleFace({
    name: 'SYNTHETIC Twin Then Draw',
    manaCost: ['1', 'U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      'Copy target instant or sorcery spell. You may choose new targets for the copy. Draw a card.',
    spell: {
      targets: [SPELL_TARGET],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'copySpell', spell: T1, newTargets: 'may' },
          { kind: 'draw', player: YOU, count: 1 },
        ],
      },
    },
  }),
  // "Whenever you cast an instant or sorcery spell, copy that spell." (no new targets)
  singleFace({
    name: 'SYNTHETIC Echo Chamber',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Whenever you cast an instant or sorcery spell, copy that spell.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'castSpell', filter: INSTANT_OR_SORCERY, by: 'you' },
        effect: { kind: 'copySpell', spell: { kind: 'triggerSubject' }, newTargets: 'no' },
      },
    ],
  }),
  // "Whenever you cast an instant or sorcery spell, copy that spell. You may choose new targets for the copy."
  singleFace({
    name: 'SYNTHETIC Echo Mirror',
    manaCost: ['2', 'R'],
    types: ['enchantment'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Whenever you cast an instant or sorcery spell, copy that spell. You may choose new targets for the copy.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'castSpell', filter: INSTANT_OR_SORCERY, by: 'you' },
        effect: { kind: 'copySpell', spell: { kind: 'triggerSubject' }, newTargets: 'may' },
      },
    ],
  }),
  // "{2}, {T}: Copy target instant or sorcery spell you control. You may choose new targets for the copy."
  singleFace({
    name: 'SYNTHETIC Mirror Engine',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      '{2}, {T}: Copy target instant or sorcery spell you control. You may choose new targets for the copy.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['2'] }, { kind: 'tap' }],
        targets: [MY_SPELL_TARGET],
        effect: { kind: 'copySpell', spell: T1, newTargets: 'may' },
      },
    ],
  }),
  // ---- Spells to copy (they are not Storm cards)
  // "This spell deals 2 damage to any target." with a second effect that names its own targets.
  singleFace({
    name: 'SYNTHETIC Copy Bolt',
    manaCost: ['R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'This spell deals 2 damage to any target.',
    spell: { targets: [ANY_TARGET], effect: damage(2, T1) },
  }),
  // "Target creature you control gains 'This creature deals 2 damage...'": a spell with two target slots.
  singleFace({
    name: 'SYNTHETIC Split Bolt',
    manaCost: ['1', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'This spell deals 1 damage to target creature and 1 damage to any other target, then you draw a card.',
    spell: {
      targets: [CREATURE_TARGET, { id: 't2', what: { kind: 'anyTarget' } }],
      effect: {
        kind: 'sequence',
        effects: [
          damage(1, T1),
          damage(1, { kind: 'target', id: 't2' }),
          { kind: 'draw', player: YOU, count: 1 },
        ],
      },
    },
  }),
  // ---- Storm (CR 702.40)
  // "Storm. This spell deals 1 damage to any target."
  singleFace({
    name: 'SYNTHETIC Storm Bolt',
    manaCost: ['R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Storm. This spell deals 1 damage to any target.',
    abilities: [kw('storm')],
    spell: { targets: [ANY_TARGET], effect: damage(1, T1) },
  }),
  // "Storm. Each opponent loses 2 life." (no targets)
  singleFace({
    name: 'SYNTHETIC Storm Drain',
    manaCost: ['B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Storm. Each opponent loses 2 life.',
    abilities: [kw('storm')],
    spell: { effect: loseLife(2) },
  }),
  // "Storm. Each opponent loses X life." ({X} announced once, kept by every copy)
  singleFace({
    name: 'SYNTHETIC Storm X Drain',
    manaCost: ['X', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Storm. Each opponent loses X life.',
    abilities: [kw('storm')],
    spell: { x: true, effect: loseLife(X) },
  }),
  // "Kicker {1}. Storm. This spell deals 1 damage to target creature. If this spell was kicked, it deals 3 damage instead."
  singleFace({
    name: 'SYNTHETIC Storm Kick Bolt',
    manaCost: ['R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Kicker {1}. Storm. This spell deals 1 damage to target creature. If this spell was kicked, it deals 3 damage instead.',
    abilities: [KICKER_ONE, kw('storm')],
    spell: {
      targets: [CREATURE_TARGET],
      effect: {
        kind: 'conditional',
        condition: { kind: 'kicked' },
        effect: damage(3, T1),
        else: damage(1, T1),
      },
    },
  }),
  // "Storm. Each opponent loses 1 life." twice over: two instances trigger separately (CR 702.40b).
  singleFace({
    name: 'SYNTHETIC Double Storm',
    manaCost: ['1', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Storm. Storm. Each opponent loses 1 life.',
    abilities: [kw('storm'), kw('storm')],
    spell: { effect: loseLife(1) },
  }),
  // "Storm. When this creature enters, you gain 1 life." (a permanent spell: each copy becomes a token, CR 707.10f)
  singleFace({
    name: 'SYNTHETIC Storm Beast',
    manaCost: ['2', 'R'],
    types: ['creature'],
    subtypes: ['Beast'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 1,
    toughness: 1,
    oracleText: 'Storm. When this creature enters, you gain 1 life.',
    abilities: [
      kw('storm'),
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: { kind: 'gainLife', player: YOU, amount: 1 },
      },
    ],
  }),
  // "Storm. Choose one — • Deals 2 damage to target creature. • You gain 3 life." (copies keep the mode)
  singleFace({
    name: 'SYNTHETIC Storm Charm',
    manaCost: ['1', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Storm. Choose one — • Deals 2 damage to target creature. • You gain 3 life.',
    abilities: [kw('storm')],
    spell: {
      chooseModes: { min: 1, max: 1 },
      modes: [
        {
          text: 'Deals 2 damage to target creature.',
          effect: damage(2, T1),
          targets: [CREATURE_TARGET],
        },
        { text: 'You gain 3 life.', effect: { kind: 'gainLife', player: YOU, amount: 3 } },
      ],
    },
  }),
  // ---- Replicate (CR 702.56)
  // "Replicate {R}. This spell deals 1 damage to any target."
  singleFace({
    name: 'SYNTHETIC Replicate Bolt',
    manaCost: ['R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Replicate {R}. This spell deals 1 damage to any target.',
    abilities: [replicate('R')],
    spell: { targets: [ANY_TARGET], effect: damage(1, T1) },
  }),
  // "Replicate {B}. Each opponent loses 1 life." (no targets)
  singleFace({
    name: 'SYNTHETIC Replicate Drain',
    manaCost: ['B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Replicate {B}. Each opponent loses 1 life.',
    abilities: [replicate('B')],
    spell: { effect: loseLife(1) },
  }),
  // "Replicate {1}. When this creature enters, you gain 1 life." (a permanent spell: each copy becomes a token)
  singleFace({
    name: 'SYNTHETIC Replicate Imp',
    manaCost: ['1', 'R'],
    types: ['creature'],
    subtypes: ['Imp'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 1,
    toughness: 1,
    oracleText: 'Replicate {1}. When this creature enters, you gain 1 life.',
    abilities: [
      replicate('1'),
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: { kind: 'gainLife', player: YOU, amount: 1 },
      },
    ],
  }),
  // "Kicker {1}. Replicate {R}. This spell deals 1 damage to target creature. If this spell was kicked, it deals 3 damage
  // instead." (the kicker is asked first, then the replicate count)
  singleFace({
    name: 'SYNTHETIC Replicate Kick Bolt',
    manaCost: ['R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Kicker {1}. Replicate {R}. This spell deals 1 damage to target creature. If this spell was kicked, it deals 3 damage instead.',
    abilities: [KICKER_ONE, replicate('R')],
    spell: {
      targets: [CREATURE_TARGET],
      effect: {
        kind: 'conditional',
        condition: { kind: 'kicked' },
        effect: damage(3, T1),
        else: damage(1, T1),
      },
    },
  }),
  // "Replicate {R}. This spell deals X damage to any target." ({X} is announced after the replicate count)
  singleFace({
    name: 'SYNTHETIC Replicate X Burn',
    manaCost: ['X', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Replicate {R}. This spell deals X damage to any target.',
    abilities: [replicate('R')],
    spell: { x: true, targets: [ANY_TARGET], effect: damage(X, T1) },
  }),
];
