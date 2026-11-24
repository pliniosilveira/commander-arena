/**
 * The specification a scenario builder collects, and the checks that refuse impossible setups
 * before any state is built (D-012): spells on the battlefield, battlefield-only options in other
 * zones, bad counts and mana, commander options on non-commanders.
 */
import type { UndercityRoom } from '../ast/types';
import type { CardDefinition } from '../cards/definition';
import { isPermanentType } from '../characteristics';
import type { SeatId } from '../ids';
import type { ManaColor } from '../mana/types';
import { chosenFromOption } from '../rules/chosen';
import { entersChoice, entersOptions } from '../rules/enters';
import type { GameSettings, PhaseId, StepId } from '../state/types';
import { type AtOptions, type ManaSpec, type PermanentOptions, ScenarioError } from './types';

export type PlacedZone = 'library' | 'hand' | 'graveyard' | 'exile' | 'battlefield' | 'command';

export interface Placement {
  readonly seat: SeatId;
  readonly zone: PlacedZone;
  readonly name: string;
  readonly options: PermanentOptions;
}

export interface SeatSpec {
  life: number | null;
  poison: number;
  energy: number;
  pool: ManaSpec[];
  mulligans: number;
  landsPlayed: number;
  handSizeMax: number | null;
  /** How many times the Ring has tempted this seat (D-196); null: never, and no emblem. */
  ring: number | null;
  /** The name of the seat's companion, outside the game at the start (CR 103.2b, 702.139); null: none. */
  companion: string | null;
  /** The seat has the city's blessing at the start (CR 702.131c, D-264). */
  citysBlessing: boolean;
  /** The seat's speed at the start (CR 702.179b); null: it has none. */
  speed: number | null;
  /** The room of Undercity the seat's venture marker is on at the start (CR 309.4); null: the seat is in no dungeon. */
  dungeon: UndercityRoom | null;
  /** Combat damage this seat has taken from a commander, by card name (CR 903.10a). */
  commanderDamage: { name: string; amount: number }[];
}

export interface ScenarioSpec {
  seed: number;
  settings: Partial<GameSettings>;
  seats: SeatSpec[];
  placements: Placement[];
  custom: ReadonlyMap<string, CardDefinition>;
  step: StepId;
  at: AtOptions;
}

export function emptySeatSpec(): SeatSpec {
  return {
    life: null,
    poison: 0,
    energy: 0,
    pool: [],
    mulligans: 0,
    landsPlayed: 0,
    handSizeMax: null,
    ring: null,
    companion: null,
    citysBlessing: false,
    speed: null,
    dungeon: null,
    commanderDamage: [],
  };
}

/** Steps in which a player receives priority (CR 500.3: none in untap, normally none in cleanup). */
export const PRIORITY_STEPS: readonly StepId[] = [
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
  'end',
];

export const PHASE_OF: Readonly<Record<StepId, PhaseId>> = {
  untap: 'beginning',
  upkeep: 'beginning',
  draw: 'beginning',
  precombatMain: 'precombatMain',
  beginningOfCombat: 'combat',
  declareAttackers: 'combat',
  declareBlockers: 'combat',
  firstStrikeDamage: 'combat',
  combatDamage: 'combat',
  endOfCombat: 'combat',
  postcombatMain: 'postcombatMain',
  end: 'ending',
  cleanup: 'ending',
};

const MANA_LETTERS: readonly string[] = ['W', 'U', 'B', 'R', 'G', 'C'];

export function manaList(spec: ManaSpec): ManaColor[] {
  if (typeof spec === 'string') {
    return [...spec].map((ch) => {
      if (!MANA_LETTERS.includes(ch)) {
        throw new ScenarioError(`"${ch}" is not a mana symbol in "${spec}" (use W, U, B, R, G, C)`);
      }
      return ch as ManaColor;
    });
  }
  const out: ManaColor[] = [];
  for (const [color, n] of Object.entries(spec)) {
    if (!MANA_LETTERS.includes(color)) {
      throw new ScenarioError(`"${color}" is not a mana color (use W, U, B, R, G, C)`);
    }
    if (n === undefined) continue;
    if (!Number.isInteger(n) || n < 0) throw new ScenarioError(`Mana count for ${color} is ${n}`);
    for (let i = 0; i < n; i += 1) out.push(color as ManaColor);
  }
  return out;
}

export function checkCount(label: string, n: number | undefined, min = 0): void {
  if (n === undefined) return;
  if (!Number.isInteger(n) || n < min)
    throw new ScenarioError(`${label} must be an integer >= ${min}, got ${n}`);
}

export function validatePlacement(p: Placement, def: CardDefinition, seatCount = 2): void {
  const o = p.options;
  const where = `${p.name} in seat ${p.seat}'s ${p.zone}`;
  checkCount(`count for ${where}`, o.count, 1);
  checkCount(`damage for ${where}`, o.damage);
  checkCount(`casts for ${where}`, o.casts);
  for (const [counter, n] of Object.entries(o.counters ?? {}))
    checkCount(`${counter} counters for ${where}`, n);
  if (o.face !== undefined && (!Number.isInteger(o.face) || !def.faces[o.face])) {
    throw new ScenarioError(`${where}: ${p.name} has no face ${o.face}`);
  }
  if (o.onAdventure !== undefined && (p.zone !== 'exile' || def.layout !== 'adventure')) {
    throw new ScenarioError(
      `${where}: onAdventure only applies to a card of layout adventure in exile (CR 715.3d)`,
    );
  }
  const battlefieldOnly =
    o.face !== undefined ||
    o.tapped !== undefined ||
    o.damage !== undefined ||
    o.counters !== undefined ||
    o.fresh !== undefined ||
    o.controller !== undefined ||
    o.protector !== undefined ||
    o.attachedTo !== undefined ||
    o.meldedWith !== undefined ||
    o.pairedWith !== undefined ||
    o.chosen !== undefined;
  if (p.zone !== 'battlefield' && battlefieldOnly) {
    throw new ScenarioError(
      `${where}: face, tapped, damage, counters, fresh, controller, protector, attachedTo, meldedWith, pairedWith and chosen only apply to the battlefield`,
    );
  }
  if (p.zone === 'battlefield') {
    const face = def.faces[o.face ?? 0];
    if (!face?.types.some((t) => isPermanentType(t))) {
      throw new ScenarioError(
        `${p.name} is not a permanent card and cannot be on the battlefield (CR 110.1)`,
      );
    }
    if (o.controller !== undefined && (o.controller < 0 || o.controller >= seatCount)) {
      throw new ScenarioError(`${where}: controller ${o.controller} is not a seat`);
    }
    const types = face.types;
    if (o.meldedWith !== undefined) {
      if (def.layout !== 'meld') {
        throw new ScenarioError(
          `${where}: only a meld card can be meldedWith another card (CR 701.42b)`,
        );
      }
      if (o.face !== undefined && o.face !== 1) {
        throw new ScenarioError(
          `${where}: a melded permanent has its combined back face up, face 1 (CR 712.8g)`,
        );
      }
    }
    if (
      o.attachedTo !== undefined &&
      !face.subtypes.some((t) => t === 'Aura' || t === 'Equipment')
    ) {
      throw new ScenarioError(`${where}: only an Aura or an Equipment can be attachedTo something`);
    }
    if ((o.counters?.loyalty ?? 0) > 0 && !types.includes('planeswalker')) {
      throw new ScenarioError(`${where}: loyalty counters only belong on a planeswalker`);
    }
    if ((o.counters?.defense ?? 0) > 0 && !types.includes('battle')) {
      throw new ScenarioError(`${where}: defense counters only belong on a battle`);
    }
    if (o.chosen !== undefined) {
      const kind = entersChoice(face.abilities);
      const {
        creatureType,
        color,
        option,
        cardType,
        planeswalkerType,
        lifePaid,
        player,
        cardName,
      } = o.chosen;
      if (kind === null) {
        throw new ScenarioError(`${where}: ${p.name} does not choose anything as it enters`);
      }
      const given =
        kind === 'creatureType'
          ? creatureType
          : kind === 'option'
            ? option
            : kind === 'cardType'
              ? cardType
              : kind === 'planeswalkerType'
                ? planeswalkerType
                : kind === 'lifePaid'
                  ? lifePaid === undefined
                    ? undefined
                    : String(lifePaid)
                  : kind === 'player'
                    ? player === undefined
                      ? undefined
                      : `seat:${player}`
                    : kind === 'cardName'
                      ? cardName
                      : color;
      const others = [
        creatureType,
        color,
        option,
        cardType,
        planeswalkerType,
        lifePaid,
        player,
        cardName,
      ].filter((x) => x !== undefined).length;
      if (given === undefined || others !== 1) {
        throw new ScenarioError(
          `${where}: ${p.name} chooses a ${kind}, so chosen must give just that`,
        );
      }
      // A `lifePaid` answer is any whole number of life; the scenario places a permanent that already paid it.
      const named = kind === 'lifePaid' ? [given] : entersOptions(face.abilities);
      if (chosenFromOption(kind, given, named) === null) {
        throw new ScenarioError(`${where}: ${given} is not a ${kind}`);
      }
    }
    if (o.protector !== undefined) {
      if (!types.includes('battle')) {
        throw new ScenarioError(`${where}: only a battle has a protector (CR 310.9)`);
      }
      if (!Number.isInteger(o.protector) || o.protector < 0 || o.protector >= seatCount) {
        throw new ScenarioError(`${where}: protector ${o.protector} is not a seat`);
      }
      if (o.protector === (o.controller ?? p.seat)) {
        throw new ScenarioError(
          `${where}: a battle's protector is an opponent of its controller (CR 310.12a)`,
        );
      }
    }
  }
  if (o.casts !== undefined && o.commander !== true) {
    throw new ScenarioError(`${where}: casts only applies to a commander (commander: true)`);
  }
}
