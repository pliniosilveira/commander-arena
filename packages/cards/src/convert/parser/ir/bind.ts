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
  type IrCondition,
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
  /**
   * The last group ("each", `det` each) noun of the spell lines read so far (CR 608.2c; Unbreakable Formation: "Creatures you control gain indestructible until end of turn.
   * Addendum — If you cast this spell during your main phase, put a +1/+1 counter on each of those creatures"): the group "those creatures" on a line of its own is about.
   */
  lastGroup?: IrNoun;
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
  /** The group of the spell line before (CR 608.2c): only "those creatures" of the next line may mean it. */
  readonly groupLine?: true;
  /** The token one instruction made (stage P48, D-205): only "that token" may mean it, never "it" or "that creature". */
  readonly token?: true;
  /**
   * Several tokens one instruction made (Assemble the Entmoot, "Create three tapped X/X green Treefolk creature tokens ... Put a reach counter on each of them", CR 111.2, 608.2c):
   * only "each of them" may mean them, never "them" alone, "it" or "that token".
   */
  readonly tokens?: true;
  /** The source of "~ deals damage equal to its power" (stage P49, D-206): only "it" and "its" may mean it, never "that creature". */
  readonly selfIt?: true;
  /**
   * A token that is a copy with exceptions (issue 104, "create a token that's a copy of that card, except it's a 4/4 black Zombie. It gains haste until end of turn."): "it" of the
   * sentence after it is the token, as "that token" is (CR 707.9: the exceptions are said of "it", the copy).
   */
  readonly itToken?: true;
  /**
   * A token an instruction made (Quandrix Unlimited group E, CR 111.2, 400.7j): "it" of "Put a number of +1/+1 counters on it" in the sentence after it is the token. Only that
   * verb reads it so (the other pronouns after a token keep their meaning: "If that enchantment is an Aura, you may attach it to the token").
   */
  readonly plainToken?: true;
  /** A creature token with a power and toughness of its own (issue 100): "it" that gains a keyword in the sentence after it is the token. */
  readonly itTokenGains?: true;
  /**
   * The card an earlier instruction of the same text revealed or exiled from a library ("Reveal the top card of your library. Draw cards equal to that card's mana value", "Exile the top
   * card of your library. Create a number of tokens equal to that card's mana value"; CR 701.20a, 701.13, 608.2c): only "that card" may mean it, never "it" (which the instructions
   * that put a card somewhere would read as the card moved).
   */
  readonly thatCardOnly?: true;
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
  // "the player to your right": one player the text names, so a later "that player" is bound to it.
  'playerToRight',
  // "the chosen player": one player the permanent chose as it entered.
  'enteredChosenPlayer',
  // D-269: "each player ~ attacked this turn": several players, so a later "that player" is bound to it and refused by the lowering.
  'attackedPlayers',
  // "each of those opponents" of a damage batch trigger: several players, as above.
  'triggerDamagedPlayers',
  // "each opponent dealt combat damage this game by a creature named ~": several players, as above.
  'combatDamagedByNamed',
  // "each opponent who lost life this turn", "each opponent who was dealt combat damage by ~ this turn": several players, as above.
  'lostLifeThisTurn',
  'combatDamagedThisTurn',
  // "each player who controls a creature with power 4 or greater": several players, as above.
  'eachPlayerControlling',
  'eachPlayerControllingMore',
]);

function isPlayerNoun(noun: IrNoun): boolean {
  return PLAYER_DETS.has(noun.det) || noun.filter.player !== undefined;
}

type Pronoun =
  | { readonly kind: 'player' }
  | { readonly kind: 'plural'; readonly each?: true }
  | { readonly kind: 'other' }
  | { readonly kind: 'single'; readonly type: string | null; readonly youControl?: true };

function classify(raw: string): Pronoun | null {
  const word = raw.trim().toLowerCase();
  if (word === 'that player' || word === 'that opponent' || word === 'they') {
    return { kind: 'player' };
  }
  // D-392 (Hashaton, group 9): "that source's controller", the player a trigger about a source names.
  if (/^that source['’]s controller$/u.test(word)) return { kind: 'player' };
  // Exit from Exile deck (Bonecrusher Giant): "that spell's controller", the player a trigger about a spell that targeted names.
  if (/^that spell['’]s controller$/u.test(word)) return { kind: 'player' };
  // Unbound Flourishing (CR 707.10): "copy that spell or ability" names the spell or the activated ability that caused the trigger; the binding pass takes the spell of the trigger.
  if (word === 'that spell or ability') return { kind: 'single', type: 'spell' };
  if (word === 'the other') return { kind: 'other' };
  if (word === 'each of them') return { kind: 'plural', each: true };
  if (word === 'them' || /^(?:each of )?those \w+$/.test(word)) return { kind: 'plural' };
  // D-362 (Victimize): "the chosen cards" are the cards of the target phrase the text chose before.
  if (/^the chosen (?:[\p{L}-]+ )?cards$/u.test(word)) return { kind: 'plural' };
  // "that nonland permanent card" (stage P33, D-150): a card an earlier instruction named, whatever the words before "card" say of it.
  if (/^that (?:[\p{L}-]+ )+card$/u.test(word)) return { kind: 'single', type: null };
  if (word === 'it' || word === 'her' || word === 'him' || word === 'she' || word === 'he')
    return { kind: 'single', type: null };
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

  /**
   * The permanent an Aura or an Equipment enchants or equips when the intervening "if" of its triggered ability named it ("if enchanted creature is untapped, tap it", D-520,
   * CR 603.4, 303.4b): "it" of the body is that permanent, which the engine names `attached`, as "tap enchanted creature" is.
   */
  seedHost(condition: IrCondition | undefined): void {
    const test = condition?.test;
    // "Whenever you cast an instant or sorcery spell, if ~ has fewer than three charge counters on it, put a charge counter on it." (CR 603.4, 122.1): the permanent the intervening
    // "if" counts counters on is what "it" of the body means, not the spell of the trigger.
    if (test?.kind === 'amountIs' && test.amount.kind === 'countersOn') {
      if (test.amount.of.det === 'self') {
        this.antecedents.push({ noun: { ...test.amount.of, ref: 'self' }, kind: 'object' });
      }
      return;
    }
    if (test?.kind !== 'attachedTo' || test.via === undefined) return;
    const host: IrNoun = {
      kind: 'noun',
      det: test.via,
      filter: { types: ['creature'], raw: `${test.via} creature` },
      upTo: false,
      plural: false,
      other: false,
      span: condition?.span ?? { start: 0, end: 0 },
      rule: condition?.rule ?? 'condition.host-is-tapped',
      ref: 'host',
    };
    this.antecedents.push({ noun: host, kind: 'object' });
  }

  /**
   * The permanent an intervening "if" of a triggered ability says things of by `~` ("if ~ has no charge counters on it, return it to its owner's hand", CR 603.4): the
   * "it" of the body is that permanent, as for a cost that names `~`. Read only for a trigger that has no subject of its own ("at the beginning of your upkeep"), which
   * leaves "it" nothing else to mean, and only where the condition counts the counters of `~`.
   */
  seedSelfCondition(trigger: IrTrigger, condition: IrCondition | undefined): void {
    const test = condition?.test;
    if (trigger.subject !== undefined) return;
    // "At the beginning of the end step, if three or more cards have been exiled with ~, sacrifice it." (Colfenor's Urn, CR 603.4, 607.2a): the permanent whose linked exile the "if" counts.
    if (condition !== undefined && test?.kind === 'cardsExiledWithSelf') {
      this.seed(selfNoun(condition), 'triggerSubject', true);
      return;
    }
    if (test?.kind !== 'amountIs') return;
    if (test.amount.kind !== 'countersOn' || test.amount.of.det !== 'self') return;
    this.seed(test.amount.of, 'triggerSubject', true);
  }

  /** The creatures of an attack batch trigger, the antecedent of "those creatures" of its body (Frontier Warmonger, CR 603.2c). */
  seedAttackers(trigger: IrTrigger): void {
    this.antecedents.push({
      noun: {
        kind: 'noun',
        det: 'each',
        filter: { raw: 'those creatures', types: ['creature'] },
        upTo: false,
        plural: true,
        other: false,
        span: trigger.span,
        rule: trigger.rule,
        ref: ATTACKERS_REF,
      },
      kind: 'object',
    });
  }

  /** The controller of the permanent a death trigger is about, as an antecedent of "that player" (CR 603.10a). */
  seedControllerOfSubject(subject: IrNoun): void {
    this.antecedents.push({
      noun: {
        kind: 'noun',
        det: 'triggerActor',
        filter: { raw: 'that player' },
        upTo: false,
        plural: false,
        other: false,
        span: subject.span,
        rule: subject.rule,
        ref: 'trigActor',
      },
      kind: 'player',
    });
  }

  /** The last group of "each" objects this binder met, which a later spell line may name as "those creatures" (CR 608.2c). */
  lastGroupNoun(): IrNoun | undefined {
    return [...this.antecedents]
      .reverse()
      .find(
        (a) =>
          a.kind === 'object' &&
          a.previousLine !== true &&
          a.tokens !== true &&
          a.noun.det === 'each' &&
          /^m\d+$/u.test(a.noun.ref ?? ''),
      )?.noun;
  }

  /** The group the spell line before this one named, the antecedent of a "those creatures" of this line and of no other pronoun (CR 608.2c). */
  seedGroupLine(noun: IrNoun): void {
    this.antecedents.push({ noun, kind: 'object', previousLine: true, groupLine: true });
    // The refs of this line's own mentions go on from the one carried, so no ref of this line is the same as the group's.
    const n = /^m(\d+)$/u.exec(noun.ref ?? '');
    if (n !== null) this.mentionCount = Math.max(this.mentionCount, Number(n[1]));
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
  /**
   * The sentence being bound offers to cast "it" for free ("If it's a nonland card, you may cast it without paying its mana cost", Mind's Dilation): "it" is then the one card the exile of
   * the top card before it took (`thatCardOnly` otherwise keeps "it" away from that card), which the engine names `moved`.
   */
  private sentenceCastsIt = false;

  private resolveAnaphor(noun: IrNoun): IrNoun {
    // "for each card in their graveyard" (Guiltfeeder): "their" is the player of the instruction, which the lowering of that instruction names; the binding pass has nothing to say of it.
    if (noun.rule === 'noun.their-zone') return noun;
    const pronoun = classify(noun.filter.raw);
    const recent = [...this.antecedents].reverse();
    let found: Antecedent | undefined;
    switch (pronoun?.kind) {
      case 'player':
        // Oracle "they" may refer to the most recent plural object group instead of a player.
        if (/^they$/iu.test(noun.filter.raw.trim())) {
          const pluralIndex = recent.findIndex(
            (a) => a.kind === 'object' && a.noun.plural && a.groupLine !== true,
          );
          const playerIndex = recent.findIndex((a) => a.kind === 'player');
          if (pluralIndex >= 0 && (playerIndex < 0 || pluralIndex < playerIndex)) {
            found = recent[pluralIndex];
            break;
          }
        }
        // A player the text never says ("Draw a card": you, implied, no words) cannot be what "that
        // player" or "they" points back to (stage P18).
        // Stage P52 (D-210): after a sentence that asks a player ("target opponent may have you draw three cards. If the player doesn't, you mill three cards,
        // then ~ deals damage to that player"), "that player" points past the "you" before it, to the player asked.
        found = recent.find(
          (a) =>
            a.kind === 'player' &&
            a.noun.filter.raw !== '' &&
            // Cavern-Hoard Dragon (CR 603.2c): "Whenever ~ deals combat damage to a player, you create a Treasure token for each artifact that player controls": in a counting phrase of a trigger about a
            // player, "that player" is that player and never the "you" of the sentence.
            !(
              (this.playerAsked ||
                // Thieving Amalgam (CR 701.40a): "you manifest the top card of that player's library": the library is another player's, never the subject's.
                this.clauseVerb === 'manifest' ||
                (this.inAmount && this.antecedents.some((x) => x.noun.ref === 'trigActor'))) &&
              a.noun.det === 'you' &&
              /^that (?:player|opponent)$/iu.test(noun.filter.raw.trim())
            ),
        );
        break;
      case 'plural':
        // Issue 160 (D-627, CR 608.2c): "Put a +1/+1 counter on each creature you control. Those creatures gain vigilance": the group "each creature" named, which the
        // singular wording of "each" does not mark as plural. Only "those creatures" says so ("them" after an "each" stays unbound).
        found = recent.find(
          (a) =>
            a.kind === 'object' &&
            (a.groupLine !== true || /^those /iu.test(noun.filter.raw.trim())) &&
            (a.tokens !== true || pronoun.each === true) &&
            (a.noun.plural ||
              (a.noun.det === 'each' && /^(?:each of )?those /iu.test(noun.filter.raw.trim()))),
        );
        break;
      case 'other':
        found = recent.find((a) => a.noun.count?.kind === 'number' && a.noun.count.value === 2);
        break;
      case 'single':
        found = recent.find(
          (a) =>
            a.kind === 'object' &&
            // "That token" means a token an instruction made and nothing else does (stage P48, D-205).
            (pronoun.type === 'token'
              ? a.token === true
              : a.token !== true ||
                (a.itToken === true && /^it$/iu.test(noun.filter.raw.trim())) ||
                (this.clauseVerb === 'addCounters' &&
                  a.plainToken === true &&
                  /^it$/iu.test(noun.filter.raw.trim())) ||
                (a.itTokenGains === true &&
                  this.clauseVerb === 'grantKeyword' &&
                  /^it$/iu.test(noun.filter.raw.trim()))) &&
            (a.selfIt !== true || /^its?$/iu.test(noun.filter.raw.trim())) &&
            (a.thatCardOnly !== true ||
              /^that card$/iu.test(noun.filter.raw.trim()) ||
              (this.sentenceCastsIt &&
                a.noun.ref === 'moved' &&
                /^it$/iu.test(noun.filter.raw.trim()))) &&
            (a.previousLine !== true || /^that /iu.test(noun.filter.raw)) &&
            a.groupLine !== true &&
            !a.noun.plural &&
            compatible(a.noun.filter, pronoun.type) &&
            (pronoun.youControl !== true || a.noun.filter.controller === 'you'),
        );
        // Uglúk of the White Hand (CR 608.2c, 603.10a): "Whenever another creature you control dies, put a +1/+1 counter on ~. If that creature was a Goblin or Orc, ...": the
        // source is named by "~", never by "that creature", which is the object the trigger is about (the creature that died), even when "~" was mentioned after it.
        if (
          found?.noun.ref === 'self' &&
          /^that (?:creature|permanent)$/iu.test(noun.filter.raw.trim())
        ) {
          found =
            recent.find(
              (a) =>
                a.kind === 'object' &&
                a.token !== true &&
                a.noun.ref === 'trig' &&
                !a.noun.plural &&
                compatible(a.noun.filter, pronoun.type),
            ) ?? found;
        }
        // Hero's Blade (CR 701.3): "attach ~ to it" where the sentence made no token: "it" is the object the trigger is about.
        if (found === undefined && noun.itWord === true) {
          found = recent.find(
            (a) =>
              a.kind === 'object' &&
              a.token !== true &&
              // Limit Break deck, group 1: "When ~ enters, attach up to one target Equipment you control to it": "it" is the permanent with the ability (`self`).
              (a.noun.ref === 'trig' || a.noun.ref === 'self'),
          );
        }
        break;
      default:
        break;
    }
    if (found === undefined) {
      this.fail(noun);
      return noun;
    }
    const antecedent = found.noun;
    // CR 608.2c (Unbreakable Formation): "those creatures" of a line after the one that named the group select the same objects again, so the pronoun becomes the group's
    // own noun, and is the antecedent of what follows it in this line.
    if (found.groupLine === true) {
      this.mentionCount += 1;
      const again: IrNoun = {
        ...antecedent,
        span: noun.span,
        rule: noun.rule,
        ref: `m${this.mentionCount}`,
      };
      this.antecedents.push({ noun: again, kind: 'object' });
      return again;
    }
    // "Tap enchanted creature and remove all counters from it" (stage P50, D-207): "it" is the permanent the Aura or Equipment is attached to, which the
    // engine names `attached`, so the pronoun takes the words of its antecedent.
    if (antecedent.det === 'enchanted' || antecedent.det === 'equipped') {
      return { ...noun, det: antecedent.det, filter: antecedent.filter };
    }
    // "Draw cards equal to the sacrificed creature's toughness, then discard cards equal to its power" (CR 608.2h, 602.2c): "its" is the permanent the cost sacrificed, which the
    // engine names `sacrificedCost`, so the pronoun takes the determiner of its antecedent.
    if (antecedent.det === 'sacrificed') return { ...noun, det: 'sacrificed' };
    if (antecedent.ref === 'trig') return { ...noun, det: 'triggerSubject', ref: 'trig' };
    if (antecedent.ref === 'trigActor') return { ...noun, det: 'triggerActor', ref: 'trigActor' };
    const ref = pronoun?.kind === 'other' ? `${antecedent.ref ?? ''}.2` : antecedent.ref;
    return ref === undefined ? { ...noun } : { ...noun, ref };
  }

  /**
   * "When enchanted creature dies, if that creature was a Horror, ..." (Endless Evil, CR 603.4, 603.10a, 113.7a): the intervening "if" of a trigger that says "it" or "that creature"
   * of an object (`objectMatches`) is about what the trigger is about. For a death or leaves-the-battlefield trigger of an Aura's or Equipment's host that is the permanent as it last
   * was (`triggerSubject`, last-known information), not the host read from the attachment, which is gone once the permanent has left.
   */
  interveningObject(
    trigger: IrTrigger,
    condition: IrCondition | undefined,
  ): IrCondition | undefined {
    const test = condition?.test;
    if (condition === undefined || test?.kind !== 'objectMatches') return condition;
    // "When ~ dies, if it was a creature, ..." (Enduring Tenacity): "it" is the card itself, which the lowering reads as `thisMatches`, not a permanent the event is about.
    if (trigger.subject?.det === 'self') return condition;
    const who = this.noun(test.who);
    const hostLeft =
      (trigger.event === 'dies' || trigger.event === 'leavesBattlefield') &&
      (trigger.subject?.det === 'enchanted' || trigger.subject?.det === 'equipped');
    const bound: IrNoun =
      hostLeft && (who.det === 'enchanted' || who.det === 'equipped')
        ? { ...who, det: 'triggerSubject', ref: 'trig' }
        : who;
    return { ...condition, test: { ...test, who: bound } };
  }

  noun(noun: IrNoun): IrNoun {
    const seen = this.byKey.get(key(noun.span));
    if (seen !== undefined) return seen;
    // "with mana value less than or equal to the number of counters on that creature" (Puca's Covenant): "that creature" is the permanent the trigger is about, not this target card, so
    // the target is numbered with the others, after the amount is bound.
    const ownTargetRef =
      noun.det === 'target' &&
      noun.filter.manaValueAtMostAmount !== undefined &&
      noun.filter.manaValueAtMostAmount.kind !== 'countersOn'
        ? `t${++this.scope.targetCount}`
        : undefined;
    if (ownTargetRef !== undefined) {
      const target = { ...noun, ref: ownTargetRef };
      this.targets.push(target);
      this.antecedents.push({ noun: target, kind: isPlayerNoun(target) ? 'player' : 'object' });
    }
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
    const bareFilter =
      typeof controller === 'object'
        ? {
            ...noun.filter,
            controller: { ...controller, noun: this.noun(controller.noun) },
            ...(noun.filter.manaValueAtMostAmount === undefined
              ? {}
              : { manaValueAtMostAmount: this.amount(noun.filter.manaValueAtMostAmount) }),
          }
        : noun.filter.manaValueAtMostAmount === undefined
          ? noun.filter
          : {
              ...noun.filter,
              manaValueAtMostAmount: this.amount(noun.filter.manaValueAtMostAmount),
            };
    // "with power greater than target creature's power": the target it names is numbered with the others of the text.
    const powerNoun = noun.filter.powerGreaterThanNoun;
    const filter =
      powerNoun === undefined
        ? bareFilter
        : { ...bareFilter, powerGreaterThanNoun: this.noun(powerNoun) };
    // "target creature card and all other cards with the same name as that card": the target is numbered with the others of the text.
    const nameNoun = noun.filter.sameNameAsNoun;
    const named =
      nameNoun === undefined ? filter : { ...filter, sameNameAsNoun: this.noun(nameNoun) };
    let out: IrNoun = {
      ...noun,
      filter: named,
      ...(of === undefined ? {} : { of }),
      ...(members === undefined ? {} : { members }),
    };
    if (noun.det === 'anaphor') {
      out = this.resolveAnaphor(out);
    } else if (noun.det === 'pair' && this.clauseVerb === 'addCounters') {
      // "Tap all creatures your opponents control, then put a stun counter on each of those creatures" (CR 608.2c): counters are put on no soulbond pair, so the words name the group of the
      // instruction before, as "those creatures" does.
      out = this.resolveAnaphor({ ...out, det: 'anaphor', plural: true });
    } else if (noun.det === 'target') {
      const ref = ownTargetRef ?? `t${++this.scope.targetCount}`;
      out = { ...out, ref };
      if (ownTargetRef === undefined) {
        this.targets.push(out);
        this.antecedents.push({ noun: out, kind: isPlayerNoun(out) ? 'player' : 'object' });
      }
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
  /** True while the nouns of an amount are bound ("for each artifact that player controls"). */
  private inAmount = false;

  amount(amount: IrAmount): IrAmount {
    const before = this.inAmount;
    this.inAmount = true;
    try {
      return this.boundAmount(amount);
    } finally {
      this.inAmount = before;
    }
  }

  private boundAmount(amount: IrAmount): IrAmount {
    switch (amount.kind) {
      case 'countOf':
      case 'powerOf':
      case 'manaValueOf':
      case 'colorsOf':
      case 'toughnessOf':
      case 'countersOn':
      case 'aggregate':
      case 'colorsAmong':
      case 'cardTypesAmong':
        return { ...amount, of: this.noun(amount.of) };
      case 'lifeTotalOf':
      case 'damageDealtToThisTurn':
      case 'greatestCountOfAnOpponent':
        return { ...amount, of: this.noun(amount.of) };
      case 'commanderCasts':
        // CR 903.8: "target player draws ... for each time they've cast a commander": the player is the one the text named before.
        return amount.player === undefined
          ? amount
          : { ...amount, player: this.noun(amount.player) };
      case 'half':
      case 'multiple':
      case 'minus':
        return { ...amount, of: this.amount(amount.of) };
      case 'difference':
      case 'extreme':
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
        // D-643 (Prismari group 1): the permanent a copy is made of is bound first, so that "it" of "a token that's a copy of it" is not the token itself; then a token that is a
        // copy is the token "that token" follows, as any other token of one ("Create a token that's a copy of target creature you control. That token gains haste until end of turn.").
        const copyOf = arg.copyOf === undefined ? undefined : this.noun(arg.copyOf);
        const made = count.kind === 'number' && count.value === 1;
        // Several tokens: a number above one, or a count read as the effect resolves (X, "a number of"); "each of them" of the sentence after is all of them.
        const several = !made && !(count.kind === 'number' && count.value < 1);
        if (made || several) this.tokenCount += 1;
        const ref = made || several ? `tk${this.tokenCount}` : undefined;
        if (ref !== undefined && several && arg.copyOf === undefined) {
          this.antecedents.push({
            kind: 'object',
            token: true,
            tokens: true,
            noun: {
              kind: 'noun',
              det: 'a',
              filter: { raw: 'tokens' },
              upTo: false,
              plural: true,
              other: false,
              span: arg.span,
              rule: arg.rule,
              ref,
            },
          });
        }
        if (made && ref !== undefined) {
          // "Create a 2/2 red Dwarf creature token, then attach ~ to it" / "That token gains haste": the token is what "that token" follows.
          this.antecedents.push({
            kind: 'object',
            token: true,
            // "Create a 0/0 ... Fractal creature token. Put X +1/+1 counters on it." (Quandrix Unlimited deck, group G): a 0/0 token dies without counters, so "it" of the next sentence is it.
            ...(arg.copyExcept === undefined && !(arg.power === 0 && arg.toughness === 0)
              ? {}
              : { itToken: true as const }),
            plainToken: true as const,
            // Issue 100 (Baral and Kari Zev): "Create First Mate Ragavan, a legendary 2/1 red Monkey Pirate creature token. It gains haste until end of turn.": the "it" that
            // GAINS something (the subject of a keyword grant) after the creation of a creature token with a power and toughness of its own is that token. An "it" that is the object
            // of another verb ("create a 2/2 token. If that enchantment is an Aura, you may attach it to the token") is still the permanent the text is about.
            ...(arg.copyOf === undefined &&
            arg.predefined === undefined &&
            arg.power !== undefined &&
            arg.toughness !== undefined
              ? { itTokenGains: true as const }
              : {}),
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
          ...(copyOf === undefined ? {} : { copyOf }),
        };
      }
      case 'costList':
        // "you may pay X life, where X is that spell's mana value" (G'raha Tia, CR 107.3c): the amount that defines X is bound like the one of a "where" of a sentence.
        return {
          ...arg,
          costs: arg.costs.map((cost) =>
            (cost.kind === 'payLife' && cost.definesX === true) || cost.kind === 'energyAmount'
              ? { ...cost, amount: this.amount(cost.amount) }
              : cost,
          ),
        };
      default:
        return arg;
    }
  }

  /** The verb of the clause being bound: only the "it" of a keyword grant (issue 100) or of a counters clause (Quandrix Unlimited group E, `Antecedent.plainToken`) may mean the token a creature-token instruction made. */
  private clauseVerb = '';

  clause(clause: IrClause): IrClause {
    this.clauseVerb = clause.verb;
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
    // CR 701.20a, 701.13, 608.2c: the card "Reveal the top card of your library" or "Exile the top card of your library" took is what "that card" of a later instruction names, the
    // engine's `moved`. Only one card: "the top two cards" has no "that card".
    const takesOneTopCard =
      clause.verb === 'revealTopCard' ||
      (clause.verb === 'exileTop' &&
        clause.args.count?.kind === 'number' &&
        clause.args.count.value === 1);
    for (const [name, value] of entries) {
      const seen = this.antecedents.length;
      args[name] = this.arg(value);
      // D-406: "Whenever a creature enters, you may attach ~ to that creature": the Aura or Equipment an attach moves is no antecedent of the pronoun after
      // it, which names the other permanent (the trigger's).
      if (clause.verb === 'attach' && name === 'object') this.antecedents.length = seen;
      // Limit Break deck, group 1 (Zack Fair): "Put ~'s counters on that creature": the permanent whose counters are put is no antecedent of "that creature", the target before it.
      if (
        (clause.verb === 'putCountersOf' || clause.verb === 'attachWasAttached') &&
        name === 'from'
      ) {
        this.antecedents.length = seen;
      }
      // Issue 103: "Whenever a Dragon you control enters, you may have ~ become a copy of it": the permanent that becomes the copy is no antecedent of "it", which is the trigger's.
      if (
        clause.verb === 'becomeCopy' &&
        name === 'objects' &&
        value.kind === 'noun' &&
        value.det === 'self'
      ) {
        this.antecedents.length = seen;
      }
    }
    // "unless that player pays {1}" (stage P18): the player who pays follows the clause's own nouns.
    const test = clause.condition?.test;
    const condition =
      clause.condition !== undefined &&
      (test?.kind === 'unlessPays' ||
        test?.kind === 'diesThisWay' ||
        test?.kind === 'objectMatches' ||
        test?.kind === 'controlsThat' ||
        test?.kind === 'manaValueAtMostAmount' ||
        test?.kind === 'manaValueAtLeastAmount')
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
    // CR 608.2d, 102.2 (Sylvan Offering): "Choose an opponent. You and that player each create ...": the player the controller chose is what "that player" of the sentences after the
    // choice means, which the engine names `chosenPlayer`. Each new choice replaces the one before it.
    if (clause.verb === 'chooseOpponent' || clause.verb === 'choosePlayer') {
      this.antecedents.push({
        kind: 'player',
        noun: {
          kind: 'noun',
          det: 'anaphor',
          filter: { raw: 'chosen player' },
          upTo: false,
          plural: false,
          other: false,
          span: clause.span,
          rule: clause.rule,
          ref: 'chosen',
        },
      });
    }
    // Issue 104: "you may exile a creature card from your graveyard. If you do, create a token that's a copy of that card": "that card" is the card the exile moved, which the engine
    // names `moved`. Pushed after the clause's own noun, so that it is the most recent object of the text.
    // Chandra, Legacy of Fire: "Exile that many cards from the top of your library. You may play them this turn": "them" are the cards the exile moved (the engine's `moved`).
    if (clause.verb === 'exileTopThatMany') {
      this.antecedents.push({
        kind: 'object',
        noun: {
          kind: 'noun',
          det: 'a',
          filter: { raw: 'cards' },
          upTo: false,
          plural: true,
          other: false,
          span: clause.span,
          rule: clause.rule,
          ref: 'moved',
        },
      });
    }
    // Experimental Lab (CR 701.62a, 400.7j): "Manifest dread, then put two +1/+1 counters ... on that creature": "that creature" is the creature manifest dread manifested, which the
    // engine names `moved`. Pushed after the clause's own nouns, so that it is the most recent object of the text.
    if (clause.verb === 'manifestDread' || clause.verb === 'manifestDreadTwice') {
      this.antecedents.push({
        kind: 'object',
        noun: {
          kind: 'noun',
          det: 'a',
          filter: { raw: 'creature', types: ['creature'] },
          upTo: false,
          plural: false,
          other: false,
          span: clause.span,
          rule: clause.rule,
          ref: 'moved',
        },
      });
    }
    if (clause.verb === 'exileChosenCard') {
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
    // "... exiles a card from their hand at random. If it's a land card, you may put it onto the battlefield" (D-393, group 9): "it" is the card the instruction exiled,
    // which the engine names `moved`. Pushed after the clause's own nouns, so that it is the most recent object of the text.
    // Death Toll deck group B: "Choose a card at random in your graveyard. If it's a creature card, put it onto the battlefield": "it" is the card picked, which the engine names `moved` too.
    if (clause.verb === 'exileRandomFromHand' || clause.verb === 'chooseRandomGraveyardCard') {
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
    // CR 701.9, 603.12 (Summon: Kujata): "Discard a card, then draw two cards. When you discard a card this way, ~ deals damage equal to that card's mana value": "that card" is the one card the
    // discard made the player discard, which the engine's `thisWay` `discardedValue` counts (`ref` 'discarded': only the lowering of the reflexive ability reads it).
    if (
      // Narset of the Ancient Way: "then you may discard a card" is the same one discard, offered.
      clause.verb === 'discardMayOne' ||
      (clause.verb === 'discard' &&
        clause.args.amount?.kind === 'number' &&
        clause.args.amount.value === 1 &&
        clause.args.random === undefined &&
        clause.args.unless === undefined)
    ) {
      this.antecedents.push({
        kind: 'object',
        thatCardOnly: true,
        noun: {
          kind: 'noun',
          det: 'a',
          filter: { raw: 'card' },
          upTo: false,
          plural: false,
          other: false,
          span: clause.span,
          rule: clause.rule,
          ref: 'discarded',
        },
      });
    }
    if (takesOneTopCard) {
      this.antecedents.push({
        kind: 'object',
        thatCardOnly: true,
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
        this.sentenceCastsIt = s.clauses.some((c) => c.verb === 'castMovedFree');
        // "If it's a Zombie card, ...": the pronoun of the condition (stage P30) comes before the clauses of its sentence.
        const test = s.condition?.test;
        const condition =
          s.condition !== undefined &&
          (test?.kind === 'objectMatches' ||
            test?.kind === 'diesThisWay' ||
            test?.kind === 'controlsThat' ||
            test?.kind === 'manaValueAtMostAmount' ||
            test?.kind === 'manaValueAtLeastAmount')
            ? { ...s.condition, test: { ...test, who: this.noun(test.who) } }
            : // "Then if she has nine or more time counters on her, ..." (Kes, CR 122.1): the pronoun of the count is the permanent the sentences before it named.
              s.condition !== undefined &&
                test?.kind === 'amountIs' &&
                test.amount.kind === 'countersOn' &&
                test.amount.of.det === 'anaphor'
              ? { ...s.condition, test: { ...test, amount: this.amount(test.amount) } }
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
        const clauses = s.clauses.map((c) => withThoseCounters(this.clause(c), condition));
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

/**
 * "Then if there are three or more ribbon counters on ~, remove those counters" (Prize Pig, CR 122.1, 608.2c): "those counters" are the counters of the kind the condition of the
 * sentence counted, so the clause gets that kind. A sentence whose condition counts no counters on the permanent leaves the clause as it is, which the lowering refuses.
 */
function withThoseCounters(clause: IrClause, condition: IrCondition | undefined): IrClause {
  const test = condition?.test;
  if (clause.verb !== 'removeThoseCounters') return clause;
  if (test?.kind !== 'amountIs' || test.amount.kind !== 'countersOn') return clause;
  if (test.amount.of.det !== 'self' || test.amount.counter === undefined) return clause;
  const counter: IrArg = {
    kind: 'counterSpec',
    name: test.amount.counter,
    span: test.amount.span,
    rule: clause.rule,
  };
  return { ...clause, args: { ...clause.args, counter } };
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
  // Issue 345 (CR 122.6): counters are put on a permanent on the battlefield, so "it" is still the permanent (Claim the Kingdom: "sacrifice it").
  'countersAdded',
  // CR 701.37: the permanent has just become monstrous, and is on the battlefield.
  'becomesMonstrous',
  // CR 701.40b, 708.8: the permanent has just been turned face up, and is on the battlefield.
  'turnedFaceUp',
  // The creature has just been declared a blocker, or has just become blocked (stage P21, CR 509.3).
  'blocks',
  'becomesBlocked',
  'becomesUnblocked',
  // The source deals the damage on the battlefield (stage P18, D-111).
  'dealsCombatDamage',
  'dealsDamage',
  // A state of the permanent itself, which is on the battlefield while the state holds (stage P31, CR 603.8).
  'state',
  // D-448 (CR 603.2): the permanent that became the target of a spell is still on the battlefield, and "it" of "Whenever ~ attacks, blocks, or becomes the target of a spell, it deals
  // damage ..." is that permanent (the spell is "that spell").
  'becomesTarget',
  // CR 702.29c: "When you cycle this card, it deals X damage ...": the card that was cycled is the card with the ability, which works from the graveyard it was discarded to and has
  // no other subject, so "it" is `~` (the engine's `cycled` trigger has no subject object).
  'cycled',
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

/** The reference of "those creatures" of an attack batch trigger that counts only the creatures attacking your opponents (Frontier Warmonger, CR 603.2c): the creatures that attacked them. */
export const ATTACKERS_REF = 'trigAttackers';

/** Seeds a trigger's subject, actor and recipient as the first antecedents of whatever follows. */
function seedTrigger(binder: Binder, source: IrTrigger): IrTrigger {
  if (source.event === 'attackBatch' && source.attackingYourOpponents === true) {
    binder.seedAttackers(source);
  }
  // CR 508.6 (Firkraag): "that player" of "attack an opponent" is the opponent attacked.
  if (source.event === 'attackBatch' && source.eachAttackedOpponent === true) {
    binder.seedControllerOfSubject({
      kind: 'noun',
      det: 'a',
      filter: { raw: '' },
      upTo: false,
      plural: false,
      other: false,
      span: source.span,
      rule: source.rule,
    });
  }
  const subject = binder.seed(source.subject, 'triggerSubject', aboutSelf(source));
  const actor = binder.seed(source.actor, 'triggerActor');
  // The player a creature dealt combat damage to is the antecedent of "that player" (stage P18).
  const recipient = binder.seed(source.recipient, 'triggerActor');
  // CR 603.10a, 400.7: "Whenever a creature an opponent controls dies, that player loses 2 life": the player of a death trigger is the controller of the
  // permanent that died (last known information), so "that player" has an antecedent. A text that says no such pronoun is unchanged.
  if (
    (source.event === 'dies' ||
      source.event === 'leavesBattlefield' ||
      source.event === 'enters') &&
    source.alternatives === undefined &&
    subject !== undefined &&
    subject.det !== 'self' &&
    actor === undefined
  ) {
    binder.seedControllerOfSubject(subject);
  }
  // Exit from Exile deck (Bonecrusher Giant, CR 603.2): "that spell's controller" of "Whenever ~ becomes the target of a spell": the player of the event, the controller of the spell or ability that targeted.
  if (
    source.event === 'becomesTarget' &&
    source.alternatives === undefined &&
    subject !== undefined &&
    actor === undefined
  ) {
    binder.seedControllerOfSubject(subject);
  }
  // CR 508.6 (Calculating Lich): "Whenever a creature attacks one of your opponents, that player loses 1 life": "that player" is the opponent attacked (the lowering reads it
  // as the engine's `triggerAttackedPlayer`).
  if (source.event === 'attacks' && source.at === 'opponent' && subject !== undefined) {
    binder.seedControllerOfSubject(subject);
  }
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
      if (scope.lastGroup !== undefined) binder.seedGroupLine(scope.lastGroup);
      const body = binder.body(ability.body);
      const last = binder.targets[binder.targets.length - 1];
      if (last !== undefined && !last.plural && !isPlayerNoun(last)) scope.lastTarget = last;
      const group = binder.lastGroupNoun();
      if (group !== undefined) scope.lastGroup = group;
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
      binder.seedHost(ability.interveningIf);
      binder.seedSelfCondition(ability.trigger, ability.interveningIf);
      const interveningIf = binder.interveningObject(ability.trigger, ability.interveningIf);
      // "At the beginning of your upkeep, if ~ has one or more +1/+1 counters on it, you may remove a +1/+1 counter from it." (Quandrix Unlimited deck, group G): the
      // permanent the intervening "if" names is what "it" means in the body, when the trigger has no subject of its own.
      const tested = ability.interveningIf;
      if (
        tested?.test.kind === 'thisMatches' &&
        tested.test.who === 'self' &&
        ability.trigger.subject === undefined
      ) {
        binder.seed(selfNoun(tested), 'triggerSubject', true);
      }
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
      if (ability.reflexiveModal !== undefined) {
        // D-511 (CR 603.12): the body is the offer; the modes are those of the reflexive ability, which knows what the trigger's event is about, nothing of the offer.
        const body = binder.body(ability.body);
        const modal = bindModes(ability.reflexiveModal, scope, verbs, (b) =>
          seedTrigger(b, ability.trigger),
        );
        if (!modal.ok) return modal.failure;
        if (binder.failure !== null) return binder.failure;
        return {
          ok: true,
          ability: { ...ability, trigger, body, reflexiveModal: modal.modes },
          targets: [...binder.targets, ...modal.targets],
        };
      }
      return done({
        ...ability,
        trigger,
        ...(interveningIf === undefined ? {} : { interveningIf }),
        body: binder.body(ability.body),
      });
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
