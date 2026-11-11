// Slice soak (D-145): whole games with the 'dinosaurs' deck style (SYNTHETIC cards of the Dinosaurs slice: commanders as a filter and an
// amount, stun counters, "can't attack or block unless", mana "instead" and of any color, a static that makes a creature lose its
// abilities and changes its colors, doubling power or toughness, prevention by the creatures that deal the damage, a bite with trample
// excess, escalate, creature spells that cost much less, revealing until a land, fight, casting or playing a card for free, Hideaway and
// damage divided as the spell is cast) between random agents, with CasualAgent in some seats. Every game finishes with a result, no
// fallback, no rejected action and consistent state after every action; the action log replays to the same final state; and the rules of
// the slice are restated from the events and the state before each action, apart from the engine: a creature that can't attack or block
// unless something holds does not when it does not, a stun counter stops an untap and is removed instead, a card cast or played for
// free has the mana value its card allows and a land is played only on its player's turn, the card a Hideaway permanent exiled is
// face down to the opponent, and a division adds up to what is divided with at least 1 for each target.
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import {
  checkInvariants,
  type GameState,
  getView,
  type ObjectId,
  type SeatId,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import { faceOf, manaValueOf, tokenOrFaceNameOf } from './game-names';
import {
  DINOSAUR_LAND_NAMES,
  DINOSAUR_NAMES,
  DINOSAUR_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

/** The rites that cast or play a card for free, and the mana value they allow. */
const FREE_RITES: Readonly<Record<string, number>> = {
  'SYNTHETIC Free Cast Rite': 5,
  'SYNTHETIC Small Free Rite': 3,
  'SYNTHETIC Quick Free Rite': 5,
  'SYNTHETIC Quick Free Play Rite': 5,
  'SYNTHETIC Free Spell Rite': 5,
  'SYNTHETIC Free Play Rite': 5,
};
const HIDEAWAY = ['SYNTHETIC Hidden Cache', 'SYNTHETIC Hidden Vault'] as const;
const DIVIDERS = ['SYNTHETIC Divided Rampage', 'SYNTHETIC Measured Volley', 'SYNTHETIC Arc Volley'];

interface Tally {
  freeCasts: number;
  freePlays: number;
  hideawayExiles: number;
  hideawayPlays: number;
  hideawayChecks: number;
  divisions: number;
  dividedTargets: number;
  fights: number;
  stunRemoved: number;
  stunned: number;
  restrictedAttackers: number;
  restrictedBlockers: number;
  escalated: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  freeCasts: 0,
  freePlays: 0,
  hideawayExiles: 0,
  hideawayPlays: 0,
  hideawayChecks: 0,
  divisions: 0,
  dividedTargets: 0,
  fights: 0,
  stunRemoved: 0,
  stunned: 0,
  restrictedAttackers: 0,
  restrictedBlockers: 0,
  escalated: 0,
  byCard: new Map(),
});

const tally = (t: Tally, name: string): void => {
  t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
};

/** The creatures a seat controls, as the seat sees them. */
const creaturesOf = (state: GameState, seat: SeatId) =>
  getView(state, seat).battlefield.filter(
    (o) => o.controller === seat && o.types.includes('creature'),
  );

/**
 * Whether the creature still has its own abilities: the Elk Aura and Elk Blade of the slice make a creature an Elk that loses all abilities
 * (CR 613.1d-f), which takes the restriction away; the creatures with a restriction are Elementals by their own types.
 */
const hasOwnAbilities = (before: GameState, id: ObjectId, seat: SeatId): boolean =>
  getView(before, seat)
    .battlefield.find((o) => o.id === id)
    ?.subtypes.includes('Elemental') ?? false;

/** CR 508.1c (D-145): "can't attack unless ..." and "can't block unless ...", read before the attackers or blockers were declared. */
function holdsFor(before: GameState, name: string, id: ObjectId, seat: SeatId): boolean {
  const view = getView(before, seat);
  switch (name) {
    case 'SYNTHETIC Shy Colossus':
      return creaturesOf(before, seat).some((o) => o.id !== id && (o.power ?? 0) >= 4);
    case 'SYNTHETIC Healthy Charger':
      return (view.seats.find((s) => s.id === seat)?.life ?? 0) >= 30;
    case 'SYNTHETIC Landbound Guard':
      return (
        view.battlefield.filter((o) => o.controller === seat && o.types.includes('land')).length >=
        2
      );
    default:
      return true;
  }
}

function checkRules(t: Tally, step: StepInfo): void {
  const { before, after, action, events } = step;
  const stunnedBefore = (id: ObjectId): boolean => (before.objects[id]?.counters.stun ?? 0) > 0;

  for (const [i, e] of events.entries()) {
    if (e.kind === 'spellCast') {
      const name = tokenOrFaceNameOf(after, e.object);
      tally(t, name);
      const rite =
        before.resolution === null ? '?' : tokenOrFaceNameOf(before, before.resolution.source);
      // CR 608.2g, 118.9 (D-145): a spell cast as a rite resolves is cast without paying its mana cost.
      if (e.alternative === 'free' && before.resolution !== null) {
        const limit = FREE_RITES[rite];
        if (limit !== undefined) {
          t.freeCasts += 1;
          if (e.fromZone !== 'hand') throw new Error(`${rite} cast ${name} from ${e.fromZone}`);
          if (manaValueOf(after, e.object) > limit) {
            throw new Error(`${rite} (limit ${limit}) cast ${name}`);
          }
          if (faceOf(after, e.object)?.types.includes('land'))
            throw new Error(`${rite} cast a land`);
        }
        if ((HIDEAWAY as readonly string[]).includes(rite)) {
          t.hideawayPlays += 1;
          if (e.fromZone !== 'exile') throw new Error(`${rite} cast ${name} from ${e.fromZone}`);
        }
      }
      // CR 702.120a: more than one mode of an escalate spell.
      if ((after.objects[e.object]?.stack?.chosenModes.length ?? 0) > 1) t.escalated += 1;
    }
    if (e.kind === 'landPlayed') {
      const name = tokenOrFaceNameOf(after, e.object);
      tally(t, name);
      const rite =
        before.resolution === null ? '?' : tokenOrFaceNameOf(before, before.resolution.source);
      if (FREE_RITES[rite] !== undefined || (HIDEAWAY as readonly string[]).includes(rite)) {
        // CR 305.3: a land is played only on the turn of the player who plays it.
        if (before.turn.activeSeat !== e.seat)
          throw new Error(`${rite}: a land was played off turn`);
        if (rite === 'SYNTHETIC Hidden Vault') {
          // The condition of the Vault: the creatures its controller controls have total power 5 or greater.
          const total = creaturesOf(before, e.seat).reduce((n, o) => n + (o.power ?? 0), 0);
          if (total < 5) throw new Error(`Hidden Vault played a card with total power ${total}`);
        }
        if (FREE_RITES[rite] !== undefined) t.freePlays += 1;
        else t.hideawayPlays += 1;
      }
    }
    // CR 701.14: a fight is between two creatures.
    if (e.kind === 'fought') {
      t.fights += 1;
      for (const id of e.objects) {
        if (
          !(faceOf(before, id)?.types.includes('creature') ?? true) &&
          before.objects[id]?.token === null
        ) {
          // A creature that is not one by its card (an animated permanent) is not checked here.
        }
      }
    }
    // CR 122.1d: a stun counter replaces untapping; the permanent stays tapped.
    if (e.kind === 'untapped' && stunnedBefore(e.object)) {
      const removedFirst = events
        .slice(0, i)
        .some((x) => x.kind === 'counterRemoved' && x.object === e.object && x.counter === 'stun');
      if (!removedFirst)
        throw new Error(`${tokenOrFaceNameOf(before, e.object)} untapped with a stun counter`);
    }
    if (e.kind === 'counterRemoved' && e.counter === 'stun') t.stunRemoved += 1;
    if (e.kind === 'counterAdded' && e.counter === 'stun') t.stunned += 1;
    // "Whenever this creature attacks while you don't control another Dinosaur" does not trigger when you do (a trigger condition).
    if (
      e.kind === 'abilityTriggered' &&
      tokenOrFaceNameOf(after, e.source) === 'SYNTHETIC Slow Raptor'
    ) {
      const owner = after.objects[e.source]?.controller;
      const others =
        owner === undefined
          ? []
          : getView(before, owner).battlefield.filter(
              (o) =>
                o.controller === owner &&
                o.id !== e.source &&
                o.types.includes('creature') &&
                o.subtypes.includes('Dinosaur'),
            );
      if (others.length > 0)
        throw new Error('Slow Raptor triggered while another Dinosaur was there');
    }
  }

  // The attackers and the blockers a creature that "can't ... unless" may be.
  if (action.kind === 'declareAttackers' && before.pending?.kind === 'declareAttackers') {
    const seat = before.pending.seat;
    for (const a of after.combat?.attackers ?? []) {
      const name = tokenOrFaceNameOf(after, a.object);
      if (name === 'SYNTHETIC Shy Colossus' || name === 'SYNTHETIC Healthy Charger') {
        t.restrictedAttackers += 1;
        if (hasOwnAbilities(before, a.object, seat) && !holdsFor(before, name, a.object, seat)) {
          const mine = creaturesOf(before, seat).map(
            (o) => `${o.name} ${o.power}/${o.toughness} ${o.zone}`,
          );
          throw new Error(
            `${name} attacked and may not (seat ${seat}, life ${before.seats[seat]?.life}): ${mine.join(', ')}`,
          );
        }
      }
    }
  }
  if (action.kind === 'declareBlockers') {
    for (const b of after.combat?.blocks ?? []) {
      const name = tokenOrFaceNameOf(after, b.blocker);
      if (name === 'SYNTHETIC Shy Colossus' || name === 'SYNTHETIC Landbound Guard') {
        t.restrictedBlockers += 1;
        const seat = after.objects[b.blocker]?.controller;
        if (
          seat !== undefined &&
          hasOwnAbilities(before, b.blocker, seat) &&
          !holdsFor(before, name, b.blocker, seat)
        ) {
          throw new Error(`${name} blocked and may not`);
        }
      }
    }
  }

  // CR 601.2d: a division adds up to what is divided, with at least 1 for each target.
  if (action.kind === 'chooseTargets' && before.pending?.kind === 'targets') {
    for (const spec of before.pending.specs) {
      if (spec.divide === undefined) continue;
      const picks = action.targets.filter((x) => x.specId === spec.specId);
      t.divisions += 1;
      t.dividedTargets += picks.length;
      if (picks.length === 0) continue;
      const sum = picks.reduce((n, x) => n + (x.share ?? 0), 0);
      if (sum !== spec.divide || picks.some((x) => (x.share ?? 0) < 1)) {
        throw new Error(`a division of ${spec.divide} was ${JSON.stringify(picks)}`);
      }
      const source = tokenOrFaceNameOf(after, before.pending.source);
      if (!DIVIDERS.includes(source)) throw new Error(`${source} divides damage`);
    }
  }

  // Hideaway (CR 702.75a): the card is exiled face down; the opponent of the controller sees only a face-down card.
  if (action.kind === 'chooseCards' && before.pending?.kind === 'chooseCards') {
    const d = before.pending;
    // The source of the question is the ability on the stack; the permanent it belongs to is what names it.
    const owner = before.objects[d.source]?.stack?.source;
    if (
      d.purpose === 'lookTake' &&
      owner != null &&
      (HIDEAWAY as readonly string[]).includes(tokenOrFaceNameOf(before, owner))
    ) {
      t.hideawayExiles += 1;
      // CR 702.75a: exactly one card, and it is taken (the question has a minimum of one).
      if (action.objects.length !== 1)
        throw new Error(`Hideaway exiled ${action.objects.length} cards`);
    }
  }
  const hidden = Object.values(after.objects).filter(
    (o) => o.zone === 'exile' && o.hideaway !== undefined,
  );
  for (const o of hidden) {
    t.hideawayChecks += 1;
    const real = faceOf(after, o.id)?.name;
    for (const seat of [0, 1] as const) {
      const seen = getView(after, seat).exile.find((x) => x.id === o.id);
      const source = o.hideaway === undefined ? undefined : after.objects[o.hideaway];
      const looker = source?.zone === 'battlefield' ? source.controller : null;
      if (seen === undefined) throw new Error('a hidden card is missing from the view');
      if (seen.faceDown !== true) throw new Error('a hideaway card is not shown face down');
      if (seat !== looker && seen.name === real) {
        throw new Error(`seat ${seat} sees the hideaway card ${real}`);
      }
      if (seat === looker && seen.name !== real)
        throw new Error('the controller can not see its card');
    }
  }
}

test(
  `${GAMES} dinosaurs games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    const turns: number[] = [];
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = DINOSAUR_STYLE_PAIRS[g % DINOSAUR_STYLE_PAIRS.length] ?? [
        'dinosaurs',
        'dinosaurs',
      ];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 11700 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 11700 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const t = newTally();
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkRules(t, step);
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
      });
      const tag = `game ${g}`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      expect(stateHash(replayGame(config, log)), tag).toBe(stateHash(run.state));
      turns.push(run.state.turn.number);
      for (const key of Object.keys(t) as (keyof Tally)[]) {
        const v = t[key];
        if (typeof v === 'number') (total[key] as number) += v;
      }
      for (const [name, n] of t.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    const summary = {
      ...total,
      byCard: Object.fromEntries([...total.byCard].sort()),
      turnsMax: Math.max(...turns),
    };
    console.log(`${GAMES} dinosaurs games: ${JSON.stringify(summary)}`);

    expectPath(total.freeCasts);
    // `freePlays` (a land chosen for a rite that plays cards) needs a land drop left when the rite is cast, which the casual agent never
    // has (it plays its land first) and a random agent rarely does: that path is pinned by the scenario tests, not required here.
    expectPath(total.hideawayExiles);
    expectPath(total.hideawayPlays);
    expectPath(total.divisions);
    expectPath(total.fights);
    expectPath(total.stunRemoved);
    expectPath(total.restrictedAttackers);
    expectPath(total.escalated);
    // Every card of the slice was cast or played at least once somewhere in the games.
    for (const name of [...DINOSAUR_NAMES, ...DINOSAUR_LAND_NAMES]) {
      expectPath(total.byCard.get(name) ?? 0, name);
    }
  },
  soakTimeout(240_000),
);
