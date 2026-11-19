/**
 * SYNTHETIC CARD FOR "DOUBLE THE VALUE OF X" AND "COPY THAT SPELL OR ABILITY" (Quandrix Unlimited deck, group I, CR 107.3, 707.10). NOT A REAL MAGIC CARD.
 *
 * Written out by hand for the engine tests (the cards package checks that the grammar lowers the real Oracle text of Unbound Flourishing to these same nodes). The name starts with
 * "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text.
 */
import type { Ability, ObjectFilter } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const PERMANENT: ObjectFilter = {
  stackKind: 'spell',
  anyOf: ['artifact', 'creature', 'enchantment', 'planeswalker', 'battle'].map((t) => ({
    types: [t as 'artifact'],
  })),
  xInManaCost: true,
};

const COPY = {
  kind: 'copySpell',
  spell: { kind: 'triggerSubject' },
  newTargets: 'may',
} as const;

export const SYNTHETIC_UNBOUND_I_ABILITIES: readonly Ability[] = [
  // "Whenever you cast a permanent spell with a mana cost that contains {X}, double the value of X."
  {
    kind: 'triggered',
    trigger: { kind: 'castSpell', filter: PERMANENT, by: 'you' },
    effect: { kind: 'doubleSpellX', spell: { kind: 'triggerSubject' } },
  },
  // "Whenever you cast an instant or sorcery spell or activate an ability, if that spell's mana cost or that ability's activation cost contains {X}, copy that spell or ability.
  // You may choose new targets for the copy." (one ability per event)
  {
    kind: 'triggered',
    trigger: {
      kind: 'castSpell',
      filter: {
        stackKind: 'spell',
        anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
        xInManaCost: true,
      },
      by: 'you',
    },
    effect: COPY,
  },
  {
    kind: 'triggered',
    trigger: { kind: 'activatesAbility', who: 'you', xCost: true, anySource: true },
    effect: COPY,
  },
];

export const SYNTHETIC_UNBOUND_I_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Unbound Doubler',
    manaCost: ['2', 'G'],
    types: ['enchantment'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      "Whenever you cast a permanent spell with a mana cost that contains {X}, double the value of X.\nWhenever you cast an instant or sorcery spell or activate an ability, if that spell's mana cost or that ability's activation cost contains {X}, copy that spell or ability. You may choose new targets for the copy.",
    abilities: [...SYNTHETIC_UNBOUND_I_ABILITIES],
  }),
];
