/**
 * Pieces shared by the effect rules: operand lists ("A, B, and C"), the words that join clauses,
 * and a builder for clauses. None of these is a rule: a rule is one phrase with an id.
 */
import {
  choice,
  fail,
  literal,
  map,
  type Parser,
  pattern,
  refuseAt,
  separatedBy1,
} from '../../combinators';
import type { IrArg, IrClause, IrDuration, IrNoun, IrNounList, Span } from '../../ir/types';
import { family, node, spanned } from '../registry';

/** Between the items of "target A, target B, and target C" (also "target A and target B"). */
export const LIST_SEPARATOR = choice(
  literal(', and '),
  literal(', '),
  // " and it can't be blocked this turn" (stage P49, D-206): "it" followed by a verb is the subject of another clause, not one more object of the list.
  map(
    pattern(
      / and (?!it (?:can['’]t|gains?|gets?|has|have|attacks?|must|becomes)(?![\p{L}\p{N}]))/iu,
    ),
    () => ' and ',
  ),
);

/** Between two clauses of one sentence: "Destroy target creature, then draw a card." */
export const CLAUSE_JOIN = choice(
  literal(', and then '),
  literal(', then '),
  literal(' and then '),
  literal(' then '),
  literal(', and '),
  literal(' and '),
);

/** How a join connects what is before it to what follows (the `connector` of the clause before). */
export function connectorOf(join: string): 'and' | 'then' {
  return /\bthen\b/i.test(join) ? 'then' : 'and';
}

/** " under your control", " under its owner's control": who controls what enters (CR 110.2a). */
export const UNDER_CONTROL: Parser<'you' | 'owner'> = choice(
  map(literal(' under your control'), () => 'you' as const),
  map(pattern(/ under its owner['’]s control/i), () => 'owner' as const),
);

/** The noun rules a verb about permanents accepts as its operand. */
export const PERMANENT_OPERANDS = [
  'noun.target-commander',
  'noun.target-permanent',
  'noun.all-permanents',
  'noun.each-permanent',
  // D-268: "each artifact and creature your opponents control".
  'noun.each-type-union',
] as const;

/** What a verb that acts on a permanent can also say of the permanent it is on: "untap ~". */
export const SELF_OR_PERMANENT_OPERANDS = ['noun.self', ...PERMANENT_OPERANDS] as const;

export const GRAVEYARD_OPERANDS = [
  'noun.target-graveyard-card',
  'noun.all-graveyard-cards',
] as const;

/** The nouns an instruction that deals damage can name as the recipient: a target, any target, a player, a group. */
export const DAMAGE_RECIPIENTS = [
  'noun.any-target',
  'noun.player',
  // Stage P37 (D-180): "target player or planeswalker" and "each creature that player controls".
  'noun.player-or-planeswalker',
  'noun.each-permanent-of-player',
  // Stage P34 (D-152): "each other opponent".
  'noun.each-other-opponent',
  // "~ deals 3 damage to that player" (stage P29, D-133): the player the event of the trigger is about.
  'noun.that-player',
  // "~ deals 2 damage to that permanent's controller" (stage P35, D-176, CR 109.4, 608.2h): the controller of an object the text named.
  'noun.its-controller',
  ...PERMANENT_OPERANDS,
  // "~ deals 1 damage to the player or planeswalker it's attacking" (stage P31, D-140): what the creature attacks.
  'noun.attacked-by-it',
] as const;

/**
 * The verbs a clause can start with after "and": "~ deals 3 damage to target creature and you gain 3 life" is two
 * clauses, and "you" is not a second recipient (stage P28). A player noun followed by one of these words is the
 * subject of the next clause.
 */
const NEXT_CLAUSE_VERB =
  /^ (?:gains?|loses?|draws?|discards?|mills?|sacrifices?|creates?|investigates?|puts?|deals?|becomes?|may|can|controls?|adds?|returns?|exiles?|destroys?|shuffles?|scry|scries|surveils?)(?![\p{L}\p{N}])/iu;

/** Refuses an operand the verb cannot take, failing at the words that were refused. */
export interface Restriction {
  readonly accept: (noun: IrNoun) => boolean;
  readonly locate: (noun: IrNoun, text: string) => number;
}

/**
 * One or more operands of a verb: a single noun, or a list of them (each its own effect once
 * lowered). `only` names the noun rules the verb accepts (a selectional restriction), and
 * `restriction` refuses a noun one of them read, failing where its offending words began so the
 * diagnostic points at them.
 */
export function operands(
  only: readonly string[],
  rule: string,
  restriction?: Restriction,
): Parser<IrNoun | IrNounList> {
  // A player noun with a verb right after it is the subject of the next clause, not another operand.
  const read = family<IrNoun>('noun', { only });
  const noun: Parser<IrNoun> = (ctx, pos) => {
    const r = read(ctx, pos);
    if (!r.ok) return r;
    const player =
      ['you', 'eachPlayer', 'eachOpponent'].includes(r.value.det) ||
      (r.value.det === 'target' && r.value.filter.player !== undefined);
    return player && NEXT_CLAUSE_VERB.test(ctx.text.slice(r.pos)) ? fail(ctx, pos) : r;
  };
  const item =
    restriction === undefined
      ? noun
      : refuseAt(noun, restriction.accept, (value, ctx) => restriction.locate(value, ctx.text));
  return map(
    spanned(separatedBy1(item, LIST_SEPARATOR)),
    ({ value: items, span }): IrNoun | IrNounList => {
      const [first] = items;
      if (items.length === 1 && first !== undefined) return first;
      return { kind: 'nounList', items, span, rule };
    },
  );
}

/** A clause with the defaults ("you may", conditions and durations are not read yet). */
export function makeClause(
  rule: string,
  verb: string,
  args: Readonly<Record<string, IrArg>>,
  span: Span,
): IrClause {
  return { kind: 'clause', verb, args, optional: false, span, rule };
}

/** The items of a list and the join in front of each item after the first. */
export function listWithJoins<T>(
  item: Parser<T>,
  join: Parser<string>,
): Parser<{ items: T[]; joins: string[] }> {
  return (ctx, start) => {
    const first = item(ctx, start);
    if (!first.ok) return first;
    const items = [first.value];
    const joins: string[] = [];
    let pos = first.pos;
    for (;;) {
      const sep = join(ctx, pos);
      if (!sep.ok) break;
      const next = item(ctx, sep.pos);
      if (!next.ok) break;
      items.push(next.value);
      joins.push(sep.value);
      pos = next.pos;
    }
    return { ok: true, value: { items, joins }, pos };
  };
}

export type Clauses = readonly IrClause[];

/** A rule that reads one clause: `build` turns what was read into the verb and its arguments. */
export function single<V>(
  id: string,
  parser: Parser<V>,
  build: (value: V) => { verb: string; args: Record<string, IrArg>; duration?: IrDuration },
): Parser<Clauses> {
  return map(
    node<V, IrClause>(id, parser, (value) => ({
      kind: 'clause',
      optional: false,
      ...build(value),
    })),
    (c) => [c],
  );
}
