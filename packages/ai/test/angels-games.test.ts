// Slice soak (D-149): whole games with the 'angels' deck style (SYNTHETIC cards of the Angels slice: life gain with a bonus, counters added to
// a permanent, several creatures attacking, creatures that enter with counters, commanders entering or attacking, proliferate, a creature
// that can't be cast early, hexproof for the player, prevention to a creature, a tax on blocking, mana to spend only on some spells or of the
// chosen color, an exile that ends when its source leaves, an Aura that enters by an effect, a grant to creatures with flying and an
// alternative cost that taps four of them) between random agents, with CasualAgent in some seats. Every game finishes with a result, no
// fallback, no rejected action and consistent state after every action; the action log replays to the same final state; and the rules of
// the slice are restated from the events and the state before each action, apart from the engine: a creature that can't be cast in the first
// three turns is not, a creature that taxes blocking is paid for by the blockers' controller, the four creatures an alternative cost taps
// are untapped creatures with flying of the caster, proliferate gives one more counter of each kind that was there, and a player with
// hexproof is not targeted by an opponent's spell.
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
import { tokenOrFaceNameOf } from './game-names';
import {
  ANGEL_NAMES,
  ANGEL_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

const LATE = ['SYNTHETIC Late Avenger', 'SYNTHETIC Quick Avenger'];
const UNTIL = ['SYNTHETIC Grasp of Law', 'SYNTHETIC Banishing Warden', 'SYNTHETIC Dawn Shepherd'];

interface Tally {
  tapCasts: number;
  tapChoices: number;
  proliferations: number;
  proliferatedObjects: number;
  blockTaxPaid: number;
  blockersTaxed: number;
  lifeGains: number;
  countersByPlayer: number;
  exiledByEffect: number;
  lateCasts: number;
  hexproofChecks: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  tapCasts: 0,
  tapChoices: 0,
  proliferations: 0,
  proliferatedObjects: 0,
  blockTaxPaid: 0,
  blockersTaxed: 0,
  lifeGains: 0,
  countersByPlayer: 0,
  exiledByEffect: 0,
  lateCasts: 0,
  hexproofChecks: 0,
  byCard: new Map(),
});

const tally = (t: Tally, name: string): void => {
  t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
};

/** The permanents on the battlefield a seat controls with this name, as the seat sees them. */
const controlled = (state: GameState, seat: SeatId, name: string): number =>
  getView(state, seat).battlefield.filter((o) => o.controller === seat && o.name === name).length;

/** Whether a creature on the battlefield has flying as the seat sees it. */
const flies = (state: GameState, seat: SeatId, id: ObjectId): boolean =>
  getView(state, seat)
    .battlefield.find((o) => o.id === id)
    ?.keywords.includes('flying') ?? false;

function checkRules(t: Tally, step: StepInfo, turnsOf: number[]): void {
  const { before, after, action, events } = step;

  for (const e of events) {
    if (e.kind === 'turnBegan') turnsOf[e.seat] = (turnsOf[e.seat] ?? 0) + 1;
    if (e.kind === 'lifeGained') t.lifeGains += 1;
    if (e.kind === 'counterAdded' && e.by !== undefined) t.countersByPlayer += 1;
    if (e.kind === 'spellCast') {
      const name = tokenOrFaceNameOf(after, e.object);
      tally(t, name);
      // CR 118.9, 601.2h (D-149): paying {W} and tapping four untapped creatures with flying.
      if (e.alternative === 'tapPermanents') t.tapCasts += 1;
      // "You can't cast this creature during your first, second, or third turns of the game": a turn of its caster.
      if (LATE.includes(name)) {
        t.lateCasts += 1;
        if (before.turn.activeSeat === e.seat && (turnsOf[e.seat] ?? 0) <= 3) {
          throw new Error(`${name} was cast in turn ${turnsOf[e.seat]} of seat ${e.seat}`);
        }
      }
    }
    if (e.kind === 'landPlayed') tally(t, tokenOrFaceNameOf(after, e.object));
    // CR 701.34a: proliferate gives one more counter of each kind a chosen permanent had.
    if (e.kind === 'proliferated') {
      t.proliferations += 1;
      for (const id of e.objects) {
        t.proliferatedObjects += 1;
        const had = Object.entries(before.objects[id]?.counters ?? {})
          .filter(([, n]) => n > 0)
          .map(([kind]) => kind)
          .sort();
        const got = events
          .filter((x) => x.kind === 'counterAdded' && x.object === id)
          .map((x) => (x.kind === 'counterAdded' ? x.counter : ''))
          .sort();
        if (JSON.stringify(had) !== JSON.stringify(got)) {
          throw new Error(`proliferate gave ${got.join(',')} to a permanent with ${had.join(',')}`);
        }
      }
    }
    // D-149: an exile "until this leaves the battlefield" by an ability of an Angels card that is on top of the stack as it resolves.
    if (e.kind === 'zoneChanged' && e.toZone === 'exile' && e.fromZone === 'battlefield') {
      const top = before.stack[before.stack.length - 1];
      const source = top === undefined ? undefined : before.objects[top]?.stack?.source;
      if (source != null && UNTIL.includes(tokenOrFaceNameOf(before, source)))
        t.exiledByEffect += 1;
    }
    // The four permanents the alternative cost taps are untapped creatures with flying of the caster.
    if (e.kind === 'permanentsChosen' && e.purpose === 'tap') {
      const sourceName = tokenOrFaceNameOf(before, e.source);
      if (sourceName === 'SYNTHETIC Sky Blade Angel') {
        t.tapChoices += 1;
        if (e.objects.length !== 4) throw new Error(`Sky Blade Angel tapped ${e.objects.length}`);
        for (const id of e.objects) {
          const o = getView(before, e.seat).battlefield.find((x) => x.id === id);
          if (o === undefined || o.controller !== e.seat || !o.types.includes('creature')) {
            throw new Error(
              'a permanent that is not the caster’s creature was tapped for the cost',
            );
          }
          if (o.tapped) throw new Error('a tapped creature was tapped for the cost');
          if (!flies(before, e.seat, id)) throw new Error(`${o.name} has no flying`);
        }
      }
    }
  }

  // CR 509.1d (D-149): the blockers' controller pays {1} for each creature that blocks while a tax is in effect.
  if (action.kind === 'declareBlockers' && before.pending?.kind === 'declareBlockers') {
    const blockers = new Set(action.blocks.map((b) => b.blocker));
    const seat = before.pending.seat;
    const taxes = [
      ...Object.values(after.objects).filter(
        (o) =>
          o.zone === 'battlefield' && tokenOrFaceNameOf(after, o.id) === 'SYNTHETIC Toll Bridge',
      ),
      ...(after.combat?.attackers ?? []).filter(
        (a) => tokenOrFaceNameOf(after, a.object) === 'SYNTHETIC Tithe Angel',
      ),
    ];
    if (blockers.size > 0 && taxes.length > 0) {
      t.blockersTaxed += blockers.size;
      const d = after.pending;
      if (d?.kind !== 'payMana' || d.seat !== seat) {
        throw new Error('blocking under a tax asked no payment from the blockers’ controller');
      }
      if (d.totalCost.length !== blockers.size * taxes.length) {
        throw new Error(`the block cost was ${d.totalCost.join('')} for ${blockers.size} blockers`);
      }
      t.blockTaxPaid += 1;
    }
  }

  // "You have hexproof": an opponent's spell or ability does not target the player.
  if (action.kind === 'chooseTargets' && before.pending?.kind === 'targets') {
    const chooser = before.pending.seat;
    for (const picked of action.targets) {
      if (picked.kind !== 'player' || picked.seat === chooser) continue;
      t.hexproofChecks += 1;
      if (controlled(before, picked.seat, 'SYNTHETIC Warded Angel') > 0) {
        throw new Error(`seat ${chooser} targeted seat ${picked.seat}, who has hexproof`);
      }
    }
  }

  // "Prevent all damage that would be dealt to this creature": no damage is ever marked on it.
  for (const o of Object.values(after.objects)) {
    if (
      o.zone === 'battlefield' &&
      o.damage > 0 &&
      tokenOrFaceNameOf(after, o.id) === 'SYNTHETIC Stone Seraph'
    ) {
      throw new Error('damage was marked on a Stone Seraph');
    }
  }
}

test(
  `${GAMES} angels games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    const turns: number[] = [];
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = ANGEL_STYLE_PAIRS[g % ANGEL_STYLE_PAIRS.length] ?? ['angels', 'angels'];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 14900 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 14900 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const t = newTally();
      const turnsOf: number[] = [0, 0];
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkRules(t, step, turnsOf);
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
    console.log(`${GAMES} angels games: ${JSON.stringify(summary)}`);

    expectPath(total.tapCasts);
    expectPath(total.tapChoices);
    expectPath(total.proliferations);
    expectPath(total.proliferatedObjects);
    expectPath(total.blockTaxPaid);
    expectPath(total.lifeGains);
    expectPath(total.countersByPlayer);
    expectPath(total.exiledByEffect);
    expectPath(total.lateCasts);
    // Every card of the slice was cast or played at least once somewhere in the games.
    for (const name of ANGEL_NAMES) expectPath(total.byCard.get(name) ?? 0, name);
  },
  soakTimeout(240_000),
);
