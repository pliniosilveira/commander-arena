/**
 * The words of power and toughness that are not plain numbers (D-109, D-115): "gets +1/+1 for each
 * artifact you control", "gets -X/-X until end of turn", "has base power and toughness each equal to
 * the number of lands you control", "power and toughness are each equal to the number of cards in your
 * hand". Read from the AST (`PtAmount`, `StaticPtAmount`, `DefinedPtAmount`, `StaticEffect`). Pure.
 *
 * Honesty (AGENTS.md): an amount or a filter the words cannot say is named "a number"; nothing here
 * ever prints JSON or "undefined".
 */
import type {
  Amount,
  DefinedPtAmount,
  Effect,
  ObjectFilter,
  PtAmount,
  StaticPtAmount,
} from '@commander-arena/engine';
import { amountPhrase } from './amount-text';
import { countPhrase, thingsPhrase } from './filter-text';

export { countPhrase };

const UNKNOWN = 'a number';

/** The sentence for a count or a multiple of one: "the number of lands you control". */
function amountWords(amount: Amount | PtAmount): string {
  if (typeof amount === 'number') return String(amount);
  switch (amount.kind) {
    case 'x':
      return 'X';
    case 'countOf':
      return countPhrase(amount.filter) ?? UNKNOWN;
    case 'powerOf':
      return 'its power';
    case 'manaValueOf':
      return 'its mana value';
    case 'timesKicked':
      return 'the number of times it was kicked';
    case 'lifeLostThisWay':
      return 'the total life lost this way';
    case 'times':
      return `${amount.factor} times ${amountWords(amount.of)}`;
    case 'affected':
      // D-145: "+X/+0 where X is its power": the creature each effect is for.
      return `its ${amount.stat}`;
    default:
      // D-131: the amounts that read the game (greatest power, devotion, half ...) say themselves.
      return amountPhrase(amount);
  }
}

/** One of the two numbers of "+N/+N": its sign, its magnitude and what it is counted over. */
interface Part {
  readonly sign: '+' | '-';
  /** "2", "X", "0" ... */
  readonly mag: string;
  /** "for each artifact you control": what a count of one is multiplied by. */
  readonly each?: string;
  /** What the letter X stands for ("its power"), when the number is not a number or an announced X. */
  readonly where?: string;
}

const signOf = (n: number): '+' | '-' => (n < 0 ? '-' : '+');
const magnitude = (n: number): string => (Math.abs(n) === 1 ? '' : String(Math.abs(n)));

/** "for each artifact you control" from "the number of artifacts you control"; null when unknowable. */
function eachPhrase(filter: ObjectFilter): string | null {
  const things = thingsPhrase(filter, false);
  return things === null ? null : `for each ${things}`;
}

function partOf(amount: PtAmount | StaticPtAmount): Part {
  if (typeof amount === 'number') return { sign: signOf(amount), mag: String(Math.abs(amount)) };
  if (amount.kind === 'x') return { sign: '+', mag: 'X' };
  if (amount.kind === 'countOf') {
    const each = eachPhrase(amount.filter);
    return each === null ? { sign: '+', mag: 'X', where: UNKNOWN } : { sign: '+', mag: '1', each };
  }
  if (amount.kind === 'timesAttacked') {
    // D-187 (CR 508.1): "+1/+0 for each time it has attacked this turn".
    return { sign: '+', mag: '1', each: 'for each time it has attacked this turn' };
  }
  if (amount.kind === 'colorsAmong') {
    // D-179: "+1/+1 for each color among permanents you control".
    const among = thingsPhrase(amount.filter, true);
    return among === null
      ? { sign: '+', mag: 'X', where: UNKNOWN }
      : { sign: '+', mag: '1', each: `for each color among ${among}` };
  }
  if (amount.kind === 'times') {
    const { factor, of } = amount;
    if (typeof of === 'number') return partOf(factor * of);
    if (of.kind === 'x') return { sign: signOf(factor), mag: `${magnitude(factor)}X` };
    if (of.kind === 'countOf') {
      const each = eachPhrase(of.filter);
      return each === null
        ? { sign: signOf(factor), mag: 'X', where: UNKNOWN }
        : { sign: signOf(factor), mag: String(Math.abs(factor)), each };
    }
    return { sign: signOf(factor), mag: `${magnitude(factor)}X`, where: amountWords(of) };
  }
  return { sign: '+', mag: 'X', where: amountWords(amount) };
}

const isZero = (p: Part): boolean => p.mag === '0' && p.each === undefined;
const show = (p: Part): string => `${p.sign}${p.mag}`;

/**
 * What "gets <this>" says: "+1/+1 for each artifact you control", "-X/-X", "+X/+0", "+2/+0 and +0/+1
 * for each Elf you control". Never JSON.
 */
export function ptChangeText(
  power: PtAmount | StaticPtAmount,
  toughness: PtAmount | StaticPtAmount,
): string {
  const p = partOf(power);
  const t = partOf(toughness);
  // The same count of the same things, or a count for one number and nothing for the other.
  if (p.each !== undefined && (t.each === p.each || isZero(t))) {
    return `${show(p)}/${show(t)} ${p.each}`;
  }
  if (t.each !== undefined && isZero(p)) return `${show(p)}/${show(t)} ${t.each}`;
  if (p.each !== undefined || t.each !== undefined) {
    // Two different things counted, or a count next to a number: say each number on its own.
    const zero: Part = { sign: '+', mag: '0' };
    const lone = (part: Part, first: boolean): string =>
      `${first ? show(part) : show(zero)}/${first ? show(zero) : show(part)}${part.each === undefined ? '' : ` ${part.each}`}`;
    return `${lone(p, true)} and ${lone(t, false)}`;
  }
  // An X that stands for something: "+X/+X, where X is its power".
  const wheres = [p.where, t.where].filter((w): w is string => w !== undefined);
  const base = `${show(p)}/${show(t)}`;
  if (wheres.length === 0) return base;
  const same = wheres.every((w) => w === wheres[0]);
  return same || wheres.length === 1
    ? `${base}, where X is ${wheres[0]}`
    : `${base}, where X is ${wheres[0]} and Y is ${wheres[1]}`;
}

/** "-X/-X" and the like: a number alone, for places that have no room for the count. */
export function ptEffectText(effect: Extract<Effect, { kind: 'modifyPt' | 'setPt' }>): string {
  return effect.kind === 'modifyPt'
    ? `gets ${ptChangeText(effect.power, effect.toughness)}`
    : setPtText(effect.power, effect.toughness);
}

const sameAmount = (a: PtAmount, b: PtAmount): boolean => JSON.stringify(a) === JSON.stringify(b);

/** "has base power and toughness 4/4", "... each equal to the number of lands you control". */
function setPtText(power: PtAmount, toughness: PtAmount): string {
  if (typeof power === 'number' && typeof toughness === 'number') {
    return `has base power and toughness ${power}/${toughness}`;
  }
  if (sameAmount(power, toughness)) {
    return `has base power and toughness each equal to ${amountWords(power)}`;
  }
  return `has base power equal to ${amountWords(power)} and base toughness equal to ${amountWords(toughness)}`;
}

/** "equal to the number of cards in your hand": the defining part of a characteristic-defining ability. */
function definitionTail(
  power: DefinedPtAmount | undefined,
  toughness: DefinedPtAmount | undefined,
): string {
  if (power !== undefined && toughness !== undefined && sameAmount(power, toughness)) {
    return `equal to ${amountWords(power)}`;
  }
  return [
    power === undefined ? null : `power equal to ${amountWords(power)}`,
    toughness === undefined ? null : `toughness equal to ${amountWords(toughness)}`,
  ]
    .filter((p): p is string => p !== null)
    .join(', ');
}

/**
 * The tooltip of a power or toughness that an ability defines: "Defined by an ability: equal to the
 * number of cards in your hand".
 */
export function definedByTitle(
  power: DefinedPtAmount | undefined,
  toughness: DefinedPtAmount | undefined,
): string {
  return `Defined by an ability: ${definitionTail(power, toughness)}`;
}
