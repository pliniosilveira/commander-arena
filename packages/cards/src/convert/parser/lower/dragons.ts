/**
 * Clause lowerings of stage P34 (D-151, D-152): exiling the top cards and playing them, an additional combat phase, Discover and exiling until
 * a card is cast, shuffling a permanent into its owner's library and revealing the top card, and Behold. Same contract as effects.ts: each
 * declares the engine features it needs and is checked before it runs. The offer to pay any amount of a mana symbol is joined to the
 * sentence after it in `sentences.ts`, and the rider of mana in the lowering of the mana ability (`activated.ts`).
 */
import type {
  Ability,
  Effect,
  ManaColor,
  ObjectFilter,
  PlayerSelector,
  PlayUntil,
} from '@commander-arena/engine';
import type { IrAbility, IrClause, IrStaticEffect } from '../ir/types';
import { withoutZone } from '../rules/noun/phrases';
import { amountArg, arg, type Effects, failure, operand } from './clauses';
import { type FeatureRef, missingFeatures } from './features';
import { lowerFilter, objectRefOf, playerSelectorOf } from './nouns';
import type { LowerFailure, Lowering, LowerResult } from './types';

/**
 * "Exile the top card of your library", "exile the top X cards" (CR 701.13): the engine's `exileTop`; the cards are what `moved` names. Stage P41 (D-188):
 * "Exile the top two cards of target opponent's library face down" (CR 406.3): the library of one target player, the cards face down.
 */
export const EXILE_TOP: Lowering<IrClause, Effects> = {
  head: 'exileTop',
  id: 'lower.exile-top',
  needs: ['effect:exileTop'],
  lower(clause, ctx) {
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    const owner = arg(clause, 'from');
    let from: PlayerSelector | undefined;
    if (owner !== undefined) {
      if (owner.kind !== 'noun') return failure(clause);
      const selector = playerSelectorOf(owner, ctx);
      if (!selector.ok) return selector;
      from = selector.value;
    }
    const faceDown = arg(clause, 'faceDown');
    if (faceDown !== undefined && faceDown.kind !== 'flag') return failure(clause);
    ctx.exiled = 'top';
    ctx.exiledFaceDown = faceDown?.value === true;
    return {
      ok: true,
      value: [
        {
          kind: 'exileTop',
          count: count.value,
          ...(from === undefined ? {} : { from }),
          ...(faceDown?.value === true ? { faceDown: true as const } : {}),
        },
      ],
      rule: clause.rule,
    };
  },
};

const PLAY_UNTIL: Readonly<Record<string, PlayUntil>> = {
  thisTurn: 'endOfTurn',
  untilEndOfTurn: 'endOfTurn',
  untilEndOfNextTurn: 'endOfYourNextTurn',
  untilYourNextEndStep: 'yourNextEndStep',
  whileExiled: 'whileExiled',
};

/**
 * "You may play that card this turn", "Until the end of your next turn, you may play those cards" (CR 601.2, 305.1, 611.2a): the engine's
 * `mayPlay` of the cards the instruction before it exiled. After any other instruction "that card" has nothing to mean and the clause is not
 * lowered.
 */
export const MAY_PLAY: Lowering<IrClause, Effects> = {
  head: 'mayPlay',
  id: 'lower.may-play',
  needs: ['effect:mayPlay'],
  takesDuration: true,
  acceptsOptional: true,
  lower(clause, ctx) {
    const lasts = clause.duration === undefined ? undefined : PLAY_UNTIL[clause.duration.scope];
    if (lasts === undefined || ctx.exiled !== 'top') return failure(clause);
    // "You may look at and play those cards for as long as they remain exiled" (stage P41, D-188, CR 406.3): the cards must have been exiled face down.
    const look = arg(clause, 'lookAt');
    if (look !== undefined && (look.kind !== 'flag' || !ctx.exiledFaceDown)) return failure(clause);
    return {
      ok: true,
      value: [
        {
          kind: 'mayPlay',
          objects: { kind: 'moved' },
          lasts,
          ...(look === undefined ? {} : { lookAt: true as const }),
        },
      ],
      rule: clause.rule,
    };
  },
};

/** "After this phase, there is an additional combat phase" (CR 500.8): the engine's `extraCombat`, in an ability of an attack only (`validateCard`). */
export const EXTRA_COMBAT: Lowering<IrClause, Effects> = {
  head: 'extraCombat',
  id: 'lower.extra-combat',
  needs: ['effect:extraCombat'],
  lower: (clause) => ({ ok: true, value: [{ kind: 'extraCombat' }], rule: clause.rule }),
};

/** "Discover 10" (CR 701.57a): the engine's `exileUntilCast` with the limit on the card found, the others on the bottom in a random order. */
export const DISCOVER: Lowering<IrClause, Effects> = {
  head: 'discover',
  id: 'lower.discover',
  needs: ['effect:exileUntilCast'],
  lower(clause, ctx) {
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    if (typeof count.value !== 'number') return failure(clause);
    ctx.exiled = 'cast';
    return {
      ok: true,
      value: [{ kind: 'exileUntilCast', foundAtMost: count.value, rest: 'bottomRandom' }],
      rule: clause.rule,
    };
  },
};

/** "Exile cards from the top of your library until you exile a nonland card. You may cast it ... mana value is 8 or less ..." (CR 701.57). */
export const EXILE_UNTIL_CAST: Lowering<IrClause, Effects> = {
  head: 'exileUntilCast',
  id: 'lower.exile-until-cast',
  needs: ['effect:exileUntilCast'],
  lower(clause, ctx) {
    const limit = amountArg(clause, 'castAtMost', ctx);
    if (!limit.ok) return limit;
    if (typeof limit.value !== 'number') return failure(clause);
    ctx.exiled = 'cast';
    return {
      ok: true,
      value: [{ kind: 'exileUntilCast', castAtMost: limit.value, rest: 'stayExiled' }],
      rule: clause.rule,
    };
  },
};

/**
 * "The owner of target permanent shuffles it into their library, then reveals the top card of their library. If it's a permanent card, they put
 * it onto the battlefield." (CR 701.24, 701.20, 400.7): the permanent goes into its owner's library, the owner shuffles and reveals the top
 * card, and puts it onto the battlefield when it is a card of the kind. The kind describes a card in a library: no zone, controller or owner.
 */
export const SHUFFLE_REVEAL_TOP: Lowering<IrClause, Effects> = {
  head: 'shuffleRevealTop',
  id: 'lower.shuffle-reveal-top',
  needs: [
    'effect:moveToZone',
    'effect:shuffle',
    'effect:revealTop',
    'selector:target',
    'selector:ownerOf',
  ],
  lower(clause, ctx) {
    const objects = operand(clause, 'objects');
    const revealed = operand(clause, 'revealed');
    if (objects?.kind !== 'noun' || objects.det !== 'target' || revealed?.kind !== 'noun') {
      return failure(clause);
    }
    const target = objectRefOf(objects, ctx);
    if (!target.ok) return target;
    if (target.value.kind !== 'target') return failure(clause);
    const filter = lowerFilter({ ...revealed, filter: withoutZone(revealed.filter) });
    if (!filter.ok) return filter;
    const owner = { kind: 'ownerOf', of: target.value } as const;
    const effects: Effect[] = [
      { kind: 'moveToZone', objects: target.value, to: 'library' },
      { kind: 'shuffle', player: owner },
      { kind: 'revealTop', player: owner, ifMatches: filter.value, to: 'battlefield' },
    ];
    return { ok: true, value: effects, rule: clause.rule };
  },
};

/** "Behold a Dragon" (CR 701.4): the engine's `behold` of the kind described, which names no zone, controller or owner. */
export const BEHOLD: Lowering<IrClause, Effects> = {
  head: 'behold',
  id: 'lower.behold',
  needs: ['effect:behold'],
  lower(clause) {
    const what = arg(clause, 'what');
    if (what?.kind !== 'noun') return failure(clause);
    const filter = lowerFilter({ ...what, filter: withoutZone(what.filter) });
    if (!filter.ok) return filter;
    const value: ObjectFilter = filter.value;
    return { ok: true, value: [{ kind: 'behold', filter: value }], rule: clause.rule };
  },
};

export const DRAGON_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  EXILE_TOP,
  MAY_PLAY,
  EXTRA_COMBAT,
  DISCOVER,
  EXILE_UNTIL_CAST,
  SHUFFLE_REVEAL_TOP,
  BEHOLD,
];

/** Features the lowerings of this file can name, for the dimension test. */
export const DRAGON_NEEDS: readonly FeatureRef[] = [
  'effect:exileTop',
  'effect:mayPlay',
  'effect:extraCombat',
  'effect:exileUntilCast',
  'effect:revealTop',
  'effect:enterAttacking',
  'effect:behold',
  'effect:payAnyAmount',
  'amount:shortfall',
  'static:unspentManaStays',
  'static:castFromTopOfLibrary',
];

type Static = Extract<IrAbility, { kind: 'static' }>;
type DragonStaticEffect = Extract<IrStaticEffect, { kind: 'unspentManaStays' | 'castFromTop' }>;

export function isDragonStatic(effect: IrStaticEffect): effect is DragonStaticEffect {
  return effect.kind === 'unspentManaStays' || effect.kind === 'castFromTop';
}

function staticFailure(node: Static, needs: readonly FeatureRef[] = []): LowerFailure {
  return { ok: false, needs, at: node.span, rule: node.rule };
}

/**
 * "You don't lose unspent red mana as steps and phases end." (CR 500.5) and "You may cast creature spells with power 4 or greater from the top of
 * your library. If you cast a creature spell this way, it gains haste until end of turn." (CR 601.3, 401.5): statements about the controller, with
 * no condition of their own and one effect.
 */
export function lowerDragonStatic(ability: Static): LowerResult<readonly Ability[]> {
  const { statement } = ability;
  const [effect, ...more] = statement.effects;
  if (
    effect === undefined ||
    !isDragonStatic(effect) ||
    more.length > 0 ||
    statement.subject.det !== 'you' ||
    statement.condition !== undefined ||
    statement.also !== undefined
  ) {
    return staticFailure(ability);
  }
  if (effect.kind === 'unspentManaStays') {
    const blocked = missingFeatures(['ability:static', 'static:unspentManaStays']);
    if (blocked.length > 0) return staticFailure(ability, blocked);
    return {
      ok: true,
      value: [
        {
          kind: 'static',
          static: { kind: 'unspentManaStays', colors: effect.colors as ManaColor[] },
        },
      ],
      rule: ability.rule,
    };
  }
  const blocked = missingFeatures(['ability:static', 'static:castFromTopOfLibrary']);
  if (blocked.length > 0) return staticFailure(ability, blocked);
  const { zone, stackKind, ...described } = effect.spells;
  void zone;
  void stackKind;
  const spells = lowerFilter({
    kind: 'noun',
    det: 'a',
    filter: described,
    upTo: false,
    plural: true,
    other: false,
    span: ability.span,
    rule: ability.rule,
  });
  if (!spells.ok) return spells;
  return {
    ok: true,
    value: [
      {
        kind: 'static',
        static: {
          kind: 'castFromTopOfLibrary',
          spells: spells.value,
          ...(effect.gainsHaste ? { gainsHaste: true as const } : {}),
        },
      },
    ],
    rule: ability.rule,
  };
}
