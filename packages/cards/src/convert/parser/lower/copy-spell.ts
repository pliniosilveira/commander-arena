/**
 * "Copy target instant or sorcery spell. You may choose new targets for the copy." and "Whenever you cast a spell
 * of the chosen type, copy that spell." (CR 707.10, 707.10c; stage P27, D-129): the engine's `copySpell`. The spell
 * is a declared target of the stack (the effect finds it as it resolves) or the spell of the cast trigger
 * (`triggerSubject`, read from last-known information when it has left the stack, CR 113.7a). "You may choose new
 * targets for the copy" is `newTargets: 'may'`, its absence `'no'`. Which spells can be copied from where is
 * `validateCard`'s refusal (a trigger that is not about a cast, a target slot the ability does not declare).
 */
import type { Amount, Effect, ObjectFilter, ObjectRef } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { amountArg, arg, type Effects, failure } from './clauses';
import { missingFeatures } from './features';
import { lowerFilter, objectRefOf } from './nouns';
import type { Lowering } from './types';

export const COPY_SPELL: Lowering<IrClause, Effects> = {
  head: 'copySpell',
  id: 'lower.copySpell',
  needs: ['effect:copySpell', 'effect:moveToZone'],
  lower(clause, ctx) {
    const noun = arg(clause, 'spell');
    const flag = arg(clause, 'newTargets');
    if (noun?.kind !== 'noun' || flag?.kind !== 'flag') return failure(clause);
    let spell: ObjectRef;
    if (noun.det === 'triggerSubject') {
      const missing = missingFeatures(['selector:triggerSubject']);
      if (missing.length > 0) return failure(clause, missing);
      spell = { kind: 'triggerSubject' };
    } else {
      const ref = objectRefOf(noun, ctx);
      if (!ref.ok) return ref;
      if (ref.value.kind !== 'target') return failure(clause);
      spell = ref.value;
    }
    // "copy it for each time you've cast your commander from the command zone this game" (D-337, CR 707.10, 903.8): the number of copies.
    let count: Amount | undefined;
    if (arg(clause, 'count') !== undefined) {
      const lowered = amountArg(clause, 'count', ctx);
      if (!lowered.ok) return lowered;
      count = lowered.value;
    }
    // "copy that spell for each other creature you control that the spell could target. Each copy targets a different one of those creatures." (D-438, CR 707.10e): a copy
    // for each creature the filter names, each aimed at one of them; "that player copies" is the copy of the player the trigger is about.
    let forEach: ObjectFilter | undefined;
    let copier: 'triggerPlayer' | undefined;
    const each = arg(clause, 'each');
    if (each !== undefined) {
      if (each.kind !== 'noun' || spell.kind !== 'triggerSubject' || count !== undefined) {
        return failure(clause);
      }
      const missing = missingFeatures(['selector:copyForEach']);
      if (missing.length > 0) return failure(clause, missing);
      const filter = lowerFilter(each);
      if (!filter.ok) return filter;
      forEach = filter.value;
      const by = arg(clause, 'copier');
      if (by?.kind === 'flag' && by.value) copier = 'triggerPlayer';
    }
    // "..., then return it to its owner's hand" (Narset's Reversal, CR 400.3): after the copy the target spell leaves the stack for its owner's hand.
    const returnIt = arg(clause, 'returnIt');
    if (returnIt !== undefined && (spell.kind !== 'target' || count !== undefined)) {
      return failure(clause);
    }
    // "... if it targets a permanent or player" and "If you don't copy a spell this way, draw a card" (Shiko and Narset, Unified, CR 115.1, 608.2c): the copy is made for a spell
    // with a permanent or a player as a target; otherwise the controller draws. The copy is always made when the condition holds, so "if you don't copy" is "otherwise".
    const ifTargets = arg(clause, 'ifTargets');
    if (ifTargets !== undefined) {
      if (spell.kind !== 'triggerSubject' || returnIt !== undefined || count !== undefined) {
        return failure(clause);
      }
      if (forEach !== undefined) return failure(clause);
      const missing = missingFeatures([
        'effect:conditional',
        'condition:objectMatches',
        'selector:targetsObject',
        'selector:targetsPlayer',
        'effect:draw',
      ]);
      if (missing.length > 0) return failure(clause, missing);
      const copy: Effect = {
        kind: 'copySpell',
        spell,
        newTargets: flag.value ? 'may' : 'no',
        ...(copier === undefined ? {} : { copier }),
      };
      const draws = arg(clause, 'elseDraw') !== undefined;
      return {
        ok: true,
        value: [
          {
            kind: 'conditional',
            condition: {
              kind: 'objectMatches',
              of: spell,
              filter: {
                anyOf: [{ targetsObject: { zone: 'battlefield' } }, { targetsPlayer: true }],
              },
            },
            effect: copy,
            ...(draws ? { else: { kind: 'draw', player: { kind: 'you' }, count: 1 } } : {}),
          },
        ],
        rule: clause.rule,
      };
    }
    return {
      ok: true,
      value: [
        {
          kind: 'copySpell',
          spell,
          newTargets: flag.value ? 'may' : 'no',
          ...(count === undefined ? {} : { count }),
          ...(forEach === undefined ? {} : { forEach }),
          ...(copier === undefined ? {} : { copier }),
        },
        ...(returnIt === undefined
          ? []
          : [{ kind: 'moveToZone' as const, objects: spell, to: 'hand' as const }]),
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "Exile that card instead of putting it into your graveyard as it resolves. If you do, return it to your hand at the beginning of the next end step." (Feather group 3, D-439,
 * CR 614.1a, 603.7): the engine's `exileOnResolve` of the spell whose casting caused the trigger (`triggerSubject`); the return is part of it.
 */
export const EXILE_ON_RESOLVE: Lowering<IrClause, Effects> = {
  head: 'exileOnResolve',
  id: 'lower.exileOnResolve',
  needs: ['effect:exileOnResolve', 'selector:triggerSubject'],
  lower(clause) {
    const noun = arg(clause, 'spell');
    if (noun?.kind !== 'noun' || noun.det !== 'triggerSubject') return failure(clause);
    return {
      ok: true,
      value: [{ kind: 'exileOnResolve', spell: { kind: 'triggerSubject' } }],
      rule: clause.rule,
    };
  },
};
