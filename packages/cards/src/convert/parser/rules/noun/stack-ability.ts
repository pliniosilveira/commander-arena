/**
 * Noun rule of the Sublime Epiphany group (issue 100): "target activated or triggered ability".
 */
import { literal, map, pattern } from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { defineRule, node } from '../registry';

type Bare = Omit<IrNoun, 'span' | 'rule'>;

const ID = 'noun.target-activated-or-triggered-ability';

/**
 * `noun.target-activated-or-triggered-ability`: "target activated or triggered ability" (CR 113.3b, 113.3c, 405.1, 701.6a: an activated or triggered ability is an object on the stack
 * and may be countered). The engine's stack filter `stackKind: 'ability'`, which an activated ability and a triggered ability both are (a mana ability never uses the stack, CR 605.3b).
 * Not read: a plural, "target ability", "target triggered ability" alone, the other order, a spell as well.
 */
export const NOUN_TARGET_ACTIVATED_OR_TRIGGERED_ABILITY = defineRule<IrNoun>({
  id: ID,
  family: 'noun',
  leading: ['target'],
  cites: [
    'CR 113.3b (Abilities)',
    'CR 113.3c (Abilities)',
    'CR 405.1 (Stack)',
    'CR 701.6a (Counter)',
    'CR 115.1 (Targets)',
  ],
  examples: ['target activated or triggered ability'],
  rejects: [
    'target activated or triggered abilities',
    'target ability',
    'target triggered ability',
    'target activated ability',
    'target triggered or activated ability',
    'target spell or ability',
    'target activated or triggered',
    'activated or triggered ability',
  ],
  parse: node<Bare, IrNoun>(
    ID,
    map(
      literal('target activated or triggered ability'),
      (raw): Bare => ({
        kind: 'noun',
        det: 'target',
        filter: { zone: 'stack', stackKind: 'ability', raw },
        upTo: false,
        plural: false,
        other: false,
      }),
    ),
    (b) => b,
  ),
});

const SPELL_OR_ABILITY_ID = 'noun.target-spell-activated-or-triggered-ability';

/**
 * `noun.target-spell-activated-or-triggered-ability`: "target spell, activated ability, or triggered ability" (issue 105, Disallow; CR 113.3b, 113.3c, 405.1, 701.6a: a spell and an activated
 * or triggered ability are the objects on the stack, and each may be countered). The engine's stack filter with no kind: any spell or ability on the stack (a mana ability never uses it, CR 605.3b).
 * Not read: a plural, the other order, "target spell or ability", a list that leaves one of the three out or adds a fourth.
 */
export const NOUN_TARGET_SPELL_ACTIVATED_OR_TRIGGERED_ABILITY = defineRule<IrNoun>({
  id: SPELL_OR_ABILITY_ID,
  family: 'noun',
  leading: ['target'],
  cites: [
    'CR 113.3b (Abilities)',
    'CR 113.3c (Abilities)',
    'CR 405.1 (Stack)',
    'CR 701.6a (Counter)',
    'CR 115.1 (Targets)',
  ],
  examples: ['target spell, activated ability, or triggered ability'],
  rejects: [
    'target spells, activated abilities, or triggered abilities',
    'target spell or ability',
    'target spell, triggered ability, or activated ability',
    'target spell, activated ability, or triggered',
    'target spell, activated ability and triggered ability',
    'target spell, activated ability, or triggered ability on the stack',
    'spell, activated ability, or triggered ability',
    'target spell, activated ability, triggered ability, or loyalty ability',
  ],
  parse: node<Bare, IrNoun>(
    SPELL_OR_ABILITY_ID,
    map(
      pattern(/target spell, activated ability, or triggered ability(?![\p{L}\p{N}])/u),
      (m): Bare => ({
        kind: 'noun',
        det: 'target',
        filter: { zone: 'stack', raw: m[0] },
        upTo: false,
        plural: false,
        other: false,
      }),
    ),
    (b) => b,
  ),
});

const FROM_SOURCE_ID = 'noun.target-ability-from-source';

/**
 * `noun.target-ability-from-source`: "target activated or triggered ability from an artifact or enchantment source" (Green Slime; CR 113.7a, 113.3b, 109.1, 701.6a): an ability on the stack
 * whose source is a permanent of one of the card types named. The engine's `abilitySource` of the stack filter of `noun.target-activated-or-triggered-ability`. One or two types joined with
 * "or". Not read: a plural, another order, "controlled by", a source that is not a card type, three types, "and".
 */
export const NOUN_TARGET_ABILITY_FROM_SOURCE = defineRule<IrNoun>({
  id: FROM_SOURCE_ID,
  family: 'noun',
  leading: ['target'],
  cites: [
    'CR 113.7a (Abilities)',
    'CR 113.3b (Abilities)',
    'CR 113.3c (Abilities)',
    'CR 701.6a (Counter)',
    'CR 115.1 (Targets)',
  ],
  examples: [
    'target activated or triggered ability from an artifact or enchantment source',
    'target activated or triggered ability from a creature source',
  ],
  rejects: [
    'target activated or triggered abilities from an artifact source',
    'target activated or triggered ability from an artifact',
    'target activated or triggered ability from an artifact, creature, or land source',
    'target activated or triggered ability from an artifact and enchantment source',
    'target activated or triggered ability from a Goblin source',
    'target activated or triggered ability from an instant source',
    'target activated or triggered ability from source',
    'target activated or triggered ability you control',
  ],
  parse: node<Bare, IrNoun>(
    FROM_SOURCE_ID,
    map(
      pattern(
        /target activated or triggered ability from an? (artifact|creature|enchantment|land|planeswalker)(?: or (artifact|creature|enchantment|land|planeswalker))? source(?![\p{L}\p{N}])/iu,
      ),
      (m): Bare => {
        const types = [m[1], m[2]]
          .filter((t): t is string => t !== undefined)
          .map((t) => t.toLowerCase());
        const source: IrFilter = {
          raw: types.join(' or '),
          ...(types.length === 1
            ? { types }
            : { anyOf: types.map((t): IrFilter => ({ types: [t], raw: t })) }),
        };
        return {
          kind: 'noun',
          det: 'target',
          filter: { zone: 'stack', stackKind: 'ability', abilitySource: source, raw: m[0] },
          upTo: false,
          plural: false,
          other: false,
        };
      },
    ),
    (b) => b,
  ),
});

export const STACK_ABILITY_NOUN_RULES = [
  NOUN_TARGET_ABILITY_FROM_SOURCE,
  NOUN_TARGET_ACTIVATED_OR_TRIGGERED_ABILITY,
];

/** Before `noun.target-spell`, which would read the prefix "target spell" of the list and leave the rest. */
export const STACK_ABILITY_EARLY_NOUN_RULES = [NOUN_TARGET_SPELL_ACTIVATED_OR_TRIGGERED_ABILITY];
