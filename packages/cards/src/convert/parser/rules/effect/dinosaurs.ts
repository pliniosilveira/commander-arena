/**
 * Effect rules of stage P32 (D-145, D-147): what the engine's Dinosaurs slice reads. Doubling power and toughness (CR 701.10), a creature that
 * fights (CR 701.14) and each of the tokens just made fighting a different one of the creatures counted, the excess damage of a creature with
 * trample (CR 702.19b), revealing cards until one of a kind (CR 701.20), casting or playing a card without paying its mana cost (CR 608.2g,
 * 118.9), a token for each creature (CR 608.2c) and damage divided as the caster chooses (CR 601.2d). Each says what the text says; what the
 * engine can run is the lowering's business.
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
import type {
  IrAmount,
  IrClause,
  IrDuration,
  IrFlag,
  IrNoun,
  IrToken,
  IrZoneSpec,
  Span,
} from '../../ir/types';
import { FOR_EACH_AMOUNTS } from '../amount/kicked';
import { scaled } from '../amount/scaled';
import { spellPhrase } from '../noun/phrases';
import { defineRule, family, node, spanned } from '../registry';
import { type Clauses, makeClause, single } from './operands';
import { tokenWithEach } from './token';

function flag(rule: string, value: boolean, span: Span): IrFlag {
  return { kind: 'flag', value, span, rule };
}

type DoubleParts = [
  string,
  { value: { power: boolean; toughness: boolean }; span: Span },
  string,
  IrNoun,
  string,
  IrDuration,
];

/** What a doubling is of: "power and toughness", "power", "toughness". */
const STATS = choice(
  map(literal('power and toughness'), () => ({ power: true, toughness: true })),
  map(literal('power'), () => ({ power: true, toughness: false })),
  map(literal('toughness'), () => ({ power: false, toughness: true })),
);

/** The permanents a power and toughness can be doubled of: the source, a target, or a group as the effect resolves (CR 611.2c). */
const DOUBLE_SUBJECTS = [
  'noun.self',
  'noun.target-permanent',
  'noun.each-permanent',
  'noun.all-permanents',
  'noun.plain-permanents',
  'noun.it',
] as const;

/**
 * `effect.double-pt`: "double the power and toughness of each creature you control until end of turn", "double the power of target
 * creature until end of turn" (CR 701.10 Double, 611.2a: a continuous effect of a resolving spell or ability; CR 701.10c: a negative value
 * is doubled by getting that much more). Each creature gets its own amount, worked out as the effect resolves from the power and toughness
 * it has then (counters and earlier effects included). The duration is part of the phrase.
 */
export const EFFECT_DOUBLE_PT = defineRule<Clauses>({
  id: 'effect.double-pt',
  family: 'effect',
  leading: ['double'],
  cites: [
    'CR 701.10 (Double)',
    'CR 701.10c (Double)',
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
  ],
  examples: [
    'double the power and toughness of each creature you control until end of turn',
    'double the power of target creature until end of turn',
    'double the toughness of target creature you control until end of turn',
    'double the power and toughness of creatures you control until end of turn',
    'double the power and toughness of ~ until end of turn',
    'double the power and toughness of all creatures until end of turn',
    // Bulk Up (CR 701.10): the possessive of a single target.
    "double target creature's power until end of turn",
    "double target creature you control's toughness until end of turn",
    // Death Kiss (CR 701.10): the possessive of "it", the creature an earlier part of the ability is about.
    'double its power until end of turn',
    'double its power and toughness until end of turn',
  ],
  rejects: [
    'double its power',
    'double its mana value until end of turn',
    'double it power until end of turn',
    'double its power until your next turn',
    'double its powers until end of turn',
    "double target creatures's power until end of turn",
    "double target creature's power",
    "double target creature's mana value until end of turn",
    "double each creature's power until end of turn",
    'double the power and toughness of each creature you control',
    'double the power and toughness of each creature you control until your next turn',
    'double the power and toughness of target creatures until end of turn',
    'double the power of each creature you control until end of turn and draw a card',
    'double the power and mana value of target creature until end of turn',
    'double power and toughness of each creature you control until end of turn',
    'double the power and toughness of each creature you control for each artifact until end of turn',
    'double the number of counters on target creature',
  ],
  parse: single(
    'effect.double-pt',
    choice(
      sequence(
        literal('double the '),
        spanned(STATS),
        literal(' of '),
        family<IrNoun>('noun', { only: DOUBLE_SUBJECTS }),
        literal(' '),
        family<IrDuration>('duration'),
      ),
      // Bulk Up: "double target creature's power until end of turn", the possessive of a single target.
      map(
        sequence(
          literal('double '),
          satisfy(
            family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
            (noun) => !noun.plural && !noun.upTo && noun.count === undefined,
          ),
          literal("'s "),
          spanned(STATS),
          literal(' '),
          family<IrDuration>('duration'),
        ),
        ([, objects, , stats, , duration]): DoubleParts => [
          'double the ',
          stats,
          ' of ',
          objects,
          ' ',
          duration,
        ],
      ),
      // Death Kiss: "double its power until end of turn", the possessive of "it" (the creature the trigger is about).
      map(
        sequence(
          literal('double '),
          node<RegExpExecArray, IrNoun>(
            'effect.double-pt',
            pattern(/its(?![\p{L}\p{N}])/iu),
            () => ({
              kind: 'noun',
              det: 'anaphor',
              filter: { raw: 'it' },
              upTo: false,
              plural: false,
              other: false,
            }),
          ),
          literal(' '),
          spanned(STATS),
          literal(' '),
          family<IrDuration>('duration'),
        ),
        ([, objects, , stats, , duration]): DoubleParts => [
          'double the ',
          stats,
          ' of ',
          objects,
          ' ',
          duration,
        ],
      ),
    ),
    ([, stats, , objects, , duration]) => ({
      verb: 'doublePt',
      args: {
        objects,
        power: flag('effect.double-pt', stats.value.power, stats.span),
        toughness: flag('effect.double-pt', stats.value.toughness, stats.span),
      },
      duration,
    }),
  ),
});

/** One creature: a target or "it" or `~`, never a group or "up to". */
const ONE_CREATURE = ['noun.target-permanent', 'noun.self', 'noun.it'] as const;
/** The creature fought: a target, or (Grothama, All-Devouring) the permanent that grants the ability the fight is in. */
const AGAINST = ['noun.target-permanent', 'noun.granter'] as const;
const isOne = (noun: IrNoun): boolean => !noun.plural && !noun.upTo && noun.count === undefined;
/** "Up to one target creature" (Primal Might): the creature fought is optional, and nothing is fought when no target was chosen (CR 701.14b, 115.1). */
const isOneOrUpToOne = (noun: IrNoun): boolean =>
  !noun.plural &&
  (noun.count === undefined ||
    (noun.upTo && noun.count.kind === 'number' && noun.count.value === 1));

/**
 * `effect.fight`: "target creature you control fights target creature you don't control", "~ fights target creature" (CR 701.14 Fight:
 * each deals damage equal to its power to the other at the same time; CR 701.14b: nothing happens unless both are creatures on the
 * battlefield as it resolves). Two single creatures: the first one fights the second.
 */
export const EFFECT_FIGHT = defineRule<Clauses>({
  id: 'effect.fight',
  family: 'effect',
  leading: ['target', 'another', '~', 'it', 'have', 'up'],
  cites: ['CR 701.14 (Fight)', 'CR 701.14b (Fight)', 'CR 120.3 (Damage)', 'CR 115.1 (Targets)'],
  examples: [
    "target creature you control fights target creature you don't control",
    'target creature fights another target creature',
    '~ fights target creature',
    'it fights target creature',
    'another target creature you control fights target creature an opponent controls',
    // Frontier Siege (issue 103, "you may" is read apart): the permanent is made to fight.
    "have it fight target creature you don't control",
    'have target creature you control fight target creature an opponent controls',
    // Primal Might: the creature fought is an "up to one" target.
    "it fights up to one target creature you don't control",
    "target creature you control fights up to one target creature you don't control",
    // Earth Rumble: the creature that fights is an "up to one" target too (CR 701.14b: nothing fights unless both are chosen).
    'up to one target creature you control fights target creature an opponent controls',
  ],
  rejects: [
    "have it fights target creature you don't control",
    "it fight target creature you don't control",
    'have it fight',
    'have it fight each creature',
    'target creature fights',
    'target creatures fight each other',
    'target creature you control fights up to two target creatures',
    'up to one target creature you control fights up to one target creature',
    'target creature you control fight target creature',
    'two target creatures fight each other',
    '~ fights',
    'target creature fights it and draws a card',
    'target creature you control fights each creature',
    'up to two target creatures you control fight target creature',
    'up to one target creature you control fights each creature',
  ],
  parse: single(
    'effect.fight',
    choice(
      satisfy(
        sequence(
          satisfy(family<IrNoun>('noun', { only: ONE_CREATURE }), isOneOrUpToOne),
          literal(' fights '),
          satisfy(family<IrNoun>('noun', { only: AGAINST }), isOneOrUpToOne),
        ),
        // Only one of the two creatures may be an "up to one" target: with neither chosen nothing would be said.
        ([fighter, , against]) => !(fighter.upTo && against.upTo),
      ),
      // "have it fight target creature": the causative form, with the bare verb.
      map(
        sequence(
          literal('have '),
          satisfy(family<IrNoun>('noun', { only: ONE_CREATURE }), isOne),
          literal(' fight '),
          satisfy(family<IrNoun>('noun', { only: AGAINST }), isOne),
        ),
        ([, fighter, , against]): [IrNoun, string, IrNoun] => [fighter, ' fights ', against],
      ),
    ),
    ([fighter, , against]) => ({ verb: 'fight', args: { fighters: fighter, against } }),
  ),
});

/** The words for a group of objects after "those": "tokens", "creatures", "permanents". */
const THOSE = /(tokens|creatures|permanents)/;

/**
 * `effect.fight-each`: "each of those tokens fights a different one of those creatures" (CR 701.14, 608.2c, 601.2c: the controller of the
 * effect chooses, for each of the tokens just made, which of the creatures counted it fights, a different one each time). It reads what
 * the instruction before it made: the tokens ("those tokens") and the creatures it counted ("those creatures"); the lowering refuses it
 * after anything else, since "those" would have nothing to mean.
 */
export const EFFECT_FIGHT_EACH = defineRule<Clauses>({
  id: 'effect.fight-each',
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 701.14 (Fight)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: [
    'each of those tokens fights a different one of those creatures',
    'each of those creatures fights a different one of those permanents',
  ],
  rejects: [
    'each of those tokens fights one of those creatures',
    'each of those tokens fights a different one of them',
    'each of those tokens fight a different one of those creatures',
    'each of those token fights a different one of those creatures',
    'each of those tokens fights a different one of those creatures and draws a card',
    'each token fights a different one of those creatures',
    'each of target tokens fights a different one of those creatures',
    'each of those lands fights a different one of those creatures',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `each of those ${THOSE.source} fights a different one of those ${THOSE.source}(?![\\p{L}\\p{N}])`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return fail(ctx, pos);
    const { value, span } = r.value;
    const clause: IrClause = makeClause(
      'effect.fight-each',
      'fightPairs',
      {
        fighters: flag('effect.fight-each', (value[1] ?? '') === 'tokens', span),
        against: flag('effect.fight-each', (value[2] ?? '') === 'creatures', span),
      },
      span,
    );
    return { ok: true, value: [clause], pos: r.pos };
  },
});

/**
 * `effect.excess-damage`: "excess damage is dealt to that creature's controller" (CR 702.19b, 120.3: a creature with trample assigns the
 * damage beyond lethal to something else; here, as the second sentence of a bite or a fight, to the controller of the creature that was
 * dealt damage). Read only as the sentence "If the creature you control has trample, excess damage is dealt to that creature's controller
 * instead.", which the lowering joins to the damage before it.
 */
export const EFFECT_EXCESS_DAMAGE = defineRule<Clauses>({
  id: 'effect.excess-damage',
  family: 'effect',
  leading: ['excess'],
  cites: [
    'CR 702.19b (Trample)',
    'CR 120.3 (Damage)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    "excess damage is dealt to that creature's controller",
    'excess damage is dealt to its controller',
  ],
  rejects: [
    'excess damage is dealt to you',
    "excess damage is dealt to that creature's controller and you draw a card",
    "excess damage is dealt to target creature's controller",
    'excess damage is dealt to that player',
    "excess damage is dealt to that creature's owner",
    'excess damage is dealt',
  ],
  parse: single(
    'effect.excess-damage',
    sequence(
      literal('excess damage is dealt to '),
      family<IrNoun>('noun', { only: ['noun.its-controller'] }),
    ),
    ([, to]) => ({ verb: 'excessDamage', args: { to } }),
  ),
});

/** " tapped" or " into your hand" etc. of the card put: where the card found goes. */
function zoneArg(rule: string, span: Span, zone: IrZoneSpec['zone'], tapped: boolean): IrZoneSpec {
  return { kind: 'zoneSpec', zone, ...(tapped ? { tapped: true } : {}), span, rule };
}

/**
 * `effect.reveal-until`: "reveal cards from the top of your library until you reveal a land card. Put that card onto the battlefield tapped
 * and the rest on the bottom of your library in a random order." (CR 701.20 Reveal, 401.4: the cards are revealed one at a time until one
 * matches, all of them if none does; CR 401.5 the rest go to the bottom in a random order). Two sentences that `splitSentences` keeps
 * together: what is revealed until, and where the card found and the rest go. The card is of a kind (a land card, a nonland card, a creature
 * card), put onto the battlefield (tapped or not) or into the hand.
 */
export const EFFECT_REVEAL_UNTIL = defineRule<Clauses>({
  id: 'effect.reveal-until',
  family: 'effect',
  leading: ['reveal'],
  cites: [
    'CR 701.20 (Reveal)',
    'CR 401.4 (Library)',
    'CR 401.5 (Library)',
    'CR 110.2a (Permanents)',
  ],
  examples: [
    'reveal cards from the top of your library until you reveal a land card. Put that card onto the battlefield tapped and the rest on the bottom of your library in a random order',
    'reveal cards from the top of your library until you reveal a land card. Put that card onto the battlefield and the rest on the bottom of your library in a random order',
    'reveal cards from the top of your library until you reveal a nonland card. Put that card into your hand and the rest on the bottom of your library in a random order',
    'reveal cards from the top of your library until you reveal a creature card. Put that card into your hand and the rest on the bottom of your library in a random order',
  ],
  rejects: [
    'reveal cards from the top of your library until you reveal a land card',
    'reveal cards from the top of your library until you reveal a land card. Put that card onto the battlefield tapped',
    'reveal cards from the top of your library until you reveal a land card. Put that card onto the battlefield tapped and the rest into your graveyard',
    'reveal cards from the top of your library until you reveal a land card. Put that card onto the battlefield tapped and the rest on the bottom of your library in any order',
    'reveal cards from the top of your library until you reveal two land cards. Put that card onto the battlefield tapped and the rest on the bottom of your library in a random order',
    'reveal cards from the top of your library until you reveal a creature card with mana value 3 or less. Put that card into your hand and the rest on the bottom of your library in a random order',
    'reveal cards from the top of target player’s library until you reveal a land card. Put that card onto the battlefield tapped and the rest on the bottom of your library in a random order',
    'reveal the top card of your library',
    'reveal cards from the top of your library until you reveal a land card. Put that card into your graveyard and the rest on the bottom of your library in a random order',
  ],
  parse: single(
    'effect.reveal-until',
    sequence(
      literal('reveal cards from the top of your library until you reveal '),
      family<IrNoun>('noun', { only: ['noun.library-card'] }),
      literal('. put that card '),
      spanned(
        choice<{ zone: 'battlefield' | 'hand'; tapped: boolean }>(
          map(literal('onto the battlefield tapped'), () => ({
            zone: 'battlefield' as const,
            tapped: true,
          })),
          map(literal('onto the battlefield'), () => ({
            zone: 'battlefield' as const,
            tapped: false,
          })),
          map(literal('into your hand'), () => ({ zone: 'hand' as const, tapped: false })),
        ),
      ),
      literal(' and the rest on the bottom of your library in a random order'),
    ),
    ([, card, , where]) => ({
      verb: 'revealUntil',
      args: {
        card: { ...card, upTo: false, plural: false },
        to: zoneArg('effect.reveal-until', where.span, where.value.zone, where.value.tapped),
      },
    }),
  ),
});

/**
 * `effect.each-opponent-reveals-until`: "each opponent reveals cards from the top of their library until they reveal a land card, then puts those cards into their graveyard" (issue 102,
 * Consuming Aberration; CR 701.20, 101.4, 404.1): every opponent reveals from their own library until a card of the kind shows up, and all the cards revealed, the one found included, go
 * into their graveyard. The engine's `revealUntil` of each opponent. Not read: "target opponent", "you", "the rest", another place, a count of cards, "until you reveal".
 */
export const EFFECT_EACH_OPPONENT_REVEALS_UNTIL = defineRule<Clauses>({
  id: 'effect.each-opponent-reveals-until',
  family: 'effect',
  leading: ['each'],
  cites: ['CR 701.20 (Reveal)', 'CR 101.4 (Handling Simultaneous Choices)', 'CR 404.1 (Graveyard)'],
  examples: [
    'each opponent reveals cards from the top of their library until they reveal a land card, then puts those cards into their graveyard',
    'each opponent reveals cards from the top of their library until they reveal a creature card, then puts those cards into their graveyard',
  ],
  rejects: [
    'each opponent reveals cards from the top of their library until they reveal a land card',
    'each opponent reveals cards from the top of their library until they reveal a land card, then puts the rest into their graveyard',
    'each opponent reveals cards from the top of their library until they reveal a land card, then puts those cards into their hand',
    'target opponent reveals cards from the top of their library until they reveal a land card, then puts those cards into their graveyard',
    'each opponent reveals cards from the top of their library until you reveal a land card, then puts those cards into their graveyard',
    'each player reveals cards from the top of their library until they reveal a land card, then puts those cards into their graveyard',
  ],
  parse: single(
    'effect.each-opponent-reveals-until',
    sequence(
      literal('each opponent reveals cards from the top of their library until they reveal '),
      family<IrNoun>('noun', { only: ['noun.library-card'] }),
      literal(', then puts those cards into their graveyard'),
    ),
    ([, card]) => ({
      verb: 'revealUntilEachOpponent',
      args: { card: { ...card, upTo: false, plural: false } },
    }),
  ),
});

/**
 * `effect.reveal-until-may-put`: "reveal cards from the top of your library until you reveal an Aura card. You may put that card onto the battlefield. If you don't, put it into your
 * hand. Put the rest on the bottom of your library in a random order" (D-659, CR 701.20, 401.4, 303.4f, 608.2c: Songbirds' Blessing). Four sentences that `splitSentences` keeps
 * together: the card found is offered for the battlefield, goes into the hand when the player does not put it there, and the rest go to the bottom in a random order. Not read:
 * another place for the card, another place for the rest, "in any order", a quality with a mana value.
 */
export const EFFECT_REVEAL_UNTIL_MAY_PUT = defineRule<Clauses>({
  id: 'effect.reveal-until-may-put',
  family: 'effect',
  leading: ['reveal'],
  cites: [
    'CR 701.20 (Reveal)',
    'CR 401.4 (Library)',
    'CR 303.4f (Auras)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    "reveal cards from the top of your library until you reveal an Aura card. You may put that card onto the battlefield. If you don't, put it into your hand. Put the rest on the bottom of your library in a random order",
    'reveal cards from the top of your library until you reveal a land card. You may put that card onto the battlefield. If you don’t, put it into your hand. Put the rest on the bottom of your library in a random order',
  ],
  rejects: [
    "reveal cards from the top of your library until you reveal an Aura card. You may put that card onto the battlefield. If you don't, put it into your hand",
    "reveal cards from the top of your library until you reveal an Aura card. You may put that card onto the battlefield. If you don't, put it into your graveyard. Put the rest on the bottom of your library in a random order",
    "reveal cards from the top of your library until you reveal an Aura card. You may put that card onto the battlefield. If you don't, put it into your hand. Put the rest on the bottom of your library in any order",
    "reveal cards from the top of your library until you reveal an Aura card. You may put that card into your hand. If you don't, put it onto the battlefield. Put the rest on the bottom of your library in a random order",
    "reveal cards from the top of your library until you reveal two Aura cards. You may put that card onto the battlefield. If you don't, put it into your hand. Put the rest on the bottom of your library in a random order",
    "reveal cards from the top of your library until you reveal an Aura card with mana value 3 or less. You may put that card onto the battlefield. If you don't, put it into your hand. Put the rest on the bottom of your library in a random order",
  ],
  parse: single(
    'effect.reveal-until-may-put',
    sequence(
      literal('reveal cards from the top of your library until you reveal '),
      family<IrNoun>('noun', { only: ['noun.library-card'] }),
      pattern(
        /\. you may put that card onto the battlefield\. if you don['’]t, put it into your hand\. put the rest on the bottom of your library in a random order/iu,
      ),
    ),
    ([, card]) => ({
      verb: 'revealUntilMayPut',
      args: { card: { ...card, upTo: false, plural: false } },
    }),
  ),
});

/**
 * `effect.cast-free`: "you may cast a spell with mana value 5 or less from your hand without paying its mana cost", "you may cast a
 * creature spell from your hand without paying its mana cost", "you may play the exiled card without paying its mana cost" (CR 608.2g,
 * 118.9, 305.1: the controller may cast the card as this resolves without paying its mana cost, or, with "play", put a land onto the
 * battlefield as a land play; declining does nothing). The card is one of those in the controller's hand that match, or the card a linked
 * ability exiled (`linkedExile`, Hideaway, CR 702.75a). "A spell" is any card but a land.
 */
export const EFFECT_CAST_FREE = defineRule<Clauses>({
  id: 'effect.cast-free',
  family: 'effect',
  leading: ['you', 'cast', 'play'],
  cites: [
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 118.9 (Alternative Costs)',
    'CR 305.1 (Lands)',
    'CR 702.75a (Hideaway)',
  ],
  examples: [
    'you may cast a spell with mana value 5 or less from your hand without paying its mana cost',
    'you may cast a creature spell from your hand without paying its mana cost',
    'you may cast a spell from your hand without paying its mana cost',
    'you may cast a spell with mana value X or less from your hand without paying its mana cost',
    'you may cast a spell with lesser mana value that shares a card type with it from your hand without paying its mana cost',
    'you may play the exiled card without paying its mana cost',
    'you may cast any number of spells from your hand without paying their mana costs',
    'you may cast the exiled card without paying its mana cost',
    // Death Toll deck, group D: in a triggered ability the "you may" is the ability's own.
    'play the exiled card without paying its mana cost',
  ],
  rejects: [
    'you may cast a spell with mana value 5 or less from your hand',
    'you may cast a spell with mana value X or less from your graveyard without paying its mana cost',
    'you may cast a spell with mana value X or less from your hand',
    'you may cast a spell with lesser mana value from your hand without paying its mana cost',
    'you may cast a spell that shares a card type with it from your hand without paying its mana cost',
    'you may cast a spell with lesser mana value that shares a card type with it from your graveyard without paying its mana cost',
    'you may cast a spell with mana value 5 or less from your graveyard without paying its mana cost',
    'you may cast a spell with mana value 5 or less without paying its mana cost',
    'you may cast two spells from your hand without paying their mana costs',
    'you may cast any number of spells from your graveyard without paying their mana costs',
    'you may cast any number of spells from your hand without paying its mana cost',
    'you may cast target spell from your hand without paying its mana cost',
    'you cast a spell from your hand without paying its mana cost',
    'you may play a card from your hand without paying its mana cost',
    'you may play the exiled card',
    'you may play the exiled cards without paying their mana costs',
    'you may cast a spell with mana value 5 or less from your hand without paying its mana cost and draw a card',
    'you may cast a spell with mana value 5 or less from your hand without paying its mana cost this turn',
  ],
  parse: single(
    'effect.cast-free',
    choice<{ objects: IrNoun; play: boolean; written: boolean; any?: true }>(
      (ctx, pos) => {
        // "you may cast ..."; inside a triggered ability the "you may" is the ability's (the clause is optional), so "cast ..." is read too, and the lowering asks for one of the two.
        const head = pattern(/(you may )?cast an? /iu)(ctx, pos);
        if (!head.ok) return head;
        const phrase = spanned(spellPhrase(false))(ctx, head.pos);
        if (!phrase.ok) return phrase;
        // "a spell with mana value X or less" (CR 107.3a, 202.3): at most the X announced for the spell this is the text of.
        const atMostX = optional(
          quiet(pattern(/ with mana value X or less(?![\p{L}\p{N}])/u)),
          null,
        )(ctx, phrase.pos);
        if (!atMostX.ok) return atMostX;
        // "a spell with lesser mana value that shares a card type with it" (issue 100, CR 202.3, 205.2a): relative to the spell a cast trigger is about.
        const lesser = optional(
          quiet(
            pattern(/ with lesser mana value that shares a card type with it(?![\p{L}\p{N}])/u),
          ),
          null,
        )(ctx, atMostX.pos);
        if (!lesser.ok) return lesser;
        const from = literal(' from your hand without paying its mana cost')(ctx, lesser.pos);
        if (!from.ok) return from;
        const { stackKind: _kind, zone: _zone, ...rest } = phrase.value.value;
        void _kind;
        void _zone;
        const plainSpell = rest.types === undefined && rest.anyOf === undefined;
        const filter = {
          ...rest,
          zone: 'hand' as const,
          ...(atMostX.value === null ? {} : { manaValueAtMostX: true as const }),
          ...(lesser.value === null ? {} : { lesserSharingTypeWithTriggerSpell: true as const }),
          // "a spell" is a card that is not a land: a land is played, never cast (CR 305.1, 601.1).
          ...(plainSpell ? { notTypes: ['land'] } : {}),
        };
        const objects: IrNoun = {
          kind: 'noun',
          det: 'a',
          filter,
          upTo: false,
          plural: false,
          other: false,
          span: phrase.value.span,
          rule: 'effect.cast-free',
        };
        return {
          ok: true,
          value: { objects, play: false, written: head.value[1] !== undefined },
          pos: from.pos,
        };
      },
      (ctx, pos) => {
        // Issue 105 (Aetherflux Conduit, CR 608.2g, 118.9): "you may cast any number of spells from your hand without paying their mana costs": one question after each spell.
        const r = spanned(
          pattern(
            /(you may )?cast any number of spells from your hand without paying their mana costs(?![\p{L}\p{N}])/iu,
          ),
        )(ctx, pos);
        if (!r.ok) return r;
        const objects: IrNoun = {
          kind: 'noun',
          det: 'a',
          filter: { zone: 'hand', notTypes: ['land'], raw: 'spells from your hand' },
          upTo: false,
          plural: false,
          other: false,
          span: r.value.span,
          rule: 'effect.cast-free',
        };
        return {
          ok: true,
          value: {
            objects,
            play: false,
            written: r.value.value[1] !== undefined,
            any: true,
          },
          pos: r.pos,
        };
      },
      (ctx, pos) => {
        const r = spanned(
          pattern(
            /(you may )?(cast|play) the exiled card without paying its mana cost(?![\p{L}\p{N}])/iu,
          ),
        )(ctx, pos);
        if (!r.ok) return r;
        const objects: IrNoun = {
          kind: 'noun',
          det: 'linkedExile',
          filter: { raw: 'the exiled card' },
          upTo: false,
          plural: false,
          other: false,
          span: r.value.span,
          rule: 'effect.cast-free',
        };
        return {
          ok: true,
          value: {
            objects,
            play: (r.value.value[2] ?? '').toLowerCase() === 'play',
            // Inside a triggered ability the "you may" is the ability's (the clause is optional), as for the cast of a spell of the hand above.
            written: r.value.value[1] !== undefined,
          },
          pos: r.pos,
        };
      },
    ),
    ({ objects, play, written, any }) => ({
      verb: 'castFree',
      args: {
        objects,
        play: flag('effect.cast-free', play, objects.span),
        // Whether the sentence said "you may" itself (a triggered ability's own "you may" makes the clause optional instead).
        mayWritten: flag('effect.cast-free', written, objects.span),
        ...(any === true ? { anyNumber: flag('effect.cast-free', true, objects.span) } : {}),
      },
    }),
  ),
});

/**
 * `effect.for-each-create`: "for each creature your opponents control, create a 4/4 green Phyrexian Beast creature token" (CR 608.2c: the
 * count is taken as the instruction runs). The same instruction as "create a 4/4 ... token for each creature your opponents control", said
 * with the count first; a number above one multiplies the count.
 */
export const EFFECT_FOR_EACH_CREATE = defineRule<Clauses>({
  id: 'effect.for-each-create',
  family: 'effect',
  leading: ['for'],
  cites: ['CR 111.2 (Tokens)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    'for each creature your opponents control, create a 4/4 green Phyrexian Beast creature token',
    'for each creature you control, create a Treasure token',
    'for each land you control, create a 0/1 green Plant creature token',
    'for each creature your opponents control, create two 1/1 white Soldier creature tokens',
    'for each creature card put into a graveyard this way, you create a tapped 2/2 black Zombie creature token',
  ],
  rejects: [
    'for each creature your opponents control, you destroy it',
    'for each creature your opponents control, you create X Treasure tokens',
    'for each creature your opponents control create a 4/4 green Phyrexian Beast creature token',
    'for each creature your opponents control, destroy it',
    'for each creature, create a 4/4 green Phyrexian Beast creature token',
    'for each creature your opponents control, create X Treasure tokens',
    'for each creature your opponents control, create a 4/4 green Phyrexian Beast creature token for each land you control',
    'for each creature your opponents control',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      // Quiet: "For each 1 damage prevented this way, create ..." stops where the older rules stop (at "For each").
      quiet(family<IrAmount>('amount', { only: FOR_EACH_AMOUNTS })),
      // "..., you create ..." (Dread Summons) says the same with the subject spelled out.
      choice(literal(', create '), literal(', you create ')),
      tokenWithEach(),
    )(ctx, pos);
    if (!r.ok) return r;
    const [each, , token] = r.value;
    const count = scaled(token.count, each);
    if (count === null) return fail(ctx, pos);
    const merged: IrToken = { ...token, count };
    const clause = makeClause(
      'effect.for-each-create',
      'createToken',
      { token: merged },
      { start: pos, end: r.pos },
    );
    return { ok: true, value: [clause], pos: r.pos };
  },
});
/**
 * `effect.damage-divided`: "~ deals X damage divided as you choose among any number of target creatures" (CR 601.2d: the caster divides
 * the damage among the targets as the spell is cast, each target getting at least 1; CR 120.3). The amount is a number or X (defined by
 * "..., where X is the greatest power among creatures you control as you cast this spell"); the targets are "any number of target
 * creatures" (also "creatures and/or planeswalkers your opponents control"), "up to three target creatures" (the fewest is none) or "one or two
 * targets" (any target, at least one). The damage is dealt by "~" or by "it" (the source of the ability, CR 113.7a: the lowering reads only the
 * "it" that is `~` itself). Spells, activated abilities and triggered abilities announce the division as they are put on the stack (CR 601.2d,
 * 602.2b, 603.3d); the lowering reads it with a total that is a number or an amount read then.
 */
export const EFFECT_DAMAGE_DIVIDED = defineRule<Clauses>({
  id: 'effect.damage-divided',
  family: 'effect',
  leading: ['~', 'it'],
  cites: [
    'CR 601.2d (Casting Spells)',
    'CR 602.2b (Activating Activated Abilities)',
    'CR 603.3d (Handling Triggered Abilities)',
    'CR 120.3 (Damage)',
    'CR 115.1 (Targets)',
  ],
  examples: [
    '~ deals X damage divided as you choose among any number of target creatures',
    '~ deals 3 damage divided as you choose among any number of target creatures',
    '~ deals 4 damage divided as you choose among up to three target creatures',
    '~ deals X damage divided as you choose among any number of target creatures you don’t control',
    // Prismari deck, group 2 (D-657, CR 115.4): any target, as many as the damage can be divided among.
    '~ deals 4 damage divided as you choose among any number of targets',
    '~ deals 2 damage divided as you choose among one or two targets',
    // Inferno Titan (CR 601.2d, 603.3d): one to three targets of any kind.
    '~ deals 3 damage divided as you choose among one, two, or three targets',
    'it deals 5 damage divided as you choose among any number of target creatures and/or planeswalkers your opponents control',
  ],
  rejects: [
    '~ deals X damage divided as you choose among any number of target creatures and draw a card',
    '~ deals X damage divided among any number of target creatures',
    '~ deals X damage divided as you choose among any number of creatures',
    '~ deals X damage divided as you choose among target creature',
    '~ deals X damage divided as you choose among one target creature',
    '~ deals X damage as you choose among any number of target creatures',
    '~ deals damage divided as you choose among any number of target creatures',
    '~ deals X damage divided as you choose among any target',
    '~ deals 4 damage divided as you choose among any number of targets you control',
    '~ deals 2 damage divided as you choose among one or two target',
    '~ deals 3 damage divided as you choose among one, two, or three target',
    '~ deals 3 damage divided as you choose among one, two or three targets',
    'it deals 2 damage divided as you choose among one or two creatures',
    'its deals 2 damage divided as you choose among one or two targets',
  ],
  parse: single(
    'effect.damage-divided',
    sequence(
      choice(
        map(literal('~ deals '), () => null),
        map(
          sequence(family<IrNoun>('noun', { only: ['noun.it'] }), literal(' deals ')),
          ([it]) => it,
        ),
      ),
      family<IrAmount>('amount', { only: ['amount.number', 'amount.x'] }),
      literal(' damage divided as you choose among '),
      choice(
        family<IrNoun>('noun', {
          only: [
            'noun.any-number-targets',
            'noun.any-number-of-targets',
            'noun.one-or-two-targets-bare',
            'noun.one-two-or-three-targets-bare',
          ],
        }),
        satisfy(
          family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
          (noun) => noun.upTo && noun.plural,
        ),
      ),
    ),
    ([source, amount, , to]) => ({
      verb: 'dealDividedDamage',
      args: source === null ? { amount, to } : { source, amount, to },
    }),
  ),
});

export const DINOSAUR_EFFECT_RULES = [
  EFFECT_DOUBLE_PT,
  EFFECT_FIGHT,
  EFFECT_FIGHT_EACH,
  EFFECT_EXCESS_DAMAGE,
  EFFECT_REVEAL_UNTIL,
  EFFECT_EACH_OPPONENT_REVEALS_UNTIL,
  EFFECT_REVEAL_UNTIL_MAY_PUT,
  EFFECT_CAST_FREE,
  EFFECT_FOR_EACH_CREATE,
  EFFECT_DAMAGE_DIVIDED,
];
