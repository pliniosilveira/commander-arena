/**
 * The ability AST (SPEC 4.3). Card behavior is data: the Oracle parser and hand-written
 * overrides both produce this, and one interpreter executes it. Everything here is plain JSON.
 *
 * Conventions:
 * - Every node has a `kind` discriminant.
 * - Targets are selectors with a stable `id` (for example "t1") so the casting sequence can
 *   choose them (CR 601.2c) and the interpreter can read them back on resolution.
 * - "this" means the object the ability belongs to; "thisSpell" the spell being cast.
 */
import type { CardType, Characteristics, Color, Subtype, Supertype } from '../characteristics';
import type { CardId, ObjectId } from '../ids';
import type { ManaColor, ManaSymbol } from '../mana/types';

// ---- Zones (CR 400.1)

export const ZONES = [
  'library',
  'hand',
  'battlefield',
  'graveyard',
  'stack',
  'exile',
  'command',
  // D-234 (CR 702.26): a permanent that has phased out: treated as though it does not exist. No card text names it; the engine keeps such permanents here.
  'phased',
] as const;
export type Zone = (typeof ZONES)[number];

// ---- Amounts

export type Amount =
  | number
  /**
   * The X announced for the spell or activated ability this amount belongs to (CR 107.3a, 601.2b,
   * 602.2b, D-103): read as the effect runs, while the spell or ability is on the stack it was
   * announced for. Valid in the effect of a spell whose cost has an {X} or "pay X life", and of an
   * activated ability whose cost does; X is 0 for a spell cast without paying its mana cost (CR
   * 107.3b). Nowhere else (a triggered or static ability, an ability the object has gained, CR 107.3j).
   */
  | { readonly kind: 'x' }
  /**
   * The power of an object a reference names, including a chosen target (`target`) or what an
   * earlier instruction moved (`moved`). Read as it is now when the object is where the effect
   * expected it, and from last-known information if it left (CR 608.2h, 113.7a): "Its controller
   * gains life equal to its power" after the creature was exiled gives the power it last had,
   * counters and effects included.
   */
  | { readonly kind: 'powerOf'; readonly of: ObjectRef }
  /**
   * The mana value (CR 202.3) of an object a reference names, from last-known information if it
   * left (CR 608.2h): "You lose life equal to that card's mana value". An {X} counts as the number
   * announced while the object is a spell on the stack and as 0 anywhere else (CR 202.3e); the
   * last-known information of a spell that left the stack has lost its X (`docs/ROADMAP.md`).
   */
  | { readonly kind: 'manaValueOf'; readonly of: ObjectRef }
  /**
   * "The difference" between a number and the mana value of a card (D-151, "If the discovered card's mana value is less than 10, create a number of tapped
   * Treasure tokens equal to the difference"): `limit` less the mana value of the object `of` names (read as `manaValueOf` is), and 0 when that is
   * not more than 0 or when `of` names nothing (no card was discovered).
   */
  | { readonly kind: 'shortfall'; readonly limit: number; readonly of: ObjectRef }
  /**
   * "For each creature on the battlefield", "equal to the number of lands you control", "for each
   * card in your hand" (D-095): the number of objects in the filter's zone (the battlefield unless
   * `filter.zone` says otherwise) that match it, counted when the effect or the cost is determined:
   * as an effect's instruction runs (CR 608.2c, so after any earlier instruction of the same spell),
   * or at CR 601.2f for a cost reduction. `controller` is read as for every filter, relative to the
   * ability's controller; `other` leaves out the ability's source. `owner` is not read here. A spell
   * being cast is on the stack (CR 601.2a), so it counts as nothing in the zone it came from.
   */
  | { readonly kind: 'countOf'; readonly filter: ObjectFilter }
  /**
   * "For each time it was kicked" (CR 702.33c, 702.33d, D-110): how many times the spell that is
   * resolving, or the permanent the source is (an enters trigger of a permanent that was cast kicked),
   * was kicked: the count the caster chose for Multikicker, 1 for a spell kicked once with Kicker, 0
   * for one that was not kicked. Read from the source's own stack data, from the permanent that
   * remembers it, or from last-known information once it has left (CR 113.7a), as `kicked` is.
   */
  | { readonly kind: 'timesKicked' }
  /**
   * "The amount of mana spent to cast it", "for each mana from an artifact source spent to cast it" (CR 601.2h, D-183): how much mana was spent on
   * the cost of the spell in all, or, with `fromType`, how much of it was made by a source with that card type ("artifact": a Treasure, a Sol Ring, an
   * artifact creature). The spell is the source of a "When you cast this spell" ability (`castSpell` with `self`: read from its stack data, or from
   * last-known information if it has left the stack, CR 113.7a), and the permanent that enters, for the `count` of `othersEnterWithCounters`
   * (a permanent that did not come from a spell cast for mana has 0). Mana that paid the activation cost of a mana ability, life paid for
   * Phyrexian mana and what Convoke, Improvise or Delve paid are not counted; a copy of a spell was not cast and has 0 (CR 707.10).
   */
  | {
      readonly kind: 'manaSpent';
      readonly fromType?: string;
      /**
       * "for each {S} spent to cast this spell" (D-260, CR 107.4h, 106.3, 601.2h): only the mana that a snow source made. Not with `fromType`. In the
       * effect of the spell itself as well as in "When you cast this spell": the spell is the source of its own effect (a copy has 0, CR 707.10).
       */
      readonly snow?: true;
      /**
       * "the amount of mana spent to cast that spell" (D-217, CR 601.2h, 113.7a): the spell a target slot of the ability named, as it is or as it last was
       * (a countered spell is gone). Only the target of the same spell or ability.
       */
      readonly of?: { readonly kind: 'target'; readonly id: string };
    }
  /**
   * "The total life lost this way" (CR 702.101a, Extort, D-120): the sum of the life that the `loseLife`
   * instructions of this same resolution made players lose, before this amount is read. Only valid in a
   * `gainLife` (or other amount) that follows a `loseLife` in the same sequence.
   */
  | { readonly kind: 'lifeLostThisWay' }
  /**
   * The toughness of an object a reference names, read as `powerOf` is (D-131): "you gain life equal to that
   * creature's toughness". From last-known information when the object left (CR 608.2h, 113.7a). `of` may be the
   * `triggerSubject` permanent of a trigger.
   */
  | { readonly kind: 'toughnessOf'; readonly of: ObjectRef }
  /**
   * "For each +1/+1 counter on it" (D-131): how many counters of the kind the object a reference names has, as it is
   * now or from last-known information if it left (CR 113.7a). `counter` is the counter's name as the engine writes
   * it ("+1/+1", "-1/-1", "stun", "page", ...).
   */
  | { readonly kind: 'countersOn'; readonly of: ObjectRef; readonly counter: string }
  /**
   * "The greatest power among creatures you control", "the total power of creatures you control", "the greatest
   * mana value among artifacts you control" (D-131): over the objects `filter` matches (in its zone, the battlefield
   * unless it says otherwise), the largest or the sum of the stat as `derive` gives it now (an {X} counts as the
   * announced value on the stack, CR 202.3e). No object matched is 0; a negative result is read as 0 (CR 107.1b). An
   * object with no such stat (a noncreature has no power) is left out.
   */
  | {
      readonly kind: 'aggregate';
      readonly how: 'greatest' | 'total';
      readonly stat: 'power' | 'toughness' | 'manaValue';
      readonly filter: ObjectFilter;
    }
  /**
   * "Your devotion to black", "your devotion to white and blue" (CR 700.5, D-131): the number of mana symbols that
   * are one of the `colors` (a hybrid symbol counts for each of its colors, once; a symbol that is generic or
   * colorless counts for none) among the mana costs of the permanents the controller of the ability controls. The
   * mana cost is the one the permanent has now, after copy effects (CR 700.5a).
   */
  | { readonly kind: 'devotion'; readonly colors: readonly Color[] }
  /**
   * "The number of colors in your commander's color identity" (CR 903.4, D-131): how many of the five colors the
   * controller's commanders (all of them) have in their color identity. 0 for a player with no commander.
   */
  | { readonly kind: 'commanderColors' }
  /**
   * "The greatest mana value among your commanders" (CR 903.3, 202.3, D-145): the largest mana value among the commanders (all of them) of
   * the controller, wherever they are (the command zone, the battlefield, any other zone): the mana value of the card as printed (a copy
   * effect on a commander on the battlefield is not read, `docs/ROADMAP.md`). 0 for a player with no commander. Also readable by a static
   * ability's power or toughness (`StaticPtAmount`: "Equipped creature gets +X/+X, where X is ...").
   */
  | { readonly kind: 'commanderManaValue' }
  /**
   * "The number of times you've cast your commander from the command zone this game" (CR 903.8, D-229): the sum, over the commanders of the
   * controller (`SeatState.commanders`), of the times each was cast from the command zone (the count the commander tax is made from, `GameState.commanderCasts`).
   * 0 for a player with no commander. Also readable by a static ability's power or toughness ("Spirits you control get +1/+1 for each time ...").
   */
  /**
   * `of: 'triggerSubject'` (D-229): not the sum over the commanders but the times the one commander that is the trigger's subject (the spell the mana was spent on,
   * "the number of times it's been cast from the command zone") was cast from the command zone.
   */
  | { readonly kind: 'commanderCasts'; readonly of?: 'triggerSubject' }
  /**
   * "Half the number of ..., rounded down" (D-131): `of` divided by two and rounded as `round` says (CR 107.1a:
   * the rounding is stated; a fraction is never left).
   */
  | { readonly kind: 'half'; readonly of: Amount; readonly round: 'down' | 'up' }
  /**
   * "Twice the number of ...", "2 life for each ..." (D-131): a whole number of 2 or more times `of`. (A multiple
   * of a power or toughness that may be negative is `times` of a `PtAmount`.)
   */
  | { readonly kind: 'multiple'; readonly factor: number; readonly of: Amount }
  /** "The number of Zombies on the battlefield plus the number of Zombie cards in all graveyards" (D-131): the sum of two or more amounts. */
  | { readonly kind: 'sum'; readonly of: readonly Amount[] }
  /**
   * What an earlier instruction of this same resolution did (D-131), as `lifeLostThisWay` does for life: "for each
   * creature sacrificed this way" (`sacrificed`: the permanents the earlier `sacrifice` effects made their
   * controllers sacrifice), "for each creature destroyed this way" (`destroyed`: the permanents an earlier
   * `destroy` effect destroyed, indestructible or regenerated ones not counted) and "for each opponent who drew a
   * card this way" (`playersDrew`: the players who drew at least one card in an earlier `draw` effect) and, D-139, "gets +X/+0
   * where X is the number of Myr tapped this way" (`tapped`: the permanents an earlier `tap` effect tapped). Counted over
   * the whole resolution so far; valid only after an effect of that kind in the same sequence.
   */
  | { readonly kind: 'thisWay'; readonly what: ThisWayKind }
  /**
   * "That much" for the damage that caused a trigger (D-133, CR 120.3): the amount of damage the source dealt in the
   * event of a `dealtDamage` or `dealsCombatDamage` trigger ("you gain that much life", "that player loses that much
   * life"). Valid only in the effect of a triggered ability with one of those triggers.
   */
  | { readonly kind: 'triggerDamage' }
  /**
   * "For each opponent who has more life / cards in hand / creatures than you" (D-131): the number of opponents still
   * in the game whose `stat` is greater than the controller's, now.
   */
  | { readonly kind: 'opponentsWithMore'; readonly stat: PlayerStat }
  /**
   * "For each of those cards that are still exiled" (D-151): the cards the effect before this one in the sequence that created the delayed trigger
   * exiled (`moved`), counted when the delayed trigger resolves: those that are still in exile, as the same objects (a card that left exile
   * is a new object, CR 400.7, and is not counted). Valid only in the effect of a `delayedTrigger` that follows an effect that put cards in
   * exile (`exileTop`) in the same sequence; the engine writes the cards into the trigger as it is created (`cardsStillExiled`).
   */
  | { readonly kind: 'exiledStillThere' }
  /** The engine's own form of `exiledStillThere` once the delayed trigger has its cards (D-151): the number of `objects` still in exile. Never in a card. */
  | { readonly kind: 'cardsStillExiled'; readonly objects: readonly ObjectId[] }
  /**
   * "The number of profit votes" (CR 701.38a, D-194): how many players voted for `option` in the latest `vote` effect of this same resolution, which
   * has run before this amount is read ("twice the number of profit votes" is a `multiple` of it). `option` is one of the options of that `vote`
   * (the words of the card, as it wrote them). 0 when nobody voted for it. Valid only after a `vote` effect in the same sequence that offers `option`.
   */
  | { readonly kind: 'votesFor'; readonly option: string };

/** What a `thisWay` amount counts (D-131). */
export type ThisWayKind =
  | 'sacrificed'
  | 'destroyed'
  // D-230: "for each nontoken creature you controlled that was destroyed this way" (Ceaseless Conflict): the creatures the controller of the effect controlled as they were destroyed.
  | 'destroyedOwnNontoken'
  // D-231: "When one or more nonland cards are exiled this way, put that many +1/+1 counters" (Augusta): the nonland cards `exileOwnGraveyardCard` exiled (CR 603.12).
  | 'exiledNonland'
  | 'playersDrew'
  | 'tapped'
  | 'discarded'
  // D-210: "the total mana value of those cards" milled this way, and "if a creature card (a noncreature card) was discarded this way".
  | 'milledValue'
  | 'discardedCreature'
  | 'discardedNoncreature';

/**
 * A designation a player can have (CR 725.1, D-131): the monarch (one player at most, `GameState.monarch`) and the city's blessing (CR 702.131c, D-264:
 * any number of players, `SeatState.citysBlessing`); the initiative can join.
 */
export type Designation = 'monarch' | 'citysBlessing';

/** What two players are compared by in "has more [life | cards in hand | creatures] than you" (D-131). */
export type PlayerStat = 'life' | 'cardsInHand' | 'creatures' | 'lands';

/** The `countOf` amount alone: the only counted shape a static ability or a characteristic-defining ability reads. */
export type CountAmount = Extract<Amount, { readonly kind: 'countOf' }>;

/** The `manaSpent` amount alone (D-183): what a replacement effect of a group of permanents may count besides objects. */
export type ManaSpentAmount = Extract<Amount, { readonly kind: 'manaSpent' }>;

/**
 * An amount that is added to power or toughness, or that sets one (D-109, D-115): any `Amount`, or a
 * multiple of one. "-X/-X" is `{ kind: 'times', factor: -1, of: { kind: 'x' } }`, "+X/+0" has `{ kind:
 * 'x' }` for power and 0 for toughness, "+1/+1 for each artifact you control" has `{ kind: 'countOf', ...
 * }` for both and "-2/-2 for each ..." has a `times` with factor -2. A plain number stays a number.
 * `times` is not an `Amount`: a count of cards or of life is never negative, and `validateCard` refuses
 * it everywhere but in a power or toughness.
 *
 * In the effect of a spell or ability it is worked out once, as the effect resolves, and stays (CR 611.2c,
 * 608.2h): `x` is the X of the resolving spell or ability. In a static ability it is worked out every
 * time the permanent's characteristics are (CR 611.3a), so it follows the board.
 */
export type PtAmount =
  | Amount
  | {
      readonly kind: 'times';
      /** A whole number other than 0: negative for "-1/-1 for each ...". */
      readonly factor: number;
      readonly of: Amount;
    }
  /**
   * "Double the power and toughness of each creature you control" (D-145, CR 701.10a, 701.10b): the power or toughness the creature the
   * effect affects has as the spell or ability resolves, each creature its own, signed (a creature with a negative power is "doubled"
   * by getting that much more of it, CR 701.10c). `power: { kind: 'affected', stat: 'power' }` with `toughness: { kind: 'affected', stat:
   * 'toughness' }` is "double its power and toughness"; either alone doubles only that. Only in the amounts of a `modifyPt` effect; it
   * makes one continuous effect for each creature affected, all read from the game before any of them applies.
   */
  | { readonly kind: 'affected'; readonly stat: 'power' | 'toughness' };

/**
 * What a static ability may add to power or toughness (D-115): a number, a count of objects, or a
 * multiple of one. It never reads another object's power or toughness, an X or a spell's kicks, which
 * keeps layer 7 free of loops (CR 613.8): `validateCard` refuses the rest.
 */
export type StaticPtAmount =
  | number
  /** "The greatest mana value among your commanders" (D-145): see the `Amount` of that name. */
  | { readonly kind: 'commanderManaValue' }
  /** "For each time you've cast your commander from the command zone this game" (D-229): see the `Amount` of that name. */
  | { readonly kind: 'commanderCasts' }
  /**
   * "The number of colors among permanents you control" (CR 105.2, D-179): how many of the five colors at least one permanent the filter
   * matches has (a color counts once however many have it, colorless is no color), read through the layers 1, 4 and 5 like a count (`typeViewOf`).
   * `filter` names no zone but the battlefield, and reads no power, toughness, keyword, combat or source power (as a `countOf` here).
   */
  | { readonly kind: 'colorsAmong'; readonly filter: ObjectFilter }
  /**
   * "Each creature you control gets +1/+0 for each time it has attacked this turn" (D-187, CR 508.1): how many times the creature this static ability
   * affects was declared as an attacker this turn (a creature that attacks in two combat phases counts twice), read from the turn log (`TurnLog.attacked`).
   * Plain (+N/+N) only, in a `modifyPt` whose subject is a group of permanents, so "it" is each of them; read for the permanent being looked at.
   */
  | { readonly kind: 'timesAttacked' }
  | CountAmount
  | { readonly kind: 'times'; readonly factor: number; readonly of: CountAmount }
  | { readonly kind: 'sum'; readonly of: readonly CountAmount[] };

/** What a characteristic-defining ability sets a power or toughness to: a count, or a multiple of one (CR 604.3). */
export type DefinedPtAmount =
  | CountAmount
  | { readonly kind: 'times'; readonly factor: number; readonly of: CountAmount }
  | { readonly kind: 'sum'; readonly of: readonly CountAmount[] };

// ---- Filters and selectors

/**
 * Who controls a permanent: `you` (the controller of the ability), `opponent`, `any`, and (D-151) `triggerPlayer`: "that opponent", the player the
 * event that triggered the ability is about ("Destroy target artifact that opponent controls"); only in a triggered ability whose event is about a
 * player, as the selector `triggerPlayer` is. And (D-151) `defendingPlayer`: "target creature defending player controls" (CR 508.5): controlled by the player the
 * source of the ability, an attacking creature, is attacking; only in an ability of a creature that attacks.
 */
export type ControllerFilter = 'you' | 'opponent' | 'any' | 'triggerPlayer' | 'defendingPlayer';

/**
 * A comparison with a whole number (D-111): "power 4 or greater" is `{ cmp: 'atLeast', value: 4 }`,
 * "mana value 3 or less" `{ cmp: 'atMost', value: 3 }`, "mana value 2" `{ cmp: 'equal', value: 2 }`.
 */
export interface NumberComparison {
  readonly cmp: 'atLeast' | 'atMost' | 'equal';
  readonly value: number;
}

/** Which objects an effect may affect. Every field is a conjunction; omitted fields match all. */
export interface ObjectFilter {
  readonly zone?: Zone;
  readonly types?: readonly CardType[];
  readonly notTypes?: readonly CardType[];
  readonly supertypes?: readonly Supertype[];
  /** "Nonbasic land", "nonlegendary creature" (D-135, CR 205.4): none of these supertypes. */
  readonly notSupertypes?: readonly Supertype[];
  readonly subtypes?: readonly Subtype[];
  /** "Non-Zombie creature" (D-133, CR 205.3d): none of these creature types (or other subtypes). */
  readonly notSubtypes?: readonly Subtype[];
  readonly colors?: readonly Color[];
  /** "Colorless creature" (D-133, CR 105.2c): the object has no color. */
  readonly colorless?: true;
  /**
   * "Two or more colors", "exactly one color", "one or more colors" (D-139, CR 105.1, 105.2): the number of colors the object has,
   * compared with a whole number (CR 105.2a: monocolored is one color, CR 105.2b: multicolored is two or more; `equal` 0 is
   * colorless). Read from the colors the object has now (the same as `colors`).
   */
  readonly colorCount?: NumberComparison;
  /**
   * "With mana value X" (D-139, CR 202.3, 107.3a): the object's mana value is the X announced for the spell or activated ability the effect
   * belongs to (a `destroy each` or similar, `each` selector of an ability with an {X} in its cost). Refused where there is no X.
   */
  readonly manaValueX?: true;
  /**
   * "Whose controller was dealt combat damage by this creature this turn" (D-139, CR 510.2, 120.2): the object's controller is a player who was
   * dealt combat damage this turn by the source of the ability (a creature, read by its id even if it has left). It reads the game: refused
   * in a static ability, as `attacking` is.
   */
  readonly controllerDealtDamageBySource?: true;
  /**
   * "That was put there from the battlefield this turn" (D-179, CR 700.4): the card is in a graveyard and was put into it from the battlefield
   * during this turn (a creature that died, an artifact that was destroyed; not a token, not a card discarded or milled). Read from the turn
   * log where the filter is matched against the game; refused in a static ability, as `attacking` is.
   */
  readonly putFromBattlefieldThisTurn?: true;
  /**
   * "Spells you cast from anywhere other than your hand" (CR 601.2a, 601.2f, D-235): the spell on the stack was cast from a zone other than the hand (the graveyard, exile, the command
   * zone, the library). Read from the spell itself as it is cast, so only a spell is matched; in a cost reduction (`costReduction.spells`) it is read as the cost is determined.
   */
  readonly notCastFromHand?: true;
  /**
   * "That entered this turn" (group 4 of the Vraska deck, CR 400.7, 110.1): the permanent entered the battlefield during this turn and is still the same
   * object (one that left and came back is a new object). Read from the turn log where the filter is matched against the game (a target slot, an `each`
   * selector); refused in a static ability, as `attacking` is, and for a zone other than the battlefield.
   */
  readonly enteredThisTurn?: true;
  /**
   * "Token" (`true`) or "nontoken" (`false`) (D-133, CR 111.1): a token is a permanent that is not represented by a
   * card, and so is a copy of a permanent spell that became one (CR 707.10f). Read from the object as it is or, for
   * one that has left, as it was. Left out, tokens and nontokens match alike.
   */
  readonly token?: boolean;
  /**
   * "With flying", "without flying" (D-133, CR 702): the object has all of the keywords in `keywords`, and none of
   * those in `notKeywords`, among the abilities `derive` gives it now (printed and granted, or those it last had when it
   * has left, CR 113.7a). Only keywords without parameters (`GRANTABLE_KEYWORDS`). Refused in a static ability's
   * subject and in a count a static ability reads: they would depend on the layer they apply in (CR 613.8).
   */
  readonly keywords?: readonly Keyword['kind'][];
  readonly notKeywords?: readonly Keyword['kind'][];
  readonly controller?: ControllerFilter;
  /**
   * Only cards whose owner the selector names ("target player's graveyard" is
   * `{ zone: 'graveyard', owner: { kind: 'target', id } }`, CR 108.3). Read where the filter is used
   * as the `each` selector of an effect, which knows its targets; anywhere else (a target slot, a
   * trigger, a condition, a static ability, a search, a cost) it is refused by `validateCard`, and
   * must not be set on an `anyOf` member.
   */
  readonly owner?: PlayerSelector;
  /**
   * Only permanents the selector's players control ("each creature that player controls", with the player a target, CR 109.4, D-179): as `owner`,
   * for the controller of a permanent instead of the owner of a card. Read where the filter is the `each` selector of an effect, which knows
   * its targets; refused anywhere else by `validateCard`.
   */
  readonly controlledBy?: PlayerSelector;
  readonly tapped?: boolean;
  /**
   * Comparisons with the object's power, toughness or mana value (D-111, CR 202.3, 208.1). They read
   * the values the object has now (`derive`, with an {X} on a spell on the stack counting as the
   * announced X, CR 202.3e), or, for an object that has left the battlefield and is read by a look-back
   * trigger, its last-known information (CR 603.10a). An object with no power or toughness (a
   * noncreature permanent, a card that is not a creature in a zone where it shows none) matches no
   * power or toughness comparison, not even `atMost`.
   */
  readonly power?: NumberComparison;
  readonly toughness?: NumberComparison;
  readonly manaValue?: NumberComparison;
  /** Only objects that are not this ability's source ("another creature"). */
  readonly other?: boolean;
  /**
   * "With a counter on it", "with a +1/+1 counter on it" (D-145, CR 122.1): the object has at least one counter of any kind (`true`) or of
   * the named kind (a counter named as the engine writes it: "+1/+1", "stun", "page"). Read from the object as it is, or as it last was
   * when it has left (CR 113.7a). Counters belong to no layer, so a static ability may name them in its subject.
   */
  readonly hasCounter?: true | string;
  /**
   * "Target commander", "your commanders" (D-145, CR 903.3): the object is a card a player designated as their commander (a token or a
   * permanent that copies one is not). Whose commander it is does not matter; `controller` says whose it must be to control. `'yours'`
   * (D-149, "your commander", "whenever your commander enters or attacks") is a commander its owner designated and that owner is the
   * controller of the ability that reads the filter (a commander card the player owns, whoever controls it now). Read where
   * the filter is matched against the game (a target slot, an `each` selector, a trigger subject, a condition); refused in a static
   * ability's subject and in a count a static ability reads, as `attacking` is.
   */
  readonly commander?: true | 'yours';
  /**
   * Only attacking creatures (CR 506.4, D-120): a creature that was declared as an attacker and is still on
   * the battlefield and in combat. Read where the filter is matched against the game (a target slot, an
   * `each` selector, a trigger subject); refused in a static ability, a count read by a static ability
   * and a characteristic-defining ability, which `derive` reads without the combat.
   */
  readonly attacking?: true;
  /**
   * Only creatures attacking the controller of this ability as a player (CR 508.1b, D-131): "creatures attacking
   * you" counts the attackers whose attack target is that player, not one attacking a planeswalker or battle they
   * control. It implies `attacking`. Read where `attacking` is read, and refused where it is refused.
   */
  readonly attackingYou?: true;
  /**
   * Only creatures attacking an opponent of the controller of this ability as a player, or a planeswalker or battle that opponent controls or protects
   * (CR 508.1b, 506.3, D-218): "creatures attacking your opponents and/or planeswalkers they control". It implies `attacking`. Read where `attacking` is
   * read, and refused where it is refused.
   */
  readonly attackingOpponents?: true;
  /**
   * Only creatures that are attacking or blocking (CR 506.4, 508.1k, 509.1g, D-229): "target attacking or blocking creature". A creature declared as an
   * attacker or as a blocker that is still in combat. Read where `attacking` is read, and refused where it is refused.
   */
  readonly attackingOrBlocking?: true;
  /**
   * "Return target nonland permanent card with mana value X or less from your graveyard, where X is this creature's power" and "... where X is the amount of damage this
   * creature dealt to that player" (CR 202.3, 601.2c, D-230): the mana value of the object is at most the amount, read when the filter is read (as the targets are chosen
   * and again as the ability resolves; CR 608.2b). The amount is one that needs no target and no earlier instruction: the power of this ability's source (`powerOf` `this`), a
   * `triggerDamage`, a number the game reads (`countOf`, `commanderCasts`...). Not in a static ability or a trigger's subject.
   */
  readonly manaValueAtMost?: Amount;
  /**
   * Only objects whose power is less than the power of this ability's source (CR 702.134a, Mentor, D-120):
   * "target attacking creature with power less than this creature's power". The source's power is read as it
   * is now, or from last-known information if it has left the battlefield (CR 113.7a). Refused where
   * `derive` matches filters (static abilities).
   */
  readonly powerLessThanSource?: true;
  /**
   * "Of the chosen type" (D-100): the object has the creature type that the source of the ability or
   * static ability chose as it entered (`GameObject.chosen.creatureType`, CR 607.2d). Matches nothing
   * when the source has made no such choice. `validateCard` requires the card to ask for it with an
   * `asEntersChoose` of `creatureType` (linked abilities, CR 607.2d).
   */
  readonly chosenType?: true;
  /**
   * "that shares a creature type with it" (D-261, CR 205.3m, 603.10a, 113.7a): the object has at least one creature type that the creature the trigger is
   * about has (`triggerSubject`: the one that died), as that creature last was on the battlefield; a changeling has every creature type (CR 702.73a).
   * Only in the filter of a `revealUntil` in the effect of a "dies" trigger.
   */
  readonly sharesCreatureTypeWith?: 'triggerSubject';
  /** "Of the chosen color" (D-100): as `chosenType`, for `chosen.color` and an `asEntersChoose` of `color`. */
  readonly chosenColor?: true;
  /**
   * For stack objects: spells only, abilities only, or (D-207, CR 113.3c, 603.1) triggered abilities only ("target triggered ability"). A member of an
   * `anyOf` may set it when the outer filter does not ("target triggered ability or colorless spell": the outer filter has `zone: 'stack'`, one member
   * `stackKind: 'triggeredAbility'` and one `stackKind: 'spell'` with `colorless`).
   */
  readonly stackKind?: 'spell' | 'ability' | 'triggeredAbility';
  /**
   * "Target spell or ability with a single target" (CR 115.9a, D-181): a spell or ability on the stack that was put there with exactly one target
   * (the number of times an object or player was chosen as a target, not how many of them are legal now; one object chosen twice is two).
   * Only for a target slot (a stack object), read where `stackKind` is; refused anywhere `derive` matches filters.
   */
  readonly singleTarget?: true;
  /**
   * "An instant or sorcery spell that targets a creature" (CR 115.1, 601.2c, D-206): a spell or ability on the stack with at least one chosen target that
   * is an object matching this filter (a player target never does). Read where a filter is matched against the game with the spell on the stack (a
   * cast trigger's filter, a target slot): the targets are chosen before the spell is cast (CR 601.2c). Only with `zone` `stack` or `stackKind`; refused in a
   * static ability and where `derive` matches filters.
   */
  readonly targetsObject?: ObjectFilter;
  /**
   * A disjunction: the object must match every field above AND at least one of these filters
   * ("artifact or enchantment" is `{ anyOf: [{ types: ['artifact'] }, { types: ['enchantment'] }] }`).
   * `zone` and `stackKind` belong to the outer filter, because they say where to look (CR 115.1,
   * 601.2c); the members describe the object and may not set them. Must not be empty.
   */
  readonly anyOf?: readonly ObjectFilter[];
}

export type PlayerFilter = 'any' | 'opponent';

/** A reference to one or more objects or players, resolved by the interpreter. */
export type ObjectRef =
  | { readonly kind: 'this' }
  | { readonly kind: 'thisSpell' }
  | { readonly kind: 'target'; readonly id: string }
  /**
   * "It", for what an earlier instruction of the same resolution moved (CR 400.7j): the new
   * object or objects that the previous `exile`, `destroy` or `moveToZone` effect produced, by
   * their ids in the zone they went to. Empty when that effect moved nothing, and for a token
   * that left the battlefield (it cannot come back, CR 111.8). Valid only after such an effect in
   * the same sequence.
   */
  | { readonly kind: 'moved' }
  /**
   * "It" in the body of a triggered ability, for the object whose event caused the trigger: the
   * spell or ability that targeted this permanent (Ward, CR 702.21a), the spell that was cast, the
   * permanent that entered or attacked. Valid only where the engine reads it: the `counterUnlessPays`
   * object of a trigger whose subject is a spell or ability, and the `createToken` copy source of a
   * trigger whose subject is a permanent (`ast/validate-parts.ts`).
   */
  | { readonly kind: 'triggerSubject' }
  /**
   * "It", for the card an ability's source became in another zone when it left the battlefield, as long
   * as it is still there (CR 400.7, 603.10a): Persist's "return it to the battlefield" names the card
   * in the graveyard that the permanent became. Resolves to nothing when the source is still where it was
   * or when the card has left that zone since (it would be a new object again, CR 400.7).
   */
  | { readonly kind: 'thisCard' }
  /**
   * "That card" in the body of a trigger about a permanent that went to a graveyard ("Whenever a nontoken creature you control dies, return that card to the battlefield", D-230,
   * CR 400.7, 603.10a): the card the `triggerSubject` permanent became, if it is still in the graveyard (`zone` `graveyard`). Resolves to nothing when the card has left that zone
   * since (it would be a new object again) or the subject was a token. Valid only as the object of `moveToZone` or `exile` in a triggered ability whose subject is a permanent.
   */
  | { readonly kind: 'triggerCard' }
  /**
   * "The sacrificed creature", "it" for the permanent or permanents sacrificed to pay the cost of this activated ability
   * (D-133, CR 602.2c, 118.3): the objects as they were on the battlefield, read from last-known information once they are gone
   * (CR 113.7a, 608.2h), which is always the case when the effect resolves. Valid only as the object of an amount that reads a
   * value of an object (`powerOf`, `toughnessOf`, `manaValueOf`, `countersOn`) in an activated ability whose cost sacrifices something
   * (`validateCard`); for a cost of "sacrifice two artifacts" the first one is read.
   */
  | { readonly kind: 'sacrificedCost' }
  /**
   * "That creature", "it" for the permanent an earlier `sacrifice` effect of the same resolution sacrificed (D-177, CR 701.21, 603.12, 608.2h): in
   * the same sequence after the `sacrifice` (or the `may` of one), and in the `reflexive` ability that follows it ("you may sacrifice another
   * creature. When you do, ~ deals damage equal to that creature's power to any target"; the permanent is carried to the reflexive ability as it
   * goes on the stack). The permanent as it last was on the battlefield (CR 113.7a), always gone when the amount is read. Valid only as the object
   * of an amount that reads a value of an object (`powerOf`, `toughnessOf`, `manaValueOf`, `countersOn`); the first permanent sacrificed is read.
   */
  | { readonly kind: 'sacrificed' }
  /**
   * "Enchanted creature", "equipped creature" in the effect or the condition of an ability of an Aura or an Equipment (D-139, CR
   * 303.4b, 301.5a): the permanent the permanent with the ability is attached to, as it is now, or as it was (CR 113.7a) when the
   * ability's source has left. "When this Aura enters, tap enchanted creature" is `tap` of this; "unless that player is the monarch"
   * is `controllerOf` of this in a condition. Nothing when the source is attached to nothing.
   */
  | { readonly kind: 'attached' }
  /**
   * "The exiled card" of a linked ability (D-145, CR 607.2a, 702.75a Hideaway): the cards the permanent the ability belongs to exiled with its
   * linked ability (`exile.linked`, or the exile of Hideaway) that are still in exile, in the order they were exiled. Nothing when the
   * permanent has left the battlefield (the link is the permanent's own, CR 400.7) or exiled nothing. Valid only on a face that has such a
   * linked ability (`validateCard`).
   */
  | { readonly kind: 'linkedExile' };

export type ObjectSelector =
  | ObjectRef
  | {
      readonly kind: 'each';
      readonly filter: ObjectFilter;
      /**
       * "Each other creature" where the one left out is a creature the effect names (D-151, "Target creature you control deals damage equal to its power to
       * each other creature"): the object this reference names is not among those selected. `filter.other` leaves out the source of the spell or ability
       * instead.
       */
      readonly except?: ObjectRef;
    };

export type PlayerSelector =
  | { readonly kind: 'you' }
  | { readonly kind: 'eachPlayer' }
  | { readonly kind: 'eachOpponent' }
  /**
   * "Each other opponent" (D-151): the opponents of the controller who are still in the game, except the player the event of the trigger is
   * about ("This creature deals 4 damage to each other opponent" after "deal combat damage to an opponent"). Only in a triggered ability whose event is
   * about a player, as `triggerPlayer` is. With two players there is no other opponent, and nobody is named.
   */
  | { readonly kind: 'eachOtherOpponent' }
  /**
   * Several selectors at once (D-131): "you and target opponent" is `all` of `you` and a `target` player. The players
   * they name together, each once (a player named twice acts once), in the order CR 101.4 gives (the active player
   * first, then in turn order): the order in which each acts in a draw, a life change, a sacrifice or a token
   * creation, and in which each makes a choice. Usable wherever an effect takes a `player`.
   */
  | { readonly kind: 'all'; readonly of: readonly PlayerSelector[] }
  | { readonly kind: 'controllerOf'; readonly of: ObjectRef }
  | { readonly kind: 'ownerOf'; readonly of: ObjectRef }
  | { readonly kind: 'target'; readonly id: string }
  /**
   * "Defending player" (CR 508.5, 702.86a Annihilator): the player the source creature is attacking,
   * the controller of the planeswalker it is attacking or the protector of the battle it is attacking;
   * if it is no longer attacking, the player it was attacking before it was removed from combat. Only meaningful for an
   * ability of an attacking creature, and resolves to nobody when the combat that source was in has
   * ended.
   */
  | { readonly kind: 'defendingPlayer' }
  /**
   * "That player", "that creature's controller", "its controller" in a triggered ability (D-133): the player the
   * event that caused the trigger is about. For `drawn` the player who drew; for `dealsCombatDamage` to a player the
   * player who was damaged; for `castSpell` the player who cast the spell, for `becomesTarget` the controller of the
   * spell or ability that targeted, for `attacks` the attacking player, for `permanentSacrificed` the player who
   * sacrificed and for `dealtDamage` the controller of the source of the damage (last-known information, CR 113.7a).
   * Valid only in the effect of a triggered ability with one of those triggers (`validateCard`); a trigger with no player
   * (a step, a death, an entering) has none.
   */
  | { readonly kind: 'triggerPlayer' }
  /**
   * "The chosen player", "they" in the gift ability (CR 702.174a, D-135): the opponent the caster chose when they promised the
   * gift, read from the spell on the stack, from the permanent that remembers it, or from last-known information (CR 113.7a).
   * Nobody when no gift was promised. Valid only where the engine writes the gift ability, and in a card's text that reads
   * `giftPromised`.
   */
  | { readonly kind: 'giftRecipient' }
  /**
   * "Each player who discarded a card this way" (D-210, CR 701.9): the players who discarded at least one card to the `discard` effects of this same resolution
   * so far, in the order CR 101.4 gives. Valid after a `discard` effect (or a `playersMay` of one) in the same sequence.
   */
  | { readonly kind: 'discardedThisWay' };

/**
 * A target declaration (CR 115). "any target" is a creature, player, planeswalker or battle
 * (CR 115.4). Count defaults to exactly one.
 */
export interface TargetSpec {
  readonly id: string;
  /**
   * The slot exists only if the spell's gift was promised (CR 702.174m, D-135): "If the gift was promised, return target creature
   * card from your graveyard to your hand" chooses that target only when it was. Only a spell's slot of a face with Gift.
   */
  readonly ifGiftPromised?: true;
  /**
   * "Draw a card. If this spell was kicked, destroy target creature." (CR 702.33g, 601.2c, D-181): the slot exists only if the spell was kicked
   * (with `kicker`): a spell that was not kicked is cast as if it did not have it. Only a slot of a spell's own text, not of a modal one, of a
   * face with Kicker (not Multikicker), and the effect uses it only in the `then` of a `kicked` conditional.
   */
  readonly ifKicked?: true;
  /**
   * "Exile target artifact or enchantment. If this spell was kicked, exile target nonland permanent instead." (CR 601.2c: "a spell may require
   * alternative targets only if an alternative or additional cost was chosen for it", D-181): the slot exists only if the spell was not kicked, so a
   * kicked spell chooses the targets of its `ifKicked` slots only. As `ifKicked` for the rest, and used only in the `else` of a `kicked` conditional.
   */
  readonly unlessKicked?: true;
  readonly what:
    | { readonly kind: 'object'; readonly filter: ObjectFilter }
    | { readonly kind: 'player'; readonly filter: PlayerFilter }
    | { readonly kind: 'anyTarget' }
    /**
     * "Target player or planeswalker", "target opponent or planeswalker" (CR 115.1, 120.2, D-200): a player (`player`: any player, or an
     * opponent) or a permanent the filter matches. The filter names planeswalkers, battles or both and nothing else ("target player
     * or creature" is not a thing the engine reads). A chosen target is a player or an object, as for `anyTarget`, so `dealDamage` and every
     * selector that takes a target reads it either way; the controller of the object is named by `controllerOf` of the target.
     */
    | {
        readonly kind: 'playerOrObject';
        readonly player: PlayerFilter;
        readonly filter: ObjectFilter;
      };
  readonly min?: number;
  readonly max?: number;
  /**
   * "Any number of other target creatures you control phase out" (CR 115.1, 601.2c, D-234): none at least, and as many as there are legal targets at most; `min` and `max` are
   * left out. Not with `divide` (a division reads the total), `onePerOpponent` or `upToThatMany`.
   */
  readonly anyNumber?: true;
  /**
   * "Deals X damage divided as you choose among any number of target creatures" (CR 601.2d, D-145): the caster divides `total` among the
   * targets of this slot as the spell is cast, each target getting at least 1. `total` is read once, as the spell is cast ("where X is the
   * greatest power among creatures you control as you cast this spell"): any amount that reads the game then (no X, no target). `max`
   * left out means any number (at most `total`, as each target needs 1); `min` defaults to 0 here. With a total of 0 no target can be chosen.
   * Only a slot of a spell's own text (not an ability, not a mode), and a `dealDividedDamage` effect must name it.
   */
  readonly divide?: { readonly total: Amount };
  /**
   * "For each opponent, exile up to one target nonland permanent that player controls" (CR 115.1, 601.2c, 603.3d, D-149): the slot takes at most
   * one target for each opponent of the controller who is still in the game, each controlled by that opponent: `what` is an `object`
   * filter whose `controller` is `opponent`, `min` is 0 or left out ("up to one": nobody has to be targeted) and `max` left out means one
   * for each opponent. Two targets controlled by the same player are not allowed. Only a slot of an ability or a spell with no `divide`.
   */
  readonly onePerOpponent?: true;
  /**
   * "Deals 4 damage to any target and 3 damage to each of up to two other targets" (CR 115.3, D-151): none of the targets of this slot may be a target
   * of the slot `differentFrom` names (an earlier slot of the same ability). The word "other" is what makes them different: two slots of an ability may
   * otherwise share a target.
   */
  readonly differentFrom?: string;
  /**
   * "When you do, up to that many target creatures gain double strike" (CR 603.12, 601.2c, D-187): the slot takes up to as many targets as the
   * resolution that created this reflexive ability sacrificed permanents (none to that many); the number is fixed as the ability is created, and
   * the engine writes it into `max` (and a `min` of 0) of the ability that goes on the stack. Only a slot of a `reflexive` ability after a
   * `sacrifice`, with `min` and `max` left out.
   */
  readonly upToThatMany?: true;
}

// ---- Costs (CR 118)

export type Cost =
  | { readonly kind: 'mana'; readonly symbols: readonly ManaSymbol[] }
  | { readonly kind: 'tap' }
  | { readonly kind: 'untap' }
  /**
   * "Pay 2 life" (CR 119.4, 118.3), or (D-135) "Pay life equal to the number of colors in your commanders' color identity": an
   * `Amount` that reads the game as the ability is activated, once (the validator allows what an `amountIs` condition does:
   * no target, no X, no trigger). Only the cost of an activated ability takes an `Amount`; the costs of spells, mana
   * abilities, "unless pays" and "enters tapped unless you pay" are numbers.
   */
  | { readonly kind: 'payLife'; readonly amount: Amount }
  /**
   * "Pay X life" (CR 107.3a, 119.4, D-103): the X announced for the spell or ability, as an additional
   * cost to cast a spell (`CardFace.additionalCosts`) or a cost of an activated ability. Paid with the
   * rest of the life (the cast keeps at least 1 life, as for a fixed `payLife`, D-101). The caster
   * announces X as it is cast (`chooseX`), so X is offered only up to the life they can pay.
   */
  | { readonly kind: 'payXLife' }
  | {
      readonly kind: 'sacrifice';
      readonly what: { readonly kind: 'this' } | ObjectFilter;
      /**
       * "Sacrifice two artifacts" (D-133): how many permanents are sacrificed, 2 or more; left out for one. Only in the
       * cost of an activated ability (not an additional cost of a spell or the cost of a mana ability), and not with
       * `this`. The player chooses among the permanents they control that match, with a `choosePermanent` decision of
       * purpose `sacrifice` and `forCost` (the engine takes them all when there are exactly that many). The sacrificed
       * permanents are what `sacrificedCost` names.
       */
      readonly count?: number;
    }
  /**
   * "Tap two untapped artifacts you control", "Tap three untapped Zombies you control" (D-133, CR 118.3): the player taps
   * `count` untapped permanents they control that match `filter`, as part of the cost of an activated ability. The
   * source may be one of them unless the filter says `other` ("tap another untapped creature"); a creature that came
   * under their control this turn may be tapped for it, because only its own {T} ability is held back by summoning
   * sickness (CR 302.6). With more candidates than `count` a `choosePermanent` decision of purpose `tap` and `forCost`
   * asks, with exactly as many the engine taps them. The filter's controller is the player (`you` or left out), its zone
   * the battlefield, and it does not say `tapped`. The engine pays it before the sacrifice and the discard and refuses it
   * together with a mana cost (the player could tap the permanents for mana first, see docs/ROADMAP.md), another tap cost
   * or `tapCreatures`; it differs from `tapCreatures` (Crew), which counts total power.
   */
  | { readonly kind: 'tapPermanents'; readonly filter: ObjectFilter; readonly count: number }
  /**
   * "Discard a card", "discard two cards" (CR 701.9, 118.8): the paying player chooses `count` cards
   * from their hand (the whole hand when it holds exactly that many), with a `chooseCards` decision
   * of purpose `discard` and `forCost` set. A player with fewer cards than `count` cannot pay (CR
   * 118.3). Run as an additional cost to cast a spell (`CardFace.additionalCosts`), as a cost of an
   * activated ability (not one that functions from the hand) and as the cost of Ward. The spell
   * being cast is on the stack, not in the hand, so it is never one of the cards discarded.
   */
  | {
      readonly kind: 'discard';
      readonly count: number;
      /**
       * "Discard a legendary card" (D-207, CR 701.9, 118.8): the cards that may be discarded are those of the hand the filter matches (types, supertypes,
       * colors; no zone, no controller). Only in a cost of an activated ability (an additional cost and Ward's discard take no filter).
       */
      readonly filter?: ObjectFilter;
      /**
       * "Discard another card named ~" (D-207): the card has the name of the permanent the ability belongs to, and is not that permanent (a card in the
       * hand). Only in a cost of an activated ability.
       */
      readonly named?: true;
    }
  /**
   * "Discard this card" (CR 702.29a, Cycling): the source itself goes from the hand to the
   * graveyard, so there is no choice to make. Only valid on an ability that functions in the hand. `cycling` (D-179) marks the cost of a cycling
   * ability, which the engine writes itself when it expands Cycling and typecycling: paying it is cycling the card (CR 702.29c, 702.29f), which triggers
   * "when you cycle this card". A card cannot write it (`validateCard`).
   */
  | { readonly kind: 'discardThis'; readonly cycling?: true }
  /**
   * "Exile this card from your graveyard" (CR 118.1, 400.7, D-185): the source itself goes from its owner's graveyard to exile, so there is no
   * choice to make; paid with the rest of the cost that needs no mana and no choice. Only the cost of an activated ability that functions from
   * the graveyard (the engine writes it for Encore, CR 702.141a); the ability is on the stack when the card is already in exile, so the
   * effect reads the card as it last was in the graveyard (CR 113.7a, 608.2h).
   */
  | { readonly kind: 'exileThis' }
  /**
   * "Tap any number of untapped creatures you control with total power N or greater" (CR 702.122a,
   * Crew): the player chooses the creatures with a `choosePermanent` decision (`purpose: 'crew'`),
   * and their total power, as `derive` gives it, must be at least `totalPower`. The source itself is
   * never one of them ("other" untapped creatures). Summoning-sick creatures may be tapped for it:
   * it is not their own {T} ability (CR 302.6). The engine runs it alone in an ability's cost:
   * combined with a mana or sacrifice cost it is refused (see `docs/ROADMAP.md`).
   */
  | { readonly kind: 'tapCreatures'; readonly totalPower: number }
  | { readonly kind: 'exileFromGraveyard'; readonly filter: ObjectFilter; readonly count: number }
  | { readonly kind: 'removeCounters'; readonly counter: string; readonly count: number }
  /**
   * The loyalty symbol of a loyalty ability (CR 606.2, 606.4, 606.5, D-200): `change` is the number of loyalty counters the permanent
   * the ability belongs to gets (positive, "[+1]") or loses (negative, "[-2]"), 0 for "[0]", and the string `'x'` for "[-X]" (X is announced
   * as the ability is activated, CR 107.3a, and is at most the permanent's loyalty). An activated ability with this cost is a loyalty ability
   * (CR 606.2): it is activated only at sorcery timing, and only once a turn for each permanent, by the ones who control it, whatever
   * ability it is (CR 606.3, `GameState.turnLog.activated`); a negative cost cannot be paid with fewer loyalty counters than it removes
   * (CR 606.6). The cost of an ability of a planeswalker (a face or a token) on the battlefield, at most one in an ability, never with
   * `oncePerTurn` or `functionsIn`.
   */
  | { readonly kind: 'loyalty'; readonly change: number | 'x' }
  /**
   * "Put a page counter on this artifact" as a cost (D-139, CR 118.3, 122.1): `count` counters of the named kind are put on the permanent
   * the ability belongs to as the ability is activated (a counter is named as the engine writes it: "page", "+1/+1", ...). Paid with the
   * {T} and the life, before the mana, so the counters are there when anything triggers from them (a state trigger, CR 603.8).
   * Only the cost of an activated ability of a permanent on the battlefield.
   */
  | { readonly kind: 'putCounters'; readonly counter: string; readonly count: number }
  /**
   * "{T}, Mill a card: Add {C}" (CR 701.17a, 701.17b, 118.3, D-208): the cost of a mana ability: the top `count` cards of the controller's library go to their
   * graveyard. A player cannot pay it with fewer cards in the library (CR 701.17b). Only in the cost of a mana ability (`validateCard`).
   */
  | { readonly kind: 'mill'; readonly count: number }
  /**
   * "{E}{E}" as a cost (CR 107.14, 122.1, D-209): the payer removes `count` energy counters from themselves. A player with fewer cannot pay it (CR 118.3).
   * Only the cost an `unlessPays` effect asks the player to pay ("discard a card at random unless you pay {E}{E}"); `validateCard` and the supported gate
   * refuse it as the cost of an activated ability, a spell or a mana ability.
   */
  | { readonly kind: 'energy'; readonly count: number }
  /**
   * "Return an artifact you control to its owner's hand" as a cost (D-139, CR 118.3, 701.21a analogue): `this` returns the permanent
   * the ability belongs to; a filter names the permanents the player may choose among (the ones they control, on the battlefield),
   * `count` of them (2 or more; one is the default). With more candidates than are needed a `choosePermanent` decision of purpose
   * `bounce` and `forCost` asks, with exactly as many the engine returns them. Each goes to its owner's hand (CR 108.3); a token
   * ceases to exist (CR 111.7); a commander's owner may put it into the command zone instead (CR 903.9b: a `commanderZone`
   * question asked in the middle of the activation, answered before the rest of the cost is paid). Paid after the sacrifice and
   * before the discard. Only the cost of an activated ability.
   */
  | {
      readonly kind: 'returnToHand';
      readonly what: { readonly kind: 'this' } | ObjectFilter;
      readonly count?: number;
    };

/** The named alternative costs that are paid with mana instead of the mana cost (D-121). */
export type NamedAlternativeKind =
  | 'overload'
  | 'evoke'
  | 'dash'
  | 'spectacle'
  | 'escape'
  | 'madness'
  | 'foretell'
  | 'tapPermanents';

/**
 * What a permanent remembers about how it got onto the battlefield (D-121, D-124): that its evoke, dash or
 * escape cost was paid as its spell was cast, or that it was returned by unearth (CR 702.84a, an ability, not a
 * cast). Each is the new object's own: any zone change makes a new object without it (CR 400.7).
 */
export type PermanentAlternativeKind =
  | Extract<NamedAlternativeKind, 'evoke' | 'dash' | 'escape'>
  | 'unearth'
  | 'suspend';

/**
 * An alternative cost a card's text lets its controller pay rather than its mana cost (CR 118.9),
 * on `CardFace.alternativeCosts`: a list with at most one of each kind (CR 118.9a: one applies to a
 * spell as it is cast, and the caster names it with the action, CR 601.2b).
 * - `free`: "You may cast this spell without paying its mana cost" (CR 118.9), usually with a
 *   condition ("If you control a commander, ...", CR 903.3d);
 * - `overload` (D-121, CR 702.96): the `cost` (mana only, no X) is paid instead of the mana cost,
 *   and the spell's text changes: each "target" becomes "each", so it has no targets. The change is
 *   made by the engine from the face's spell text (`ast/overload.ts`), which `validateCard` checks
 *   it can make.
 * - `evoke` (D-121, CR 702.74): the `cost` is paid instead of the mana cost of a permanent spell, and the
 *   permanent that spell becomes has "When this permanent enters, if its evoke cost was paid, its
 *   controller sacrifices it": the engine adds that triggered ability to a permanent that entered from an
 *   evoked spell (`GameObject.alt`, `rules/derive-alt.ts`), so the card lists only the cost.
 * - `dash` (D-121, CR 702.109): the `cost` is paid instead of the mana cost of a creature spell; the
 *   permanent has haste as long as its dash cost was paid, and a delayed triggered ability created as
 *   the spell resolves returns it to its owner's hand at the beginning of the next end step (the engine
 *   adds both: `GameObject.alt`, `GameState.delayedTriggers`, `rules/derive-alt.ts`).
 * - `spectacle` (D-124, CR 702.137a): the `cost` is paid instead of the mana cost of a spell, but only if an
 *   opponent lost life this turn. The engine reads that condition itself (`GameState` seats'
 *   `lifeLostThisTurn`, at the first casting step), so the card lists only the cost; a `condition` of the
 *   card is read as well.
 * - `escape` (D-124, CR 702.138): the card is cast from its owner's graveyard (the only alternative that is
 *   cast from there besides flashback), paying `cost` (mana only) instead of the mana cost and exiling `exile`
 *   other cards from that graveyard as part of the cost; the caster chooses them (`chooseCards`, purpose
 *   'exile'). The spell is an ordinary spell otherwise: it goes to the graveyard when it leaves the stack, and
 *   the permanent remembers that it escaped (`GameObject.alt`), which the `escaped` condition and the
 *   `ifEscaped` flag of `entersWithCounters` read ("escapes with a +1/+1 counter", CR 702.138c).
 * - `madness` (D-128, CR 702.35): the `cost` (mana only, no X) is paid instead of the mana cost, but only when the
 *   card is cast as its madness trigger resolves: a card with it that would be discarded is exiled instead (a
 *   replacement the engine applies to every discard), and its owner may then cast it from exile for this cost
 *   or put it into the graveyard. It is never offered as a cast from a hand. On a card that is not a land.
 * - `foretell` (D-128, CR 702.143): the `cost` (the foretell cost, mana only, no X) is paid instead of the mana
 *   cost to cast the card from exile, after the turn it was foretold has ended. The card is put there face down
 *   by the special action the engine derives from this entry: "any time you have priority during your turn, pay
 *   {2} and exile this card from your hand face down". It is never offered as a cast from a hand. On a card that
 *   is not a land.
 * - `tapPermanents` (D-149, CR 118.9): "You may pay {W} and tap four untapped creatures you control with flying rather than pay this
 *   spell's mana cost": the `cost` (mana only, no X) is paid instead of the mana cost, and the caster also taps `count` untapped
 *   permanents they control that match `filter` as part of it (CR 118.3, 601.2h). A permanent that came under their control this
 *   turn may be tapped for it (CR 302.6: only its own {T} ability is held back by summoning sickness). The engine pays the mana
 *   first and plans it so as to leave enough permanents to tap; then the caster chooses which (a `choosePermanent` decision of
 *   purpose `tap` and `forCost`, none when exactly `count` qualify). The filter's controller is `you` or left out, its zone the
 *   battlefield, and it does not say `tapped`. Not with Convoke, Improvise or Delve, and not on a land.
 * The `castSpell` action chooses one with `alternative`; the card is cast from the zones it could be
 * cast from anyway. Additional costs, commander tax and cost reductions still apply to it (CR
 * 118.9d, 601.2f, 903.8). `condition` is read for the player casting, with the card as the source;
 * left out, the cost may always be paid. Flashback is a keyword (`Keyword` `flashback`).
 */
export type AlternativeCost =
  | {
      readonly kind: 'free';
      readonly condition?: Condition;
    }
  | {
      readonly kind: Exclude<NamedAlternativeKind, 'escape' | 'tapPermanents'>;
      readonly cost: readonly Cost[];
      readonly condition?: Condition;
    }
  | {
      readonly kind: 'tapPermanents';
      readonly cost: readonly Cost[];
      /** The permanents tapped as part of the cost (D-149): untapped ones the caster controls that match. */
      readonly filter: ObjectFilter;
      /** How many: at least 1. */
      readonly count: number;
      readonly condition?: Condition;
    }
  | {
      readonly kind: 'escape';
      readonly cost: readonly Cost[];
      /** How many OTHER cards of the caster's graveyard are exiled as part of the cost: at least 1 (CR 702.138a). */
      readonly exile: number;
      readonly condition?: Condition;
    };

// ---- Tokens (CR 111)

/** A token defined by the effect that creates it (CR 111.3): its characteristics and abilities. */
export interface TokenDefinition extends Characteristics {
  readonly abilities: readonly Ability[];
  /** The card whose prepare spell a token copy of a preparation card has (CR 722.2b, D-225). Only the engine sets it, when it copies. */
  readonly prepareOf?: CardId;
}

/** Predefined tokens (CR 111.10) the engine knows by name. See `cards/tokens.ts`. */
export type TokenPreset = 'Treasure' | 'Food' | 'Clue';

export type TokenSpec =
  | { readonly kind: 'preset'; readonly preset: TokenPreset }
  | {
      readonly kind: 'custom';
      readonly definition: TokenDefinition;
      /**
       * "Create an X/X blue Illusion creature token, where X is the mana value of the exiled card" (D-231, CR 111.4): the power and the toughness of the token are this amount, read
       * as the token is created (the numbers of `definition` are placeholders).
       */
      readonly ptAmount?: Amount;
    }
  /**
   * "Create a token that's a copy of target creature" / "of it" (CR 707.2, 111.4): a token with the
   * copiable values of the permanent `object` names (printed characteristics as modified by copy
   * effects; not counters, damage, attachments or other effects), so it is legendary if the
   * original is. Read from last-known information when the permanent has left the battlefield.
   * `object` is `this`, a `target` or the `triggerSubject` permanent.
   */
  | {
      readonly kind: 'copyOf';
      readonly object: ObjectRef;
      /**
       * "..., except it's a Spirit in addition to its other types" (D-230, CR 707.9b, 205.1b): the token has these creature types besides the ones it copies; they are part of
       * the token's copiable values (a copy of it has them).
       */
      readonly addSubtypes?: readonly Subtype[];
      /** "... and it has \"When this token leaves the battlefield, return the exiled card to its owner's graveyard\"" (D-230, CR 707.9b): the abilities the token has besides the ones it copies. */
      readonly abilities?: readonly Ability[];
      /**
       * The token remembers the cards the effect before this one in the sequence put into exile (`moved`) as its linked exile (D-230, CR 607.2a): the ability the token has
       * reads them with `linkedExile` ("return the exiled card"). The link is the token's own and is read from last-known information when it has left the battlefield.
       */
      readonly linkExiled?: true;
    };

// ---- Effects

export type Duration = 'untilEndOfTurn' | 'permanent';

/** How long a `gainControl` lasts (D-189): see that node. */
export type ControlDuration =
  | 'untilEndOfTurn'
  | 'untilEndOfYourNextTurn'
  | 'forAsLongAsYouControlThis'
  | 'permanent';

/**
 * How long a permission to play exiled cards lasts (D-151): `endOfTurn` ("this turn", "until end of turn"), `endOfYourNextTurn` ("until the end
 * of your next turn": the next turn of the controller of the effect, the current one not counted even when it is theirs) and `yourNextEndStep`
 * ("until your next end step": it ends as the next end step of the controller's begins, this turn's when it is theirs and that step has not
 * begun) and (D-187) `whileExiled` ("for as long as they remain exiled": no end of its own; a card that leaves exile is a new object, CR 400.7,
 * so the permission is gone with it).
 */
export type PlayUntil = 'endOfTurn' | 'endOfYourNextTurn' | 'yourNextEndStep' | 'whileExiled';

/**
 * What a `sacrifice` effect sacrifices (CR 701.21). Only permanents the effect's controller
 * controls can be sacrificed (CR 701.21a). `choose` is "sacrifice a creature" or "sacrifice another
 * permanent": the controller picks among the permanents the filter matches, always limited to their
 * own (a `controller` of 'opponent' in the filter is invalid). `count` defaults to one.
 */
export type SacrificeSelector = ObjectSelector | ChooseSelector;

/**
 * "A land you control", chosen by the controller of the effect when it resolves (CR 608.2d):
 * the permanents the filter matches among those the controller controls; `count` (default one)
 * of them are chosen. Used by `sacrifice` and by `moveToZone` (return to hand, put into the
 * graveyard or library; onto the battlefield only a card chosen from the hand or the graveyard, D-139) and (D-139) by `tap`
 * ("tap X untapped Myr you control": `anyNumber` or `count`, the untapped permanents the controller controls that match).
 * With `filter.zone` `hand` or `graveyard` (D-139, "an artifact card from your hand") it is a choice among the cards the controller
 * owns there, for `moveToZone` only.
 */
export interface ChooseSelector {
  readonly kind: 'choose';
  readonly filter: ObjectFilter;
  /** How many: a number, or an `Amount` read as the effect runs ("sacrifices X creatures", D-131). Default one. */
  readonly count?: Amount;
  /**
   * "Any number of other permanents" (D-135, CR 701.21): the player chooses none, some or all of the permanents the filter
   * matches, so `count` is left out. Only for `sacrifice`.
   */
  readonly anyNumber?: true;
  /**
   * "Untap up to three lands" (D-216, CR 701.26a): the player chooses none up to `count` of the tapped permanents the filter matches, on the battlefield
   * (the filter's `controller` is as written: left out, the permanents of any player). Only for `untap`, with `count`.
   */
  readonly upTo?: true;
  /**
   * "You may sacrifice one or more Treasures" (D-187, CR 701.21): with `anyNumber`, the player who says yes chooses at least one of the candidates,
   * not none. Only for `sacrifice`, and only with `anyNumber`.
   */
  readonly atLeastOne?: true;
  /**
   * "A creature with the greatest power among creatures they control" (D-135): the choice is limited to the permanents the
   * filter matches that have the greatest value of this stat among them (the player chooses among the tied ones). Read as
   * the choice is made, with the stat as `derive` gives it. Only for `sacrifice`.
   */
  readonly greatest?: 'power' | 'toughness' | 'manaValue';
  /**
   * "You may put an artifact card from your hand onto the battlefield" (D-139): the controller chooses none up to `count` of the
   * candidates instead of exactly `count` (a question is asked whenever there is a candidate). Only for `moveToZone`.
   */
  readonly optional?: true;
}

/**
 * "The player or planeswalker it's attacking" (CR 508.1b, 506.3, D-139): the recipient of a `dealDamage` that is whatever the attacking
 * creature `of` was declared to attack, a player, a planeswalker or a battle. If that creature is no longer attacking (it left combat, or
 * the combat ended) there is no recipient and no damage is dealt (CR 506.4).
 */
export interface AttackedBySelector {
  readonly kind: 'attackedBy';
  readonly of: ObjectRef;
}

/**
 * Where some of the cards a `search` effect found go (CR 701.23). The first `count` cards the
 * player found go to the first destination, the next `count` to the second, and `'rest'` (last
 * entry only) takes whatever is left. `tapped` applies to the battlefield only.
 */
export interface SearchDestination {
  readonly zone: 'battlefield' | 'hand' | 'graveyard';
  readonly tapped?: boolean;
  readonly count: number | 'rest';
}

/** Which damage a prevention effect covers (CR 615.1): all of it, or only combat or noncombat damage (CR 120.2). */
export type PreventScope = 'all' | 'combat' | 'noncombat';

/**
 * Whom a prevention effect protects (CR 615.1). `any` is every creature, planeswalker, battle and
 * player ("Prevent all combat damage that would be dealt this turn"). A player selector protects
 * those players; an object selector protects those permanents, and `target` may name either a
 * player or a permanent (an "any target" slot), like the `to` of `dealDamage`.
 */
export type PreventRecipient = { readonly kind: 'any' } | PlayerSelector | ObjectSelector;

/** One of the instructions a `chooseOne` offers: the words shown to the player and what it does (D-175). */
export interface InlineChoice {
  readonly label: string;
  readonly effect: Effect;
}

export type Effect =
  | { readonly kind: 'sequence'; readonly effects: readonly Effect[] }
  /**
   * A prevention shield (CR 615), a continuous effect until end of turn. Damage that would be dealt
   * to a recipient `to` names, in the `scope` (all, combat or noncombat damage), is prevented: all of
   * it with `amount: 'all'`, otherwise the next `amount` damage (CR 615.7), and the shield is used up
   * when that much has been prevented. `by` limits it to damage dealt by that source ("dealt by target
   * creature", CR 609.7a): a `this` or `target` reference, never `each`; the source is fixed now.
   * What a shield protects is fixed now for `this`, `target`, `you`, `each opponent` and `each player`
   * (players, not permanents entering later, are the recipients). For an `each` object selector with
   * `amount: 'all'` the filter is checked as damage would be dealt (CR 611.2c: a prevention effect
   * changes the rules of the game, so a creature that enters later is covered); with a number it makes
   * one shield for each permanent matched now (CR 615.11). Damage that "can't be prevented" (CR 615.12)
   * is not supported (docs/ROADMAP.md).
   */
  | {
      readonly kind: 'preventDamage';
      readonly scope: PreventScope;
      readonly amount: number | 'all';
      readonly to: PreventRecipient;
      readonly by?: ObjectRef;
      /**
       * "Prevent all combat damage that would be dealt this turn by non-Spider creatures" (D-145, CR 615.1, 609.7a, 611.2c): only damage
       * dealt by a source that matches the filter. It is read as each damage event would happen (a prevention effect changes the rules
       * of the game, so a creature that enters later is covered), with the controller of the spell or ability as "you", against the
       * source as it is (or, if it has left the battlefield, as it last was). A spell or ability that is not a permanent never matches a
       * filter that names a type of permanent. Not with `by`. The filter names no zone, owner or X.
       */
      readonly byFilter?: ObjectFilter;
      /** `forAsLongAsThisRemains` (D-207, CR 611.2b, 615): the shield ends when the permanent with the ability leaves the battlefield; only in an ability of a permanent. */
      readonly duration: 'untilEndOfTurn' | 'forAsLongAsThisRemains';
    }
  /**
   * CR 120.3: damage is dealt by a source to a recipient. Left out, the source is the spell or ability's own (a spell
   * "deals" the damage, a permanent's ability is its permanent). With `from` (D-131) the source is a creature: "Target
   * creature you control deals damage equal to its power to target creature you don't control" (a "bite", one-sided: the
   * recipient deals nothing back, unlike a fight, CR 701.14) and "it deals damage equal to its power to any target"
   * (`triggerSubject`). The damage is that creature's: its lifelink, deathtouch, infect and wither apply (CR 120.3), a
   * prevention effect for that source applies (CR 615), and the damage is not combat damage. `from` is a `target` or
   * `this` or the `triggerSubject` permanent; if it is no longer a legal target or has left the battlefield without
   * being named by the trigger, no damage is dealt (CR 608.2b); a `triggerSubject` or `this` that left deals the damage
   * as it last existed (CR 113.7a, 608.2h).
   */
  | {
      readonly kind: 'dealDamage';
      readonly amount: Amount;
      readonly to: ObjectSelector | PlayerSelector | AttackedBySelector;
      readonly from?: ObjectRef;
      /**
       * "If the creature you control has trample, excess damage is dealt to that creature's controller instead" (D-145, CR 702.19b, 120.3):
       * when `from`'s creature has trample as the damage is dealt, each creature that is the recipient is dealt only the damage that is
       * lethal to it (its toughness less the damage already marked on it, CR 120.6; 1 when the source has deathtouch, CR 702.2c) and the
       * rest goes to its controller, as one damage event each by the same source. Nothing else changes: without trample, or for a
       * recipient that is not a creature, the whole amount goes to the recipient. Only with `from`, and a recipient that is an object.
       */
      readonly trampleExcess?: true;
    }
  /**
   * The damage a spell divided as it was cast (CR 601.2d, 120.3, D-145): each target of the slot `to` names, if it is still legal as the
   * spell resolves (CR 608.2b), is dealt the share the caster gave it, by the spell. A target that became illegal gets none, and its share
   * is not given to the others. `to` is a `target` of a slot whose `TargetSpec` has `divide`.
   */
  | {
      readonly kind: 'dealDividedDamage';
      readonly to: { readonly kind: 'target'; readonly id: string };
    }
  /**
   * CR 701.17 (Mill): each player `player` names puts the top `count` cards of their library into their graveyard (all of
   * them when they have fewer, and nobody loses for it: milling is not drawing, CR 121.4). `count` 0 does nothing. The
   * cards go one after another from the top; a commander milled goes to the graveyard like any card (its owner may
   * then put it into the command zone, CR 903.9a). D-131.
   */
  | { readonly kind: 'mill'; readonly player: PlayerSelector; readonly count: Amount }
  /**
   * CR 701.8 (Destroy). `cantBeRegenerated` is "It can't be regenerated" (CR 701.19c, D-120): the
   * regeneration shields of the permanents it destroys are not applied (they stay until they end).
   */
  | {
      readonly kind: 'destroy';
      readonly objects: ObjectSelector;
      readonly cantBeRegenerated?: true;
    }
  /**
   * CR 701.19a (Regenerate), D-120: "Regenerate [permanent]" creates a regeneration shield for each permanent
   * `objects` names, a replacement effect that protects it the next time it would be destroyed this turn:
   * instead, all damage marked on it is removed, its controller taps it, and if it is an attacking or blocking
   * creature it is removed from combat (CR 701.19a). The shield is used up by the first destruction it
   * replaces and ends with the turn (CR 514.2). It does nothing for a permanent that is sacrificed, put
   * into a graveyard by a state-based action other than lethal damage (0 toughness, the legend rule),
   * or exiled, nor when the destruction says it can't be regenerated (CR 701.19c). The activated form
   * "{1}{B}: Regenerate this creature." is an ordinary activated ability with this effect.
   */
  | {
      readonly kind: 'regenerate';
      readonly objects: ObjectSelector;
      readonly duration: 'untilEndOfTurn';
    }
  /**
   * "You may pay [cost]. If you do, [effect]" (CR 702.101a Extort, D-120): the controller of the resolving
   * ability is asked whether to pay (the same question and payment as Ward's, `rules/pay-unless.ts`, purpose
   * 'mayPay'); a player who cannot pay the whole cost is not asked and does nothing (CR 118.3). When they pay,
   * `effect` runs next, with the life lost by its `loseLife` readable as `lifeLostThisWay`. Only `mana`
   * and `payLife` costs without X.
   */
  | { readonly kind: 'mayPay'; readonly cost: readonly Cost[]; readonly effect: Effect }
  /**
   * "You may [do something]" inside an effect (D-135, CR 608.2d): the controller is asked, as this instruction comes up,
   * whether to do `effect`; declining does nothing and the rest of the spell or ability goes on. What was done is
   * remembered for the `didPrevious` condition and for `reflexive` that follow in the same sequence ("you may discard a
   * card. If you do, draw a card"). Only an effect whose doing is a measurable event: `discard`, `sacrifice`, `exile`,
   * `moveToZone`, `draw` or `mill` (`validateCard`); an effect that did nothing (an empty hand, nothing to sacrifice) was
   * not done.
   */
  | { readonly kind: 'may'; readonly effect: Effect }
  /**
   * "Create a Food token or a Treasure token" (CR 608.2d, D-175): an instruction that offers two or more instructions, and its controller
   * chooses one of them as it resolves (the choice is not made when the spell or ability goes on the stack, as the modes of a modal
   * text are, CR 700.2). Two to eight `options`, each a `label` the player is shown ("a Treasure token": the words of the text, distinct
   * in one instruction) and the `effect` that runs when it is chosen; the others do nothing. The controller is asked with a `chooseOption`
   * decision (`purpose` 'effect') whose options are the labels in order. Targets are declared by the spell or ability as for any effect, so
   * an option may use them; the option runs as the rest of the effect does, with its own `thisWay` count.
   */
  | {
      readonly kind: 'chooseOne';
      readonly options: readonly InlineChoice[];
      /**
       * "Target player adds one mana of any color" (D-229, CR 608.2d, 106.1b): the one player this selector names (a target) makes the choice, not the
       * controller of the effect. Left out, the controller chooses. A chooser that is no longer there (the target was illegal) is skipped with the effect.
       */
      readonly chooser?: PlayerSelector;
    }
  /**
   * "Starting with you, each player votes for profit or security" (CR 701.38a, 701.38b, D-194): each player still in the game, starting with the
   * player `startingWith` names and proceeding in turn order, chooses one of the `options` (two to eight words with no rules meaning, distinct,
   * each connected to an effect the rest of the text gives: the amount `votesFor` counts the votes for one). One vote for each player (CR 701.38d,
   * extra votes, is not supported). Each voter is asked with a `chooseOption` decision (`purpose` 'vote') as the effect resolves, and sees the votes
   * already cast (a vote is public as it is made). The tally is kept for the rest of this resolution; a second `vote` in one sequence replaces it.
   * `startingWith` is `you`, the controller of the spell or ability, the only wording the engine reads today.
   */
  | {
      readonly kind: 'vote';
      readonly options: readonly string[];
      readonly startingWith: 'you';
    }
  /**
   * A reflexive triggered ability (CR 603.12, D-135): "When you do, [effect]" after a `may` effect of the same
   * sequence. If the player did what the `may` offered, a triggered ability is created at once; it goes on the stack the next
   * time a player would receive priority (CR 603.3), its controller (the controller of this spell or ability) choosing its
   * `targets` then, as any triggered ability does (CR 603.3d), so a target that the first part made available (a card it
   * put into the graveyard) can be chosen, and an ability with no legal target is removed. If the player did not, nothing
   * is created. Its source is the source of this ability. Only the last effect of the sequence.
   */
  | {
      readonly kind: 'reflexive';
      readonly targets?: readonly TargetSpec[];
      readonly effect: Effect;
      /**
       * "When one or more nonland cards are exiled this way, ..." (D-231, CR 603.12): the ability is created when this resolution counted at least one of what the kind says,
       * not when it merely did something, and `thisWay` of that kind in its effect is the number counted (fixed as the ability is created).
       */
      readonly ifThisWay?: ThisWayKind;
    }
  /**
   * "You may cast target [filter] card from your graveyard this turn" (D-135, CR 601.2, 113.6, 611.2a): until end of turn
   * each card the selector names (a target, typically) that is in its owner's graveyard may be cast by the controller of
   * this effect from there, at the timing of its type, paying its ordinary cost (no alternative cost, no commander tax) and
   * with no other change (it is not exiled afterwards). The permission names the card as it is now: if it leaves the
   * graveyard it is a new object (CR 400.7) and the permission is gone. `duration` is `untilEndOfTurn`.
   */
  | {
      readonly kind: 'mayCast';
      readonly objects: ObjectSelector;
      readonly duration: 'untilEndOfTurn';
    }
  /**
   * "Exile the top card of your library", "Exile the top two cards of your library", "Exile the top X cards of your library, where X is the
   * number of creatures you control with power 4 or greater" (CR 701.13 Exile, 401, D-151): the controller exiles the top `count` cards of their
   * library one after the other (fewer when it holds fewer; 0 or less does nothing). They are face up, and are what `moved` names afterwards
   * ("you may play those cards", `mayPlay`; "those cards that are still exiled", `exiledStillThere`).
   */
  | {
      readonly kind: 'exileTop';
      readonly count: Amount;
      /**
       * "Exile the top two cards of target opponent's library face down" (CR 406.3, 701.13, D-187): whose library, a selector that names exactly one player
       * (a target or an opponent); left out, the controller's own. The cards belong to that player (a card is exiled from its owner's library).
       */
      readonly from?: PlayerSelector;
      /**
       * "... face down" (CR 406.3, 406.3a, D-187): the cards are exiled face down: nobody may look at them (they have no characteristics) until an effect
       * allows it (`mayPlay` with `lookAt`), and a card turns face up as it is cast or played. Also with `from` left out (the controller's own library).
       */
      readonly faceDown?: true;
    }
  /**
   * "Each player exiles a card from their graveyard" (CR 701.13, 101.4, D-231): each player `players` names, in turn order starting with the active player, chooses a card
   * in their own graveyard and exiles it; a player with an empty graveyard exiles nothing, one with a single card exiles it without a choice. The nonland cards exiled
   * count as `thisWay` `exiledNonland`, for the `reflexive` that follows ("When one or more nonland cards are exiled this way"). Only the cards that went to exile count (a
   * commander the owner puts into the command zone instead was not exiled).
   */
  | { readonly kind: 'exileOwnGraveyardCard'; readonly players: PlayerSelector }
  /**
   * "For each player, you choose from among the permanents that player controls an artifact, a creature, an enchantment, and a planeswalker. Then each player
   * sacrifices all other nonland permanents they control" (Tragic Arrogance; CR 608.2d, 701.21a, 101.4, D-231): the controller of the effect chooses, for each player
   * (the active player first) and each type of `types` in order, one permanent of that type the player controls (none when there is none; the same permanent may be
   * chosen for several of its types), then every player sacrifices the nonland permanents they control that were not chosen, together. Only this whole instruction.
   */
  | { readonly kind: 'sparePermanents'; readonly types: readonly CardType[] }
  /**
   * "[Cost]: Level 2" (CR 716.2a, 716.2c, D-235): "This Class's level becomes N": the permanent the ability belongs to has level `level`, a designation that stays while it is on
   * the battlefield (CR 716.2b) and is not copiable. Nothing happens when the permanent has left the battlefield. Only the effect of an activated ability whose `activateOnlyIf`
   * is `classLevelIs` of the level before and that is at sorcery timing (`validateCard`).
   */
  | { readonly kind: 'gainLevel'; readonly level: number }
  /**
   * "Exile a card from your graveyard at random" (CR 701.13, D-235): the controller exiles one card of their graveyard chosen at random by the game's generator (none when it is empty);
   * it is what `moved` names afterwards ("You may play the exiled card this turn", `mayPlay`).
   */
  | { readonly kind: 'exileRandomFromGraveyard' }
  /**
   * "Any number of other target creatures you control phase out." (Guardian of Faith; CR 702.26a-p, D-234): each permanent `objects` names on the battlefield phases out,
   * and so do the Auras, Equipment and Fortifications attached to it (CR 702.26g: indirectly). A phased-out permanent is treated as though it does not exist (CR 702.26b):
   * it is taken out of combat, it is not a legal target, nothing sees it, and it triggers nothing (no zone change, CR 702.26d); it keeps its counters, damage, tapped
   * status and attachments. It phases in as the untap step of the player who controlled it as it phased out begins, before that player untaps (CR 702.26a), also with no zone change.
   */
  | { readonly kind: 'phaseOut'; readonly objects: ObjectSelector }
  /**
   * "..., then you may have this creature become a copy of an artifact or creature card from among those cards until end of turn" (Spirit of Resilience; CR 707.2, 613.2a,
   * 400.7, D-232): the cards that made the trigger trigger ("Whenever one or more cards leave your graveyard": those cards, as they are in the zones they went to) that have one
   * of the `types` are the cards to copy from; the controller chooses one when there are several (none when there is none). Each permanent `objects` names gets the copiable
   * values of the card, as they are now (CR 707.2b), until end of turn (a layer 1 effect, counters and damage stay, CR 707.3, 707.4). Only in a triggered ability whose
   * trigger is `leftGraveyard` (`validateCard`); the `may` before it asks whether to.
   */
  | {
      readonly kind: 'becomeCopyOfCard';
      readonly objects: ObjectSelector;
      /** The card has one of these card types (as the card it is now, in the zone it went to). */
      readonly types: readonly CardType[];
      readonly duration: 'untilEndOfTurn';
    }
  /**
   * "An opponent chooses one of the exiled cards. You put that card on the bottom of your library and return the other to the battlefield tapped." (Coin of Fate; CR 608.2d,
   * 400.7, 110.2a, D-232): an opponent of the controller (the first one in turn order still in the game) chooses one of the cards that exiling as a cost of this activated ability
   * put into exile (`exileFromGraveyard` cost); the chosen card goes to the bottom of the controller's library, and the other one, if it is still in exile, onto the battlefield
   * tapped under the controller's control. Only in an activated ability whose cost exiles cards from the graveyard (`validateCard`). A card that left exile since is not
   * moved (CR 400.7). The wording is fixed: the effect names where each card goes.
   */
  | {
      readonly kind: 'splitCostExiled';
      readonly chosenTo: 'libraryBottom';
      readonly otherTo: 'battlefieldTapped';
    }
  /**
   * "After this phase, there is an additional combat phase" (CR 500.8, 500.10, D-151): when the phase that is now going on is over, one more combat
   * phase follows it (beginning of combat, declare attackers, ... end of combat), then the turn goes on as it would have. Several of them add up, the
   * most recently created occurring first (CR 500.8); the phase is added to the turn state (`TurnState.addedPhases`) and may follow a main phase as well
   * as a combat phase (D-187: "there's an additional combat phase after this phase"). Only in a triggered ability of an attack (`attacks`) or one whose
   * intervening "if" is `yourMainPhase`, which are the places the phase that is going on is known to be a main phase or a combat phase.
   * `atBeginning` (D-187): "At the beginning of that combat, untap all creatures you control": an effect that a delayed triggered ability of the same
   * controller runs as the beginning of combat step of that added phase begins (CR 603.7); it names no target.
   */
  | { readonly kind: 'extraCombat'; readonly atBeginning?: Effect }
  /**
   * "You may pay any amount of {R}. When you do, it deals that much damage to any target" (D-151, CR 603.12 reflexive triggers, 118.1): the controller
   * chooses how many times to pay one `symbol` of mana, from 0 to as many as they could pay now (a `chooseX` decision of purpose 'payAnyAmount',
   * not asked when none could be paid), and pays that much like any cost (`payMana`, `cancel` means not paying). When they have paid at least one,
   * a reflexive triggered ability `reflexive` is created (as `reflexive` after a `may` effect is) in which `triggerDamage` ("that much") is the number
   * of times they paid. Nothing happens for 0. `paid` is the engine's own (the number paid, on the effect that runs once the payment is made) and is never
   * written in a card.
   * D-257, "you may pay {X}, where X is less than or equal to the amount of life you gained. If you do, draw X cards": `symbol` may be `'1'`, a generic
   * {1} paid X times, and `atMost` caps X (an amount read as the effect starts: `triggerDamage`, the life gained, or a number; the cap and the mana the controller
   * could pay both limit the answer). With `ifPaid` instead of `reflexive` it is "If you do" (CR 608.2c): the effect runs as the next instruction of the same
   * resolution when at least one was paid, and its `{ kind: 'x' }` amounts are the number paid (CR 107.3f); no reflexive ability is created. Exactly one of
   * `reflexive` and `ifPaid`.
   */
  | {
      readonly kind: 'payAnyAmount';
      readonly symbol: 'W' | 'U' | 'B' | 'R' | 'G' | 'C' | '1';
      readonly atMost?: Amount;
      readonly reflexive?: {
        readonly targets?: readonly TargetSpec[];
        readonly effect: Effect;
      };
      readonly ifPaid?: Effect;
      readonly paid?: number;
    }
  /**
   * "Behold a Dragon" (CR 701.4, D-151): the controller reveals a card from their hand that `filter` matches or chooses a permanent they control on the
   * battlefield that it matches, in one question (a `chooseCards` decision of purpose 'behold' whose `legal` cards are in the hand or on the battlefield).
   * A card of the hand is revealed (`cardsRevealed`). It is what "If you do" after a `may` effect reads: it was done when a card or permanent was
   * beheld, and nothing is beheld when none matches. `filter` describes the card or the permanent: no zone, controller or owner.
   */
  | { readonly kind: 'behold'; readonly filter: ObjectFilter }
  /**
   * "The owner of target permanent shuffles it into their library, then reveals the top card of their library. If it's a permanent card, they put it onto
   * the battlefield" (CR 701.20 Reveal, D-151): each player `player` names reveals the top card of their own library (nothing for an empty library, and no
   * card is revealed for a player who has none), and when `ifMatches` describes it (`filter` for cards in a library: no zone, controller or owner, nothing
   * read from the game) puts it onto the battlefield under their control, `tapped` or not, or into their hand (`to`); otherwise it stays on top.
   */
  | {
      readonly kind: 'revealTop';
      readonly player: PlayerSelector;
      readonly ifMatches: ObjectFilter;
      readonly to: 'battlefield' | 'hand';
      readonly tapped?: true;
    }
  /**
   * "Put a Dragon creature card from your hand onto the battlefield tapped and attacking" (CR 508.4, 506.3, D-151): the second half, after an
   * effect of the same sequence that put the creature onto the battlefield (`moveToZone` with `tapped`): each creature `objects` names ('moved') that
   * is on the battlefield and is not attacking now starts attacking. It attacks the player the source of this ability attacks (or the first
   * opponent when the source is not attacking); it was never declared as an attacker, so no "whenever this attacks" triggers (CR 508.4) and the
   * turn log does not count it. Nothing happens outside a combat phase after attackers were declared. Only in a triggered ability of an attack
   * (`attacks`), when the combat is on. Choosing a planeswalker or battle to attack is not offered (`docs/ROADMAP.md`).
   */
  | {
      readonly kind: 'enterAttacking';
      readonly objects: Extract<ObjectRef, { readonly kind: 'moved' }>;
    }
  /**
   * "You may play that card this turn", "Until the end of your next turn, you may play those cards", "You may play those cards until your next end step"
   * (CR 601.2, 305.1, 611.2a, D-151): until the moment `until` names, the controller of this effect may cast each card `objects` names that is
   * in exile (and play it, when it is a land) as though it were in their hand: at the timing of its type, paying its ordinary cost
   * (additional costs and increases as usual; an alternative cost only if the card has one). The permission names the card as it is now: if it
   * leaves exile it is a new object (CR 400.7) and the permission is gone. `objects` is `moved` (what an earlier `exileTop`, `exile`
   * or `moveToZone` put in exile). Cards that are not in exile are left out.
   */
  | {
      readonly kind: 'mayPlay';
      readonly objects: Extract<ObjectRef, { readonly kind: 'moved' }>;
      /** How long the permission lasts. Named `lasts`, not `until`: `exile` has an `until` of another kind, which would make it a discriminant of the union. */
      readonly lasts: PlayUntil;
      /**
       * "You may look at and play those cards for as long as they remain exiled" (CR 406.3, D-187): the controller may also look at each of the cards
       * that is face down, until it leaves exile (CR 406.3: once a player is allowed to look, they may go on looking, even if the effect that allowed it
       * no longer applies). Needs cards exiled face down.
       */
      readonly lookAt?: true;
    }
  /**
   * CR 702.85a (Cascade), D-120: the controller exiles cards from the top of their library until they exile a
   * nonland card whose mana value is less than the mana value of the source spell, may cast that card
   * without paying its mana cost (if the spell's mana value is less than the source's, which it is: the mana
   * value of a card in a library is the same as that of the spell cast from it, X counting as 0, CR 107.3b),
   * then puts the exiled cards that were not cast on the bottom of their library in a random order. Only the
   * effect of a `castSpell` trigger with `self`: the source is the spell on the stack, read from last-known
   * information if it has left (CR 113.7a).
   */
  | { readonly kind: 'cascade' }
  /**
   * "Exile cards from the top of your library until you exile a nonland card. You may cast it without paying its mana cost if that spell's mana value is 8 or
   * less. If you don't, put that card into your hand." and "Discover N" (CR 701.57, D-151): the controller exiles cards from the top of their library, one at a
   * time and face up, until a nonland card is exiled (`foundAtMost`: one with mana value N or less, Discover; the library may run out first and nothing is
   * found). They may cast the card found without paying its mana cost (CR 608.2g; the same cast as Cascade's, a card with a mana value above `castAtMost`
   * may not be), and put it into their hand when they don't or can't. The other cards exiled go on the bottom of the library in a random order
   * (`bottomRandom`, Discover) or stay in exile (`stayExiled`). The card found is what `moved` names afterwards (a spell it was cast as is a new
   * object, read from last-known information): "the discovered card".
   */
  | {
      readonly kind: 'exileUntilCast';
      readonly foundAtMost?: number;
      readonly castAtMost?: number;
      readonly rest: 'bottomRandom' | 'stayExiled';
    }
  /**
   * CR 707.10, 707.10c (D-129): "Copy target instant or sorcery spell. You may choose new targets for the copy." Puts
   * a copy of the spell `spell` names onto the stack under the control of the effect's controller. A copy of a spell
   * is a spell that is not cast (it triggers nothing that watches casting): it copies the characteristics and every
   * choice made for the original (its modes, targets, X, kicker and the alternative cost it was cast for), and
   * ceases to exist if it leaves the stack (CR 707.10a); a permanent spell's copy becomes a token (CR 707.10f).
   * `newTargets` is `'may'`: its controller may choose new targets for the copy, leaving any of them as they are even
   * if they are illegal (CR 707.10c); `'no'`: the copy has the targets of the original ("copy that spell"). A spell
   * with no targets asks nothing. `spell` is a `target` slot of a spell on the stack (the effect does nothing if
   * the target is not a spell on the stack as it resolves, CR 608.2b), or the `triggerSubject` of a trigger about a
   * cast spell. A `triggerSubject` spell that left the stack since (countered in response to the trigger) is
   * copied from its last-known information (CR 113.7a), as Storm's is; a `target` that left is an illegal
   * target (CR 608.2b), so the effect does nothing. `thisSpell` (D-230): "you may copy this spell" as it resolves, in a spell's own text.
   */
  | {
      readonly kind: 'copySpell';
      readonly spell: ObjectRef;
      readonly newTargets: 'may' | 'no';
    }
  /**
   * "Change the target of target spell or ability with a single target." (CR 115.7a, 115.7b, D-181): the controller of the resolving spell or
   * ability changes the one target of the spell or ability `object` names (a `target` slot, as `copySpell`'s `spell`, whose filter says "with a single
   * target", `ObjectFilter.singleTarget`) to another legal target for that slot, a target the spell or ability could have chosen as it was put on
   * the stack, as it is now (hexproof, shroud and the slot's own wording count). If it cannot be changed to another legal target it stays as it
   * is, even if it is illegal by then (CR 115.7a). The spell or ability keeps what it divides (CR 115.7f). A `target` that is no longer on the stack
   * as this resolves is illegal (CR 608.2b), so the effect does nothing. "Change a target" or "any targets" are other effects.
   */
  | { readonly kind: 'changeTarget'; readonly object: ObjectRef }
  /**
   * CR 702.40a (Storm, D-129): "copy it for each other spell that was cast before it this turn. If the spell has any
   * targets, you may choose new targets for any of the copies." The effect of "When you cast this spell" and nothing
   * else (the engine expands the keyword, `rules/derive-keywords.ts`): the source is the spell on the stack, read
   * from last-known information if it has left (CR 113.7a), and the number is the one `StackData.spellsCastBefore`
   * recorded as it was cast (spells cast since, in response, do not count). Copies of a spell that has left the
   * stack are made from that information (CR 707.10).
   */
  | { readonly kind: 'storm' }
  /**
   * CR 702.56a (Replicate, D-129): "copy it for each time its replicate cost was paid. If the spell has any targets, you
   * may choose new targets for any of the copies." The effect of the trigger the engine expands the keyword into and
   * nothing else, like `storm`: the source is the spell on the stack, read from last-known information if it has left,
   * and the number is the one `StackData.replicated` recorded as it was cast.
   */
  | { readonly kind: 'replicate' }
  /**
   * CR 702.84a (Unearth, D-124): return the source card from its owner's graveyard to the battlefield, with the
   * unearth marks (see the keyword). Does nothing if the card is no longer in a graveyard as the same object
   * (CR 400.7). Only the effect of an activated ability that functions from the graveyard (the engine's
   * expansion of the keyword).
   */
  | { readonly kind: 'unearth' }
  /**
   * CR 702.141a (Encore, D-185): "For each opponent, create a token that's a copy of this card that attacks that opponent this turn if able. The
   * tokens gain haste. Sacrifice them at the beginning of the next end step." The card is the source of the ability, exiled as a cost before the
   * effect resolves, so it is read from its last-known information in the graveyard (CR 113.7a). Each copy is a token that enters like any token
   * (a question it asks as it enters is asked), is required to attack the player it was made for if able (`mustAttackPlayer`), has haste until
   * end of turn and is sacrificed by a delayed triggered ability at the beginning of the next end step. Only the effect of an activated ability
   * that functions from the graveyard (the engine's expansion of the keyword).
   */
  | { readonly kind: 'encore' }
  /**
   * CR 702.24a (Cumulative upkeep, D-127): if the source is on the battlefield under the control of the ability's
   * controller, put an age counter on it, then the controller may pay `cost` for each age counter on it (the cost
   * repeated that many times: partial payments are not allowed); if they do not (or cannot, CR 118.3), they
   * sacrifice it. The same question and payment as `unlessPays` (`rules/pay-unless.ts`). Only the effect of the
   * engine's expansion of the keyword.
   */
  | { readonly kind: 'cumulativeUpkeep'; readonly cost: readonly Cost[] }
  /**
   * "[Do this] at the beginning of the next [step]" (CR 603.7, D-128): the effect creates a delayed triggered
   * ability, a new triggered ability that waits for the beginning of the next `at.step` and then triggers once
   * (CR 603.7b). `at.whose` is the turn it waits for, relative to the controller of the spell or ability that
   * created it: `each` ("the next turn's upkeep": whoever's turn it is) or `you` ("your next upkeep"). The
   * ability belongs to the controller of the spell or ability as it resolved (CR 603.7d, 603.7e) and exists
   * whatever happens to its source (it is not an ability of any object). A step that has already begun this turn
   * does not trigger it (CR 603.7a). `effect` is run when it triggers, with that controller as "you". It names no
   * object (nothing of a spell is left to name, CR 603.7c) and no target: `validateCard` allows only `draw`,
   * `gainLife` and `loseLife` of a player selector and a fixed amount. The ability goes on the stack, can be
   * responded to and is ordered with the controller's other triggers, as any triggered ability.
   */
  | {
      readonly kind: 'delayedTrigger';
      /**
       * `step` `nextMain` (D-217, CR 603.7a, 500.1): "at the beginning of your next main phase": the first main phase of the controller's turns that begins
       * after the ability is created, found as it is created (this turn's postcombat main phase when it is created before it, otherwise the precombat main phase of
       * the controller's next turn); `whose` is then `you`.
       */
      readonly at: { readonly step: TriggerStep | 'nextMain'; readonly whose: 'you' | 'each' };
      readonly effect: Effect;
    }
  /**
   * CR 702.62a (Suspend, D-128): "remove a time counter from it", where "it" is the source: a card in exile that is
   * suspended (it has a time counter). Does nothing if the source is no longer that card in exile (CR 603.4: the
   * intervening "if this card is suspended" is checked again as the ability resolves). Only the effect of the
   * engine's own suspend ability (`validateCard` refuses it anywhere else).
   */
  | { readonly kind: 'removeTimeCounter' }
  /**
   * CR 702.62a, 702.35a (D-128): the source card, in exile, is cast as its ability resolves (CR 608.2g: no player
   * gets priority, the spell goes on the stack and the ability goes on resolving). `mode` `suspend`: "you may play
   * it without paying its mana cost if able. If you don't, it remains exiled. If you cast a creature spell this
   * way, it gains haste" (the spell remembers it, `StackData.suspended`); `madness`: "its owner may cast it by
   * paying [its madness cost] rather than paying its mana cost. If that player doesn't, they put this card into
   * their graveyard". The question is asked only when the card could be cast (a legal target for each of its
   * targets, the cost payable). Only the effect of the engine's own suspend and madness abilities
   * (`validateCard` refuses it anywhere else).
   */
  | { readonly kind: 'castExiled'; readonly mode: 'suspend' | 'madness' }
  /**
   * "[Player] becomes the monarch" (CR 725.1, 725.3, D-127): the designation moves to the player the selector
   * names (one player), and the previous monarch ceases to be the monarch. Nothing happens when that player is
   * already the monarch or has left the game. The designation belongs to the player: it stays when the source
   * leaves the battlefield.
   */
  | { readonly kind: 'becomeMonarch'; readonly player: PlayerSelector }
  /**
   * CR 406.1 (Exile). With `linked` (D-139, CR 607.2a: "Imprint", "exiled with this creature"): the cards exiled are remembered by the
   * permanent the ability belongs to, in the order they were exiled, for the static `takeFromLinkedExile` that reads them. The link is
   * the permanent's own: it is lost when the permanent leaves the battlefield (CR 400.7), and a card that leaves exile is not
   * linked any more. Only in an ability of a permanent (`validateCard` also needs a static ability of the face that reads them).
   */
  | {
      readonly kind: 'exile';
      readonly objects: ObjectSelector;
      readonly linked?: true;
      /**
       * "Exile target nonland permanent ... until this enchantment leaves the battlefield" (CR 610.3, D-149): the cards are returned to the battlefield
       * under their owners' control (CR 610.3c) when the permanent the ability belongs to leaves the battlefield. If it has left already as the
       * effect would exile them (the ability was on the stack when it did), nothing is exiled (CR 610.3a, 610.3b). The return is made by a
       * delayed triggered ability the exile creates for each card, which goes on the stack and resolves as any ability does (CR 610.3 says the
       * return is immediate: `docs/ROADMAP.md`); a card that left exile in the meantime is a new object and is not returned (CR 400.7), a token
       * has ceased to exist (CR 111.7). Only in an ability of a permanent.
       * `opponentBecomesMonarch` (D-231, "Exile target creature an opponent controls until an opponent becomes the monarch", Palace Jailer): the cards are returned, as the
       * second one-shot effect of CR 610.3, when a player other than the controller of the ability becomes the monarch (CR 725.3, 725.4 too); if one did since the ability
       * triggered, as the exile would happen, nothing is exiled (CR 610.3b). Not tied to the permanent: it may leave and the cards stay exiled.
       */
      readonly until?: 'sourceLeaves' | 'opponentBecomesMonarch';
    }
  /**
   * CR 701.21: the controller of the effect sacrifices (`player` left out), or, with `player`, the
   * player or players that selector names, each one choosing among the permanents they control ("Defending
   * player sacrifices two permanents", Annihilator CR 702.86a; "each opponent sacrifices a creature").
   * `player` is only for a `choose` selector: the others name permanents, which only their controller
   * can sacrifice (CR 701.21a). `byController` (D-196, "the blocking creature's controller sacrifices it"): each permanent the effect names
   * (a reference or `each`, not a `choose`) is sacrificed by the player who controls it as the effect resolves, whoever that is, not by the
   * controller of the effect; one that has left the battlefield is skipped. Not with `player`.
   */
  | {
      readonly kind: 'sacrifice';
      readonly objects: SacrificeSelector;
      readonly player?: PlayerSelector;
      readonly byController?: true;
    }
  | {
      readonly kind: 'moveToZone';
      /**
       * What moves: references and `each` as for any effect, or `choose` ("return a land you control
       * to its owner's hand"): the controller picks among the permanents they control that match,
       * with a `choosePermanent` decision (purpose `effect`) unless no more qualify than are needed
       * (CR 608.2d). `choose` needs `controller: 'you'` in its filter and `to` other than the
       * battlefield.
       */
      readonly objects: ObjectSelector | ChooseSelector;
      readonly to: 'hand' | 'graveyard' | 'library' | 'battlefield';
      /**
       * For library: `top`, `bottom`, or a number N of 2 or more, "Nth from the top" ("third from the top" is 3): the card
       * goes below the first N - 1 cards, or on the bottom when the library has fewer than N cards (CR 401.7, D-135).
       * For battlefield: tapped.
       */
      readonly position?: 'top' | 'bottom' | number;
      readonly tapped?: boolean;
      /**
       * For battlefield: "under its owner's control" (`owner`) or "under your control" (`you`, the
       * controller of the spell or ability). Left out it means `you`: CR 110.2a puts an object an
       * effect puts onto the battlefield under the control of the player performing the effect
       * unless the effect states otherwise. (An omitted control once meant the control the object
       * had where it was, the owner's for a card; that was wrong.)
       */
      readonly controller?: 'owner' | 'you';
      /**
       * For battlefield: the permanents enter with `count` counters of the kind on them ("return it to
       * the battlefield with a -1/-1 counter on it", Persist, CR 702.79a), put on as they enter (CR 122.6
       * and 614.1c: a replacement effect), so they are there when anything triggers from the entering.
       */
      readonly withCounters?: { readonly counter: string; readonly count: number };
      /**
       * "Return this card from your graveyard to the battlefield attached to target creature you control with power 1 or less" (CR 303.4f, 303.4g,
       * D-207): the Aura card enters the battlefield already attached to the target the effect names, which is not a choice of its controller. Only
       * with `to` `battlefield`; a `target` of the ability, an object. A card that cannot enchant it stays where it is (CR 303.4g).
       */
      readonly attachTo?: { readonly kind: 'target'; readonly id: string };
    }
  | { readonly kind: 'counter'; readonly objects: ObjectSelector }
  /**
   * "Counter [it] unless its controller pays [cost]" (CR 702.21a Ward, 701.6): the controller of
   * each spell or ability named is asked, as this resolves, whether to pay; if they decline, or
   * cannot pay, it is countered. Only `mana` and `payLife` costs without X. `objects` is the
   * `triggerSubject` of a trigger whose subject is a spell or ability (the question has purpose
   * `ward`), or a `target` ("Counter target spell unless its controller pays {3}", purpose
   * `counterUnlessPays`; a target that already left the stack is skipped, CR 608.2b).
   */
  | {
      readonly kind: 'counterUnlessPays';
      readonly objects: ObjectSelector;
      readonly cost: readonly Cost[];
    }
  /**
   * "[Do something] unless [a player] pays [cost]" (CR 118.12a, D-111): "you may draw a card unless that
   * player pays {1}". It means "[the player] may pay [cost]. If they don't, [do something]": as this
   * resolves, each player `player` names (a `controllerOf` the `triggerSubject` is "that player") is
   * asked whether to pay, with the same question and payment as Ward's (rules/pay-unless.ts); a player who
   * cannot pay the whole cost is not asked (CR 118.3) and has not paid. For each player who does not pay,
   * `effect` runs once, with the controller of the ability as "you" (a different player pays, the
   * effect is still the controller's). With `optional: true` the controller is asked "you may" before
   * each time `effect` would run (after the payment question, CR 118.12a). Only `mana`, `payLife` and
   * `discard` costs without X, as for Ward.
   */
  | {
      readonly kind: 'unlessPays';
      readonly player: PlayerSelector;
      readonly cost: readonly Cost[];
      readonly effect: Effect;
      readonly optional?: true;
      /**
       * Marks the payment of an Echo trigger (CR 702.30a, D-127): the decisions it asks carry `upkeep: 'echo'`
       * so that the player is told why they are paying. Only the engine's expansion of Echo sets it.
       */
      readonly upkeep?: 'echo';
    }
  /**
   * `upTo` (D-217, CR 121.1, 608.2d): "may draw up to two cards": the player the selector names (one player) chooses how many, from none to `count`, as the
   * instruction comes up (a `chooseX` decision of purpose `drawUpTo`, asked of that player, not of the controller of the effect).
   */
  | {
      readonly kind: 'draw';
      readonly player: PlayerSelector;
      readonly count: Amount;
      readonly upTo?: true;
    }
  /**
   * CR 701.9 (Discard). With `unless` (D-139: "Discard two cards unless you discard an artifact card"): the player discards `count` cards, or
   * instead one card the filter matches: they choose, and may discard only that one card if they have one (a hand with none that matches
   * discards `count` as usual). The filter describes cards in the hand, so it sets no zone or controller.
   */
  | {
      readonly kind: 'discard';
      readonly player: PlayerSelector;
      readonly count: Amount;
      readonly unless?: ObjectFilter;
      /**
       * "Discard a card at random" (CR 701.9b, D-209): the cards come from the hand as the game's seeded generator picks them: nobody chooses. `count` cards,
       * or the whole hand when it holds fewer. Never with `anyNumber` or `unless`.
       */
      readonly random?: true;
      /**
       * "Discard any number of cards" (D-151, CR 701.9): the player chooses none, some or all of the cards in their hand; `count` is 0 and
       * unread. What was discarded is what a later `thisWay` `discarded` amount counts ("then draw that many cards").
       */
      readonly anyNumber?: true;
    }
  | { readonly kind: 'gainLife'; readonly player: PlayerSelector; readonly amount: Amount }
  | { readonly kind: 'loseLife'; readonly player: PlayerSelector; readonly amount: Amount }
  /**
   * "Target player's life total becomes 1." (CR 119.5, D-201): each player the selector names gains or loses the life that takes their life total
   * to `amount`, a whole number of 0 or more (the life gained or lost triggers what it triggers, CR 119.9; nothing happens to a player who already has
   * that total). No other source of the number is supported (a life total that becomes a count is not read).
   */
  | { readonly kind: 'setLifeTotal'; readonly player: PlayerSelector; readonly amount: number }
  /**
   * CR 701.26a (Tap). `objects` may (D-139) be a `choose` selector, "you may tap X untapped Myr you control" (`anyNumber`, the
   * controller chooses none, some or all of the untapped permanents they control that match, so the X is how many they chose) or
   * "tap two untapped creatures you control" (`count`): the choice is the controller's (CR 608.2d), the filter says `controller`
   * 'you' and is read as untapped. Summoning sickness does not matter (CR 302.6). What was tapped is what a later `thisWay`
   * `tapped` amount counts and what `didPrevious` ("if you do") reads: nothing tapped is not "doing it".
   */
  | { readonly kind: 'tap'; readonly objects: ObjectSelector | ChooseSelector }
  /**
   * "You may reselect which player or permanent target attacking creature is attacking" (CR 508.7, D-139): the controller of the effect
   * (not the creature's controller) chooses what each creature `objects` names that is attacking attacks from now on: a player who
   * is an opponent of its controller, a planeswalker such an opponent controls or a battle such an opponent protects (CR 508.7c).
   * The creature's current target is among the options, so keeping it is the "may" not. The creature stays in combat, is not
   * declared as an attacker again, no attack trigger happens again and no requirement or restriction on declaring attackers applies
   * (CR 508.7a, 508.7b). A creature that is not attacking, or has no other target, is left as it is.
   */
  | { readonly kind: 'reselectAttack'; readonly objects: ObjectSelector }
  /**
   * CR 701.26a (Untap). `objects` may (D-216) be a `choose` selector with `upTo`, "Untap up to three lands." (Frantic Search): the controller chooses
   * none up to `count` of the tapped permanents on the battlefield the filter matches (CR 608.2d; not targets, so a permanent that cannot be
   * targeted may be chosen). A permanent with a stun counter loses one instead of untapping (CR 122.1d).
   */
  | { readonly kind: 'untap'; readonly objects: ObjectSelector | ChooseSelector }
  /**
   * "For each creature target player controls, create a token that's a copy of that creature, except it has haste and \"At the beginning of the end step, ...\"" (D-213, CR 707.2,
   * 707.9b, 111.4): one token for each permanent `objects` names (an `each` selector), made by the controller of the effect, with the copiable values of that permanent as
   * they are now (last-known information for one that left, CR 608.2h), and `abilities` besides the ones it copies (the exceptions: a keyword is a `keyword` ability, a
   * quoted ability is the ability). A token that asks a question as it enters (devour, riot, a land) asks it as `createToken` does.
   */
  | {
      readonly kind: 'createCopies';
      readonly objects: ObjectSelector;
      readonly abilities?: readonly Ability[];
    }
  /**
   * "Remove all counters from it" (CR 122.1, 122.2, D-207): every counter of every kind on each permanent the selector names (a lore or a stun counter too),
   * one `counterRemoved` event for each kind. Nothing for a permanent that has none or has left.
   */
  | { readonly kind: 'removeAllCounters'; readonly objects: ObjectSelector }
  /**
   * "Each player may discard their hand and draw seven cards" and "target opponent may have you draw three cards. If the player doesn't, ..." (D-210, CR 608.2d,
   * 101.4): each player `players` names, in the order CR 101.4 gives, is asked whether to do `effect`; a player who accepts has it done, a player who declines
   * has `otherwise` done, if there is one. `effect` is done by the controller of the ability, or, with `runsAs: 'chooser'`, by the player asked (they are "you" in
   * it: "discard their hand" is `discard` of `you`). Nothing is asked of a player who has lost; the effect is never run for them.
   */
  | {
      readonly kind: 'playersMay';
      readonly players: PlayerSelector;
      readonly effect: Effect;
      readonly runsAs?: 'chooser';
      readonly otherwise?: Effect;
    }
  /**
   * "You get {E}{E}" (CR 107.14, 122.1, D-209): each player the selector names gets `amount` energy counters (a player's own counters, kept for the rest of the
   * game), one `energyChanged` event. Nothing for an amount of 0 or less.
   */
  | { readonly kind: 'gainEnergy'; readonly player: PlayerSelector; readonly amount: Amount }
  /**
   * "Up to one target creature you control connives" (CR 701.50a, 701.50b, D-209): each creature the selector names that is still on the battlefield: its
   * controller draws a card, then discards a card (their choice); if the card discarded is a nonland card, they put a +1/+1 counter on it. A creature that left is
   * not conniving (nothing happens: the engine reads no last-known controller of it).
   */
  | { readonly kind: 'connive'; readonly objects: ObjectSelector }
  | {
      readonly kind: 'addMana';
      readonly mana: ManaProduction;
      /**
       * "Target player adds one mana of any color" (D-229, CR 106.4): the pool of the one player this selector names gets the mana, not the controller's.
       * Only the fixed production of a spell or ability that uses the stack (a mana ability has no target, CR 605.1a), which a `chooseOne` offers.
       */
      readonly player?: PlayerSelector;
    }
  | {
      readonly kind: 'addCounters';
      readonly objects: ObjectSelector;
      readonly counter: string;
      readonly count: Amount;
    }
  | {
      readonly kind: 'modifyPt';
      readonly objects: ObjectSelector;
      readonly power: PtAmount;
      readonly toughness: PtAmount;
      readonly duration: Duration;
    }
  /**
   * "Target creature has base power and toughness 1/1 until end of turn": a continuous effect in
   * layer 7b (CR 613.4b). Counters and +N/+N effects still apply on top (layer 7c).
   */
  | {
      readonly kind: 'setPt';
      readonly objects: ObjectSelector;
      readonly power: PtAmount;
      readonly toughness: PtAmount;
      readonly duration: Duration;
    }
  /**
   * "Target creature loses all abilities until end of turn": layer 6 (CR 613.1f). Abilities it
   * has at that timestamp go, printed and granted; abilities granted later still apply
   * (CR 613.7).
   */
  | {
      readonly kind: 'loseAllAbilities';
      readonly objects: ObjectSelector;
      readonly duration: Duration;
    }
  /**
   * "Target creature becomes a Frog" (a subtype), "becomes an artifact" (a card type): layer 4
   * (CR 613.1d). The new card types replace the old ones (CR 205.1a; an instant or sorcery keeps
   * its type); the new subtypes replace the creature types (CR 205.3d keeps the others). Either
   * list may be left out to leave that part alone, but not both. With `additive: true` ("becomes an
   * artifact creature", "in addition to its other types", CR 205.1b) nothing is replaced: the new
   * card types and subtypes are added to all the object has, creature types included.
   */
  | {
      readonly kind: 'setTypes';
      readonly objects: ObjectSelector;
      readonly types?: readonly CardType[];
      readonly subtypes?: readonly Subtype[];
      readonly additive?: true;
      /**
       * "Each noncreature artifact you control becomes a 4/4 artifact creature until end of turn" (D-217, CR 613.4b, 611.2c): the same permanents also have
       * these base power and toughness (a `setPt` of the objects the selector named as the effect began: the selector is not read again, so "noncreature" does
       * not stop matching once they are creatures). Applies in the same duration.
       */
      readonly basePt?: { readonly power: number; readonly toughness: number };
      readonly duration: Duration;
    }
  /**
   * "Target creature becomes blue": layer 5 (CR 613.1e). The new colors replace the old ones
   * (CR 105.3); an empty list makes the object colorless.
   */
  | {
      readonly kind: 'setColors';
      readonly objects: ObjectSelector;
      readonly colors: readonly Color[];
      readonly duration: Duration;
    }
  /**
   * "It also gains the non-backup abilities of this creature printed below this one until end of turn" (Backup, CR 702.165a, 613.1f, D-230): layer 6, each permanent the selector
   * names (a `target`, fixed now, CR 611.2c) has the abilities in `abilities` (any ability but a static one or a keyword that cannot be granted: keywords without parameters,
   * activated, triggered and mana abilities) until `duration`. Only the engine's own Backup writes it (`validateCard` refuses it in a card).
   */
  | {
      readonly kind: 'grantAbility';
      readonly objects: ObjectSelector;
      readonly abilities: readonly Ability[];
      readonly duration: 'untilEndOfTurn';
    }
  /** "Target creature gains flying until end of turn": layer 6 (CR 613.1f), a keyword without parameters. */
  | {
      readonly kind: 'grantKeyword';
      readonly objects: ObjectSelector;
      readonly keyword: Keyword;
      /**
       * `forAsLongAsThisRemains` (D-207, CR 611.2b): "gains hexproof for as long as this Saga remains on the battlefield": ends, for good, when the
       * permanent with the ability leaves the battlefield; does nothing when it is not there as the effect would begin. Only in an ability of a permanent.
       * `forAsLongAsYouControlThis` (D-229, CR 611.2b): "gains indestructible for as long as you control this creature": ends, for good, when the
       * permanent with the ability leaves the battlefield or is no longer controlled by the controller of the effect; does nothing when that is already so.
       */
      readonly duration: Duration | 'forAsLongAsThisRemains' | 'forAsLongAsYouControlThis';
    }
  /**
   * "Target creature can't be blocked this turn", "target creature attacks this turn if able": a
   * rules-modifying continuous effect (CR 613.11) that gives each object `objects` names the
   * restriction until the duration ends. It is not an ability, so "loses all abilities" does not
   * remove it (CR 613.11 applies it after the layers); the set is fixed when it begins (CR 611.2c).
   * Only `cantBlock`, `cantBeBlocked` and `attacksEachCombat`, with `untilEndOfTurn`, run; "doesn't
   * untap during its controller's next untap step" needs a duration that ends at that step and
   * "can't be countered" is about a spell, so neither is accepted here. With `forAsLongAsYouControlThis` (D-196, "Up to one target creature can't
   * block for as long as you control this Saga", CR 611.2b): as for `gainControl`, the effect does nothing when the permanent with the ability is not
   * on the battlefield under its controller's control as it would begin, and otherwise ends, for good, as that stops being so. Only in the ability
   * of a permanent, with `cantBlock`, `cantBeBlocked` or `attacksEachCombat`.
   */
  | {
      readonly kind: 'restrict';
      readonly objects: ObjectSelector;
      readonly restriction: Restriction;
      readonly duration: Duration | 'forAsLongAsYouControlThis';
    }
  /**
   * "The Ring tempts you" (CR 701.54a, 701.54c, 701.54d, D-196): the controller of the effect gets the emblem named The Ring if they have none, the
   * Ring has tempted them one more time (its abilities turn on at 2, 3 and 4 times: `rules/ring.ts`), and they choose a creature they control to
   * be their Ring-bearer (a `choosePermanent` decision of purpose 'ringBearer', not asked when they control one creature or none). The creature is
   * the Ring-bearer until another one becomes it or another player gains control of it. "Whenever the Ring tempts you" triggers even when
   * there was no creature to choose (CR 701.54d). No operand: only "you".
   */
  | { readonly kind: 'ringTempts' }
  /**
   * "You get an emblem with \"Creatures you control get +2/+2 and have flying.\"" (CR 114.1, 114.2, D-201): the controller of the effect gets an emblem, an
   * object in their command zone that has the quoted abilities (static or triggered, at least one) and nothing else (no types, no mana cost, no colors;
   * CR 114.3). The abilities work from the command zone (CR 114.4) for as long as the game lasts (CR 114.5: an emblem cannot be removed). "This emblem" in
   * the text is the emblem itself. `text` is the quoted text, as the emblem shows it.
   */
  | { readonly kind: 'createEmblem'; readonly abilities: readonly Ability[]; readonly text: string }
  /**
   * "Empower Jace N" (CR 701.71a, D-201): "If you don't control a Jace planeswalker token, create a blue Jace planeswalker token with 0 loyalty,
   * '[-1]: Surveil 1,' and '[-3]: Draw a card.' Choose a Jace planeswalker token you control. Put N loyalty counters on it." The controller of the
   * effect is the player; the token is the engine's own (`JACE_TOKEN`, `cards/tokens.ts`); the choice is a `choosePermanent` decision of purpose
   * 'empowerJace', not asked with one token. `amount` is a positive whole number.
   */
  | { readonly kind: 'empowerJace'; readonly amount: number }
  /**
   * The engine's own effect of the Ring's third ability (CR 701.54c, D-196: "Whenever your Ring-bearer becomes blocked by a creature, the blocking
   * creature's controller sacrifices it at end of combat"): creates a delayed triggered ability (CR 603.7) about the creature whose event
   * triggered this one (`triggerSubject`), that sacrifices it, by its controller, as the next combat ends. Only the effect of an inherent ability
   * of the Ring (`validateCard` refuses it anywhere else).
   */
  | { readonly kind: 'delayedSacrifice' }
  /**
   * "Until your next turn, creatures your opponents control attack each combat if able and attack a player other than you if able" and "Creatures your
   * opponents control attack this turn if able" (CR 508.1d, 611.2a, 611.2c, D-179): a requirement on a group of creatures. It changes the rules of the
   * game and no characteristic, so it is read whenever attackers are declared, for the creatures `creatures` matches then, not for a set fixed when the
   * effect resolved (CR 611.2c: a creature that arrives later is required too). `creatures` is read for the controller of the effect ("your
   * opponents" is `controller: 'opponent'`) and names no zone. `duration` is `untilEndOfTurn` or `untilYourNextTurn`: it ends as the next turn of the
   * controller of the effect begins (CR 500.1), not counting the turn it resolves in. With `awayFromYou` each such creature that is able to attack a
   * player other than the controller of the effect attacks one (CR 508.1d); when it cannot (two players: every player it could attack is the
   * controller), it is only required to attack.
   */
  | {
      readonly kind: 'requireAttack';
      readonly creatures: ObjectFilter;
      readonly duration: 'untilEndOfTurn' | 'untilYourNextTurn';
      readonly awayFromYou?: true;
    }
  /**
   * "Gain control of target creature until end of turn", "Gain control of that artifact until the end of your next turn", "Gain control of target
   * creature for as long as you control this" (CR 613.1b, 611.2, D-189): a layer 2 continuous effect that gives the controller of the effect control of
   * each permanent `objects` names, which must be a `target` or the `triggerSubject` permanent. The set is fixed when it begins (CR 611.2c); a permanent
   * that is no longer on the battlefield is skipped (CR 608.2b; a Treasure sacrificed for the mana that triggered the ability is such an object).
   * The effect has a timestamp (CR 613.7b): the one that began last decides when several give control of the same permanent. `duration`:
   * `untilEndOfTurn` (cleanup, CR 514.2), `untilEndOfYourNextTurn` (the end of the next turn of the controller that comes after this moment, even
   * when this is the turn of the controller, D-151), `forAsLongAsYouControlThis` (CR 611.2b: ends as the permanent with the ability, this one, leaves the
   * battlefield or is no longer controlled by the controller of the effect; the effect does nothing at all when that is already so as it would begin;
   * only in the ability of a permanent) and `permanent` (no duration stated, CR 611.2a: until the game ends or something else changes control).
   * The controller of the effect is the player who gains control; a permanent is not given to another player here.
   */
  | {
      readonly kind: 'gainControl';
      readonly objects: ObjectSelector;
      readonly duration: ControlDuration;
    }
  /**
   * "Target creature becomes a copy of target creature until end of turn" (CR 707.2, 613.2a): a
   * layer 1 continuous effect that gives each object `objects` names the copiable values of the one
   * permanent `of` names, as they are when this resolves (CR 707.2b), whatever the object had
   * printed. Counters, damage and other effects stay (CR 707.3, 707.4). "Enters as a copy" (a
   * replacement effect, CR 707.5) is not this node.
   */
  | {
      readonly kind: 'becomeCopy';
      readonly objects: ObjectSelector;
      readonly of: ObjectRef;
      readonly duration: Duration;
      /**
       * "..., except its name is Gogo, Mysterious Mime" (D-212, CR 707.9a): each permanent that becomes the copy keeps the name it has now; every other
       * copiable value is the original's. Only `true`.
       */
      readonly keepName?: true;
      /**
       * "..., except it's an artifact in addition to its other types" (D-217, CR 707.9b): the copiable values the permanent gets have these card types in
       * addition to the original's, so it is the original and also an artifact. Never empty.
       */
      readonly addTypes?: readonly CardType[];
    }
  /**
   * CR 701.27 (Transform): each permanent `objects` names that is represented by a double-faced
   * card is turned over so its other face is up (CR 701.27a). It stays the same object: counters,
   * attachments, damage, tapped status and the effects that apply to it carry over (CR 712.18).
   * Nothing happens to a permanent that is not a double-faced card (CR 712.9), such as a token or a
   * single-faced card, or whose other face is an instant or sorcery face (CR 712.10). An ability of
   * the permanent itself that tries to transform it does so only if it has not transformed since the
   * ability was put on the stack (CR 701.27f). "Converted", day and night and entering transformed
   * are not this node.
   */
  | { readonly kind: 'transform'; readonly objects: ObjectSelector }
  /** CR 701.24 (Shuffle): each player `player` names shuffles their library ("Its controller shuffles"). */
  | { readonly kind: 'shuffle'; readonly player: PlayerSelector }
  /**
   * CR 701.22 (Scry): look at the top `count` cards of the library, put any number of them on the
   * bottom in any order and the rest on top in any order. `player` is left out or `you`: the
   * controller of the effect scries (another player's scry is not supported, `docs/ROADMAP.md`).
   * "Scry 0" does nothing and no scry event occurs (CR 701.22b).
   */
  | { readonly kind: 'scry'; readonly player?: PlayerSelector; readonly count: Amount }
  /**
   * CR 701.25 (Surveil): look at the top `count` cards of the library, put any number of them into
   * the graveyard and the rest on top in any order. `player` as for `scry`. "Surveil 0" does
   * nothing and no surveil event occurs (CR 701.25c).
   */
  | { readonly kind: 'surveil'; readonly player?: PlayerSelector; readonly count: Amount }
  /**
   * "Look at the top six cards of your library. You may reveal an artifact card from among them and put it into your hand. Put the rest on
   * the bottom of your library in a random order." (D-139, CR 701.20 Reveal): the controller looks at the top `count` cards of their library
   * (fewer when it holds fewer; which they are stays hidden from everyone else), may reveal none up to `take.max` of those that
   * `take.filter` matches (a question only when one matches) and puts them into their hand; the rest go where `rest` says, on the bottom
   * of the library in a random order from the game's generator, or into the graveyard. `take.filter` describes cards in a library: no zone,
   * controller or owner.
   */
  | {
      readonly kind: 'lookAtTop';
      readonly count: Amount;
      readonly take: {
        readonly filter: ObjectFilter;
        readonly max: number;
        /**
         * Where the cards taken go (D-145): into the hand (the default), or onto the battlefield under the controller's control,
         * `tapped` or not ("You may reveal a creature card ... and put it onto the battlefield"), or into exile face down
         * (`exileFaceDown`, Hideaway, CR 702.75a: "exile one of them face down"): remembered by the permanent the ability belongs to
         * (`linkedExile`) and visible only to the player who controls that permanent, for as long as it stays on the battlefield; the
         * cards taken are not revealed.
         */
        readonly to?: 'hand' | 'battlefield' | 'exileFaceDown';
        /**
         * The fewest cards that must be taken when some can be (D-145, Hideaway: "exile one of them"): the player is not asked "none"; 0 or
         * left out means "you may". At most `max`.
         */
        readonly min?: number;
        readonly tapped?: true;
        /**
         * "... with mana value less than or equal to the number of lands you control" (D-145, CR 202.3): only cards whose mana value is at
         * most this amount, worked out as the effect runs (an `Amount` the effect could read anywhere: a count, a greatest, ...).
         */
        readonly manaValueAtMost?: Amount;
        /**
         * "Put any number of nonland permanent cards with total mana value 4 or less from among them onto the battlefield" (Ao, the Dawn Sky; D-230, CR 202.3): the cards taken
         * have this total mana value or less (their mana values added), not each. With `to: 'battlefield'`; `max` is the most cards (the number looked at).
         */
        readonly totalManaValue?: number;
      };
      /**
       * What happens to the cards looked at and not taken: the bottom of the library in a random order, the graveyard, or (D-151, "look at the top card of
       * your library. If it's a creature card of the chosen type, you may reveal it and put it into your hand") `top`: they stay where they are.
       */
      readonly rest: 'bottomRandom' | 'graveyard' | 'top';
    }
  /**
   * "Proliferate" (CR 701.34a, D-149): the controller chooses any number of permanents and/or players that have a counter, and each chosen
   * permanent and player is given one more counter of each kind it already has (for a player, poison counters: the only counters the
   * engine keeps on players). The permanents are the battlefield's, whoever controls them; the counters are put by the controller of the
   * spell or ability (CR 122.6, so "whenever you put one or more +1/+1 counters" counts them). With nothing to choose from nothing
   * happens and nobody is asked; otherwise a `choosePermanent` decision of purpose `proliferate` asks (`legal`: the permanents with a
   * counter, `players`: the players with poison counters), and the answer may be empty.
   */
  | { readonly kind: 'proliferate' }
  /**
   * "You may cast a spell with mana value 5 or less from your hand without paying its mana cost" and "You may play the exiled card without
   * paying its mana cost" (D-145, CR 608.2g, 118.9, 305.1): as this resolves the controller may choose one of the cards `objects` names that
   * they could cast (or, with `play`, also play) and does so without paying its mana cost, as CR 608.2g says: the steps of CR 601.2a-i
   * (modes, targets, additional costs; no timing restriction), no player receives priority and the effect goes on resolving. `objects` is a
   * `choose` selector over the controller's hand (`filter.zone` 'hand': "a spell with mana value 5 or less from your hand") or a reference:
   * `moved` (what an earlier effect put in a zone) or `linkedExile` (Hideaway). A land card is playable only with `play`: it is put onto the
   * battlefield as a land play (CR 305.1: it uses the controller's land drop, CR 305.2a, and only on their own turn, CR 305.3), not cast. A
   * card that could not be cast or played is not offered; with none the effect does nothing. Declining (choosing no card) does nothing.
   */
  | {
      readonly kind: 'castFree';
      readonly objects:
        | Extract<ObjectRef, { readonly kind: 'moved' | 'linkedExile' }>
        | ChooseSelector;
      readonly play?: true;
    }
  /**
   * CR 701.14 (Fight, D-145): each creature in `fighters` fights a creature in `against`: the two deal damage equal to their own power to
   * each other at the same time, noncombat damage dealt by the creatures themselves (lifelink, deathtouch, a prevention effect and the
   * rest apply, CR 120.3); if either is no longer a creature on the battlefield, no damage is dealt (CR 701.14b). Without `pairing` both name
   * one creature (a target, `this`, "it"): "Target creature you control fights target creature you don't control". With `pairing:
   * 'differentChosen'` (Ezuri's Predation: "Each of those tokens fights a different one of those creatures") `against` is a group: the
   * controller of the effect chooses, for each creature that fights (in the order the selector lists them), which creature of the group it
   * fights, a different one each time (a creature with none left to choose fights nothing; with exactly one left it is not asked); the
   * fights are then made one after the other. The creatures are read as the effect begins (`moved` of an earlier `createToken`,
   * an `each` filter over the battlefield).
   */
  | {
      readonly kind: 'fight';
      readonly fighters: ObjectSelector;
      readonly against: ObjectSelector;
      readonly pairing?: 'differentChosen';
    }
  /**
   * "Reveal cards from the top of your library until you reveal a land card. Put that card onto the battlefield tapped and the rest on the
   * bottom of your library in a random order." (D-145, CR 701.20 Reveal, 401.4): the controller reveals the top card of their library, then
   * the next, until one matches `filter` (all of them, when none does: the library is revealed to its end), every revealed card public. The
   * card found is put where `put` says (the battlefield, under the controller's control, `tapped` or not; or their hand), the rest go on the
   * bottom of the library in a random order from the game's generator (a commander among them asks its owner, CR 903.9b). The card found is
   * what `moved` ("it") names afterwards, nothing if none matched. `filter` describes cards in a library: no zone, controller or owner.
   */
  | {
      readonly kind: 'revealUntil';
      readonly filter: ObjectFilter;
      readonly put: 'battlefield' | 'hand';
      readonly tapped?: true;
    }
  /**
   * "Look at the top N cards of your library, then put them back in any order": the controller
   * looks at the top `count` cards and puts all of them back on top in the order they choose. It is
   * not the keyword action scry, so no scry event occurs and nothing triggers.
   */
  | { readonly kind: 'lookAndReorder'; readonly count: Amount }
  /**
   * "Look at the top three cards of your library. Put one of them into your hand, put one of them on the bottom of your library, and exile one of
   * them." (Expressive Iteration, D-216, CR 401.2, 608.2c): the controller looks at the top `count` cards and sorts them, in this order: `hand` of
   * them into their hand, `bottom` of them on the bottom of their library, `exile` of them into exile; they choose the first two piles, the rest is
   * exiled. `count` is `hand + bottom + exile`. With fewer cards in the library the first instructions are done and the last are not. What was
   * exiled is `moved` for the effect after it ("You may play the exiled card this turn": `mayPlay`). Not the keyword action scry.
   */
  | {
      readonly kind: 'lookAndSplit';
      readonly count: Amount;
      readonly hand: number;
      readonly bottom: number;
      readonly exile: number;
    }
  /**
   * "Put N cards from your hand on top of your library in any order" (Brainstorm's second half): the
   * controller chooses `count` cards from their hand (all of it when it holds fewer) and puts them on
   * top of their library in the order they choose, the first chosen on top.
   */
  | { readonly kind: 'putFromHandOnTop'; readonly count: Amount }
  /**
   * CR 701.23 (Search): `player` looks through their own library (so `filter` sets neither `zone`
   * nor `controller`) for up to `max` cards matching `filter`, may find fewer (CR 701.23b), and
   * puts the cards found where `destinations` say, in the order they were chosen, under their own
   * control (CR 110.2a). `player` is the controller (`you`) or another player ("Its controller may
   * search their library ..."), who then makes the choices; each player a selector names searches in
   * turn. `optional` is "may": the searching player is asked first (CR 608.2d), and declining does
   * the whole search, the put and the shuffle, not at all. `reveal` shows the found cards to
   * everyone (CR 701.23e: not otherwise); `shuffle` shuffles that player's library afterwards
   * (CR 701.24).
   */
  | {
      readonly kind: 'search';
      readonly player: PlayerSelector;
      readonly optional?: true;
      readonly filter: ObjectFilter;
      readonly max: number;
      /**
       * "Search your library for up to two basic land cards that share a land type" (D-262, CR 205.3i, 701.23): the cards found must share a land type, which is a
       * condition on the choice as a whole: any one card may be found, two only when some land type is on both. The land cards are of `filter`; `max` is at least 2.
       */
      readonly sharedLandType?: true;
      readonly destinations: readonly SearchDestination[];
      readonly reveal: boolean;
      readonly shuffle: boolean;
    }
  /**
   * CR 111: `controller` (default: the controller of the effect) creates `count` tokens and owns
   * them (CR 111.2). "Its controller creates a 3/3 green Beast creature token" names the controller
   * of a target, from last-known information if the target left (CR 608.2h).
   */
  | {
      readonly kind: 'createToken';
      readonly token: TokenSpec;
      readonly count: Amount;
      readonly controller?: PlayerSelector;
      /**
       * "Create two tapped Treasure tokens" (CR 110.5b, 614.1c, D-131): the tokens enter the battlefield tapped (they are
       * not tapped afterwards: nothing triggers from becoming tapped, CR 603.2e). A token that would enter tapped
       * anyway still does.
       */
      readonly tapped?: true;
    }
  /**
   * CR 701.3 (Attach): `object` (an Aura or Equipment) becomes attached to `to`. If it cannot be
   * attached there (CR 701.3b) it does not move: an Aura only to what its enchant ability allows
   * (CR 303.4a), an Equipment only to a creature other than itself (CR 301.5). Moving it from
   * another permanent unattaches it first.
   */
  | { readonly kind: 'attach'; readonly object: ObjectRef; readonly to: ObjectRef }
  /**
   * An instruction that depends on the game as it is when the instruction runs (CR 608.2c: "If
   * [condition], [effect]. Otherwise, [else]"): `condition` is checked at that moment, not when the
   * spell or ability was put on the stack, and `effect` runs if it holds, else `else` (when there is
   * one). Instructions before it have already happened. "If you do" (a result of an earlier
   * instruction) and the intervening "if" of a triggered ability (CR 603.4) are not this node.
   */
  | {
      readonly kind: 'conditional';
      readonly condition: Condition;
      readonly effect: Effect;
      readonly else?: Effect;
    };

export type ManaProduction =
  | {
      readonly kind: 'fixed';
      readonly mana: readonly ManaColor[];
      /**
       * "Add {R} for each tapped land your opponents control" (D-151, CR 106.1): the mana listed is added once for each of the amount (an `Amount` read
       * as the effect runs; 0 adds nothing). Only the `addMana` effect of a spell or a triggered ability, not a mana ability (CR 605.1a: its
       * production is fixed before it resolves).
       */
      readonly times?: Amount;
    }
  /**
   * "Add two mana in any combination of colors." (D-151, CR 106.1b, 605.3b): `count` mana, each of a color of the five (colorless is not a color), chosen
   * independently as the ability resolves, so the activation names the combination (the same `combination` answer a filter land gets). At
   * least 2.
   */
  | { readonly kind: 'anyCombination'; readonly count: number }
  | {
      readonly kind: 'anyColor';
      /**
       * "Add two mana of any one color" (D-145, CR 106.1b, 605.3b): `count` mana, all of the one color the player chooses as the
       * ability resolves (2 or more; one mana when left out). Not "in any combination of colors": every mana is the same color.
       */
      readonly count?: number;
    }
  /**
   * "Add {U} or {B}" (the types of mana are in CR 106.1b): one mana of a color chosen from a list of at least two distinct
   * ones, chosen as the ability resolves (CR 605.3b), so the chosen color is part of the activation.
   */
  | { readonly kind: 'oneOf'; readonly colors: readonly ManaColor[] }
  /** Command Tower: any color in your commander's color identity (CR 903.4). */
  | { readonly kind: 'commanderIdentity' }
  /**
   * "Add one mana of the chosen color." (D-149, CR 106.1, 614.12, 607.2d): one mana of the color its permanent chose as it entered (an
   * `asEntersChoose` of `color` on the same face, linked abilities); nothing when it made no choice.
   */
  | { readonly kind: 'chosenColor' }
  /**
   * "{T}: Add one mana of any color that a land an opponent controls could produce." (Exotic
   * Orchard, Fellwar Stone) and "... of any type that a land you control could produce." (Reflecting
   * Pool), D-099: one mana of a type that a permanent matching `lands` could produce (CR 106.7),
   * chosen as the ability resolves (CR 605.3b). What a permanent could produce is read when the
   * ability is activated, from the mana abilities its permanents have then, ignoring whether their
   * costs could be paid (CR 106.7); another "could produce" ability counts for what it could produce
   * in turn, so two Exotic Orchards alone produce nothing from each other, but an Orchard that faces a
   * Forest produces {G} for both (the example of CR 106.7). `lands` describes permanents on the
   * battlefield: `controller` is relative to this ability's controller. With no type to name the
   * ability produces no mana. "Any color" leaves out colorless (CR 106.1a, 106.1b); `anyType: true`
   * ("any type") keeps it.
   */
  | {
      readonly kind: 'couldProduce';
      readonly lands: ObjectFilter;
      readonly anyType?: boolean;
    }
  /**
   * "Add {R}{R}, {R}{W}, or {W}{W}." (a filter land, D-099): exactly one of the listed combinations
   * of mana, chosen as the ability resolves (CR 605.3b), so the choice is part of the activation.
   * At least two combinations that differ as multisets; the order inside one does not matter.
   */
  | { readonly kind: 'combination'; readonly options: readonly (readonly ManaColor[])[] };

// ---- Triggers (CR 603)

/**
 * "A or B" trigger conditions ("whenever this enters or attacks") are written as one triggered
 * ability per condition: the two events cannot be the same event for one object, so the result is
 * the same as one ability with two conditions.
 */
/** What a trigger names as its permanent: this one, the permanent this Aura or Equipment is attached to, or a filter. */
export type TriggerSubject =
  | { readonly kind: 'this' }
  /**
   * "Equipped creature", "enchanted creature" (D-111): the permanent the permanent with this ability is
   * attached to (CR 301.5a, 303.4b). For a trigger that looks back in time (CR 603.10a: dies, leaves the
   * battlefield) it is the permanent that was attached when the event happened, even if the host is
   * what left (the attachment is read from last-known information when it left too).
   */
  | { readonly kind: 'attached' }
  | ObjectFilter;

/** The steps and phases an ability can trigger "at the beginning of" (CR 500.2, 503 to 514). */
export type TriggerStep =
  | 'upkeep'
  | 'draw'
  | 'main1'
  | 'beginCombat'
  | 'combatEnd'
  | 'main2'
  | 'endStep';

export const TRIGGER_STEPS: readonly TriggerStep[] = [
  'upkeep',
  'draw',
  'main1',
  'beginCombat',
  'combatEnd',
  'main2',
  'endStep',
];

export type Trigger =
  | {
      readonly kind: 'entersBattlefield';
      readonly what: { readonly kind: 'this' } | ObjectFilter;
      /**
       * "When this land enters untapped" (`false`) or "enters tapped" (`true`) (D-135, CR 603.6a): how the permanent entered,
       * read as it is the moment the event is noticed, which is before anything else can tap or untap it (it is the state
       * its enters replacements, CR 614.1c, left it in). Left out, either way triggers.
       */
      readonly tapped?: boolean;
    }
  | { readonly kind: 'dies'; readonly what: TriggerSubject }
  /**
   * "When you cycle this card" (CR 702.29c, 702.29f, D-179): the ability of a card that was just cycled, that is, discarded to pay an activation cost of a
   * cycling ability (Cycling or typecycling; a card discarded any other way is not cycled). It triggers from whatever zone the card winds up in
   * (the graveyard, or exile for a card with madness) and the card is "this". Only a card with a cycling or typecycling keyword (`validateCard`).
   */
  | { readonly kind: 'cycled' }
  /**
   * "Whenever [a creature] attacks" (CR 508.1, 603.2). With `alone: true`: "attacks alone", only when it
   * is the only creature declared as an attacker in that declare attackers step (CR 506.5; Exalted,
   * CR 702.83a).
   */
  | {
      readonly kind: 'attacks';
      readonly what: TriggerSubject;
      readonly alone?: true;
      /**
       * "Whenever this creature attacks for the first time each turn" (D-151): only the first time this creature has been declared as an attacker this
       * turn (it may attack again in an additional combat phase, CR 500.8).
       */
      readonly firstTimeEachTurn?: true;
      /**
       * Whom it attacks (D-133, CR 508.1b): "attacks you" (`you`: declared as attacking the controller of this
       * ability as a player) or "attacks you or a planeswalker you control" (`youOrPlaneswalkers`: also an attack on a
       * planeswalker that controller controls). Left out, an attack on anyone triggers it.
       */
      readonly at?: 'you' | 'youOrPlaneswalkers';
    }
  /**
   * "Whenever you cast a spell", "whenever an opponent casts a spell" (CR 601.2i, 603.2): `by` is the
   * caster, relative to the controller of this ability (D-111: `opponent`). The spell is the subject
   * (`triggerSubject`).
   */
  | {
      readonly kind: 'castSpell';
      readonly filter: ObjectFilter;
      readonly by: 'you' | 'opponent' | 'any';
      /**
       * "Whenever an opponent casts their second spell each turn" (CR 601.2i, 603.2, D-229): only the spell the caster casts as their `nth` of the turn
       * (a spell cast this turn counts, whoever it was cast by, whatever it is: the filter reads the spell that triggers, not the count). Not with `self`.
       */
      readonly nth?: number;
      /**
       * "When you cast this spell" (CR 702.85a Cascade, 603.2, D-120): the ability of a spell that works while
       * the spell is on the stack and triggers only for that very spell (so `by` is 'you' and the filter is
       * `{ stackKind: 'spell' }`). Without it, a `castSpell` ability is the ability of a permanent on the
       * battlefield.
       */
      readonly self?: true;
      /**
       * "Whenever you cast or copy an instant or sorcery spell" (Magecraft, D-218, CR 707.10, 603.2): also a copy of a spell put onto the stack under the
       * control of the player `by` names, which is not cast. The copy is the subject (`triggerSubject`). Not with `self`.
       */
      readonly orCopy?: true;
    }
  /**
   * "Whenever one or more [tokens you control] enter" (D-218, CR 603.2c, 603.6a): a batch trigger. Every permanent `what` names that enters in one batch of
   * events (a token effect makes them together, a spell that puts several onto the battlefield too) is one occurrence: the ability triggers once however
   * many entered. `what` is read as the permanent is as it enters (the controller of this ability is "you" in the filter). `triggerSubject` is the first of them.
   */
  | { readonly kind: 'entersBatch'; readonly what: ObjectFilter }
  /**
   * "Whenever [a creature] blocks" (CR 509.1g, 702.45a, D-120): once for each creature declared as a blocker
   * in the declare blockers step, the blocker being the subject. A creature that blocks two attackers
   * (it cannot, without a special effect) would trigger once for the declaration.
   */
  | { readonly kind: 'blocks'; readonly what: TriggerSubject }
  /**
   * "Whenever [a creature] becomes blocked" (CR 509.1h, 702.45a, D-120): once for each attacking creature
   * that has one or more creatures declared as blockers for it, however many there are; the attacker is the
   * subject. It does not trigger for a creature that is already blocked when more blockers are added (no such
   * effect exists yet).
   */
  | { readonly kind: 'becomesBlocked'; readonly what: TriggerSubject }
  /** "Whenever a land enters under your control" (landfall). */
  | { readonly kind: 'landfall' }
  /**
   * "Whenever the Ring tempts you" (CR 701.54d, D-196): once each time the Ring tempts the controller of the ability, as they have done what
   * CR 701.54a says, even when some or all of it was impossible (no creature to choose). The creature they chose is in the event, not the
   * subject of the trigger.
   */
  | { readonly kind: 'ringTempted' }
  | { readonly kind: 'upkeep'; readonly whose: 'you' | 'each' }
  | { readonly kind: 'endStep'; readonly whose: 'you' | 'each' }
  /**
   * "At the beginning of [your | each | each opponent's] [step or phase]" (CR 503 to 514, 603.2, D-111):
   * triggers as the step begins (`stepBegan`, CR 500.2), the turn's active player being the player
   * `whose` names, relative to the controller of this ability (`you`: its controller's turn; `opponent`:
   * a turn of another player; `each`: every turn). `upkeep` and `endStep` here are the same as the
   * kinds of those names, which stay. `main1` and `main2` are the precombat and postcombat main phases.
   * The draw step's trigger waits for the turn-based draw (CR 504.1): the card is drawn first, then the
   * trigger goes on the stack the next time a player would receive priority (CR 504.2, 603.3).
   */
  | {
      readonly kind: 'step';
      readonly step: TriggerStep;
      readonly whose: 'you' | 'each' | 'opponent';
    }
  /**
   * "Whenever you draw a card", "whenever an opponent draws a card" (CR 121.1, D-111): once for each card
   * drawn by the player `who` names, relative to the controller of this ability. `nth` limits it to the
   * nth card that player has drawn this turn ("your second card each turn"): the turn's draws are
   * counted from `SeatState.cardsDrawnThisTurn`, so a card that was replaced by the command zone
   * (CR 903.9b) is not drawn and does not count. The card drawn is not read by the ability.
   */
  | {
      readonly kind: 'drawn';
      readonly who: 'you' | 'opponent' | 'any';
      readonly nth?: number;
    }
  /**
   * "Whenever [a creature] deals combat damage [to a player | to a creature]" (CR 120.2a, 510.2, 603.2,
   * D-111). `what` is the source of the damage, the trigger's subject (`triggerSubject`, last-known
   * information is not needed: the source is on the battlefield as the damage is dealt). `to` says what it
   * damaged: a player (`player`, or only a player the controller of this ability does not control,
   * `opponent`), a creature (`creature`, narrowed by `filter` when present), or anything (`any`: a player, a
   * creature, a planeswalker or a battle). It triggers once for each object or player a source damages, in
   * the step that damage is dealt: a double striker deals damage in two steps and triggers twice, and
   * damage that is entirely prevented triggers nothing (CR 603.2g). `filter` only goes with `to: 'creature'`.
   */
  | {
      readonly kind: 'dealsCombatDamage';
      readonly what: TriggerSubject;
      readonly to: 'player' | 'opponent' | 'creature' | 'any';
      readonly filter?: ObjectFilter;
    }
  /**
   * "Whenever [a creature | this] is dealt damage" (CR 120.3, 603.2, D-133): once for each source that deals damage to
   * the permanent `what` names (a creature, a planeswalker or a battle), in the moment the damage is dealt, so it
   * triggers for damage that kills it, and not for damage that is entirely prevented (CR 603.2g). `combat: true` is
   * "is dealt combat damage". `triggerSubject` is the permanent that was damaged, `triggerDamage` the amount of that
   * source's damage and `triggerPlayer` the controller of the source that dealt it.
   */
  | {
      readonly kind: 'dealtDamage';
      readonly what: TriggerSubject;
      readonly combat?: true;
    }
  /**
   * "Whenever [this | a permanent] leaves the battlefield" (CR 603.6c, 603.10a, D-111): looks back in time,
   * so the permanent is read as it last was, and a permanent that leaves sees itself leave. `to` limits
   * where it went (`graveyard`, `exile`, `hand`, `library`, `command`); `dies` is the special case of a
   * creature put into a graveyard. A token leaves too, when it goes to another zone.
   */
  | {
      readonly kind: 'leavesBattlefield';
      readonly what: TriggerSubject;
      /**
       * One zone, or several ("dies or is put into exile from the battlefield" is `['graveyard', 'exile']`, D-135): the
       * trigger fires when the permanent went to any of them. A list has at least two zones.
       */
      readonly to?: Zone | readonly Zone[];
    }
  /**
   * "Whenever you sacrifice a permanent" (CR 701.21): `by` is who sacrificed it, `filter` limits
   * the permanent, as it was on the battlefield (CR 603.10a). No filter means any permanent.
   */
  | {
      readonly kind: 'permanentSacrificed';
      readonly by: 'you' | 'any';
      readonly filter?: ObjectFilter;
    }
  /** "Whenever this becomes tapped" (CR 603.2e): not when it enters tapped. */
  | { readonly kind: 'becomesTapped'; readonly what: TriggerSubject }
  /**
   * "Whenever this artifact becomes untapped" (CR 701.26a, 603.2e, D-206): a permanent that untaps, in the untap step or by an effect. A permanent that a
   * stun counter keeps tapped (CR 122.1d) does not untap, so it triggers nothing; a permanent that enters untapped does not "become" untapped.
   */
  | { readonly kind: 'becomesUntapped'; readonly what: TriggerSubject }
  /**
   * "Whenever you discard a card" (CR 701.9a, 603.2, D-206): once for each card the player `who` names (relative to the controller of the ability)
   * discards, however it came to be (an effect, a cost, the cleanup step). `triggerSubject` is the card in the graveyard it became (or in exile,
   * for madness), so "you may exile that card from your graveyard" can name it; `triggerPlayer` is the player who discarded it.
   */
  | { readonly kind: 'discarded'; readonly who: 'you' | 'opponent' | 'any' }
  /**
   * "Whenever one or more other creatures and/or artifacts you control die" (CR 603.10a, 603.2c, 700.4, D-206): a batch trigger. The permanents that
   * die in one event (a state-based action, a destroy effect, combat damage) are one occurrence: the ability triggers once however many `what` names
   * died together, each as it was on the battlefield (the controller of this ability is "you" in the filter). It looks back in time, so a permanent
   * that dies with the others is seen. `triggerSubject` is the first of them.
   */
  | { readonly kind: 'diesBatch'; readonly what: ObjectFilter }
  /**
   * "Whenever one or more cards leave your graveyard" (CR 400.7, 603.2c, D-229): a batch trigger. The cards that leave the graveyard of the controller of
   * this ability for any other zone in one run of events (a spell that returns two of them, a cost that exiles them) are one occurrence: the ability
   * triggers once however many left. A card that goes from a graveyard to a graveyard (its owner's, the same) does not leave it. `triggerSubject` is none;
   * the cards are what `triggerCards` names (Spirit of Resilience, "from among those cards"). Only the graveyard of the controller (`who: 'you'`).
   */
  | { readonly kind: 'leftGraveyard'; readonly who: 'you' }
  /**
   * "Whenever one or more cards are put into exile from your library and/or your graveyard" (CR 603.2c, 400.7, D-229): a batch trigger on the cards of the
   * controller of this ability that are put into exile from their library or from their graveyard in one run of events. Once, however many. A card put
   * into exile from a hand, the battlefield, the stack or an opponent's zones is not counted.
   */
  | { readonly kind: 'exiledFromLibraryOrGraveyard'; readonly who: 'you' }
  /**
   * "Whenever one or more artifact creatures you control deal combat damage to a player" (CR 510.2, 603.2c, D-139): a batch trigger. All
   * combat damage in a step is dealt at once, and the ability triggers once for each player damaged in it, however many of the sources
   * `what` names damaged that player (`atLeast` is the fewest sources: "two or more creatures ..."; one when left out). The sources are
   * read as they are as the damage is dealt, the controller of this ability being "you" in the filter; damage that is entirely
   * prevented does not count (CR 603.2g). `to` is `player` (any player) or `opponent`; `triggerPlayer` is the player damaged. The
   * damage of a first strike step and of the regular step are different events: each can trigger it.
   */
  | {
      readonly kind: 'combatDamageBatch';
      readonly what: ObjectFilter;
      readonly to: 'player' | 'opponent';
      readonly atLeast?: number;
    }
  /**
   * "Whenever you tap a permanent for {C}, add an additional {C}" (CR 605.1b, 605.4, D-139): a triggered mana ability. It triggers as a
   * mana ability of a permanent that `what` matches is activated with {T} in its cost (CR 106.12: tapping a permanent for mana) by the
   * controller of this ability (`by` is `you`: the added mana is its controller's), and, with `mana`, only when that ability made mana of that
   * type. Its effect is `addMana` of fixed mana and nothing else (no target, no choice, no "may", no intervening "if"), and it does not
   * use the stack: it resolves as soon as the mana ability that triggered it has, and the mana is added to the same pool (CR 605.4a).
   * The planner that pays costs counts the mana as made by the source, so it never taps more than it must.
   */
  | {
      readonly kind: 'tappedForMana';
      readonly what: ObjectFilter;
      readonly by: 'you';
      readonly mana?: ManaColor;
    }
  /**
   * "Whenever an opponent taps an artifact for mana" (CR 106.12, 603.2, D-189): once each time a player `who` names (relative to the controller of this
   * ability) activates a mana ability with {T} in its cost of a permanent `what` matches, as that permanent was when it was tapped (a Treasure that is
   * sacrificed as part of the same ability is still the artifact that was tapped for mana). The trigger is an ordinary triggered ability that uses
   * the stack, not a triggered mana ability (CR 605.1b: this one adds no mana; `tappedForMana` is the other); it goes on the stack the next time a
   * player would receive priority (CR 603.3), after the spell or ability whose mana was being paid for, and it does not depend on what the mana was
   * for. Whoever's mana ability it was, `triggerPlayer` is the player who tapped the permanent and `triggerSubject` the permanent.
   */
  | {
      readonly kind: 'tapsForMana';
      readonly who: 'you' | 'opponent' | 'any';
      readonly what: ObjectFilter;
    }
  /**
   * "When there are four or more page counters on this artifact" (CR 603.8, D-139): a state trigger. It triggers when `condition` holds
   * for the controller of the permanent, with the permanent as the source, as the game state is looked at after any change; and it
   * triggers only once each time the condition becomes true: not again until the ability has resolved, been countered or otherwise left
   * the stack (if the condition still holds then, it triggers again). It is the ability of a permanent on the battlefield. The
   * condition is a plain one (it needs no target, trigger subject or earlier instruction): a count of the counters on this
   * permanent (`amountIs` with `countersOn` of `this`), of permanents, a life total, ...
   */
  | { readonly kind: 'state'; readonly condition: Condition }
  /**
   * "Whenever you gain life", "whenever you gain life for the first time each turn", "whenever an opponent gains life" (CR 119.9, D-149):
   * once for each life gain event of the player `who` names (relative to the controller of this ability), after any replacement of the
   * amount; a gain of 0 life is no event and triggers nothing. `firstEachTurn` limits it to the first gain of that player in the turn
   * (CR 603.2: the trigger "for the first time each turn" is one that counts the player's gains, not this ability's resolutions).
   * `triggerPlayer` is the player who gained the life.
   */
  | {
      readonly kind: 'lifeGained';
      readonly who: 'you' | 'opponent' | 'any';
      readonly firstEachTurn?: true;
    }
  /**
   * "Whenever you put one or more +1/+1 counters on this creature" (CR 122.6, 122.6a, D-149): once each time counters are put on a
   * permanent `what` names by the player `by` says ("you": the controller of this ability; `any`: whoever). `counter` limits the kind (as
   * the engine writes it, "+1/+1"); left out, any kind. Counters put by the permanent's own entering ("enters with") are put by its
   * controller (CR 122.6a). One event for one instance of putting, however many counters.
   */
  | {
      readonly kind: 'countersAdded';
      readonly what: TriggerSubject;
      readonly counter?: string;
      readonly by: 'you' | 'any';
    }
  /**
   * "Whenever you attack" (`atLeast` 1, D-187), "Whenever you attack with two or more creatures", "whenever another player attacks with two or more creatures" (CR 508.1, 603.2, D-149):
   * once when a player declares attackers and at least `atLeast` of the creatures declared match `what` (all of them when it is left
   * out). `who` is the attacking player, relative to the controller of this ability: `you` or `opponent` ("another player"). The creatures
   * are read as they are as they are declared. `triggerPlayer` is the attacking player, and the `attackersAttackedYou` condition reads whom
   * they attacked.
   */
  | {
      readonly kind: 'attackBatch';
      /** `any` (D-218): "Whenever one or more creatures attack": whoever declares them. */
      readonly who: 'you' | 'opponent' | 'any';
      readonly atLeast: number;
      readonly what?: ObjectFilter;
    }
  /**
   * "Whenever [this permanent] becomes the target of a spell or ability [an opponent controls]"
   * (CR 603.2, 702.21a Ward): `what` is the permanent targeted, `by` whose spell or ability it is
   * (relative to the controller of this ability). The triggering spell or ability is the trigger's
   * subject (`triggerSubject`). It triggers once for each spell or ability that targets it, when
   * the targets are chosen (CR 601.2c), and goes on the stack above that spell or ability.
   */
  | {
      readonly kind: 'becomesTarget';
      readonly what: TriggerSubject;
      readonly by: 'you' | 'opponent' | 'any';
      /**
       * "Whenever this creature becomes the target of a spell" (D-177, CR 603.2, 601.2c): only a spell (a card cast, or a copy of a spell) triggers
       * it, not an ability. Left out: a spell or an ability.
       */
      readonly spellOnly?: true;
    }
  /**
   * A chapter ability of a Saga (CR 714.2): "I", "II", "I, II" and so on. `from` and `to` are the
   * chapter numbers it covers, inclusive ("I, II" is `from: 1, to: 2`; "III" alone is 3 and 3).
   * "{rN}-[Effect]" triggers when lore counters are put on the Saga and their number was less than
   * N and became at least N (CR 714.2b); a range triggers once for each chapter reached (CR 714.2c).
   * Only a Saga (layout `saga`, subtype Saga) has chapter abilities.
   */
  | { readonly kind: 'chapter'; readonly from: number; readonly to: number };

// ---- Restrictions and requirements (CR 101.2, 508.1d, 509.1b, 502.3, 701.6)

/**
 * Something an object can't do, or must do, as the rules read it (D-094):
 * - `cantBlock`: it can't block (CR 509.1b);
 * - `cantAttack`: it can't attack (CR 508.1a, D-145);
 * - `cantBeBlocked`: it can't be blocked (CR 509.1b, an evasion restriction);
 * - `cantBeBlockedByMoreThanOne`: no more than one creature can block it (D-133, CR 509.1b: "can't be blocked by more than
 *   one creature"; with menace nothing can block it, CR 702.111b);
 * - `attacksEachCombat`: it attacks each combat if able (CR 508.1d, a requirement);
 * - `mustBeBlocked`: it must be blocked if able (CR 509.1c, a requirement on the defending player, D-206);
 * - `doesntUntap`: it doesn't untap during its controller's untap step (CR 502.3);
 * - `cantBeCountered`: a spell that can't be countered (CR 101.2, 701.6, 113.6g).
 * An object gets one from a static ability (`StaticEffect` `restriction`, which "loses all abilities"
 * removes) or from a continuous effect (`restrict`, which it does not, CR 613.11).
 */
export type Restriction =
  | 'cantBlock'
  | 'cantAttack'
  | 'cantBeBlocked'
  | 'cantBeBlockedByMoreThanOne'
  | 'mustBeBlocked'
  | 'attacksEachCombat'
  | 'doesntUntap'
  | 'cantBeCountered';

// ---- Keywords (CR 702). Parameters where the keyword takes them.

export type Keyword =
  | { readonly kind: 'flying' }
  | { readonly kind: 'firstStrike' }
  | { readonly kind: 'doubleStrike' }
  | { readonly kind: 'deathtouch' }
  | { readonly kind: 'defender' }
  | { readonly kind: 'haste' }
  | { readonly kind: 'hexproof' }
  | { readonly kind: 'shroud' }
  | { readonly kind: 'indestructible' }
  | { readonly kind: 'lifelink' }
  | { readonly kind: 'menace' }
  | { readonly kind: 'reach' }
  | { readonly kind: 'trample' }
  | { readonly kind: 'vigilance' }
  | { readonly kind: 'flash' }
  /**
   * CR 702.14 (Landwalk): "[type]walk": the creature can't be blocked as long as the defending
   * player controls a land with that land type ("islandwalk": `landType: 'Island'`), or a land that
   * is not basic ("nonbasic landwalk": `landType: 'nonbasic'`, CR 702.14c). A snow or artifact
   * landwalk is not supported. Only a printed keyword: a landwalk cannot be granted.
   */
  | { readonly kind: 'landwalk'; readonly landType: Subtype | 'nonbasic' }
  /** CR 702.36 (Fear): can't be blocked except by artifact creatures and/or black creatures. */
  | { readonly kind: 'fear' }
  /** CR 702.13 (Intimidate): can't be blocked except by artifact creatures and/or creatures sharing a color with it. */
  | { readonly kind: 'intimidate' }
  /** CR 702.28 (Shadow): can block and be blocked only by creatures with shadow. */
  | { readonly kind: 'shadow' }
  /**
   * CR 702.108a (Prowess): "Whenever you cast a noncreature spell, this creature gets +1/+1 until
   * end of turn." A triggered ability; the engine expands it when it derives the object's
   * abilities (`rules/derive.ts`), one trigger per instance (CR 702.108b).
   */
  | { readonly kind: 'prowess' }
  /**
   * CR 702.29a (Cycling): "Cycling [cost]" means "[Cost], Discard this card: Draw a card", an
   * activated ability that functions only from the hand. The engine expands it when it derives the
   * object's abilities (`rules/derive.ts`). Only `mana` and `payLife` costs are supported.
   */
  | { readonly kind: 'cycling'; readonly cost: readonly Cost[] }
  /**
   * CR 702.5a (Enchant): "Enchant [object]" restricts what an Aura spell can target (CR 303.4a) and
   * what it can stay attached to (CR 704.5m). `filter` describes the objects; it is read on the
   * battlefield, relative to the Aura's controller ("Enchant creature you control" sets
   * `controller: 'you'`). Only permanents are supported: `zone` is unset or 'battlefield'.
   */
  | { readonly kind: 'enchant'; readonly filter: ObjectFilter }
  /**
   * CR 702.6a (Equip): "Equip [cost]" means "[Cost]: Attach this permanent to target creature you
   * control. Activate only as a sorcery." The engine expands it when it derives the object's
   * abilities (`rules/derive.ts`). Only `mana` and `payLife` costs are supported.
   */
  | {
      readonly kind: 'equip';
      readonly cost: readonly Cost[];
      /**
       * "Equip Wizard {1}" (CR 702.6c, D-220): the equip ability attaches only to a creature this filter also matches (a creature you control as always): a creature
       * type here. The permanent may have other equip abilities, each with its own cost and restriction. "Equip commander {3}" (D-259) is `{ commander: true }`:
       * a creature that is a card a player designated as a commander (CR 903.3); it is still a creature the activating player controls (CR 702.6c).
       */
      readonly restriction?: ObjectFilter;
    }
  /**
   * CR 702.33a (Kicker): "Kicker [cost]" means "You may pay an additional [cost] as you cast this
   * spell." The caster is asked while casting (CR 601.2b, before targets), and a kicked spell pays
   * the cost on top of its other costs (CR 601.2f). One kicker or multikicker ability per
   * card: two kicker costs (CR 702.33b) are not supported; Multikicker (CR 702.33c) is its own keyword. Only `mana` and `payLife` costs.
   * What a kicked spell does is written with the `kicked` condition.
   */
  | { readonly kind: 'kicker'; readonly cost: readonly Cost[] }
  /**
   * CR 702.34a (Flashback), on an instant or sorcery: it may be cast from its owner's graveyard by
   * paying `cost` rather than its mana cost (an alternative cost, CR 118.9), and a spell cast that
   * way is exiled instead of going anywhere else when it leaves the stack. Only `mana` costs.
   */
  | { readonly kind: 'flashback'; readonly cost: readonly Cost[] }
  | { readonly kind: 'ward'; readonly cost: readonly Cost[] }
  /**
   * CR 702.122a (Crew): "Crew N" means "Tap any number of other untapped creatures you control with
   * total power N or greater: This permanent becomes an artifact creature until end of turn." An
   * activated ability of a Vehicle (CR 301.7); the engine expands it when it derives the object's
   * abilities (`rules/derive.ts`). `power` is N, a positive integer.
   */
  | { readonly kind: 'crew'; readonly power: number }
  | { readonly kind: 'protection'; readonly from: 'color'; readonly colors: readonly Color[] }
  /**
   * "Protection from each color that's not in your commander's color identity" (CR 702.16h, 702.16i, 903.4, 903.4f; D-259): protection from each of
   * the colors the controller's commanders (all of them, as `commanderIdentity`) do not have in their color identity. "Your" is the controller of the
   * ability that gives the keyword (a static ability's controller, `grantKeyword`), or of the permanent itself when the keyword is printed on it. A
   * player without a commander has no such colors: the quality is undefined and the keyword does nothing (CR 903.4f). Read where a permanent's
   * protection is read (`rules/protection.ts`) and, for a static grant, resolved to plain colors as the grant is applied (`rules/derive-statics.ts`).
   * Only a printed keyword or a static `grantKeyword` may carry it: an effect that gives a keyword for a duration takes the keywords without a parameter.
   */
  | { readonly kind: 'protection'; readonly from: 'colorsNotInCommanderIdentity' }
  /**
   * CR 702.73a (Changeling): a characteristic-defining ability, "This object is every creature type"
   * (CR 604.3), in layer 4 first (CR 613.3), working in every zone, also in a hand or a library. The
   * creature types are the CR 205.3m list (`CREATURE_TYPES`). It is read from the object's printed
   * (copiable) abilities, so a copy has it and a layer 6 effect that takes the abilities away does not
   * undo what layer 4 already gave. It cannot be granted (D-110).
   */
  | { readonly kind: 'changeling' }
  /**
   * CR 702.114a (Devoid): a characteristic-defining ability, "This object is colorless", in layer 5
   * first, working in every zone; the colored mana symbols of its mana cost stay (CR 202.2). It cannot
   * be granted (D-110).
   */
  | { readonly kind: 'devoid' }
  /**
   * CR 702.124 (Partner): a deck-construction ability (CR 702.124a): no effect in the game. Accepted so
   * that a commander with it validates; `packages/cards` checks the pair of commanders (D-053).
   */
  | { readonly kind: 'partner' }
  /**
   * CR 702.124k (Choose a Background, D-175): a deck-construction ability, like `partner`: it lets its card be a commander together with a
   * legendary Background enchantment card, and does nothing in the game. Accepted so that a card with it validates; `packages/cards`
   * checks the pair of commanders (D-053). It cannot be granted.
   */
  | { readonly kind: 'chooseBackground' }
  /**
   * CR 903.3, 113.6n ("[this card] can be your commander", D-200): a deck-construction ability, like `partner`: it lets a card that is
   * not a legendary creature (a planeswalker) be a commander, and does nothing in the game. Accepted so that a card with it validates;
   * `packages/cards` reads the line when it checks a commander (D-053). It cannot be granted.
   */
  | { readonly kind: 'canBeCommander' }
  /**
   * CR 702.131b (Ascend on a permanent, D-264): a static ability, "Any time you control ten or more permanents and you don't have the city's blessing, you get
   * the city's blessing for the rest of the game." The engine checks it with the state-based actions (`rules/city-blessing.ts`) for the controller of
   * a permanent that has it. The instant and sorcery form (CR 702.131a) is a spell ability and is not built. It cannot be granted.
   */
  | { readonly kind: 'ascend' }
  /**
   * CR 702.83a (Exalted): "Whenever a creature you control attacks alone, that creature gets +1/+1 until
   * end of turn." A triggered ability; `derive` expands it (`rules/derive-keywords.ts`), one trigger per
   * instance.
   */
  | { readonly kind: 'exalted' }
  /**
   * CR 702.86a (Annihilator): "Annihilator N" means "Whenever this creature attacks, defending player
   * sacrifices N permanents." `count` is N, a positive integer. Each instance triggers separately
   * (CR 702.86b).
   */
  | { readonly kind: 'annihilator'; readonly count: number }
  /**
   * CR 702.165a (Backup, D-230): "Backup N" means "When this creature enters, put N +1/+1 counters on target creature. If that's another creature, it also gains the
   * non-backup abilities of this creature printed below this one until end of turn." A triggered ability the engine writes when it derives the object's abilities
   * (`rules/derive-keywords.ts`), from the abilities printed after the keyword; they are fixed as the ability goes on the stack (CR 702.165d).
   * `count` is N, a positive integer.
   */
  | { readonly kind: 'backup'; readonly count: number }
  /**
   * CR 702.79a (Persist): "When this permanent is put into a graveyard from the battlefield, if it had no
   * -1/-1 counters on it, return it to the battlefield under its owner's control with a -1/-1 counter on
   * it." A triggered ability that looks back in time (CR 603.10a).
   */
  | { readonly kind: 'persist' }
  /** CR 702.93a (Undying): as Persist, with +1/+1 counters. */
  | { readonly kind: 'undying' }
  /**
   * CR 702.90 (Infect): damage dealt to a player by the source is poison counters instead of life loss, and
   * damage dealt to a creature is -1/-1 counters instead of marked damage (CR 120.3b, 120.3d). Read from
   * the source's last-known information if it has left (CR 702.90d). Grantable.
   */
  | { readonly kind: 'infect' }
  /**
   * CR 702.80 (Wither): damage dealt to a creature by the source is -1/-1 counters instead of marked
   * damage (CR 120.3d). Grantable.
   */
  | { readonly kind: 'wither' }
  /**
   * CR 702.164 (Toxic): "Toxic N": combat damage dealt to a player by the creature also gives that player
   * N poison counters (CR 120.3g); several instances add (CR 702.164b). `count` is N, a positive integer.
   */
  | { readonly kind: 'toxic'; readonly count: number }
  /**
   * CR 702.61a (Split second): as long as the spell is on the stack, players can't cast spells or
   * activate abilities that aren't mana abilities; mana abilities, special actions and triggered
   * abilities go on as normal (CR 702.61b).
   */
  | { readonly kind: 'splitSecond' }
  /**
   * CR 702.29e (Typecycling): "[Type]cycling [cost]" means "[Cost], Discard this card: Search your library
   * for a [type] card, reveal it, and put it into your hand. Then shuffle your library." `filter` is the
   * type ("basic landcycling" is `{ types: ['land'], supertypes: ['basic'] }`, "Islandcycling" is
   * `{ subtypes: ['Island'] }`); as for a `search` effect it sets neither zone nor controller. An
   * activated ability that functions only from the hand, like Cycling (CR 702.29f). Only `mana` and
   * `payLife` costs are supported.
   */
  | { readonly kind: 'typecycling'; readonly filter: ObjectFilter; readonly cost: readonly Cost[] }
  /**
   * CR 702.33c (Multikicker): "Multikicker [cost]" means "You may pay an additional [cost] any number of
   * times as you cast this spell." A kicker cost (CR 702.33c): the caster is asked how many times to pay
   * as the spell is cast (CR 601.2b), up to what they can afford, and the count is kept on the spell and
   * the permanent it becomes (`timesKicked`, `kicked`). One kicker or multikicker ability per card. Only
   * `mana` and `payLife` costs, no X (D-110).
   */
  | { readonly kind: 'multikicker'; readonly cost: readonly Cost[] }
  /** CR 702.118 (Skulk): an evasion ability: it can't be blocked by creatures with greater power (702.118b). */
  | { readonly kind: 'skulk' }
  /**
   * CR 702.91a (Battle cry): "Whenever this creature attacks, each other attacking creature gets +1/+0 until
   * end of turn." A triggered ability that `derive` expands (`rules/derive-keywords.ts`, D-120); each
   * instance triggers separately (CR 702.91b).
   */
  | { readonly kind: 'battleCry' }
  /**
   * CR 702.134a (Mentor): "Whenever this creature attacks, put a +1/+1 counter on target attacking creature
   * with power less than this creature's power." Expanded by `derive`; each instance triggers separately.
   */
  | { readonly kind: 'mentor' }
  /**
   * CR 702.100a (Evolve): "Whenever a creature you control enters, if that creature's power is greater than this
   * creature's power and/or that creature's toughness is greater than this creature's toughness, put a +1/+1
   * counter on this creature." Expanded by `derive`; the "if" is checked as it triggers and as it resolves.
   */
  | { readonly kind: 'evolve' }
  /**
   * CR 702.45a (Bushido): "Bushido N" means "Whenever this creature blocks or becomes blocked, it gets +N/+N
   * until end of turn." Expanded by `derive` into one ability for blocking and one for being blocked, for each
   * instance (CR 702.45b). `count` is N, a positive integer.
   */
  | { readonly kind: 'bushido'; readonly count: number }
  /**
   * CR 702.101a (Extort): "Whenever you cast a spell, you may pay {W/B}. If you do, each opponent loses 1 life
   * and you gain life equal to the total life lost this way." Expanded by `derive`; each instance triggers
   * separately (CR 702.101b).
   */
  | { readonly kind: 'extort' }
  /**
   * CR 702.41a (Affinity): "Affinity for [text]" means "This spell costs {1} less to cast for each [text] you
   * control." A static ability that functions on the stack: the cost reduction of `rules/cast-cost.ts`
   * counts the objects `filter` matches ("Affinity for artifacts" is `{ types: ['artifact'] }`; the count is of
   * the permanents the caster controls, so `controller` is set by the engine, not by the card). Every instance
   * applies (CR 702.41b).
   */
  | { readonly kind: 'affinity'; readonly filter: ObjectFilter }
  /**
   * CR 702.51a (Convoke): while the spell is being cast, the caster may tap untapped creatures they control
   * for the colored and generic mana of the total cost (CR 601.2f-h). Not an additional or alternative cost
   * (CR 702.51b). Multiple instances are redundant (CR 702.51d). See the `payOptions` stage of casting.
   */
  | { readonly kind: 'convoke' }
  /** CR 702.126a (Improvise): as Convoke, tapping untapped artifacts for generic mana only. */
  | { readonly kind: 'improvise' }
  /** CR 702.66a (Delve): as Convoke, exiling cards from the caster's graveyard for generic mana only. */
  | { readonly kind: 'delve' }
  /**
   * CR 702.85a (Cascade): "When you cast this spell, exile cards from the top of your library until you
   * exile a nonland card whose mana value is less than this spell's mana value. You may cast that card
   * without paying its mana cost if the resulting spell's mana value is less than this spell's mana value.
   * Then put all cards exiled this way that weren't cast on the bottom of your library in a random order."
   * A triggered ability of the spell that `derive` expands (`castSpell` with `self`); each instance
   * triggers separately (CR 702.85c).
   */
  | { readonly kind: 'cascade' }
  /**
   * CR 702.40a (Storm, D-129): "When you cast this spell, copy it for each other spell that was cast before it this
   * turn. If the spell has any targets, you may choose new targets for any of the copies." A triggered ability of the
   * spell, expanded by `derive` (`rules/derive-keywords.ts`) into `castSpell` with `self` and the `storm` effect. Each
   * instance triggers separately (CR 702.40b).
   */
  | { readonly kind: 'storm' }
  /**
   * CR 702.56a (Replicate, D-129): "Replicate [cost]" means "As an additional cost to cast this spell, you may pay
   * [cost] any number of times" and "When you cast this spell, if a replicate cost was paid for it, copy it for each
   * time its replicate cost was paid. If the spell has any targets, you may choose new targets for any of the
   * copies." The count is asked as the spell is cast, like Multikicker's (`chooseX`, purpose 'replicate'), and kept on
   * the spell (`StackData.replicated`); the engine expands the keyword (`rules/derive-keywords.ts`) into a trigger
   * of the spell whose intervening "if" is the `replicated` condition and whose effect is `replicate`. Mana only, no X;
   * one replicate ability per face (a second is not run, CR 702.56b).
   */
  | { readonly kind: 'replicate'; readonly cost: readonly Cost[] }
  /**
   * CR 702.84a (Unearth, D-124): "[Cost]: Return this card from your graveyard to the battlefield. It gains
   * haste. Exile it at the beginning of the next end step. If it would leave the battlefield, exile it instead
   * of putting it anywhere else. Activate only as a sorcery." An activated ability that functions from the
   * graveyard; the engine expands the keyword (`rules/derive-keywords.ts`) and the effect does the rest: the
   * card returns as a new object that remembers it was unearthed (`GameObject.alt`: haste and the exile
   * replacement), and a delayed triggered ability exiles it at the beginning of the next end step.
   */
  | { readonly kind: 'unearth'; readonly cost: readonly Cost[] }
  /**
   * CR 702.141a (Encore, D-185): "Encore [cost]" means "[Cost], Exile this card from your graveyard: For each opponent, create a token that's a
   * copy of this card that attacks that opponent this turn if able. The tokens gain haste. Sacrifice them at the beginning of the next end step.
   * Activate only as a sorcery." An activated ability that functions from the graveyard; the engine expands the keyword
   * (`rules/derive-keywords.ts`) into that ability with the `exileThis` cost and the `encore` effect. Mana only, no X; one encore ability on a
   * permanent card.
   */
  | { readonly kind: 'encore'; readonly cost: readonly Cost[] }
  /**
   * CR 702.82a (Devour, D-185): "Devour N" means "As this object enters, you may sacrifice any number of creatures. This permanent enters with N
   * +1/+1 counters on it for each creature sacrificed this way." A static ability, applied as the permanent enters (CR 614.12): its controller
   * is asked which creatures they control to sacrifice (`choosePermanent` of purpose `devour`, none is a legal answer), before it is on the
   * battlefield, so it cannot sacrifice itself. `count` is N, a positive whole number. One devour ability on a permanent card or a token (the
   * variant "Devour [quality]", CR 702.82c, is not supported). It cannot be granted.
   */
  | { readonly kind: 'devour'; readonly count: number }
  /**
   * CR 702.136a (Riot, D-185): "You may have this permanent enter with an additional +1/+1 counter on it. If you don't, it gains haste." A static
   * ability, applied as the permanent enters (CR 614.12): its controller chooses between the counter and haste (`chooseOption` of purpose
   * `riot`) before it is on the battlefield. Each instance works separately (CR 702.136b), so a creature with two of them (its own and one another
   * permanent gives it) is asked twice. Grantable: "Nontoken creatures you control have riot" is read from the permanents on the battlefield as the
   * creature enters (CR 614.12), and a permanent that has it only after it entered is not asked.
   */
  | { readonly kind: 'riot' }
  /**
   * CR 702.30a (Echo, D-127): "Echo [cost]" means "At the beginning of your upkeep, if this permanent came under
   * your control since the beginning of your last upkeep, sacrifice it unless you pay [cost]." A triggered
   * ability that `derive` expands (`rules/derive-keywords.ts`): the intervening "if" is the
   * `cameUnderControlSinceLastUpkeep` condition (CR 603.4) and the effect is `unlessPays` with the sacrifice.
   * Mana only, no X (`validateCard` says why for any other cost). Each instance triggers separately.
   */
  | { readonly kind: 'echo'; readonly cost: readonly Cost[] }
  /**
   * CR 702.24a (Cumulative upkeep, D-127): "Cumulative upkeep [cost]" means "At the beginning of your upkeep, if
   * this permanent is on the battlefield, put an age counter on this permanent. Then you may pay [cost] for each
   * age counter on it. If you don't, sacrifice it." Expanded by `derive` into a triggered ability of the
   * `cumulativeUpkeep` effect. Mana, "Pay N life" and "Discard a card" costs (what `unlessPays` pays), no X.
   */
  | { readonly kind: 'cumulativeUpkeep'; readonly cost: readonly Cost[] }
  /**
   * CR 702.62a (Suspend, D-128): "Suspend N—[cost]". Three abilities the engine runs itself
   * (`rules/suspend.ts`): a special action that works from the hand ("If you could begin to cast this card, you
   * may pay [cost] and exile it with N time counters on it", the action `suspend`, CR 116.2f), and two triggered
   * abilities that work from exile ("At the beginning of your upkeep, if this card is suspended, remove a time
   * counter from it" and "When the last time counter is removed from this card, if it's exiled, you may play it
   * without paying its mana cost if able. If you cast a creature spell this way, it gains haste"). `count` is N,
   * a positive whole number; `cost` is mana only, with no {X}. One suspend ability on a card that is not a land.
   */
  | { readonly kind: 'suspend'; readonly count: number; readonly cost: readonly Cost[] }
  /**
   * "Gift a card" (CR 702.174, D-135): as an additional cost to cast the spell the caster may choose an opponent (the gift is
   * promised, CR 702.174k); asked after the kicker and replicate questions and before X and the targets (CR 601.2b). Of a
   * permanent: "When this permanent enters, if its gift cost was paid, the chosen player draws a card"; of an instant or sorcery:
   * "if its gift cost was paid, the chosen player draws a card", before the other effects, and not at all if the spell is
   * countered or leaves the stack (CR 702.174j). The engine writes both abilities itself (`giftRecipient`, `giftPromised`);
   * the card adds its own text that reads `giftPromised`. `gift` names what is given: only `card` is built (a Food, a tapped
   * Fish, an extra turn, a Treasure, an Octopus are not).
   */
  | { readonly kind: 'gift'; readonly gift: 'card' }
  /**
   * CR 702.75a (Hideaway, D-145): "Hideaway N" means "When this permanent enters, look at the top N cards of your library. Exile one of them face
   * down and put the rest on the bottom of your library in a random order. The exiled card gains 'The player who controls the permanent that
   * exiled this card may look at this card in the exile zone.'" A triggered ability the engine writes itself (`rules/derive-keywords.ts`): a
   * `lookAtTop` that takes one card into exile face down, linked to the permanent. The card's own "enters tapped" is a separate replacement
   * (CR 702.75b: older cards have it as its own ability). `count` is N, a positive whole number.
   */
  | { readonly kind: 'hideaway'; readonly count: number }
  /**
   * CR 702.105a (Dethrone, D-151): "Whenever this creature attacks the player with the most life or tied for most life, put a +1/+1 counter on
   * it." A triggered ability that `derive` writes (`rules/derive-keywords.ts`), with the condition `attackingMostLife` as part of the trigger.
   */
  | { readonly kind: 'dethrone' }
  /**
   * CR 702.116a (Myriad, D-151): "Whenever this creature attacks, for each opponent other than defending player, you may create a token that's a
   * copy of this creature that's tapped and attacking that player or a planeswalker they control. Exile the tokens at end of combat." The engine
   * has two players, so there is never an opponent other than the defending player and the ability does nothing: it has no ability to expand
   * (`docs/ROADMAP.md`).
   */
  | { readonly kind: 'myriad' }
  /**
   * CR 702.155 (Read ahead, D-151): "Read ahead" on a Saga is "As this Saga enters, choose a number between one and this Saga's final chapter
   * number" and "This Saga enters with the chosen number of lore counters on it" (CR 714.3b, replacement effects that take the place of the lore
   * counter every Saga enters with), and its chapter abilities cannot trigger the turn it entered unless it has exactly the number of lore counters
   * the chapter symbol says (CR 702.155a). The choice is a `chooseOption` decision (`purpose: 'option'`) whose options are "1" to the final chapter.
   * Only a Saga with chapter abilities has it.
   */
  | { readonly kind: 'readAhead' }
  /**
   * CR 702.120a (Escalate, D-145): "Escalate [cost]" means "For each mode you choose beyond the first as you cast this spell, you pay an
   * additional [cost]": a static ability of a modal spell that works on the stack. The cost is added to the total cost of the spell
   * (CR 601.2f) once for each mode chosen beyond the first; a set of modes whose escalate cost the caster could not pay is not offered.
   * Mana only, no {X}. On a face whose spell text is modal and lets more than one mode be chosen (`validateCard`).
   */
  | { readonly kind: 'escalate'; readonly cost: readonly Cost[] }
  /**
   * CR 702.92a (Living weapon, D-139): "When this Equipment enters, create a 0/0 black Phyrexian Germ creature token, then attach this
   * Equipment to it." A triggered ability the engine writes itself (`rules/derive-keywords.ts`); only on an Equipment (`validateCard`).
   */
  | { readonly kind: 'livingWeapon' }
  /**
   * CR 702.182a (Job select, D-206): "When this Equipment enters, create a 1/1 colorless Hero creature token, then attach this to it." A triggered
   * ability the engine writes itself (`rules/derive-keywords.ts`), as for Living weapon; only on an Equipment (`validateCard`).
   */
  | { readonly kind: 'jobSelect' };

// ---- Conditions

/**
 * A condition on the game as it is when something is checked (a replacement effect applying as a
 * permanent enters, CR 614.12, a `conditional` effect as it runs, CR 608.2c, or the intervening "if"
 * of a triggered ability, CR 603.4). `controlsAtLeast`
 * counts the battlefield permanents the condition's controller controls that match the filter
 * ("two or more basic lands"; set `other` for "other lands"); `opponentsAtLeast` counts the
 * opponents still in the game.
 */
export type Condition =
  | { readonly kind: 'controlsAtLeast'; readonly filter: ObjectFilter; readonly count: number }
  | { readonly kind: 'opponentsAtLeast'; readonly count: number }
  /**
   * CR 702.33d (Kicker): the object was kicked. Read from the spell that is resolving, or, for an
   * ability of a permanent ("When this enters, if it was kicked"), from the permanent, which keeps
   * the fact from the spell it came from (and from its last-known information once it has left).
   */
  | { readonly kind: 'kicked' }
  /**
   * CR 702.56a (Replicate, D-129): "if a replicate cost was paid for it": the spell was cast with its replicate cost
   * paid at least once. Read from the spell, or from its last-known information once it has left (CR 113.7a).
   * Needs a replicate ability on the card.
   */
  | { readonly kind: 'replicated' }
  /**
   * "If you control a commander" (CR 903.3d): the condition's controller controls a permanent on the
   * battlefield that is a commander (a card designated as a commander, CR 903.3: a token or a permanent
   * copying a commander is not one). Whose commander it is does not matter. A commander in the
   * command zone, or a spell, is not controlled.
   */
  | {
      readonly kind: 'controlCommander';
      /**
       * "If you control your commander" (D-133, CR 903.3): only a commander that is the condition's controller's own
       * (a card the player designated as their commander, which they own) counts, not another player's commander that
       * they control. Without it, as above, whose commander it is does not matter.
       */
      readonly yours?: true;
    }
  /**
   * "As long as you have 30 or more life", "if you have at least 7 life more than your starting life total" (D-133, CR
   * 119.1, 903.7): the condition's controller's life total (`aboveStarting`: the difference from the life total each
   * player started the game with) compared with a whole number. Without `aboveStarting` the number is not negative; with
   * it, it may be.
   */
  | {
      readonly kind: 'lifeTotal';
      readonly compare: NumberComparison;
      readonly aboveStarting?: true;
    }
  /**
   * "As long as it's untapped", "if this is a Zombie" (D-133): the permanent the condition belongs to (`this`) matches
   * the filter (its types, subtypes, colors, tapped status, ...), read as it is now, or as it last was when it has left.
   * The filter's `zone`, `owner` and `controller: 'opponent'` have no meaning here: it is checked against the one
   * permanent, as its controller's.
   */
  | { readonly kind: 'thisMatches'; readonly filter: ObjectFilter }
  /**
   * "It had a -1/-1 counter on it" (CR 702.79a Persist, 702.93a Undying): the source of the ability has at
   * least one counter of the kind, as it is now or, once it has left the battlefield, as it last existed
   * (CR 603.10a, 113.7a). "If it had no -1/-1 counters" is `not` of this.
   */
  | { readonly kind: 'sourceHasCounter'; readonly counter: string }
  /**
   * "That creature's power is greater than this creature's power and/or that creature's toughness is greater
   * than this creature's toughness" (CR 702.100a, Evolve, D-120): the trigger's subject (the creature that
   * entered) against the source of the ability. Both are read as they are now, or from last-known
   * information if one has left (CR 113.7a); a source with no power or toughness (a noncreature permanent,
   * CR 702.100c) is never exceeded. Only valid as the intervening "if" of an `entersBattlefield` trigger.
   */
  | { readonly kind: 'subjectGreaterPt' }
  /**
   * "If that player controls more lands than you" (D-229, CR 603.4, 109.4): the controller of the object whose event caused the trigger (the land that
   * entered, `triggerSubject`) has a greater `stat` than the controller of this ability. Read as the ability triggers and again as it resolves (an
   * intervening "if"), the subject as it is or as it last was. Only the intervening "if" of a trigger that has a permanent as its subject
   * (`entersBattlefield`, `landfall`, `dies` and the like); fails when there is none.
   */
  | { readonly kind: 'subjectControllerHasMore'; readonly stat: PlayerStat }
  /**
   * "If that player controls more creatures than you" (CR 603.4, 110.2; the Bruna deck, Keeper of the Accord): the player the event of the trigger is
   * about (`triggerPlayer`: the active player of a `step`, `upkeep` or `endStep` trigger, the player who drew, who cast, ...) has a greater `stat` than
   * the controller of this ability. Read as the ability triggers and again as it resolves (an intervening "if"), so the player stays on the stack
   * with the ability. Only the intervening "if" of a trigger whose event is about a player; fails when there is none.
   */
  | { readonly kind: 'triggerPlayerHasMore'; readonly stat: PlayerStat }
  /**
   * "As long as there are fewer than eight cards in your graveyard" (D-229, CR 404.1): the number of cards in the graveyard of the controller of the thing
   * that asks meets the comparison (`atMost` 7 is "fewer than eight"). It reads no characteristic, so a static ability that works in layer 4 may have it.
   */
  | { readonly kind: 'cardsInGraveyard'; readonly compare: NumberComparison }
  /**
   * "If it escaped", "unless it escaped" (CR 702.138b, D-124): the spell that is resolving, or the permanent (and
   * its last-known information once it has left), was cast from a graveyard with an escape ability.
   * "Unless it escaped" is `not` of this. Only on a face that lists an escape cost.
   */
  | { readonly kind: 'escaped' }
  /**
   * "If this permanent came under your control since the beginning of your last upkeep" (CR 702.30a Echo, D-127):
   * the source of the ability is on the battlefield under the control of the condition's controller, and it came
   * under that control (CR 302.6: its timestamp, `GameObject.timestamp`) after the beginning of the controller's
   * previous turn (`SeatState.previousTurnStartTimestamp`; nothing can happen between the start of a turn and its
   * upkeep, CR 502.4). Read as the ability triggers and again as it resolves (CR 603.4); a source that has left
   * the battlefield fails it, so the ability is removed. Only the intervening "if" of an `upkeep` or `step` trigger
   * of "your upkeep".
   */
  | { readonly kind: 'cameUnderControlSinceLastUpkeep' }
  /**
   * "If creatures you control have total power 8 or greater", "if you have seven or more creature cards in your
   * graveyard" (D-131): any state-reading amount compared with a whole number, as it is when the condition is read
   * (CR 603.4: as the ability triggers and as it resolves, for an intervening "if"). `amount` is a count of objects
   * (`countOf`), an `aggregate`, a `devotion`, `commanderColors`, `countersOn` of `this`, `opponentsWithMore`, or a
   * `half`, `multiple` or `sum` of those: nothing that needs a target, an X, a trigger subject or an earlier
   * instruction.
   */
  | { readonly kind: 'amountIs'; readonly amount: Amount; readonly compare: NumberComparison }
  /**
   * "If you're the monarch", "if an opponent is the monarch" (CR 725, D-131): the holder of the designation is one of
   * the players `player` names (relative to the controller of the thing that asks: `you`, `eachOpponent`, ...). A
   * designation is something a player has, not a permanent or an emblem (CR 725.1: "the monarch is a designation");
   * today only the monarch. Nobody has it
   * until an effect gives it (CR 725.1).
   */
  | {
      readonly kind: 'playerHasDesignation';
      readonly player: PlayerSelector;
      readonly designation: Designation;
    }
  /**
   * "Activate only if this Class is level 1" (CR 716.2a, 716.2d, D-235): the source permanent is at level `level` now; a permanent with no level is at level 1.
   * Read for the permanent the ability belongs to (an activated ability's `activateOnlyIf`).
   */
  | { readonly kind: 'classLevelIs'; readonly level: number }
  /**
   * "If it's a Zombie card", "if it's an Angel" (D-135): an object a reference names against a filter, as it is now or as it
   * last was if it has left (CR 113.7a, 608.2h): the target of a spell whose card an earlier instruction moved is read as it
   * was when it left, so "return target creature card from your graveyard to your hand. If it's a Zombie card, draw a card"
   * reads the card whatever zone it is in now. Only in a `conditional` effect (`validateCard`), with a `target` or `moved`
   * reference, or (D-149, "If that land is a Plains") the `triggerSubject` of a trigger whose subject is a permanent; the filter names no zone,
   * controller or owner (it describes the object).
   */
  | { readonly kind: 'objectMatches'; readonly of: ObjectRef; readonly filter: ObjectFilter }
  /**
   * "During your first, second, or third turn of the game" (CR 500.1, D-149): it is the turn of the player the condition is read for and
   * the number of turns they have had, this one included, satisfies the comparison (`atMost` 3 is the first three).
   */
  | { readonly kind: 'ownTurnNumber'; readonly compare: NumberComparison }
  /**
   * "You control three or more lands with the same name" (D-149): among the battlefield permanents the condition's controller controls that match
   * `filter`, at least `count` share a name (as the permanents have it now, after copy effects: two basic Plains, or a Plains and a copy of
   * one). `filter` names no zone or controller.
   */
  | { readonly kind: 'sameNameAtLeast'; readonly filter: ObjectFilter; readonly count: number }
  /**
   * "None of those creatures attacked you" (CR 508.1b, D-149): at least one of the creatures declared as attackers in the event of an
   * `attackBatch` trigger was declared as attacking the controller of this ability as a player (not a planeswalker or a battle they
   * control). It reads the declaration, so a creature removed from combat since still counts. "None of those creatures attacked you" is
   * `not` of this. Valid only in the effect of an `attackBatch` trigger (`validateCard`).
   */
  | { readonly kind: 'attackersAttackedYou' }
  /**
   * "If you do" (CR 603.12, 608.2c, D-135, as Learn reads in CR 701.48a): the player did what the nearest `may` effect before it in the same sequence
   * offered (it was accepted and the doing happened). False when it was declined or could not be done. Only in a
   * `conditional` effect that follows a `may` in its sequence.
   */
  | { readonly kind: 'didPrevious' }
  /**
   * "If a creature card was discarded this way" (D-210, CR 608.2c): the `thisWay` count `what` of this same resolution is at least `count`. Only in a
   * `conditional` effect after an effect that makes the count (`discardedCreature` and `discardedNoncreature` after a discard).
   */
  | { readonly kind: 'thisWayAtLeast'; readonly what: ThisWayKind; readonly count: number }
  /**
   * "If the gift was promised" (CR 702.174k, D-135): the spell was cast with its gift cost paid (an opponent chosen), or the
   * permanent came from such a spell. Read from the spell on the stack, from the permanent that remembers it, or from last-known
   * information once either has left (CR 113.7a), as `kicked` is. The face must have the Gift keyword (`validateCard`).
   */
  | { readonly kind: 'giftPromised' }
  /**
   * "If an opponent controls four or more nonbasic lands" (D-135): some one opponent of the controller controls at least
   * `count` permanents on the battlefield that match the filter (not the opponents together). `filter` names no zone or
   * controller.
   */
  | {
      readonly kind: 'opponentControlsAtLeast';
      readonly filter: ObjectFilter;
      readonly count: number;
    }
  /**
   * "If you control the artifact with the greatest mana value or tied for the greatest mana value", "if you control the creature with
   * the greatest power" (D-139): among all the battlefield permanents the filter matches, whoever controls them, the one or ones with
   * the largest `stat` (as `derive` gives it now; a permanent with no such stat, a noncreature's power, is left out); true when the
   * condition's controller controls one of those, so a tie counts for both. Nobody matched makes it false. The filter sets no
   * `controller` (it is the condition that names "you" and "anyone"), no zone other than the battlefield and no `owner`.
   */
  | {
      readonly kind: 'controlsGreatest';
      readonly filter: ObjectFilter;
      readonly stat: 'power' | 'toughness' | 'manaValue';
    }
  /**
   * "When this artifact enters during the declare attackers step" (D-139, CR 500.1, 506.1): true while the game is in that step of
   * any turn. Read where the condition is read, so as an `interveningIf` it holds when the event happens and again as the ability
   * resolves: the stack empties before a step ends (CR 117.4, 500.2), so that is the same step.
   */
  | { readonly kind: 'duringStep'; readonly step: CombatStep }
  /**
   * "Whenever a land you control enters, if it's your main phase, ..." (D-187, CR 505.1): true while the game is in the precombat or the postcombat
   * main phase of a turn of the condition's controller. Read where the condition is read, so as an `interveningIf` it holds when the event happens and
   * again as the ability resolves (CR 603.4); the stack empties before a phase ends (CR 117.4), so that is the same phase.
   */
  | { readonly kind: 'yourMainPhase' }
  /**
   * "During your turn, equipped creature has flying." (CR 611.3a, 613.8, D-206): true while the active player is the controller of the ability
   * or static ability. The active player is no characteristic and no layer changes it, so a static ability may read it. Read where the condition is
   * read (a static ability's `condition` each time its effect is looked at; an `interveningIf` as the event happens and as the ability resolves).
   */
  | { readonly kind: 'yourTurn' }
  /**
   * "If a card left your graveyard this turn" (CR 603.4, 400.7, D-206): a card of the controller's (owned by them) left a graveyard, to any zone, since
   * the turn began (a card cast from it, exiled, returned, shuffled in; a card that moved on from there is a new object and counts once, as it left).
   * Read from the turn log, so it is read as the event happens and again as the ability resolves.
   */
  | { readonly kind: 'cardLeftYourGraveyard' }
  /**
   * "If at least four mana was spent to cast it" (CR 601.2h, 603.4, D-206): the spell that caused a cast trigger (its `triggerSubject`) was cast with at
   * least `count` mana spent on its cost in all (the mana of Convoke, Improvise and Delve and life paid for Phyrexian mana are not counted, as
   * for `manaSpent`). Only in the intervening "if" of a `castSpell` trigger.
   */
  | { readonly kind: 'manaSpentAtLeast'; readonly count: number }
  /**
   * "If this spell was cast from a graveyard" (CR 601.2, 603.4, D-206): the source, a spell on the stack (or what it was as it left it), was cast from
   * `zone`: a card cast with Flashback or any other permission from its owner's graveyard is cast from the graveyard.
   */
  | { readonly kind: 'castFromZone'; readonly zone: Zone }
  /**
   * "This spell costs {3} less to cast if it targets a tapped creature" (CR 601.2c, 601.2f, D-207): at least one of the targets the source spell has chosen
   * is an object the filter matches (a player never is). The targets are chosen before the total cost is determined (CR 601.2c comes before 601.2f), so
   * the condition of a `costReduction` of the spell itself reads them. Only for the source spell (`this`); with no target chosen it does not hold.
   */
  | { readonly kind: 'spellTargets'; readonly filter: ObjectFilter }
  /**
   * "Khans — At the beginning of your upkeep, ..." (D-151, CR 607.2d, 614.12a): the permanent this condition belongs to chose `option` as it entered (an
   * `asEntersChoose` of `option` on the same face), read from the permanent, or from last-known information once it has left (CR 113.7a). The condition
   * that makes an ability a linked ability of that choice; as `triggerCondition` it is read as the event happens.
   */
  | { readonly kind: 'chosenOption'; readonly option: string }
  /**
   * "As long as two or more nonland permanents entered the battlefield under your control this turn" (Celebration, D-151): at least `count`
   * permanents entered the battlefield under the control of the condition's controller this turn, counting those that have left since, each
   * as it was as it entered (CR 400.7). `types` and `notTypes` are card types it must (all) and must not (none) have, `token` limits it to
   * tokens or to cards; all optional. Reads the turn log only, so a static ability may use it in any layer.
   */
  | {
      readonly kind: 'enteredThisTurn';
      readonly count: number;
      readonly types?: readonly CardType[];
      readonly notTypes?: readonly CardType[];
      readonly token?: boolean;
    }
  /**
   * "If an opponent was dealt 7 or more damage this turn" (D-151, CR 120.3): the damage the players the selector names were dealt this turn, by
   * any source, combat or not, as it was dealt after prevention (the damage of the whole turn so far, from every source): `opponent` is true
   * when some one opponent of the condition's controller was dealt at least `atLeast`, `you` when the controller was. Reads the turn log only.
   */
  | {
      readonly kind: 'playerDealtDamage';
      readonly player: 'you' | 'opponent';
      readonly atLeast: number;
    }
  /**
   * "If it's attacking the player with the most life or tied for most life" (Dethrone, CR 702.105a, D-151): the source is an attacking creature
   * whose attack target is a player (not a planeswalker or a battle) with at least as much life as every other player still in the game. As
   * a `triggerCondition` it is read with the event; as an `interveningIf` also as the ability resolves. Not for a static ability.
   */
  | { readonly kind: 'attackingMostLife' }
  /**
   * "If you attacked with creatures with total power 6 or greater this combat" (Pack tactics, D-151): the creatures the controller of the
   * condition has attacking now have at least `atLeast` total power, as `derive` gives it. Not for a static ability.
   */
  | { readonly kind: 'attackersTotalPower'; readonly atLeast: number }
  /**
   * "If you gained 3 or more life this turn" (CR 119.3, 603.4, D-252): the controller of the condition gained at least `atLeast` life in all this turn (every gain
   * after replacement, summed; a gain of 0 is no event, CR 119.9). Reads the turn log only, so it is read as the event happens and again as the ability resolves.
   */
  | { readonly kind: 'lifeGainedThisTurn'; readonly atLeast: number }
  /**
   * "If you control your Ring-bearer" (CR 701.54e, D-196): the controller of the condition has a creature that is on the battlefield under their
   * control and is their Ring-bearer. Not for a static ability.
   */
  | { readonly kind: 'controlsRingBearer' }
  | { readonly kind: 'and' | 'or'; readonly terms: readonly Condition[] }
  | { readonly kind: 'not'; readonly term: Condition };

/** The steps of the combat phase (CR 506.1) a `duringStep` condition can name. */
export type CombatStep =
  | 'beginningOfCombat'
  | 'declareAttackers'
  | 'declareBlockers'
  | 'firstStrikeDamage'
  | 'combatDamage'
  | 'endOfCombat';

export const COMBAT_STEPS: readonly CombatStep[] = [
  'beginningOfCombat',
  'declareAttackers',
  'declareBlockers',
  'firstStrikeDamage',
  'combatDamage',
  'endOfCombat',
];

// ---- Replacement effects (CR 614)

export type Replacement =
  /**
   * "This permanent enters tapped." With `unless`: "enters tapped unless <condition>" (CR 614.1c,
   * 614.12); the condition is checked as it enters, without the permanent on the battlefield.
   */
  | { readonly kind: 'entersTapped'; readonly unless?: Condition }
  /**
   * "As this enters, you may pay 2 life. If you don't, it enters tapped" (CR 614.1c, 614.12, a
   * shock land). The controller is asked before it enters; paying makes it enter untapped. Only
   * `payLife` costs are supported.
   */
  | { readonly kind: 'entersTappedUnlessPays'; readonly cost: readonly Cost[] }
  /**
   * "As this land enters, you may reveal a Mountain or Plains card from your hand. If you don't, this land enters tapped" and "you may behold a Jace"
   * (CR 614.1c, 614.12, 701.20, 701.4, D-208, the checklands of the Vraska deck's set): the controller is asked before it enters (the question of
   * `entersTappedUnlessPays`, with no cost, and the words `words` for the dialog); revealing makes it enter untapped and reveals a card of the hand the
   * `filter` matches (CR 701.20a). With `fromBattlefield` (behold) a permanent the controller controls that matches also does, and is only chosen, not
   * revealed. Nothing is asked when no card (or permanent) qualifies: it enters tapped. The card revealed is the first the engine lists; which one does
   * not change the game, only what the opponent learns (`docs/ROADMAP.md`).
   */
  /**
   * "This creature enters prepared." (CR 722.3a, 722.3c, D-214): the permanent that enters gets the designation "prepared" and its controller makes the copy of its
   * prepare spell in exile. Only on the first face of a card of the layout `prepare` (a permanent cannot be prepared without a prepare spell).
   */
  | { readonly kind: 'entersPrepared' }
  | {
      readonly kind: 'entersTappedUnlessReveals';
      readonly filter: ObjectFilter;
      readonly words: string;
      readonly fromBattlefield?: true;
    }
  /**
   * "This permanent enters with N <counter> counters on it." `count` is `{ kind: 'x' }` for "enters
   * with X +1/+1 counters on it": the X of the spell it entered from (CR 107.3m), 0 when it was not
   * cast (CR 107.3g, a flicker or a token). Only on a card whose mana cost has an {X}. A `countOf` is "a +1/+1
   * counter on it for each Zombie card in your graveyard" (D-131): counted as it enters, for its controller,
   * looking at the game without it (CR 614.12), so a card that comes from the stack or the graveyard is not counted
   * where it was.
   */
  | {
      readonly kind: 'entersWithCounters';
      readonly counter: string;
      /**
       * `timesKicked` (D-254, CR 702.33c, 614.1c): "enters with a charge counter on it for each time it was kicked", the kicks of the spell the permanent came from.
       */
      readonly count:
        | number
        | { readonly kind: 'x' }
        | { readonly kind: 'timesKicked' }
        | CountAmount;
      /**
       * "This permanent escapes with a +1/+1 counter" (CR 702.138c, D-124): the counters are put on it only if it
       * escaped, i.e. its spell was cast from a graveyard for its escape cost. Only on a face with an escape cost.
       */
      readonly ifEscaped?: true;
    }
  /**
   * "As this enters, choose a creature type" / "choose a color" (CR 614.1c, 614.12, 614.12a; D-100). The
   * controller of the permanent chooses before it enters, whether it was cast, put onto the battlefield
   * by an effect, or is a token or a copy of such a permanent (CR 614.12: Voice of All's token copy). The
   * answer is stored on the permanent (`GameObject.chosen`) and read by `chosenType` and `chosenColor`
   * filters and by a static `setTypes` ("the chosen type"), which are linked to this ability (CR 607.2d).
   * A face has at most one ability that asks a question as it enters (this, or `entersTappedUnlessPays`).
   */
  | {
      readonly kind: 'asEntersChoose';
      readonly what: 'creatureType' | 'color' | 'option';
      /**
       * For `what: 'option'` (D-151, "As this enchantment enters, choose Khans or Dragons"): the names the controller chooses among, at least two
       * different ones, as the card writes them. The answer is kept on the permanent (`GameObject.chosen.option`) and read by the condition
       * `chosenOption` of the abilities that are linked to it ("Khans — ...", CR 607.2d). Absent for the other kinds.
       */
      readonly options?: readonly string[];
    }
  /**
   * "If a nontoken creature an opponent controls would die, instead exile that card and create a 2/2 black Zombie creature
   * token" (D-133, CR 614.1a, 700.4): a replacement effect of a permanent on the battlefield, for each creature that
   * `what` matches (read as a permanent, relative to the controller of the permanent with this ability: `controller:
   * 'opponent'` is its controller's opponents) that would be put into a graveyard from the battlefield, by any means
   * (destroy, lethal damage, a sacrifice, zero toughness). It is exiled instead (`instead`), so it never dies: no "dies"
   * ability triggers, while "leaves the battlefield" abilities do (CR 603.10a). With `alsoCreate` the controller of the
   * permanent with the ability creates `count` tokens at the same time. It is the ability of a permanent on the
   * battlefield (CR 614.6, it is lost with "loses all abilities"); permanents that die at the same time as the permanent
   * with the ability are still replaced (CR 614.12: the replacement is read from the battlefield as the event begins). When
   * several apply to one creature the one of the oldest permanent is used and no choice is offered (CR 616.1, see
   * `docs/ROADMAP.md`).
   */
  | {
      readonly kind: 'wouldDie';
      readonly what: ObjectFilter;
      readonly instead: 'exile';
      readonly alsoCreate?: {
        readonly token: Extract<TokenSpec, { readonly kind: 'preset' | 'custom' }>;
        readonly count: number;
      };
    }
  /**
   * "If one or more artifact tokens would be created under your control, that many 5/5 red Dragon creature tokens with flying are created instead" (`thatMany`)
   * and "..., those tokens plus an additional 1/1 colorless Thopter artifact creature token with flying are created instead" (`plus`) (D-219, CR 614.1a, 111.2,
   * 616.1): a replacement effect of a permanent on the battlefield for the creation of tokens under its controller's control. It applies to the tokens one
   * effect would create at once that `what` matches (as they would be on the battlefield: a token's own characteristics, `controller: 'you'` the controller of the
   * permanent); `thatMany` replaces those tokens with as many of `token`, `plus` leaves them and adds one `token`. It is applied once to one event (CR 614.5)
   * and the replacements of several permanents apply in timestamp order, the oldest first, the tokens it made being looked at by the next (CR 616.1: the
   * affected player's choice of order is not offered, `docs/ROADMAP.md`). The tokens it makes enter untapped and with none of the choices of the original.
   * It is the ability of a permanent on the battlefield, lost with "loses all abilities". `what` names no zone, owner, X, combat or stack kind.
   */
  | {
      readonly kind: 'tokensInstead';
      readonly what: ObjectFilter;
      readonly mode: 'thatMany' | 'plus';
      readonly token: Extract<TokenSpec, { readonly kind: 'preset' | 'custom' }>;
    }
  /**
   * "As this artifact enters, you may have it become a copy of any creature on the battlefield until end of turn, except it has haste." (CR 707.9,
   * 614.1c, 614.12, 707.2, D-151): as the permanent enters, its controller may choose a permanent on the battlefield that `what` matches (`optional`:
   * none is allowed; a permanent with no choice to make asks nothing), and it enters as a copy of it: for as long as `duration` says it has the copiable values
   * of that permanent as they are as it enters (CR 707.2: not counters or damage), plus the keyword abilities `gains` ("except it has haste": CR
   * 707.9b, they are part of what is copied). It is a copy as it enters, so the enters abilities of what it copies trigger (CR 603.6a). A copy that lasts
   * `untilEndOfTurn` becomes what it was before at the cleanup step (CR 514.2). Only the ability of a permanent that is not a land; a token is not asked
   * (`docs/ROADMAP.md`).
   */
  | {
      readonly kind: 'entersAsCopy';
      readonly what: ObjectFilter;
      readonly optional?: true;
      readonly duration: Duration;
      readonly gains?: readonly Keyword[];
    }
  /**
   * "If you would gain life, you gain that much life plus 1 instead." (D-149, CR 119.10, 614.1a): a replacement effect of a permanent on the
   * battlefield, for every gain of life of its controller (the effect `gainLife` and lifelink alike): the player gains `amount` more than
   * the amount that would have been gained. Several of them each apply once and add up. A gain of 0 life is no event and is not replaced
   * (CR 119.10). It is the ability of the permanent (lost with "loses all abilities") and applies to its controller only.
   */
  | { readonly kind: 'lifeGainBonus'; readonly amount: number }
  /**
   * "Each other Angel you control enters with an additional +1/+1 counter on it for each Angel you already control", "Each other creature
   * you control of the chosen type enters with an additional +1/+1 counter on it" (D-149, CR 614.1c, 614.12, 122.6): a replacement effect of
   * a permanent on the battlefield for the permanents that enter the battlefield and that `what` matches (`controller: 'you'` is the
   * controller of the permanent with the ability and `other` leaves that permanent out; `chosenType` and `chosenColor` read its choice;
   * what is read is the entering permanent as it would be on the battlefield). It puts `count` counters of the kind on each as it
   * enters (they are there when anything triggers from its entering): a number, or a `countOf`, counted for the controller of the
   * permanent with the ability without the entering permanent ("for each Angel you already control"). They are in addition to counters it
   * enters with otherwise. Cards, tokens and copies that become tokens are covered. It is the ability of a permanent on the battlefield:
   * it does nothing for itself, and is lost with "loses all abilities". `what` names no zone, owner, X, combat or stack kind.
   */
  | {
      readonly kind: 'othersEnterWithCounters';
      readonly what: ObjectFilter;
      readonly counter: string;
      /** A number, a count of permanents, or (D-183, "for each mana from an artifact source spent to cast it") the mana spent to cast the entering permanent. */
      readonly count: number | CountAmount | ManaSpentAmount;
    }
  /**
   * "Lands you control enter untapped." (CR 614.1c, 614.12, 616.1, D-179): a replacement effect of a permanent on the battlefield for the permanents
   * that enter the battlefield and that `what` matches (`controller: 'you'` is the controller of the permanent with the ability, read against the
   * entering permanent as it would be on the battlefield): they enter untapped, whatever else would have them enter tapped (their own "enters
   * tapped", "enters tapped unless", "you may pay life, if you don't it enters tapped", or an effect that puts them onto the battlefield tapped).
   * When both could apply, CR 616.1 lets the controller of the permanent choose the order; the engine does not ask and takes the order the controller
   * would choose, untapped (`docs/ROADMAP.md`). A land that would ask whether to pay life as it enters is not asked. It is the ability of a
   * permanent on the battlefield (lost with "loses all abilities") and does nothing for itself; a token is not covered. `what` names no zone, owner,
   * X, combat or stack kind.
   */
  | { readonly kind: 'groupEntersUntapped'; readonly what: ObjectFilter }
  /**
   * "All damage that would be dealt to you and other permanents you control is dealt to this creature instead." (D-192, CR 614.9, 614.1a,
   * 614.5, 616.1, 120.3): a redirection effect of a creature on the battlefield. It replaces damage that would be dealt to the controller of
   * the creature (`you`) and to the other permanents that `permanents` matches (read for the controller of the creature: `controller: 'you'`
   * is required, so the player affected by the effect is the one who chose it) with the same damage dealt to this creature, by the same source
   * (CR 120.3: marked damage, wither, infect, deathtouch and lifelink are those of the creature that receives it; a player is not dealt
   * damage, so no life loss, commander damage or "dealt combat damage" follows). It does nothing when this creature is not on the battlefield
   * or is no longer a creature when the damage would be redirected (CR 614.9), and does not apply to damage dealt to this creature itself.
   * It gets one opportunity per damage event (CR 614.5), so two such creatures do not redirect forever, and it is one of the effects the
   * affected player orders (CR 616.1, `rules/damage-order.ts`). It is the ability of the permanent: lost with "loses all abilities".
   * Redirecting to a creature controlled by another player is not covered. Only on a face that is a creature.
   */
  | {
      readonly kind: 'redirectDamage';
      /** The controller of the creature is among the recipients ("you"). */
      readonly you: boolean;
      /** The other permanents among the recipients ("other permanents you control"): no zone, `controller: 'you'`. */
      readonly permanents?: ObjectFilter;
    };

// ---- Static abilities (CR 604)

/**
 * Which permanents a static ability affects (CR 611.3, 613). `attached` is "Equipped creature" or
 * "Enchanted creature": the permanent the source is attached to (CR 301.5a, 303.4b). `filter` is
 * "Creatures you control" or "Other creatures you control": the battlefield permanents the filter
 * matches, relative to the source's controller; `other` excludes the source itself (as does
 * `filter.other`). The set is not fixed when the ability starts to apply: it is whatever the text
 * describes at any moment (CR 611.3a), so a creature that enters later is included.
 */
export type StaticSubject =
  /** The permanent (or, for `cantBeCountered`, the spell) the ability belongs to: "~ can't block". */
  | { readonly kind: 'this' }
  | {
      readonly kind: 'attached';
      /**
       * The host must have every one of these types ("Enchanted creature" is `['creature']`, which
       * an `Enchant permanent` Aura needs: on a land host it grants nothing). Left out, any host.
       * Read from the host's characteristics before layers 6 and 7, like a `filter` subject.
       */
      readonly types?: readonly CardType[];
      /** The host must have every one of these supertypes ("Enchanted legendary creature"). */
      readonly supertypes?: readonly Supertype[];
    }
  | { readonly kind: 'filter'; readonly filter: ObjectFilter; readonly other?: boolean };

/** What a static ability does while its permanent is on the battlefield (CR 604, 611.3). */
export type StaticEffect =
  | {
      /** CR 402.2: "You have no maximum hand size." */
      readonly kind: 'noMaximumHandSize';
    }
  /**
   * "You may play an additional land on each of your turns." and "You may play two additional lands on each of
   * your turns." (CR 305.2, D-125): the number of lands its controller can play in a turn is raised by `count`
   * (a positive whole number) for as long as the permanent is on the battlefield with the ability (CR 305.2a:
   * the number a player can play is compared with the number already played). Several of them add up (CR 305.2,
   * "continuous effects may increase this number"). With `eachPlayer` the ability is "Each player may play an
   * additional land on each of their turns.": every player gets it, whoever controls the permanent. Lands are
   * played in one's own turn only (CR 305.3), so the extra drops of an opponent's permanent do nothing for you
   * unless `eachPlayer`.
   */
  | {
      readonly kind: 'additionalLandDrops';
      readonly count: number;
      readonly eachPlayer?: true;
    }
  /**
   * "You don't lose unspent red mana as steps and phases end." (CR 500.5, 106.4, D-151): while the permanent has the ability, mana of these colors
   * (`C` is colorless) in its controller's mana pool does not empty as a step or a phase ends. It empties as any mana does when the ability is gone
   * (the next step end finds it).
   */
  | { readonly kind: 'unspentManaStays'; readonly colors: readonly ManaColor[] }
  /**
   * "You may look at the top card of your library any time." (CR 401.5, D-125): while the permanent is on the
   * battlefield with the ability, its controller may look at the top card of their own library. Nothing is
   * revealed: the other players never learn it. It shows in the controller's view (`SeatView.libraryTop`),
   * not in the state or the events, and a new top card that appears while a spell is being cast or an ability
   * activated stays hidden until that is done (CR 401.5). "Play with the top card of your library revealed"
   * is a different ability and is not this one.
   */
  | { readonly kind: 'lookAtTopOfLibrary' }
  /**
   * "Creatures can't attack you unless their controller pays {2} for each creature they control that's
   * attacking you." (CR 508.1d, 508.1h, D-125): while the permanent is on the battlefield, each creature
   * declared as an attacker of its controller costs `cost` (mana only, no {X}) to its own controller, paid as
   * the attack is declared; the total is locked in once the attackers are chosen (CR 508.1h). Several of them
   * add up. With `planeswalkers` the ability is "Creatures can't attack you or planeswalkers you control
   * unless their controller pays {M} for each of those creatures.": attacks on the planeswalkers its
   * controller controls cost the same; a battle is never taxed. A creature that attacks someone else costs
   * nothing, and a player is never required to pay (CR 508.1d).
   */
  | {
      readonly kind: 'attackTax';
      readonly cost: readonly Cost[];
      readonly planeswalkers?: true;
    }
  /**
   * "Creatures can't block unless their controller pays {1} for each of those creatures." (CR 509.1b, 509.1d, 118.12a, D-149): while the permanent has the
   * ability, each creature declared as a blocker costs `cost` (mana only, no {X}) to its own controller, paid as the blockers are declared; the
   * total is locked in once the blockers are chosen (CR 509.1d), and a declaration the defending player could not pay for is refused (a
   * player is never required to pay, CR 509.1c). Several of them add up. With `whileAttacking` ("As long as this creature is attacking") it
   * applies only while the permanent with the ability is a creature declared as an attacker and still in combat. The cost is paid with the mana the
   * player has after the blockers are chosen (a blocker that can tap for mana may, blocking does not tap it), by `payMana` with purpose `blockTax`.
   */
  | {
      readonly kind: 'blockTax';
      readonly cost: readonly Cost[];
      readonly whileAttacking?: true;
    }
  /**
   * "You may choose not to untap ~ during your untap step." (CR 502.3, D-125): as its controller's untap step
   * begins, a tapped permanent with the ability is not untapped with the others: its controller is asked
   * which of those permanents untap (a \`choosePermanent\` decision with purpose 'untap') and the rest stay tapped. It
   * is the ability of the permanent itself; one that also keeps itself from untapping (\`doesntUntap\`) is not asked.
   */
  | { readonly kind: 'optionalUntap' }
  /**
   * "Untap all creatures you control during each other player's untap step." (CR 502.3, 611.3, D-229): as the untap step of a player other than the
   * controller of the permanent begins, the permanents the filter names that the controller controls untap together with that player's own (the
   * controller of the ability is "you" in the filter). A stun counter is removed instead (CR 122.1d), and "doesn't untap" does not stop it: that is said
   * of the controller's own untap step. Read from the permanent's abilities, so a permanent that lost them does nothing.
   */
  | { readonly kind: 'untapInOthersUntapStep'; readonly what: ObjectFilter }
  /**
   * "You may cast this card from your graveyard [as long as you control a Zombie]." (D-133, CR 113.6b, 601.2a): the ability of
   * a card, working while that card is in its owner's graveyard: its owner may cast it from there, at the timing its type
   * allows, paying its ordinary mana cost (additional costs and cost changes as usual; no commander tax, CR 903.8). With
   * the ability's `condition` ("as long as ...") it may be cast only while that holds, read as the spell is cast with the
   * owner as "you" and the card as "this" (`controlsAtLeast`, `lifeTotal`, a commander, a designation); the cast is a
   * cast like any other, and the spell goes to the graveyard again if it does not resolve onto the battlefield. A card
   * has it once, it is not a land (a land is played, not cast), and a copy that has the ability has it too.
   */
  | { readonly kind: 'castFromGraveyard' }
  /**
   * "+N/+N" to the subject, in layer 7c (CR 613.4c). Negative numbers are allowed. The amounts may
   * count ("Equipped creature gets +1/+1 for each artifact you control", D-115): worked out each time
   * the subject's characteristics are, so the effect follows the board (CR 611.3a). A count is by the
   * ability's controller and source (`controller: 'you'`, `other`), over the types, colors, subtypes,
   * controller and zone of the objects it counts as layer 4 leaves them: it never reads a power or a
   * toughness (CR 613.8), so a filter with `power` or `toughness` is refused.
   */
  | {
      readonly kind: 'modifyPt';
      readonly subject: StaticSubject;
      readonly power: StaticPtAmount;
      readonly toughness: StaticPtAmount;
    }
  /**
   * A characteristic-defining ability that defines power, toughness or both (CR 604.3, 208.2a, 613.4a):
   * "~'s power and toughness are each equal to the number of cards in your hand.", "~'s power is equal to the
   * number of creatures you control." It is the ability of the card it is printed on, so its face prints
   * `'*'` for exactly the characteristics it defines (`validateCard`) and it applies to the object
   * itself, in layer 7a, before effects that set (7b) and modify (7c) power and toughness. It functions in
   * every zone (CR 604.3): a creature card in a graveyard, a hand or on the stack has the number it
   * defines, from the zones that object sees. A copy of the object has it (CR 707.2); an object that
   * loses all abilities does not (CR 613.1f), and a printed `'*'` with no such ability is 0.
   */
  | {
      readonly kind: 'characteristicPt';
      readonly power?: DefinedPtAmount;
      readonly toughness?: DefinedPtAmount;
    }
  /**
   * "has flying" and the like, in layer 6 (CR 613.1f). Only keywords without parameters can be
   * granted: flying, trample, haste, vigilance, lifelink, deathtouch, first strike, double strike,
   * menace, reach, hexproof, indestructible and defender.
   */
  | {
      readonly kind: 'grantKeyword';
      readonly subject: StaticSubject;
      readonly keyword: Keyword;
    }
  /**
   * "~ can't block", "Equipped creature can't be blocked", "~ attacks each combat if able", "~
   * doesn't untap during your untap step", "This spell can't be countered" (D-094): the subject has
   * the restriction while this ability applies. It is read where the rule acts (blocks, the untap
   * step, declaring attackers, counter effects), not in a layer. `cantBeCountered` is a spell's own
   * ability (CR 113.6g: it functions on the stack), so its subject is `this`.
   */
  | {
      readonly kind: 'restriction';
      readonly subject: StaticSubject;
      readonly restriction: Restriction;
    }
  /**
   * "Rhonas can't attack or block unless you control another creature with power 4 or greater" (D-145, CR 508.1a, 509.1a, 113.6): the
   * permanent has the restrictions `restrictions` (`cantAttack`, `cantBlock`) except while `unless` holds. `unless` is a full condition, read
   * for the controller of the permanent with the permanent as "this" (a count of permanents may compare power, toughness or keywords),
   * as the attack or the block is declared and in the legal-action lists, never in a layer. It is the ability of the permanent itself
   * (`this`) and is gone when the permanent loses its abilities.
   */
  | {
      readonly kind: 'restrictionUnless';
      readonly subject: { readonly kind: 'this' };
      readonly restrictions: readonly ('cantAttack' | 'cantBlock')[];
      readonly unless: Condition;
    }
  /**
   * "~ costs {1} less to cast for each creature on the battlefield", "Artifact spells you cast cost
   * {1} less to cast" (D-095): `amount` generic mana less for the spells `spells` names, applied to
   * the total cost of a spell being cast at CR 601.2f, after additional costs and increases (commander
   * tax, kicker). It affects only the generic mana of the cost and never reduces it below zero (CR
   * 118.7a, 601.2f). `spells: { kind: 'this' }` is the spell's own ability: it functions on the stack
   * (CR 113.6d), so it counts while the spell is being cast and nowhere else; an `ObjectFilter` is a
   * static ability of a permanent on the battlefield (CR 604.2) that reduces the spells that match
   * (the filter describes the spell on the stack: `zone` and `stackKind` are not set; `controller:
   * 'you'` is "spells you cast", relative to the permanent's controller). `amount` is a number or a
   * `countOf`; counted for a permanent's ability with that permanent as the source.
   */
  | {
      readonly kind: 'costReduction';
      readonly spells: { readonly kind: 'this' } | ObjectFilter;
      readonly amount: Amount;
    }
  /**
   * "Lands you control have "{T}: Add one mana of any color."" (D-099): the subject has the mana
   * ability, in layer 6 (CR 613.1f), in timestamp order with the other ability-changing effects, so
   * "loses all abilities" on the subject removes it and one that comes later does not. A mana ability can be
   * granted, and (D-151) an activated or a triggered ability: "has '{R}: Dragons you control get +1/+0 until end of turn'", "has 'Whenever
   * this creature attacks, it deals 7 damage to target creature defending player controls'". It is added after the subject's other
   * abilities, a granted ability for each source that grants one. With `activateOnlyIf` or a cost it is the ability the
   * subject has, activated by its own controller; a triggered one triggers as the subject's own, with the subject as its source.
   */
  | {
      readonly kind: 'grantAbility';
      readonly subject: StaticSubject;
      readonly ability:
        | ManaAbility
        | Extract<Ability, { readonly kind: 'activated' | 'triggered' }>;
    }
  /**
   * "~ is the chosen type in addition to its other types." (D-100): the subject also has the creature
   * type its permanent chose as it entered, in layer 4 (CR 613.1d) with the permanent's timestamp.
   * Only the permanent itself (`this`) and only the chosen type are supported for now, always
   * additive. It is a layer 4 effect, so "loses all abilities" (layer 6) does not take it away once it
   * applies (CR 613.6). Needs `asEntersChoose` of `creatureType` on the same face.
   */
  | {
      readonly kind: 'setTypes';
      readonly subject: StaticSubject;
      readonly chosenType: true;
      readonly additive: true;
    }
  /**
   * "Other creatures you control are Juggernauts in addition to their other creature types" (D-139, CR 613.1d, 205.1b): the subject has
   * `subtypes` and `types` (at least one list, never both empty) in addition to everything it has, in layer 4, with the permanent's
   * timestamp. What the subject matches is read from the object's types after layer 1 and the continuous effects of resolved spells (CR
   * 613.8: no effect of this kind depends on another one, so each reads the same view); it has no condition ("as long as").
   */
  | {
      readonly kind: 'setTypes';
      readonly subject: StaticSubject;
      /**
       * `true`: "in addition to its other types". Left out (D-145, CR 205.1a, 205.3d): "Enchanted creature ... is a green Elk creature": the
       * card types listed replace the object's card types (an instant or sorcery stays one), and the subtypes listed replace its
       * creature types (the other kinds of subtype stay), as the continuous effect `setTypes` does.
       */
      readonly additive?: true;
      readonly chosenType?: undefined;
      readonly subtypes?: readonly Subtype[];
      readonly types?: readonly CardType[];
    }
  /**
   * "Enchanted creature is a green Elk creature" (D-145, CR 613.1e, 105.3): the subject's colors are replaced by `colors` (an empty list
   * makes it colorless), in layer 5, with the permanent's timestamp; the last effect of the layer wins (CR 613.7).
   */
  | {
      readonly kind: 'setColors';
      readonly subject: StaticSubject;
      readonly colors: readonly Color[];
    }
  /**
   * "Enchanted creature loses all abilities" (D-145, CR 613.1f, 604.1): the permanent the Aura or Equipment is attached to loses every
   * ability it has when this effect applies in layer 6 (timestamp order with the keywords and abilities granted: one granted later still
   * applies, CR 613.7), its own static abilities included, and has none of its printed abilities left to apply for the rules. The subject is
   * `attached` with no host type or supertype (an Aura that can be attached only to a creature, CR 303.4m, is checked by its own enchant
   * ability). Not for a filter: what loses abilities would depend on the abilities themselves (CR 613.8).
   */
  | { readonly kind: 'loseAllAbilities'; readonly subject: { readonly kind: 'attached' } }
  /**
   * "As long as there are fewer than eight cards in your graveyard, ~ isn't a creature" (D-229, CR 613.1d, 205.1a): in layer 4 the subject loses these card types
   * (with the permanent's timestamp). The subtypes correlated with a type that is removed go with it unless the object still has another type they belong to
   * (CR 205.1a: a creature that stops being a creature is no longer a God). Only the permanent itself (`this`).
   */
  | {
      readonly kind: 'loseTypes';
      readonly subject: StaticSubject;
      readonly types: readonly CardType[];
    }
  /**
   * "Other creatures you control have base power and toughness 5/3" (D-139, CR 613.4b): the subject's power and toughness are set to
   * these numbers in layer 7b, in timestamp order with the other effects that set them (the permanent's own timestamp); counters
   * and +N/+N effects still apply on top (layer 7c). No condition. A subject with no power and toughness (a noncreature) is set too
   * (CR 208.3a) but still has none unless it is a creature, as `setPt` of an effect.
   */
  | {
      readonly kind: 'setPt';
      readonly subject: StaticSubject;
      readonly power: number;
      readonly toughness: number;
    }
  /**
   * "Juggernauts you control can't be blocked by Walls" (D-139, CR 509.1b): each object the subject names can't be blocked by a creature
   * that `blockers` matches (types, subtypes, colors, ... of the blocking creature as it is now; `controller` is relative to the controller of
   * the permanent with this ability, which usually says nothing). It is a restriction of blocking (CR 613.11: read where the rule acts, not
   * in a layer) and is gone with the ability.
   */
  | {
      readonly kind: 'cantBeBlockedBy';
      readonly subject: StaticSubject;
      readonly blockers: ObjectFilter;
    }
  /**
   * "As long as a card exiled with this creature is a creature card, this creature has the power, toughness, and creature types of the last
   * creature card exiled with it. It's still a Shapeshifter." (D-139, CR 607.2a, 613.1d, 613.4b): `from` names the card among those the
   * permanent exiled with its linked ability (`exile.linked`) that counts: the last one in the order they were exiled that matches it. When there is
   * such a card the permanent, which must be the subject (`this`), has that card's printed power and toughness (layer 7b) and its creature
   * types in place of its own, besides `alsoSubtypes` (layer 4); with none the ability does nothing. The words "as long as" are
   * this: there is no separate condition. Only `this`.
   */
  | {
      readonly kind: 'takeFromLinkedExile';
      readonly subject: { readonly kind: 'this' };
      readonly from: ObjectFilter;
      readonly alsoSubtypes?: readonly Subtype[];
    }
  /**
   * "You have hexproof." (CR 702.11b, 113.6, D-149): the controller of the permanent with the ability can't be the target of spells or
   * abilities their opponents control, while the permanent has the ability (the same as hexproof of a permanent, for the player). A player's
   * own spells and abilities can still target them. Read where targets are chosen and again as the spell or ability resolves (CR 608.2b).
   */
  | { readonly kind: 'playerHexproof' }
  /**
   * "You can't lose the game" (CR 104.3, 104.3b, D-149): while the permanent has the ability, its controller does not lose the game for having
   * 0 or less life, for drawing from an empty library, for ten poison counters or for 21 combat damage from one commander
   * (state-based actions, CR 704.5a-c, 704.6c); the numbers stay what they are, and the player loses when the ability is gone and a
   * state-based action then finds the condition still true. It does not stop a player from conceding (CR 104.3a).
   */
  | { readonly kind: 'cantLoseGame' }
  /**
   * "Your opponents can't win the game" (CR 104.2, D-149): while the permanent has the ability, no effect makes the opponents of its controller
   * win the game. The engine has no effect that says a player wins; a player who is the last one in the game wins by CR 104.2a, which
   * "overrides all effects that would preclude that player from winning the game", so this ability changes nothing the engine does today.
   */
  | { readonly kind: 'opponentsCantWin' }
  /**
   * "If a triggered ability of a Shaman or another Wizard you control triggers, that ability triggers an additional time." and "If a triggered ability of
   * equipped creature triggers, that ability triggers an additional time." (D-220, CR 603.2d): each time a triggered ability of a permanent `subject` names
   * triggers, it triggers one more time, an exact copy of the trigger (the same event, so the same targets are chosen for each and each is put on the stack
   * and resolves on its own). Each permanent with the ability adds one, so two of them make three. It applies to the triggered abilities of permanents on the
   * battlefield (not to delayed triggered abilities or to those of an emblem or the monarch), as they trigger, whatever the effect of the ability. `subject`
   * is a group of permanents (`controller: 'you'` the controller of the permanent with this ability, `other` leaves it out) or `attached`.
   */
  | { readonly kind: 'doubleTriggers'; readonly subject: StaticSubject }
  /**
   * "You can't cast ~ during your first, second, or third turns of the game." (CR 101.2, 601.2, 113.6, D-149): the ability of a card that works
   * where the card could be cast from (the hand, the command zone, a graveyard or exile): the card can't be cast, by any means (an alternative cost
   * or a free cast too, CR 101.2), while the ability's `condition` holds as it would be cast, read for the player who would cast it with the card as
   * "this" (`ownTurnNumber` is "your first, second, or third turn"). The condition is required: without it the card could never be cast.
   */
  | { readonly kind: 'cantCastThis' }
  /**
   * "Prevent all combat damage that would be dealt to this creature" (CR 615.1, 113.6, D-149): a static ability of a permanent: while it has the
   * ability all the damage of the `scope` (`combat`: combat damage, `noncombat`, `all`) that would be dealt to it is prevented, as an
   * effect that prevents all damage does (CR 615.6: it is never dealt, so no marked damage, no life loss from it, no lifelink,
   * no deathtouch). It reads the abilities the permanent has as the damage would be dealt, so it is lost with "loses all abilities". It
   * is about the permanent itself (`this`).
   */
  | {
      readonly kind: 'preventDamageToThis';
      readonly subject: { readonly kind: 'this' };
      readonly scope: PreventScope;
    }
  /**
   * "Damage isn't removed from this creature during cleanup steps." (CR 514.2, 113.6, D-192): a static ability of a permanent: at the cleanup
   * step the damage marked on it, and the memory that a source with deathtouch dealt it damage, stay; the "until end of turn" effects still end.
   * It is read from the abilities the permanent has then (lost with "loses all abilities"). A permanent with it that has lethal damage dies
   * as any other does (CR 704.5g); regeneration and leaving the battlefield still clear the damage.
   */
  | { readonly kind: 'keepsDamage'; readonly subject: { readonly kind: 'this' } }
  /**
   * "You may cast creature spells with power 4 or greater from the top of your library. If you cast a creature spell this way, it gains haste until
   * end of turn." (CR 601.3, 601.2a, 702.10, D-151): while the permanent has the ability, its controller may cast the top card of their library if it
   * is a spell `spells` matches (as the card it is: its types, power, mana value; `controller` is not read), at the timing of its type and paying its
   * ordinary cost. A creature spell cast this way, with `gainsHaste`, becomes a permanent with haste until end of turn. The player looks at the top
   * card only through another ability (`lookAtTopOfLibrary`): casting does not reveal it before it is cast, and every player may see the spell on the
   * stack. Several such abilities each give the permission.
   */
  | {
      readonly kind: 'castFromTopOfLibrary';
      readonly spells: ObjectFilter;
      readonly gainsHaste?: true;
    }
  /**
   * "Once during each of your turns, you may play a land from your graveyard or cast a permanent spell with mana value 3 or less from your graveyard. If you do, it gains
   * "When this permanent is put into a graveyard from the battlefield, exile it and you gain 2 life."" and "Once during each of your turns, you may cast an artifact spell
   * from your graveyard. If you cast a spell this way, that artifact enters tapped." (CR 601.2a, 305.1, 113.6, D-232): while the permanent has the ability, its controller
   * may, in their own turn and once in each turn for each such ability, play a land card from their graveyard (`land`) or cast a spell from it that `cast` matches (as the
   * card it is: types, mana value; `zone`, `owner` and `controller` are not read), at the timing of its type and paying its ordinary cost. Whichever they do uses the one
   * permission. The permanent the card becomes, as a land or as a spell, `entersTapped` if that is said and gains `gains` (a triggered ability) for as long as it lasts.
   */
  | {
      readonly kind: 'playFromGraveyardOnceEachTurn';
      readonly cast?: ObjectFilter;
      readonly land?: true;
      readonly entersTapped?: true;
      readonly gains?: Ability;
    }
  /**
   * "You may cast artifact spells as though they had flash" (D-139, CR 601.3b, 702.8a): its controller may cast the spells `spells` names at
   * the timing of an instant. `spells` describes the spell as it is cast (its card types, colors, mana value, ...; `controller` relative
   * to the controller of the permanent: "you" is usual, and a spell of another player never gets it, as the permission is the
   * controller's). The permission is only about when the spell may be cast: it gives the spell no flash keyword.
   */
  | { readonly kind: 'castAsThoughFlash'; readonly spells: ObjectFilter }
  /**
   * "Your opponents can't cast spells during your turn." (CR 101.2, 601.2, 604.1, D-179): while the permanent has the ability (and its `condition`
   * holds, read for the permanent with `staticConditionHolds`), no opponent of its controller can cast a spell during a turn of that controller, by any
   * means (from the hand, with an alternative cost, for free as an effect resolves: "can't" beats "can", CR 101.2). Activated abilities, lands and
   * special actions are not spells and are not stopped. Read where the engine decides whether a card can be cast (`rules/cast-restrictions.ts`).
   */
  | { readonly kind: 'opponentsCantCastOnYourTurn' }
  /**
   * "Creature spells you control can't be countered." (CR 101.2, 701.6a, 604.1, D-185): while the permanent has the ability, a spell on the stack
   * that `spells` matches, as it is on the stack (its types, colors, mana value; `controller` is relative to the controller of the permanent: "you"),
   * is not countered by a spell or ability that tries to (it stays on the stack and resolves). It is a static ability of a permanent on the
   * battlefield, so a permanent that lost its abilities gives none. The spell's own "can't be countered" is the `restriction` of its own face.
   */
  | { readonly kind: 'spellsCantBeCountered'; readonly spells: ObjectFilter };

// ---- Abilities (CR 113)

export type Ability =
  | { readonly kind: 'keyword'; readonly keyword: Keyword }
  /**
   * The abilities printed with a class level bar (CR 716.2, 716.2a, D-235): "[Cost]: Level 2" and what follows it in the same section of the text box. The permanent has `abilities`
   * as long as its level is `level` or greater (a permanent with no level is at level 1, CR 716.2d); the level bar itself is the activated ability with `gainLevel` (a card lists it
   * before this node). The abilities are not themselves `level` abilities. Levels are not copiable (CR 716.2b): a copy of the Class has the abilities its own level gives it.
   */
  | { readonly kind: 'level'; readonly level: number; readonly abilities: readonly Ability[] }
  /**
   * A static ability of a permanent (CR 604.1), in force while it is on the battlefield. With `condition` it applies
   * only "as long as" the condition holds (D-133, CR 611.3a: read each time the effect is looked at, nothing is
   * locked in). Only the statics that act in a layer or are read at one place with the condition (`modifyPt`, `grantKeyword`,
   * `grantAbility`, `restriction` but not `cantBeCountered`, `attackTax`, `castFromGraveyard`) take one, and the condition may read only what no layer 7 effect changes
   * (CR 613.8): a count of permanents by type, subtype, color, controller or tapped status, the controller's life
   * total, a commander, a designation, whether this very permanent is tapped or has a type, and combinations
   * (`validateCard` refuses power, toughness, keywords, combat, X, kicks and counters). `you` is the controller of the
   * permanent and "this" the permanent.
   */
  | {
      readonly kind: 'static';
      readonly static: StaticEffect;
      readonly condition?: Condition;
      /**
       * "As long as this card is in your graveyard and you control a Mountain, creatures you control have haste." (CR 113.6b, 604.2, D-151): the
       * ability works while its card is in its owner's graveyard, and not on the battlefield. Only a `grantKeyword` or a `modifyPt` of
       * a `filter` subject (the card has no characteristics there to change), whose "you" is the owner of the card.
       */
      readonly functionsIn?: 'graveyard';
    }
  | { readonly kind: 'replacement'; readonly replacement: Replacement }
  | {
      readonly kind: 'triggered';
      readonly trigger: Trigger;
      readonly targets?: readonly TargetSpec[];
      /**
       * What it does. A modal ability (`modes`) has its effects in the modes: `effect` is then the
       * empty sequence `{ kind: 'sequence', effects: [] }` and `targets` is absent (D-114).
       */
      readonly effect: Effect;
      /**
       * "When ~ enters, choose one —" (CR 700.2b, 603.3c, D-114): the modes, in printed order; the
       * controller chooses `chooseModes` of them as the ability goes on the stack. Needs `chooseModes`.
       */
      readonly modes?: readonly SpellMode[];
      readonly chooseModes?: ModeChoice;
      /** "you may": the controller chooses on resolution (CR 603.5). */
      readonly optional?: boolean;
      /**
       * The intervening "if" clause (CR 603.4): "When/Whenever/At [trigger event], if [condition],
       * [effect]". The ability triggers only if the condition is true when the trigger event
       * occurs, and it is checked again as the ability resolves; if it is false then, the ability
       * is removed from the stack and does nothing. `you` is the ability's controller, and "this"
       * the source, which `kicked` reads from its last-known information once it has left.
       */
      readonly interveningIf?: Condition;
      /**
       * "Whenever this creature attacks while you don't control another Dinosaur" (D-145, CR 603.2): a condition that is part of the
       * trigger event itself, read once, as the event happens, with the controller of the ability as "you" and the source as "this". It
       * is not an intervening "if" (CR 603.4): it is not checked again as the ability resolves. Not on a `state` trigger (its
       * condition is the event).
       */
      readonly triggerCondition?: Condition;
      /**
       * "This ability triggers only once each turn." (CR 603.2, D-149): once this ability of this object has triggered in a turn it does not
       * trigger again until the next turn begins (the second event of the turn is not noticed at all). It is the object's own count: a
       * permanent that left and came back is a new object (CR 400.7).
       */
      readonly oncePerTurn?: true;
      /**
       * "Whenever you gain life, you may put that many +1/+1 counters on each creature you control. Do this only once each turn." (CR 603.2h, D-256):
       * the ability triggers only if its controller has not yet taken the action it represents this turn. The action is taken as the ability resolves
       * and its effect is begun: for an ability with "you may" only when the controller accepts, so a declined ability can trigger again the same
       * turn, and an ability that triggers twice before the first resolves resolves twice. Not with `oncePerTurn`, which counts the triggering.
       */
      readonly doOnlyOnceEachTurn?: true;
      /**
       * "Whenever a Dragon you control enters, you may pay {R}. If you do, return this card from your graveyard to your hand." (CR 113.6b, 603.2, D-151):
       * the ability triggers while its card is in its owner's graveyard, and not on the battlefield. The card is "this" (`this` names it while it
       * is still in the graveyard as the same object, CR 400.7); the controller of the ability is the owner of the card.
       */
      readonly functionsIn?: 'graveyard';
    }
  | {
      readonly kind: 'activated';
      readonly cost: readonly Cost[];
      readonly targets?: readonly TargetSpec[];
      /** As for a triggered ability: a modal ability has an empty sequence here and its effects in `modes`. */
      readonly effect: Effect;
      /** "{2}: Choose one —" (CR 700.2a, 602.2b, D-114): chosen as the ability is activated. Needs `chooseModes`. */
      readonly modes?: readonly SpellMode[];
      readonly chooseModes?: ModeChoice;
      /** Loyalty abilities and "activate only as a sorcery" (CR 606, 602.5d). Default instant. */
      readonly timing?: 'instant' | 'sorcery';
      /**
       * The zone the ability functions from (CR 113.6b). Default the battlefield; Cycling uses the hand and
       * Unearth (CR 702.84a, D-124) the graveyard.
       */
      readonly functionsIn?: 'battlefield' | 'hand' | 'graveyard';
      /**
       * "This ability costs {4} less to activate if an opponent controls four or more nonbasic lands" (D-135, CR 601.2f, 602.2b):
       * when the condition holds as the ability is activated, `generic` is taken off the generic part of its mana cost (never
       * below zero, and only the generic part: CR 601.2f). The condition reads the game as it is then, for the controller of
       * the source. Only `mana` costs (a cost without generic mana is not reduced).
       */
      readonly costReducedIf?: { readonly generic: number; readonly condition: Condition };
      /**
       * "This ability costs {1} less to activate for each other artifact you control" (D-139, CR 601.2f, 602.2b): `amount` generic
       * mana is taken off the generic part of its mana cost as it is activated (never below zero, only the generic part), `amount` an
       * `Amount` that reads the game now (the same set as an `amountIs` condition: a count, a greatest or total, devotion, ...,
       * and `multiple` of one for "{2} less for each"), counted for the controller with the source as "this". It applies after
       * `costReducedIf`. Only `mana` costs.
       */
      readonly costReducedBy?: { readonly amount: Amount };
      /**
       * "Activate only once each turn." (CR 602.5b, D-139): once this ability of this object has been activated in a turn, it cannot be
       * activated again until the next turn begins. It is the object's own count: a permanent that left and came back is a new object
       * (CR 400.7) and may activate it again. Counted when the activation is complete (a cancelled one does not count).
       */
      readonly oncePerTurn?: true;
      /**
       * "Activate only if you control five or more lands." (CR 602.5b, D-099): a restriction on
       * activating the ability, read for its controller with the permanent as the source, when it is
       * activated. Not a cost: it is ignored when another ability asks what this permanent could
       * produce (CR 106.7).
       */
      readonly activateOnlyIf?: Condition;
    }
  /** A mana ability (CR 605.1a): no target, produces mana, not a loyalty ability. */
  | ManaAbility;

/** A mana ability (CR 605.1a), also the ability a static `grantAbility` gives (D-099). */
export interface ManaAbility {
  readonly kind: 'mana';
  /**
   * {T}, "Sacrifice this permanent", "Pay N life" (CR 119.4, 605.3) and mana, which may use hybrid
   * symbols (CR 107.4e): {R/W}, {T}: Add {R}{R}, {R}{W} or {W}{W}.
   */
  readonly cost: readonly Cost[];
  readonly production: ManaProduction;
  /**
   * Other effects of the same ability (CR 605.1a allows them): "~ deals 1 damage to you." They
   * run right after the mana is added, in the same resolution (CR 605.3b). Only effects with
   * no target and no decision are valid: damage to you, you lose life, you gain life.
   */
  readonly also?: readonly Effect[];
  /** "Activate only if you control a Swamp." (CR 602.5b, D-099): see the activated ability. */
  readonly activateOnlyIf?: Condition;
  /**
   * "Spend this mana only to cast an Angel spell." (CR 106.6, D-149): the mana the ability adds can be spent only on a spell (never on an
   * ability's cost) that is of one of `types` (when given) and of one of `subtypes` (when given); until then it stays in the pool as
   * restricted mana, which empties as any mana does (CR 106.4).
   */
  readonly spendOnly?: {
    readonly types?: readonly CardType[];
    readonly subtypes?: readonly Subtype[];
    /**
     * "Spend this mana only to cast Dragon spells or activate abilities of Dragons." (D-151): the mana may also be spent on an activated ability of
     * a permanent that has at least one of the card types and at least one of the subtypes (each when given), besides the spells it names.
     */
    readonly alsoAbilities?: true;
  };
  /**
   * "{T}: Add {R}. If that mana is spent on a Dragon creature spell, it gains haste until end of turn." (D-151, CR 106.6, 702.10): the mana the ability
   * adds carries a rider: when it is spent on a spell with at least one of the card types and at least one of the subtypes (each when given), that
   * spell, if it becomes a permanent, has haste until end of turn.
   *
   * "{T}: Add one mana of any color in your commander's color identity. When that mana is spent to cast a creature spell that shares a creature
   * type with your commander, scry 1." (group 4 of the Vraska deck, CR 106.6, 603.2, 701.22): `grants` is `{ scry: 1 }` and `sharesTypeWithCommander`
   * narrows the spells; when the mana is spent on a spell that matches, the controller of the permanent scries (a triggered ability of the permanent
   * that made the mana, put on the stack above the spell).
   */
  readonly spentRider?: {
    readonly spells: {
      readonly types?: readonly CardType[];
      readonly subtypes?: readonly Subtype[];
      readonly sharesTypeWithCommander?: true;
      /** "When you spend this mana to cast your commander" (D-229, CR 903.3): the spell is a card its caster owns that is designated a commander. */
      readonly commander?: true;
    };
    /**
     * `{ scryCommanderCasts: true }` (D-229): "scry X, where X is the number of times it's been cast from the command zone this game": X is the number of
     * times the commander cast with this mana has been cast from the command zone (this cast included; CR 903.8), read as the scry resolves.
     */
    readonly grants: 'haste' | { readonly scry: number } | { readonly scryCommanderCasts: true };
  };
  /**
   * "{T}: Add one mana of any color. If you control a creature with power 4 or greater, add two mana of any one color instead." (D-145,
   * CR 605.3b, 608.2c): while `condition` holds the ability makes `production` instead of its own. The condition is read for the
   * controller of the permanent with the permanent as "this", when the ability is activated and whenever the engine asks what it can make
   * (the payment planner, the legal actions): a mana ability resolves at once, so the game is the same as it resolves.
   * Any `Condition` the engine reads for a permanent (a count of permanents may compare power).
   */
  readonly instead?: { readonly condition: Condition; readonly production: ManaProduction };
}

/** What a spell does when it resolves (CR 608), for instants, sorceries and permanent spells. */
export interface SpellText {
  /**
   * "Choose one —" (CR 700.2, D-114): two to eight modes in printed order; with `chooseModes`. A modal
   * spell has no `effect` and no `targets` of its own: each mode has them, and the target ids are
   * unique across the modes.
   */
  readonly modes?: readonly SpellMode[];
  readonly chooseModes?: ModeChoice;
  readonly targets?: readonly TargetSpec[];
  readonly effect?: Effect;
  /**
   * The effect reads X (`Amount` `x`): true when the spell has an {X} in its mana cost or "pay X
   * life" as an additional cost (CR 107.3a). X is announced as the spell is cast (D-103).
   */
  readonly x?: boolean;
}

/**
 * How many modes a modal spell or ability has its controller choose (CR 700.2, D-114): "choose one" is
 * `{ min: 1, max: 1 }`, "choose two" `{ min: 2, max: 2 }`, "choose one or both" `{ min: 1, max: 2 }`,
 * "choose one or more" `{ min: 1, max: <number of modes> }`. The same mode is never chosen twice (CR
 * 700.2d).
 */
export interface ModeChoice {
  readonly min: number;
  readonly max: number;
  /**
   * "If you control a commander as you cast ~, you may choose both instead." (D-114): when `condition`
   * holds for the controller as the modes are chosen, `max` is replaced by this `max` (never below the
   * ordinary one, at most the number of modes). The condition is read with the spell or ability as the
   * source.
   */
  readonly maxIf?: { readonly condition: Condition; readonly max: number };
  /**
   * "Choose one that hasn't been chosen this turn" (D-151): a mode that this source (the permanent that has the ability) chose earlier this turn cannot
   * be chosen again; with every mode chosen the ability is removed from the stack as it would be with no legal mode (CR 603.3c). Only a triggered ability.
   */
  readonly notRepeatedThisTurn?: true;
}

export interface SpellMode {
  readonly text: string;
  readonly targets?: readonly TargetSpec[];
  readonly effect: Effect;
}
