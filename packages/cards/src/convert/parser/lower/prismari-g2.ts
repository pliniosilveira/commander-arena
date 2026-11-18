/**
 * Lowerings of group 2 of the Prismari deck (issue 87, D-634 and later): the spell that exiles itself with time counters (CR 608.2n, 122.1), and the copy of the card an effect just
 * exiled that may be cast (CR 707.12, 608.2g). The other pieces of the group are the lowerings they extend (`createToken`, `addMana`) and the engine nodes the grammar already knew.
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { isGrantable, keywordKind, plainKeyword } from '../rules/keyword/vocabulary';
import { amountArg, arg, type Effects, failure, operand } from './clauses';
import { objectSelectorOf } from './nouns';
import type { Lowering } from './types';

/** "Exile ~ with three time counters on it": the spell's own text; the spell is the card that is exiled as it finishes resolving. */
const EXILE_SELF_TIME_COUNTERS: Lowering<IrClause, Effects> = {
  head: 'exileSelfTimeCounters',
  id: 'lower.exile-self-time-counters',
  needs: ['effect:exileSpellWithTimeCounters'],
  lower(clause, ctx) {
    // An ability's `~` is a permanent, which is not exiled by this instruction (and the engine refuses it): only the text of a spell.
    if (ctx.owner !== 'spell') return failure(clause);
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    if (typeof count.value !== 'number' || count.value < 1) return failure(clause);
    const effect: Effect = { kind: 'exileSpellWithTimeCounters', count: count.value };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/**
 * "... and copy it. You may cast the copy without paying its mana cost": the copy of the card the exile before it moved. Only after an exile of a target the same text chose, which
 * the grammar has read first (the two clauses of one rule).
 */
const COPY_CARD_AND_CAST: Lowering<IrClause, Effects> = {
  head: 'copyCardAndCast',
  id: 'lower.copy-card-and-cast',
  needs: ['effect:copyCardAndCast', 'selector:moved'],
  lower(clause, ctx) {
    // The card the exile before it put into exile (`moved`), the exile of a target the text chose: read by the engine as it is in exile.
    if (ctx.exiledRef === null) return failure(clause);
    const effect: Effect = { kind: 'copyCardAndCast', objects: { kind: 'moved' } };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/**
 * "... with \"During your turn, ~ has first strike.\"": the keyword the permanent has while it is its controller's turn, until end of turn (CR 604.1, 109.5, 611.2a). Only `~` itself
 * (the ability is the permanent's own) and a keyword the engine can grant without parameters.
 */
const GRANT_KEYWORD_YOUR_TURN: Lowering<IrClause, Effects> = {
  head: 'grantKeywordYourTurn',
  id: 'lower.grant-keyword-your-turn',
  needs: ['effect:grantKeyword', 'duration:untilEndOfTurn'],
  takesDuration: true,
  lower(clause, ctx) {
    const subject = operand(clause, 'objects');
    const word = arg(clause, 'keyword');
    if (subject?.kind !== 'noun' || subject.det !== 'self') return failure(clause);
    if (word?.kind !== 'keywordName' || word.protection !== undefined) return failure(clause);
    if (clause.duration?.scope !== 'untilEndOfTurn') return failure(clause);
    const kind = keywordKind(word.name);
    if (kind === undefined || !isGrantable(kind) || kind === 'riot') return failure(clause);
    const objects = objectSelectorOf(subject, ctx);
    if (!objects.ok) return objects;
    return {
      ok: true,
      value: [
        {
          kind: 'grantKeyword',
          objects: objects.value,
          keyword: plainKeyword(kind),
          duration: 'untilEndOfTurn',
          duringYourTurn: true,
        },
      ],
      rule: clause.rule,
    };
  },
};

export const PRISMARI_G2_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  EXILE_SELF_TIME_COUNTERS,
  COPY_CARD_AND_CAST,
  GRANT_KEYWORD_YOUR_TURN,
];
