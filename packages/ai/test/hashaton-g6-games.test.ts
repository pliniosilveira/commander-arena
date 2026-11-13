// Slice soak (D-376, D-377, provisional): whole games with the 'hashatonProtect' deck style (SYNTHETIC cards of the engine fixtures `synthetic-hashaton-g6.ts`: an angel
// that asks "choose a card type" as it enters and gives its controller and their creatures protection from it, creatures and an artifact that ping, a creature that pings
// as it dies, an artifact creature and a sorcery, with burn, an Aura and Equipment to fall off, and bodies) between random agents, with CasualAgent in some seats. Every
// game finishes with a result, no fallback, no rejected action and consistent state after every action; the action log replays to the same final state; and two rules of
// the slice are restated from the events and the states, apart from the engine: no damage is dealt to a player or a creature by a source of a card type that a permanent
// of their controller says they have protection from (CR 702.16e), and no Aura or Equipment of such a type stays attached to a creature of that controller (CR 702.16c,
// 702.16d). The question is the new "choose a card type" (a `chooseOption` of purpose `cardType`), which random and casual agents answer from the options the engine lists.
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
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
import { tokenOrFaceNameOf } from './game-names';
import {
  HASHATON_G6_NAMES,
  HASHATON_G6_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };
const SERAPH = 'SYNTHETIC Warding Seraph';

interface Tally {
  choices: Map<string, number>;
  protectedDamageChecks: number;
  attachmentChecks: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  choices: new Map(),
  protectedDamageChecks: 0,
  attachmentChecks: 0,
  byCard: new Map(),
});

/** The card types `seat` has protection from in `state`: what each Seraph they control chose as it entered. */
function protectedTypesOf(state: GameState, seat: SeatId): readonly string[] {
  const types: string[] = [];
  for (const id of state.battlefield) {
    const obj = state.objects[id];
    if (obj === undefined || obj.controller !== seat) continue;
    if (tokenOrFaceNameOf(state, id) !== SERAPH) continue;
    if (obj.chosen?.cardType !== undefined) types.push(obj.chosen.cardType);
  }
  return types;
}

/** The card types of an object of the state as the view shows them (a permanent, or a spell on the stack); null when it is nowhere to be found. */
function typesOf(state: GameState, id: ObjectId): readonly string[] | null {
  const view = getView(state, 0);
  const found: ObjectView | undefined = [...view.battlefield, ...view.stack].find(
    (o) => o.id === id,
  );
  return found?.types ?? null;
}

function checkRules(t: Tally, step: StepInfo): void {
  const { before, after, events } = step;
  for (const e of events) {
    if (e.kind === 'spellCast') {
      const name = tokenOrFaceNameOf(after, e.object);
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
    }
    if (e.kind === 'optionChosen' && e.purpose === 'cardType') {
      t.choices.set(e.option, (t.choices.get(e.option) ?? 0) + 1);
    }
    if (e.kind === 'damageDealt') {
      // CR 702.16e: damage to a player or a creature whose controller has protection from a type of the source is prevented.
      const victim = e.to.kind === 'player' ? e.to.seat : before.objects[e.to.id]?.controller;
      const sourceTypes = typesOf(before, e.source);
      if (victim === undefined || sourceTypes === null) continue;
      const protectedFrom = protectedTypesOf(before, victim);
      if (e.to.kind === 'object') {
        const target = before.objects[e.to.id];
        if (target === undefined || target.zone !== 'battlefield') continue;
        const targetTypes = typesOf(before, e.to.id);
        // Protection is a creature's: the Seraph gives it to creatures, so a planeswalker or battle of the controller has none.
        if (targetTypes === null || !targetTypes.includes('creature')) continue;
      }
      t.protectedDamageChecks += 1;
      const hit = protectedFrom.find((p) => sourceTypes.includes(p));
      if (hit !== undefined) {
        throw new Error(
          `${e.amount} damage from object ${e.source} (${sourceTypes.join('/')}, ${tokenOrFaceNameOf(before, e.source)}) was dealt to ${JSON.stringify(e.to)} of seat ${victim}, protected from ${hit}`,
        );
      }
    }
  }
  // CR 702.16c, 702.16d: after the action is settled, no attachment of a protected type is attached to a creature of the protecting player.
  const view = getView(after, 0);
  for (const o of view.battlefield) {
    if (o.attachedTo === undefined) continue;
    const host = after.objects[o.attachedTo];
    if (host === undefined) continue;
    const hostTypes = typesOf(after, o.attachedTo);
    if (hostTypes === null || !hostTypes.includes('creature')) continue;
    t.attachmentChecks += 1;
    const hit = protectedTypesOf(after, host.controller).find((p) => o.types.includes(p as never));
    if (hit !== undefined) {
      throw new Error(
        `${o.name} (${o.types.join('/')}) is attached to a creature protected from ${hit}`,
      );
    }
  }
}

test(
  `${GAMES} hashatonProtect games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = HASHATON_G6_STYLE_PAIRS[g % HASHATON_G6_STYLE_PAIRS.length] ?? [
        'hashatonProtect',
        'hashatonProtect',
      ];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 61700 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 61700 + 2 * g + seat });
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
      for (const [type, n] of t.choices)
        total.choices.set(type, (total.choices.get(type) ?? 0) + n);
      total.protectedDamageChecks += t.protectedDamageChecks;
      total.attachmentChecks += t.attachmentChecks;
      for (const [name, n] of t.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    console.log(
      `${GAMES} hashatonProtect games: ${JSON.stringify({
        choices: Object.fromEntries([...total.choices].sort()),
        protectedDamageChecks: total.protectedDamageChecks,
        attachmentChecks: total.attachmentChecks,
        byCard: Object.fromEntries([...total.byCard].sort()),
      })}`,
    );
    expectPath(total.choices.size > 0 ? 1 : 0, 'a card type was chosen');
    expectPath(total.protectedDamageChecks);
    expectPath(total.attachmentChecks);
    // Every card of the slice was cast at least once somewhere in the games.
    for (const name of HASHATON_G6_NAMES) expectPath(total.byCard.get(name) ?? 0, name);
  },
  soakTimeout(240_000),
);
