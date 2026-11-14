/**
 * Lowerings of the Vraska deck (stage P50, D-207): the instructions the grammar reads for this deck that no other file lowers.
 */
import type { IrClause } from '../ir/types';
import { type Effects, eachObject, failure, operand } from './clauses';
import { itemsOf, objectRefOf, objectSelectorOf } from './nouns';
import { lowerTokenAbility } from './tokens';
import type { Lowering } from './types';

/** "Remove all counters from it" (CR 122.1, 122.2): every counter of every kind on each permanent named. */
const REMOVE_ALL_COUNTERS: Lowering<IrClause, Effects> = {
  head: 'removeAllCounters',
  id: 'lower.remove-all-counters',
  needs: ['effect:removeAllCounters'],
  lower: (clause, ctx) =>
    eachObject(clause, ctx, (objects) => ({ kind: 'removeAllCounters', objects }), 'objects', {
      triggerSubject: true,
    }),
};

/**
 * "Put a card exiled with ~ into its owner's graveyard" (CR 607.2a, 406.3): the controller chooses among the cards the permanent exiled with its linked ability
 * (the parser links the exile of the same face), and the card goes to its owner's graveyard.
 */
const PUT_EXILED_WITH: Lowering<IrClause, Effects> = {
  head: 'putExiledWith',
  id: 'lower.put-exiled-with',
  needs: ['effect:moveToZone', 'selector:choose'],
  lower: (clause) => ({
    ok: true,
    value: [
      {
        kind: 'moveToZone',
        objects: { kind: 'choose', filter: { zone: 'exile', controller: 'you' } },
        to: 'graveyard',
      },
    ],
    rule: clause.rule,
  }),
};

/**
 * "Choose target commander that entered this turn." (CR 115.1, 601.2c): the words only choose the target of the ability, which the sentences after read as "it".
 * It makes no effect of its own: the lowering reads the noun, which adds the target, and returns no instruction.
 */
const CHOOSE_TARGET: Lowering<IrClause, Effects> = {
  head: 'chooseTarget',
  id: 'lower.choose-target',
  needs: [],
  lower: (clause, ctx) => {
    const what = operand(clause, 'what');
    if (what === undefined) return failure(clause);
    for (const item of itemsOf(what)) {
      const selector = objectSelectorOf(item, ctx, {});
      if (!selector.ok) return selector;
    }
    return { ok: true, value: [], rule: clause.rule };
  },
};

/** "Up to one target creature you control connives" (CR 701.50a): the engine's `connive` of each creature named. */
const CONNIVE: Lowering<IrClause, Effects> = {
  head: 'connive',
  id: 'lower.connive',
  needs: ['effect:connive'],
  lower: (clause, ctx) =>
    eachObject(clause, ctx, (objects) => ({ kind: 'connive', objects }), 'objects'),
};

/**
 * "Have ~ become a copy of another target creature you control until end of turn, except its name is ~" (CR 707.2, 707.9a): the engine's `becomeCopy` of this
 * permanent, of the target, for the turn, keeping its name.
 */
const BECOME_COPY: Lowering<IrClause, Effects> = {
  head: 'becomeCopy',
  id: 'lower.become-copy',
  needs: ['effect:becomeCopy', 'selector:target', 'duration:untilEndOfTurn'],
  takesDuration: true,
  lower: (clause, ctx) => {
    const objects = operand(clause, 'objects');
    const of = operand(clause, 'of');
    const keep = clause.args.keepName;
    // Stage P64 (D-217, CR 707.9b): "except it's an artifact in addition to its other types" (Saheeli, Sublime Artificer).
    const artifact = clause.args.addArtifact;
    if (
      objects === undefined ||
      of === undefined ||
      of.kind !== 'noun' ||
      clause.duration?.scope !== 'untilEndOfTurn' ||
      (keep?.kind !== 'flag' && artifact?.kind !== 'flag')
    ) {
      return failure(clause);
    }
    const copied = eachObject(
      clause,
      ctx,
      (selector) => ({
        kind: 'becomeCopy',
        objects: selector,
        of: { kind: 'this' },
        duration: 'untilEndOfTurn',
        ...(keep?.kind === 'flag' ? { keepName: true as const } : {}),
        ...(artifact?.kind === 'flag' ? { addTypes: ['artifact' as const] } : {}),
      }),
      'objects',
    );
    if (!copied.ok) return copied;
    const source = objectRefOf(of, ctx);
    if (!source.ok) return source;
    return {
      ok: true,
      value: copied.value.map((e) => (e.kind === 'becomeCopy' ? { ...e, of: source.value } : e)),
      rule: clause.rule,
    };
  },
};

/**
 * "For each creature target player controls, create a token that's a copy of that creature, except it has haste and "..."" (CR 707.2, 707.9b): the engine's
 * `createCopies` of the group, with haste and the quoted ability, read on a creature, as the abilities of the copies.
 */
const CREATE_COPIES: Lowering<IrClause, Effects> = {
  head: 'createCopies',
  id: 'lower.create-copies',
  needs: ['effect:createCopies'],
  lower: (clause, ctx) => {
    const group = operand(clause, 'objects');
    const quoted = clause.args.quoted;
    if (group?.kind !== 'noun' || group.det !== 'each' || quoted?.kind !== 'quoted') {
      return failure(clause);
    }
    const objects = objectSelectorOf(group, ctx);
    if (!objects.ok) return objects;
    const types = group.filter.types ?? ['creature'];
    const ability = lowerTokenAbility(quoted, types, group.filter.subtypes ?? [], ctx);
    if (!ability.ok) return ability;
    return {
      ok: true,
      value: [
        {
          kind: 'createCopies',
          objects: objects.value,
          abilities: [{ kind: 'keyword', keyword: { kind: 'haste' } }, ability.value],
        },
      ],
      rule: clause.rule,
    };
  },
};

export const VRASKA_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  CREATE_COPIES,
  BECOME_COPY,
  CONNIVE,
  REMOVE_ALL_COUNTERS,
  PUT_EXILED_WITH,
  CHOOSE_TARGET,
];
