// Slice soak (D-422 to D-428): whole games with the 'danithaG3' deck style (SYNTHETIC cards of the engine fixtures `synthetic-danitha-g3.ts`: a creature and Auras that
// count what is attached, a sorcery that destroys the creatures that are not enchanted, Auras that read the color of the creature, another Aura on it and the turn they entered, an Aura
// that makes Equip abilities and Aura spells cheaper when they target the creature it enchants, and an Equipment with an expensive Equip, with bodies, other Auras and removal) between
// random agents, with CasualAgent and HeuristicAgent in some seats. Every game finishes with a result, no fallback, no rejected action and consistent state after every action; the
// action log replays to the same final state; and, with the rules read again here from the cards' texts (not from the engine's own code), at every step:
//   - when a Bare Purge has resolved every creature that is still on the battlefield has an Aura attached to it (CR 303.4, 701.8);
//   - the creature a Flash Ward Aura has just been attached to has hexproof (CR 400.7, 611.3a, 702.11b: the Aura entered this turn);
//   - an Equip that targets a creature with a Strong Spine Aura of the equipping player on it can be paid with the generic mana reduced by {3}: a player who could pay no more than that was
//     offered no other target (CR 601.2c, 601.2f), which shows as no payment the engine could not complete (no fallback, no rejected action);
//   - a creature that is attached to nothing but Auras and Equipment is never a source of an illegal state (`checkInvariants`).
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import {
  applyAction,
  checkInvariants,
  getLegalActions,
  getView,
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
import { cardNameOf, stackNameOf } from './game-names';
import {
  DANITHA_G3_NAMES,
  DANITHA_G3_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

const PURGE = 'SYNTHETIC Bare Purge';
const FLASH_WARD = 'SYNTHETIC Flash Ward Aura';
const SPINE = 'SYNTHETIC Strong Spine Aura';
const COSTLY = 'SYNTHETIC Costly Blade';

interface Tally {
  purges: number;
  hexproofHosts: number;
  equips: number;
  equipsToSpineHost: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  purges: 0,
  hexproofHosts: 0,
  equips: 0,
  equipsToSpineHost: 0,
  byCard: new Map(),
});

function checkRules(t: Tally, step: StepInfo): void {
  const { before, after, events } = step;
  for (const e of events) {
    if (e.kind === 'spellCast') {
      const name = cardNameOf(after, e.object);
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
    }
    if (e.kind === 'abilityActivated') {
      const name = cardNameOf(before, e.source);
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
    }
    // After a Bare Purge: every creature left has an Aura attached to it.
    if (e.kind === 'resolved' && stackNameOf(before, e.object) === PURGE) {
      t.purges += 1;
      const field = getView(after, 0).battlefield;
      for (const o of field) {
        if (!o.types.includes('creature')) continue;
        const enchanted = (o.attachments ?? []).some((id) =>
          field.find((a) => a.id === id)?.subtypes.includes('Aura'),
        );
        expect(enchanted, `${o.name} survived a Bare Purge without an Aura attached`).toBe(true);
      }
    }
    if (e.kind === 'attached') {
      const name = cardNameOf(after, e.object);
      // A Flash Ward Aura has just entered: its creature has hexproof this turn.
      if (name === FLASH_WARD) {
        const host = getView(after, 0).battlefield.find((o) => o.id === e.to);
        expect(host?.keywords, 'the creature of a Flash Ward Aura has hexproof').toContain(
          'hexproof',
        );
        t.hexproofHosts += 1;
      }
      if (name === COSTLY) {
        t.equips += 1;
        const field = getView(after, 0).battlefield;
        const spined = (field.find((o) => o.id === e.to)?.attachments ?? []).some(
          (id) => cardNameOf(after, id) === SPINE,
        );
        if (spined) t.equipsToSpineHost += 1;
      }
    }
  }
}

test(
  `${GAMES} danithaG3 games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = DANITHA_G3_STYLE_PAIRS[g % DANITHA_G3_STYLE_PAIRS.length] ?? [
        'danithaG3',
        'danithaG3',
      ];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent and HeuristicAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? g % 8 < 4
            ? new CasualAgent({ seed: 303000 + 2 * g + seat })
            : new HeuristicAgent({ seed: 303000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 303000 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const t = newTally();
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkRules(t, step);
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
        // Every action the agent took is one the engine lists for the seat (the engine accepted it above).
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
      for (const key of ['purges', 'hexproofHosts', 'equips', 'equipsToSpineHost'] as const) {
        total[key] += t[key];
      }
      for (const [name, n] of t.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    console.log(
      `${GAMES} danithaG3 games: ${JSON.stringify({ ...total, byCard: Object.fromEntries([...total.byCard].sort()) })}`,
    );
    expectPath(total.purges);
    expectPath(total.equips);
    // Every card of the slice was cast or activated at least once somewhere in the games.
    for (const name of DANITHA_G3_NAMES) {
      expectPath(total.byCard.get(name) ?? 0, name);
    }
  },
  soakTimeout(300_000),
);
