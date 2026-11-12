/**
 * Log lines for keyword batch 2 (D-116, D-120): what is tapped or exiled for Convoke, Improvise and
 * Delve, Extort's "you may pay", Cascade's question, a regeneration shield and the cards Cascade puts
 * on the bottom. The answers have no event of their own that names the spell, so the lines are worded
 * from the decision that was pending before the answer (as `describe-ward.ts` does). Pure functions of
 * the states, tested through `describeEvents`.
 */
import type {
  Action,
  GameEvent,
  GameState,
  ObjectId,
  PendingDecision,
  SeatId,
  StackAbility,
} from '@commander-arena/engine';
import { unlessCostText } from './cost-text';

type PayOptionsDecision = Extract<PendingDecision, { kind: 'choosePayOptions' }>;
type ConfirmDecision = Extract<PendingDecision, { kind: 'confirmOptional' }>;

export interface KeywordLine {
  readonly text: string;
  readonly seat: SeatId;
  readonly objects: readonly ObjectId[];
  readonly rule: string;
}

/**
 * True for Extort's expansion (CR 702.101a): a triggered ability of a cast spell whose effect is "you may
 * pay {W/B}. If you do, ...". Read from the ability's AST (the stack object's own), never from text.
 */
export function isExtortAbility(ability: StackAbility | null | undefined): boolean {
  if (ability === undefined || ability === null || ability.kind !== 'triggered') return false;
  if (ability.trigger.kind !== 'castSpell' || ability.trigger.self === true) return false;
  if (ability.effect.kind !== 'mayPay') return false;
  const [cost] = ability.effect.cost;
  return cost?.kind === 'mana' && cost.symbols.length === 1 && cost.symbols[0] === 'W/B';
}

/** "A", "A and B", "A, B and C". */
function joined(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? 'nothing';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const who = (seat: SeatId, viewer: SeatId): string => (seat === viewer ? 'You' : 'Opponent');

const RULES = {
  convoke: 'CR 702.51a',
  improvise: 'CR 702.126a',
  delve: 'CR 702.66a',
} as const;

/** The question being answered when `action` answers a `choosePayOptions` with at least one object. */
function answered(
  before: GameState,
  action: Action | undefined,
): { readonly decision: PayOptionsDecision; readonly objects: readonly ObjectId[] } | null {
  const asked = before.pending;
  if (action?.kind !== 'choosePayOptions' || asked?.kind !== 'choosePayOptions') return null;
  const objects = action.objects.filter((id) => asked.candidates.includes(id));
  return objects.length === 0 ? null : { decision: asked, objects };
}

/**
 * The objects tapped or exiled by the answer to a `choosePayOptions` question. Their own `tapped` and
 * `zoneChanged` events are folded into the one line `payOptionsLine` makes, so they get none.
 */
export function payOptionsPaid(
  before: GameState,
  action: Action | undefined,
): ReadonlySet<ObjectId> {
  return new Set(answered(before, action)?.objects ?? []);
}

/** True for the event that taps or exiles one of the `paid` objects. */
export function isPayOptionsEvent(event: GameEvent, paid: ReadonlySet<ObjectId>): boolean {
  if (paid.size === 0) return false;
  if (event.kind === 'tapped') return paid.has(event.object);
  return event.kind === 'zoneChanged' && event.toZone === 'exile' && paid.has(event.from);
}

/**
 * "You tap Llanowar Elves and Grizzly Bears to convoke SYNTHETIC X." and "You exile 2 cards to delve X."
 * (the cards exiled are public, but a count is what the cost is). `name` names an object in the state
 * before the answer: the spell is on the stack, the creatures on the battlefield.
 */
export function payOptionsLine(
  before: GameState,
  action: Action | undefined,
  viewer: SeatId,
  name: (id: ObjectId) => string,
): KeywordLine | null {
  const found = answered(before, action);
  if (found === null) return null;
  const { decision, objects } = found;
  const spell = name(decision.source);
  const seatOf = decision.seat;
  const subject = who(seatOf, viewer);
  const text =
    decision.mechanism === 'delve'
      ? `${subject} exile${seatOf === viewer ? '' : 's'} ${objects.length} card${objects.length === 1 ? '' : 's'} to delve ${spell}.`
      : `${subject} tap${seatOf === viewer ? '' : 's'} ${joined(objects.map(name))} to ${decision.mechanism} ${spell}.`;
  return {
    text,
    seat: seatOf,
    objects: decision.mechanism === 'delve' ? [decision.source] : [...objects, decision.source],
    rule: RULES[decision.mechanism],
  };
}

/**
 * The question `before` was waiting on when it is the "you may pay" or Cascade question that the event
 * answers. The event names the ability on the stack (Extort) or the card it belongs to (Cascade), the
 * question the ability.
 */
function keywordQuestion(before: GameState, source: ObjectId): ConfirmDecision | null {
  const asked = before.pending;
  if (asked?.kind !== 'confirmOptional') return null;
  if (asked.purpose !== 'mayPay' && asked.purpose !== 'cascade') return null;
  const sameAbility =
    asked.source === source || before.objects[asked.source]?.stack?.source === source;
  return sameAbility ? asked : null;
}

/** The name of an object in either state (the card exiled by Cascade is a new object after it moves). */
function nameAt(before: GameState, after: GameState, id: ObjectId): string {
  const obj = before.objects[id] ?? after.objects[id];
  const card = obj?.card === null || obj?.card === undefined ? undefined : before.cards[obj.card];
  const def = card === undefined ? undefined : before.definitions[card.definition];
  return def?.name ?? obj?.token?.characteristics.name ?? 'a card';
}

/**
 * The answer to "You may pay {W/B}" (Extort) and to Cascade's "cast it without paying its mana cost?":
 * the cost the decision carried, the ability's source and the card exiled, all public.
 */
export function keywordAnswerLine(
  before: GameState,
  after: GameState,
  event: Extract<GameEvent, { kind: 'optionalAnswered' }>,
  viewer: SeatId,
): KeywordLine | null {
  const asked = keywordQuestion(before, event.source);
  if (asked === null) return null;
  const subject = who(event.seat, viewer);
  const you = event.seat === viewer;
  if (asked.purpose === 'cascade') {
    const card =
      asked.subject === undefined ? 'the exiled card' : nameAt(before, after, asked.subject);
    return {
      text: event.accepted
        ? `${subject} cast${you ? '' : 's'} ${card} without paying its mana cost (cascade).`
        : `${subject} ${you ? "don't" : "doesn't"} cast ${card} (cascade).`,
      seat: event.seat,
      objects: asked.subject === undefined ? [] : [asked.subject],
      rule: 'CR 702.85a',
    };
  }
  const cost = unlessCostText(asked.cost ?? []);
  const keyword = isExtortAbility(before.objects[asked.source]?.stack?.ability)
    ? 'extort'
    : `${asked.sourceName}'s ability`;
  return {
    text: event.accepted
      ? `${subject} choose${you ? '' : 's'} to pay ${cost} for ${keyword}.`
      : `${subject} ${you ? "don't" : "doesn't"} pay ${cost} for ${keyword}.`,
    seat: event.seat,
    objects: [],
    rule: 'CR 702.101a',
  };
}

/** The line for backing out of the payment of a "you may pay" (`cancel` at its `payMana`): not paying. */
export function mayPayCancelLine(
  before: GameState,
  action: Action | undefined,
  viewer: SeatId,
): KeywordLine | null {
  const asked = before.pending;
  if (action?.kind !== 'cancel' || asked?.kind !== 'payMana' || asked.purpose !== 'mayPay') {
    return null;
  }
  const mana = asked.totalCost.map((s) => `{${s}}`).join('');
  return {
    text: `${who(asked.seat, viewer)} ${asked.seat === viewer ? "don't" : "doesn't"} pay ${mana}.`,
    seat: asked.seat,
    objects: [],
    rule: 'CR 702.101a',
  };
}

/**
 * "SYNTHETIC X regenerates: it is tapped, removed from combat and its damage is removed." The combat
 * part is said only when the permanent was attacking or blocking (CR 701.19a), read from the state
 * before the action.
 */
export function regeneratedText(before: GameState, object: ObjectId, name: string): string {
  const combat = before.combat;
  const inCombat =
    combat !== null &&
    (combat.attackers.some((a) => a.object === object) ||
      combat.blocks.some((b) => b.blocker === object));
  return inCombat
    ? `${name} regenerates: it is tapped, removed from combat and its damage is removed.`
    : `${name} regenerates: it is tapped and its damage is removed.`;
}

/** "You put 3 cards on the bottom of your library in a random order." Counts only: the order is hidden. */
export function bottomedText(seat: SeatId, count: number, viewer: SeatId, ordered = false): string {
  const cards = `${count} card${count === 1 ? '' : 's'}`;
  // D-960 (CR 401.4): an order the owner chose, which is as hidden as a random one.
  const how = ordered ? 'in an order they chose' : 'in a random order';
  return seat === viewer
    ? `You put ${cards} on the bottom of your library ${ordered ? 'in an order you chose' : how}.`
    : `Opponent puts ${cards} on the bottom of their library ${how}.`;
}
