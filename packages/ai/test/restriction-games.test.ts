// Slice soak: whole games (the `soakGames()` count, test/soak.ts) with the 'restrictions' deck style (SYNTHETIC cards of D-094: "can't
// block", "can't be blocked", "attacks each combat if able", "doesn't untap", "can't be countered",
// landwalk, fear, intimidate, shadow, an Aura, an Equipment, spells and a land that give the
// restrictions) between random agents, with CasualAgent in some seats. Every game finishes with a
// result, no fallback, no rejected action and consistent state after every action; the action log
// replays to the same final state; and every new path occurs and is checked against the state around
// it, with the rules read again here from the view, not from the engine's combat code: a creature
// that attacks each combat if able and can attack is always declared (CR 508.1d), no declared block
// breaks "can't block", "can't be blocked", fear, intimidate, shadow, landwalk or flying (CR 509.1b),
// a creature that doesn't untap stays tapped through its controller's untap step (CR 502.3), and a
// spell that can't be countered is never countered (CR 101.2).
import {
  checkInvariants,
  type GameEvent,
  getView,
  type ObjectView,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import { cardNameOf } from './game-names';
import {
  RESTRICTION_CARD_NAMES,
  RESTRICTION_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

interface Tally {
  requiredDecisions: number;
  requiredDeclared: number;
  casualRequired: number;
  blocks: number;
  evasionAttackers: number;
  blockedAgainstRules: number;
  cantBlockCreatures: number;
  untapChecks: number;
  keptTapped: number;
  counterAimedAtUncounterable: number;
  uncounterableStayed: number;
  countered: number;
  restrictEffects: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  requiredDecisions: 0,
  requiredDeclared: 0,
  casualRequired: 0,
  blocks: 0,
  evasionAttackers: 0,
  blockedAgainstRules: 0,
  cantBlockCreatures: 0,
  untapChecks: 0,
  keptTapped: 0,
  counterAimedAtUncounterable: 0,
  uncounterableStayed: 0,
  countered: 0,
  restrictEffects: 0,
  byCard: new Map(),
});

const has = (o: ObjectView, keyword: string) => o.keywords.includes(keyword);
const artifactCreature = (o: ObjectView) =>
  o.types.includes('artifact') && o.types.includes('creature');

/** The block rules of CR 509.1b, read from the view (an independent statement of them). */
function whyNotBlock(
  field: readonly ObjectView[],
  blocker: ObjectView,
  attacker: ObjectView,
): string | null {
  if (blocker.restrictions?.includes('cantBlock')) return "the blocker can't block";
  if (attacker.restrictions?.includes('cantBeBlocked')) return "the attacker can't be blocked";
  if (has(attacker, 'flying') && !has(blocker, 'flying') && !has(blocker, 'reach')) return 'flying';
  if (has(attacker, 'fear') && !artifactCreature(blocker) && !blocker.colors.includes('B')) {
    return 'fear';
  }
  if (
    has(attacker, 'intimidate') &&
    !artifactCreature(blocker) &&
    !blocker.colors.some((c) => attacker.colors.includes(c))
  ) {
    return 'intimidate';
  }
  if (has(attacker, 'shadow') !== has(blocker, 'shadow')) return 'shadow';
  for (const type of attacker.landwalks ?? []) {
    const walked = field.some(
      (land) =>
        land.controller === blocker.controller &&
        land.types.includes('land') &&
        (type === 'nonbasic' ? !land.supertypes.includes('basic') : land.subtypes.includes(type)),
    );
    if (walked) return `landwalk ${type}`;
  }
  return null;
}

/** Notes what one applied action did, for the paths this slice added, and checks it. */
function note(tally: Tally, casual: ReadonlySet<number>, step: StepInfo): void {
  const { before, after, events, seat, action } = step;
  const d = before.pending;

  // CR 508.1d: the declaration includes every creature that must attack.
  if (d?.kind === 'declareAttackers' && action.kind === 'declareAttackers') {
    if (d.mustAttack.length > 0) {
      tally.requiredDecisions += 1;
      const declared = new Set(action.attacks.map((a) => a.attacker));
      for (const id of d.mustAttack) {
        expect(declared.has(id), 'a required attacker is declared').toBe(true);
        tally.requiredDeclared += 1;
        const name = cardNameOf(before, id);
        tally.byCard.set(name, (tally.byCard.get(name) ?? 0) + 1);
      }
      // Each one really can attack, and really has the requirement.
      const view = getView(before, seat);
      for (const id of d.mustAttack) {
        const o = view.battlefield.find((x) => x.id === id);
        expect(o?.restrictions, 'required').toContain('attacksEachCombat');
        expect(o?.tapped, 'required: untapped').toBe(false);
        expect(o?.summoningSick, 'required: not summoning sick').toBe(false);
      }
      if (casual.has(seat)) tally.casualRequired += 1;
    }
    // Evasive attackers declared: counted for the blocks that follow.
    const view = getView(before, seat);
    for (const a of action.attacks) {
      const o = view.battlefield.find((x) => x.id === a.attacker);
      if (
        o !== undefined &&
        (o.restrictions?.includes('cantBeBlocked') ||
          o.landwalks !== undefined ||
          has(o, 'fear') ||
          has(o, 'intimidate') ||
          has(o, 'shadow'))
      ) {
        tally.evasionAttackers += 1;
      }
    }
  }

  // CR 509.1b: every block respects what the attacker and the blocker are restricted by.
  if (d?.kind === 'declareBlockers' && action.kind === 'declareBlockers') {
    const view = getView(before, seat);
    for (const b of action.blocks) {
      const blocker = view.battlefield.find((x) => x.id === b.blocker);
      const attacker = view.battlefield.find((x) => x.id === b.attacker);
      if (blocker === undefined || attacker === undefined) throw new Error('a block names nothing');
      const why = whyNotBlock(view.battlefield, blocker, attacker);
      if (why !== null) tally.blockedAgainstRules += 1;
      expect(why, `${blocker.name} blocks ${attacker.name}`).toBeNull();
      tally.blocks += 1;
    }
    tally.cantBlockCreatures += view.battlefield.filter(
      (o) => o.controller === seat && o.restrictions?.includes('cantBlock'),
    ).length;
  }

  // CR 502.3: a permanent that doesn't untap stays tapped through its controller's untap step.
  const untap = events.find((e) => e.kind === 'stepBegan' && e.step === 'untap');
  if (untap?.kind === 'stepBegan') {
    const view = getView(before, untap.seat);
    for (const o of view.battlefield) {
      if (o.controller !== untap.seat || !o.tapped) continue;
      tally.untapChecks += 1;
      const stillThere = after.objects[o.id];
      const kept = o.restrictions?.includes('doesntUntap') === true;
      if (kept) {
        expect(stillThere?.tapped, `${o.name} stays tapped`).toBe(true);
        expect(events.some((e) => e.kind === 'untapped' && e.object === o.id)).toBe(false);
        tally.keptTapped += 1;
      } else {
        expect(stillThere?.tapped, `${o.name} untaps`).toBe(false);
      }
    }
  }

  // CR 101.2: a spell that can't be countered is never countered, and stays on the stack when a
  // counter resolves with it as its target.
  for (const e of events as readonly GameEvent[]) {
    if (e.kind === 'countered') {
      tally.countered += 1;
      const o = before.objects[e.object];
      if (o?.zone === 'stack' && o.card !== null) {
        const view = getView(before, seat);
        const spell = view.stack.find((x) => x.id === e.object);
        expect(
          spell?.restrictions ?? [],
          `${cardNameOf(before, e.object)} countered`,
        ).not.toContain('cantBeCountered');
      }
    }
    if (e.kind === 'resolved') {
      const obj = before.objects[e.object];
      const t = obj?.stack?.chosenTargets[0];
      if (
        t?.kind === 'object' &&
        obj?.stack?.kind === 'spell' &&
        /Counter/.test(cardNameOf(before, e.object))
      ) {
        const targetView = getView(before, seat).stack.find((x) => x.id === t.id);
        if (targetView?.restrictions?.includes('cantBeCountered')) {
          tally.counterAimedAtUncounterable += 1;
          expect(after.objects[t.id]?.zone, "the spell that can't be countered stays").toBe(
            'stack',
          );
          tally.uncounterableStayed += 1;
        }
      }
      const name = cardNameOf(before, e.object);
      if (['SYNTHETIC Ghost Step', 'SYNTHETIC Muzzle', 'SYNTHETIC Goad Rage'].includes(name)) {
        tally.restrictEffects += 1;
      }
    }
  }
}

test(
  `${GAMES} restriction games run clean, replay exactly and use every new path`,
  async () => {
    const total = newTally();
    const turns: number[] = [];
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = RESTRICTION_STYLE_PAIRS[g % RESTRICTION_STYLE_PAIRS.length] ?? [
        'restrictions',
        'restrictions',
      ];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 13500 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 13500 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const tally = newTally();
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        note(tally, casual, step);
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
      });
      const tag = `game ${g}`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      // The log replays to the same game.
      expect(stateHash(replayGame(config, log)), tag).toBe(stateHash(run.state));
      turns.push(run.state.turn.number);
      for (const key of Object.keys(tally) as (keyof Tally)[]) {
        if (key === 'byCard') {
          for (const [name, n] of tally.byCard)
            total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
        } else total[key] += tally[key];
      }
    }
    const { byCard, ...counts } = total;
    console.log(
      `100 restriction games: ${JSON.stringify({ ...counts, turnsMax: Math.max(...turns), byCard: Object.fromEntries(byCard) })}`,
    );

    expectPath(total.requiredDecisions);
    expectPath(total.requiredDeclared);
    expectPath(total.casualRequired);
    expectPath(total.blocks);
    expectPath(total.evasionAttackers);
    expect(total.blockedAgainstRules).toBe(0);
    expectPath(total.cantBlockCreatures);
    expectPath(total.keptTapped);
    expectPath(total.counterAimedAtUncounterable);
    expect(total.uncounterableStayed).toBe(total.counterAimedAtUncounterable);
    expectPath(total.restrictEffects);
    expect(RESTRICTION_CARD_NAMES.length).toBeGreaterThan(20);
  },
  soakTimeout(300_000),
);
