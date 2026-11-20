/** Words for the costs of an "As this enters, you may pay ..." question (the engine's `Cost[]`). */
import type { Cost } from '@commander-arena/engine';
import { amountPhrase } from './amount-text';
import { NUMBER_WORDS, nounsOf, plural, tappedWhat } from './cost-words';
import { beholdQuality } from './dragons-text';
import { untapWhat } from './untap-cost-text';

/**
 * One cost as it reads after "Pay": "2 life". Only paying life reaches the page today; any other
 * kind is shown by its kind name, never guessed at.
 */
export function costPart(cost: Cost): string {
  if (cost.kind !== 'payLife') return cost.kind;
  if (typeof cost.amount === 'number') return `${cost.amount} life`;
  // D-364 (CR 119.4): "pay that much life", the life that caused the trigger.
  if (cost.amount.kind === 'triggerDamage') return 'that much life';
  // D-135: life equal to a count, worked out as the ability is activated.
  return `life equal to ${amountPhrase(cost.amount)}`;
}

/** "2 life", or "2 life and discard" for several costs. */
export function costText(cost: readonly Cost[]): string {
  return cost.map(costPart).join(' and ');
}

/**
 * One part of a kicker cost as the question reads it: mana symbols with their braces ("{2}"), life
 * as "3 life". Any other kind (the engine allows only these two) is shown by its kind, never
 * guessed at.
 */
export function kickerCostPart(cost: Cost): string {
  if (cost.kind === 'mana') return cost.symbols.map((s) => `{${s}}`).join('');
  return costPart(cost);
}

/**
 * A cost that is one cost repeated (Cumulative upkeep's, D-127: {1} for each of two age counters is two
 * `{1}` entries) as it reads on one line: the mana of all entries as one payment ("{1}{1}") and the life
 * of all of them as one amount ("2 life"). Other kinds keep their place and order.
 */
export function mergeRepeated(cost: readonly Cost[]): Cost[] {
  const merged: Cost[] = [];
  for (const part of cost) {
    const at = merged.findIndex((m) => m.kind === part.kind);
    const into = at < 0 ? undefined : merged[at];
    if (into?.kind === 'mana' && part.kind === 'mana') {
      merged[at] = { kind: 'mana', symbols: [...into.symbols, ...part.symbols] };
    } else if (
      into?.kind === 'payLife' &&
      part.kind === 'payLife' &&
      typeof into.amount === 'number' &&
      typeof part.amount === 'number'
    ) {
      merged[at] = { kind: 'payLife', amount: into.amount + part.amount };
    } else {
      merged.push(part);
    }
  }
  return merged;
}

/**
 * What paying a "pay or it is countered" cost (Ward, CR 702.21a) does, as a verb phrase: "pay {2}",
 * "pay 3 life", "pay {1} and 2 life", "discard a card", "pay {1} and discard a card"; with `third`
 * the verbs agree with "Opponent" ("pays {2}", "discards a card"). Mana keeps its braces, as on the
 * card; any other kind is shown by its kind, never guessed at.
 */
export function unlessCostPhrase(cost: readonly Cost[], third = false): string {
  const s = third ? 's' : '';
  const pay = mergeRepeated(cost)
    .filter((c) => c.kind !== 'discard')
    .map(kickerCostPart);
  const total = cost.reduce((sum, c) => sum + (c.kind === 'discard' ? c.count : 0), 0);
  const cards = total === 0 ? null : `discard${s} ${countText(total, 'card', 'cards')}`;
  if (pay.length === 0) return cards ?? `pay${s}`;
  return `pay${s} ${pay.join(' and ')}${cards === null ? '' : ` and ${cards}`}`;
}

/** "Pay {2}", "Pay 3 life", "Discard a card": the question's ask (the phrase, capitalised). */
export function unlessCostAsk(cost: readonly Cost[]): string {
  return capitalize(unlessCostPhrase(cost));
}

/**
 * What a "pay or it is countered" cost reads as without its verb: "{2}", "3 life", "{1} and 2 life",
 * "a card". Used where the sentence supplies "pay" itself ("You pay {3} so X is not countered").
 */
export function unlessCostText(cost: readonly Cost[]): string {
  return cost
    .map((c) => (c.kind === 'discard' ? countText(c.count, 'card', 'cards') : kickerCostPart(c)))
    .join(' and ');
}

const capitalize = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/**
 * What a sacrifice cost names, in plain words: "a creature", "an artifact or creature", "another
 * artifact", "this". Fields the words do not cover (a controller, a tapped state) are left out, so
 * the phrase never claims more than the filter says.
 */
export function sacrificeWhat(
  what: Extract<Cost, { kind: 'sacrifice' }>['what'],
  count = 1,
  /** D-488: "Sacrifice X creatures": the number is the X announced. */
  countX = false,
  /** D-583: "Sacrifice one or more artifacts": at least one of them, chosen as the cost is paid. */
  oneOrMore = false,
): string {
  if ('kind' in what) return 'this';
  const words = nounsOf(what);
  if (countX) return `X ${plural(words)}`;
  if (oneOrMore) return `one or more ${what.other === true ? 'other ' : ''}${plural(words)}`;
  // D-485: "two other creatures": all but the permanent with the ability.
  if (count > 1) {
    return `${NUMBER_WORDS[count] ?? count} ${what.other === true ? 'other ' : ''}${plural(words)}`;
  }
  if (what.other === true) return `another ${words}`;
  return /^[aeiou]/i.test(words) ? `an ${words}` : `a ${words}`;
}

/** "a Swamp and a Forest": the parts of a sacrifice of several different permanents (CR 701.21a), in the order of the text. */
export function sacrificeParts(cost: Extract<Cost, { kind: 'sacrifice' }>): string {
  const parts = [cost.what, ...(cost.alongside ?? [])];
  return parts.map((part) => sacrificeWhat(part)).join(' and ');
}

const countText = (n: number, one: string, many: string): string =>
  n === 1 ? `a ${one}` : `${n} ${many}`;

/**
 * One cost of an activated ability as Oracle text prints it: "{2}", "{T}", "Pay 2 life",
 * "Sacrifice a creature", "Discard this card". Mana symbols keep their braces so the player reads
 * the same line as on the card. `self` is the noun of the permanent with the ability, for the costs of D-139 that
 * name it ("Put a page counter on this artifact"); "permanent" when the caller does not know it.
 */
export function activationCostPart(cost: Cost, self = 'permanent'): string {
  switch (cost.kind) {
    case 'behold': {
      const quality = beholdQuality(cost.filter);
      return quality === null ? 'Behold' : `Behold ${quality}`;
    }
    case 'mana':
      return cost.symbols.map((s) => `{${s}}`).join('');
    case 'tap':
      return '{T}';
    case 'untap':
      return '{Q}';
    case 'exert':
      // CR 701.43a (issue 144): the permanent with the ability is exerted as part of the cost.
      return `Exert this ${self}`;
    case 'payLife':
      return `Pay ${costPart(cost)}`;
    case 'payXLife':
      return 'Pay X life';
    case 'discardX':
      // D-386: the additional cost of a spell, "Discard X cards".
      return 'Discard X cards';
    case 'sacrifice':
      // D-583 (CR 602.2b): the cost of an activated ability that sacrifices one or more permanents, at least one.
      if (cost.anyNumber === true && cost.atLeastOne === true) {
        return `Sacrifice ${sacrificeWhat(cost.what, 1, false, true)}`;
      }
      // D-491 (CR 118.8): the additional cost of a spell that may sacrifice any number of permanents.
      if (cost.anyNumber === true && !('kind' in cost.what)) {
        return `Sacrifice one or more ${plural(nounsOf(cost.what))} (optional)`;
      }
      // CR 701.21a: "Sacrifice a Swamp and a Forest", a different permanent for each part.
      if (cost.alongside !== undefined) return `Sacrifice ${sacrificeParts(cost)}`;
      return `Sacrifice ${sacrificeWhat(cost.what, cost.count, cost.countX === true)}`;
    case 'tapPermanents':
      // D-133: "Tap two untapped artifacts you control".
      return `Tap ${tappedWhat(cost.filter, cost.count)}`;
    case 'untapPermanents':
      // CR 701.26b: "Untap two tapped creatures you control".
      return `Untap ${untapWhat(cost.filter, cost.count)}`;
    case 'blight':
      // D-407 (CR 701.68a): "Blight 1".
      return `Blight ${cost.count}`;
    case 'mill':
      // D-208 (CR 701.17): "Mill a card".
      return `Mill ${countText(cost.count, 'card', 'cards')}`;
    case 'energy':
      // D-209 (CR 107.14): "{E}{E}".
      return '{E}'.repeat(cost.count);
    case 'discard':
      return cost.named === true
        ? `Discard another card named ${self === 'permanent' ? 'this card' : self}`
        : `Discard ${cost.filter === undefined ? countText(cost.count, 'card', 'cards') : `a ${nounsOf(cost.filter)} card`}`;
    case 'discardThis':
      return 'Discard this card';
    case 'revealThis':
      // D-462 (CR 701.20a): Tetzimoc's cost; the card stays in the hand.
      return 'Reveal this card from your hand';
    case 'exileThis':
      // D-185 (CR 702.141a): the cost of Encore.
      return 'Exile this card from your graveyard';
    case 'tapCreatures':
      return `Tap untapped creatures you control with total power ${cost.totalPower} or greater`;
    case 'exileFromGraveyard':
      return `Exile ${countText(cost.count, 'card', 'cards')} from your graveyard`;
    case 'exileFromHand': {
      const colorNames: Readonly<Record<string, string>> = {
        W: 'white',
        U: 'blue',
        B: 'black',
        R: 'red',
        G: 'green',
      };
      const colors = (cost.filter.colors ?? [])
        .map((color) => colorNames[color] ?? color)
        .join(' or ');
      return `Exile any number of ${colors === '' ? '' : `${colors} `}cards from your hand (optional)`;
    }
    case 'removeCounters':
      return `Remove ${countText(cost.count, `${cost.counter} counter`, `${cost.counter} counters`)}`;
    case 'putCounters':
      // D-139: "Put a page counter on this artifact".
      return `Put ${countText(cost.count, `${cost.counter} counter`, `${cost.counter} counters`)} on this ${self}`;
    case 'loyalty':
      // D-200 (CR 606.4, 606.5): the loyalty symbol as the rules text writes it: "+1", "−2" (U+2212, as Oracle text), "0", "−X".
      return cost.change === 'x'
        ? '\u2212X'
        : cost.change > 0
          ? `+${cost.change}`
          : cost.change < 0
            ? `\u2212${-cost.change}`
            : '0';
    case 'returnToHand': {
      // D-139: "Return an artifact you control to its owner's hand", "Return two lands you control to their owner's
      // hand", "Return this artifact to its owner's hand".
      if ('kind' in cost.what) return `Return this ${self} to its owner's hand`;
      const count = cost.count ?? 1;
      return `Return ${sacrificeWhat(cost.what, count)} you control to ${count > 1 ? "their owner's" : "its owner's"} hand`;
    }
  }
}

/** "{2}, {T}, Sacrifice this": the cost of an activated ability, before the colon. */
export function activationCostText(cost: readonly Cost[], self?: string): string {
  return cost.map((part) => activationCostPart(part, self)).join(', ');
}

/**
 * The additional costs to cast a spell (CR 118.8, D-095) as the preview lists them: "Sacrifice a
 * creature", "Sacrifice a creature, discard a card", "Pay 3 life". Empty for none.
 */
export function additionalCostsText(costs: readonly Cost[] | undefined): string {
  if (costs === undefined || costs.length === 0) return '';
  const parts = costs.map((part) => activationCostPart(part));
  const [first, ...rest] = parts;
  const lower = (part: string) =>
    part.startsWith('{') ? part : part.replace(/^./, (c) => c.toLowerCase());
  return [first ?? '', ...rest.map(lower)].join(', ');
}

/**
 * One way to pay an additional cost of a spell as a phrase of "A, or B" (D-181): "sacrifice an artifact or creature", "pay {4}", "discard a card",
 * "pay 3 life". Mana says "pay" in front of its symbols; the other costs already begin with their verb.
 */
export function additionalWayText(costs: readonly Cost[]): string {
  const text = additionalCostsText(costs);
  return text.startsWith('{') ? `pay ${text}` : text.replace(/^./, (c) => c.toLowerCase());
}

/**
 * The two ways to pay an additional cost to cast a spell (CR 118.8, D-181) as the preview lists them: "Sacrifice an artifact or creature, or pay
 * {4}". Empty for none.
 */
export function additionalCostChoiceText(
  choice: readonly [readonly Cost[], readonly Cost[]] | undefined,
): string {
  if (choice === undefined) return '';
  const first = additionalWayText(choice[0]);
  return `${first.replace(/^./, (c) => c.toUpperCase())}, or ${additionalWayText(choice[1])}`;
}

export { tappedWhat };
