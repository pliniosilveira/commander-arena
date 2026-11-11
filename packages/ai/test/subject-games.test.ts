// Slice soak (D-133): whole games with the 'subjects' deck style (SYNTHETIC cards with lords, triggers on filtered creatures,
// "that player" and "that much", conditional statics, costs that tap or sacrifice other permanents, a replacement of a death, a
// limit on blockers and casting from the graveyard) between random agents, with CasualAgent in some seats. Every game finishes with
// a result, no fallback, no rejected action, no agent error and consistent state after every action; the action log replays
// to the same final state; and the rules of the slice are restated from the events and the state before each action, apart from
// the engine: a creature with no counters and no effect of a spell has the power its card prints plus what each lord on the
// board gives it, "the sacrificed creature's power" is the power it had when it was sacrificed, a creature that would die under a
// replacement is exiled and does not die, tapping for a cost taps exactly the permanents the cost names, "that player" is the
// player who drew, was damaged or cast, no attacker with a limit on blockers is blocked by two, and a card is cast from a
// graveyard only while its condition holds.
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import {
  checkInvariants,
  type GameObject,
  type GameState,
  type ObjectId,
  type SeatId,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import { stackNameOf, tokenOrCopyNameOf } from './game-names';
import {
  type StepInfo,
  SUBJECT_NAMES,
  SUBJECT_STYLE_PAIRS,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

interface Tally {
  lordChecks: number;
  conditionalChecks: number;
  tapCosts: number;
  sacrificeCosts: number;
  sacrificedPowerChecks: number;
  sacrificedToughnessChecks: number;
  replacedDeaths: number;
  shroudDeaths: number;
  playerChecks: number;
  muchChecks: number;
  graveyardCasts: number;
  blockLimitChecks: number;
  nontokenDeaths: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  lordChecks: 0,
  conditionalChecks: 0,
  tapCosts: 0,
  sacrificeCosts: 0,
  sacrificedPowerChecks: 0,
  sacrificedToughnessChecks: 0,
  replacedDeaths: 0,
  shroudDeaths: 0,
  playerChecks: 0,
  muchChecks: 0,
  graveyardCasts: 0,
  blockLimitChecks: 0,
  nontokenDeaths: 0,
  byCard: new Map(),
});

/** The printed power and toughness of a permanent: a card's face, or a token's characteristics; null for a `*` or none. */
function printed(
  state: GameState,
  id: ObjectId,
): {
  power: number;
  toughness: number;
  subtypes: readonly string[];
  colors: readonly string[];
} | null {
  const obj = state.objects[id];
  if (obj === undefined) return null;
  if (obj.token !== null) {
    const c = obj.token.characteristics;
    return typeof c.power === 'number' && typeof c.toughness === 'number'
      ? { power: c.power, toughness: c.toughness, subtypes: c.subtypes, colors: c.colors }
      : null;
  }
  const card = obj.card === null ? undefined : state.cards[obj.card];
  const face = card === undefined ? undefined : state.definitions[card.definition]?.faces[obj.face];
  if (face === undefined || typeof face.power !== 'number' || typeof face.toughness !== 'number') {
    return null;
  }
  return {
    power: face.power,
    toughness: face.toughness,
    subtypes: face.subtypes,
    colors: face.colors,
  };
}

/** Whether an object (on the battlefield or remembered as it last was) is a creature by its printed types. */
const isCreatureObject = (state: GameState, obj: GameObject | undefined): boolean => {
  if (obj === undefined) return false;
  if (obj.token !== null) return obj.token.characteristics.types.includes('creature');
  const card = obj.card === null ? undefined : state.cards[obj.card];
  const face = card === undefined ? undefined : state.definitions[card.definition]?.faces[obj.face];
  return face?.types.includes('creature') ?? false;
};

const isCreature = (state: GameState, id: ObjectId): boolean =>
  isCreatureObject(state, state.objects[id]);

/** The objects that some continuous effect of a resolved spell or ability applies to. */
const affected = (state: GameState): ReadonlySet<ObjectId> =>
  new Set(state.continuousEffects.flatMap((e) => [...e.objects]));

/** What the lords on the board give `id` by the rules of their cards, restated here from the state. */
function lordBonus(state: GameState, id: ObjectId): number {
  const target = state.objects[id];
  const base = printed(state, id);
  if (target === undefined || base === null) return 0;
  const nontoken = target.token === null;
  let bonus = 0;
  for (const sourceId of state.battlefield) {
    const source = state.objects[sourceId];
    if (source === undefined) continue;
    const name = tokenOrCopyNameOf(state, sourceId);
    const mine = source.controller === target.controller;
    const other = sourceId !== id;
    const life = state.seats[source.controller]?.life ?? 0;
    switch (name) {
      case 'SYNTHETIC Undead Lord':
        if (other && base.subtypes.includes('Zombie')) bonus += 1;
        break;
      case 'SYNTHETIC Bone Baron':
        if (
          mine &&
          (base.subtypes.includes('Skeleton') || (other && base.subtypes.includes('Zombie')))
        )
          bonus += 1;
        break;
      case 'SYNTHETIC Vigil Captain':
        if (mine && nontoken) bonus += 1;
        break;
      case 'SYNTHETIC Muster Sergeant':
        if (mine && other && nontoken) bonus += 1;
        break;
      case 'SYNTHETIC Token Herald':
        if (mine && !nontoken) bonus += 1;
        break;
      case 'SYNTHETIC Colorless Banner':
        if (mine && base.colors.length === 0) bonus += 1;
        break;
      case 'SYNTHETIC Field Marshal': {
        // "As long as you control your commander, ~ gets +2/+2": a card the controller owns that is a commander.
        const own = state.battlefield.some((o) => {
          const x = state.objects[o];
          return (
            x !== undefined &&
            x.controller === source.controller &&
            x.owner === source.controller &&
            x.card !== null &&
            state.cards[x.card]?.isCommander === true
          );
        });
        if (own && !other) bonus += 2;
        break;
      }
      case 'SYNTHETIC Prime Valkyrie':
        if (mine && life >= state.settings.startingLife + 7) bonus += 2;
        break;
      case 'SYNTHETIC Hale Brute':
        if (!other && life >= 30) bonus += 3;
        break;
      case 'SYNTHETIC Zombie Pact': {
        if (other) break;
        const others = state.battlefield.filter(
          (o) =>
            o !== sourceId &&
            state.objects[o]?.controller === source.controller &&
            isCreature(state, o) &&
            (printed(state, o)?.subtypes ?? []).includes('Zombie'),
        );
        if (others.length > 0) bonus += 1;
        break;
      }
      default:
        break;
    }
  }
  return bonus;
}

/** Notes what one applied action did and checks the rules of the slice against the board it was done on. */
function note(
  tally: Tally,
  step: StepInfo,
  readPt: (state: GameState, id: ObjectId) => { power: number; toughness: number } | null,
): void {
  const { before, after, events } = step;
  const resolving = before.resolution?.object ?? before.stack[before.stack.length - 1];
  const resolvingName = resolving === undefined ? '' : stackNameOf(before, resolving);
  const controller: SeatId | undefined =
    resolving === undefined ? undefined : before.objects[resolving]?.controller;

  for (const e of events) {
    if (e.kind === 'spellCast') {
      const name = tokenOrCopyNameOf(after, e.object);
      tally.byCard.set(name, (tally.byCard.get(name) ?? 0) + 1);
    }
  }

  // Lords: a creature with no counters and no effect of a spell has what its card prints plus what each lord gives it.
  const touched = affected(after);
  for (const id of after.battlefield) {
    const obj = after.objects[id];
    if (obj === undefined || !isCreature(after, id) || touched.has(id)) continue;
    if (Object.values(obj.counters).some((n) => n > 0)) continue;
    const base = printed(after, id);
    const have = readPt(after, id);
    if (base === null || have === null) continue;
    const bonus = lordBonus(after, id);
    if (
      bonus !== 0 &&
      (have.power !== base.power + bonus || have.toughness !== base.toughness + bonus)
    ) {
      throw new Error(
        `${tokenOrCopyNameOf(after, id)} should be ${base.power + bonus}/${base.toughness + bonus} (printed ${base.power}/${base.toughness}, lords ${bonus}), the engine says ${have.power}/${have.toughness}`,
      );
    }
    if (bonus !== 0) tally.lordChecks += 1;
  }
  // The conditional statics: the same rule with a condition (life, an untapped source, a Zombie).
  tally.conditionalChecks += after.battlefield.filter((id) => {
    const name = tokenOrCopyNameOf(after, id);
    return (
      name === 'SYNTHETIC Hale Brute' ||
      name === 'SYNTHETIC Zombie Pact' ||
      name === 'SYNTHETIC Prime Valkyrie'
    );
  }).length;

  // Replacements of a death: nothing dies that a replacement on the board (as the event began) replaces.
  const collectors = before.battlefield.filter(
    (id) => tokenOrCopyNameOf(before, id) === 'SYNTHETIC Soul Collector',
  );
  const shrouds = before.battlefield.filter(
    (id) => tokenOrCopyNameOf(before, id) === 'SYNTHETIC Quiet Shroud',
  );
  for (const e of events) {
    if (e.kind !== 'died') continue;
    const dead = before.objects[e.object] ?? after.lki[e.object]?.object;
    if (dead === undefined) continue;
    // `died` is emitted for every permanent (D-175, CR 700.4: a Treasure token, an Aura or a land "dies" too), but
    // the replacements of this slice are about creatures only (a Quiet Shroud: "If a creature would die", a Soul
    // Collector: "a nontoken creature an opponent controls"), so only a creature's death is held to them.
    if (!isCreatureObject(before, dead)) continue;
    if (dead.token === null) tally.nontokenDeaths += 1;
    if (shrouds.length > 0) {
      // Nothing dies while a Quiet Shroud is on the battlefield, unless it lost its abilities this very action.
      const lost = after.continuousEffects.some((c) => c.change.kind === 'loseAllAbilities');
      if (!lost)
        throw new Error(
          `${tokenOrCopyNameOf(after, e.object)} died with a Quiet Shroud on the battlefield`,
        );
    }
    for (const c of collectors) {
      const owner = before.objects[c]?.controller;
      if (owner !== undefined && dead.controller !== owner && dead.token === null) {
        const lost = after.continuousEffects.some((x) => x.change.kind === 'loseAllAbilities');
        if (!lost) throw new Error(`a nontoken creature of an opponent of a Soul Collector died`);
      }
    }
  }
  for (const e of events) {
    if (e.kind !== 'zoneChanged' || e.fromZone !== 'battlefield' || e.toZone !== 'exile') continue;
    const was = before.objects[e.from];
    if (was === undefined || was.token !== null) continue;
    if (shrouds.length > 0 || collectors.length > 0) tally.replacedDeaths += 1;
    if (shrouds.length > 0) tally.shroudDeaths += 1;
  }

  // Tapping for a cost: exactly the permanents the cost names, untapped before, mine.
  const activated = events.find((e) => e.kind === 'abilityActivated');
  if (activated?.kind === 'abilityActivated') {
    const sourceName = tokenOrCopyNameOf(before, activated.source);
    const tapCost: Record<
      string,
      { count: number; match: (id: ObjectId) => boolean; plusSource?: boolean }
    > = {
      'SYNTHETIC Grave Whisperer': {
        count: 3,
        match: (id) =>
          (printed(before, id)?.subtypes ?? []).includes('Zombie') && isCreature(before, id),
      },
      'SYNTHETIC Whirling Rogue': { count: 2, match: (id) => artifactOf(before, id) },
      'SYNTHETIC Clockwork Ledger': { count: 2, match: (id) => artifactOf(before, id) },
      'SYNTHETIC Shield Mentor': {
        count: 1,
        match: (id) => isCreature(before, id) && id !== activated.source,
        plusSource: true,
      },
    };
    const cost = tapCost[sourceName];
    if (cost !== undefined) {
      const tapped = events.flatMap((e) => (e.kind === 'tapped' ? [e.object] : []));
      // The {T} of the source is paid when the activation begins, a step before the choice of the permanents to tap when
      // the engine had to ask.
      const sourceWasTapped = before.objects[activated.source]?.tapped === true;
      const expected = cost.count + (cost.plusSource && !sourceWasTapped ? 1 : 0);
      if (tapped.length !== expected) {
        throw new Error(
          `${sourceName} tapped ${tapped.length} permanents for a cost of ${expected}`,
        );
      }
      for (const id of tapped) {
        const o = before.objects[id];
        if (o === undefined || o.tapped || o.controller !== activated.seat) {
          throw new Error(`${sourceName} tapped a permanent it could not: ${id}`);
        }
        if (id !== activated.source || !cost.plusSource) {
          if (!cost.match(id) && !(id === activated.source && cost.plusSource)) {
            throw new Error(`${sourceName} tapped a permanent that does not match its cost`);
          }
        }
      }
      tally.tapCosts += 1;
    }
  }

  // The ability that resolves: costs paid by sacrifice, "that player", "that much".
  const resolved = events.some((e) => e.kind === 'resolved' && e.object === resolving);
  if (resolving === undefined || controller === undefined || !resolved) return;
  const stack = before.objects[resolving]?.stack;
  // The ability of a card and the spell of the same card are different resolutions: only abilities are checked here.
  if (stack?.kind !== 'ability') return;
  const opp = (1 - controller) as SeatId;
  const lifeDelta = (seat: SeatId): number =>
    (after.seats[seat]?.life ?? 0) - (before.seats[seat]?.life ?? 0);
  switch (resolvingName) {
    case 'SYNTHETIC Ghoul Summoner': {
      const gone = stack?.sacrificedAsCost ?? [];
      if (gone.length !== 1) throw new Error(`Ghoul Summoner sacrificed ${gone.length} creatures`);
      const id = gone[0] as ObjectId;
      const power = Math.max(0, before.lki[id]?.power ?? -1);
      const tokens = events.filter((e) => e.kind === 'tokenCreated' && e.name === 'Zombie').length;
      if (tokens !== power)
        throw new Error(`Ghoul Summoner made ${tokens} Zombies for a sacrificed power of ${power}`);
      tally.sacrificeCosts += 1;
      tally.sacrificedPowerChecks += 1;
      break;
    }
    case 'SYNTHETIC Altar Scholar': {
      const gone = stack?.sacrificedAsCost ?? [];
      const id = gone[0];
      if (id === undefined) throw new Error('Altar Scholar sacrificed nothing');
      const toughness = Math.max(0, before.lki[id]?.toughness ?? -1);
      const draws = events.filter((e) => e.kind === 'cardDrawn' && e.seat === controller).length;
      const cost = before.lki[id]?.characteristics.manaCost ?? null;
      const mv = (cost ?? []).reduce(
        (n, symbol) => n + (/^\d+$/.test(symbol) ? Number(symbol) : symbol === 'X' ? 0 : 1),
        0,
      );
      if (lifeDelta(controller) !== toughness) {
        throw new Error(
          `Altar Scholar gained ${lifeDelta(controller)}, the toughness was ${toughness}`,
        );
      }
      if (
        draws !== Math.min(mv, draws + (before.seats[controller]?.library.length ?? 0)) &&
        draws !== mv
      ) {
        // A library that runs out stops the draws early; a real card's mana value is read as printed.
        if (draws > mv)
          throw new Error(`Altar Scholar drew ${draws} cards for a mana value of ${mv}`);
      }
      tally.sacrificeCosts += 1;
      tally.sacrificedToughnessChecks += 1;
      break;
    }
    case 'SYNTHETIC Thopter Weaver': {
      const gone = stack?.sacrificedAsCost ?? [];
      if (gone.length !== 2) throw new Error(`Thopter Weaver sacrificed ${gone.length} permanents`);
      for (const id of gone) {
        if (!(before.lki[id]?.characteristics.types ?? []).includes('artifact')) {
          throw new Error('Thopter Weaver sacrificed something that is not an artifact');
        }
      }
      tally.sacrificeCosts += 1;
      break;
    }
    case 'SYNTHETIC Volatile Imp': {
      const gone = stack?.sacrificedAsCost ?? [];
      if (gone[0] === undefined) throw new Error('Volatile Imp sacrificed nothing');
      tally.sacrificeCosts += 1;
      break;
    }
    case 'SYNTHETIC Reaver Cousin': {
      // "That player discards": the player who was dealt the damage, an opponent of the controller.
      for (const e of events) {
        if (e.kind === 'discarded' && e.seat === controller)
          throw new Error('Reaver Cousin made its controller discard');
      }
      tally.playerChecks += 1;
      break;
    }
    case 'SYNTHETIC Crawler Cousin': {
      if (lifeDelta(controller) < 0)
        throw new Error('Crawler Cousin made its controller lose life');
      if (lifeDelta(opp) !== -1)
        throw new Error('Crawler Cousin did not make the player who drew lose 1 life');
      tally.playerChecks += 1;
      break;
    }
    case 'SYNTHETIC Decree Stone': {
      // "That creature's controller loses 1 life": the attacker's controller, the other player.
      if (lifeDelta(opp) !== -1 || lifeDelta(controller) < 0) {
        throw new Error("Decree Stone did not make the attacker's controller lose 1 life");
      }
      tally.playerChecks += 1;
      break;
    }
    case 'SYNTHETIC Soulful Seraph': {
      const damage = stack?.triggerDamage;
      if (damage === undefined || lifeDelta(controller) !== damage) {
        throw new Error(`Soulful Seraph gained ${lifeDelta(controller)} for ${damage} damage`);
      }
      tally.muchChecks += 1;
      break;
    }
    default:
      break;
  }
}

function artifactOf(state: GameState, id: ObjectId): boolean {
  const obj = state.objects[id] ?? state.lki[id]?.object;
  if (obj === undefined) return false;
  if (obj.token !== null) return obj.token.characteristics.types.includes('artifact');
  const card = obj.card === null ? undefined : state.cards[obj.card];
  const face = card === undefined ? undefined : state.definitions[card.definition]?.faces[obj.face];
  return face?.types.includes('artifact') ?? false;
}

/** Declared blockers against the limit "can't be blocked by more than one creature", and casts from a graveyard. */
function checkRules(
  tally: Tally,
  step: StepInfo,
  limited: (state: GameState, id: ObjectId) => boolean,
): void {
  const { before, events, action } = step;
  for (const e of events) {
    if (e.kind !== 'blockersDeclared') continue;
    const per = new Map<ObjectId, number>();
    for (const b of e.blocks) per.set(b.attacker, (per.get(b.attacker) ?? 0) + 1);
    for (const [attacker, n] of per) {
      if (limited(step.before, attacker)) {
        tally.blockLimitChecks += 1;
        if (n > 1)
          throw new Error('an attacker that cannot be blocked by more than one creature was');
      }
    }
  }
  // A card cast from a graveyard: its condition held as it was cast.
  if (action.kind === 'castSpell') {
    const was = before.objects[action.object];
    if (was?.zone === 'graveyard' && action.alternative === undefined) {
      const name = tokenOrCopyNameOf(before, action.object);
      if (name === 'SYNTHETIC Restless Corpse') {
        const zombie = before.battlefield.some((id) => {
          const o = before.objects[id];
          return (
            o?.controller === was.owner &&
            isCreature(before, id) &&
            (printed(before, id)?.subtypes ?? []).includes('Zombie')
          );
        });
        if (!zombie) throw new Error('Restless Corpse was cast from the graveyard with no Zombie');
      }
      if (name !== 'SYNTHETIC Restless Corpse' && name !== 'SYNTHETIC Stubborn Shade') {
        throw new Error(`${name} was cast from a graveyard`);
      }
      tally.graveyardCasts += 1;
    }
  }
}

test(
  `${GAMES} subject games run clean, replay exactly and use every path of the slice`,
  async () => {
    const total = newTally();
    const turns: number[] = [];
    // The engine's own reading of power and toughness and of the restriction, through the public view of the object.
    const { getView } = await import('@commander-arena/engine');
    // One view for each seat and state, however many permanents are asked about.
    const views = new WeakMap<GameState, Map<SeatId, ReturnType<typeof getView>>>();
    const viewOf = (state: GameState, id: ObjectId) => {
      const obj = state.objects[id];
      if (obj === undefined) return undefined;
      let bySeat = views.get(state);
      if (bySeat === undefined) {
        bySeat = new Map();
        views.set(state, bySeat);
      }
      let view = bySeat.get(obj.controller);
      if (view === undefined) {
        view = getView(state, obj.controller);
        bySeat.set(obj.controller, view);
      }
      return view.battlefield.find((o) => o.id === id);
    };
    const readPt = (state: GameState, id: ObjectId) => {
      const v = viewOf(state, id);
      return v === undefined || v.power === null || v.toughness === null
        ? null
        : { power: v.power, toughness: v.toughness };
    };
    const limited = (state: GameState, id: ObjectId) =>
      viewOf(state, id)?.restrictions?.includes('cantBeBlockedByMoreThanOne') === true;
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = SUBJECT_STYLE_PAIRS[g % SUBJECT_STYLE_PAIRS.length] ?? [
        'subjects',
        'subjects',
      ];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 9300 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 9300 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const tally = newTally();
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        note(tally, step, readPt);
        checkRules(tally, step, limited);
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
      });
      const tag = `game ${g}`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      expect(stateHash(replayGame(config, log)), tag).toBe(stateHash(run.state));
      turns.push(run.state.turn.number);
      for (const key of Object.keys(tally) as (keyof Tally)[]) {
        const v = tally[key];
        if (typeof v === 'number') (total[key] as number) += v;
      }
      for (const [name, n] of tally.byCard)
        total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    const summary = {
      ...total,
      byCard: Object.fromEntries([...total.byCard].sort()),
      turnsMax: Math.max(...turns),
    };
    console.log(`${GAMES} subject games: ${JSON.stringify(summary)}`);

    expectPath(total.lordChecks);
    expectPath(total.conditionalChecks);
    expectPath(total.tapCosts);
    expectPath(total.sacrificeCosts);
    expectPath(total.nontokenDeaths);
    // Every card of the slice was cast at least once somewhere in the games, except the ones that need a board no random game
    // builds (they are pinned in the scenario tests).
    for (const name of SUBJECT_NAMES) {
      expectPath(total.byCard.get(name) ?? 0, name);
    }
  },
  soakTimeout(240_000),
);
