/**
 * Effect rule of the Abzan Armor deck, group A (combat): what a creature or a group of creatures can do and assigns in combat for the turn.
 *
 * - `effect.combat-rule-change`: "Target creature with defender can attack this turn as though it didn't have defender." (Assault Formation), "Creatures you control with defender can attack this
 *   turn as though they didn't have defender." (Wakestone Gargoyle) and "Until end of turn, target creature with defender gains haste, can attack as though it didn't have defender, and assigns
 *   combat damage equal to its toughness rather than its power." (Walking Bulwark).
 */
import {
  choice,
  fail,
  literal,
  map,
  type Parser,
  pattern,
  satisfy,
  separatedBy1,
  sequence,
} from '../../combinators';
import type { IrArg, IrClause, IrDuration, IrNoun, IrRestrictionKind, Span } from '../../ir/types';
import { KEYWORD_WORDS } from '../keyword/list';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

const RULE = 'effect.combat-rule-change';
const END = '(?![\\p{L}\\p{N}])';

/** One thing the sentence says the subject does or has for the turn, with where it was read. */
type Item =
  | { readonly kind: 'gains'; readonly keywords: readonly string[]; readonly span: Span }
  | {
      readonly kind: 'rule';
      readonly restriction: IrRestrictionKind;
      readonly thisTurn: boolean;
      readonly span: Span;
    };

/** The items of one sentence: the keywords the subject gains, "can attack as though it didn't have defender" and "assigns combat damage equal to its toughness rather than its power". */
function itemParser(plural: boolean): Parser<Item> {
  const it = plural ? 'they' : 'it';
  const its = plural ? 'their' : 'its';
  const gains = map(
    spanned(
      map(
        sequence(pattern(plural ? /gain /iu : /gains /iu), KEYWORD_WORDS),
        ([, words]): readonly string[] => words,
      ),
    ),
    ({ value, span }): Item => ({ kind: 'gains', keywords: value, span }),
  );
  const attack = map(
    spanned(
      pattern(
        new RegExp(`can attack( this turn)? as though ${it} didn['’]t have defender${END}`, 'iu'),
      ),
    ),
    ({ value, span }): Item => ({
      kind: 'rule',
      restriction: 'canAttackAsThoughNoDefender',
      thisTurn: value[1] !== undefined,
      span,
    }),
  );
  const assign = map(
    spanned(
      pattern(
        new RegExp(
          `${plural ? 'assign' : 'assigns'} combat damage equal to ${its} toughness rather than ${its} power${END}`,
          'iu',
        ),
      ),
    ),
    ({ value: _value, span }): Item => ({
      kind: 'rule',
      restriction: 'assignsDamageByToughness',
      thisTurn: false,
      span,
    }),
  );
  return choice(gains, attack, assign);
}

/** Between the items of one sentence: "gains haste, can attack ..., and assigns ...". */
const ITEM_JOIN = choice(literal(', and '), literal(', '), literal(' and '));

/** The subject: one target creature (any quality the noun rules read: "with defender", "you control"), or a group of creatures ("creatures you control with defender"). */
const isCreatureOnly = (noun: IrNoun): boolean =>
  noun.filter.anyOf === undefined &&
  noun.filter.types?.length === 1 &&
  noun.filter.types[0] === 'creature';

const targetCreature: Parser<IrNoun> = satisfy(
  family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
  (n) =>
    n.det === 'target' &&
    !n.plural &&
    !n.upTo &&
    n.minTargets === undefined &&
    n.upToThatMany !== true &&
    isCreatureOnly(n),
);

const creatureGroup: Parser<IrNoun> = satisfy(
  family<IrNoun>('noun', { only: ['noun.plain-permanents'] }),
  (n) => n.det === 'each' && n.plural && !n.other && isCreatureOnly(n),
);

function clausesOf(
  subject: IrNoun,
  items: readonly Item[],
  duration: (item: Item) => IrDuration,
): Clauses {
  const clauses: IrClause[] = [];
  const total = items.reduce((n, i) => n + (i.kind === 'gains' ? i.keywords.length : 1), 0);
  let made = 0;
  const push = (clause: IrClause, item: Item) => {
    made += 1;
    clauses.push({
      ...clause,
      duration: duration(item),
      ...(made < total ? { connector: 'and' } : {}),
    });
  };
  for (const item of items) {
    if (item.kind === 'gains') {
      for (const name of item.keywords) {
        const keyword = { kind: 'keywordName' as const, name, span: item.span, rule: RULE };
        push(makeClause(RULE, 'grantKeyword', { objects: subject, keyword }, item.span), item);
      }
    } else {
      const restriction: IrArg = {
        kind: 'restrictionKind',
        restriction: item.restriction,
        span: item.span,
        rule: RULE,
      };
      push(makeClause(RULE, 'restrict', { objects: subject, restriction }, item.span), item);
    }
  }
  return clauses;
}

/** The words of the two rule changes, looked for before anything is read, so that a sentence without them fails here and the diagnostic of another rule is not moved. */
const RULE_WORDS = /(?:can attack(?: this turn)? as though|assigns? combat damage equal to)/iu;

const parseSentence: Parser<Clauses> = (ctx, pos) => {
  if (!RULE_WORDS.test(ctx.text.slice(pos))) return fail(ctx, pos);
  const lead = spanned(pattern(/until end of turn, /iu))(ctx, pos);
  const start = lead.ok ? lead.pos : pos;
  for (const [plural, subjectParser] of [
    [false, targetCreature],
    [true, creatureGroup],
  ] as const) {
    const subject = subjectParser(ctx, start);
    if (!subject.ok) continue;
    const space = literal(' ')(ctx, subject.pos);
    if (!space.ok) continue;
    const list = separatedBy1(itemParser(plural), ITEM_JOIN)(ctx, space.pos);
    if (!list.ok) continue;
    const items = list.value;
    // A sentence that only gives keywords is `effect.lead-gain`'s: this rule is for the two rule changes.
    if (!items.some((i) => i.kind === 'rule')) continue;
    const hasThisTurn = items.some((i) => i.kind === 'rule' && i.thisTurn);
    // The duration is either the leading "Until end of turn," for every item, or the "this turn" inside "can attack this turn as though ..." of a sentence that says only that.
    if (lead.ok ? hasThisTurn : !(items.length === 1 && hasThisTurn)) continue;
    const scope = lead.ok ? ('untilEndOfTurn' as const) : ('thisTurn' as const);
    const duration = (item: Item): IrDuration => ({
      kind: 'duration',
      scope,
      span: item.span,
      rule: RULE,
    });
    return { ok: true, value: clausesOf(subject.value, items, duration), pos: list.pos };
  }
  return fail(ctx, pos);
};

export const EFFECT_COMBAT_RULE_CHANGE = defineRule<Clauses>({
  id: RULE,
  family: 'effect',
  leading: ['until', 'target', ...['creatures', 'artifact', 'legendary', 'nonland']],
  cites: [
    'CR 609.4 (Effects)',
    'CR 702.3b (Defender)',
    'CR 508.1a (Declare Attackers Step)',
    'CR 510.1a (Combat Damage Step)',
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 514.2 (Cleanup Step)',
  ],
  examples: [
    "target creature with defender can attack this turn as though it didn't have defender",
    "target creature can attack this turn as though it didn't have defender",
    "creatures you control with defender can attack this turn as though they didn't have defender",
    "creatures you control can attack this turn as though they didn't have defender",
    "until end of turn, target creature with defender gains haste, can attack as though it didn't have defender, and assigns combat damage equal to its toughness rather than its power",
    "Until end of turn, target creature with defender gains haste, can attack as though it didn't have defender, and assigns combat damage equal to its toughness rather than its power",
    'until end of turn, target creature assigns combat damage equal to its toughness rather than its power',
    'until end of turn, creatures you control assign combat damage equal to their toughness rather than their power',
    "until end of turn, target creature you control can attack as though it didn't have defender",
  ],
  rejects: [
    "target creature with defender can attack as though it didn't have defender",
    "target creature can attack this turn as though they didn't have defender",
    "target creature can attack this turn as though it didn't have defender and draw a card",
    "target creatures can attack this turn as though they didn't have defender",
    "creatures you control can attack this turn as though it didn't have defender",
    "creature you control can attack this turn as though it didn't have defender",
    "other creatures you control can attack this turn as though they didn't have defender",
    "until end of turn, target creature can attack this turn as though it didn't have defender",
    'until end of turn, target creature assigns combat damage equal to its power rather than its toughness',
    'until end of turn, target creature assign combat damage equal to its toughness rather than its power',
    'until end of turn, target creature assigns combat damage equal to its toughness rather than its power and draw a card',
    "until end of turn, target creature can attack as though it didn't have flying",
    'target creature assigns combat damage equal to its toughness rather than its power',
    "until your next turn, target creature can attack as though it didn't have defender",
    "until end of turn, up to two target creatures can attack as though they didn't have defender",
  ],
  parse: parseSentence,
});

export const COMBAT_RULE_EFFECT_RULES = [EFFECT_COMBAT_RULE_CHANGE];
