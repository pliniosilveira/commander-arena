// Slice soak (D-109, D-115): whole games (the `soakGames()` count, test/soak.ts) with the 'pt' deck style (SYNTHETIC cards: "+1/+1 for each
// artifact you control" on an Equipment and an Aura, a creature that gets +1/+1 for each other creature,
// a lord scaled by the Elves, "-1/-1 for each creature card in your graveyard", characteristic-defining
// power and toughness from the hand, the lands, the creatures and the graveyard, "All creatures get -X/-X",
// "+X/+0", a count locked in as a spell resolves, base power and toughness from a count, "loses all
// abilities", and an {X} pump ability) between random agents, with CasualAgent in some seats. Every game
// finishes with a result, no fallback, no rejected action and consistent state after every action; the
// action log replays to the same final state; and, with the layers read again here from the cards' texts
// (not from the engine's own derive code), at every step:
//   - every creature on the battlefield, and every creature card in a graveyard, in the viewer's hand or on
//     the stack, shows the power and toughness the texts give: the defined number (layer 7a, in every zone),
//     then base values from effects (7b), then counters, effects and the counted bonuses of statics (7c),
//     for both seats' views (CR 604.3, 613.4, 611.3a);
//   - no creature stays on the battlefield with 0 or less toughness (CR 704.5f).
import {
  checkInvariants,
  type GameState,
  getView,
  type ObjectId,
  type ObjectView,
  type SeatId,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import { PT_CARD_NAMES, PT_STYLE_PAIRS, type StepInfo, smallGameConfig, stepGame } from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

interface Tally {
  steps: number;
  cdaOnBattlefield: number;
  cdaElsewhere: number;
  countedStatic: number;
  lordBonus: number;
  negativeBonus: number;
  setPtEffects: number;
  lostAbilities: number;
  xSpells: number;
  xActivations: number;
  lifelineDeaths: number;
  zeroToughnessDeaths: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  steps: 0,
  cdaOnBattlefield: 0,
  cdaElsewhere: 0,
  countedStatic: 0,
  lordBonus: 0,
  negativeBonus: 0,
  setPtEffects: 0,
  lostAbilities: 0,
  xSpells: 0,
  xActivations: 0,
  lifelineDeaths: 0,
  zeroToughnessDeaths: 0,
  byCard: new Map(),
});

const face = (state: GameState, id: ObjectId) => {
  const obj = state.objects[id];
  const card = obj?.card == null ? undefined : state.cards[obj.card];
  return card === undefined ? undefined : state.definitions[card.definition]?.faces[0];
};
const nameOf = (state: GameState, id: ObjectId): string => {
  const obj = state.objects[id] ?? state.lki[id]?.object;
  const card = obj?.card == null ? undefined : state.cards[obj.card];
  return card === undefined ? '?' : (state.definitions[card.definition]?.name ?? '?');
};
const isCreature = (state: GameState, id: ObjectId) =>
  face(state, id)?.types.includes('creature') === true;
const hasType = (state: GameState, id: ObjectId, type: string) =>
  (face(state, id)?.types as readonly string[] | undefined)?.includes(type) === true;
const lost = (state: GameState, id: ObjectId) =>
  state.continuousEffects.some(
    (e) => e.change.kind === 'loseAllAbilities' && e.objects.includes(id),
  );

/** Battlefield permanents seat controls, filtered by a predicate on the card's front face. */
const controlled = (state: GameState, seat: number, test: (id: ObjectId) => boolean): number =>
  state.battlefield.filter((id) => state.objects[id]?.controller === seat && test(id)).length;
const creaturesOf = (state: GameState, seat: number) =>
  controlled(state, seat, (id) => isCreature(state, id));
const elvesOf = (state: GameState, seat: number) =>
  controlled(
    state,
    seat,
    (id) => isCreature(state, id) && face(state, id)?.subtypes.includes('Elf') === true,
  );
const artifactsOf = (state: GameState, seat: number) =>
  controlled(state, seat, (id) => hasType(state, id, 'artifact'));
const landsOf = (state: GameState, seat: number) =>
  controlled(state, seat, (id) => hasType(state, id, 'land'));
const creatureCardsInGraveyard = (state: GameState, seat: number) =>
  (state.seats[seat]?.graveyard ?? []).filter((id) => isCreature(state, id)).length;
const handOf = (state: GameState, seat: number) => state.seats[seat]?.hand.length ?? 0;

interface Pt {
  readonly power: number;
  readonly toughness: number;
}

/** The characteristic-defining number of a card, restated from its text (synthetic-pt.ts), for `seat`. */
function defined(state: GameState, name: string, seat: number): Partial<Pt> {
  switch (name) {
    case 'SYNTHETIC Hand Hydra':
    case 'SYNTHETIC Lifeline Hydra': {
      const n = handOf(state, seat);
      return { power: n, toughness: n };
    }
    case 'SYNTHETIC Land Lurker': {
      const n = landsOf(state, seat);
      return { power: n, toughness: n };
    }
    case 'SYNTHETIC Horde Hound':
      return { power: creaturesOf(state, seat) };
    case 'SYNTHETIC Grave Ghoul': {
      const n = creatureCardsInGraveyard(state, seat);
      return { power: n, toughness: n };
    }
    default:
      return {};
  }
}

const printedStat = (value: number | '*' | null | undefined): number | '*' => value ?? 0;

/** Layers 7a to 7c for a creature the way the texts say, or null for something that is not a creature. */
function expectedPt(state: GameState, id: ObjectId): Pt | null {
  const obj = state.objects[id];
  const f = face(state, id);
  if (obj === undefined || f === undefined || !f.types.includes('creature')) return null;
  const name = nameOf(state, id);
  // "You" is the controller on the battlefield and the stack, the owner anywhere else (CR 109.5, 108.4a).
  const seat = obj.zone === 'battlefield' || obj.zone === 'stack' ? obj.controller : obj.owner;
  const gone = obj.zone === 'battlefield' && lost(state, id);
  // 7a: a printed star is the number its ability defines, or 0 without the ability.
  const def = gone ? {} : defined(state, name, seat);
  const star = (printed: number | '*', defines: number | undefined): number =>
    printed === '*' ? (defines ?? 0) : printed;
  let power = star(printedStat(f.power), def.power);
  let toughness = star(printedStat(f.toughness), def.toughness);
  if (obj.zone !== 'battlefield') return { power, toughness };
  // 7b: the last effect that sets base values.
  for (const e of state.continuousEffects) {
    if (e.change.kind === 'setPt' && e.objects.includes(id)) {
      power = e.change.power;
      toughness = e.change.toughness;
    }
  }
  // 7c: counters, effects that modify, the statics of the permanents attached and the lords.
  const counters = (obj.counters['+1/+1'] ?? 0) - (obj.counters['-1/-1'] ?? 0);
  power += counters;
  toughness += counters;
  for (const e of state.continuousEffects) {
    if (e.change.kind === 'modifyPt' && e.objects.includes(id)) {
      power += e.change.power;
      toughness += e.change.toughness;
    }
  }
  if (name === 'SYNTHETIC Pack Wolf' && !gone) {
    const others = creaturesOf(state, obj.controller) - 1;
    power += others;
    toughness += others;
  }
  for (const other of state.battlefield) {
    const o = state.objects[other];
    if (o === undefined) continue;
    const oname = nameOf(state, other);
    if (o.attachedTo === id) {
      if (oname === 'SYNTHETIC Artisan Blade' || oname === 'SYNTHETIC Artisan Aura') {
        const n = artifactsOf(state, o.controller);
        power += n;
        toughness += n;
      } else if (oname === 'SYNTHETIC Grave Chill Aura') {
        const n = creatureCardsInGraveyard(state, o.controller);
        power -= n;
        toughness -= n;
      }
    }
    if (
      oname === 'SYNTHETIC Elf Chanter' &&
      other !== id &&
      !lost(state, other) &&
      o.controller === obj.controller
    ) {
      const n = elvesOf(state, o.controller);
      power += n;
      toughness += n;
    }
  }
  return { power, toughness };
}

/** What the viewer sees of an object: the same number from either seat, from the engine's view. */
function viewsOf(state: GameState, seat: SeatId): readonly ObjectView[] {
  const v = getView(state, seat);
  const own = v.seats.find((s) => s.id === seat)?.hand ?? [];
  const graveyards = v.seats.flatMap((s) => s.graveyard);
  return [...v.battlefield, ...v.stack, ...graveyards, ...own];
}

/** Checks one state against the texts and notes which paths were met. */
function check(tally: Tally, state: GameState, where: string): void {
  for (const seat of [0, 1] as const) {
    for (const view of viewsOf(state, seat)) {
      const want = expectedPt(state, view.id as ObjectId);
      if (want === null) continue;
      expect(
        { power: view.power, toughness: view.toughness },
        `${where}: ${nameOf(state, view.id as ObjectId)} (${view.id}, ${view.zone}) in seat ${seat}'s view`,
      ).toEqual(want);
      // State-based actions are checked when a player would receive priority (CR 704.3), not in the middle
      // of a cast whose cost has already moved a card out of the hand.
      if (view.zone === 'battlefield' && state.pending?.kind === 'priority') {
        expect(view.toughness ?? 1, `${where}: ${view.id} stays with toughness 0`).toBeGreaterThan(
          0,
        );
      }
    }
  }
  for (const id of state.battlefield) {
    const name = nameOf(state, id);
    if (
      [
        'SYNTHETIC Hand Hydra',
        'SYNTHETIC Lifeline Hydra',
        'SYNTHETIC Land Lurker',
        'SYNTHETIC Horde Hound',
        'SYNTHETIC Grave Ghoul',
      ].includes(name)
    ) {
      tally.cdaOnBattlefield += 1;
    }
    const o = state.objects[id];
    if (o?.attachedTo != null) {
      const host = nameOf(state, id);
      if (host === 'SYNTHETIC Artisan Blade' || host === 'SYNTHETIC Artisan Aura') {
        tally.countedStatic += 1;
      }
      if (host === 'SYNTHETIC Grave Chill Aura') tally.negativeBonus += 1;
    }
    if (name === 'SYNTHETIC Pack Wolf' && creaturesOf(state, o?.controller ?? 0) > 1) {
      tally.countedStatic += 1;
    }
    if (name === 'SYNTHETIC Elf Chanter') tally.lordBonus += 1;
  }
  for (const seat of [0, 1]) {
    for (const zone of ['graveyard', 'hand'] as const) {
      for (const id of state.seats[seat]?.[zone] ?? []) {
        const name = nameOf(state, id);
        if (name === 'SYNTHETIC Grave Ghoul' || name === 'SYNTHETIC Hand Hydra') {
          tally.cdaElsewhere += 1;
        }
      }
    }
  }
  for (const e of state.continuousEffects) {
    if (e.change.kind === 'setPt') tally.setPtEffects += 1;
    if (e.change.kind === 'loseAllAbilities') tally.lostAbilities += 1;
  }
}

function note(tally: Tally, step: StepInfo): void {
  tally.steps += 1;
  for (const e of step.events) {
    if (e.kind === 'spellCast') {
      const name = nameOf(step.after, e.object);
      tally.byCard.set(name, (tally.byCard.get(name) ?? 0) + 1);
      if (e.x !== undefined && e.x > 0) tally.xSpells += 1;
    }
    if (e.kind === 'abilityActivated' && e.x !== undefined && e.x > 0) tally.xActivations += 1;
    if (e.kind === 'zoneChanged' && e.fromZone === 'battlefield' && e.toZone === 'graveyard') {
      const name = nameOf(step.before, e.from);
      if (name === 'SYNTHETIC Lifeline Hydra') tally.lifelineDeaths += 1;
      // It died with no damage on it, so state-based actions found its toughness at 0 (CR 704.5f).
      const before = step.before.objects[e.from];
      if (before !== undefined && before.damage === 0 && isCreature(step.before, e.from)) {
        tally.zeroToughnessDeaths += 1;
      }
    }
  }
}

test(
  `${GAMES} counted power and toughness games run clean, replay exactly and keep every layer right`,
  async () => {
    const total = newTally();
    const turns: number[] = [];
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = PT_STYLE_PAIRS[g % PT_STYLE_PAIRS.length] ?? ['pt', 'pt'];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 9000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 9000 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const tally = newTally();
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        note(tally, step);
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
        check(tally, step.after, `game ${g} step ${step.index}`);
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
    console.log(`100 counted power and toughness games: ${JSON.stringify(summary)}`);

    expectPath(total.cdaOnBattlefield);
    expectPath(total.cdaElsewhere);
    expectPath(total.countedStatic);
    expectPath(total.lordBonus);
    expectPath(total.negativeBonus);
    expectPath(total.setPtEffects);
    expectPath(total.lostAbilities);
    expectPath(total.xSpells);
    expectPath(total.lifelineDeaths);
    // Every card of the style was cast somewhere in the 100 games, or (a creature the agents only ever
    // played) at least seen; the spells that need a target cast at least once.
    for (const name of PT_CARD_NAMES) {
      expectPath(total.byCard.get(name) ?? 0, name);
    }
  },
  soakTimeout(600_000),
);
