/**
 * Lowerings of group 1 of the Prismari deck (issue 87, D-638 to D-645): populate, the sentences about the tokens an instruction just made, copies of tokens, the choice of a token and
 * the permanents that become copies. "They", "them", "those tokens", "it" (the token) and "the token created this way" are read only as the tokens the instruction before made
 * (`ctx.tokensMade`, the engine's `moved`); after anything else the sentence is not lowered (never guessed).
 */
import type { IrClause } from '../ir/types';
import { isGrantable, keywordKind, plainKeyword } from '../rules/keyword/vocabulary';
import { lowerAmount } from './amounts';
import { arg, type Effects, eachObject, failure, operand } from './clauses';
import { objectRefOf, objectSelectorOf } from './nouns';
import type { LowerContext, Lowering } from './types';

const MOVED = { kind: 'moved' } as const;
const HASTE = { kind: 'keyword', keyword: { kind: 'haste' } } as const;

/** The clause is about the tokens the instruction before made. */
const aboutMadeTokens = (ctx: LowerContext): boolean => ctx.tokensMade;

const GRANT_TO_MADE: Lowering<IrClause, Effects> = {
  head: 'grantKeywordToMade',
  id: 'lower.grant-keyword-to-made',
  needs: ['effect:grantKeyword', 'selector:moved'],
  // D-647: "They gain haste until end of turn" carries its duration (the rule that reads it is the only one that gives this clause one); without it the keyword is for good.
  takesDuration: true,
  lower(clause, ctx) {
    if (clause.duration !== undefined && clause.duration.scope !== 'untilEndOfTurn') {
      return failure(clause);
    }
    const word = arg(clause, 'keyword');
    if (word?.kind !== 'keywordName' || word.protection !== undefined) return failure(clause);
    // CR 608.2c, 611.2c (Ardbert, Warrior of Darkness): "Put a +1/+1 counter on each legendary creature you control. They gain vigilance until end of turn.": "they" is the group
    // the counters went to, read again as the keyword is granted (a group of "each" is fixed as the effect resolves); only for a keyword of one turn.
    const group =
      !aboutMadeTokens(ctx) && clause.duration !== undefined ? ctx.lastCounteredGroup : null;
    if (!aboutMadeTokens(ctx) && group === null) return failure(clause);
    const kind = keywordKind(word.name);
    if (kind === undefined || !isGrantable(kind)) return failure(clause);
    return {
      ok: true,
      value: [
        {
          kind: 'grantKeyword',
          objects: group ?? MOVED,
          keyword: plainKeyword(kind),
          duration: clause.duration === undefined ? 'permanent' : 'untilEndOfTurn',
        },
      ],
      rule: clause.rule,
    };
  },
};

/** "Sacrifice it / Exile them at the beginning of the next end step": a delayed ability about the tokens made. */
function atEndStep(action: 'sacrifice' | 'exile'): Lowering<IrClause, Effects> {
  return {
    head: `${action}AtEndStepMade`,
    id: `lower.${action}-at-end-step-made`,
    needs: ['effect:delayedTrigger', `effect:${action}`, 'selector:moved'],
    lower(clause, ctx) {
      // CR 603.7c: also the one card an instruction before put onto the battlefield from a hand or graveyard ("You may put a creature card from your hand onto the battlefield.
      // ... Sacrifice it at the beginning of the next end step."): the delayed ability is about that object only, and about none when the player put none.
      if (!aboutMadeTokens(ctx) && !(action === 'sacrifice' && ctx.searched !== null)) {
        return failure(clause);
      }
      return {
        ok: true,
        value: [
          {
            kind: 'delayedTrigger',
            at: { step: 'endStep', whose: 'each' },
            effect: { kind: action, objects: MOVED },
          },
        ],
        rule: clause.rule,
      };
    },
  };
}

/** "sacrifice those tokens": the tokens made, in the delayed sentence that waits for the end step. */
function leave(action: 'sacrifice' | 'exile'): Lowering<IrClause, Effects> {
  return {
    head: `${action}MadeTokens`,
    id: `lower.${action}-made-tokens`,
    needs: [`effect:${action}`, 'selector:moved'],
    lower(clause, ctx) {
      if (!aboutMadeTokens(ctx)) return failure(clause);
      return {
        ok: true,
        value: [{ kind: action, objects: MOVED }],
        rule: clause.rule,
      };
    },
  };
}

/** "create five of those tokens": the token of the copy the instruction before made, that many. */
const CREATE_OF_THOSE: Lowering<IrClause, Effects> = {
  head: 'createOfThose',
  id: 'lower.create-of-those-tokens',
  needs: ['effect:createToken', 'token:copyOf'],
  lower(clause, ctx) {
    // D-646: the token of the instruction before, whatever kind ("create three of those tokens instead" after a 1/1 Elemental as after a copy).
    const last = ctx.lastToken;
    const count = arg(clause, 'count');
    if (last?.kind !== 'createToken' || count === undefined || count.kind !== 'number') {
      return failure(clause);
    }
    const amount = lowerAmount(count, ctx, clause.rule);
    if (!amount.ok) return amount;
    return { ok: true, value: [{ ...last, count: amount.value }], rule: clause.rule };
  },
};

/** "for each creature token you control that entered this turn, create a tapped and attacking token that's a copy of that token". */
const CREATE_COPIES_ATTACKING: Lowering<IrClause, Effects> = {
  head: 'createCopiesAttacking',
  id: 'lower.create-copies-attacking',
  needs: ['effect:createCopies', 'effect:enterAttacking', 'selector:moved', 'selector:each'],
  lower(clause, ctx) {
    const group = operand(clause, 'objects');
    if (group?.kind !== 'noun' || group.det !== 'each') return failure(clause);
    const objects = objectSelectorOf(group, ctx);
    if (!objects.ok) return objects;
    return {
      ok: true,
      value: [
        { kind: 'createCopies', objects: objects.value, tapped: true },
        { kind: 'enterAttacking', objects: MOVED },
      ],
      rule: clause.rule,
    };
  },
};

/** "For each of them, create a token that's a copy of that creature, except it has haste": a copy of each target the sentence before chose. */
const CREATE_COPIES_OF_THEM: Lowering<IrClause, Effects> = {
  head: 'createCopiesOfThem',
  id: 'lower.create-copies-of-them',
  needs: ['effect:createCopies', 'selector:target'],
  lower(clause, ctx) {
    const lowered = eachObject(
      clause,
      ctx,
      (objects) => ({ kind: 'createCopies', objects, abilities: [HASTE] }),
      'objects',
    );
    if (!lowered.ok) return lowered;
    // Only the targets of the sentence before: a target slot of any number of targets (the engine reads the group a slot named).
    const [only, ...more] = lowered.value;
    if (only === undefined || more.length > 0) return failure(clause);
    if (only.kind !== 'createCopies' || only.objects.kind !== 'target') return failure(clause);
    return lowered;
  },
};

/** "choose a token you control": the engine's `chooseObjects` (the id is read by the sentence that follows). */
const CHOSEN_TOKEN_ID = 'token';
const CHOOSE_TOKEN: Lowering<IrClause, Effects> = {
  head: 'chooseTokenYouControl',
  id: 'lower.choose-token-you-control',
  needs: ['effect:chooseObjects'],
  lower: (clause) => ({
    ok: true,
    value: [
      {
        kind: 'chooseObjects',
        id: CHOSEN_TOKEN_ID,
        filter: { token: true, controller: 'you' },
        count: 1,
      },
    ],
    rule: clause.rule,
  }),
};

/** "each other token you control becomes a copy of that token": every other token of the controller, of the one chosen, for good. */
const EACH_OTHER_TOKEN_BECOMES_COPY: Lowering<IrClause, Effects> = {
  head: 'eachOtherTokenBecomesCopy',
  id: 'lower.each-other-token-becomes-copy',
  needs: ['effect:becomeCopy', 'selector:chosen', 'selector:each'],
  lower: (clause) => ({
    ok: true,
    value: [
      {
        kind: 'becomeCopy',
        objects: {
          kind: 'each',
          filter: { token: true, controller: 'you' },
          except: { kind: 'chosen', id: CHOSEN_TOKEN_ID },
        },
        of: { kind: 'chosen', id: CHOSEN_TOKEN_ID },
        duration: 'permanent',
      },
    ],
    rule: clause.rule,
  }),
};

/** "~ becomes a copy of up to one target nonlegendary creature you control until end of turn, except it has myriad". */
const BECOME_COPY_EXCEPT: Lowering<IrClause, Effects> = {
  head: 'becomeCopyExcept',
  id: 'lower.become-copy-except',
  needs: ['effect:becomeCopy', 'selector:target', 'duration:untilEndOfTurn'],
  takesDuration: true,
  lower(clause, ctx) {
    const objects = operand(clause, 'objects');
    const of = operand(clause, 'of');
    const word = arg(clause, 'keyword');
    if (
      objects?.kind !== 'noun' ||
      of?.kind !== 'noun' ||
      word?.kind !== 'keywordName' ||
      word.protection !== undefined ||
      clause.duration?.scope !== 'untilEndOfTurn'
    ) {
      return failure(clause);
    }
    const kind = keywordKind(word.name);
    if (kind === undefined) return failure(clause);
    const self = objectRefOf(objects, ctx);
    if (!self.ok) return self;
    if (self.value.kind !== 'this') return failure(clause);
    const source = objectRefOf(of, ctx);
    if (!source.ok) return source;
    return {
      ok: true,
      value: [
        {
          kind: 'becomeCopy',
          objects: { kind: 'this' },
          of: source.value,
          duration: 'untilEndOfTurn',
          abilities: [{ kind: 'keyword', keyword: plainKeyword(kind) }],
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "At the beginning of the next end step, exile that token unless ~ is your Ring-bearer." (Sauron, the Necromancer; CR 701.54e, 603.7c): the instruction of the delayed sentence, an `exile` of
 * the token the instruction before made unless `thisIsRingBearer` holds as the delayed ability resolves.
 */
const EXILE_MADE_UNLESS_RING_BEARER: Lowering<IrClause, Effects> = {
  head: 'exileMadeUnlessRingBearer',
  id: 'lower.exile-made-unless-ring-bearer',
  needs: [
    'effect:conditional',
    'condition:not',
    'condition:thisIsRingBearer',
    'effect:exile',
    'selector:moved',
  ],
  lower(clause, ctx) {
    if (!aboutMadeTokens(ctx)) return failure(clause);
    return {
      ok: true,
      value: [
        {
          kind: 'conditional' as const,
          condition: { kind: 'not' as const, term: { kind: 'thisIsRingBearer' as const } },
          effect: { kind: 'exile' as const, objects: MOVED },
        },
      ],
      rule: clause.rule,
    };
  },
};

export const PRISMARI_G1_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  EXILE_MADE_UNLESS_RING_BEARER,
  GRANT_TO_MADE,
  atEndStep('sacrifice'),
  atEndStep('exile'),
  leave('sacrifice'),
  leave('exile'),
  CREATE_OF_THOSE,
  CREATE_COPIES_ATTACKING,
  CREATE_COPIES_OF_THEM,
  CHOOSE_TOKEN,
  EACH_OTHER_TOKEN_BECOMES_COPY,
  BECOME_COPY_EXCEPT,
];
