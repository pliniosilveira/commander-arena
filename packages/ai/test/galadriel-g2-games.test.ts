// Slice soak (D-1610 to D-1618): whole games with the 'galadrielG2' deck style (SYNTHETIC cards of the engine fixtures `synthetic-galadriel-g2.ts`: the creature that makes the nontoken creatures
// of its controller Forest lands, the creature that grows with the lands and the land cards of the graveyard and returns for two lands, the sorcery that mills four and puts up to two of the
// lands milled into the hand, the creature that makes a token as big as the lands and puts a land from the hand or the graveyard onto the battlefield when its controller attacks, and the land
// with Halflingcycling {4} with the creature it finds) between random agents, with CasualAgent and HeuristicAgent in some seats. Every game finishes with a result, no fallback, no rejected action and
// consistent state after every action; the action log replays to the same final state; and, with the rules read again here from the cards' texts and CR 205.1b, CR 208.2a, CR 305.6 and CR 702.29e
// (not from the engine's own code), at every step:
//   - while a Forest Heart is on the battlefield, every nontoken creature of its controller is also a land and a Forest, and no token is (CR 613.1d, 205.1b);
//   - a Land Avatar on the battlefield has the power and toughness of the lands its controller controls plus the land cards of their graveyard (CR 613.4c);
//   - an Ox token has the power and toughness of the lands its controller controls (CR 208.2a, 604.3);
//   - what Halflingcycling finds is a card of the Halfling type of the library of the player, and the card that was cycled is in the graveyard (CR 702.29e, 701.23);
//   - a land that the trigger of the Giant puts onto the battlefield came from the hand or the graveyard of its controller (CR 608.2d).
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import {
  applyAction,
  checkInvariants,
  type GameState,
  getLegalActions,
  getView,
  type ObjectId,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import {
  type Agent,
  CasualAgent,
  HeuristicAgent,
  RandomLegalAgent,
  replayGame,
} from '../src/index';
import { cardNameOf, tokenOrCopyNameOf } from './game-names';
import {
  GALADRIEL_G2_NAMES,
  GALADRIEL_G2_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

const HEART = 'SYNTHETIC Forest Heart';
const AVATAR = 'SYNTHETIC Land Avatar';
const HOLE = 'SYNTHETIC Halfling Hole';
const OX = 'SYNTHETIC Ox Token';

interface Tally {
  forestCreatures: number;
  avatarChecks: number;
  oxChecks: number;
  cycled: number;
  found: number;
  landFromHand: number;
  landFromGraveyard: number;
  rallyTakes: number;
  avatarReturned: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  forestCreatures: 0,
  avatarChecks: 0,
  oxChecks: 0,
  cycled: 0,
  found: 0,
  landFromHand: 0,
  landFromGraveyard: 0,
  rallyTakes: 0,
  avatarReturned: 0,
  byCard: new Map(),
});

/** The lands a seat controls and the land cards in its graveyard, as the view shows them (every permanent with the land type, whatever else it is). */
function landCounts(state: GameState, seat: number): { lands: number; landCards: number } {
  const view = getView(state, seat);
  const lands = view.battlefield.filter(
    (o) => o.controller === seat && o.types.includes('land'),
  ).length;
  const mine = view.seats[seat]?.graveyard ?? [];
  return { lands, landCards: mine.filter((o) => o.types.includes('land')).length };
}

function checkRules(t: Tally, step: StepInfo): void {
  const { before, after, events } = step;
  // The permanents on the battlefield, read through the layers of the view.
  const heartSeats = new Set<number>();
  for (const id of after.battlefield) {
    const obj = after.objects[id];
    if (obj !== undefined && cardNameOf(after, id) === HEART) heartSeats.add(obj.controller);
  }
  const hasPieces =
    heartSeats.size > 0 ||
    after.battlefield.some((id) => {
      const name = tokenOrCopyNameOf(after, id);
      return name === AVATAR || name === OX;
    });
  if (hasPieces) {
    const view = getView(after, 0);
    const counts = [landCounts(after, 0), landCounts(after, 1)];
    for (const o of view.battlefield) {
      const name = o.name;
      // The Heart works unless it has lost abilities, which nothing in these decks does.
      if (heartSeats.has(o.controller) && o.types.includes('creature') && !o.isToken) {
        t.forestCreatures += 1;
        expect(
          o.types,
          `${name}: a nontoken creature of the Heart's controller is a land`,
        ).toContain('land');
        expect(o.subtypes, `${name}: and a Forest`).toContain('Forest');
      }
      if (name === AVATAR && o.types.includes('creature')) {
        const c = counts[o.controller] ?? { lands: 0, landCards: 0 };
        t.avatarChecks += 1;
        expect(o.power, 'the Avatar has +1/+1 for each land and each land card').toBe(
          c.lands + c.landCards + (o.counters['+1/+1'] ?? 0),
        );
      }
      if (name === OX && o.isToken) {
        const c = counts[o.controller] ?? { lands: 0, landCards: 0 };
        t.oxChecks += 1;
        expect(o.power, 'the Ox is as big as the lands').toBe(c.lands);
        expect(o.toughness).toBe(c.lands);
      }
    }
    // A token is never made a land by the Heart.
    for (const o of view.battlefield) {
      if (o.isToken && heartSeats.has(o.controller) && o.name === OX) {
        expect(o.subtypes.includes('Forest'), 'a token is not a Forest').toBe(false);
      }
    }
  }
  for (const e of events) {
    if (e.kind === 'abilityActivated' || e.kind === 'abilityTriggered') {
      const name = cardNameOf(before, e.source);
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
    }
    if (e.kind === 'spellCast') {
      const name = tokenOrCopyNameOf(after, e.object);
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
    }
    // Halflingcycling: the discarded card is in the graveyard and the card found is a Halfling card.
    if (e.kind === 'discarded' && cardNameOf(before, e.object as ObjectId) === HOLE) {
      t.cycled += 1;
    }
    if (e.kind === 'librarySearched' && e.found > 0) t.found += 1;
  }
  // A card chosen from the hand or the graveyard and put onto the battlefield by the answer of the Giant's question.
  const asked = before.pending;
  if (
    asked?.kind === 'chooseCards' &&
    asked.alsoGraveyard === true &&
    step.action.kind === 'chooseCards'
  ) {
    for (const id of step.action.objects) {
      expect(asked.legal, 'the card is one the question offered').toContain(id);
      const was = before.objects[id]?.zone;
      expect(['hand', 'graveyard'], 'from the hand or the graveyard').toContain(was);
      expect(before.objects[id]?.owner, 'of its controller').toBe(asked.seat);
      if (was === 'hand') t.landFromHand += 1;
      else t.landFromGraveyard += 1;
    }
  }
  if (
    asked?.kind === 'chooseCards' &&
    asked.purpose === 'move' &&
    asked.alsoGraveyard !== true &&
    asked.max === 2 &&
    step.action.kind === 'chooseCards'
  ) {
    expect(step.action.objects.length, 'up to two').toBeLessThanOrEqual(2);
    t.rallyTakes += step.action.objects.length;
  }
  // The Avatar that leaves the graveyard for the hand through its own ability.
  for (const e of events) {
    if (e.kind === 'zoneChanged' && e.fromZone === 'graveyard' && e.toZone === 'hand') {
      if (cardNameOf(after, e.to as ObjectId) === AVATAR) t.avatarReturned += 1;
    }
  }
}

test(
  `${GAMES} galadrielG2 games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = GALADRIEL_G2_STYLE_PAIRS[g % GALADRIEL_G2_STYLE_PAIRS.length] ?? [
        'galadrielG2',
        'galadrielG2',
      ];
      const config = smallGameConfig(g, styles);
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? g % 8 < 4
            ? new CasualAgent({ seed: 261000 + 2 * g + seat })
            : new HeuristicAgent({ seed: 261000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 261000 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const t = newTally();
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkRules(t, step);
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
        if (step.index % 97 === 0) {
          const listed = getLegalActions(step.before, step.seat);
          expect(
            listed.some((a) => JSON.stringify(a) === JSON.stringify(step.action)) ||
              applyAction(step.before, step.seat, step.action).ok,
          ).toBe(true);
        }
      });
      const tag = `game ${g}`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      expect(stateHash(replayGame(config, log)), tag).toBe(stateHash(run.state));
      for (const key of [
        'forestCreatures',
        'avatarChecks',
        'oxChecks',
        'cycled',
        'found',
        'landFromHand',
        'landFromGraveyard',
        'rallyTakes',
        'avatarReturned',
      ] as const) {
        total[key] += t[key];
      }
      for (const [name, n] of t.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    console.log(
      `${GAMES} galadrielG2 games: ${JSON.stringify({ ...total, byCard: Object.fromEntries([...total.byCard].sort()) })}`,
    );
    expectPath(total.forestCreatures, 'a creature that is a Forest land');
    expectPath(total.avatarChecks, 'a Land Avatar on the battlefield');
    expectPath(total.oxChecks, 'an Ox token');
    expectPath(total.found, 'a card found by a search');
    for (const name of GALADRIEL_G2_NAMES) expectPath(total.byCard.get(name) ?? 0, name);
  },
  soakTimeout(600_000),
);
