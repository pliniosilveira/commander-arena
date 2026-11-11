/**
 * Effect rules of stage P35 (D-176): the Korvold deck's text and token slice. What the engine already ran and the grammar did not read: the
 * abilities of a token said in the sentence after it ("It has \"Sacrifice this token: Add {C}.\"").
 */
import {
  choice,
  fail,
  literal,
  map,
  optional,
  pattern,
  quiet,
  satisfy,
  sequence,
} from '../../combinators';
import type { IrDuration, IrFlag, IrNoun, IrZoneSpec } from '../../ir/types';
import { quantity } from '../amount/index';
import { graveyardPhrase } from '../noun/phrases';
import { defineRule, family, spanned } from '../registry';
import { TOKEN_QUOTED_ABILITY } from '../static/quoted';
import { BOUNDARY } from './dragons';
import { gainParser } from './gain';
import { type Clauses, makeClause, single } from './operands';

/**
 * `effect.it-has-ability`: "It has \"Sacrifice ~: Add {C}.\"" after the sentence that creates a token (CR 111.4, 113.1, 608.2c): the ability
 * of the token just made, which the lowering folds into the description of that token. Read alone, it names no object, so it is only run
 * where a sentence before it creates exactly that token.
 */
export const EFFECT_IT_HAS_ABILITY = defineRule<Clauses>({
  id: 'effect.it-has-ability',
  family: 'effect',
  leading: ['it'],
  cites: [
    'CR 111.4 (Tokens)',
    'CR 113.1 (Abilities)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'it has "Sacrifice ~: Add {C}."',
    'It has "When ~ dies, you gain 1 life."',
    'it has "{T}: You gain 1 life."',
  ],
  rejects: [
    'it has flying',
    'it has "Sacrifice ~: Add {C}"',
    'it has "Flying."',
    'its "Sacrifice ~: Add {C}."',
    'it gains "Sacrifice ~: Add {C}."',
    'it has "Sacrifice ~: Add {C}." and flying',
  ],
  parse: single(
    'effect.it-has-ability',
    sequence(literal('it has '), TOKEN_QUOTED_ABILITY),
    ([, ability]) => ({ verb: 'hasAbility', args: { ability } }),
  ),
});

/**
 * `effect.return-chosen-card`: "you may return a creature card from your graveyard to your hand", "return a land card from your graveyard to
 * your hand" (stage P35, D-176, CR 400.7, 608.2d, 701.17b): not a target, the player chooses a card of their own graveyard as the instruction
 * runs, any card of the kind in it, and with "you may" none. The words "you may" are read here so that a clause after "then" can say them
 * (\"Mill two cards, then you may return a creature card ...\"): the lowering is the engine's `moveToZone` of a chosen card to the hand.
 */
export const EFFECT_RETURN_CHOSEN_CARD = defineRule<Clauses>({
  id: 'effect.return-chosen-card',
  family: 'effect',
  leading: ['you', 'return'],
  cites: [
    'CR 400.7 (General)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 404.1 (Graveyard)',
  ],
  examples: [
    'you may return a creature card from your graveyard to your hand',
    'return a creature card from your graveyard to your hand',
    'you may return a land card from your graveyard to your hand',
    'return an artifact card from your graveyard to your hand',
    'you may return a Dragon card from your graveyard to your hand',
    'you may return a permanent card from your graveyard to your hand',
  ],
  rejects: [
    'you may return target creature card from your graveyard to your hand',
    'you may return two creature cards from your graveyard to your hand',
    'you may return a creature card from a graveyard to your hand',
    'you may return a creature card from an opponent’s graveyard to your hand',
    "you may return a creature card from your graveyard to its owner's hand",
    'you may return a creature card from your graveyard to the battlefield',
    'you may return a creature from your graveyard to your hand',
    'you may return a creature card from your graveyard to your hand tapped',
    'you may return it to your hand',
    'return a creature card from your hand to your hand',
  ],
  parse: single(
    'effect.return-chosen-card',
    (ctx, pos) => {
      // Quiet: a line that starts "You may ..." or "Return ..." and is something else stops where it always did.
      const head = quiet(
        sequence(
          optional(literal('you may '), null),
          literal('return '),
          spanned(
            sequence(
              pattern(/an? /iu),
              satisfy(graveyardPhrase(false), (filter) => filter.controller === 'you'),
            ),
          ),
          spanned(literal(' to your hand')),
        ),
      )(ctx, pos);
      if (!head.ok) return head;
      const [may, , card, hand] = head.value;
      const [, filter] = card.value;
      const at = card.span;
      const objects: IrNoun = {
        kind: 'noun',
        det: 'a',
        filter: { ...filter, controller: 'you', card: true },
        upTo: false,
        plural: false,
        other: false,
        span: at,
        rule: 'effect.return-chosen-card',
      };
      const to: IrZoneSpec = {
        kind: 'zoneSpec',
        zone: 'hand',
        whose: 'you',
        span: hand.span,
        rule: 'effect.return-chosen-card',
      };
      const flag: IrFlag = {
        kind: 'flag',
        value: may !== null,
        span: { start: pos, end: pos },
        rule: 'effect.return-chosen-card',
      };
      return { ok: true, value: { objects, to, may: flag }, pos: head.pos };
    },
    ({ objects, to, may }) => ({ verb: 'putFromZone', args: { objects, to, may } }),
  ),
});

/**
 * `effect.shuffle-graveyard`: "shuffle your graveyard into your library" (stage P35, D-176, CR 701.24, 400.3): every card of the player's
 * graveyard goes into their library and the library is shuffled. A commander in it may go to the command zone instead (CR 903.9a), which
 * the engine asks as it moves the cards.
 */
export const EFFECT_SHUFFLE_GRAVEYARD = defineRule<Clauses>({
  id: 'effect.shuffle-graveyard',
  family: 'effect',
  leading: ['shuffle'],
  cites: ['CR 701.24 (Shuffle)', 'CR 404.1 (Graveyard)', 'CR 903.9a (Commander)'],
  examples: ['shuffle your graveyard into your library'],
  rejects: [
    'shuffle your graveyard',
    'shuffle your graveyard into the library',
    'shuffle your graveyard into their library',
    "shuffle target player's graveyard into their library",
    'shuffle your library',
    'shuffle your graveyard into your library and draw a card',
    'shuffle all graveyards into your library',
  ],
  parse: single(
    'effect.shuffle-graveyard',
    spanned(literal('shuffle your graveyard into your library')),
    ({ span }) => ({
      verb: 'shuffleGraveyardIn',
      args: {
        objects: {
          kind: 'noun',
          det: 'each',
          filter: { zone: 'graveyard', controller: 'you', card: true, raw: 'your graveyard' },
          upTo: false,
          plural: true,
          other: false,
          span,
          rule: 'effect.shuffle-graveyard',
        },
      },
    }),
  ),
});

/**
 * `effect.require-attack`: "until your next turn, creatures your opponents control attack each combat if able and attack a player other than you
 * if able" (stage P37, D-180, CR 508.1d, 611.2a, 611.2c: a requirement on a group of creatures, which changes the rules and no characteristic, so
 * it reaches creatures that arrive later; it ends as the next turn of the controller begins, CR 500.1). The group is "creatures" with a controller
 * the words name ("your opponents control"); the second requirement is the engine's `awayFromYou` (a player other than the controller; with two
 * players none can be, and the creatures are only required to attack). "This turn" is `effect.restrict-all`, which is another effect.
 */
export const EFFECT_REQUIRE_ATTACK = defineRule<Clauses>({
  id: 'effect.require-attack',
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 508.1d (Declare Attackers Step)',
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 500.1 (Beginning Phase)',
  ],
  examples: [
    'until your next turn, creatures your opponents control attack each combat if able and attack a player other than you if able',
    'until your next turn, creatures your opponents control attack each combat if able',
    'Until your next turn, creatures your opponents control attack each combat if able',
  ],
  rejects: [
    'until your next turn, creatures your opponents control attack each combat if able and attack a player other than you',
    'until your next turn, creatures your opponents control attack if able',
    'until your next turn, creatures your opponents control attack each combat if able and draw a card',
    'until your next turn, creature your opponents control attacks each combat if able',
    'until your next turn, creatures attack each combat if able',
    'until your next turn, target creature attacks each combat if able',
    'until end of turn, creatures your opponents control attack each combat if able',
    'until your next turn, other creatures your opponents control attack each combat if able',
    'until your next turn, artifacts your opponents control attack each combat if able',
    'creatures your opponents control attack each combat if able',
    'until your next turn, creatures your opponents control attack each combat if able and attack a player other than you if able and draw a card',
  ],
  parse: single(
    'effect.require-attack',
    (ctx, pos) => {
      const lead = spanned(pattern(/until your next turn, /iu))(ctx, pos);
      if (!lead.ok) return lead;
      const subject = family<IrNoun>('noun', { only: ['noun.plain-permanents'] })(ctx, lead.pos);
      if (!subject.ok) return subject;
      const noun = subject.value;
      // "Creatures" and nothing else about them but who controls them (an engine requirement names no quality it could not read as attackers are declared).
      const f = noun.filter;
      const onlyCreatures =
        noun.plural &&
        noun.det === 'each' &&
        !noun.other &&
        f.anyOf === undefined &&
        f.subtypes === undefined &&
        f.types?.length === 1 &&
        f.types[0] === 'creature' &&
        (f.controller === 'opponent' || f.controller === 'you');
      if (!onlyCreatures) return fail(ctx, lead.pos);
      const words = spanned(
        sequence(
          literal(' attack each combat if able'),
          optional(literal(' and attack a player other than you if able'), null),
        ),
      )(ctx, subject.pos);
      if (!words.ok) return words;
      const away = words.value.value[1] !== null;
      return {
        ok: true,
        value: { noun, away, span: { start: pos, end: words.pos }, spanOfWords: words.value.span },
        pos: words.pos,
      };
    },
    ({ noun, away, span, spanOfWords }) => {
      const flag: IrFlag = {
        kind: 'flag',
        value: away,
        span: spanOfWords,
        rule: 'effect.require-attack',
      };
      const duration: IrDuration = {
        kind: 'duration',
        scope: 'untilYourNextTurn',
        span,
        rule: 'effect.require-attack',
      };
      return { verb: 'requireAttack', args: { objects: noun, away: flag }, duration };
    },
  ),
});

/**
 * `effect.gain-keyword-targets`: "up to that many target creatures gain double strike until end of turn", "up to two target creatures gain flying
 * until end of turn" (CR 115.1, 611.2a, 613.1f, stage P41, D-188): several targets of one slot, all of them gain the keywords. The verb is the plural
 * "gain" (the subject is plural, with "up to" in front: a target noun of one creature is `effect.gain-keyword`'s). Which creatures are fixed as the
 * ability is put on the stack (CR 601.2c, 603.3d).
 */
export const EFFECT_GAIN_KEYWORD_TARGETS = defineRule<Clauses>({
  id: 'effect.gain-keyword-targets',
  family: 'effect',
  leading: ['up'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 611.2a (Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 603.12 (Reflexive Triggered Abilities)',
  ],
  examples: [
    'up to that many target creatures gain double strike until end of turn',
    'up to two target creatures gain flying until end of turn',
    'up to three target creatures you control gain trample and haste until end of turn',
    'up to that many target creatures gain double strike and lifelink until end of turn',
  ],
  rejects: [
    'up to that many target creatures gains double strike until end of turn',
    'up to that many target creatures gain double strike',
    'up to that many target creatures gain double strike until your next turn',
    'up to that many target creatures gain flash until end of turn',
    'up to one target creature gain flying until end of turn',
    'up to that many creatures gain double strike until end of turn',
    'up to that many target creatures gain until end of turn',
    'target creature gains double strike until end of turn',
    'up to that many target creatures get +1/+1 until end of turn',
  ],
  parse: gainParser(
    'effect.gain-keyword-targets',
    ['noun.target-permanent'],
    true,
    (subject) => subject.upTo === true && subject.plural,
  ),
});

/**
 * `effect.extra-combat-after`: "there's an additional combat phase after this phase" (CR 500.8, 500.10, 505.1; stage P41, D-188): the other order of
 * words of `effect.extra-combat`. It is said in a main phase or in a combat phase: "this phase" is the one that is going on, and the new combat phase
 * follows it directly (the most recently created one first). The engine only runs it where it knows which phase that is (`validateCard`: an ability of
 * an attack, or one whose intervening "if" is that it is your main phase).
 */
export const EFFECT_EXTRA_COMBAT_AFTER = defineRule<Clauses>({
  id: 'effect.extra-combat-after',
  family: 'effect',
  leading: ["there's", 'there’s', 'there'],
  cites: [
    'CR 500.8 (General)',
    'CR 500.10 (General)',
    'CR 505.1 (Main Phase)',
    'CR 506.1 (Combat Phase)',
  ],
  examples: [
    "there's an additional combat phase after this phase",
    'there’s an additional combat phase after this phase',
    'there is an additional combat phase after this phase',
  ],
  rejects: [
    "there's an additional combat phase",
    "there's an additional combat phase after this turn",
    "there's an additional combat phase after this phase and draw a card",
    "there's an additional main phase after this phase",
    'there are two additional combat phases after this phase',
    "there's an additional combat phase after that phase",
    "there's an additional combat phase after this phase.",
    "there's another combat phase after this phase",
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        /there(?:['’]s| is) an additional combat phase after this phase(?![\p{L}\p{N}])(?!,| and\b| then\b)/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: [makeClause('effect.extra-combat-after', 'extraCombat', {}, r.value.span)],
      pos: r.pos,
    };
  },
});

/**
 * `effect.exile-top-face-down`: "exile the top two cards of target opponent's library face down", "exile the top card of target player's library face
 * down" (CR 701.13, 406.3: the cards are exiled one after the other from the top of a library that is not yours, face down, so that nobody may look
 * at them; stage P41, D-188). The cards belong to the owner of the library. They are what "those cards" names afterwards. Not read: your own library or
 * each player's, a number of 0 or 1 in the plural, the cards face up, or an instruction after it in the same sentence.
 */
export const EFFECT_EXILE_TOP_FACE_DOWN = defineRule<Clauses>({
  id: 'effect.exile-top-face-down',
  family: 'effect',
  leading: ['exile'],
  cites: ['CR 701.13 (Exile)', 'CR 406.3 (Exile)', 'CR 406.3a (Exile)', 'CR 401.1 (Library)'],
  examples: [
    "exile the top two cards of target opponent's library face down",
    'exile the top two cards of target opponent’s library face down',
    "exile the top card of target opponent's library face down",
    "exile the top three cards of target player's library face down",
  ],
  rejects: [
    "exile the top two cards of target opponent's library",
    'exile the top two cards of your library face down',
    "exile the top two cards of each opponent's library face down",
    "exile the top one cards of target opponent's library face down",
    "exile the top two card of target opponent's library face down",
    "exile the top cards of target opponent's library face down",
    "exile the top two cards of target opponent's graveyard face down",
    "exile the top two cards of target opponent's library face down and draw a card",
    "exile the top two cards of target creature's library face down",
    "exile top two cards of target opponent's library face down",
  ],
  parse: (ctx, pos) => {
    const id = 'effect.exile-top-face-down';
    const head = literal('exile the top ')(ctx, pos);
    if (!head.ok) return head;
    const counted = spanned(
      choice<number>(
        map(pattern(new RegExp(`card${BOUNDARY}`, 'iu')), () => 1),
        map(
          sequence(
            satisfy(quantity, (n) => n >= 2),
            pattern(new RegExp(` cards${BOUNDARY}`, 'iu')),
          ),
          ([n]) => n,
        ),
      ),
    )(ctx, head.pos);
    if (!counted.ok) return counted;
    const owner = sequence(
      literal(' of '),
      family<IrNoun>('noun', { only: ['noun.player'] }),
      pattern(/['’]s library face down(?![\p{L}\p{N}])(?!,| and\b| then\b)/iu),
    )(ctx, counted.pos);
    if (!owner.ok) return owner;
    const [, who] = owner.value;
    // A target player: "target opponent", "target player" (not "you" and not "each opponent").
    if (who.det !== 'target') return fail(ctx, pos);
    const { value, span } = counted.value;
    const flag: IrFlag = { kind: 'flag', value: true, span, rule: id };
    return {
      ok: true,
      value: [
        makeClause(
          id,
          'exileTop',
          { count: { kind: 'number', value, span }, from: who, faceDown: flag },
          { start: pos, end: owner.pos },
        ),
      ],
      pos: owner.pos,
    };
  },
});

/**
 * `effect.may-look-and-play`: "you may look at and play those cards for as long as they remain exiled" (CR 406.3, 601.2, 305.1: the player may look at
 * the cards that were exiled face down, and cast them or play them as though they were in their hand, for as long as they stay in exile; stage P41,
 * D-188). The cards are those an earlier "exile ... face down" exiled, which the lowering requires. Not read: another length, "may play" alone (the
 * cards would stay hidden), "that card", or a spend of mana as though it were mana of any type.
 */
export const EFFECT_MAY_LOOK_AND_PLAY = defineRule<Clauses>({
  id: 'effect.may-look-and-play',
  family: 'effect',
  leading: ['you'],
  cites: ['CR 406.3 (Exile)', 'CR 406.3a (Exile)', 'CR 601.2 (Casting Spells)', 'CR 305.1 (Lands)'],
  examples: [
    'you may look at and play those cards for as long as they remain exiled',
    'you may look at and play them for as long as they remain exiled',
    'you may look at and play that card for as long as it remains exiled',
  ],
  rejects: [
    'you may look at and play those cards',
    'you may look at and play those cards this turn',
    'you may look at those cards for as long as they remain exiled',
    'you may play those cards for as long as they remain exiled',
    'you may look at and cast those cards for as long as they remain exiled',
    'you may look at and play those cards for as long as they remain exiled and draw a card',
    'you may look at and play target card for as long as it remains exiled',
    'you may look at and play those cards for as long as they remain exiled.',
    'you may look at and play those cards for as long as they remains exiled',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.may-look-and-play';
    const r = spanned(
      pattern(
        new RegExp(
          `(?:you may look at and play (?:those cards|them) for as long as they remain exiled|you may look at and play that card for as long as it remains exiled)${BOUNDARY}(?!,| and\\b| then\\b)`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const flag: IrFlag = { kind: 'flag', value: true, span: r.value.span, rule: id };
    const duration: IrDuration = {
      kind: 'duration',
      scope: 'whileExiled',
      span: r.value.span,
      rule: id,
    };
    return {
      ok: true,
      value: [{ ...makeClause(id, 'mayPlay', { lookAt: flag }, r.value.span), duration }],
      pos: r.pos,
    };
  },
});

export const KORVOLD_EFFECT_RULES = [
  EFFECT_EXILE_TOP_FACE_DOWN,
  EFFECT_MAY_LOOK_AND_PLAY,
  EFFECT_IT_HAS_ABILITY,
  EFFECT_EXTRA_COMBAT_AFTER,
  EFFECT_GAIN_KEYWORD_TARGETS,
  EFFECT_RETURN_CHOSEN_CARD,
  EFFECT_SHUFFLE_GRAVEYARD,
  EFFECT_REQUIRE_ATTACK,
];
