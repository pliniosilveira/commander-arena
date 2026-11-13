/**
 * The binding pass (D-063, proposal 3.7): one walk over a parsed ability, in text order, that
 * numbers targets and resolves pronouns. Nothing is guessed: a pronoun with no compatible
 * antecedent is an `unboundReference` failure and the ability is dropped (CR 109 and 115 are about
 * objects and targets; the pass only decides which noun a later noun means).
 *
 * 1. a target noun gets the next target id (`t1`, `t2`, ... in order of appearance; `scope`
 *    carries the count across the spell lines of one face); one phrase read once is one target,
 *    however many clauses use it ("Target player draws two cards and loses 2 life");
 * 2. `it`, `that creature`, `that land`, `that card` bind to the most recent singular object noun
 *    with a compatible filter; `that player`, `they` to the most recent player noun; `those
 *    cards`, `them` to the most recent plural noun; `the other` to the second of a count-2 noun;
 * 3. in a triggered ability the trigger's subject and actor are the first antecedents, so `it`
 *    binds to `triggerSubject`; when every event of the trigger is about `~` itself and `~` is
 *    still on the battlefield for it (enters, attacks, becomes tapped; not "dies"), the subject is
 *    `~` and `it` binds to it as to any other mention of `~`;
 * 4. a clause verb listed in `bindingVerbs` declares a result (`b1`, ...) that later pronouns can
 *    mean ("search ..., put it onto the battlefield"), standing in for the nouns it was said of;
 *    every other noun that is not a target ("each creature", "a creature") is `m1`, `m2`, ... so
 *    a pronoun can still say which noun it follows;
 * 5. each mode of a modal spell or ability is a scope of its own for pronouns (a mode cannot say "it" of
 *    a target of another mode), but its targets are numbered on, so the ids are unique across the modes
 *    (CR 601.2c: the targets of every chosen mode are announced together).
 */
import { foldTokenAbilities } from './fold-token';
import {
  type IrAbility,
  type IrAmount,
  type IrArg,
  type IrBody,
  type IrClause,
  type IrFilter,
  type IrModes,
  type IrNoun,
  type IrNounList,
  type IrTrigger,
  isIrAmount,
  type Span,
} from './types';

export interface BindScope {
  /** Targets numbered so far in this scope. */
  targetCount: number;
  /**
   * The last single object target of the spell lines read so far (stage P35, D-176): the object "That creature also gains trample until end of turn."
   * on a line of its own is about, as a sentence after a sentence about a target is (CR 608.2c). Only "that creature" and its kind reach it: "it"
   * says nothing of what it follows, and a line that starts with "it" is not read as the line before's.
   */
  lastTarget?: IrNoun;
}

export interface BindOptions {
  readonly scope?: BindScope;
  /** Clause verbs whose result later pronouns can refer to. Empty until a rule needs one. */
  readonly bindingVerbs?: ReadonlySet<string>;
}

export type BindResult =
  | {
      readonly ok: true;
      readonly ability: IrAbility;
      /** The target nouns, bound, in order. */
      readonly targets: readonly IrNoun[];
    }
  | {
      readonly ok: false;
      readonly reason: 'unboundReference';
      /** The words that had nothing to refer to. */
      readonly reference: string;
      readonly at: Span;
      readonly rule: string;
    };

interface Antecedent {
  readonly noun: IrNoun;
  readonly kind: 'object' | 'player';
  /** The target of the spell line before (stage P35, D-176): only a "that creature" of the next line may mean it. */
  readonly previousLine?: true;
  /** The token one instruction made (stage P48, D-205): only "that token" may mean it, never "it" or "that creature". */
  readonly token?: true;
  /** The source of "~ deals damage equal to its power" (stage P49, D-206): only "it" and "its" may mean it, never "that creature". */
  readonly selfIt?: true;
}

const key = (span: Span) => `${span.start}:${span.end}`;

const PLAYER_DETS: ReadonlySet<IrNoun['det']> = new Set([
  'you',
  'eachPlayer',
  'eachOpponent',
  'triggerActor',
  // "its controller": a player whoever the object is (CR 109.4)
  'controllerOf',
  'ownerOf',
  // Stage P28: "you and target opponent each", "defending player" (CR 508.5)
  'players',
  'defendingPlayer',
  // D-269: "each player ~ attacked this turn": several players, so a later "that player" is bound to it and refused by the lowering.
  'attackedPlayers',
]);

function isPlayerNoun(noun: IrNoun): boolean {
  return PLAYER_DETS.has(noun.det) || noun.filter.player !== undefined;
}

type Pronoun =
  | { readonly kind: 'player' }
  | { readonly kind: 'plural' }
  | { readonly kind: 'other' }
  | { readonly kind: 'single'; readonly type: string | null; readonly youControl?: true };

function classify(raw: string): Pronoun | null {
  const word = raw.trim().toLowerCase();
  if (word === 'that player' || word === 'they') return { kind: 'player' };
  // D-392 (Hashaton, group 9): "that source's controller", the player a trigger about a source names.
  if (/^that source['’]s controller$/u.test(word)) return { kind: 'player' };
  if (word === 'the other') return { kind: 'other' };
  if (word === 'them' || /^those \w+$/.test(word)) return { kind: 'plural' };
  // D-362 (Victimize): "the chosen cards" are the cards of the target phrase the text chose before.
  if (/^the chosen (?:[\p{L}-]+ )?cards$/u.test(word)) return { kind: 'plural' };
  // "that nonland permanent card" (stage P33, D-150): a card an earlier instruction named, whatever the words before "card" say of it.
  if (/^that (?:[\p{L}-]+ )+card$/u.test(word)) return { kind: 'single', type: null };
  if (word === 'it' || word === 'her' || word === 'him') return { kind: 'single', type: null };
  // "the creature you control" (stage P32, D-147): the most recent object of the text that says it is "you control".
  const controlled = /^the (\w+) you control$/.exec(word);
  if (controlled?.[1] !== undefined) {
    const type = ['permanent', 'card', 'object'].includes(controlled[1]) ? null : controlled[1];
    return { kind: 'single', type, youControl: true };
  }
  const m = /^that (\w+)$/.exec(word);
  if (m?.[1] !== undefined) {
    return { kind: 'single', type: ['permanent', 'card', 'object'].includes(m[1]) ? null : m[1] };
  }
  return null;
}

/** Whether an antecedent's filter allows a noun of `type` ("that creature" needs a creature). */
function compatible(filter: IrFilter, type: string | null): boolean {
  if (type === null || filter.anyTarget === true) return true;
  // "that spell" is a spell on the stack whatever its card types are (stage P27: "a creature spell ... copy that spell").
  if (type === 'spell') return filter.stackKind === 'spell';
  // "target nonland permanent card": "that land" cannot mean it (stage P33).
  if (filter.notTypes?.includes(type)) return false;
  // "target artifact or enchantment": "that creature" cannot mean it (D-063 anyOf).
  if (filter.anyOf !== undefined && !filter.anyOf.some((m) => compatible(m, type))) return false;
  if (filter.types === undefined || filter.types.length === 0) return true;
  return filter.types.includes(type);
}

class Binder {
  private readonly byKey = new Map<string, IrNoun>();
  private readonly antecedents: Antecedent[] = [];
  readonly targets: IrNoun[] = [];
  failure: Extract<BindResult, { ok: false }> | null = null;
  private resultCount = 0;
  private mentionCount = 0;
  private tokenCount = 0;

  private readonly scope: BindScope;
  private readonly bindingVerbs: ReadonlySet<string>;

  constructor(scope: BindScope, bindingVerbs: ReadonlySet<string>) {
    this.scope = scope;
    this.bindingVerbs = bindingVerbs;
  }

  seed(
    noun: IrNoun | undefined,
    as: 'triggerSubject' | 'triggerActor',
    isSelf = false,
  ): IrNoun | undefined {
    if (noun === undefined) return undefined;
    const trigger = isSelf ? 'self' : 'trig';
    const bound = { ...noun, ref: as === 'triggerSubject' ? trigger : 'trigActor' };
    this.antecedents.push({ noun: bound, kind: as === 'triggerActor' ? 'player' : 'object' });
    return bound;
  }

  /** The target of the spell line before this one, the antecedent of a "that creature" of this line and of no other pronoun (stage P35, D-176). */
  seedLine(noun: IrNoun): void {
    this.antecedents.push({ noun, kind: 'object', previousLine: true });
  }

  private fail(noun: IrNoun) {
    this.failure ??= {
      ok: false,
      reason: 'unboundReference',
      reference: noun.filter.raw,
      at: noun.span,
      rule: noun.rule,
    };
  }

  /** A sentence of this body asked a player ("target opponent may have you ..."): "that player" then never means "you". */
  private playerAsked = false;

  private resolveAnaphor(noun: IrNoun): IrNoun {
    const pronoun = classify(noun.filter.raw);
    const recent = [...this.antecedents].reverse();
    let found: Antecedent | undefined;
    switch (pronoun?.kind) {
      case 'player':
        // A player the text never says ("Draw a card": you, implied, no words) cannot be what "that
        // player" or "they" points back to (stage P18).
        // Stage P52 (D-210): after a sentence that asks a player ("target opponent may have you draw three cards. If the player doesn't, you mill three cards,
        // then ~ deals damage to that player"), "that player" points past the "you" before it, to the player asked.
        found = recent.find(
          (a) =>
            a.kind === 'player' &&
            a.noun.filter.raw !== '' &&
            !(
              this.playerAsked &&
              a.noun.det === 'you' &&
              /^that player$/iu.test(noun.filter.raw.trim())
            ),
        );
        break;
      case 'plural':
        found = recent.find((a) => a.kind === 'object' && a.noun.plural);
        break;
      case 'other':
        found = recent.find((a) => a.noun.count?.kind === 'number' && a.noun.count.value === 2);
        break;
      case 'single':
        found = recent.find(
          (a) =>
            a.kind === 'object' &&
            // "That token" means a token an instruction made and nothing else does (stage P48, D-205).
            (pronoun.type === 'token') === (a.token === true) &&
            (a.selfIt !== true || /^its?$/iu.test(noun.filter.raw.trim())) &&
            (a.previousLine !== true || /^that /iu.test(noun.filter.raw)) &&
            !a.noun.plural &&
            compatible(a.noun.filter, pronoun.type) &&
            (pronoun.youControl !== true || a.noun.filter.controller === 'you'),
        );
        break;
      default:
        break;
    }
    if (found === undefined) {
      this.fail(noun);
      return noun;
    }
    const antecedent = found.noun;
    // "Tap enchanted creature and remove all counters from it" (stage P50, D-207): "it" is the permanent the Aura or Equipment is attached to, which the
    // engine names `attached`, so the pronoun takes the words of its antecedent.
    if (antecedent.det === 'enchanted' || antecedent.det === 'equipped') {
      return { ...noun, det: antecedent.det, filter: antecedent.filter };
    }
    if (antecedent.ref === 'trig') return { ...noun, det: 'triggerSubject', ref: 'trig' };
    if (antecedent.ref === 'trigActor') return { ...noun, det: 'triggerActor', ref: 'trigActor' };
    const ref = pronoun?.kind === 'other' ? `${antecedent.ref ?? ''}.2` : antecedent.ref;
    return ref === undefined ? { ...noun } : { ...noun, ref };
  }

  noun(noun: IrNoun): IrNoun {
    const seen = this.byKey.get(key(noun.span));
    if (seen !== undefined) return seen;
    const of = noun.of === undefined ? undefined : this.noun(noun.of);
    // D-269: "you and that player each gain that much life": a pronoun of the list points at what came before the list, never at "you" of its own list
    // (as for a list of nouns, stage P53, D-212), so the pronouns are bound first.
    let members: IrNoun[] | undefined;
    if (noun.members !== undefined) {
      const bound: IrNoun[] = [];
      const order = noun.members
        .map((_member, i) => i)
        .sort(
          (a, b) =>
            Number(noun.members?.[a]?.det !== 'anaphor') -
            Number(noun.members?.[b]?.det !== 'anaphor'),
        );
      for (const i of order) {
        const member = noun.members[i];
        if (member !== undefined) bound[i] = this.noun(member);
      }
      members = bound;
    }
    const controller = noun.filter.controller;
    const filter =
      typeof controller === 'object'
        ? { ...noun.filter, controller: { ...controller, noun: this.noun(controller.noun) } }
        : noun.filter;
    let out: IrNoun = {
      ...noun,
      filter,
      ...(of === undefined ? {} : { of }),
      ...(members === undefined ? {} : { members }),
    };
    if (noun.det === 'anaphor') {
      out = this.resolveAnaphor(out);
    } else if (noun.det === 'target') {
      this.scope.targetCount += 1;
      out = { ...out, ref: `t${this.scope.targetCount}` };
      this.targets.push(out);
      this.antecedents.push({ noun: out, kind: isPlayerNoun(out) ? 'player' : 'object' });
    } else if (noun.det === 'self') {
      out = { ...out, ref: 'self' };
      this.antecedents.push({ noun: out, kind: 'object' });
    } else {
      if (!isPlayerNoun(out)) {
        this.mentionCount += 1;
        out = { ...out, ref: `m${this.mentionCount}` };
      }
      // Several players at once are not one antecedent: their members, bound above, are.
      if (out.det !== 'players') {
        this.antecedents.push({ noun: out, kind: isPlayerNoun(out) ? 'player' : 'object' });
      }
    }
    this.byKey.set(key(noun.span), out);
    return out;
  }

  /** An amount with the nouns it names bound: what it counts, the object whose power or toughness it reads. */
  amount(amount: IrAmount): IrAmount {
    switch (amount.kind) {
      case 'countOf':
      case 'powerOf':
      case 'manaValueOf':
      case 'toughnessOf':
      case 'countersOn':
      case 'aggregate':
      case 'colorsAmong':
        return { ...amount, of: this.noun(amount.of) };
      case 'half':
      case 'multiple':
      case 'minus':
        return { ...amount, of: this.amount(amount.of) };
      case 'sum':
        return { ...amount, of: amount.of.map((part) => this.amount(part)) };
      default:
        return amount;
    }
  }

  private arg(arg: IrArg): IrArg {
    if (isIrAmount(arg)) return this.amount(arg);
    switch (arg.kind) {
      case 'noun':
        return this.noun(arg);
      case 'nounList': {
        // Stage P53 (D-212): "~ and that creature each get +2/+0": a pronoun of the list points at what came before the list, never at its own first member, so
        // the pronouns are bound first.
        const bound: IrNoun[] = [];
        const order = arg.items
          .map((_n, i) => i)
          .sort(
            (a, b) =>
              Number(arg.items[a]?.det !== 'anaphor') - Number(arg.items[b]?.det !== 'anaphor'),
          );
        for (const i of order) {
          const item = arg.items[i];
          if (item !== undefined) bound[i] = this.noun(item);
        }
        return { ...arg, items: bound } satisfies IrNounList;
      }
      case 'token': {
        // "a token that's a copy of target creature": the permanent copied is a noun like any other.
        // "a number of tapped Treasure tokens equal to its power" (stage P35, D-176): the pronoun of the count is bound like any other.
        const count = this.amount(arg.count);
        const made = arg.copyOf === undefined && count.kind === 'number' && count.value === 1;
        if (made) this.tokenCount += 1;
        const ref = made ? `tk${this.tokenCount}` : undefined;
        if (ref !== undefined) {
          // "Create a 2/2 red Dwarf creature token, then attach ~ to it" / "That token gains haste": the token is what "that token" follows.
          this.antecedents.push({
            kind: 'object',
            token: true,
            noun: {
              kind: 'noun',
              det: 'a',
              filter: { raw: 'token' },
              upTo: false,
              plural: false,
              other: false,
              span: arg.span,
              rule: arg.rule,
              ref,
            },
          });
        }
        return {
          ...arg,
          count,
          ...(ref === undefined ? {} : { ref }),
          ...(arg.copyOf === undefined ? {} : { copyOf: this.noun(arg.copyOf) }),
        };
      }
      default:
        return arg;
    }
  }

  clause(clause: IrClause): IrClause {
    // Visit nouns in text order, whatever order the rule put its arguments in.
    const entries = Object.entries(clause.args).sort(([, a], [, b]) => spanStart(a) - spanStart(b));
    const args: Record<string, IrArg> = {};
    // "~ deals damage equal to its power to each opponent" (stage P49, D-206): the rule reads "~ deals" and names the source no other way, so "its" is that
    // permanent whatever event started the ability (a step has no subject to seed).
    if (clause.verb === 'dealDamage' && clause.args.source === undefined) {
      this.antecedents.push({
        kind: 'object',
        selfIt: true,
        noun: {
          kind: 'noun',
          det: 'self',
          filter: { raw: '~' },
          upTo: false,
          plural: false,
          other: false,
          span: clause.span,
          rule: clause.rule,
          ref: 'self',
        },
      });
    }
    // "Put a card exiled with ~ into its owner's graveyard. If it's a land card, ..." (stage P50, D-207): "it" is the card the instruction moved, which the engine
    // names `moved`.
    if (clause.verb === 'putExiledWith') {
      this.antecedents.push({
        kind: 'object',
        noun: {
          kind: 'noun',
          det: 'a',
          filter: { raw: 'card' },
          upTo: false,
          plural: false,
          other: false,
          span: clause.span,
          rule: clause.rule,
          ref: 'moved',
        },
      });
    }
    const before = this.antecedents.length;
    for (const [name, value] of entries) {
      const seen = this.antecedents.length;
      args[name] = this.arg(value);
      // D-406: "Whenever a creature enters, you may attach ~ to that creature": the Aura or Equipment an attach moves is no antecedent of the pronoun after
      // it, which names the other permanent (the trigger's).
      if (clause.verb === 'attach' && name === 'object') this.antecedents.length = seen;
    }
    // "unless that player pays {1}" (stage P18): the player who pays follows the clause's own nouns.
    const test = clause.condition?.test;
    const condition =
      clause.condition !== undefined &&
      (test?.kind === 'unlessPays' || test?.kind === 'objectMatches')
        ? { ...clause.condition, test: { ...test, who: this.noun(test.who) } }
        : clause.condition;
    if (this.bindingVerbs.has(clause.verb)) {
      // The result stands in for the nouns the verb was said of ("search for a land card ... put
      // it onto the battlefield": "it" is the card found, not the phrase that described it).
      const said = this.antecedents.splice(before).map((a) => a.noun);
      this.resultCount += 1;
      const ref = `b${this.resultCount}`;
      this.antecedents.push({
        kind: 'object',
        noun: {
          kind: 'noun',
          det: 'a',
          filter: { raw: clause.verb },
          upTo: false,
          plural: said.some((n) => n.plural),
          other: false,
          span: clause.span,
          rule: clause.rule,
          ref,
        },
      });
    }
    // "... exiles a card from their hand at random. If it's a land card, you may put it onto the battlefield" (D-393, group 9): "it" is the card the instruction exiled,
    // which the engine names `moved`. Pushed after the clause's own nouns, so that it is the most recent object of the text.
    if (clause.verb === 'exileRandomFromHand') {
      this.antecedents.push({
        kind: 'object',
        noun: {
          kind: 'noun',
          det: 'a',
          filter: { raw: 'card' },
          upTo: false,
          plural: false,
          other: false,
          span: clause.span,
          rule: clause.rule,
          ref: 'moved',
        },
      });
    }
    return { ...clause, args, ...(condition === undefined ? {} : { condition }) };
  }

  body(body: IrBody): IrBody {
    const bound = {
      ...body,
      sentences: body.sentences.map((s) => {
        // "If it's a Zombie card, ...": the pronoun of the condition (stage P30) comes before the clauses of its sentence.
        const test = s.condition?.test;
        const condition =
          s.condition !== undefined && test?.kind === 'objectMatches'
            ? { ...s.condition, test: { ...test, who: this.noun(test.who) } }
            : s.condition;
        // "Target opponent may have you draw three cards" (stage P52, D-210): the player asked is named before the clauses, and later sentences may say "that player".
        const mayBy =
          s.mayBy === undefined ? undefined : { ...s.mayBy, who: this.noun(s.mayBy.who) };
        if (mayBy !== undefined) this.playerAsked = true;
        // "When you next cast an instant or sorcery spell this turn, copy that spell" (D-336): the spell the delayed trigger waits for is what "that spell" and "it" say.
        const seeded =
          s.delayed?.spell === undefined ? undefined : this.seed(s.delayed.spell, 'triggerSubject');
        const delayed =
          s.delayed === undefined || seeded === undefined
            ? undefined
            : { ...s.delayed, spell: seeded };
        const clauses = s.clauses.map((c) => this.clause(c));
        // "..., where X is that creature's power": the definition follows the clauses in the text.
        return {
          ...s,
          clauses,
          ...(delayed === undefined ? {} : { delayed }),
          ...(mayBy === undefined ? {} : { mayBy }),
          ...(condition === undefined ? {} : { condition }),
          ...(s.where === undefined ? {} : { where: this.amount(s.where) }),
        };
      }),
    };
    return { ...bound, sentences: foldTokenAbilities(bound.sentences) };
  }
}

function spanStart(arg: IrArg): number {
  return arg.span.start;
}

/** Trigger events after which `~` is still the battlefield object the text means by "it". */
const SELF_EVENTS: ReadonlySet<string> = new Set([
  'enters',
  'attacks',
  'becomesTapped',
  'becomesUntapped',
  // The creature has just been declared a blocker, or has just become blocked (stage P21, CR 509.3).
  'blocks',
  'becomesBlocked',
  // The source deals the damage on the battlefield (stage P18, D-111).
  'dealsCombatDamage',
  // A state of the permanent itself, which is on the battlefield while the state holds (stage P31, CR 603.8).
  'state',
]);

/**
 * True when every event of the trigger ("A or B" is several) is about `~` itself and happens to a
 * permanent that is still on the battlefield, so "it" in the body can only mean `~` (CR 603.2).
 * After "dies" the permanent is a card in a graveyard, a new object (CR 400.7), and "it" is not
 * read as `~`.
 */
function aboutSelf(trigger: IrTrigger): boolean {
  return [trigger, ...(trigger.alternatives ?? [])].every(
    (e) => e.subject?.det === 'self' && SELF_EVENTS.has(e.event),
  );
}

/** The `~` that a cost such as "Remove a counter from ~" names. */
function selfNoun(cost: { readonly span: Span; readonly rule: string }): IrNoun {
  return {
    kind: 'noun',
    det: 'self',
    filter: { raw: '~' },
    upTo: false,
    plural: false,
    other: false,
    span: cost.span,
    rule: cost.rule,
  };
}

/** Seeds a trigger's subject, actor and recipient as the first antecedents of whatever follows. */
function seedTrigger(binder: Binder, source: IrTrigger): IrTrigger {
  const subject = binder.seed(source.subject, 'triggerSubject', aboutSelf(source));
  const actor = binder.seed(source.actor, 'triggerActor');
  // The player a creature dealt combat damage to is the antecedent of "that player" (stage P18).
  const recipient = binder.seed(source.recipient, 'triggerActor');
  return {
    ...source,
    ...(subject === undefined ? {} : { subject }),
    ...(actor === undefined ? {} : { actor }),
    ...(recipient === undefined ? {} : { recipient }),
  };
}

/**
 * Binds the modes of a modal text (stage P19, CR 700.2): one binder per mode, so a pronoun never reaches
 * into another mode, all counting targets in the one `scope`, so no two modes share an id. `seed` gives
 * a mode's binder the antecedents the ability itself starts with.
 */
function bindModes(
  modal: IrModes,
  scope: BindScope,
  verbs: ReadonlySet<string>,
  seed: (binder: Binder) => unknown,
): { ok: true; modes: IrModes; targets: IrNoun[] } | { ok: false; failure: BindResult } {
  const targets: IrNoun[] = [];
  let failure: BindResult | null = null;
  const modes = modal.modes.map((mode) => {
    const sub = new Binder(scope, verbs);
    seed(sub);
    const bound = sub.body(mode);
    failure ??= sub.failure;
    targets.push(...sub.targets);
    return bound;
  });
  if (failure !== null) return { ok: false, failure };
  return { ok: true, modes: { ...modal, modes }, targets };
}

/** Binds one ability. `scope` lets the spell lines of a face share one target numbering. */
export function bind(ability: IrAbility, options: BindOptions = {}): BindResult {
  const scope = options.scope ?? { targetCount: 0 };
  const verbs = options.bindingVerbs ?? new Set<string>();
  const binder = new Binder(scope, verbs);
  const done = (bound: IrAbility): BindResult =>
    binder.failure ?? { ok: true, ability: bound, targets: binder.targets };

  switch (ability.kind) {
    case 'spell': {
      if (scope.lastTarget !== undefined) binder.seedLine(scope.lastTarget);
      const body = binder.body(ability.body);
      const last = binder.targets[binder.targets.length - 1];
      if (last !== undefined && !last.plural && !isPlayerNoun(last)) scope.lastTarget = last;
      return done({ ...ability, body });
    }
    case 'activated': {
      // "Remove a +1/+1 counter from ~: It deals 1 damage to any target.": a cost that names the
      // ability's own permanent ("from ~") and leaves it on the battlefield is what "it" first
      // means in the body. A sacrificed or exiled `~` is gone, and costs of {T} or mana name no
      // object, so neither gives "it" a meaning.
      // "{1}{W}, Discard this card: It deals 4 damage ..." (stage P68, D-229): the card discarded is what "it" means; it is the source of the ability, read from last-known information.
      const costs = ability.costs.find(
        (c) => c.kind === 'removeCounters' || c.kind === 'discardThis',
      );
      if (costs !== undefined) binder.seed(selfNoun(costs), 'triggerSubject', true);
      if (ability.modal !== undefined) {
        const seedSelf = (b: Binder) => {
          if (costs !== undefined) b.seed(selfNoun(costs), 'triggerSubject', true);
        };
        const modal = bindModes(ability.modal, scope, verbs, seedSelf);
        if (!modal.ok) return modal.failure;
        return { ok: true, ability: { ...ability, modal: modal.modes }, targets: modal.targets };
      }
      return done({ ...ability, body: binder.body(ability.body) });
    }
    case 'triggered': {
      const trigger = seedTrigger(binder, ability.trigger);
      if (ability.modal !== undefined) {
        // Each mode starts from the antecedents a body would: the trigger's subject and actor.
        const modal = bindModes(ability.modal, scope, verbs, (b) =>
          seedTrigger(b, ability.trigger),
        );
        if (!modal.ok) return modal.failure;
        return {
          ok: true,
          ability: { ...ability, trigger, modal: modal.modes },
          targets: modal.targets,
        };
      }
      return done({ ...ability, trigger, body: binder.body(ability.body) });
    }
    case 'modal': {
      const modal = bindModes(ability, scope, verbs, () => undefined);
      if (!modal.ok) return modal.failure;
      return { ok: true, ability: { ...ability, ...modal.modes }, targets: modal.targets };
    }
    case 'replacement': {
      const event = binder.clause(ability.event);
      const instead = ability.instead === undefined ? undefined : binder.body(ability.instead);
      return done({ ...ability, event, ...(instead === undefined ? {} : { instead }) });
    }
    case 'static':
    case 'keyword':
      return { ok: true, ability, targets: [] };
  }
}
