/**
 * The scenario builder (SPEC 17.3 A12, D-012):
 *
 *   const g = scenario()
 *     .seat(0).life(20).hand('Lightning Bolt').battlefield('Mountain')
 *     .seat(1).battlefield('Grizzly Bears')
 *     .at('precombatMain', { active: 0 })
 *     .build();
 *
 * `seat(n)` selects the seat that the following calls describe. Zone methods take card names
 * (see cards.ts) and, for one card, an options object: `.battlefield('Grizzly Bears', { tapped:
 * true })`. Library order is top first; every other zone keeps the order given.
 */

import { validateCardStructure } from '../ast/validate';
import type { CardDefinition } from '../cards/definition';
import type { SeatId } from '../ids';
import type { GameSettings, StepId } from '../state/types';
import { assemble } from './assemble';
import { createDriver } from './driver';
import { emptySeatSpec, type PlacedZone, type Placement, type ScenarioSpec } from './spec';
import {
  type AtOptions,
  type BuildOptions,
  type ManaSpec,
  type PermanentOptions,
  type PlaceOptions,
  ScenarioError,
  type ScenarioGame,
} from './types';

export interface ScenarioBuilder {
  /** The seat the following calls describe. Exactly two seats exist (0 and 1). */
  seat(seat: SeatId): ScenarioBuilder;
  life(life: number): ScenarioBuilder;
  poison(counters: number): ScenarioBuilder;
  /** Mana already in the seat's pool. */
  pool(mana: ManaSpec): ScenarioBuilder;
  mulligans(count: number): ScenarioBuilder;
  landsPlayed(count: number): ScenarioBuilder;
  /**
   * Maximum hand size for the seat (CR 402.2). Not set means the game setting (7). "No maximum
   * hand size" is a static ability of a permanent: put one on the battlefield (for example
   * 'SYNTHETIC Reading Hat').
   */
  handSizeMax(max: number): ScenarioBuilder;
  /** The Ring has tempted the seat this many times (CR 701.54c, D-196): it has the emblem and its abilities of that level. */
  ring(tempted: number): ScenarioBuilder;
  /** The seat has the city's blessing (CR 702.131c, D-264). */
  citysBlessing(): ScenarioBuilder;
  hand(name: string, options?: PlaceOptions): ScenarioBuilder;
  hand(...names: string[]): ScenarioBuilder;
  /** Top of the library first. */
  library(name: string, options?: PlaceOptions): ScenarioBuilder;
  library(...names: string[]): ScenarioBuilder;
  graveyard(name: string, options?: PlaceOptions): ScenarioBuilder;
  graveyard(...names: string[]): ScenarioBuilder;
  /** Exile is shared; the seat in scope owns the card. */
  exile(name: string, options?: PlaceOptions): ScenarioBuilder;
  exile(...names: string[]): ScenarioBuilder;
  battlefield(name: string, options?: PermanentOptions): ScenarioBuilder;
  battlefield(...names: string[]): ScenarioBuilder;
  /** Put a card in the command zone. Add `commander: true` to make it a commander. */
  command(name: string, options?: PlaceOptions): ScenarioBuilder;
  command(...names: string[]): ScenarioBuilder;
  /** A commander in the command zone (CR 903.6): command() with commander: true. */
  commander(name: string, options?: Omit<PlaceOptions, 'commander'>): ScenarioBuilder;
  /** Combat damage the seat has taken from this commander (CR 903.10a). */
  commanderDamageTaken(commanderName: string, amount: number): ScenarioBuilder;
  seed(seed: number): ScenarioBuilder;
  settings(settings: Partial<GameSettings>): ScenarioBuilder;
  /** Register a card definition scenarios can name; refused when structurally invalid. */
  define(card: CardDefinition): ScenarioBuilder;
  /** The step the game is in, with the priority decision pending. Default precombatMain. */
  at(step: StepId, options?: AtOptions): ScenarioBuilder;
  build(options?: BuildOptions): ScenarioGame;
}

type ZoneArgs<O> = [name: string, options?: O | undefined] | string[];

function entries<O extends PlaceOptions>(args: ZoneArgs<O>): { name: string; options: O }[] {
  const [first, second] = args as [string, unknown];
  if (args.length === 2 && typeof second === 'object' && second !== null) {
    return [{ name: first, options: second as O }];
  }
  if (args.length === 2 && second === undefined) return [{ name: first, options: {} as O }];
  return args.map((name) => {
    if (typeof name !== 'string')
      throw new ScenarioError(`Expected a card name, got ${String(name)}`);
    return { name, options: {} as O };
  });
}

export function scenario(): ScenarioBuilder {
  const spec: ScenarioSpec = {
    seed: 1,
    settings: {},
    seats: [emptySeatSpec(), emptySeatSpec()],
    placements: [],
    custom: new Map<string, CardDefinition>(),
    step: 'precombatMain',
    at: {},
  };
  let current: SeatId | null = null;

  const scope = (what: string): SeatId => {
    if (current === null) throw new ScenarioError(`Call .seat(0) or .seat(1) before .${what}()`);
    return current;
  };
  const seatSpec = (what: string) => {
    const spec0 = spec.seats[scope(what)];
    if (!spec0) throw new ScenarioError(`Seat ${current} does not exist`);
    return spec0;
  };
  const place =
    (zone: PlacedZone) =>
    (...args: ZoneArgs<PermanentOptions>) => {
      const seat = scope(zone);
      for (const { name, options } of entries(args)) {
        const placement: Placement = { seat, zone, name, options };
        spec.placements.push(placement);
      }
      return builder;
    };

  const builder: ScenarioBuilder = {
    seat(seat) {
      if (seat !== 0 && seat !== 1) {
        throw new ScenarioError(
          `Seat ${seat} does not exist: the engine supports exactly two seats`,
        );
      }
      current = seat;
      return builder;
    },
    life(life) {
      seatSpec('life').life = life;
      return builder;
    },
    poison(counters) {
      seatSpec('poison').poison = counters;
      return builder;
    },
    pool(mana) {
      seatSpec('pool').pool.push(mana);
      return builder;
    },
    mulligans(count) {
      seatSpec('mulligans').mulligans = count;
      return builder;
    },
    landsPlayed(count) {
      seatSpec('landsPlayed').landsPlayed = count;
      return builder;
    },
    handSizeMax(max) {
      seatSpec('handSizeMax').handSizeMax = max;
      return builder;
    },
    citysBlessing() {
      seatSpec('citysBlessing').citysBlessing = true;
      return builder;
    },
    ring(tempted) {
      seatSpec('ring').ring = tempted;
      return builder;
    },
    hand: place('hand'),
    library: place('library'),
    graveyard: place('graveyard'),
    exile: place('exile'),
    battlefield: place('battlefield'),
    command: place('command'),
    commander(name, options = {}) {
      spec.placements.push({
        seat: scope('commander'),
        zone: 'command',
        name,
        options: { ...options, commander: true },
      });
      return builder;
    },
    commanderDamageTaken(commanderName, amount) {
      seatSpec('commanderDamageTaken').commanderDamage.push({ name: commanderName, amount });
      return builder;
    },
    seed(seed) {
      spec.seed = seed;
      return builder;
    },
    settings(settings) {
      spec.settings = { ...spec.settings, ...settings };
      return builder;
    },
    define(card) {
      const issues = validateCardStructure(card);
      if (issues.length > 0) {
        throw new ScenarioError(
          `Card "${card.name}" is not a valid definition: ${issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`,
        );
      }
      (spec.custom as Map<string, CardDefinition>).set(card.name, card);
      return builder;
    },
    at(step, options = {}) {
      spec.step = step;
      spec.at = options;
      return builder;
    },
    build(options = {}) {
      const { state, labels } = assemble(spec, options);
      return createDriver(state, { labels, checkInvariants: options.checkInvariants !== false });
    },
  };
  return builder;
}
