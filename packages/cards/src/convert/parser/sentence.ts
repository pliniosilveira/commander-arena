/**
 * Sentences of a body: effect clauses joined by "and" or "then" (or none), ending in a period.
 * Whether a join splits two clauses is decided by the effect family: it does only where an effect
 * rule reads the words after it, so "Destroy target artifact and target creature" is one clause
 * with two operands and "Destroy target creature and draw a card" is two.
 */
import {
  choice,
  fail,
  literal,
  map,
  optional,
  type Parser,
  pattern,
  quiet,
  sequence,
} from './combinators';
import type { IrAmount, IrClause, IrCondition, IrNoun, IrSentence } from './ir/types';
import { CHOSEN_PLAYER_CONDITION_RULES } from './rules/condition/chosen-player';
import { CONDITION_THIS_HAS_COUNTER_COUNT } from './rules/condition/counter-count';
import { LEAD_GAME_STATE_CONDITIONS } from './rules/condition/game-state';
import { CLAUSE_JOIN, connectorOf, listWithJoins } from './rules/effect/operands';
import { spellPhrase, withoutZone } from './rules/noun/phrases';
import { family, spanned } from './rules/registry';
import { makeNoun } from './rules/trigger/subjects';

/**
 * The end of a sentence: its period, or, when the sentence ends with an ability in quotes, the period inside the closing quote (stage P35, D-176):
 * `create a 1/1 black and green Pest creature token with "When this token dies, you gain 1 life."` has no other (a quote inside the quote
 * closes first: `.'"`). Nothing is read; the quote must be the last character, as the segmenter keeps a quote's own period inside the sentence and so cannot end a sentence after one.
 */
const QUOTE_ENDS_SENTENCE: Parser<string> = (ctx, pos) =>
  pos === ctx.text.length && /\.['’]?["”]$/u.test(ctx.text.slice(Math.max(0, pos - 3), pos))
    ? { ok: true, value: '', pos }
    : fail(ctx, pos);

const SENTENCE_END: Parser<string> = choice(literal('.'), QUOTE_ENDS_SENTENCE);

/**
 * The bare comma between the instructions of a list of three or more ("Shuffle your graveyard into your library, draw X cards, untap up to five lands, and you
 * have no maximum hand size", CR 608.2c: followed in the order written): only when the sentence goes on to a closing ", and " (the last join of the list), so a
 * comma that ends an instruction before something else ("..., where X is ...") is not taken for one. The list may close with ", then " as well
 * ("Amass Orcs 5, mill five cards, then return a creature card from your graveyard to the battlefield", CR 608.2c).
 */
const LIST_COMMA: Parser<string> = (ctx, pos) => {
  const comma = literal(', ')(ctx, pos);
  if (!comma.ok) return comma;
  return /^[^.]*, (?:and |then )/u.test(ctx.text.slice(comma.pos)) ? comma : fail(ctx, pos);
};

const CLAUSE_ITEM = family<readonly IrClause[]>('effect');

const CLAUSES: Parser<{ items: (readonly IrClause[])[]; joins: string[] }> = listWithJoins(
  CLAUSE_ITEM,
  choice(CLAUSE_JOIN, LIST_COMMA),
);

/** The join of "..., then you may ..." (CR 608.2d): the instruction after it is an offer. */
export const THEN_YOU_MAY = ', then you may ';

/**
 * "Create a Food token, then you may exile three cards from your graveyard." (Squirreled Away deck, group 4, CR 608.2d): the join of an offer that follows an instruction in the same
 * sentence. Only where the plain ", then" with what follows does not read (a text the grammar read before keeps its reading), so a "you may" the clause rules already know is theirs.
 */
const THEN_MAY_JOIN: Parser<string> = (ctx, pos) => {
  const join = literal(THEN_YOU_MAY)(ctx, pos);
  if (!join.ok) return join;
  const plain = CLAUSE_JOIN(ctx, pos);
  if (plain.ok && CLAUSE_ITEM(ctx, plain.pos).ok) return fail(ctx, pos);
  return join;
};

/** The clauses of a sentence of a body that offers things (`may: true`): the same list, with the join of an offer in the middle. */
const CLAUSES_WITH_OFFER: Parser<{ items: (readonly IrClause[])[]; joins: string[] }> =
  listWithJoins(CLAUSE_ITEM, choice(THEN_MAY_JOIN, CLAUSE_JOIN, LIST_COMMA));

/**
 * The conditions of stage P30 (D-135) that may begin a sentence: "If it's a Zombie card, draw a card." (CR 608.2c: what an
 * object an earlier instruction moved is) and "If the gift was promised, return target creature card ..." (CR 702.174k).
 */
const RECURSION_LEAD_CONDITIONS = [
  'condition.exiled-this-way',
  'condition.it-matches',
  // Issue 128 (Tezzeret, Betrayer of Flesh): "If it isn't a Vehicle, ...".
  'condition.it-isnt-a',
  // Uglúk of the White Hand: "If that creature was a Goblin or Orc, put two +1/+1 counters on ~ instead."
  'condition.that-was-either',
  // Moria Scavenger (CR 602.2b, 701.9a): "If the discarded card was a creature card, amass Orcs 1." in the body of an activated ability whose cost discards.
  'condition.discarded-card-matches',
  // D-298: "If its mana value was 3 or less, scry 1."
  'condition.its-mana-value',
  'condition.gift-promised',
  // Stage P37 (D-180): "If you put a Cave onto the battlefield this way, you gain 4 life."
  'condition.put-this-way',
  // Issue 159 (Liliana, Untouched by Death): "If at least one Zombie card is milled this way, each opponent loses 2 life."
  'condition.milled-this-way',
  // D-412 (Danitha deck group 2): "If you control a Squirrel or returned a Squirrel card to your hand this way, create a Food token."
  'condition.control-or-returned',
  // Stage P49 (D-206): "Then if this spell was cast from a graveyard, put two +1/+1 counters on that token."
  'condition.cast-from-graveyard',
  // Issue 244 (Return to Dust): "If you cast this spell during your main phase, you may exile up to one other target artifact or enchantment."
  'condition.cast-in-own-main-phase',
  // CR 702.143a (Haunting Voyage): "If this spell was foretold, return all creature cards of that type from your graveyard to the battlefield instead."
  'condition.foretold',
  // Burning Curiosity (CR 118.8, 701.68a): "If this spell's additional cost was paid, exile the top three cards instead."
  'condition.additional-cost-paid',
  // Baleful Mastery (CR 118.9): "If the {1}{B} cost was paid, an opponent draws a card."
  'condition.alt-cost-paid',
  // Issue 233 (Martial Coup): "If X is 5 or more, destroy all other creatures."
  'condition.x-at-least',
  // Yavimaya Bloomsage: "Then if that creature has power 7 or greater, ~ becomes prepared."
  'condition.that-object-power',
  // Conformer Shuriken: "If that creature has greater power than ~, put a number of +1/+1 counters on ~ equal to the difference."
  'condition.that-object-greater-power-than-self',
  // Meren of Clan Nel Toth: "If that card's mana value is less than or equal to the number of experience counters you have, return it to the battlefield."
  'condition.that-mana-value-at-most',
] as const;

/**
 * The tests of a count of permanents, the greatest of a stat and a commander (stage P32, D-147, CR 608.2c): "If you control a creature with
 * power 4 or greater, add two mana of any one color instead.", "... draw two cards if you control the creature with the greatest power or
 * tied for the greatest power." The lowering reads them as the engine's `controlsAtLeast`, `controlsGreatest` and `controlCommander`.
 */
const CONTROL_CONDITIONS = [
  'condition.control-greatest',
  'condition.control-a',
  'condition.dont-control-a',
  'condition.control-at-least',
  'condition.control-none',
  // Issue 128 (Mechanized Production): "Then if you control eight or more artifacts with the same name as one another, you win the game."
  'condition.same-name',
  'condition.control-commander',
  'condition.control-your-commander',
  // Auntie Ool, Cursewretch: "draw a card if you control that creature. If you don't control it, ...".
  'condition.control-that-creature',
] as const;

/** "If the creature you control has trample, excess damage is dealt to that creature's controller instead." (stage P32). */
const OBJECT_LEAD_CONDITIONS = ['condition.object-has-keyword'] as const;

/** "none of those creatures attacked you" (stage P33, D-150, CR 508.1b): the attackers that triggered an ability about an attack. */
const ATTACKERS_CONDITIONS = ['condition.those-attacked-you'] as const;

/**
 * "an opponent was dealt 7 or more damage this turn" (stage P34, D-152, CR 120.3): a test of the turn, said before or after an instruction
 * ("You may play the exiled card without paying its mana cost if an opponent was dealt 7 or more damage this turn.").
 */
const TURN_CONDITIONS = [
  'condition.creature-died-this-turn',
  'condition.player-dealt-damage',
  // Issue 279: "You may play the exiled card without paying its mana cost if you attacked with three or more creatures this turn."
  'condition.attacked-with-creatures',
  // Stage P69 (D-252, D-253): the Bruna deck, "if you gained 3 or more life this turn", "... if your life total is greater than your starting life total".
  'condition.life-gained-this-turn',
  'condition.life-above-starting',
  // Issue 159 (Laboratory Drudge): "draw a card if you've cast a spell from a graveyard or activated an ability of a card in a graveyard this turn".
  'condition.cast-from-graveyard-this-turn',
  // Conduit of Worlds: "If you haven't cast a spell this turn, you may cast that card."
  'condition.no-spell-cast-this-turn',
  // Issue 144 (Great Train Heist): "If it's your combat phase, there is an additional combat phase after this phase." (CR 506.1, 500.8).
  'condition.your-combat-phase',
  // Limit Break deck, group 4 (Tifa, Martial Artist): "If it's the first combat phase of your turn, there is an additional combat phase after this phase."
  'condition.first-combat-phase',
  // Food and Fellowship deck, group B (Motivated Pony): "If a Food entered the battlefield under your control this turn, untap those creatures ..." (CR 400.7: the turn log).
  'condition.entered-this-turn',
  // Mind Flayarrrs deck (River of Tears): "{T}: Add {U}. If you played a land this turn, add {B} instead." (CR 305.1, 605.3b).
  'condition.played-land-this-turn',
] as const;

/**
 * "If you have at least 15 life more than your starting life total, exile ~ and each artifact and creature your opponents control." (D-267, CR 608.2c:
 * the test of the sentence's own instruction, made as it resolves): the life total of the player the ability is controlled by. Read before an instruction only: the
 * trailing form is not read, and a triggered ability's own "if" before its effect is the trigger's (the intervening "if", CR 603.4).
 */
const LIFE_LEAD_CONDITIONS = ['condition.life-total'] as const;

/**
 * "If the result is 1, ..." (D-271, CR 706.2, 706.3a): the result of the roll before it. A sentence may start with it, or end with it after one
 * instruction; the lowering reads it only after a roll of the same text.
 */
const DIE_CONDITIONS = ['condition.die-result', 'condition.die-result-range'] as const;

/**
 * "If five or more mana was spent to cast that spell, ~ deals 3 damage to each opponent instead." (issue 25, CR 601.2h, 608.2c): the mana spent on the spell a
 * cast trigger is about; the lowering reads it in the body of such a trigger only.
 */
const MANA_SPENT_CONDITIONS = [
  'condition.mana-spent-or-more',
  // Prismari deck, group 3 (issue 87, D-661): "If the total mana value of the cards exiled this way is 13 or less, you may cast any number of spells ..." (CR 202.3, 608.2c).
  'condition.total-mana-value-exiled-this-way',
  // Prismari deck, group 2 (issue 87, D-646): "If that spell's mana value is 5 or greater, create three of those tokens instead." (CR 202.3).
  'condition.spell-mana-value-or-more',
] as const;

/**
 * "If that spell's power is 4 or greater, draw a card." (CR 208.1, 608.2c): a stat of the spell a cast trigger is about, read as the instruction comes up; the lowering
 * reads it in the body of such a trigger only.
 */
const TRIGGER_SPELL_CONDITIONS = ['condition.that-spells-stat'] as const;

/**
 * Galadriel deck, group 1 (issue 43): "If this is the second time this ability has resolved this turn, the Ring tempts you." (CR 608.2c). Food and Fellowship deck (Frodo,
 * Adventurous Hobbit): "Then if ~ is your Ring-bearer and the Ring has tempted you two or more times this game, draw a card." (CR 701.54).
 */
const RESOLUTION_CONDITIONS = [
  'condition.resolved-times',
  'condition.ring-bearer-and-tempted',
  'condition.this-is-ring-bearer',
  'condition.ring-tempted-times',
] as const;

const LEAD_CONDITIONS = [
  ...MANA_SPENT_CONDITIONS,
  ...TRIGGER_SPELL_CONDITIONS,
  ...RESOLUTION_CONDITIONS,
  ...DIE_CONDITIONS,
  // CR 701.30d (Hoarder's Greed): "If you win, repeat this process." after a clash.
  'condition.you-win-clash',
  // Stage P52 (D-210): "If a creature card was discarded this way, ..." after a discard.
  'condition.discarded-this-way',
  // D-358: "If you discarded an instant or sorcery card this way, ..." after a discard.
  'condition.discarded-spell-this-way',
  // Federation Fleet deck, group D: "If you put two or more +1/+1 counters on creatures this way, draw a card." after counters put on creatures.
  'condition.put-counters-this-way',
  // Lorehold group 1: "If you search your library this way, shuffle." after a search.
  'condition.searched-this-way',
  // Elven Council deck: "If time gets more votes, ..." after a vote.
  'condition.vote-result',
  // Death Toll deck, group B: "If two cards that share all their card types were milled this way, sacrifice ~." after a mill.
  'condition.two-milled-cards-share-all-types',
  // Death Toll deck, group D: "If a creature is destroyed this way, you gain life equal to its toughness." after a destroy.
  'condition.destroyed-this-way',
  // Saw in Half: "If that creature dies this way, ..." after a destroy.
  'condition.dies-this-way',
  // Death Toll deck: "Delirium — Then if there are four or more card types among cards in your graveyard, create ..." (CR 205.2a, 608.2c).
  'condition.card-types-among',
  // Prize Pig: "Then if there are three or more ribbon counters on ~, remove those counters and untap it." (CR 122.1, 608.2c).
  'condition.there-are-counters-on-self',
  // Kes, Evolving Telepath: "Then if she has nine or more time counters on her, sacrifice her." (CR 122.1, 608.2c).
  'condition.this-counter-count',
  // Incubation Druid: "If ~ has a +1/+1 counter on it, add three mana of that type instead." (CR 122.1, 608.2c).
  'condition.this-has-counter',
  // Fevered Visions: "If the player is your opponent and has four or more cards in hand, ~ deals 2 damage to that player." (CR 603.2b, 402.1, 608.2c).
  'condition.the-player-is-opponent-with-cards',
  // Transpose (CR 702.88a): "If this spell was cast from your hand, ..." in the text of a spell.
  'condition.cast-from-hand',
  // Foretell spells (Lifestream's Blessing): "If this spell was cast from exile, ..." in the text of a spell.
  'condition.cast-from-exile',
  ...LEAD_GAME_STATE_CONDITIONS,
  // Slithermuse: "If that player has more cards in hand than you, ..." after "Choose an opponent.".
  ...CHOSEN_PLAYER_CONDITION_RULES.map((r) => r.id),
  ...TURN_CONDITIONS,
  ...LIFE_LEAD_CONDITIONS,
  ...RECURSION_LEAD_CONDITIONS,
  ...CONTROL_CONDITIONS,
  ...OBJECT_LEAD_CONDITIONS,
  ...ATTACKERS_CONDITIONS,
];

/**
 * "If ~ was kicked, " (and, in a triggered ability's body, "If you do, " after an offer to pay, stage P21):
 * the condition a sentence may start with, and the comma after it. `quiet`: a sentence that starts with
 * some other "If" (or "If ~ was kicked" and a stop later) reports its stop where it always did, not after
 * the "If".
 */
function leadCondition(ifYouDo: boolean): Parser<IrCondition> {
  return quiet(
    map(
      sequence(
        // Stage P49 (D-206): "Then if ..." says only that the sentence follows the one before it, as every sentence does (CR 608.2c).
        // Meren deck, Braids: "For each opponent who doesn't, ..." starts the sentence the way "If they don't, ..." does; its rule reads the words.
        pattern(/(?:then )?(?:if |(?=for each opponent who doesn['’]t))/iu),
        family<IrCondition>('condition', {
          only: ifYouDo
            ? [
                'condition.kicked',
                'condition.if-you-do',
                // Stage P52 (D-210): "If the player doesn't," after "target opponent may have you ...".
                'condition.player-declines',
                'condition.each-opponent-declines',
                // D-403 (Danitha deck, Cosmic Rebirth): "If you don't put it onto the battlefield, put it into your hand."
                'condition.you-dont-put-it-onto-battlefield',
                // D-411 (Danitha deck group 2): "If you don't, put a +1/+1 counter on this creature." after "You may put a land card from among them into your hand."
                'condition.if-you-dont',
                // Eldrazi Monument (CR 701.21a): "If you can't, sacrifice ~." after "sacrifice a creature."
                'condition.if-you-cant',
                ...LEAD_CONDITIONS,
              ]
            : ['condition.kicked', ...LEAD_CONDITIONS],
        }),
        literal(', '),
      ),
      ([, condition]) => condition,
    ),
  );
}

const IF_KICKED = leadCondition(false);

/**
 * ", where X is the number of Zombies you control" (stage P28, CR 107.3c): what the text defines X as, which ends a
 * sentence. The clauses before it say X; the lowering writes the definition into each slot that does.
 */
const WHERE_X: Parser<IrAmount> = quiet(
  map(
    sequence(
      literal(', '),
      family<IrAmount>('amount', {
        only: ['amount.where-x', 'amount.where-x-exiled-creatures', 'amount.where-x-energy-paid'],
      }),
    ),
    ([, amount]) => amount,
  ),
);
const IF_KICKED_OR_YOU_DO = leadCondition(true);

/**
 * The tests a sentence may end with, " if you control the creature with the greatest power or tied for the greatest power" (stage P32,
 * D-147, CR 608.2c: the instruction is followed only when the condition holds as it comes up): counts of permanents, the greatest of a
 * stat, a commander, and the tests of the game. A trailing "if" is read only after one instruction, so the condition cannot be taken
 * for another instruction's; the lowering is the lead condition's (`conditional`). `quiet`: a sentence that ends in some other " if"
 * stops where it always did.
 */
const TRAILING_CONDITIONS = [
  ...DIE_CONDITIONS,
  ...LEAD_GAME_STATE_CONDITIONS,
  ...TURN_CONDITIONS,
  ...CONTROL_CONDITIONS,
  ...ATTACKERS_CONDITIONS,
  // Issue 89: "it gets +2/+0 until end of turn if it's attacking one of your opponents" (CR 508.1b).
  'condition.it-attacking-opponents',
  // Issue 101 (Zurgo Stormrender): "draw a card if it was attacking" (CR 506.4, 603.10a).
  'condition.it-was-attacking',
  // Selvala, Heart of the Wilds: "its controller may draw a card if its power is greater than each other creature's power" (CR 608.2c).
  'condition.its-stat-greater-than-each-other',
  // Shelinda, Yevon Acolyte: "put a +1/+1 counter on that creature if its power is less than ~'s power" (CR 608.2c).
  'condition.its-power-less-than-self',
  // Limit Break deck, group 4 (Vincent, Vengeful Atoner): "it deals that much damage to each other opponent if ~'s power is 7 or greater".
  'condition.this-power',
  // Summoner's Sending: "put a +1/+1 counter on it if the exiled card's mana value is 4 or greater".
  'condition.exiled-mana-value-at-least',
  // Descend upon the Sinful, Unholy Heat (CR 207.2c, 205.2a): "Create a 4/4 ... token if there are four or more card types among cards in your graveyard." (Delirium).
  'condition.card-types-among',
  // Zimone, Mystery Unraveler: "manifest dread if this is the first time this ability has resolved this turn. Otherwise, ..." (CR 608.2c).
  'condition.resolved-times',
] as const;

const TRAILING_IF: Parser<{ readonly condition: IrCondition; readonly instead: boolean }> = quiet(
  map(
    sequence(
      choice(literal(' instead if '), literal(' if ')),
      family<IrCondition>('condition', { only: TRAILING_CONDITIONS }),
      optional(literal(' instead'), null),
    ),
    ([lead, condition, tail]) => ({
      condition,
      instead: lead.startsWith(' instead') || tail !== null,
    }),
  ),
);

interface SentenceOptions {
  /**
   * "You may ..." is read and every clause of the sentence is optional (CR 603.5). `'discard'` (stage P56, D-214, P63 D-216): only "You may discard ..." and
   * "You may shuffle." are read, the offers of a spell ("You may discard a card. If you do, draw a card.", Ponder's "You may shuffle."); a "may" of a spell the
   * engine does not run stays unread. D-403 (Danitha deck, Cosmic Rebirth): "You may put it onto the battlefield." too, the offer
   * of a card a target phrase of the spell named, which only the pair of sentences of `lowerMayElse` runs.
   */
  readonly may: boolean | 'discard' | 'afterTest';
  /**
   * "If ~ was kicked, ..." may start the sentence and " instead" end it (CR 608.2c, 614.1a). Only
   * the bodies whose lowering handles a conditional sentence ask for it, so a condition is never
   * dropped by a lowering that does not know it.
   */
  readonly conditional: boolean;
  /**
   * "... unless that player pays {1}" may end the sentence (stage P18, CR 118.12a): the instruction runs
   * unless a player pays. It follows one clause, and only a triggered ability's body asks for it, where
   * the lowering knows who "that player" is.
   */
  readonly unless?: boolean | 'energy';
  /**
   * "If you do, ..." may start the sentence (stage P21, CR 608.2c): what a payment offered by the sentence
   * before it ("You may pay {4}.") buys. Only a triggered ability's body asks for it, where the offer can be
   * made and the lowering joins the two sentences.
   */
  readonly ifYouDo?: boolean;
  /**
   * "When you do, ..." may start the sentence (stage P30, CR 603.12): the reflexive triggered ability the "you may" sentence
   * before it creates when the player did what it offered. Only a triggered ability's body asks for it.
   */
  readonly reflexive?: boolean;
  /**
   * "When you discard a nonland card this way, ..." may start the sentence (Federation Fleet deck, group D, CR 603.12): the reflexive ability the discards of the sentence before it create.
   * The activated and triggered abilities' bodies ask for it, where the lowering joins the two.
   */
  readonly afterDiscard?: boolean;
  /**
   * "When you exile a card this way, ..." may start the sentence (Cait Sith, Fortune Teller, CR 603.12): the reflexive ability the exile of the sentences before it creates. Only the body
   * of a triggered ability asks for it, where the lowering joins the two.
   */
  readonly afterExile?: boolean;
  /**
   * "When you reveal a creature card this way, ..." may start the sentence (Yuna's Whistle, CR 603.12): the reflexive ability the "reveal cards until" before it creates. The text of a spell asks for it.
   */
  readonly afterReveal?: boolean;
  /**
   * "When you do, if it has four or more quest counters on it, ..." may start the sentence (Earthbender Ascension, CR 603.12, 603.4): the reflexive ability of the counter put by the sentence
   * before it. Only the body of a triggered ability asks for it, where the lowering joins the two.
   */
  readonly afterCounters?: boolean;
  /**
   * "1—9 | Tap all creatures your opponents control." (Hylda deck, group 2, D-525, CR 706.3a): a row of the results table of a die roll starts the sentence with its range
   * ("N", "N—M", "N+") and a bar. The sentence is read after the bar and carries the range (`IrSentence.dieRow`); the sentences after it, up to the next row, are the same row. Only the
   * text of a spell asks for it, where the lowering of the whole text (`lowerSentences`) joins the roll and its rows.
   */
  readonly dieRows?: boolean;
  /**
   * "At the beginning of your next end step, ..." may start the sentence (stage P34, D-152, CR 603.7): what a delayed triggered ability does.
   * Only the bodies whose lowering wraps the sentence in the engine's `delayedTrigger` ask for it.
   */
  readonly delayed?: boolean;
}

/** "When you next cast an instant or sorcery spell this turn, " (D-336), and "When you cast your next instant or sorcery spell this turn, " (Twinferno): the spell is the subject of what the sentence does. */
const NEXT_CAST_LEAD: Parser<NonNullable<IrSentence['delayed']>> = map(
  spanned(
    sequence(
      choice(
        map(sequence(literal('when you next cast '), pattern(/an? /iu)), () => null),
        map(literal('when you cast your next '), () => null),
      ),
      map(spellPhrase(), withoutZone),
      // Quandrix Unlimited group E (Brass Infiniscope, CR 107.3): "a spell with {X} in its mana cost".
      optional(
        pattern(
          / with (?:\{X\} in its mana cost|a mana cost that contains \{X\})(?= this turn, )/iu,
        ),
        null,
      ),
      literal(' this turn, '),
    ),
  ),
  ({ value, span }) => ({
    step: 'nextCast' as const,
    whose: 'you' as const,
    spell: makeNoun(
      'sentence.delayed-cast',
      span,
      'a',
      value[2] === null ? value[1] : { ...value[1], xInManaCost: true },
    ),
  }),
);

/** "Whenever you cast a noncreature spell this turn, " (Summon: Good King Mog XII, CR 603.7): a delayed ability of the turn that triggers at every such cast. */
const EACH_CAST_LEAD: Parser<NonNullable<IrSentence['delayed']>> = map(
  spanned(
    sequence(
      literal('whenever you cast '),
      pattern(/an? /iu),
      map(spellPhrase(), withoutZone),
      literal(' this turn, '),
    ),
  ),
  ({ value, span }) => ({
    step: 'nextCast' as const,
    whose: 'you' as const,
    repeat: true as const,
    spell: makeNoun('sentence.delayed-cast', span, 'a', value[2]),
  }),
);

/** "At the beginning of your next end step, " and "At the beginning of the next end step, " (stage P34, D-152): the delayed trigger's moment. */
const DELAYED_LEAD: Parser<NonNullable<IrSentence['delayed']>> = quiet(
  choice<NonNullable<IrSentence['delayed']>>(
    map(literal('at the beginning of your next end step, '), () => ({
      step: 'endStep' as const,
      whose: 'you' as const,
    })),
    map(literal('at the beginning of the next end step, '), () => ({
      step: 'endStep' as const,
      whose: 'each' as const,
    })),
    // Stage P41 (D-188): the combat phase the sentence before it added (the lowering folds it into that sentence's effect).
    map(literal('at the beginning of that combat, '), () => ({
      step: 'thatCombat' as const,
      whose: 'you' as const,
    })),
    // Issue 144 (CR 603.7, 603.7c, 510.3a): "Whenever a creature you control deals combat damage to that player this turn, ": the player a target before it named.
    map(
      literal('whenever a creature you control deals combat damage to that player this turn, '),
      () => ({
        step: 'combatDamageToThatPlayer' as const,
        whose: 'you' as const,
      }),
    ),
    // Forth Eorlingas! (CR 603.7, 603.2c, 510.2): the creatures that deal combat damage in one event to players, this turn.
    map(
      literal(
        'whenever one or more creatures you control deal combat damage to one or more players this turn, ',
      ),
      () => ({
        step: 'combatDamageBatch' as const,
        whose: 'you' as const,
      }),
    ),
    // Massacre Girl (CR 603.7, 603.10a, 700.4): the creatures that die, any player's, for the rest of the turn.
    map(literal('whenever a creature dies this turn, '), () => ({
      step: 'creatureDies' as const,
      whose: 'you' as const,
    })),
    // D-336 (CR 603.7, 603.7a): "When you next cast an instant or sorcery spell this turn, ": the next spell of that kind its controller casts.
    NEXT_CAST_LEAD,
    EACH_CAST_LEAD,
  ),
);

/**
 * "Each player may ", "Target opponent may have you " (stage P52, D-210, CR 608.2d, 101.4): the players a triggered ability asks whether to do the instructions of the
 * sentence, and, with "have you", that the controller does them. A player noun and "may"; "you may" is the sentence's own prefix.
 */
const PLAYER_MAY: Parser<NonNullable<IrSentence['mayBy']>> = quiet((ctx, pos) => {
  // Looked at first, so that a sentence about a player that does not say "may" stops where it always did. "Its controller may search ..." stays with `effect.search-by` (White Orchid
  // Phantom, CR 701.23a), which reads the search of that controller's own library; "Its controller may pay 1 life. If they do, they draw a card." is one instruction of its own (Gix,
  // Yawgmoth Praetor, `effect.its-controller-may-pay-draw`).
  const ahead = pattern(
    /(?=(?:each (?:other )?(?:player|opponent)|target (?:player|opponent)) may |(?:its|that (?:creature|permanent|land|artifact|enchantment|planeswalker)['’]s) controller may (?!search |pay [^.]*\. if they do, they draw ))/iu,
  )(ctx, pos);
  if (!ahead.ok) return ahead;
  return map(
    sequence(
      // "Its controller may draw a card" (Synapse Sliver, CR 109.4, 608.2d): the controller of an object the text named is the player asked.
      family<IrNoun>('noun', { only: ['noun.player', 'noun.its-controller'] }),
      literal(' may '),
      optional(literal('have you '), null),
    ),
    ([who, , haveYou]) => ({ who, haveYou: haveYou !== null }),
  )(ctx, pos);
});

/** "Each player may discard ..." at the start of a spell's sentence (CR 608.2d, 101.4): each player is asked whether to discard, and the rest of the sentence is theirs if they do. */
const EACH_PLAYER_MAY_DISCARD: Parser<NonNullable<IrSentence['mayBy']>> = (ctx, pos) => {
  const ahead = quiet(pattern(/(?=each player may discard )/iu))(ctx, pos);
  return ahead.ok ? PLAYER_MAY(ctx, pos) : ahead;
};

/** " unless you pay {E}{E}" (stage P51, D-209, CR 107.14): the payment of energy only, which a spell's sentence reads (the other costs stay a trigger's). */
const UNLESS_ENERGY: Parser<IrCondition> = (ctx, pos) => {
  // Looked at quietly first: a sentence that does not end so stops where it always did.
  const ahead = quiet(pattern(/(?= unless you pay \{E\})/u))(ctx, pos);
  if (!ahead.ok) return ahead;
  return quiet(
    map(
      sequence(literal(' '), family<IrCondition>('condition', { only: ['condition.unless-pays'] })),
      ([, condition]) => condition,
    ),
  )(ctx, pos);
};

/**
 * " unless that player pays {1}": the cost that stops the instruction before it; and, since stage P23, " unless
 * it escaped" (CR 702.138b), the permanent's own history that does. The lowering of a triggered ability decides
 * which of them it can run.
 */
const UNLESS_PAYS: Parser<IrCondition> = map(
  sequence(
    literal(' '),
    family<IrCondition>('condition', {
      only: ['condition.unless-pays', 'condition.unless-escaped', 'condition.unless-return'],
    }),
  ),
  ([, condition]) => condition,
);

/**
 * A sentence parser. With `may`, "You may ..." is read and every clause of the sentence is
 * optional (CR 603.5: the controller chooses as the ability resolves). Only triggered abilities
 * ask for it: the engine has no "may" on spell effects or activated abilities yet, so there the
 * words stay unread. With `conditional`, a leading "If ~ was kicked, " is the sentence's condition
 * and a trailing " instead" says that it replaces the sentence before it.
 */
/** "1—9 | ", "20 | ": the range of a row of a results table (CR 706.3a: "a single number" or "a range of numbers with two endpoints in the form N1–N2"). */
const DIE_ROW: Parser<{ from: number; to: number }> = (ctx, pos) => {
  const r = pattern(/(\d+)(?:[—–-](\d+))? \| /u)(ctx, pos);
  if (!r.ok) return r;
  const from = Number(r.value[1]);
  const to = r.value[2] === undefined ? from : Number(r.value[2]);
  return { ok: true, value: { from, to }, pos: r.pos };
};

function sentenceParser(options: SentenceOptions): Parser<IrSentence> {
  const plain = plainSentence(options);
  // "Then discard two cards unless ..." (stage P31, D-140): "then" at the start of a sentence says only that it comes after the one
  // before, which every sentence does (CR 608.2c). A sentence that does not read after it stops where it always did, at "Then".
  return (ctx, pos) => {
    // D-525 (CR 706.3a): a row of the results table of a die roll.
    if (options.dieRows === true) {
      const row = DIE_ROW(ctx, pos);
      if (row.ok) {
        const read = plain(ctx, row.pos);
        if (!read.ok) return read;
        return {
          ...read,
          value: {
            ...read.value,
            dieRow: row.value,
            span: { start: pos, end: read.pos },
          },
        };
      }
    }
    const then = literal('then ')(ctx, pos);
    if (then.ok) {
      const read = quiet(plain)(ctx, then.pos);
      if (read.ok)
        return { ...read, value: { ...read.value, span: { start: pos, end: read.pos } } };
    }
    return plain(ctx, pos);
  };
}

function plainSentence(options: SentenceOptions): Parser<IrSentence> {
  return (ctx, pos) => {
    const start = pos;
    let at = start;
    let condition: IrCondition | undefined;
    let reflexive = false;
    let afterDiscard: IrSentence['afterDiscard'];
    let afterExile = false;
    let afterReveal: string | undefined;
    let afterCounters: IrSentence['afterCounters'];
    if (options.afterCounters === true) {
      const lead = sequence(
        literal('when you do, if '),
        CONDITION_THIS_HAS_COUNTER_COUNT.parse,
        literal(', '),
      )(ctx, start);
      const test = lead.ok ? lead.value[1].test : undefined;
      if (
        lead.ok &&
        test?.kind === 'amountIs' &&
        test.amount.kind === 'countersOn' &&
        test.amount.counter !== undefined &&
        test.compare.cmp === 'atLeast'
      ) {
        reflexive = true;
        afterCounters = { counter: test.amount.counter, atLeast: test.compare.value };
        at = lead.pos;
      }
    }
    if (options.afterReveal === true) {
      const lead = pattern(/when you reveal an? ([a-z]+) card this way, /iu)(ctx, start);
      if (lead.ok) {
        reflexive = true;
        afterReveal = (lead.value[1] ?? '').toLowerCase();
        at = lead.pos;
      }
    }
    if (options.afterDiscard === true) {
      // "When you discard a card this way, ..." (Summon: Kujata) is made by any card, the nonland one by a card that is not a land.
      const lead = choice(
        map(literal('when you discard a nonland card this way, '), () => 'nonland' as const),
        map(literal('when you discard a card this way, '), () => 'any' as const),
      )(ctx, start);
      if (lead.ok) {
        // The sentence is read as a reflexive one (no test of its own, no "you may"), and says which discards make it.
        reflexive = true;
        afterDiscard = lead.value;
        at = lead.pos;
      }
    }
    if (options.afterExile === true && !reflexive) {
      const lead = literal('when you exile a card this way, ')(ctx, start);
      if (lead.ok) {
        reflexive = true;
        afterExile = true;
        at = lead.pos;
      }
    }
    if (options.reflexive === true && !reflexive) {
      // Issue 121 (Bloodthirsty Adversary): "When you pay this cost one or more times, ..." is the reflexive ability of a payment made any number of times.
      const lead = choice(
        literal('when you do, '),
        literal('when you pay this cost one or more times, '),
      )(ctx, start);
      if (lead.ok) {
        reflexive = true;
        at = lead.pos;
      }
    }
    if (options.conditional && !reflexive) {
      const lead = (options.ifYouDo === true ? IF_KICKED_OR_YOU_DO : IF_KICKED)(ctx, start);
      if (lead.ok) {
        condition = lead.value;
        at = lead.pos;
      }
    }
    // "If there are seven or more cards in your graveyard, instead search your library for ..." (stage P36, D-178, CR 608.2c, 614.1a): "instead" after the
    // leading test says the same as it does at the end of the sentence, that it replaces the sentence before it.
    let otherwise = false;
    if (options.conditional && condition === undefined && !reflexive) {
      const word = literal('otherwise, ')(ctx, at);
      if (word.ok) {
        otherwise = true;
        at = word.pos;
      }
    }
    let leadingInstead = false;
    if (condition !== undefined) {
      const word = literal('instead ')(ctx, at);
      if (word.ok) {
        leadingInstead = true;
        at = word.pos;
      }
    }
    let delayed: IrSentence['delayed'];
    if (options.delayed === true && !reflexive) {
      const lead = DELAYED_LEAD(ctx, at);
      if (lead.ok) {
        delayed = lead.value;
        at = lead.pos;
      }
    }
    const may: Parser<'you' | NonNullable<IrSentence['mayBy']> | null> =
      options.may === 'discard' && !reflexive
        ? optional(
            choice<'you' | NonNullable<IrSentence['mayBy']>>(
              map(
                (c, p) => {
                  const ahead = pattern(
                    // Issue 244 (Return to Dust): "you may exile up to one other target ..." after a test of how the spell was cast.
                    /(?=you may (?:sacrifice |discard |mill |shuffle\.|put it onto the battlefield|put an? [+-]\d+\/[+-]\d+ counter on a creature\.|exile up to one other target ))/iu,
                  )(c, p);
                  return ahead.ok ? literal('you may ')(c, p) : ahead;
                },
                () => 'you' as const,
              ),
              // "Each player may discard their hand and draw five cards." (CR 608.2d, 101.4): the players of a spell are asked in turn order too (`playersMay`).
              EACH_PLAYER_MAY_DISCARD,
            ),
            null,
          )
        : // Issue 345 (Soulbright Flamekin, CR 608.2c): "If this is the third time this ability has resolved this turn, you may add ...": "you may" after a leading test only.
          // Dream Eater (CR 603.12): "When you do, you may return target ..." reads its "you may" after the lead of a reflexive ability too; the lowering of each reflexive reading
          // refuses the offer unless it is one it can run.
          options.may === true || (options.may === 'afterTest' && !reflexive)
          ? optional(
              choice<'you' | NonNullable<IrSentence['mayBy']>>(
                map(
                  (c, p) => {
                    // After a leading test only the offer of mana is read here; another "you may" is the clause's own (Conduit of Worlds: "you may cast that card").
                    // Demolition Field (CR 701.23, 608.2d): "You may search your library for a basic land card, ...", the second instruction of an activated ability, is the controller's choice at resolution.
                    const ahead =
                      options.may === 'afterTest'
                        ? pattern(
                            condition === undefined
                              ? /(?=you may (?:search |return that card to the battlefield ))/iu
                              : /(?=you may (?:add|search ))/iu,
                          )(c, p)
                        : undefined;
                    return ahead !== undefined && !ahead.ok ? ahead : literal('you may ')(c, p);
                  },
                  () => 'you' as const,
                ),
                ...(options.may === 'afterTest' ? [] : [PLAYER_MAY]),
              ),
              null,
            )
          : () => ({ ok: true as const, value: null, pos: at });
    const prefix = may(ctx, at);
    if (!prefix.ok) return prefix;
    // " instead" belongs to a conditional sentence; without a condition it is left unread, and the
    // period that should follow the clauses is what fails.
    const insteadWord: Parser<boolean> =
      condition === undefined || leadingInstead
        ? (_ctx, p) => ({ ok: true, value: leadingInstead, pos: p })
        : map(optional(literal(' instead'), null), (word) => word !== null);
    const unless: Parser<IrCondition | null> =
      options.unless === true
        ? optional(UNLESS_PAYS, null)
        : options.unless === 'energy'
          ? optional(UNLESS_ENERGY, null)
          : (_ctx, p) => ({ ok: true, value: null, pos: p });
    const trailing: Parser<{ readonly condition: IrCondition; readonly instead: boolean } | null> =
      options.conditional && condition === undefined && !reflexive
        ? optional(TRAILING_IF, null)
        : (_ctx, p) => ({ ok: true, value: null, pos: p });
    const r = sequence(
      options.may === true ? CLAUSES_WITH_OFFER : CLAUSES,
      trailing,
      optional(WHERE_X, null),
      unless,
      insteadWord,
      SENTENCE_END,
    )(ctx, prefix.pos);
    if (!r.ok) return r;
    const [list, trailingIf, where, unlessPays, instead] = r.value;
    const { items, joins } = list;
    // The test after the instruction is the sentence's own only when it is one instruction, and the sentence has no test before it.
    if (trailingIf !== null && (items.length !== 1 || (items[0]?.length ?? 0) !== 1)) {
      return fail(ctx, prefix.pos);
    }
    if (trailingIf !== null) condition = trailingIf.condition;
    // The cost stops one instruction; after several clauses "unless" would say which of them.
    if (unlessPays !== null && (items.length !== 1 || (items[0]?.length ?? 0) !== 1)) {
      return fail(ctx, prefix.pos);
    }
    const optionalClauses = prefix.value === 'you';
    // "..., then you may ...": the offer is the last group only (the "you may" covers what follows it, and nothing is read between two offers).
    if (joins.some((j, i) => j === THEN_YOU_MAY && (i !== joins.length - 1 || optionalClauses))) {
      return fail(ctx, prefix.pos);
    }
    // "Each player may discard a card.", "Target opponent may have you draw three cards." (stage P52, D-210): the question is the sentence's, not each clause's.
    const mayBy = prefix.value === null || prefix.value === 'you' ? undefined : prefix.value;
    const clauses = items.flatMap((group, i) => {
      const join = joins[i];
      const offered = optionalClauses || (i > 0 && joins[i - 1] === THEN_YOU_MAY);
      const marked = (offered ? group.map((c) => ({ ...c, optional: true })) : group).map((c) =>
        unlessPays === null ? c : { ...c, condition: unlessPays },
      );
      if (join === undefined) return marked;
      // The join after a group connects its last clause to the next group.
      return marked.map((c, j) =>
        j === marked.length - 1 ? { ...c, connector: connectorOf(join) } : c,
      );
    });
    return {
      ok: true,
      value: {
        kind: 'sentence',
        clauses,
        ...(condition === undefined ? {} : { condition }),
        ...(instead || trailingIf?.instead === true ? { instead: true } : {}),
        ...(otherwise ? { otherwise: true as const } : {}),
        ...(where === null ? {} : { where }),
        ...(reflexive &&
        afterDiscard === undefined &&
        !afterExile &&
        afterReveal === undefined &&
        afterCounters === undefined
          ? { reflexive: true as const }
          : {}),
        ...(afterReveal === undefined ? {} : { afterReveal }),
        ...(afterCounters === undefined ? {} : { afterCounters }),
        ...(afterExile ? { afterExile: true as const } : {}),
        ...(afterDiscard === undefined ? {} : { afterDiscard }),
        ...(delayed === undefined ? {} : { delayed }),
        ...(mayBy === undefined ? {} : { mayBy }),
        span: { start: pos, end: r.pos },
        rule: 'body.sentence',
      },
      pos: r.pos,
    };
  };
}

/** One sentence: clauses joined by "and" or "then", ending in a period. */
export const SENTENCE: Parser<IrSentence> = sentenceParser({ may: false, conditional: false });

/** A sentence of a spell: "If ~ was kicked, ..." and "... instead" are read. */
export const SPELL_SENTENCE: Parser<IrSentence> = sentenceParser({
  // Stage P56 (D-214): "You may discard a card. If you do, draw a card." (Improvised Act).
  may: 'discard',
  ifYouDo: true,
  conditional: true,
  // Stage P51 (D-209): "Then discard a card at random unless you pay {E}{E}." of a spell: the energy cost only, so that "Counter target spell unless
  // that player pays {3}" stays as it was.
  unless: 'energy',
  delayed: true,
  // D-525 (CR 706.3): the rows of a results table.
  dieRows: true,
  // Tip the Scales (CR 603.12): "Sacrifice a creature. When you do, ...": the lowering reads a reflexive ability only after an instruction it can tell was done.
  reflexive: true,
  // Yuna's Whistle: "When you reveal a creature card this way, put X +1/+1 counters on target creature you control, where X is the mana value of that card."
  afterReveal: true,
});

/**
 * A sentence of an activated ability's body (stage P32, D-147): the leading and trailing tests of a spell's sentence ("If it was a
 * creature card, ...", "... if creatures you control have total power 10 or greater"). The lowering of an activated ability reads
 * them as it reads any body (`lowerSentences`), and refuses them in a mana ability.
 */
export const ACTIVATED_SENTENCE: Parser<IrSentence> = sentenceParser({
  may: 'afterTest',
  conditional: true,
  // Federation Fleet deck, group D (Seven of Nine, Tertiary Adjunct): "When you discard a nonland card this way, put two charge counters on up to one target artifact."
  afterDiscard: true,
  // Conduit of Worlds: "If you haven't cast a spell this turn, you may cast that card. If you do, you can't cast additional spells this turn." (CR 608.2c): the lowering
  // reads an "If you do" only after an instruction it can tell was done, and refuses it anywhere else.
  ifYouDo: true,
  delayed: true,
});

/**
 * A sentence of a loyalty ability's body (stage P47, D-202): what the sentence of a triggered ability reads, the choices and follow-ups the
 * planeswalkers' abilities use ("You may sacrifice another permanent. If you do, you gain 1 life and draw a card.", CR 606.2). The other activated abilities
 * keep `ACTIVATED_SENTENCE`.
 */
export const LOYALTY_SENTENCE: Parser<IrSentence> = sentenceParser({
  may: true,
  conditional: true,
  unless: true,
  ifYouDo: true,
  reflexive: true,
  // Narset of the Ancient Way: "Draw a card, then you may discard a card. When you discard a nonland card this way, ~ deals damage equal to that card's mana value to target creature or planeswalker."
  afterDiscard: true,
  delayed: true,
});

/** A sentence of a triggered ability's body: "You may ..." and "If ~ was kicked, ..." are read. */
export const TRIGGER_SENTENCE: Parser<IrSentence> = sentenceParser({
  may: true,
  conditional: true,
  unless: true,
  ifYouDo: true,
  reflexive: true,
  // Summon: Kujata (chapter III): "Discard a card, then draw two cards. When you discard a card this way, ~ deals damage equal to that card's mana value to each opponent."
  afterDiscard: true,
  delayed: true,
  // Cait Sith, Fortune Teller: "When you exile a card this way, target creature you control gets +X/+0 until end of turn, where X is that card's mana value."
  afterExile: true,
  // Earthbender Ascension: "Put a quest counter on ~. When you do, if it has four or more quest counters on it, put a +1/+1 counter on target creature you control."
  afterCounters: true,
});
