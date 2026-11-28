/**
 * Effect rules of group F of the Federation Fleet deck (exile, time counters, the command zone and a free cast):
 *
 * - `effect.creatures-cant-attack-you`: "Until your next turn, creatures can't attack you." (Chronomantic Escape).
 * - `effect.return-those-delayed`: "Return those cards to the battlefield under their owner's control at the beginning of the next end step." (Temporal Tribulation).
 * - `effect.put-your-commander-into-hand`: "Put your commander into your hand from the command zone." (Command Beacon).
 * - `effect.choose-up-to-two-targets` and `effect.for-each-of-them-reselect-attack`: "Choose up to two target attacking creatures. For each of them, you may reselect which player or
 *   permanent that creature is attacking." (Tuvok, Chief Tactical Officer).
 * - `effect.opponent-casts-free-you-copy`: "Target opponent whose turn it is may cast a spell from their hand without paying its mana cost. If they do, you copy that spell. You may choose
 *   new targets for the copy. If they don't, you draw a card." (Cmdr. Troi, Outgoing Empath). The four sentences are kept together by the segmenter (`segment.ts`).
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrDuration, IrNoun, IrZoneSpec } from '../../ir/types';
import { defineRule, family, quietly, spanned } from '../registry';
import { type Clauses, makeClause, operands, single } from './operands';

const END = '(?![\\p{L}\\p{N}])';

/**
 * `effect.creatures-cant-attack-you`: "until your next turn, creatures can't attack you" (CR 508.1a: a creature that can't attack a player is not declared attacking them; CR 611.2a and
 * 611.2c: the effect of a spell lasts for its duration and, as a rule of the game, reaches creatures that arrive later; CR 500.1: "your next turn" begins after the turn it resolves in).
 * The engine's `creaturesCantAttackYou` of all creatures, whoever controls them, until the controller's next turn begins. Not read: another duration, a group (a controller, a type, "other"),
 * "or planeswalkers you control", an exception ("unless"), another verb.
 */
export const EFFECT_CREATURES_CANT_ATTACK_YOU = defineRule<Clauses>({
  id: 'effect.creatures-cant-attack-you',
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 508.1a (Declare Attackers Step)',
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 500.1 (Beginning Phase)',
  ],
  examples: [
    "until your next turn, creatures can't attack you",
    'until your next turn, creatures can’t attack you',
    "Until your next turn, creatures can't attack you",
  ],
  rejects: [
    "creatures can't attack you",
    "until end of turn, creatures can't attack you",
    "until your next turn, creatures can't attack you or planeswalkers you control",
    "until your next turn, creatures your opponents control can't attack you",
    "until your next turn, other creatures can't attack you",
    "until your next turn, target creature can't attack you",
    "until your next turn, artifacts can't attack you",
    "until your next turn, creatures can't attack you unless their controller pays {2}",
    "until your next turn, creatures can't attack you and you draw a card",
    "until your next turn, creature can't attack you",
    "until your next turn, creatures can't block you",
    "until the end of your next turn, creatures can't attack you",
  ],
  parse: single(
    'effect.creatures-cant-attack-you',
    (ctx, pos) => {
      const lead = spanned(pattern(/until your next turn, /iu))(ctx, pos);
      if (!lead.ok) return lead;
      const subject = family<IrNoun>('noun', { only: ['noun.plain-permanents'] })(ctx, lead.pos);
      if (!subject.ok) return subject;
      const noun = subject.value;
      // "Creatures" and nothing else about them: no controller, no other quality (the restriction reads the creatures of every player as attackers are declared).
      const f = noun.filter;
      const onlyCreatures =
        noun.plural &&
        noun.det === 'each' &&
        !noun.other &&
        f.anyOf === undefined &&
        f.subtypes === undefined &&
        f.controller === undefined &&
        f.types?.length === 1 &&
        f.types[0] === 'creature';
      if (!onlyCreatures) return fail(ctx, lead.pos);
      const words = spanned(
        pattern(new RegExp(`\\s+can['’]t attack you${END}(?!\\s+(?:or|unless|and)\\b)`, 'iu')),
      )(ctx, subject.pos);
      if (!words.ok) return words;
      return {
        ok: true,
        value: { noun, span: { start: pos, end: words.pos } },
        pos: words.pos,
      };
    },
    ({ noun, span }) => {
      const duration: IrDuration = {
        kind: 'duration',
        scope: 'untilYourNextTurn',
        span,
        rule: 'effect.creatures-cant-attack-you',
      };
      return { verb: 'creaturesCantAttackYou', args: { objects: noun }, duration };
    },
  ),
});

/**
 * `effect.return-those-delayed`: "return those cards to the battlefield under their owner's control at the beginning of the next end step" (CR 603.7, 603.7c, 400.7j, 110.2: the cards the
 * instruction before exiled ("Exile two target permanents you control."), brought back by a delayed triggered ability the instruction creates, each under its owner's control). "Those cards"
 * is the group the sentence before named, read by the binding pass like "them"; the lowering reads it as the cards an exile of the same text moved (`effect.return-delayed`'s lowering) and
 * refuses it after anything else. Not read: another pronoun ("it", "them", "those creatures"), no control, "under your control", another time, a tapped return, a trailing clause.
 */
export const EFFECT_RETURN_THOSE_DELAYED = defineRule<Clauses>({
  id: 'effect.return-those-delayed',
  family: 'effect',
  leading: ['return'],
  cites: [
    'CR 603.7 (Handling Triggered Abilities)',
    'CR 603.7c (Handling Triggered Abilities)',
    'CR 400.7j (General)',
    'CR 110.2 (Permanents)',
  ],
  examples: [
    "return those cards to the battlefield under their owner's control at the beginning of the next end step",
    'return those cards to the battlefield under their owner’s control at the beginning of the next end step',
    "return those cards to the battlefield under their owners' control at the beginning of the next end step",
    // Issue 128 (Disorder in the Court): "the exiled cards", returned tapped.
    "return the exiled cards to the battlefield tapped under their owners' control at the beginning of the next end step",
  ],
  rejects: [
    "return those cards to the battlefield under their owner's control",
    'return those cards to the battlefield at the beginning of the next end step',
    'return those cards to the battlefield under your control at the beginning of the next end step',
    "return them to the battlefield under their owner's control at the beginning of the next end step",
    "return those creatures to the battlefield under their owner's control at the beginning of the next end step",
    "return that card to the battlefield under its owner's control at the beginning of the next end step",
    "return those cards to the battlefield under their owner's control at the beginning of your next end step",
    "return those cards to the battlefield under their owner's control at the beginning of the next end step and draw a card",
    "return those cards to their owners' hands at the beginning of the next end step",
  ],
  parse: (ctx, pos) => {
    const id = 'effect.return-those-delayed';
    const r = spanned(
      pattern(
        new RegExp(
          `return (?:those|the exiled) cards to the battlefield (tapped )?under their owners?['’]s? control at the beginning of the next end step${END}(?!\\s+and\\b)`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const objects: IrNoun = {
      kind: 'noun',
      det: 'anaphor',
      // The binding pass reads these words: the plural antecedent, the targets of the exile before it.
      filter: { raw: 'those cards' },
      upTo: false,
      plural: true,
      other: false,
      span: { start: pos + 'return '.length, end: pos + 'return those cards'.length },
      rule: id,
    };
    const to: IrZoneSpec = {
      kind: 'zoneSpec',
      zone: 'battlefield',
      whose: 'owner',
      // Issue 128 (Disorder in the Court, CR 110.5b): "tapped".
      ...(r.value.value[1] === undefined ? {} : { tapped: true as const }),
      span: r.value.span,
      rule: id,
    };
    return {
      ok: true,
      value: [makeClause(id, 'delayedReturn', { objects, to }, r.value.span)],
      pos: r.pos,
    };
  },
});

/**
 * `effect.put-your-commander-into-hand`: "put your commander into your hand from the command zone" (CR 903.3: a commander is a card its owner started the game with as their commander; CR
 * 608.2d: the controller chooses as the effect resolves when they have more than one). The engine's `moveToZone` of a `choose` among the commanders the controller owns in their command
 * zone, to their hand. With no commander there nothing happens. Not read: "you may", another zone, "target", "a commander", "your commanders", another place to put it.
 */
export const EFFECT_PUT_YOUR_COMMANDER_INTO_HAND = defineRule<Clauses>({
  id: 'effect.put-your-commander-into-hand',
  family: 'effect',
  leading: ['put'],
  cites: [
    'CR 903.3 (Commander)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 400.7 (General)',
  ],
  examples: ['put your commander into your hand from the command zone'],
  rejects: [
    'put your commander into your hand',
    'you may put your commander into your hand from the command zone',
    'put your commander onto the battlefield from the command zone',
    'put your commander into your hand from your graveyard',
    'put a commander into your hand from the command zone',
    'put target commander into your hand from the command zone',
    'put your commanders into your hand from the command zone',
    'put your commander into your hand from the command zone and draw a card',
    "put your commander into its owner's hand from the command zone",
  ],
  parse: (ctx, pos) => {
    const id = 'effect.put-your-commander-into-hand';
    const r = spanned(
      pattern(
        new RegExp(
          `put your commander into your hand from the command zone${END}(?!\\s+(?:and|then)\\b)`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const span = r.value.span;
    const objects: IrNoun = {
      kind: 'noun',
      det: 'a',
      filter: { raw: 'your commander', commander: 'yours', card: true },
      upTo: false,
      plural: false,
      other: false,
      span,
      rule: id,
    };
    return {
      ok: true,
      value: [makeClause(id, 'putCommanderToHand', { objects }, span)],
      pos: r.pos,
    };
  },
});

/**
 * `effect.choose-up-to-two-targets`: "choose up to two target attacking creatures" (CR 115.1, 601.2c, 603.3d: the targets are chosen as the ability is put on the stack, and "up to" lets the
 * player choose fewer; the words only name them for the sentences after, which say "them"). The engine's targets of the ability, with no effect of its own, as `effect.choose-target` for one.
 * Not read: another count, one target, "any number", a player, no "target", "choose two target creatures".
 */
export const EFFECT_CHOOSE_UP_TO_TWO_TARGETS = defineRule<Clauses>({
  id: 'effect.choose-up-to-two-targets',
  family: 'effect',
  leading: ['choose'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 601.2c (Casting Spells)',
    'CR 603.3d (Handling Triggered Abilities)',
  ],
  examples: [
    'choose up to two target attacking creatures',
    'choose up to two target creatures',
    'choose up to two target creatures you control',
  ],
  rejects: [
    'choose up to one target creature',
    'choose up to three target creatures',
    'choose two target creatures',
    'choose target creature',
    'choose any number of target creatures',
    'choose up to two creatures',
    'choose up to two target players',
    'choose up to two target attacking creatures and draw a card',
  ],
  parse: single(
    'effect.choose-up-to-two-targets',
    sequence(
      literal('choose '),
      operands(['noun.target-permanent'], 'effect.choose-up-to-two-targets', {
        accept: (noun) =>
          noun.det === 'target' &&
          noun.upTo &&
          noun.plural &&
          noun.count?.kind === 'number' &&
          noun.count.value === 2 &&
          noun.anyNumber === undefined &&
          noun.filter.player === undefined,
        locate: (noun) => noun.span.start,
      }),
    ),
    ([, what]) => ({ verb: 'chooseTarget', args: { what } }),
  ),
});

/**
 * `effect.for-each-of-them-reselect-attack`: "for each of them, you may reselect which player or permanent that creature is attacking" (CR 508.7: an effect may let a player choose again
 * what an attacking creature attacks, among what its controller could have attacked, CR 508.7c; CR 608.2c: "them" are the targets the sentence before chose). The engine's `reselectAttack`
 * of those targets, which asks the controller of the effect for each creature that is attacking (its current target is among the options, so keeping it is the "may" not). Not read: another
 * pronoun, "must", no "may", another creature word, a trailing clause.
 */
export const EFFECT_FOR_EACH_OF_THEM_RESELECT_ATTACK = defineRule<Clauses>({
  id: 'effect.for-each-of-them-reselect-attack',
  family: 'effect',
  leading: ['for'],
  cites: [
    'CR 508.7 (Declare Attackers Step)',
    'CR 508.7c (Declare Attackers Step)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'for each of them, you may reselect which player or permanent that creature is attacking',
    'For each of them, you may reselect which player or permanent that creature is attacking',
  ],
  rejects: [
    'for each of them, reselect which player or permanent that creature is attacking',
    'for each of them, you may reselect which player that creature is attacking',
    'for each of them, you may reselect which player or permanent that creature is attacking and draw a card',
    'for each of those, you may reselect which player or permanent that creature is attacking',
    'for each creature, you may reselect which player or permanent that creature is attacking',
    'for each of them, you may reselect which player or permanent it is attacking',
    'for each of them, you may reselect which player or permanent each creature is attacking',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.for-each-of-them-reselect-attack';
    const r = sequence(
      literal('for '),
      family<IrNoun>('noun', { only: ['noun.each-of-them'] }),
      spanned(
        pattern(
          new RegExp(
            `, you may reselect which player or permanent that creature is attacking${END}(?!\\s+and\\b)`,
            'iu',
          ),
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, objects, tail] = r.value;
    return {
      ok: true,
      value: [
        makeClause(id, 'reselectAttackOfThem', { objects }, { start: pos, end: tail.span.end }),
      ],
      pos: r.pos,
    };
  },
});

/**
 * `effect.opponent-casts-free-you-copy`: "target opponent whose turn it is may cast a spell from their hand without paying its mana cost. If they do, you copy that spell. You may choose new
 * targets for the copy. If they don't, you draw a card" (CR 115.1, 500.1: the target is the opponent who is the active player; CR 608.2g, 118.9: the player casts during the resolution without
 * paying the mana cost, whatever the timing, and controls the spell; CR 608.2c: "if they do" reads whether a spell was cast; CR 707.10, 707.10c: the copy is put onto the stack under the
 * control of the player who copies it, who may choose new targets). The engine's `castFree` by that player of a spell of their own hand, remembering the spell cast, then a `conditional`
 * on a spell having been cast that copies it (`copySpell`, new targets allowed) and otherwise draws a card for the controller. Not read: another player, another zone, a mana cost paid,
 * another count of cards, no copy, a missing sentence.
 */
export const EFFECT_OPPONENT_CASTS_FREE_YOU_COPY = defineRule<Clauses>({
  id: 'effect.opponent-casts-free-you-copy',
  family: 'effect',
  leading: ['target'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 500.1 (Beginning Phase)',
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 118.9 (Costs)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 707.10 (Copying Objects)',
    'CR 707.10c (Copying Objects)',
  ],
  examples: [
    "target opponent whose turn it is may cast a spell from their hand without paying its mana cost. If they do, you copy that spell. You may choose new targets for the copy. If they don't, you draw a card",
    'target opponent whose turn it is may cast a spell from their hand without paying its mana cost. If they do, you copy that spell. You may choose new targets for the copy. If they don’t, you draw a card',
  ],
  rejects: [
    'target opponent whose turn it is may cast a spell from their hand without paying its mana cost',
    "target opponent may cast a spell from their hand without paying its mana cost. If they do, you copy that spell. You may choose new targets for the copy. If they don't, you draw a card",
    "target opponent whose turn it is may cast a spell from their graveyard without paying its mana cost. If they do, you copy that spell. You may choose new targets for the copy. If they don't, you draw a card",
    "target opponent whose turn it is may cast a spell from their hand. If they do, you copy that spell. You may choose new targets for the copy. If they don't, you draw a card",
    "target opponent whose turn it is may cast a spell from their hand without paying its mana cost. If they do, you copy that spell. If they don't, you draw a card",
    "target opponent whose turn it is may cast a spell from their hand without paying its mana cost. If they do, you copy that spell. You may choose new targets for the copy. If they don't, you draw two cards",
    "target opponent whose turn it is may cast a spell from their hand without paying its mana cost. If they do, you copy that spell. You may choose new targets for the copy. If they don't, you draw a card and gain 1 life",
    "target player whose turn it is may cast a spell from their hand without paying its mana cost. If they do, you copy that spell. You may choose new targets for the copy. If they don't, you draw a card",
  ],
  parse: (ctx, pos) => {
    const id = 'effect.opponent-casts-free-you-copy';
    const who = spanned(pattern(new RegExp(`target opponent whose turn it is${END}`, 'iu')))(
      ctx,
      pos,
    );
    if (!who.ok) return who;
    const rest = spanned(
      pattern(
        new RegExp(
          ` may cast a spell from their hand without paying its mana cost\\. if they do, you copy that spell\\. you may choose new targets for the copy\\. if they don['’]t, you draw a card${END}(?!\\s+and\\b)`,
          'iu',
        ),
      ),
    )(ctx, who.pos);
    if (!rest.ok) return rest;
    const noun: IrNoun = {
      kind: 'noun',
      det: 'target',
      filter: { player: 'opponentWhoseTurn', raw: 'target opponent whose turn it is' },
      upTo: false,
      plural: false,
      other: false,
      span: who.value.span,
      rule: id,
    };
    return {
      ok: true,
      value: [
        makeClause(id, 'opponentCastsFreeYouCopy', { who: noun }, { start: pos, end: rest.pos }),
      ],
      pos: rest.pos,
    };
  },
});

/** Quiet: a line these rules do not read stops where it always did. */
export const FEDERATION_F_EFFECT_RULES = [
  quietly(EFFECT_CREATURES_CANT_ATTACK_YOU),
  quietly(EFFECT_RETURN_THOSE_DELAYED),
  quietly(EFFECT_PUT_YOUR_COMMANDER_INTO_HAND),
  quietly(EFFECT_CHOOSE_UP_TO_TWO_TARGETS),
  quietly(EFFECT_FOR_EACH_OF_THEM_RESELECT_ATTACK),
  quietly(EFFECT_OPPONENT_CASTS_FREE_YOU_COPY),
];
