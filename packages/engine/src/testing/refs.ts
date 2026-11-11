/**
 * Turning the DSL's card references into objects and actions, against the current state.
 */
import type { CastAlternativeKind } from '../ast/features';
import type { Zone } from '../ast/types';
import type { CardId, ObjectId, SeatId } from '../ids';
import { derive } from '../rules/derive';
import { choosesFace } from '../rules/layouts';
import type { Action } from '../state/actions';
import type { ChosenTarget } from '../state/chosen';
import { definitionOf } from '../state/ops';
import type { GameObject, GameState } from '../state/types';
import { describeObject, nameOf, seatOfObject } from './describe';
import { manaList } from './spec';
import {
  type ActionSpec,
  type CardQuery,
  type CardRef,
  ScenarioError,
  type TapOptions,
  type TargetRef,
} from './types';

export interface RefContext {
  readonly state: GameState;
  readonly labels: ReadonlyMap<string, CardId>;
}

const ZONE_ORDER: readonly Zone[] = [
  'hand',
  'library',
  'graveyard',
  'command',
  'battlefield',
  'stack',
  'exile',
  'phased',
];

/** Every object in a deterministic order: seats' zones first, then shared zones, each in list order. */
export function allObjects(state: GameState): GameObject[] {
  const out: GameObject[] = [];
  const push = (ids: readonly ObjectId[]) => {
    for (const id of ids) {
      const obj = state.objects[id];
      if (obj) out.push(obj);
    }
  };
  for (const zone of ZONE_ORDER) {
    if (zone === 'battlefield') push(state.battlefield);
    else if (zone === 'stack') push(state.stack);
    else if (zone === 'exile') push(state.exile);
    else if (zone === 'phased') push(state.phased ?? []);
    else for (const s of state.seats) push(s[zone]);
  }
  return out;
}

function matchesName(state: GameState, obj: GameObject, name: string): boolean {
  if (obj.card !== null) {
    // A card is also named by any one of its faces ("Stomp" for an Adventure card).
    const def = definitionOf(state, obj.card);
    if (def.name === name || def.faces.some((f) => f.name === name)) return true;
  }
  return nameOf(state, obj) === name || derive(state, obj).name === name;
}

export function findObjects(state: GameState, query: CardQuery): GameObject[] {
  const matches = allObjects(state).filter(
    (obj) =>
      matchesName(state, obj, query.name) &&
      (query.zone === undefined || obj.zone === query.zone) &&
      (query.seat === undefined || seatOfObject(state, obj) === query.seat),
  );
  return query.nth === undefined ? matches : matches.slice(query.nth, query.nth + 1);
}

export interface Defaults {
  readonly zones?: readonly Zone[];
  readonly seat?: SeatId;
}

function parseName(text: string): CardQuery {
  const m = /^(.*)\[(\d+)\]$/.exec(text);
  return m ? { name: m[1] as string, nth: Number(m[2]) } : { name: text };
}

function ambiguity(state: GameState, label: string, matches: readonly GameObject[]): string {
  return `"${label}" is ambiguous: ${matches.length} matches (${matches
    .map((o) => describeObject(state, o))
    .join('; ')}). Use { name, seat, zone, nth }, "Name[n]" or a label.`;
}

/** Resolves a reference to exactly one object, applying the verb's default zone and seat. */
export function resolveObject(ctx: RefContext, ref: CardRef, defaults: Defaults = {}): GameObject {
  const { state } = ctx;
  if (typeof ref === 'string') {
    if (/^o\d+$/.test(ref)) {
      const obj = state.objects[ref as ObjectId];
      if (!obj)
        throw new ScenarioError(
          `Object ${ref} does not exist (objects get new ids when they change zone, CR 400.7)`,
        );
      return obj;
    }
    const cid = ctx.labels.get(ref);
    if (cid !== undefined) {
      const obj = allObjects(state).find((o) => o.card === cid);
      if (!obj) throw new ScenarioError(`The card labelled "${ref}" is no longer in the game`);
      return obj;
    }
  }
  const query: CardQuery = typeof ref === 'string' ? parseName(ref) : ref;
  const zones = query.zone !== undefined ? [query.zone] : defaults.zones;
  const seat = query.seat ?? defaults.seat;
  let matches = findObjects(state, { name: query.name });
  const inScope = (o: GameObject) =>
    (zones === undefined || zones.includes(o.zone)) &&
    (seat === undefined || seatOfObject(state, o) === seat);
  matches = matches.filter(inScope);
  const label = query.name;
  if (query.nth !== undefined) {
    const picked = matches[query.nth];
    if (!picked) {
      throw new ScenarioError(
        `"${label}"[${query.nth}] does not exist: ${matches.length} matching ${matches.length === 1 ? 'card' : 'cards'}${scopeText(zones, seat)}`,
      );
    }
    return picked;
  }
  const [only, ...rest] = matches;
  if (only && rest.length === 0) return only;
  if (only) throw new ScenarioError(ambiguity(state, label, matches));
  const elsewhere = findObjects(state, { name: query.name });
  throw new ScenarioError(
    `No card named "${label}"${scopeText(zones, seat)}.` +
      (elsewhere.length > 0
        ? ` It exists elsewhere: ${elsewhere.map((o) => describeObject(state, o)).join('; ')}.`
        : ' No card with that name is in the game.'),
  );
}

function scopeText(zones: readonly Zone[] | undefined, seat: SeatId | undefined): string {
  const parts = [
    zones ? `in ${zones.join(' or ')}` : '',
    seat !== undefined ? `for seat ${seat}` : '',
  ].filter((p) => p !== '');
  return parts.length > 0 ? ` ${parts.join(' ')}` : '';
}

export function toTarget(ctx: RefContext, ref: TargetRef, specId: string): ChosenTarget {
  if (typeof ref === 'object' && 'player' in ref) {
    return { kind: 'player', seat: ref.player, specId };
  }
  return { kind: 'object', id: resolveObject(ctx, ref).id, specId };
}

/** The activateAbility action for tapping a mana source (CR 605.3b), consulting the priority options. */
export function tapAction(
  ctx: RefContext,
  seat: SeatId,
  card: CardRef,
  options: TapOptions = {},
): Action {
  const obj = resolveObject(ctx, card, { zones: ['battlefield'], seat });
  const { state } = ctx;
  const abilities = derive(state, obj).abilities;
  const abilityIndex = options.ability ?? abilities.findIndex((a) => a.kind === 'mana');
  if (abilityIndex < 0 || abilities[abilityIndex]?.kind !== 'mana') {
    throw new ScenarioError(
      `${describeObject(state, obj)} has no mana ability${options.ability !== undefined ? ` #${options.ability}` : ''}`,
    );
  }
  const sacrifice =
    options.sacrifice === undefined
      ? {}
      : { sacrifice: resolveObject(ctx, options.sacrifice, { zones: ['battlefield'], seat }).id };
  if (options.color !== undefined) {
    return {
      kind: 'activateAbility',
      source: obj.id,
      abilityIndex,
      color: options.color,
      ...sacrifice,
    };
  }
  if (options.combination !== undefined) {
    return {
      kind: 'activateAbility',
      source: obj.id,
      abilityIndex,
      color: null,
      combination: manaList(options.combination),
      ...sacrifice,
    };
  }
  // No color given: a source with exactly one listed option uses it (including the color a
  // commander-identity source offers); otherwise the engine decides, so rejections stay the engine's.
  const d = state.pending;
  const listed =
    d?.kind === 'priority'
      ? d.options.filter(
          (o) =>
            o.kind === 'activateAbility' &&
            o.source === obj.id &&
            o.abilityIndex === abilityIndex &&
            // D-222: with a sacrifice named, the options that give up that permanent; with none named, all of them (a choice to make is refused by the engine).
            (options.sacrifice === undefined ||
              o.sacrifice === undefined ||
              'sacrifice' in sacrifice),
        )
      : [];
  const gives = listed.filter((o) => o.kind === 'activateAbility' && o.sacrifice !== undefined);
  if (gives.length > 0 && !('sacrifice' in sacrifice)) {
    // The engine refuses an activation that does not name what it sacrifices: let it say so.
    return { kind: 'activateAbility', source: obj.id, abilityIndex, color: null };
  }
  if (listed.length > 1 && gives.length === 0) {
    throw new ScenarioError(
      `${describeObject(state, obj)} can produce several colors or combinations; pass { color } or { combination } (options: ${listed
        .map((o) =>
          o.kind === 'activateAbility' ? (o.combination ? o.combination.join('') : o.color) : '',
        )
        .join(', ')})`,
    );
  }
  const only =
    gives.length > 0
      ? gives.find(
          (o) =>
            o.kind === 'activateAbility' &&
            'sacrifice' in sacrifice &&
            o.sacrifice === sacrifice.sacrifice,
        )
      : listed[0];
  return {
    kind: 'activateAbility',
    source: obj.id,
    abilityIndex,
    color: only?.kind === 'activateAbility' ? only.color : null,
    ...(only?.kind === 'activateAbility' && only.combination
      ? { combination: only.combination }
      : {}),
    ...sacrifice,
  };
}

/**
 * The `activate` action for an activated ability of a card on the battlefield or in `seat`'s hand
 * (CR 602.2). `ability` is the index among the derived abilities; the default is the first
 * activated one.
 */
export function activateAction(
  ctx: RefContext,
  seat: SeatId,
  card: CardRef,
  ability?: number,
): Action {
  const obj = resolveObject(ctx, card, { zones: ['battlefield', 'hand', 'graveyard'], seat });
  const abilities = derive(ctx.state, obj).abilities;
  const abilityIndex = ability ?? abilities.findIndex((a) => a.kind === 'activated');
  if (abilityIndex < 0 || abilities[abilityIndex]?.kind !== 'activated') {
    throw new ScenarioError(
      `${describeObject(ctx.state, obj)} has no activated ability${ability !== undefined ? ` #${ability}` : ''}`,
    );
  }
  return { kind: 'activate', object: obj.id, abilityIndex };
}

/**
 * The `castSpell` action for a card in `seat`'s hand or command zone, or in its graveyard when cast
 * with flashback (CR 702.34a) or escape (CR 702.138a). The keys are in the order the engine lists its options in, which
 * `legal` and `illegal` compare as text.
 */
export function castAction(
  ctx: RefContext,
  seat: SeatId,
  card: CardRef,
  alternative?: CastAlternativeKind,
  face?: number,
): Action {
  const zones: readonly Zone[] =
    alternative === 'flashback' || alternative === 'escape'
      ? ['graveyard']
      : ['hand', 'command', 'exile'];
  let obj: GameObject;
  try {
    obj = resolveObject(ctx, card, { zones, seat });
  } catch (error) {
    // D-133, D-151: a card with "You may cast this card from your graveyard", or the top card of the library with a permission to cast
    // it there: the hand, the command zone and exile come first, then the library, then the graveyard.
    if (alternative !== undefined || !(error instanceof ScenarioError)) throw error;
    let found: GameObject | null = null;
    for (const zone of ['library', 'graveyard'] as const) {
      try {
        found = resolveObject(ctx, card, { zones: [zone], seat });
        break;
      } catch {
        // try the next zone
      }
    }
    if (found === null) throw error;
    obj = found;
  }
  return {
    kind: 'castSpell',
    object: obj.id,
    ...(alternative === undefined ? {} : { alternative }),
    ...faceField(ctx, obj, face),
  };
}

/**
 * The `face` of a cast or land play: given when the test names one other than 0, and always for a
 * card with several faces to choose from, as the engine lists its options (face 0 by default).
 */
function faceField(
  ctx: RefContext,
  obj: GameObject,
  face: number | undefined,
): { readonly face?: number } {
  const multi = obj.card !== null && choosesFace(definitionOf(ctx.state, obj.card));
  if (face === undefined) return multi ? { face: 0 } : {};
  return face !== 0 || multi ? { face } : {};
}

/** The `playLand` action for a card in `seat`'s hand, or in exile when an effect lets it be played (D-151), or in their graveyard (D-232); `face` picks a modal double-faced card's face. */
export function playLandAction(
  ctx: RefContext,
  seat: SeatId,
  card: CardRef,
  face?: number,
): Action {
  let obj: GameObject;
  try {
    obj = resolveObject(ctx, card, { zones: ['hand'], seat });
  } catch (error) {
    // D-151: a land in exile that an effect lets the player play ("You may play that card this turn") is found there; the hand is the first place.
    if (!(error instanceof ScenarioError)) throw error;
    try {
      obj = resolveObject(ctx, card, { zones: ['exile'], seat });
    } catch {
      // D-232: a land in the graveyard a permanent lets its controller play once each turn ("you may play a land from your graveyard").
      try {
        obj = resolveObject(ctx, card, { zones: ['graveyard'], seat });
      } catch {
        throw error;
      }
    }
  }
  return { kind: 'playLand', object: obj.id, ...faceField(ctx, obj, face) };
}

/** The `suspend` or `foretell` special action for a card in `seat`'s hand (CR 116.2f, 116.2h, D-128). */
export function specialAction(
  ctx: RefContext,
  seat: SeatId,
  kind: 'suspend' | 'foretell',
  card: CardRef,
): Action {
  const obj = resolveObject(ctx, card, { zones: ['hand'], seat });
  return { kind, object: obj.id };
}

export function specToAction(ctx: RefContext, seat: SeatId, spec: ActionSpec): Action {
  if (spec === 'pass') return { kind: 'pass' };
  if ('playLand' in spec) return playLandAction(ctx, seat, spec.playLand, spec.face);
  if ('cast' in spec) return castAction(ctx, seat, spec.cast, spec.alternative, spec.face);
  if ('activate' in spec) return activateAction(ctx, seat, spec.activate, spec.ability);
  if ('suspend' in spec) return specialAction(ctx, seat, 'suspend', spec.suspend);
  if ('foretell' in spec) return specialAction(ctx, seat, 'foretell', spec.foretell);
  if ('tap' in spec) {
    return tapAction(ctx, seat, spec.tap, {
      ...(spec.color ? { color: spec.color } : {}),
      ...(spec.combination ? { combination: spec.combination } : {}),
    });
  }
  // The combat specs need the combat references (combat-refs.ts, combatSpecToAction).
  throw new ScenarioError('A combat action spec was given where a priority spec is expected');
}
