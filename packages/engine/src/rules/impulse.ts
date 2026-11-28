/**
 * "Exile the top card of your library. You may play that card this turn." (D-151): the `exileTop` and `mayPlay` effects.
 *
 * `exileTop` puts the top cards of the controller's library into exile, face up, one after the other (CR 701.13 Exile); they are what `moved`
 * names afterwards. `mayPlay` gives the controller a `playPermission` for each card of `moved` that is in exile (CR 601.2, 305.1, 611.2a): a continuous
 * effect that names the card as it is (a card that leaves exile is a new object, CR 400.7) and lasts until the moment `until` says. What a player may
 * do with the permission is decided in `rules/legality.ts` (`mayPlayFromExile`): cast it at the timing of its type, paying its ordinary cost, or
 * play it when it is a land (the land drop counted, CR 305.2).
 */
import type { Amount, Effect, PlayUntil } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import { allocateTimestamp, getSeat, opponentsOf, patchObject } from '../state/ops';
import type {
  ChosenTarget,
  ContinuousEffect,
  DelayedTrigger,
  EffectEnd,
  GameState,
  ResolutionContext,
} from '../state/types';
import { pickRandom } from './attack-random-opponent';
import { derive } from './derive';
import { amountOf, moveInstructions, moving } from './effect-support';
import { matchesFilter, resolveObjects, resolvePlayers, type SelectContext } from './select';
import { done, type StepOutcome } from './step-outcome';

/** The steps of a turn that come before its end step (CR 500.1): "your next end step" is this turn's while one of them is current. */
const BEFORE_END: readonly string[] = [
  'untap',
  'upkeep',
  'draw',
  'precombatMain',
  'beginningOfCombat',
  'declareAttackers',
  'declareBlockers',
  'firstStrikeDamage',
  'combatDamage',
  'endOfCombat',
  'postcombatMain',
];

/** When a permission that lasts until `until` ends, for `seat` as it is created now. */
export function playEnd(state: GameState, seat: SeatId, until: PlayUntil): EffectEnd {
  if (until === 'endOfTurn') return 'endOfTurn';
  // D-187: "for as long as they remain exiled": nothing ends it but the card leaving exile, which makes it a new object (CR 400.7).
  // Furious Rise: no end of its own either; the next card the source exiles with `exileTop` `linked` ends it (`runExileTop`).
  if (until === 'whileExiled' || until === 'untilSourceExilesAnother') return 'permanent';
  const taken = getSeat(state, seat).turnsTaken;
  // CR 500.1: "the end of your next turn" is the turn of the controller that comes after this moment: this turn is not it, even when it is theirs.
  if (until === 'endOfYourNextTurn') return { kind: 'turnEnd', seat, turnsTaken: taken + 1 };
  const thisTurn = state.turn.activeSeat === seat && BEFORE_END.includes(state.turn.step);
  return { kind: 'endStep', seat, turnsTaken: thisTurn ? taken : taken + 1 };
}

export function runExileTop(
  state: GameState,
  res: ResolutionContext,
  effect: Extract<Effect, { kind: 'exileTop' }>,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  const n = amountOf(state, effect.count, ctx, []);
  // D-187: "the top two cards of target opponent's library": the library of the one player the selector names, a target that is gone (or no longer
  // legal) exiles nothing (CR 608.2b).
  // Issue 279 (Etali, Primal Storm): "the top card of each player's library": every player the selector names (`eachPlayer`), in the order it gives, has their own top cards exiled.
  // The Ruinous Powers (CR 101.4, 701.13): "Choose an opponent at random": one opponent still in the game, picked by the seeded generator; the choice is made even when the library is empty.
  let drawn = state;
  let owners: readonly SeatId[];
  if (effect.randomOpponent === true) {
    const opponents = opponentsOf(state, res.controller);
    if (opponents.length === 0) return moving(state, []);
    const [one, rng] = pickRandom(opponents, state.rng);
    drawn = { ...state, rng };
    owners = [one];
  } else {
    owners =
      effect.from === undefined
        ? [res.controller]
        : resolvePlayers(state, effect.from, ctx, targets);
  }
  if (owners.length === 0) return moving(state, []);
  // CR 401.1, 701.13 (Arvinox, the Mind Flail): "the bottom card of each opponent's library": the last cards of each library (the library lists its top card first), for each owner in turn.
  const top = owners.flatMap((owner) => {
    const library = getSeat(state, owner).library;
    const count = Math.max(0, n);
    return effect.bottom === true
      ? library.slice(Math.max(0, library.length - count))
      : library.slice(0, count);
  });
  // CR 608.2c (Journey to the Lost City): a creature card that really goes to exile counts, "for each creature card among those cards" (a card in a library is never a token).
  const moves = moveInstructions(top, 'exile').map((m) => {
    const card = m.kind === 'move' ? state.objects[m.object] : undefined;
    return card !== undefined && derive(state, card).types.includes('creature')
      ? { ...m, countsCreatureCard: true as const }
      : m;
  });
  // CR 607.2a, 611.2a (Furious Rise): "until you exile another card with this enchantment": exiling another card with the permanent's linked ability ends the permission to play the one before.
  const exiling =
    effect.linked === true && res.source !== null && top.length > 0 ? res.source : null;
  const current: GameState =
    exiling === null
      ? drawn
      : {
          ...drawn,
          continuousEffects: drawn.continuousEffects.filter(
            (e) =>
              !(e.change.kind === 'playPermission' && e.change.endsWhenExilesAnother === exiling),
          ),
        };
  // CR 406.3 (D-187): "face down": no one may look at the cards.
  // CR 607.2a: "exiled with this enchantment": the permanent the ability belongs to remembers the cards (face up: the link of a face-down card is Hideaway's, which is another one).
  if (effect.linked === true && res.source !== null) {
    const source = res.source;
    // Lobelia, Defender of Bag End (CR 607.2a, 406.3): "look at the top card of each opponent's library and exile those cards face down": linked, face down, and the controller looked.
    const lookBy = effect.lookAt === true ? res.controller : undefined;
    return moving(
      current,
      moves.map((m) =>
        m.kind === 'move'
          ? {
              ...m,
              linkTo: source,
              ...(effect.faceDown === true ? { faceDown: true as const } : {}),
              ...(lookBy === undefined ? {} : { lookBy }),
            }
          : m,
      ),
    );
  }
  return moving(
    current,
    effect.faceDown === true
      ? moves.map((m) => (m.kind === 'move' ? { ...m, faceDown: true as const } : m))
      : moves,
  );
}

export function runMayPlay(
  state: GameState,
  res: ResolutionContext,
  effect: Extract<Effect, { kind: 'mayPlay' }>,
  ctx?: SelectContext,
): StepOutcome {
  // D-327 (CR 601.2, 305.1): "Mill a card. You may play that card this turn.": a card its owner (the controller) milled is in their graveyard. A card in
  // exile is the effect's to name whoever owns it; a card in a graveyard only when its owner is the one who may play it ("from your graveyard").
  // Lobelia, Defender of Bag End (CR 607.2a): "a card exiled with ~": the cards the permanent exiled with its linked ability that are still in exile.
  const named =
    effect.objects.kind === 'linkedExile' && ctx !== undefined
      ? resolveObjects(state, effect.objects, ctx, [])
      : (res.lastMoved ?? []);
  const inPlace = named.filter((id) => {
    const card = state.objects[id];
    return card?.zone === 'exile' || (card?.zone === 'graveyard' && card.owner === res.controller);
  });
  const cards = inPlace.filter((id) => {
    const card = state.objects[id];
    if (card === undefined) return false;
    // Narset, Enlightened Master: only the cards the filter describes get the permission.
    return (
      effect.cards === undefined ||
      matchesFilter(
        state,
        card,
        { ...effect.cards, zone: card.zone },
        { controller: res.controller, source: res.source },
      )
    );
  });
  const until = playEnd(state, res.controller, effect.lasts);
  let next = state;
  const created: ContinuousEffect[] = [];
  // Nashi, Moon Sage's Scion: "you may play one of those cards": the permissions of this effect share a key, which the card played ends the others by.
  let oneOf: string | undefined;
  if (effect.oneOf === true && cards.length > 0) {
    const [stamp, stamped] = allocateTimestamp(next);
    next = stamped;
    oneOf = `one${stamp}`;
  }
  // CR 406.3 (D-187): "you may look at and play those cards": the controller may look at each card that is face down, until it leaves exile. Arvinox, the Mind Flail: "you may look at them, you
  // may cast permanent spells from among them": looking is at every card, the permission to cast only at the ones the filter `cards` matches.
  for (const id of inPlace) {
    if (effect.lookAt === true && next.objects[id]?.exiledFaceDown === true) {
      const lookers = next.objects[id]?.lookers ?? [];
      if (!lookers.includes(res.controller)) {
        next = patchObject(next, id, { lookers: [...lookers, res.controller] });
      }
    }
  }
  for (const id of cards) {
    const [timestamp, stamped] = allocateTimestamp(next);
    next = stamped;
    created.push({
      id: `ce${timestamp}`,
      timestamp,
      objects: [id],
      until,
      change: {
        kind: 'playPermission',
        // Aerial Extortionist (CR 108.3): "its owner may cast it": the card's owner holds the permission.
        seat:
          effect.byOwner === true ? (state.objects[id]?.owner ?? res.controller) : res.controller,
        // Lorehold group 1: "you may cast it this turn" is no permission to play a land.
        ...(effect.castOnly === true ? { castOnly: true as const } : {}),
        // Issue 101 (Neriv): "during any turn you attacked with a commander".
        ...(effect.duringTurnsAttackedWithCommander === true
          ? { whenAttackedWithCommander: true as const }
          : {}),
        // Lobelia (CR 118.9): "without paying its mana cost": a spell is cast for no mana cost; a land is played as usual (`mayPlayFromExile`).
        ...(effect.free === true ? { free: true as const } : {}),
        // Issue 144 (CR 609.4b): "you may spend mana as though it were mana of any color to cast that spell".
        ...(effect.anyManaColor === true ? { anyManaColor: true as const } : {}),
        // Hostage Taker (CR 609.4b): "mana of any type can be spent to cast that spell"; Dire Fleet Daredevil (CR 614.1a): "If that spell would be put into a graveyard, exile it instead".
        ...(effect.anyManaType === true ? { anyManaType: true as const } : {}),
        ...(effect.exileInstead === true ? { exileInstead: true as const } : {}),
        // Urianger Augurelt (CR 601.2f): "Spells you cast this way cost {2} less to cast".
        ...(effect.lessGeneric === undefined ? {} : { lessGeneric: effect.lessGeneric }),
        // Durnan of the Yawning Portal (CR 702.125a): "That spell has undaunted".
        ...(effect.undaunted === true ? { undaunted: true as const } : {}),
        // Vivien, Champion of the Wilds (CR 601.2): "you may cast it if it's a creature spell".
        ...(effect.creatureSpellsOnly === true ? { creatureSpellsOnly: true as const } : {}),
        // Nashi, Moon Sage's Scion (CR 118.9): "pay life equal to its mana value rather than paying its mana cost", and "play one of those cards".
        ...(effect.lifeForMana === true ? { lifeForMana: true as const } : {}),
        ...(oneOf === undefined ? {} : { oneOf }),
        // Furious Rise (CR 607.2a): "until you exile another card with this enchantment".
        ...(effect.lasts === 'untilSourceExilesAnother' && res.source !== null
          ? { endsWhenExilesAnother: res.source }
          : {}),
      },
    });
  }
  // The Ruinous Powers (CR 603.7, 603.7a): "When you cast a spell this way, its owner loses life equal to its mana value": a delayed triggered ability of the controller for the cast of each card
  // of this permission this turn (the spell is its `triggerSubject`), created with the permission.
  const delayed: DelayedTrigger[] =
    effect.whenCast === undefined
      ? []
      : cards.flatMap((id) => {
          const card = state.objects[id]?.card ?? null;
          return card === null
            ? []
            : [
                {
                  source: res.source,
                  controller: res.controller,
                  ability: {
                    kind: 'triggered' as const,
                    trigger: {
                      kind: 'castSpell' as const,
                      filter: { stackKind: 'spell' as const },
                      by: 'you' as const,
                    },
                    effect: effect.whenCast as Effect,
                  },
                  untilEndOfTurn: true as const,
                  watchedCard: card,
                },
              ];
        });
  return done({
    ...next,
    continuousEffects: [...next.continuousEffects, ...created],
    ...(delayed.length === 0 ? {} : { delayedTriggers: [...next.delayedTriggers, ...delayed] }),
  });
}

/** `amount` with each "those cards that are still exiled" replaced by the cards `ids` (`cardsStillExiled`). */
function bakeAmount(amount: Amount, ids: readonly ObjectId[]): Amount {
  if (typeof amount === 'number') return amount;
  switch (amount.kind) {
    case 'exiledStillThere':
      return { kind: 'cardsStillExiled', objects: ids };
    case 'multiple':
      return { ...amount, of: bakeAmount(amount.of, ids) };
    case 'half':
      return { ...amount, of: bakeAmount(amount.of, ids) };
    case 'minus':
      return { ...amount, of: bakeAmount(amount.of, ids) };
    case 'difference':
      return { ...amount, of: [bakeAmount(amount.of[0], ids), bakeAmount(amount.of[1], ids)] };
    case 'extreme':
    case 'sum':
      return { ...amount, of: amount.of.map((a) => bakeAmount(a, ids)) };
    default:
      return amount;
  }
}

/**
 * "At the beginning of your next end step, ~ deals 2 damage to each opponent for each of those cards that are still exiled" (D-151, CR 603.7c):
 * a delayed trigger names no object of the spell that created it, so the cards its effect counts are written into it as it is created.
 */
export function bakeStillExiled(effect: Effect, ids: readonly ObjectId[]): Effect {
  switch (effect.kind) {
    case 'dealDamage':
      return { ...effect, amount: bakeAmount(effect.amount, ids) };
    case 'loseLife':
    case 'gainLife':
      return { ...effect, amount: bakeAmount(effect.amount, ids) };
    case 'draw':
      return { ...effect, count: bakeAmount(effect.count, ids) };
    case 'sequence':
      return { ...effect, effects: effect.effects.map((e) => bakeStillExiled(e, ids)) };
    default:
      return effect;
  }
}
