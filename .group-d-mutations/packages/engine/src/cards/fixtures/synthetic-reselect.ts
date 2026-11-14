/**
 * SYNTHETIC CARDS FOR "WHEN THIS ENTERS DURING <A COMBAT STEP>" AND "YOU MAY RESELECT WHICH PLAYER OR PERMANENT TARGET ATTACKING CREATURE IS
 * ATTACKING" (CR 508.7, 506.1). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-139 (the Artifacts slice): a flash artifact whose enters trigger reselects the attack target of an attacking
 * creature only if it entered during the declare attackers step, a flash enchantment with another step, and a creature that reselects what
 * an attacker attacks when it enters. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not
 * Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, CombatStep, Effect, TargetSpec } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const THIS = { kind: 'this' } as const;
const ATTACKER: TargetSpec = {
  id: 'a',
  what: { kind: 'object', filter: { types: ['creature'], attacking: true } },
};

const flash: Ability = { kind: 'keyword', keyword: { kind: 'flash' } };

const entersDuring = (
  step: CombatStep,
  effect: Effect,
  extra: Partial<Extract<Ability, { kind: 'triggered' }>> = {},
): Ability => ({
  kind: 'triggered',
  trigger: { kind: 'entersBattlefield', what: THIS },
  interveningIf: { kind: 'duringStep', step },
  effect,
  ...extra,
});

export const SYNTHETIC_RESELECT_LIST: readonly CardDefinition[] = [
  // "Flash. When this artifact enters during the declare attackers step, you may reselect which player or permanent target attacking creature
  // is attacking. {T}: Add {U}."
  singleFace({
    name: 'SYNTHETIC Crooked Signpost',
    manaCost: ['2', 'U'],
    types: ['artifact'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      'Flash\nWhen this artifact enters during the declare attackers step, you may reselect which player or permanent target attacking creature is attacking.\n{T}: Add {U}.',
    abilities: [
      flash,
      entersDuring(
        'declareAttackers',
        { kind: 'reselectAttack', objects: { kind: 'target', id: 'a' } },
        { targets: [ATTACKER], optional: true },
      ),
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['U'] } },
    ],
  }),
  // "Flash. When this enchantment enters during the beginning of combat step, draw a card."
  singleFace({
    name: 'SYNTHETIC Dawn Banner',
    manaCost: ['1', 'W'],
    types: ['enchantment'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      'Flash\nWhen this enchantment enters during the beginning of combat step, draw a card.',
    abilities: [
      flash,
      entersDuring('beginningOfCombat', { kind: 'draw', player: { kind: 'you' }, count: 1 }),
    ],
  }),
];
