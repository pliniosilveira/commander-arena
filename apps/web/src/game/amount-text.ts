/**
 * The words of counted amounts (D-131), composed from the `Amount` AST and never from a card name:
 * "the number of Zombies you control", "half the number of creatures you control, rounded down",
 * "the greatest power among creatures you control", "the total power of creatures you control", "your
 * devotion to black", "the number of colors in your commander's color identity", "the number of creatures
 * attacking you", "the number of age counters on it", "that creature's toughness".
 *
 * An effect that reads such an amount in several places says X in each and defines it once at the end, as
 * the Oracle text does (CR 107.3c: the definition is read wherever X is): "Draw X cards. Lose X life,
 * where X is the number of Zombies you control." `createDefinitions` collects the definitions.
 *
 * Honesty (AGENTS.md): a filter or an amount the words cannot say is named "a number"; nothing here ever
 * prints JSON or "undefined". Pure.
 */

import type { Amount, Color, ObjectRef, PlayerStat, ThisWayKind } from '@commander-arena/engine';
import { countPhrase, thingsPhrase } from './filter-text';
import { manaSpentWords } from './mana-spent-text';
import { COLOR_NAMES } from './words';

/** What an amount the words cannot say is called. */
export const UNKNOWN_AMOUNT = 'a number';

/** What the words need to know about the ability the amount is in. */
export interface AmountContext {
  /** The noun of the card the ability belongs to, for "this creature's power" (default "permanent"). */
  readonly self?: string;
  /** The object an effect already names as its subject, so "its power" says it ("it deals damage equal to its power"). */
  readonly same?: ObjectRef;
}

/**
 * "equipped creature" for an Equipment's ability, "enchanted permanent" for an Aura's (D-139, CR 301.5a, 303.4b): what
 * the permanent with the ability is attached to, from the noun of that permanent ("artifact", "enchantment"). An Aura
 * may enchant more than creatures, so it says "permanent".
 */
export function attachedText(self: string | undefined): string {
  if (self === 'artifact') return 'equipped creature';
  if (self === 'enchantment') return 'enchanted permanent';
  return "the permanent it's attached to";
}

/** "this creature's", "that creature's", "its": whose stat or counters an amount reads. */
function possessive(ref: ObjectRef, ctx: AmountContext): string {
  if (ctx.same !== undefined && JSON.stringify(ctx.same) === JSON.stringify(ref)) return 'its';
  switch (ref.kind) {
    case 'this':
      return `this ${ctx.self ?? 'permanent'}'s`;
    case 'thisSpell':
      return "this spell's";
    case 'target':
    case 'triggerSubject':
      return "that creature's";
    case 'moved':
    case 'thisCard':
    case 'triggerCard':
      return 'its';
    case 'sacrificedCost':
      // D-133: the permanent sacrificed to pay the cost ("the sacrificed creature's power").
      return "the sacrificed creature's";
    case 'sacrificed':
      // D-177: the permanent an earlier sacrifice of the same resolution sacrificed ("that creature's power").
      return "the sacrificed creature's";
    case 'attached':
      // D-139: the permanent an Aura or Equipment is attached to.
      return `${attachedText(ctx.self)}'s`;
    case 'linkedExile':
      // D-145: the card a permanent exiled with a linked ability (Hideaway).
      return "the exiled card's";
  }
}

/** "it", "that creature": the object itself, after "on" in "the number of age counters on it". */
function objectPronoun(ref: ObjectRef, ctx: AmountContext): string {
  switch (ref.kind) {
    case 'this':
      return ctx.same === undefined ? `this ${ctx.self ?? 'permanent'}` : 'it';
    case 'thisSpell':
      return 'this spell';
    case 'target':
    case 'triggerSubject':
      return 'that creature';
    case 'moved':
    case 'thisCard':
    case 'triggerCard':
      return 'it';
    case 'sacrificedCost':
    case 'sacrificed':
      return 'the sacrificed creature';
    case 'attached':
      return attachedText(ctx.self);
    case 'linkedExile':
      return 'the exiled card';
  }
}

/** "black", "white and blue": the colors a devotion names. */
function colorList(colors: readonly Color[]): string {
  const names = colors.map((c) => COLOR_NAMES[c] ?? c);
  return names.length <= 2
    ? names.join(' and ')
    : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

const STAT_WORDS: Readonly<Record<'power' | 'toughness' | 'manaValue', string>> = {
  power: 'power',
  toughness: 'toughness',
  manaValue: 'mana value',
};

/** "opponents with more life than you": what `opponentsWithMore` counts. */
function opponentsWithMore(stat: PlayerStat): string {
  switch (stat) {
    case 'life':
      return 'the number of opponents with more life than you';
    case 'cardsInHand':
      return 'the number of opponents with more cards in hand than you';
    case 'creatures':
      return 'the number of opponents who control more creatures than you';
    case 'lands':
      return 'the number of opponents who control more lands than you';
  }
}

/** What an earlier instruction of the same resolution did (`thisWay`). */
function thisWayPhrase(what: ThisWayKind): string {
  switch (what) {
    case 'sacrificed':
      return 'the number of permanents sacrificed this way';
    case 'destroyed':
      return 'the number of permanents destroyed this way';
    case 'exiledNonland':
      // D-231: "put that many +1/+1 counters" after "each player exiles a card from their graveyard".
      return 'the number of nonland cards exiled this way';
    case 'destroyedOwnNontoken':
      // D-230: "for each nontoken creature you controlled that was destroyed this way".
      return 'the number of nontoken creatures you controlled that were destroyed this way';
    case 'playersDrew':
      return 'the number of players who drew a card this way';
    case 'tapped':
      // D-139: "the number of Myr tapped this way".
      return 'the number of permanents tapped this way';
    case 'discarded':
      // D-151: "discard any number of cards, then draw that many cards".
      return 'the number of cards discarded this way';
    case 'milledValue':
      // D-210 (CR 202.3): "equal to the total mana value of those cards".
      return 'the total mana value of the cards milled this way';
    case 'discardedCreature':
      return 'the number of creature cards discarded this way';
    case 'discardedNoncreature':
      return 'the number of noncreature cards discarded this way';
    case 'discardedInstantOrSorcery':
      return 'the number of instant and sorcery cards discarded this way';
  }
}

/** "the discovered card's", "its": whose mana value the difference of a `shortfall` reads. */
function shortfallOf(ref: ObjectRef): string {
  return ref.kind === 'moved' ? "the card's" : possessive(ref, {});
}

/**
 * The amount as a noun phrase: "the number of Zombies you control", "its power", "twice the number of
 * creatures you control". A plain number is its digits and an announced X is "X".
 */
export function amountPhrase(amount: Amount, ctx: AmountContext = {}): string {
  if (typeof amount === 'number') return String(amount);
  switch (amount.kind) {
    case 'x':
      return 'X';
    case 'countOf':
      return countPhrase(amount.filter) ?? UNKNOWN_AMOUNT;
    case 'powerOf':
      return `${possessive(amount.of, ctx)} power`;
    case 'toughnessOf':
      return `${possessive(amount.of, ctx)} toughness`;
    case 'manaValueOf':
      return `${possessive(amount.of, ctx)} mana value`;
    case 'countersOn': {
      // "+1/+1" is "+1/+1 counters"; a kind named by words is "age counters".
      return `the number of ${amount.counter} counters on ${objectPronoun(amount.of, ctx)}`;
    }
    case 'timesKicked':
      return 'the number of times it was kicked';
    case 'manaSpent':
      // D-183 (CR 601.2h): the mana spent to cast the spell, in all or from sources of a card type.
      return `the amount of ${manaSpentWords(amount.fromType)}`;
    case 'lifeLostThisWay':
      return 'the total life lost this way';
    case 'lifeLostThisTurn':
      // D-365 (CR 119.3): read for each player the instruction affects.
      return 'the life that player lost this turn';
    case 'aggregate': {
      const things = thingsPhrase(amount.filter, true);
      if (things === null) return UNKNOWN_AMOUNT;
      const stat = STAT_WORDS[amount.stat];
      return amount.how === 'greatest'
        ? `the greatest ${stat} among ${things}`
        : `the total ${stat} of ${things}`;
    }
    case 'devotion':
      return `your devotion to ${colorList(amount.colors)}`;
    case 'commanderColors':
      return "the number of colors in your commander's color identity";
    case 'commanderManaValue':
      // D-145 (CR 903.3, 202.3): Equipment that grows with the commander.
      return 'the greatest mana value among your commanders';
    case 'commanderCasts':
      // D-229 (CR 903.8): Vanguard of the Restless, Study Hall.
      return amount.of === 'triggerSubject'
        ? "the number of times it's been cast from the command zone this game"
        : "the number of times you've cast your commander from the command zone this game";
    case 'half':
      return `half ${amountPhrase(amount.of, ctx)}, rounded ${amount.round}`;
    case 'multiple':
      return amount.factor === 2
        ? `twice ${amountPhrase(amount.of, ctx)}`
        : `${amount.factor} times ${amountPhrase(amount.of, ctx)}`;
    case 'minus':
      // D-321 (CR 107.1b): "the number of cards in your hand minus 4", never below 0.
      return `${amountPhrase(amount.of, ctx)} minus ${amount.by}`;
    case 'sum':
      return amount.of.map((part) => amountPhrase(part, ctx)).join(' plus ');
    case 'thisWay':
      return thisWayPhrase(amount.what);
    case 'opponentsWithMore':
      return opponentsWithMore(amount.stat);
    case 'triggerDamage':
      // D-133: "that much" for the damage that caused the trigger.
      return 'that much';
    case 'shortfall':
      // D-151 (CR 701.57): "the difference" between the limit and the mana value of the card found.
      return `the difference between ${amount.limit} and ${shortfallOf(amount.of)} mana value`;
    case 'votesFor':
      // D-194 (CR 701.38a): "twice the number of profit votes".
      return `the number of ${amount.option} votes`;
    case 'exiledStillThere':
    case 'cardsStillExiled':
      // D-151: "each of those cards that are still exiled" (CR 400.7: a card that left exile is not counted).
      return 'the number of those cards that are still exiled';
    default:
      return UNKNOWN_AMOUNT;
  }
}

/** The letters a definition may have: "where X is ..., Y is ... and Z is ...". */
const LETTERS = ['X', 'Y', 'Z'] as const;

/** What an effect collects while it is worded: the amounts that "where X is ..." defines. */
export interface Definitions {
  /**
   * How a slot says its amount: a number as its digits, an announced X as "X", anything else as a letter
   * that the definitions explain (the same phrase keeps its letter; a fourth distinct one is said in full).
   */
  readonly say: (amount: Amount, ctx?: AmountContext) => string;
  /** ", where X is the number of Zombies you control", or '' when nothing needed a definition. */
  readonly tail: () => string;
}

export function createDefinitions(): Definitions {
  const phrases: string[] = [];
  return {
    say(amount, ctx = {}) {
      if (typeof amount === 'number') return String(amount);
      if (amount.kind === 'x') return 'X';
      // D-151: "deals that much damage": the number the reflexive ability reads is said as it is, never as a letter.
      if (amount.kind === 'triggerDamage') return 'that much';
      const phrase = amountPhrase(amount, ctx);
      if (phrase === UNKNOWN_AMOUNT) return UNKNOWN_AMOUNT;
      const known = phrases.indexOf(phrase);
      const at = known >= 0 ? known : phrases.length;
      if (at >= LETTERS.length) return phrase;
      if (known < 0) phrases.push(phrase);
      return LETTERS[at] ?? phrase;
    },
    tail() {
      if (phrases.length === 0) return '';
      const parts = phrases.map((phrase, i) => `${LETTERS[i]} is ${phrase}`);
      const last = parts.pop();
      return `, where ${parts.length === 0 ? last : `${parts.join(', ')} and ${last}`}`;
    },
  };
}

/** What a count of things is called in a sentence: "a card" for one, "cards" for several. */
export interface Unit {
  /** The words for exactly one: "a card", "1 life", "a Zombie creature token". */
  readonly one: string;
  /** The noun after a number: "cards", "life", "Zombie creature tokens". */
  readonly many: string;
}

/**
 * "a card", "3 cards", "X cards" (X defined at the end), "2 life for each Zombie you control": a count in a
 * sentence. A multiple of a count is the "N <things> for each <thing>" of the Oracle text; every other
 * amount that reads the game is a letter that `defs` defines.
 */
export function quantity(
  amount: Amount,
  defs: Definitions,
  unit: Unit,
  ctx: AmountContext = {},
): string {
  if (amount === 1) return unit.one;
  if (typeof amount === 'object' && amount.kind === 'multiple') {
    const inner = amount.of;
    if (typeof inner === 'object' && inner.kind === 'countOf') {
      const each = countEachPhrase(inner.filter);
      if (each !== null) return `${amount.factor} ${unit.many} ${each}`;
    }
  }
  return `${defs.say(amount, ctx)} ${unit.many}`;
}

/** "for each Zombie you control" from a count's filter, or null when the words cannot say it. */
function countEachPhrase(filter: Parameters<typeof countPhrase>[0]): string | null {
  const things = thingsPhrase(filter, false);
  return things === null ? null : `for each ${things}`;
}

/**
 * An announced X written into the text of a spell or ability on the stack (CR 107.3a, issue 107): every X
 * of the effect becomes "X (3)", and "2X" becomes "2X (6)", so the player reads the number where the text
 * says X. The {X} of a cost stays as it is (it is a mana symbol, and the cost shown is the one paid). A text
 * that defines its own X ("..., where X is the number of Zombies you control") is left alone: that X is not
 * the announced one (CR 107.3c). Pure.
 */
export function withAnnouncedX(text: string, x: number): string {
  if (/\bwhere X is\b/i.test(text)) return text;
  return text.replace(
    /(?<![A-Za-z0-9{])(\d*)X(?![A-Za-z0-9}])/g,
    (_match, digits: string) => `${digits}X (${digits === '' ? x : Number(digits) * x})`,
  );
}
