// Slice soak (D-187): whole games with the 'korvoldSingles' deck style (SYNTHETIC cards of the Korvold slice 7a: the sacrifice of one or more Treasures with
// "up to that many" targets, +1/+0 for each time a creature attacked and an additional combat phase after a main phase, and an Adventure that exiles the top two
// cards of an opponent's library face down) between random agents, with CasualAgent in some seats. Every game finishes with a result, no fallback, no rejected
// action and consistent state after every action; the action log replays to the same final state; and rules of the slice are restated from the events and the
// state, apart from the engine: a card exiled face down is shown as the placeholder to every player who may not look at it, a card of another player that is
// cast from the pile goes to its owner's graveyard when it dies, the number of targets of the reflexive ability is at most the number of Treasures sacrificed
// for it, and the phases an effect added are all gone when the turn ends.
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import {
  checkInvariants,
  type GameState,
  getView,
  type ObjectId,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import {
  KORVOLD_SINGLE_LEGENDS,
  KORVOLD_SINGLE_NAMES,
  KORVOLD_SINGLE_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };
const FACE_DOWN = 'Face-down card';

interface Tally {
  piles: number;
  attacksWithTreasure: number;
  mayQuestions: number;
  castFromPile: number;
  sacrificeQuestions: number;
  treasuresSacrificed: number;
  targetQuestions: number;
  extraCombats: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  piles: 0,
  attacksWithTreasure: 0,
  mayQuestions: 0,
  castFromPile: 0,
  sacrificeQuestions: 0,
  treasuresSacrificed: 0,
  targetQuestions: 0,
  extraCombats: 0,
  byCard: new Map(),
});

interface Memory {
  /** The combat phases begun in the turn so far. */
  combats: number;
  /** The Treasures the last "sacrifice one or more" answer sacrificed, for the reflexive ability that follows it. */
  sacrificed: number | null;
}

const nameOf = (state: GameState, id: ObjectId): string => {
  const obj = state.objects[id];
  if (obj === undefined) return '?';
  if (obj.token !== null) return obj.token.characteristics.name;
  const card = obj.card == null ? undefined : state.cards[obj.card];
  return card === undefined
    ? '?'
    : (state.definitions[card.definition]?.faces[obj.face ?? 0]?.name ?? '?');
};

const tally = (t: Tally, name: string): void => {
  t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
};

function checkRules(t: Tally, step: StepInfo, memory: Memory): void {
  const { before, after, action, events } = step;

  for (const e of events) {
    if (e.kind === 'turnBegan') {
      memory.combats = 0;
      memory.sacrificed = null;
      // CR 500.8: every phase an effect added has begun by the end of the turn (and the list is empty as the next turn begins).
      if ((after.turn.addedPhases ?? []).length > 0)
        throw new Error('an added phase outlived its turn');
      if (after.turn.addedAfter !== undefined) throw new Error('an added phase was left open');
    }
    if (e.kind === 'stepBegan' && e.step === 'beginningOfCombat') {
      memory.combats += 1;
      if (memory.combats === 2) t.extraCombats += 1;
    }
    if (e.kind === 'spellCast') {
      const spell = after.objects[e.object];
      const card = spell?.card == null ? undefined : after.cards[spell.card];
      const name =
        card === undefined
          ? undefined
          : after.definitions[card.definition]?.faces[spell?.face ?? 0]?.name;
      if (name !== undefined) tally(t, name);
      // A card the caster does not own was cast: it came from the pile of the other player's library.
      if (spell !== undefined && spell.owner !== spell.controller) t.castFromPile += 1;
    }
    if (e.kind === 'landPlayed') {
      const land = after.objects[e.object];
      if (land !== undefined && land.owner !== land.controller) t.castFromPile += 1;
    }
    // The cards a face-down exile took: two (or fewer when the library had fewer) cards of one owner, in one resolution.
    if (
      e.kind === 'zoneChanged' &&
      e.toZone === 'exile' &&
      after.objects[e.to]?.exiledFaceDown === true
    ) {
      if (e.fromZone !== 'library')
        throw new Error('a card exiled face down came from another zone');
      t.piles += 1;
    }
  }

  // CR 406.3: no player but the ones allowed may look at a card exiled face down: their view has the placeholder.
  for (const seat of [0, 1] as const) {
    const view = getView(after, seat);
    for (const o of view.exile) {
      const real = after.objects[o.id];
      if (real?.exiledFaceDown !== true) continue;
      const may = real.lookers?.includes(seat) === true;
      if (!may && (o.name !== FACE_DOWN || o.types.length > 0 || o.oracleText !== '')) {
        throw new Error(`seat ${seat} sees a card exiled face down`);
      }
      if (may && o.name === FACE_DOWN)
        throw new Error(`seat ${seat} may look at a card and does not`);
    }
  }

  // "Sacrifice one or more Treasures": at least one, and the reflexive ability takes up to as many targets as were sacrificed.
  const pending = before.pending;
  if (events.some((e) => e.kind === 'attackersDeclared')) {
    const mine = before.turn.activeSeat;
    const own = after.battlefield.filter((id) => after.objects[id]?.controller === mine);
    const raider = own.some((id) => nameOf(after, id) === 'SYNTHETIC Treasure Raider');
    const treasure = own.some(
      (id) => after.objects[id]?.token?.characteristics.name === 'Treasure',
    );
    if (raider && treasure) t.attacksWithTreasure += 1;
  }
  if (
    pending?.kind === 'confirmOptional' &&
    String(JSON.stringify(before.objects[pending.source]?.stack?.ability)).includes('atLeastOne')
  )
    t.mayQuestions += 1;
  // The question of "sacrifice one or more Treasures": the ability on the stack says it (an edict asks for a minimum of one as well).
  const ability =
    pending?.kind === 'choosePermanent'
      ? before.objects[pending.source]?.stack?.ability
      : undefined;
  if (
    pending?.kind === 'choosePermanent' &&
    pending.purpose === 'sacrifice' &&
    String(JSON.stringify(ability)).includes('"atLeastOne":true')
  ) {
    t.sacrificeQuestions += 1;
    if (action.kind === 'choosePermanents') {
      if (action.objects.length < 1) throw new Error('one or more was answered with none');
      t.treasuresSacrificed += action.objects.length;
      memory.sacrificed = action.objects.length;
    }
  }
  if (pending?.kind === 'targets' && memory.sacrificed !== null) {
    t.targetQuestions += 1;
    const slot = pending.specs[0];
    if (slot !== undefined && slot.max > memory.sacrificed) {
      throw new Error('the reflexive ability takes more targets than Treasures were sacrificed');
    }
    memory.sacrificed = null;
  }

  // A card of another player that left the battlefield is in its owner's graveyard (CR 400.3), never in the controller's.
  for (const e of events) {
    if (e.kind !== 'zoneChanged' || e.toZone !== 'graveyard' || e.fromZone !== 'battlefield')
      continue;
    const from = before.objects[e.from as ObjectId];
    const now = after.objects[e.to];
    if (
      from !== undefined &&
      now !== undefined &&
      from.token === null &&
      now.zoneOwner !== from.owner
    ) {
      throw new Error("a card went to a graveyard that is not its owner's");
    }
  }
}

test(
  `${GAMES} Korvold singles games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = KORVOLD_SINGLE_STYLE_PAIRS[g % KORVOLD_SINGLE_STYLE_PAIRS.length] ?? [
        'korvoldSingles',
        'korvoldSingles',
      ];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 19500 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 19500 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const t = newTally();
      const memory: Memory = { combats: 0, sacrificed: null };
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkRules(t, step, memory);
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
      });
      const tag = `game ${g}`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      expect(stateHash(replayGame(config, log)), tag).toBe(stateHash(run.state));
      for (const key of Object.keys(t) as (keyof Tally)[]) {
        const v = t[key];
        if (typeof v === 'number') (total[key] as number) += v;
      }
      for (const [name, n] of t.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    console.log(
      `${GAMES} Korvold singles games: ${JSON.stringify({ ...total, byCard: Object.fromEntries([...total.byCard].sort()) })}`,
    );

    // Every card of the slice was cast at least once somewhere in the games, an Adventure by either face.
    for (const name of [
      'Taste of Riches',
      'Feast Dragon',
      'SYNTHETIC Treasure Raider',
      ...KORVOLD_SINGLE_LEGENDS,
    ]) {
      expectPath(total.byCard.get(name) ?? 0, name);
    }
    expectPath(total.piles, 'cards exiled face down');
    expectPath(total.castFromPile, 'a card of another player cast or played');
    // The question of Treasure Raider's "you may sacrifice one or more Treasures" is asked (the casual agent declines it, as it does any costly "you may");
    // its answer and the number of targets that follow are checked whenever an agent says yes, which the payment planner of the random agents makes rare
    // (their Treasures are spent on mana before an attack): the scenario tests pin both, `casual-korvold-singles.test.ts` the agent's answers.
    expectPath(total.mayQuestions, 'the question of the sacrifice of one or more');
    expectPath(total.extraCombats, 'an additional combat phase');
  },
  soakTimeout(240_000),
);

void KORVOLD_SINGLE_NAMES;
