/**
 * Turns engine events into game-log lines (SPEC 10 "Information"). Names are looked up in the state
 * before the action and the state after it, because an object that changed zones has a new id.
 */
import type {
  Action,
  CardDefinition,
  CardId,
  GameEvent,
  GameObject,
  GameState,
  ObjectId,
  SeatId,
  StepId,
} from '@commander-arena/engine';
import { faceDownLabel } from '@commander-arena/engine';
import { alternativeLogWords, isNamedAlternative } from './alt-cost';
import { findEffect } from './artifacts-text';
import { optionText } from './chosen';
import { costText, unlessCostPhrase } from './cost-text';
import {
  bottomedText,
  isPayOptionsEvent,
  keywordAnswerLine,
  mayPayCancelLine,
  payOptionsLine,
  payOptionsPaid,
  regeneratedText,
} from './describe-keywords2';
import { castNowAnswerLine, foretoldLine, isForetellMove } from './describe-later';
import { manifestedLine, turnedUpLine } from './face-down-text';
import { mayEffectLine, unlessAnswerLine, unlessCancelLine } from './describe-unless';
import { counteredByDeclining, unlessPayment, unlessQuestion } from './describe-ward';
import { riotAnswerText } from './keywords-text';
import { timeCounters } from './later-text';
import { modeText } from './mode-text';
import { inherentNameOf } from './monarch-text';
import type { LogLevel } from './protocol';
import { giftedText } from './recursion-text';
import { chapterWord, loreCountIn, romanNumeral } from './saga';
import { turnLabel } from './turn-label';

export interface Described {
  readonly level: LogLevel;
  readonly text: string;
  readonly seat: SeatId | null;
  readonly objects: readonly ObjectId[];
  readonly rule: string | null;
  /** The stack object of an activated ability that was just put on the stack. */
  readonly activation?: ObjectId;
}

const STEP_NAMES: Readonly<Record<StepId, string>> = {
  untap: 'untap step',
  upkeep: 'upkeep',
  draw: 'draw step',
  precombatMain: 'precombat main phase',
  beginningOfCombat: 'beginning of combat',
  declareAttackers: 'declare attackers step',
  declareBlockers: 'declare blockers step',
  firstStrikeDamage: 'first-strike damage step',
  combatDamage: 'combat damage step',
  endOfCombat: 'end of combat',
  postcombatMain: 'postcombat main phase',
  end: 'end step',
  cleanup: 'cleanup step',
};

export function stepName(step: StepId): string {
  return STEP_NAMES[step];
}

/** Who a seat is called in text: "You" or "Opponent". */
export function seatName(seat: SeatId, viewer: SeatId): string {
  return seat === viewer ? 'You' : 'Opponent';
}

/** "Your" or "Opponent's". */
function possessive(seat: SeatId, viewer: SeatId): string {
  return seat === viewer ? 'Your' : "Opponent's";
}

/**
 * The name the view gives a card: the face that is up for a multi-face card (a spell cast as its
 * second half, a transformed permanent, an Adventure card's creature in hand), and "A // B" for a
 * split card anywhere but the stack (CR 709.4). A single-faced card is its definition's name.
 */
function nameOfFace(def: CardDefinition, obj: GameObject): string {
  // `faces` is optional here only so a definition written by hand in a test is single-faced.
  if ((def.faces?.length ?? 0) < 2) return def.name;
  if (def.layout === 'split' && obj.zone !== 'stack')
    return def.faces.map((f) => f.name).join(' // ');
  return def.faces[obj.face]?.name ?? def.name;
}

/** The name of face `face` of the card behind `id`, or null when it is not a multi-face card. */
function faceNameIn(state: GameState, id: ObjectId, face: number): string | null {
  const card = state.objects[id]?.card;
  const at = card === null || card === undefined ? undefined : state.cards[card]?.definition;
  const def = at === undefined ? undefined : state.definitions[at];
  return def !== undefined && (def.faces?.length ?? 0) > 1 ? (def.faces[face]?.name ?? null) : null;
}

function nameIn(state: GameState, id: ObjectId): string | null {
  const obj = state.objects[id];
  // An object that is gone (a token that ceased to exist, a permanent that left) keeps its
  // last-known name (CR 113.7a).
  if (obj === undefined) {
    const lastKnown = state.lki[id]?.characteristics.name;
    return lastKnown === undefined || lastKnown === '' ? null : lastKnown;
  }
  if (obj.token !== null) return obj.token.characteristics.name;
  // CR 708.2, 708.5 (D-965): a face-down permanent has no name, and the log is read by both players: it is "Face-down creature N", never its card.
  const down = faceDownLabel(obj);
  if (down !== null) return down;
  // An ability on the stack has no card: it is named after the object it belongs to.
  if (obj.stack?.kind === 'ability') {
    // CR 725.2, 701.54c (D-127, D-196): the abilities of the monarch and of the Ring have no source; they are "The monarch" and "The Ring".
    if (obj.stack.inherent !== undefined) return inherentNameOf(obj.stack.inherent);
    return obj.stack.source === null ? null : nameIn(state, obj.stack.source);
  }
  if (obj.card === null) return null;
  const card = state.cards[obj.card];
  const def = card === undefined ? undefined : state.definitions[card.definition];
  return def === undefined ? null : nameOfFace(def, obj);
}

/**
 * What the object `source` is while a cost is paid: `'spell'` when `before` holds the casting
 * transaction of a spell on that object (the player is paying its additional costs), `'ability'` for
 * an activation, null when nothing is being cast (an effect asks). The transaction is in the state
 * before the answer that pays the cost.
 */
function costSource(before: GameState, source: ObjectId): 'spell' | 'ability' | null {
  // Fake states in tests may lack the field: no transaction then.
  const going = before.casting ?? null;
  if (going === null || going.object !== source) return null;
  return going.activation === null ? 'spell' : 'ability';
}

/** True for a triggered ability on the stack (it has no card; CR 113.1c, 603.3). */
function isAbilityObject(state: GameState, id: ObjectId): boolean {
  return state.objects[id]?.stack?.kind === 'ability';
}

/**
 * The text of every mode of the spell or ability `id` on the stack, in printed order (CR 700.2): the
 * modes of the ability it carries, or of the spell text of the face that is up. Null when it is not
 * modal or the object is gone.
 */
function modeTextsOf(state: GameState, id: ObjectId): readonly string[] | null {
  const obj = state.objects[id];
  if (obj === undefined) return null;
  const ability = obj.stack?.ability;
  let modes = ability?.modes;
  if (ability === undefined || ability === null) {
    const card = obj.card === null ? undefined : state.cards[obj.card];
    const def = card === undefined ? undefined : state.definitions[card.definition];
    modes = def?.faces?.[obj.face]?.spell?.modes;
  }
  return modes === undefined ? null : modes.map((m) => m.text);
}

/** "a Treasure", "an Elf": the indefinite article for a name. */
function withArticle(noun: string): string {
  return /^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`;
}

/** "A", "A and B", "A, B and C". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? 'nothing';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function cardName(state: GameState, card: CardId | null): string | null {
  if (card === null) return null;
  const instance = state.cards[card];
  return instance === undefined ? null : (state.definitions[instance.definition]?.name ?? null);
}

/**
 * The text of one event, or null for events that are not worth a line. `before` and `after` are the
 * states around the action that produced the event; `viewer` is the human seat.
 */
/** True when the ability on the stack `source` taps permanents its controller chooses (D-139). */
function tapsChosen(state: GameState, source: ObjectId): boolean {
  const effect = state.objects[source]?.stack?.ability?.effect;
  const tap = effect === undefined || effect === null ? null : findEffect(effect, 'tap');
  return tap?.objects.kind === 'choose';
}

export function describeEvent(
  event: GameEvent,
  before: GameState,
  after: GameState,
  viewer: SeatId,
): Described | null {
  const name = (id: ObjectId): string => nameIn(after, id) ?? nameIn(before, id) ?? 'a card';
  /**
   * " (#2)": the attacker's number in this combat, the one the board draws on it and on each
   * blocker, so identical creatures can be told apart in the log (`combatRoles`).
   */
  const pairTag = (attacker: ObjectId): string => {
    const attackers = (after.combat?.attackers ?? []).filter(
      (a) => after.objects[a.object]?.zone === 'battlefield',
    );
    const at = attackers.findIndex((a) => a.object === attacker);
    return at < 0 ? '' : ` (#${at + 1})`;
  };
  /** A spell or permanent by name, a stack ability as "<source>'s ability". */
  const label = (id: ObjectId): string => {
    if (!isAbilityObject(before, id) && !isAbilityObject(after, id)) return name(id);
    const inherent = (after.objects[id] ?? before.objects[id])?.stack?.inherent;
    if (inherent !== undefined) return inherentNameOf(inherent);
    // A Saga's chapter ability says which chapter it is (CR 714.2b).
    const chapter = chapterWord((after.objects[id] ?? before.objects[id])?.stack?.chapter);
    return chapter === null ? `${name(id)}'s ability` : `${name(id)}'s ${chapter} ability`;
  };
  const who = (seat: SeatId) => seatName(seat, viewer);
  const verb = (seat: SeatId, you: string, they: string) => (seat === viewer ? you : they);
  const line = (
    level: LogLevel,
    text: string,
    seat: SeatId | null = null,
    objects: readonly ObjectId[] = [],
    rule: string | null = null,
  ): Described => ({ level, text, seat, objects, rule });

  switch (event.kind) {
    case 'gameStarted':
      return line(
        'major',
        `Game started. ${who(event.startingSeat)} ${verb(event.startingSeat, 'go', 'goes')} first.`,
        null,
        [],
        'CR 103',
      );
    case 'mulliganTaken':
      return line(
        'major',
        `${who(event.seat)} ${verb(event.seat, 'take', 'takes')} a mulligan (${event.count}).`,
        event.seat,
        [],
        'CR 103.5',
      );
    case 'handKept':
      return line(
        'major',
        `${who(event.seat)} ${verb(event.seat, 'keep', 'keeps')} a hand.`,
        event.seat,
      );
    case 'turnBegan':
      return line(
        'major',
        `${turnLabel(event.seat, viewer, event.turn, after.seats.length)} begins.`,
        event.seat,
      );
    case 'stepBegan':
      return line(
        'detail',
        `${possessive(event.seat, viewer)} ${stepName(event.step)}`,
        event.seat,
        [],
        'CR 500',
      );
    case 'zoneChanged': {
      // A token that changed zone has already ceased to exist in `after` (CR 111.7): use the name
      // it had where it came from.
      const name = (id: ObjectId): string =>
        nameIn(after, id) ?? nameIn(before, id) ?? nameIn(before, event.from) ?? 'a card';
      // Draws, land plays and casts have their own lines; the rest are shown as plain moves.
      // An Adventure that resolved is exiled with the card's own permission to be cast later
      // (CR 715.3d); the exile line says so, and `onAdventure` is on the new object.
      if (event.toZone === 'exile' && after.objects[event.to]?.onAdventure === true) {
        return line(
          'major',
          `${name(event.to)} goes on an adventure.`,
          null,
          [event.to],
          'CR 715.3d',
        );
      }
      // A foretell moves the card face down: the `foretold` line says it, and this one would name it (D-128).
      if (isForetellMove(after, event)) return null;
      // CR 701.40a, 708.3 (D-962): a card that entered the battlefield face down is hidden: the `manifested` line says it and names no card.
      if (
        event.toZone === 'battlefield' &&
        event.card === null &&
        after.objects[event.to]?.faceDown !== undefined
      ) {
        return null;
      }
      // CR 701.42a, 712.14c (D-277): the two cards that were melded enter as one permanent; the `melded` line says it.
      if (
        event.toZone === 'battlefield' &&
        after.objects[event.to]?.meldedWith !== undefined &&
        event.fromZone === 'exile'
      ) {
        return null;
      }
      // CR 406.3 (D-187): an effect that exiles cards face down from the top of a library ("Exile the top two cards of target opponent's library face
      // down"): nobody but the player the effect let look may examine them, and the log is read by both players, so it names no card and links none.
      if (event.toZone === 'exile' && after.objects[event.to]?.exiledFaceDown === true) {
        const owner = after.objects[event.to]?.owner;
        return line(
          'major',
          event.fromZone === 'library' && owner !== undefined
            ? `A card is exiled face down from the top of ${possessive(owner, viewer).toLowerCase()} library.`
            : 'A card is exiled face down.',
          owner ?? null,
          [],
          'CR 406.3',
        );
      }
      // CR 702.75a (D-145): Hideaway exiles a card face down, which only the controller of the permanent may look at. The log is
      // read by both players, so it names no card and links none; the controller sees theirs in exile.
      if (event.toZone === 'exile') {
        const hideaway = after.objects[event.to]?.hideaway;
        if (hideaway !== undefined) {
          const seat = after.objects[hideaway]?.controller ?? after.objects[event.to]?.owner;
          const text =
            seat === undefined
              ? 'A card is exiled face down (Hideaway).'
              : `${who(seat)} ${verb(seat, 'exile', 'exiles')} a card face down (Hideaway).`;
          return line('major', text, seat ?? null, [], 'CR 702.75a');
        }
      }
      if (event.toZone === 'stack' || event.fromZone === 'stack') return null;
      // D-151 (CR 701.13): a card exiled from the top of a library face up ("You may play that card this turn", Discover) is public, so it is named.
      if (event.fromZone === 'library' && event.toZone === 'exile') {
        const owner = after.objects[event.to]?.owner;
        return line(
          'major',
          owner === undefined
            ? `${name(event.to)} is exiled from the top of a library.`
            : `${name(event.to)} is exiled from the top of ${possessive(owner, viewer).toLowerCase()} library.`,
          owner ?? null,
          [event.to],
          'CR 701.13',
        );
      }
      if (event.fromZone === 'library' && event.toZone === 'hand') return null;
      if (event.toZone === 'battlefield' && event.fromZone === 'hand') return null;
      if (event.fromZone === 'library' || event.toZone === 'library') {
        return line('detail', `${name(event.to)}: ${event.fromZone} to ${event.toZone}`, null, [
          event.to,
        ]);
      }
      if (
        event.toZone === 'hand' ||
        event.toZone === 'graveyard' ||
        event.toZone === 'exile' ||
        event.toZone === 'command'
      ) {
        return line(
          'major',
          `${name(event.to)} goes to ${event.toZone === 'hand' ? 'a hand' : `the ${event.toZone}`}.`,
          null,
          [event.to],
          'CR 400',
        );
      }
      return line('detail', `${name(event.to)}: ${event.fromZone} to ${event.toZone}`, null, [
        event.to,
      ]);
    }
    case 'cardDrawn':
      return line(
        'detail',
        event.seat === viewer ? `You draw ${name(event.object)}.` : 'Opponent draws a card.',
        event.seat,
        event.seat === viewer ? [event.object] : [],
        'CR 121',
      );
    case 'drewFromEmptyLibrary':
      return line(
        'major',
        `${who(event.seat)} tried to draw from an empty library.`,
        event.seat,
        [],
        'CR 704.5b',
      );
    case 'dieRolled':
      // CR 706.1, 706.2 (D-271): the natural result of a die, which an ability may read.
      return line(
        'major',
        `${who(event.seat)} ${verb(event.seat, 'roll', 'rolls')} a ${event.sides}-sided die: ${event.result}.`,
        event.seat,
        [],
        'CR 706.2',
      );
    case 'libraryShuffled':
      return line(
        'detail',
        `${possessive(event.seat, viewer)} library is shuffled.`,
        event.seat,
        [],
        'CR 701.24',
      );
    case 'landPlayed': {
      // The back face of a modal double-faced card is played as that face (CR 712.12).
      const played = faceNameIn(after, event.object, event.face ?? 0) ?? name(event.object);
      return line(
        'major',
        `${who(event.seat)} ${verb(event.seat, 'play', 'plays')} ${played}.`,
        event.seat,
        [event.object],
        'CR 305',
      );
    }
    case 'spellCast': {
      // Kicker (CR 702.33d), Flashback (CR 702.34a) and a free cast (CR 118.9, D-095) say how it
      // was cast; none of them has an event of its own, so this line is where the log mentions them.
      const tax = event.commanderTax > 0 ? ` (commander tax ${event.commanderTax})` : '';
      // Overload (CR 702.96a), Evoke (CR 702.74a) and Dash (CR 702.109a) are alternative costs: "for its
      // overload cost" (D-121).
      const alternative =
        event.alternative === 'flashback'
          ? ' with flashback'
          : event.alternative === 'free'
            ? ' without paying its mana cost'
            : isNamedAlternative(event.alternative)
              ? ` ${alternativeLogWords(event.alternative)}`
              : '';
      // Suspend's cast (CR 702.62a, D-128) is a free cast: say where it came from.
      const suspended = event.suspended === true ? ' (suspend)' : '';
      // X was announced as the spell was cast (CR 107.3a, 601.2b): "with X = 3", before ", kicked".
      const x = event.x === undefined ? '' : ` with X = ${event.x}`;
      // Replicate (CR 702.56a, D-129): the cost paid that many times.
      const replicas =
        event.replicas === undefined
          ? ''
          : `, replicated ${event.replicas === 1 ? 'once' : `${event.replicas} times`}`;
      // Gift (CR 702.174a, D-135): "promising Opponent a gift".
      const how = `${alternative}${x}${kickedText(event)}${replicas}${giftedText(event.gift, viewer)}${suspended}`;
      // The face cast is named, never the card's "A // B" (CR 709.3, 715.3, 712.11b).
      const cast = faceNameIn(after, event.object, event.face ?? 0) ?? name(event.object);
      return line(
        'major',
        `${who(event.seat)} ${verb(event.seat, 'cast', 'casts')} ${cast}${tax}${how}.`,
        event.seat,
        [event.object],
        'CR 601',
      );
    }
    case 'abilityActivated': {
      // Cycling is the only ability that works from the hand (CR 702.29a), and the ability on the
      // stack keeps its text, so it tells a cycled card from an ordinary activation.
      const stacked = event.stackObject === null ? undefined : after.objects[event.stackObject];
      const cycled =
        stacked?.stack?.ability?.kind === 'activated' &&
        stacked.stack.ability.functionsIn === 'hand';
      const described = line(
        'major',
        cycled
          ? `${who(event.seat)} ${verb(event.seat, 'cycle', 'cycles')} ${name(event.source)}.`
          : `${who(event.seat)} ${verb(event.seat, 'activate', 'activates')} ${name(event.source)}'s ability${event.x === undefined ? '' : ` with X = ${event.x}`}.`,
        event.seat,
        [event.source],
        cycled ? 'CR 702.29' : 'CR 602',
      );
      return event.stackObject === null
        ? described
        : { ...described, activation: event.stackObject };
    }
    case 'manaAdded':
      return line(
        'detail',
        `${who(event.seat)} ${verb(event.seat, 'add', 'adds')} ${event.count} mana.`,
        event.seat,
        [],
        'CR 106',
      );
    case 'manaEmptied':
      return null;
    case 'tapped':
      return line('detail', `${name(event.object)} taps.`, null, [event.object]);
    case 'untapped':
      return line('detail', `${name(event.object)} untaps.`, null, [event.object]);
    case 'priorityPassed':
      return line(
        'detail',
        `${who(event.seat)} ${verb(event.seat, 'pass', 'passes')} priority.`,
        event.seat,
        [],
        'CR 117.3d',
      );
    case 'attackersDeclared':
      return event.attackers.length === 0
        ? line(
            'major',
            `${who(event.seat)} ${verb(event.seat, 'attack', 'attacks')} with nothing.`,
            event.seat,
            [],
            'CR 508',
          )
        : line(
            'major',
            `${who(event.seat)} ${verb(event.seat, 'attack', 'attacks')} with ${event.attackers.map((a) => name(a.object)).join(', ')}.`,
            event.seat,
            event.attackers.map((a) => a.object),
            'CR 508',
          );
    case 'blockersDeclared':
      return event.blocks.length === 0
        ? line(
            'major',
            `${who(event.seat)} ${verb(event.seat, 'declare', 'declares')} no blockers.`,
            event.seat,
            [],
            'CR 509',
          )
        : line(
            'major',
            `${event.blocks
              .map((b) => `${name(b.blocker)} blocks ${name(b.attacker)}${pairTag(b.attacker)}`)
              .join('; ')}.`,
            event.seat,
            event.blocks.flatMap((b) => [b.blocker, b.attacker]),
            'CR 509',
          );
    case 'removedFromCombat':
      return line(
        'detail',
        `${name(event.object)} is removed from combat.`,
        null,
        [event.object],
        'CR 506.4',
      );
    case 'resolved':
      return line('detail', `${label(event.object)} resolves.`, null, [event.object], 'CR 608');
    case 'fizzled':
      return line(
        'major',
        `${label(event.object)} fizzles (no legal targets).`,
        null,
        [event.object],
        'CR 608.2b',
      );
    case 'countered': {
      // Ward (CR 702.21a) and "counter unless its controller pays": declining the question says it
      // in the answer's own line; backing out of the payment is `cancel`, which has no answer
      // event, so this line carries the "don't pay".
      if (counteredByDeclining(before, event.object)) return null;
      const payer = unlessPayment(before, event.object)?.seat;
      return line(
        'major',
        payer === undefined
          ? `${label(event.object)} is countered.`
          : `${who(payer)} ${verb(payer, "don't pay", "doesn't pay")}; ${label(event.object)} is countered.`,
        payer ?? null,
        [event.object],
        'CR 701.6',
      );
    }
    case 'damageDealt': {
      const target =
        event.to.kind === 'player'
          ? event.to.seat === viewer
            ? 'you'
            : 'Opponent'
          : name(event.to.id);
      return line(
        'major',
        `${name(event.source)} deals ${event.amount} ${event.combat ? 'combat ' : ''}damage to ${target}.`,
        null,
        event.to.kind === 'object' ? [event.source, event.to.id] : [event.source],
        event.combat ? 'CR 510' : 'CR 120',
      );
    }
    case 'damagePrevented': {
      // CR 615.1 (Prevention effects): "X's 3 damage to Y is prevented." Combat and noncombat
      // damage read alike; the engine emits this instead of `damageDealt` for the prevented part.
      const target =
        event.to.kind === 'player'
          ? event.to.seat === viewer
            ? 'you'
            : 'Opponent'
          : name(event.to.id);
      return line(
        'major',
        `${name(event.source)}'s ${event.amount} damage to ${target} is prevented.`,
        null,
        event.to.kind === 'object' ? [event.source, event.to.id] : [event.source],
        'CR 615',
      );
    }
    case 'damageRedirected': {
      // CR 614.9 (D-192): "SYNTHETIC Bolt's 3 damage to you is dealt to Ancient Adamantoise instead." The `damageDealt` line that follows says what was dealt.
      const recipient = (r: typeof event.from): string =>
        r.kind === 'player' ? (r.seat === viewer ? 'you' : 'Opponent') : name(r.id);
      const touched: ObjectId[] = [event.source];
      if (event.from.kind === 'object') touched.push(event.from.id);
      if (event.to.kind === 'object') touched.push(event.to.id);
      return line(
        'major',
        `${name(event.source)}'s ${event.amount} damage to ${recipient(event.from)} is dealt to ${recipient(event.to)} instead.`,
        null,
        touched,
        'CR 614.9',
      );
    }
    case 'lifeChanged':
      return line(
        'major',
        `${possessive(event.seat, viewer)} life: ${event.from} to ${event.to}.`,
        event.seat,
        [],
        'CR 119',
      );
    case 'prepared':
      // CR 722.3a, 722.3c (D-214): the permanent became prepared; its prepare spell can be cast from exile.
      return line(
        'major',
        `${label(event.object)} became prepared.`,
        null,
        [event.object, event.copy],
        'CR 722.3',
      );
    case 'energyChanged': {
      // CR 107.14, 122.1 (D-209): "You get {E}{E}", and paying {E}: "You have 2 energy counters."
      const change = event.to - event.from;
      const counters = `${Math.abs(change)} energy counter${Math.abs(change) === 1 ? '' : 's'}`;
      return line(
        'major',
        change > 0
          ? `${who(event.seat)} ${verb(event.seat, 'get', 'gets')} ${counters} (${event.to} in all).`
          : `${who(event.seat)} ${verb(event.seat, 'pay', 'pays')} ${counters} (${event.to} left).`,
        event.seat,
        [],
        'CR 107.14',
      );
    }
    case 'poisonChanged': {
      // CR 120.3b (infect), 120.3g (toxic), 122.1: "You get 2 poison counters (3 of 10)." Ten or
      // more loses the game at the next state-based action check (CR 704.5c), which has its own line.
      const gained = event.to - event.from;
      const counters = `${gained} poison counter${gained === 1 ? '' : 's'}`;
      return line(
        'major',
        gained > 0
          ? `${who(event.seat)} ${verb(event.seat, 'get', 'gets')} ${counters} (${event.to} of 10).`
          : `${possessive(event.seat, viewer)} poison counters: ${event.from} to ${event.to}.`,
        event.seat,
        [],
        'CR 122.1',
      );
    }
    case 'counterAdded': {
      // CR 714.3a, 714.3c: a lore counter on a Saga reads as the chapter the Saga is at now.
      const lore = event.counter === 'lore' ? loreCountIn(after, event.object) : null;
      if (lore !== null) {
        const counters = event.count === 1 ? 'A lore counter' : `${event.count} lore counters`;
        return line(
          'detail',
          `${counters} on ${name(event.object)} (${romanNumeral(lore)}).`,
          null,
          [event.object],
          'CR 714.3',
        );
      }
      return line(
        'detail',
        `${event.count} ${event.counter} counter${event.count === 1 ? '' : 's'} on ${name(event.object)}.`,
        null,
        [event.object],
        'CR 122',
      );
    }
    case 'counterRemoved':
      // D-145 (CR 122.1d): a permanent with a stun counter that would untap loses one instead and stays tapped.
      if (event.counter === 'stun') {
        return line(
          'detail',
          `${name(event.object)} would untap: ${event.count === 1 ? 'a stun counter is' : `${event.count} stun counters are`} removed instead, and it stays tapped.`,
          null,
          [event.object],
          'CR 122.1d',
        );
      }
      return line(
        'detail',
        `${event.count} ${event.counter} counter${event.count === 1 ? '' : 's'} removed from ${name(event.object)}.`,
        null,
        [event.object],
        'CR 122',
      );
    case 'died':
      return line('major', `${name(event.object)} dies.`, null, [event.object], 'CR 700.4');
    case 'sacrificed':
      return line(
        'major',
        `${who(event.controller)} ${verb(event.controller, 'sacrifice', 'sacrifices')} ${name(event.permanent)}.`,
        event.controller,
        [event.permanent],
        'CR 701.21',
      );
    case 'tokenCreated':
      return line(
        'major',
        `${who(event.seat)} ${verb(event.seat, 'create', 'creates')} ${withArticle(event.name)} token.`,
        event.seat,
        [event.object],
        'CR 111',
      );
    case 'abilityTriggered': {
      // CR 714.2b: a Saga's chapter ability names the chapter that was reached.
      const chapter = chapterWord(event.chapter);
      return line(
        'major',
        chapter === null
          ? `${name(event.source)} triggers.`
          : `${name(event.source)}'s ${chapter} triggers.`,
        event.seat,
        [event.source],
        after.objects[event.stackObject]?.stack?.inherent !== undefined
          ? 'CR 725.2'
          : chapter === null
            ? 'CR 603.3'
            : 'CR 714.2b',
      );
    }
    case 'abilityRemoved': {
      // CR 603.3d: a triggered ability with no legal target is removed from the stack as it is put
      // there; the source may have left the battlefield, so its name is its last-known one.
      // CR 603.3c, 700.2b: a modal one whose modes cannot be chosen (no set is legal) is removed too.
      const chapter = chapterWord(event.chapter);
      const noMode = event.reason === 'noLegalModes';
      const why = noMode ? 'has no legal mode' : 'has no legal target';
      return line(
        'major',
        chapter === null
          ? `${name(event.source)}'s ability ${why} and is removed.`
          : `${name(event.source)}'s ${chapter} ability ${why} and is removed.`,
        event.seat,
        [event.source],
        noMode ? 'CR 603.3c' : 'CR 603.3d',
      );
    }
    case 'modesChosen': {
      // CR 700.2: "You choose: Destroy target artifact and Draw a card." The modes are public (they are
      // on the stack). An automatic choice (one legal set) is a detail line that says so.
      const texts = modeTextsOf(after, event.source) ?? modeTextsOf(before, event.source);
      const chosen = joinNames(
        event.modes.map((i) => {
          const text = texts?.[i];
          return text === undefined ? `mode ${i + 1}` : modeText(text);
        }),
      );
      return line(
        event.automatic ? 'detail' : 'major',
        event.automatic
          ? `${who(event.seat)} ${verb(event.seat, 'choose', 'chooses')}: ${chosen} (the only legal choice).`
          : `${who(event.seat)} ${verb(event.seat, 'choose', 'chooses')}: ${chosen}.`,
        event.seat,
        [event.source],
        'CR 700.2',
      );
    }
    case 'permanentsChosen': {
      // CR 702.122a: "You crew X with A and B." The source is the crew ability on the stack, which
      // the name lookup resolves to the Vehicle; an automatic crew (one candidate) reads the same.
      if (event.purpose === 'crew') {
        return line(
          'major',
          `${who(event.seat)} ${verb(event.seat, 'crew', 'crews')} ${name(event.source)} with ${joinNames(event.objects.map(name))}.`,
          event.seat,
          event.objects,
          'CR 702.122a',
        );
      }
      // D-133 (CR 602.2b): "Tap two untapped artifacts you control" as a cost; each permanent's own `tapped`
      // line follows. An automatic one (no other choice) says so.
      if (event.purpose === 'tap') {
        const tapped = joinNames(event.objects.map(name));
        return line(
          'major',
          event.automatic
            ? `${who(event.seat)} must tap ${tapped} to pay for ${label(event.source)}: no other choice.`
            : `${who(event.seat)} ${verb(event.seat, 'tap', 'taps')} ${tapped} to pay for ${label(event.source)}.`,
          event.seat,
          event.objects,
          'CR 602.2b',
        );
      }
      // D-145 (CR 701.14): "Each of those tokens fights a different one of those creatures": the creature it fights.
      if (event.purpose === 'fight') {
        const fought = joinNames(event.objects.map(name));
        const fighter = event.subject === undefined ? 'a creature' : name(event.subject);
        return line(
          event.automatic ? 'detail' : 'major',
          event.automatic
            ? `${fighter} must fight ${fought} for ${label(event.source)}: no other choice.`
            : `${who(event.seat)} ${verb(event.seat, 'choose', 'chooses')} ${fought} for ${fighter} to fight (${label(event.source)}).`,
          event.seat,
          event.objects,
          'CR 701.14',
        );
      }
      // D-139 (CR 602.2b): "Return an artifact you control to its owner's hand" as a cost; the move's own line follows.
      if (event.purpose === 'bounce') {
        const returned = joinNames(event.objects.map(name));
        return line(
          'major',
          event.automatic
            ? `${who(event.seat)} must return ${returned} to pay for ${label(event.source)}: no other choice.`
            : `${who(event.seat)} ${verb(event.seat, 'return', 'returns')} ${returned} to pay for ${label(event.source)}.`,
          event.seat,
          event.objects,
          'CR 602.2b',
        );
      }
      // An effect that moves a permanent you choose ("return a land you control to its owner's
      // hand", D-096): the event does not say where it goes, the move's own line does.
      // D-139 (CR 701.26a): "you may tap any number of untapped Myr you control": the choice is what is tapped.
      if (event.purpose === 'effect' && tapsChosen(before, event.source)) {
        const tapped = joinNames(event.objects.map(name));
        return line(
          'major',
          event.objects.length === 0
            ? `${who(event.seat)} ${verb(event.seat, 'choose', 'chooses')} to tap nothing for ${label(event.source)}.`
            : `${who(event.seat)} ${verb(event.seat, 'tap', 'taps')} ${tapped} for ${label(event.source)}.`,
          event.seat,
          event.objects,
          'CR 701.26a',
        );
      }
      if (event.purpose === 'effect') {
        return line(
          event.automatic ? 'detail' : 'major',
          event.automatic
            ? `${who(event.seat)} must choose ${event.objects.map(name).join(', ')} for ${label(event.source)}: no other choice.`
            : `${who(event.seat)} ${verb(event.seat, 'choose', 'chooses')} ${event.objects.map(name).join(', ')} for ${label(event.source)}.`,
          event.seat,
          event.objects,
          'CR 608.2d',
        );
      }
      // A cost being paid (an additional cost of a spell, CR 601.2h, D-095, or a cost of an ability,
      // CR 602.2b) is asked inside the casting transaction; an effect's sacrifice is not.
      // D-135: "sacrifice any number of ...", and the player chose none.
      if (event.purpose === 'sacrifice' && event.objects.length === 0) {
        return line(
          'detail',
          `${who(event.seat)} ${verb(event.seat, 'choose', 'chooses')} to sacrifice nothing for ${label(event.source)}.`,
          event.seat,
          [],
          'CR 608.2d',
        );
      }
      const costOf = costSource(before, event.source);
      const sacrificed = event.objects.map(name).join(', ');
      const why =
        costOf === 'spell'
          ? `as an additional cost to cast ${label(event.source)}`
          : `for ${label(event.source)}`;
      return line(
        'detail',
        event.automatic
          ? `${who(event.seat)} must sacrifice ${sacrificed} ${why}: no other choice.`
          : `${who(event.seat)} ${verb(event.seat, 'choose', 'chooses')} ${sacrificed} to sacrifice ${why}.`,
        event.seat,
        event.objects,
        costOf === 'spell' ? 'CR 601.2h' : 'CR 608.2d',
      );
    }
    case 'optionalAnswered': {
      // Suspend's "cast it now?", Madness's "cast it for its madness cost?" and Miracle's "cast it for its miracle cost?" (D-128, D-274).
      const later = castNowAnswerLine(before, event, viewer);
      if (later !== null) return line('major', later.text, later.seat, later.objects, later.rule);
      // Extort's "you may pay {W/B}" and Cascade's "cast it without paying its mana cost" (D-120).
      const keyword = keywordAnswerLine(before, after, event, viewer);
      if (keyword !== null) {
        return line('major', keyword.text, keyword.seat, keyword.objects, keyword.rule);
      }
      // "[do something] unless [that player] pays" (D-111): the payer's answer, then the
      // controller's "you may" for an optional effect.
      const unlessLine =
        unlessAnswerLine(before, event, viewer) ?? mayEffectLine(before, event, viewer);
      if (unlessLine !== null) {
        return line('major', unlessLine.text, unlessLine.seat, [], unlessLine.rule);
      }
      // Ward (CR 702.21a) and "counter target spell unless its controller pays" (D-092): "You pay
      // {2} for ward." / "You pay {3} so X is not countered." / "You don't pay; X is countered."
      // The payment of mana is the next decision; a cancel there is worded by the `countered` line.
      const unless = unlessQuestion(before, event.source);
      if (unless !== null) {
        const subject = unless.subject === undefined ? 'it' : label(unless.subject);
        // "You pay {2}", "You discard a card" (Ward—Discard a card, D-095): the verbs come with the cost.
        const does = unlessCostPhrase(unless.cost ?? [], event.seat !== viewer);
        const pays =
          unless.purpose === 'ward'
            ? `${who(event.seat)} ${does} for ward.`
            : `${who(event.seat)} ${does} so ${subject} is not countered.`;
        return line(
          'major',
          event.accepted
            ? pays
            : `${who(event.seat)} ${verb(event.seat, "don't pay", "doesn't pay")}; ${subject} is countered.`,
          event.seat,
          unless.subject === undefined ? [] : [unless.subject],
          unless.purpose === 'ward' ? 'CR 702.21a' : 'CR 701.6',
        );
      }
      // "May search" (CR 608.2d, 701.23): asked of the searching player, who may not be the
      // controller of the spell. Accepting is followed by the `librarySearched` line.
      const asking = before.pending;
      if (
        asking?.kind === 'confirmOptional' &&
        asking.purpose === 'search' &&
        asking.source === event.source
      ) {
        const own = event.seat === viewer ? 'your' : 'their';
        return line(
          'major',
          event.accepted
            ? `${who(event.seat)} ${verb(event.seat, 'choose', 'chooses')} to search ${own} library (${asking.sourceName}).`
            : `${who(event.seat)} ${verb(event.seat, 'decline', 'declines')} to search ${own} library (${asking.sourceName}).`,
          event.seat,
          [],
          'CR 701.23',
        );
      }
      // "You may pay ... or it enters tapped" (CR 614.12): the question is about an object that is
      // still in the hand or on the stack, so the line is worded from the answer and the cost the
      // decision carried, never by resolving `event.source`.
      const asked = before.pending;
      const cost =
        asked?.kind === 'confirmOptional' && asked.source === event.source ? asked.cost : undefined;
      if (asked?.kind === 'confirmOptional' && cost !== undefined) {
        return line(
          'major',
          event.accepted
            ? `${who(event.seat)} ${verb(event.seat, 'pay', 'pays')} ${costText(cost)}.`
            : `${who(event.seat)} ${verb(event.seat, "don't pay", "doesn't pay")}; ${asked.sourceName} enters tapped.`,
          event.seat,
          [],
          'CR 614.12',
        );
      }
      return line(
        'major',
        `${who(event.seat)} ${verb(event.seat, 'choose', 'chooses')} ${event.accepted ? 'to' : 'not to'} use ${name(event.source)}'s ability.`,
        event.seat,
        [],
        'CR 603.5',
      );
    }
    case 'replacementChosen':
      // CR 616.1 (D-191): "You apply "Prevent the next 3 damage that would be dealt to you this turn" first (SYNTHETIC Backdraft)." The words are the engine's.
      return line(
        'major',
        `${who(event.seat)} ${verb(event.seat, 'apply', 'applies')} "${event.text}" first (${label(event.source)}).`,
        event.seat,
        [],
        'CR 616.1',
      );
    case 'optionChosen': {
      // CR 614.12a (D-100): "You choose Elf for SYNTHETIC Banner." The source is still in the hand or on
      // the stack (or is the spell or ability that makes a token), so its name comes from the question.
      const asked = before.pending;
      if (event.purpose === 'attackTarget') {
        // CR 508.7 (D-139): "You choose that Grizzly Bears attacks Opponent (SYNTHETIC Crooked Signpost)."
        const attacker = asked?.kind === 'chooseOption' ? asked.attacker : undefined;
        const seat = /^player:(\d+)$/.exec(event.option)?.[1];
        const object = /^permanent:(.+)$/.exec(event.option)?.[1];
        const target =
          seat !== undefined
            ? Number(seat) === viewer
              ? 'you'
              : 'Opponent'
            : object === undefined
              ? 'a permanent'
              : name(object as ObjectId);
        const attacking = attacker === undefined ? 'the creature' : name(attacker);
        return line(
          'major',
          `${who(event.seat)} ${verb(event.seat, 'choose', 'chooses')} that ${attacking} attacks ${target} (${label(event.source)}).`,
          event.seat,
          attacker === undefined ? [] : [attacker],
          'CR 508.7',
        );
      }
      // CR 701.38a (D-194): "You vote for profit (Emissary Green)." / "Opponent votes for security (Emissary Green)." A vote is public.
      if (event.purpose === 'vote') {
        return line(
          'major',
          `${who(event.seat)} ${verb(event.seat, 'vote', 'votes')} for ${event.option} (${label(event.source)}).`,
          event.seat,
          [],
          'CR 701.38a',
        );
      }
      // CR 702.136a (D-185): "You choose a +1/+1 counter for Riot Goblin (riot)." or "... haste ...".
      if (event.purpose === 'riot') {
        const subject =
          asked?.kind === 'chooseOption' && asked.source === event.source
            ? asked.sourceName
            : label(event.source);
        return line(
          'major',
          `${who(event.seat)} ${verb(event.seat, 'choose', 'chooses')} ${riotAnswerText(event.option)} for ${subject} (riot).`,
          event.seat,
          [],
          'CR 702.136a',
        );
      }
      // CR 608.2d (D-175): "You choose to create a Food token (Tireless Provisioner)." The instruction is worded as the card words it.
      if (event.purpose === 'effect') {
        return line(
          'major',
          `${who(event.seat)} ${verb(event.seat, 'choose', 'chooses')} to ${event.option} (${label(event.source)}).`,
          event.seat,
          [],
          'CR 608.2d',
        );
      }
      const subject =
        asked?.kind === 'chooseOption' && asked.source === event.source
          ? asked.sourceName
          : label(event.source);
      return line(
        'major',
        `${who(event.seat)} ${verb(event.seat, 'choose', 'chooses')} ${optionText(event.purpose, event.option)} for ${subject}.`,
        event.seat,
        [],
        'CR 614.12a',
      );
    }
    case 'becameTarget':
      // Minor: every targeted spell and ability makes one. It matters for ward, which reads it.
      return line(
        'detail',
        `${who(event.seat)} ${verb(event.seat, 'target', 'targets')} ${name(event.object)} with ${label(event.by)}.`,
        event.seat,
        [event.object, event.by],
        'CR 601.2c',
      );
    case 'legendRule':
      return line(
        'major',
        `${who(event.seat)} ${verb(event.seat, 'keep', 'keeps')} ${event.name} (legend rule).`,
        event.seat,
        [event.kept],
        'CR 704.5j',
      );
    case 'discarded': {
      // A discard paid as a cost says whose cost it is: "as an additional cost to cast X" (CR 601.2h,
      // D-095) or "to pay for X's ability" (CR 602.2b). The casting transaction exists in `before`
      // for exactly those; every other discard (an effect, the cleanup step, Ward's) has none.
      const going = before.casting ?? null;
      const paying = going !== null && going.seat === event.seat ? going : null;
      const forSpell = paying !== null && paying.activation === null;
      const forAbility = paying !== null && paying.activation !== null;
      const why =
        paying === null
          ? ''
          : forSpell
            ? ` as an additional cost to cast ${label(paying.object)}`
            : ` to pay for ${label(paying.object)}`;
      return line(
        'major',
        `${who(event.seat)} ${verb(event.seat, 'discard', 'discards')} ${name(event.object)}${why}.`,
        event.seat,
        [event.object],
        forSpell ? 'CR 601.2h' : forAbility ? 'CR 602.2b' : 'CR 701.9',
      );
    }
    case 'cycled':
      // CR 702.29c (D-179): the `discarded` line before it says what was discarded; this says why it matters to "when you cycle this card".
      return line(
        'detail',
        `${who(event.seat)} ${verb(event.seat, 'cycle', 'cycles')} ${name(event.object)}.`,
        event.seat,
        [event.object],
        'CR 702.29c',
      );
    case 'attached': {
      // The controller of the attachment attaches it (CR 701.3a); an Aura that resolves is attached
      // by the player who cast it.
      const attacher = after.objects[event.object]?.controller;
      const what = `${name(event.object)} to ${name(event.to)}`;
      return line(
        'major',
        attacher === undefined
          ? `${name(event.object)} is attached to ${name(event.to)}.`
          : `${who(attacher)} ${verb(attacher, 'attach', 'attaches')} ${what}.`,
        attacher ?? null,
        [event.object, event.to],
        'CR 701.3',
      );
    }
    case 'unattached':
      // `from` may have left the battlefield: `name` falls back to last-known information. An
      // Equipment that moves emits `unattached` (replaced) and then `attached` (CR 701.3c).
      return event.reason === 'replaced'
        ? line(
            'detail',
            `${name(event.object)} moves off ${name(event.from)}.`,
            null,
            [event.object, event.from],
            'CR 701.3c',
          )
        : line(
            'detail',
            `${name(event.object)} becomes unattached.`,
            null,
            [event.object],
            event.reason === 'illegal' ? 'CR 704.5n' : 'CR 701.3d',
          );
    case 'librarySearched':
      // The count is the searcher's own business: the other side only learns that a search
      // happened, and names reach the log only through `cardsRevealed` (CR 701.23).
      return line(
        'major',
        event.seat === viewer
          ? `You search your library and find ${event.found === 0 ? 'nothing' : `${event.found} card${event.found === 1 ? '' : 's'}`}.`
          : 'Opponent searches their library.',
        event.seat,
        [],
        'CR 701.23',
      );
    case 'scried': {
      // Only the counts are public: which cards stayed on top stays with the player (CR 701.22a).
      const n = event.top + event.bottom;
      const where = [
        ...(event.top > 0 ? [`${event.top} on top`] : []),
        ...(event.bottom > 0 ? [`${event.bottom} on the bottom`] : []),
      ];
      return line(
        'major',
        n === 0
          ? `${who(event.seat)} ${verb(event.seat, 'scry', 'scries')} an empty library.`
          : `${who(event.seat)} ${verb(event.seat, 'scry', 'scries')} ${n}: ${where.join(', ')}.`,
        event.seat,
        [],
        'CR 701.22',
      );
    }
    case 'surveiled': {
      // The cards that go to the graveyard are public and named by their own zone-change lines.
      const n = event.top + event.toGraveyard;
      const where = [
        ...(event.top > 0 ? [`${event.top} on top`] : []),
        ...(event.toGraveyard > 0 ? [`${event.toGraveyard} into the graveyard`] : []),
      ];
      return line(
        'major',
        n === 0
          ? `${who(event.seat)} ${verb(event.seat, 'surveil', 'surveils')} an empty library.`
          : `${who(event.seat)} ${verb(event.seat, 'surveil', 'surveils')} ${n}: ${where.join(', ')}.`,
        event.seat,
        [],
        'CR 701.25',
      );
    }
    case 'cardsRevealed':
      return line(
        'major',
        `${who(event.seat)} ${verb(event.seat, 'reveal', 'reveals')} ${joinNames(event.names)}.`,
        event.seat,
        [],
        'CR 701.20',
      );
    case 'commanderMovedToCommandZone':
      return line(
        'major',
        `${cardName(after, event.card) ?? 'A commander'} returns to the command zone.`,
        null,
        [],
        'CR 903.9',
      );
    case 'playerLost':
      return line(
        'major',
        `${who(event.seat)} ${verb(event.seat, 'lose', 'loses')} the game (${event.reason}).`,
        event.seat,
        [],
        'CR 104.3',
      );
    case 'gameEnded':
      return line(
        'major',
        event.result === 'draw'
          ? 'The game is a draw.'
          : `${event.winner === null ? 'Nobody' : who(event.winner)} win${event.winner === viewer || event.winner === null ? '' : 's'}.`,
        null,
        [],
        'CR 104',
      );
    case 'conceded':
      return line(
        'major',
        `${who(event.seat)} ${verb(event.seat, 'concede', 'concedes')}.`,
        event.seat,
        [],
        'CR 104.3a',
      );
    case 'regenerated':
      // CR 701.19a (Regenerate, D-120): the shield replaced a destruction.
      return line(
        'major',
        regeneratedText(before, event.object, name(event.object)),
        null,
        [event.object],
        'CR 701.19a',
      );
    case 'cardsBottomed':
      // CR 702.85a (Cascade): only the count is told, the order is random and hidden.
      return line(
        'detail',
        bottomedText(event.seat, event.count, viewer),
        event.seat,
        [],
        'CR 702.85a',
      );
    // D-128: the cast-later family.
    case 'suspended':
      return line(
        'major',
        `${who(event.seat)} suspended ${name(event.object)} with ${timeCounters(event.count)}.`,
        event.seat,
        [event.object],
        'CR 702.62a',
      );
    case 'foretold': {
      // A foretold card is face down: the other player's line names no card (CR 702.143a).
      const told = foretoldLine(after, event, viewer);
      return line('major', told.text, told.seat, told.objects, told.rule);
    }
    case 'miracleRevealed':
      return line(
        'major',
        `${name(event.object)} was revealed with miracle.`,
        event.seat,
        [event.object],
        'CR 702.94a',
      );
    case 'madnessExiled':
      return line(
        'major',
        `${name(event.object)} was exiled with madness.`,
        event.seat,
        [event.object],
        'CR 702.35a',
      );
    case 'spellCopied':
      // CR 707.10 (D-129): a copy of a spell, not a cast, so no "cast" line and no "whenever you cast".
      return line(
        'major',
        `${who(event.seat)} ${verb(event.seat, 'copy', 'copies')} ${name(event.original)}: the copy is put on the stack.`,
        event.seat,
        [event.copy],
        'CR 707.10',
      );
    case 'targetChanged': {
      // CR 115.7a (D-181): the one target of a spell or ability on the stack was changed to another legal target.
      const to =
        event.to.kind === 'object'
          ? name(event.to.id)
          : event.to.seat === viewer
            ? 'you'
            : 'Opponent';
      return line(
        'major',
        `${who(event.seat)} ${verb(event.seat, 'change', 'changes')} the target of ${label(event.object)} to ${to}.`,
        event.seat,
        event.to.kind === 'object' ? [event.object, event.to.id] : [event.object],
        'CR 115.7a',
      );
    }
    case 'milled':
      // CR 701.17a (D-131): the top cards of a library went to its owner's graveyard.
      return line(
        'major',
        `${who(event.seat)} ${verb(event.seat, 'mill', 'mills')} ${event.objects.length === 1 ? 'a card' : `${event.objects.length} cards`}.`,
        event.seat,
        event.objects,
        'CR 701.17',
      );
    case 'monarchChanged':
      // CR 725.3, 725.4 (D-127): the designation moved; `to` is null when no player could take it over.
      return line(
        'major',
        event.to === null
          ? 'There is no monarch.'
          : `${who(event.to)} ${verb(event.to, 'become', 'becomes')} the monarch.`,
        event.to,
        [],
        'CR 725.3',
      );
    case 'topCardsLooked':
      // D-139: only the count is public; the cards are seen by `seat` alone.
      return line(
        'detail',
        `${who(event.seat)} ${verb(event.seat, 'look', 'looks')} at the top ${event.count === 1 ? 'card' : `${event.count} cards`} of ${verb(event.seat, 'your', 'their')} library.`,
        event.seat,
      );
    case 'fought':
      // D-145 (CR 701.14): each creature deals damage equal to its power to the other.
      return line(
        'major',
        `${name(event.objects[0])} and ${name(event.objects[1])} fight.`,
        null,
        [...event.objects],
        'CR 701.14',
      );
    case 'lifeGained':
      // D-149 (CR 119.9): the `lifeChanged` event that comes with it is the line; this one is for the triggers.
      return null;
    case 'proliferated':
      // CR 701.34a (D-149): the counters added follow as `counterAdded` events.
      return line(
        'major',
        `${who(event.seat)} ${verb(event.seat, 'proliferate', 'proliferates')}.`,
        event.seat,
        [...event.objects],
        'CR 701.34',
      );
    case 'tappedForMana':
      // CR 106.12 (D-189): the `tapped` event that comes with it is the line; this one is for the triggers.
      return null;
    case 'controlChanged':
      // CR 613.1b (D-189): a control-changing effect began or ended and the controller of the permanent is not who it was.
      return line(
        'major',
        `${who(event.to)} ${verb(event.to, 'gain', 'gains')} control of ${label(event.object)}.`,
        event.to,
        [event.object],
        'CR 613.1b',
      );
    case 'ringTempted': {
      // CR 701.54a, 701.54c, 701.54d (D-196): the Ring tempts a player, who chooses a creature they control as their Ring-bearer (when they control none, nothing
      // is chosen and the Ring has still tempted them).
      const tempted = `The Ring tempts ${event.seat === viewer ? 'you' : 'the opponent'}`;
      return line(
        'major',
        event.bearer === null
          ? `${tempted} (${event.times === 1 ? 'the first time' : `time ${event.times}`}). ${who(event.seat)} ${verb(event.seat, 'control', 'controls')} no creature to be ${possessive(event.seat, viewer).toLowerCase()} Ring-bearer.`
          : `${tempted} (${event.times === 1 ? 'the first time' : `time ${event.times}`}). ${label(event.bearer)} becomes ${possessive(event.seat, viewer).toLowerCase()} Ring-bearer.`,
        event.seat,
        event.bearer === null ? [] : [event.bearer],
        'CR 701.54a',
      );
    }
    case 'ringBearerLost':
      // CR 701.54a (D-196): another player gained control of it.
      return line(
        'major',
        `${label(event.object)} is no longer ${possessive(event.seat, viewer).toLowerCase()} Ring-bearer.`,
        event.seat,
        [event.object],
        'CR 701.54a',
      );
    case 'creaturesPaired':
      // CR 702.95a, 702.95b (D-286): two creatures became paired.
      return line(
        'major',
        `${who(event.by)} ${verb(event.by, 'pair', 'pairs')} ${label(event.a)} with ${label(event.b)}.`,
        event.by,
        [event.a, event.b],
        'CR 702.95a',
      );
    case 'creaturesUnpaired': {
      // CR 702.95e (D-286): a pair ended; `a` is still on the battlefield, and `b` is who it was paired with.
      const reason =
        event.why === 'left'
          ? 'its partner left the battlefield'
          : event.why === 'control'
            ? 'control of one of the two changed'
            : 'one of the two stopped being a creature';
      const partner = event.why === 'left' ? [] : [event.b];
      return line(
        'major',
        `${label(event.a)} is no longer paired: ${reason}.`,
        null,
        [event.a, ...partner],
        'CR 702.95e',
      );
    }
    case 'emblemCreated':
      // CR 114.1, 114.2 (D-201): the player got an emblem, an object in their command zone.
      return line(
        'major',
        `${who(event.seat)} ${verb(event.seat, 'get', 'gets')} an emblem.`,
        event.seat,
        [event.object],
        'CR 114.1',
      );
    case 'citysBlessingGained':
      // CR 702.131b (D-264): Ascend gave the player the designation, for the rest of the game.
      return line(
        'major',
        `${who(event.seat)} ${verb(event.seat, 'get', 'gets')} the city's blessing.`,
        event.seat,
        [],
        'CR 702.131b',
      );
    case 'enteredAsCopy':
      // CR 707.9 (D-151): "As this enters, you may have it become a copy of ...".
      return line(
        'major',
        `${label(event.object)} entered as a copy of ${label(event.copied)}.`,
        null,
        [event.object, event.copied],
        'CR 707.9',
      );
    case 'manifested': {
      // CR 701.40a (D-962, D-968): the top card of a library was put onto the battlefield face down; no card is named (CR 708.5).
      const mine = event.seat === viewer;
      const library =
        event.from === viewer ? 'your library' : event.from === event.seat ? 'their library' : "the opponent's library";
      return line(
        'major',
        manifestedLine(who(event.seat) as 'You' | 'Opponent', mine, library),
        event.seat,
        [event.object],
        'CR 701.40a',
      );
    }
    case 'turnedFaceUp':
      // CR 116.2b, 701.40b, 708.8 (D-963, D-968): a special action; the card is public from now on, so it is named.
      return line(
        'major',
        turnedUpLine(who(event.seat) as 'You' | 'Opponent', event.seat === viewer, name(event.object)),
        event.seat,
        [event.object],
        'CR 701.40b',
      );
    case 'melded':
      // CR 701.42a, 712.14c (D-277): two cards were exiled and became one melded permanent.
      return line(
        'major',
        `${cardName(after, event.cards[0]) ?? 'A card'} and ${cardName(after, event.cards[1]) ?? 'a card'} meld into ${label(event.permanent)}.`,
        null,
        [event.permanent],
        'CR 701.42a',
      );
    case 'meldFailed':
      // CR 701.42b, 701.42c (D-277): what could not be melded stays where it is.
      return line(
        'major',
        `They could not be melded and stay where they are: ${event.reason}.`,
        null,
        event.objects,
        'CR 701.42c',
      );
    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}

/**
 * ", kicked" for a spell cast with its kicker cost paid once, ", kicked 3 times" for Multikicker
 * (CR 702.33c, 702.33d): `kicks` is at least 1 when present and `kicked` is true then too.
 */
function kickedText(event: Extract<GameEvent, { kind: 'spellCast' }>): string {
  if (event.kicks !== undefined && event.kicks > 1) return `, kicked ${event.kicks} times`;
  return event.kicked === true || event.kicks !== undefined ? ', kicked' : '';
}

/** A card that went from a hand into a library: only the count may reach the log. */
function handToLibrary(event: GameEvent): event is Extract<GameEvent, { kind: 'zoneChanged' }> {
  return event.kind === 'zoneChanged' && event.fromZone === 'hand' && event.toZone === 'library';
}

/**
 * The line for a run of cards that went from a hand into a library (Brainstorm's "put two cards
 * from your hand on top of your library", a mulligan's cards on the bottom). The hand is hidden, so
 * the line says how many and where, never which: whether they are on top or on the bottom is read
 * from the library after the action. A card that was a token or has no library owner is skipped.
 */
function describeHandToLibrary(
  run: readonly Extract<GameEvent, { kind: 'zoneChanged' }>[],
  after: GameState,
  viewer: SeatId,
): Described | null {
  const first = run[0];
  const seat = first === undefined ? undefined : after.objects[first.to]?.zoneOwner;
  if (first === undefined || seat === undefined || seat === null) return null;
  const library = after.seats[seat]?.library ?? [];
  const moved = run.map((e) => e.to);
  const onTop = moved.every((id) => library.slice(0, moved.length).includes(id));
  const onBottom = moved.every((id) => library.slice(library.length - moved.length).includes(id));
  const where = onTop ? ' on top of' : onBottom ? ' on the bottom of' : ' into';
  const cards = `${moved.length} card${moved.length === 1 ? '' : 's'}`;
  const whose = seat === viewer ? 'your' : 'their';
  return {
    level: 'major',
    text: `${seatName(seat, viewer)} ${seat === viewer ? 'put' : 'puts'} ${cards}${where} ${whose} library.`,
    seat,
    objects: [],
    rule: moved.length > 1 ? 'CR 401.4' : 'CR 401',
  };
}

/**
 * Life paid for a mana ability: its {T} cost is paid, then the life (CR 605.3b, 119.4: "{T}, Pay 1
 * life: Add one mana of any color"), so a life loss right after a permanent taps reads as a payment.
 * Damage from a pain land is not a `lifeChanged` right after `tapped` (a damage event comes between),
 * so it keeps its own line. Null for any other event.
 */
function manaLifePayment(
  event: GameEvent,
  previous: GameEvent | undefined,
  viewer: SeatId,
): Described | null {
  // D-189: the event `tappedForMana` follows `tapped` for the same permanent.
  if (
    event.kind !== 'lifeChanged' ||
    (previous?.kind !== 'tapped' && previous?.kind !== 'tappedForMana') ||
    event.to >= event.from
  ) {
    return null;
  }
  const verb = event.seat === viewer ? 'pay' : 'pays';
  return {
    level: 'major',
    text: `${seatName(event.seat, viewer)} ${verb} ${event.from - event.to} life.`,
    seat: event.seat,
    objects: [previous.object],
    rule: 'CR 119.4',
  };
}

/**
 * The answer to the untap step's question (CR 502.3, D-125): "You left X tapped." for the permanents that were
 * offered and not named in the answer; nothing when they all untap. The `untapped` events of the others
 * follow as the ordinary lines. The question is `before.pending` and the answer the action, so no event is read.
 */
function untapChoiceLine(
  before: GameState,
  action: Action | undefined,
  viewer: SeatId,
): Described | null {
  const asked = before.pending;
  if (
    action?.kind !== 'choosePermanents' ||
    asked?.kind !== 'choosePermanent' ||
    asked.purpose !== 'untap'
  ) {
    return null;
  }
  const left = asked.legal.filter((id) => !action.objects.includes(id));
  if (left.length === 0) return null;
  const names = left.map((id) => nameIn(before, id) ?? 'a permanent');
  return {
    level: 'major',
    text: `${seatName(asked.seat, viewer)} left ${joinNames(names)} tapped.`,
    seat: asked.seat,
    objects: left,
    rule: 'CR 502.3',
  };
}

/**
 * The log lines of the events of one action, in order. Like `describeEvent` for each event, except
 * that consecutive moves from a hand to a library become one line that names no card.
 */
/**
 * The object that resolved in this action (CR 608), or null. A spell leaves the stack for another zone
 * (a permanent spell has its own `resolved` line); an ability just ceases to exist. A countered or fizzled
 * object did not resolve, and an object still on the stack (a resolution waiting for an answer) has not yet.
 */
function resolvedTop(
  events: readonly GameEvent[],
  before: GameState,
  after: GameState,
): ObjectId | null {
  // Fake states in tests may lack the stack: nothing resolves then.
  const stackBefore = before.stack ?? [];
  const top = stackBefore[stackBefore.length - 1];
  if (top === undefined) return null;
  const named = events.some(
    (e) =>
      (e.kind === 'resolved' || e.kind === 'countered' || e.kind === 'fizzled') && e.object === top,
  );
  if (named) return null;
  if (isAbilityObject(before, top)) return after.stack.includes(top) ? null : top;
  const left = events.some(
    (e) => e.kind === 'zoneChanged' && e.from === top && e.fromZone === 'stack',
  );
  return left ? top : null;
}

/** "Wrath of God resolves." or "Serra Angel's ability resolves.", on the controller's side of the log. */
function resolvesLine(
  id: ObjectId,
  before: GameState,
  after: GameState,
  major: boolean,
): Described {
  const object = before.objects[id];
  const inherent = object?.stack?.inherent;
  const base = nameIn(after, id) ?? nameIn(before, id) ?? 'a card';
  const what =
    inherent !== undefined
      ? inherentNameOf(inherent)
      : object?.stack?.kind === 'ability'
        ? `${base}'s ability`
        : base;
  return {
    level: major ? 'major' : 'detail',
    text: `${what} resolves.`,
    seat: object?.controller ?? null,
    objects: [id],
    rule: 'CR 608',
  };
}

export function describeEvents(
  events: readonly GameEvent[],
  before: GameState,
  after: GameState,
  viewer: SeatId,
  action?: Action,
): Described[] {
  const out: Described[] = [];
  // Backing out of the payment of an "unless that player pays" cost ("do not pay") emits no event
  // of its own: the action says it.
  const cancelled = unlessCancelLine(before, action, viewer);
  if (cancelled !== null) {
    out.push({
      level: 'major',
      text: cancelled.text,
      seat: cancelled.seat,
      objects: [],
      rule: cancelled.rule,
    });
  }
  const stayed = untapChoiceLine(before, action, viewer);
  if (stayed !== null) out.push(stayed);
  // Convoke, Improvise and Delve (D-120): what was tapped or exiled is one line, not one per object.
  const paid = payOptionsPaid(before, action);
  const payment = payOptionsLine(before, action, viewer, (id) => nameIn(before, id) ?? 'a card');
  if (payment !== null) {
    out.push({ level: 'major', ...payment });
  }
  // Backing out of the payment of "you may pay {W/B}" is "do not pay": no event says so either.
  const notPaying = mayPayCancelLine(before, action, viewer);
  if (notPaying !== null) out.push({ level: 'major', ...notPaying });
  // Issue 105: the spell or ability that resolved in this action gets a line of its own, ahead of what it did.
  const resolving = resolvedTop(events, before, after);
  let leadAt = -1;
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    if (event === undefined || isPayOptionsEvent(event, paid)) continue;
    if (resolving !== null && leadAt < 0 && event.kind !== 'priorityPassed') leadAt = out.length;
    if (handToLibrary(event)) {
      const run = [event];
      for (
        let next = events[i + 1];
        next !== undefined && handToLibrary(next);
        next = events[i + 1]
      ) {
        run.push(next);
        i += 1;
      }
      const described = describeHandToLibrary(run, after, viewer);
      if (described !== null) out.push(described);
      continue;
    }
    const described =
      manaLifePayment(event, events[i - 1], viewer) ?? describeEvent(event, before, after, viewer);
    if (described !== null) out.push(described);
  }
  if (resolving !== null) {
    const at = leadAt < 0 ? out.length : leadAt;
    // Quiet unless what it did is in the log: an ability that changed nothing visible is detail.
    const showed = out.slice(at).some((d) => d.level === 'major');
    out.splice(at, 0, resolvesLine(resolving, before, after, showed));
  }
  return out;
}
