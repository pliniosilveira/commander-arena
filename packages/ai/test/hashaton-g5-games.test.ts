// Slice soak (D-1160 to D-1163, provisional): whole games with the 'hashatonCopies' deck style (SYNTHETIC cards of the engine fixtures `synthetic-hashaton-g5.ts`: creatures with
// Eternalize, a creature that copies the creature cards discarded as 4/4 black Zombies for {2}{U}, spells that make the player discard, a token maker and the enchantment that
// copies the tokens of the chosen type at the end step, with bodies and removal) between random agents, with CasualAgent in some seats. Every game finishes with a result, no
// fallback, no rejected action and consistent state after every action; the action log replays to the same final state; and two rules of the slice are restated from the states,
// apart from the engine: every token that is a copy made by the slice is a 4/4 black Zombie that has no characteristic-defining power or toughness (CR 707.9b, 707.9d), and a
// card eternalized is gone from the graveyard (CR 702.129a). The question is the "may pay" and the creature type of old, so the agents answer only the questions they always do.
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import { checkInvariants, type GameState, stateHash } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import { faceOf, stackNameOf, tokenOrFaceNameOf } from './game-names';
import {
  HASHATON_G5_NAMES,
  HASHATON_G5_SPELLS,
  HASHATON_G5_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

interface Tally {
  eternalized: number;
  payments: number;
  discardedCreatures: number;
  goblins: number;
  copyTokens: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  eternalized: 0,
  payments: 0,
  discardedCreatures: 0,
  goblins: 0,
  copyTokens: 0,
  byCard: new Map(),
});

/** The names of the cards a copy of the slice can be of: the cards of the deck style, whose own tokens (Goblins) are not copies of a card. */
const COPIED = new Set(HASHATON_G5_SPELLS);

/** Every token named like a card of the style is a copy the slice made: a 4/4 black Zombie with no characteristic-defining ability of power or toughness (CR 707.9b, 707.9d). */
function checkTokens(state: GameState): void {
  for (const id of state.battlefield) {
    const obj = state.objects[id];
    if (obj?.token == null) continue;
    const d = obj.token;
    if (!COPIED.has(d.characteristics.name)) continue;
    const where = `${d.characteristics.name} token ${id}`;
    if (d.characteristics.power !== 4 || d.characteristics.toughness !== 4) {
      throw new Error(`${where} is ${d.characteristics.power}/${d.characteristics.toughness}`);
    }
    if (d.characteristics.colors.join() !== 'B') {
      throw new Error(`${where} is not black: ${d.characteristics.colors.join()}`);
    }
    if (!d.characteristics.subtypes.includes('Zombie')) throw new Error(`${where} is no Zombie`);
    if (d.abilities.some((a) => a.kind === 'static' && a.static.kind === 'characteristicPt')) {
      throw new Error(`${where} has a characteristic-defining power or toughness`);
    }
  }
}

function checkRules(t: Tally, step: StepInfo): void {
  const { before, after, events } = step;
  checkTokens(after);
  for (const e of events) {
    if (e.kind === 'spellCast') {
      const name = tokenOrFaceNameOf(after, e.object);
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
    }
    if (e.kind === 'abilityActivated') {
      // Eternalize (CR 702.129a): the card of the graveyard is exiled as the cost, which is paid before the activation is complete, so the source is read as it last was.
      const last = after.objects[e.source] ?? after.lki[e.source]?.object;
      const card = last?.card == null ? undefined : after.cards[last.card];
      const face = card === undefined ? undefined : after.definitions[card.definition]?.faces[0];
      if (
        last?.zone === 'graveyard' &&
        face?.abilities.some((a) => a.kind === 'keyword' && a.keyword.kind === 'eternalize') ===
          true
      ) {
        t.eternalized += 1;
        // The card is gone from the graveyard: it was exiled as the cost.
        if (after.objects[e.source]?.zone === 'graveyard') {
          throw new Error(`${tokenOrFaceNameOf(after, e.source)} is still in the graveyard`);
        }
      }
    }
    if (e.kind === 'optionalAnswered' && e.accepted) {
      if (stackNameOf(before, e.source) === 'SYNTHETIC Scarab Fist') t.payments += 1;
    }
    if (e.kind === 'discarded') {
      const face = e.to === null ? undefined : faceOf(after, e.to);
      if (face?.types.includes('creature')) t.discardedCreatures += 1;
    }
    if (e.kind === 'tokenCreated') {
      if (e.name === 'Goblin') t.goblins += 1;
      else t.copyTokens += 1;
    }
  }
}

test(
  `${GAMES} hashatonCopies games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = HASHATON_G5_STYLE_PAIRS[g % HASHATON_G5_STYLE_PAIRS.length] ?? [
        'hashatonCopies',
        'hashatonCopies',
      ];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 31900 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 31900 + 2 * g + seat });
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
      total.eternalized += t.eternalized;
      total.payments += t.payments;
      total.discardedCreatures += t.discardedCreatures;
      total.goblins += t.goblins;
      total.copyTokens += t.copyTokens;
      for (const [name, n] of t.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    console.log(
      `${GAMES} hashatonCopies games: ${JSON.stringify({ ...total, byCard: Object.fromEntries([...total.byCard].sort()) })}`,
    );
    expectPath(total.discardedCreatures);
    expectPath(total.goblins);
    expectPath(total.copyTokens);
    expectPath(total.payments);
    expectPath(total.eternalized);
    // Every card of the slice that is cast was cast at least once somewhere in the games.
    for (const name of HASHATON_G5_NAMES) expectPath(total.byCard.get(name) ?? 0, name);
  },
  soakTimeout(240_000),
);
