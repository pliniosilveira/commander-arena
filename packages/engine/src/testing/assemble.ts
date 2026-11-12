/**
 * Assembles a GameState from a scenario specification, writing the state directly (D-012). This is
 * the only place in the DSL that builds state; after it, everything goes through applyAction.
 *
 * Refuses impossible setups with a ScenarioError instead of producing a state the engine could
 * never reach: unknown cards, a commander flagged twice, spells on the battlefield, options that
 * only make sense on the battlefield used elsewhere, and any state that fails checkInvariants.
 */

import type { CardDefinition } from '../cards/definition';
import type { CardId, ObjectId, SeatId } from '../ids';
import { cardId, objectId } from '../ids';
import { checkInvariants } from '../invariants';
import type { ManaObject } from '../mana/types';
import { createRng } from '../rng';
import { meldCardsIssue } from '../rules/melded';
import { grantPriority, priorityOptions } from '../rules/priority';
import { setPending } from '../rules/set-pending';
import type { CardInstance, GameObject, GameSettings, GameState, SeatState } from '../state/types';
import { DEFAULT_SETTINGS, EMPTY_TURN_LOG } from '../state/types';
import { ENGINE_VERSION } from '../version';
import { resolveCard } from './cards';
import {
  checkCount,
  manaList,
  PHASE_OF,
  type PlacedZone,
  PRIORITY_STEPS,
  type ScenarioSpec,
  validatePlacement,
} from './spec';
import { type BuildOptions, type PermanentOptions, ScenarioError } from './types';

interface Expanded {
  readonly seat: SeatId;
  readonly zone: PlacedZone;
  readonly def: CardDefinition;
  readonly options: PermanentOptions;
  readonly fresh: boolean;
  readonly index: number;
}

export function assemble(
  spec: ScenarioSpec,
  build: BuildOptions,
): { state: GameState; labels: Map<string, CardId> } {
  const settings: GameSettings = { ...DEFAULT_SETTINGS, ...spec.settings };
  const active = spec.at.active ?? 0;
  const turnNumber = spec.at.turn ?? 3;
  const priority = spec.at.priority ?? active;
  for (const [what, seat] of [
    ['active', active],
    ['priority', priority],
  ] as const) {
    if (seat !== 0 && seat !== 1)
      throw new ScenarioError(`The ${what} seat ${seat} does not exist`);
  }
  if (!PRIORITY_STEPS.includes(spec.step)) {
    throw new ScenarioError(
      `No player has priority in the ${spec.step} step (CR 502.4, 514.3); build at one of: ${PRIORITY_STEPS.join(', ')}`,
    );
  }
  checkCount('turn', turnNumber, 1);
  checkCount('extraLandDrops', spec.at.extraLandDrops);

  // Expand counts into one entry per physical card, resolving names.
  const defs: CardDefinition[] = [];
  const defIndex = new Map<CardDefinition, number>();
  const expanded: Expanded[] = [];
  const labels = new Map<string, CardId>();
  for (const p of spec.placements) {
    const def = resolveCard(p.name, spec.custom);
    validatePlacement(p, def);
    const count = p.options.count ?? 1;
    if (p.options.label !== undefined && count !== 1) {
      throw new ScenarioError(`Label "${p.options.label}" names one card but count is ${count}`);
    }
    for (let i = 0; i < count; i += 1) {
      if (!defIndex.has(def)) {
        defIndex.set(def, defs.length);
        defs.push(def);
      }
      const fresh = p.zone === 'battlefield' && p.options.fresh === true;
      expanded.push({
        seat: p.seat,
        zone: p.zone,
        def,
        options: p.options,
        fresh,
        index: expanded.length,
      });
    }
  }

  // Timestamps (CR 613.7): every non-fresh object first, then the seats' turn starts (the active
  // seat's last), then fresh objects, so fresh ones are summoning sick (CR 302.6).
  const stamp = new Map<number, number>();
  let next = 1;
  for (const e of expanded) if (!e.fresh) stamp.set(e.index, next++);
  // The turn starts before the one now under way come right after the non-fresh objects (D-127: Echo reads "since
  // the beginning of your last upkeep"), so an object that is not fresh is older than the seat's last turn.
  const previousTurnStart: [number, number] = [next, next];
  next += 1;
  const turnStart: [number, number] = [next, next];
  turnStart[active] = next + 1;
  next += 2;
  for (const e of expanded) if (e.fresh) stamp.set(e.index, next++);

  const cards: Record<CardId, CardInstance> = {};
  const objects: Record<ObjectId, GameObject> = {};
  const zones = {
    library: [[], []] as ObjectId[][],
    hand: [[], []] as ObjectId[][],
    graveyard: [[], []] as ObjectId[][],
    command: [[], []] as ObjectId[][],
  };
  const battlefield: ObjectId[] = [];
  const exile: ObjectId[] = [];
  const commanders: CardId[][] = [[], []];
  const commanderCasts: Record<CardId, number> = {};
  let faceDownCount = 0;

  for (const e of expanded) {
    const cid = cardId(e.index);
    const oid = objectId(e.index);
    const o = e.options;
    const isCommander = o.commander === true;
    cards[cid] = { id: cid, owner: e.seat, definition: defIndex.get(e.def) ?? 0, isCommander };
    const onBattlefield = e.zone === 'battlefield';
    const controller = onBattlefield ? (o.controller ?? e.seat) : e.seat;
    const faceIndex = onBattlefield ? (o.face ?? (o.meldedWith === undefined ? 0 : 1)) : 0;
    const face = e.def.faces[faceIndex];
    // As when it enters (CR 306.5b, 310.4b): loyalty and defense come from the card unless the
    // scenario sets the counters itself. A battle's protector is an opponent of its controller.
    const entering: Record<string, number> = {};
    if (onBattlefield && face?.types.includes('planeswalker') && face.loyalty !== null) {
      entering.loyalty = face.loyalty;
    }
    if (onBattlefield && face?.types.includes('battle') && face.defense !== null) {
      entering.defense = face.defense;
    }
    const isBattle = onBattlefield && face?.types.includes('battle') === true;
    objects[oid] = {
      id: oid,
      card: cid,
      zone: e.zone,
      zoneOwner: e.zone === 'battlefield' || e.zone === 'exile' ? null : e.seat,
      owner: e.seat,
      controller,
      face: faceIndex,
      tapped: onBattlefield && o.tapped === true,
      counters: onBattlefield ? { ...entering, ...(o.counters ?? {}) } : {},
      damage: onBattlefield ? (o.damage ?? 0) : 0,
      damagedByDeathtouch: false,
      timestamp: stamp.get(e.index) ?? 0,
      token: null,
      attachedTo: null,
      protector: isBattle ? (o.protector ?? (controller + 1) % 2) : null,
      stack: null,
      ...(o.onAdventure === true ? { onAdventure: true as const } : {}),
      ...(onBattlefield && o.ringBearer === true ? { ringBearer: controller } : {}),
      ...(onBattlefield && o.level !== undefined ? { level: o.level } : {}),
      ...(onBattlefield && o.chosen !== undefined ? { chosen: o.chosen } : {}),
      // D-961: a face-down permanent, labelled in the order the scenario places them.
      ...(onBattlefield && o.faceDown === true
        ? { faceDown: { by: 'manifest' as const, n: ++faceDownCount } }
        : {}),
    };
    if (e.zone === 'battlefield') battlefield.push(oid);
    else if (e.zone === 'exile') exile.push(oid);
    else zones[e.zone][e.seat]?.push(oid);
    if (isCommander) {
      const mine = commanders[e.seat] ?? [];
      if (mine.some((c) => cards[c]?.definition === cards[cid]?.definition)) {
        throw new ScenarioError(
          `Seat ${e.seat} has two commanders named "${e.def.name}": a card can be flagged as a commander once`,
        );
      }
      if (mine.length >= 2) {
        throw new ScenarioError(`Seat ${e.seat} has more than two commanders (CR 903.3, 702.124)`);
      }
      mine.push(cid);
      commanders[e.seat] = mine;
      if (o.casts) commanderCasts[cid] = o.casts;
    }
    if (o.label !== undefined) {
      if (labels.has(o.label)) throw new ScenarioError(`Label "${o.label}" is used twice`);
      if (/^o\d+$/.test(o.label))
        throw new ScenarioError(`Label "${o.label}" looks like an object id`);
      labels.set(o.label, cid);
    }
  }

  // Attachments (CR 301.5a, 303.4b): the host is named by label or card name, among the battlefield.
  for (const e of expanded) {
    const ref = e.options.attachedTo;
    if (ref === undefined) continue;
    const onField = expanded.filter((x) => x.zone === 'battlefield' && x.index !== e.index);
    const byLabel = onField.filter((x) => x.options.label === ref);
    const hosts = byLabel.length > 0 ? byLabel : onField.filter((x) => x.def.name === ref);
    if (hosts.length !== 1) {
      throw new ScenarioError(
        `${e.def.name} is attachedTo "${ref}", which matches ${hosts.length} other permanents on the battlefield (use a label)`,
      );
    }
    const [host] = hosts;
    const mine = objects[objectId(e.index)];
    if (host && mine) objects[objectId(e.index)] = { ...mine, attachedTo: objectId(host.index) };
  }

  // Melded permanents (CR 701.42a, 712.4a, D-277): the placement `meldedWith` names is the second card of the same object, not an object of its own.
  for (const e of expanded) {
    const ref = e.options.meldedWith;
    if (ref === undefined) continue;
    const onField = expanded.filter((x) => x.zone === 'battlefield' && x.index !== e.index);
    const byLabel = onField.filter((x) => x.options.label === ref);
    const others = byLabel.length > 0 ? byLabel : onField.filter((x) => x.def.name === ref);
    const [other] = others;
    if (others.length !== 1 || other === undefined) {
      throw new ScenarioError(
        `${e.def.name} is meldedWith "${ref}", which matches ${others.length} other permanents on the battlefield (use a label)`,
      );
    }
    if (other.options.meldedWith !== undefined || other.seat !== e.seat) {
      throw new ScenarioError(
        `${e.def.name} and ${other.def.name} can not both be melded with each other: place the second card with no meldedWith, on the same seat`,
      );
    }
    const mine = objects[objectId(e.index)];
    const theirs = objects[objectId(other.index)];
    if (mine === undefined || theirs === undefined || mine.card === null || theirs.card === null)
      continue;
    const issue = meldCardsIssue({ cards, definitions: defs }, mine.card, theirs.card);
    if (issue !== null)
      throw new ScenarioError(`${e.def.name} can not be melded with ${other.def.name}: ${issue}`);
    objects[objectId(e.index)] = { ...mine, meldedWith: theirs.card };
    const { [objectId(other.index)]: _second, ...rest } = objects;
    for (const k of Object.keys(objects)) delete objects[k as ObjectId];
    Object.assign(objects, rest);
    const at = battlefield.indexOf(objectId(other.index));
    if (at >= 0) battlefield.splice(at, 1);
  }

  // Pairs (CR 702.95b, D-285): `pairedWith` names the other creature by label or card name; the link is written on both objects, formed by the player who
  // controls them. A melded permanent is one object, the first card's: a placement that names the second card of one must name the first instead.
  for (const e of expanded) {
    const ref = e.options.pairedWith;
    if (ref === undefined) continue;
    const mine = objects[objectId(e.index)];
    if (mine === undefined)
      throw new ScenarioError(
        `${e.def.name} is pairedWith "${ref}" but is the second card of a melded permanent: place the pairing on the first card`,
      );
    const onField = expanded.filter((x) => x.zone === 'battlefield' && x.index !== e.index);
    const byLabel = onField.filter((x) => x.options.label === ref);
    const others = byLabel.length > 0 ? byLabel : onField.filter((x) => x.def.name === ref);
    const [other] = others;
    if (others.length !== 1 || other === undefined) {
      throw new ScenarioError(
        `${e.def.name} is pairedWith "${ref}", which matches ${others.length} other permanents on the battlefield (use a label)`,
      );
    }
    const theirs = objects[objectId(other.index)];
    if (theirs === undefined)
      throw new ScenarioError(
        `${e.def.name} is pairedWith ${other.def.name}, which is the second card of a melded permanent: name the first card`,
      );
    const isCreature = (x: Expanded) =>
      x.def.faces[x.options.face ?? (x.options.meldedWith === undefined ? 0 : 1)]?.types.includes(
        'creature',
      ) === true;
    if (!isCreature(e) || !isCreature(other))
      throw new ScenarioError(
        `${e.def.name} and ${other.def.name} can not be paired: both must be creatures (CR 702.95a)`,
      );
    if (mine.controller !== theirs.controller)
      throw new ScenarioError(
        `${e.def.name} and ${other.def.name} can not be paired: one player controls both (CR 702.95c)`,
      );
    const back = other.options.pairedWith;
    if (back !== undefined && back !== e.options.label && back !== e.def.name)
      throw new ScenarioError(
        `${e.def.name} is pairedWith ${other.def.name}, which is pairedWith "${back}" (a creature can be paired with only one, CR 702.95d)`,
      );
    if (mine.paired !== undefined && mine.paired.with !== theirs.id)
      throw new ScenarioError(`${e.def.name} is paired twice (CR 702.95d)`);
    if (theirs.paired !== undefined && theirs.paired.with !== mine.id)
      throw new ScenarioError(`${other.def.name} is paired twice (CR 702.95d)`);
    objects[mine.id] = { ...mine, paired: { with: theirs.id, by: mine.controller } };
    objects[theirs.id] = { ...theirs, paired: { with: mine.id, by: mine.controller } };
  }

  const seats: SeatState[] = spec.seats.map((s, id) => {
    checkCount(`seat ${id} poison`, s.poison);
    if (s.handSizeMax !== null) checkCount(`seat ${id} handSizeMax`, s.handSizeMax);
    checkCount(`seat ${id} mulligans`, s.mulligans);
    checkCount(`seat ${id} landsPlayed`, s.landsPlayed);
    if (s.ring !== null) checkCount(`seat ${id} ring`, s.ring);
    if (s.life !== null && !Number.isInteger(s.life))
      throw new ScenarioError(`Seat ${id} life ${s.life} is not an integer`);
    const firstObject = Object.values(objects).find((ob) => ob.owner === id)?.id ?? objectId(0);
    const manaPool: ManaObject[] = s.pool
      .flatMap((m) => manaList(m))
      // A pool filled at build time has no real source permanent; the seat's first object stands in.
      .map((color) => ({ color, snow: false, source: firstObject, restriction: null }));
    return {
      id,
      life: s.life ?? settings.startingLife,
      poison: s.poison,
      library: zones.library[id] ?? [],
      hand: zones.hand[id] ?? [],
      graveyard: zones.graveyard[id] ?? [],
      command: zones.command[id] ?? [],
      manaPool,
      landsPlayedThisTurn: s.landsPlayed,
      cardsDrawnThisTurn: 0,
      spellsCastThisTurn: 0,
      lifeLostThisTurn: 0,
      // D-149: the turns this seat has had, the current one included when it is theirs: turn `turnNumber` is the active seat's, and
      // the turns before it went round the table backwards from there.
      turnsTaken: turnsTakenBy(id, active, turnNumber, spec.seats.length),
      drewFromEmptyLibrary: false,
      mulligans: s.mulligans,
      turnStartTimestamp: turnStart[id as 0 | 1],
      previousTurnStartTimestamp: previousTurnStart[id as 0 | 1],
      hasLost: false,
      commanders: commanders[id] ?? [],
      handSizeMax: s.handSizeMax,
      ...(s.ring === null || s.ring === 0 ? {} : { ring: { tempted: s.ring } }),
      ...(s.citysBlessing ? { citysBlessing: true as const } : {}),
    };
  });

  const commanderDamage: Record<string, number> = {};
  spec.seats.forEach((s, victim) => {
    for (const { name, amount } of s.commanderDamage) {
      checkCount(`commander damage from ${name}`, amount, 1);
      const owners = Object.values(cards).filter(
        (c) => c.isCommander && defs[c.definition]?.name === name,
      );
      if (owners.length !== 1) {
        throw new ScenarioError(
          `Commander damage from "${name}": expected exactly one commander card with that name, found ${owners.length}`,
        );
      }
      const [owner] = owners;
      if (owner) commanderDamage[`${victim}:${owner.id}`] = amount;
    }
  });

  const base: GameState = {
    engineVersion: ENGINE_VERSION,
    settings,
    seed: spec.seed,
    rng: createRng(spec.seed),
    nextObjectNumber: expanded.length,
    nextDecisionNumber: 0,
    nextTimestamp: next,
    definitions: defs,
    cards,
    objects,
    seats,
    battlefield,
    exile,
    stack: [],
    turn: {
      number: turnNumber,
      activeSeat: active,
      phase: PHASE_OF[spec.step],
      step: spec.step,
      prioritySeat: priority,
      passedInSuccession: [],
      extraLandDrops: spec.at.extraLandDrops ?? 0,
    },
    commanderCasts,
    commanderDamage,
    lki: {},
    commanderWatch: [],
    monarch: spec.at.monarch ?? null,
    turnLog: EMPTY_TURN_LOG,
    pendingTriggers: [],
    delayedTriggers: [],
    exileReturns: [],
    continuousEffects: [],
    casting: null,
    triggering: null,
    combat: null,
    resolution: null,
    actionCount: 0,
    pending: null,
    result: null,
  };

  const state =
    build.settle === true
      ? grantPriority(base, priority).state
      : setPending(base, {
          kind: 'priority',
          seat: priority,
          options: priorityOptions(base, priority),
        });
  const problems = checkInvariants(state);
  if (problems.length > 0) {
    throw new ScenarioError(
      `The scenario is not a consistent game state:\n  ${problems.join('\n  ')}`,
    );
  }
  return { state, labels };
}

/** How many of the turns 1 to `turnNumber` seat `seat` has had, when turn `turnNumber` is `active`'s and the seats take turns in order. */
function turnsTakenBy(seat: number, active: number, turnNumber: number, seats: number): number {
  let count = 0;
  for (let back = 0; back < turnNumber; back += 1) {
    if ((((active - back) % seats) + seats) % seats === seat) count += 1;
  }
  return count;
}
