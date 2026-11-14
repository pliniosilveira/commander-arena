// Slice soak (D-1320 to D-1322 provisional): whole games with the 'featherG3' deck style (SYNTHETIC cards of the engine fixtures `synthetic-feather-g3.ts`: creatures with a cast trigger on the
// spells that target them, the exile of a spell as it resolves with its return, the copies of a spell for each other creature it could target, and a spell with two targets) between random
// agents, with CasualAgent and HeuristicAgent in some seats. Every game finishes with a result, no fallback, no rejected action and consistent state after every action; the action log
// replays to the same final state; and, with the rules read again here from the cards' texts (not from the engine's own code), at every step:
//   - a spell a player casts that targets a Heroic creature that player controls puts exactly one trigger of that creature on the stack, and no other creature of the group does (CR 601.2i, 603.2);
//   - the draw trigger of Cast Draw Knight is put on the stack at most once in a turn for each of them (CR 603.2);
//   - every copy of a spell that Echo Grinder or Mirror Wyrm made belongs to the player who cast the spell, targets one creature that player controls other than the one the spell targeted,
//     a creature each of the copies of that spell has a different one of (CR 707.10, 707.10e, 115.3);
//   - an instant or sorcery cast by the controller of a Spell Recycler that targets a creature that player controls is exiled as it resolves, and one that is countered or fizzles is not
//     (CR 614.1a, 608.2n), and none of the cards exiled that way is ever put into a graveyard while it waits for the end step (CR 603.7).
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import {
  applyAction,
  checkInvariants,
  type GameEvent,
  type GameState,
  getLegalActions,
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
  FEATHER_G3_NAMES,
  FEATHER_G3_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

const HEROIC = new Set(['SYNTHETIC Heroic Captain', 'SYNTHETIC Heroic Scout']);
const KNIGHT = 'SYNTHETIC Cast Draw Knight';
const RECYCLER = 'SYNTHETIC Spell Recycler';
const COPIERS = new Set(['SYNTHETIC Echo Grinder', 'SYNTHETIC Mirror Wyrm']);

interface Tally {
  casts: number;
  heroicAimed: number;
  heroicTriggers: number;
  knightTriggers: number;
  copies: number;
  copiedFor: number;
  exiled: number;
  returned: number;
  notExiled: number;
  byCard: Map<string, number>;
}

/** The counts of a tally (all of it but the casts by card). */
const COUNTS = [
  'casts',
  'heroicAimed',
  'heroicTriggers',
  'knightTriggers',
  'copies',
  'copiedFor',
  'exiled',
  'returned',
  'notExiled',
] as const;

const newTally = (): Tally => ({
  casts: 0,
  heroicAimed: 0,
  heroicTriggers: 0,
  knightTriggers: 0,
  copies: 0,
  copiedFor: 0,
  exiled: 0,
  returned: 0,
  notExiled: 0,
  byCard: new Map(),
});

/** What a game remembers between the steps. */
interface Memory {
  /** Heroic triggers a cast is owed, by the object of the creature. */
  owed: Map<string, number>;
  /** The Knight triggers seen, by turn, Knight and ability. */
  knight: Set<string>;
  /** The copies each spell has, by the original: the creatures they aim at. */
  aimed: Map<string, Set<string>>;
  /** The spells cast that a Recycler of their caster exiles as they resolve, by the object on the stack, with the card. */
  recycled: Map<string, string>;
  /** The cards exiled that wait for the end step. */
  waiting: Set<string>;
}

const newMemory = (): Memory => ({
  owed: new Map(),
  knight: new Set(),
  aimed: new Map(),
  recycled: new Map(),
  waiting: new Set(),
});

const typesOf = (state: GameState, id: string): readonly string[] => {
  const obj = state.objects[id as keyof typeof state.objects];
  const card = obj?.card == null ? undefined : state.cards[obj.card];
  return card === undefined ? [] : (state.definitions[card.definition]?.faces[0]?.types ?? []);
};

/** The card an object is, found in whatever zone it is in now. */
const zoneOfCard = (state: GameState, card: string): string | undefined =>
  Object.values(state.objects).find((o) => o.card === card)?.zone;

function checkCasts(t: Tally, mem: Memory, step: StepInfo): void {
  const { before, after, events } = step;
  for (const e of events) {
    if (e.kind !== 'spellCast') continue;
    const spell = after.objects[e.object];
    if (spell?.stack == null) continue;
    const name = tokenOrCopyNameOf(after, e.object);
    t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
    if ((FEATHER_G3_NAMES as readonly string[]).includes(name)) t.casts += 1;
    const targets = spell.stack.chosenTargets.flatMap((x) => (x.kind === 'object' ? [x.id] : []));
    // A spell that targets a Heroic creature of its caster owes that creature's trigger, once however many times it targets it.
    for (const id of new Set(targets)) {
      const target = after.objects[id];
      if (target === undefined || target.zone !== 'battlefield' || target.controller !== e.seat) {
        continue;
      }
      if (HEROIC.has(tokenOrCopyNameOf(after, id))) {
        mem.owed.set(id, (mem.owed.get(id) ?? 0) + 1);
        t.heroicAimed += 1;
      }
    }
    // A Recycler of the caster exiles an instant or sorcery that targets a creature of the caster's as it resolves.
    const types = typesOf(after, e.object);
    const recycler = after.battlefield.some(
      (id) => after.objects[id]?.controller === e.seat && tokenOrCopyNameOf(after, id) === RECYCLER,
    );
    const ownCreature = targets.some(
      (id) =>
        after.objects[id]?.zone === 'battlefield' &&
        after.objects[id]?.controller === e.seat &&
        typesOf(after, id).includes('creature'),
    );
    if (
      recycler &&
      ownCreature &&
      (types.includes('instant') || types.includes('sorcery')) &&
      spell.card !== null
    ) {
      mem.recycled.set(e.object, spell.card);
    }
  }
  // The triggers that went on the stack in this step.
  for (const id of after.stack) {
    if (before.stack.includes(id)) continue;
    const obj = after.objects[id];
    if (obj?.stack?.kind !== 'ability' || obj.stack.source == null) continue;
    const source = obj.stack.source;
    const name = tokenOrCopyNameOf(after, source);
    if (HEROIC.has(name)) {
      const owed = mem.owed.get(source) ?? 0;
      expect(owed, `a trigger of ${name} nobody owed it`).toBeGreaterThan(0);
      mem.owed.set(source, owed - 1);
      t.heroicTriggers += 1;
    }
    if (name === KNIGHT && obj.stack.abilityIndex !== null) {
      const key = `${after.turn.number}:${source}:${obj.stack.abilityIndex}`;
      expect(mem.knight.has(key), `${name} triggered twice in turn ${after.turn.number}`).toBe(
        false,
      );
      mem.knight.add(key);
      t.knightTriggers += 1;
    }
  }
}

function checkCopies(t: Tally, mem: Memory, step: StepInfo): void {
  const { before, after, events } = step;
  for (const e of events) {
    if (e.kind !== 'spellCopied') continue;
    const original = after.objects[e.original] ?? before.objects[e.original];
    const copy = after.objects[e.copy];
    if (original?.stack == null || copy?.stack == null) continue;
    t.copies += 1;
    expect(copy.controller, 'a copy belongs to the player who cast the spell').toBe(e.seat);
    expect(original.controller).toBe(e.seat);
    const aimed = copy.stack.chosenTargets;
    expect(aimed.length, 'a copy has a target').toBeGreaterThan(0);
    const first = aimed[0];
    expect(first?.kind).toBe('object');
    if (first?.kind !== 'object') continue;
    expect(
      aimed.every((x) => x.kind === 'object' && x.id === first.id),
      'a copy has one creature as every target',
    ).toBe(true);
    const target = after.objects[first.id];
    expect(target?.zone).toBe('battlefield');
    expect(target?.controller, 'the copy aims at a creature of the player who copies').toBe(e.seat);
    expect(typesOf(after, first.id)).toContain('creature');
    // Other than the creature the spell targeted, and a different one for each copy.
    const was = original.stack.chosenTargets.map((x) => (x.kind === 'object' ? x.id : null));
    expect(was, 'the spell the copies are of targets only one object').toEqual(
      was.map(() => was[0]),
    );
    expect(first.id).not.toBe(was[0]);
    const aimedAt = was[0];
    expect(aimedAt).not.toBeNull();
    if (aimedAt === null || aimedAt === undefined) continue;
    expect(COPIERS.has(tokenOrCopyNameOf(after, aimedAt))).toBe(true);
    const seen = mem.aimed.get(e.original) ?? new Set<string>();
    expect(seen.has(first.id), 'each copy has a different creature').toBe(false);
    seen.add(first.id);
    mem.aimed.set(e.original, seen);
    t.copiedFor += 1;
  }
}

function checkExile(t: Tally, mem: Memory, step: StepInfo): void {
  const { before, after, events } = step;
  for (const e of events as readonly GameEvent[]) {
    if (e.kind === 'resolved') {
      const card = mem.recycled.get(e.object);
      if (card === undefined) continue;
      mem.recycled.delete(e.object);
      expect(
        before.objects[e.object]?.stack?.exileOnResolve,
        `${cardNameOf(before, e.object)}: the Recycler's trigger marked the spell`,
      ).toBeDefined();
      expect(zoneOfCard(after, card), 'it is exiled as it resolves').toBe('exile');
      mem.waiting.add(card);
      t.exiled += 1;
    } else if (e.kind === 'countered' || e.kind === 'fizzled') {
      const card = mem.recycled.get(e.object);
      if (card === undefined) continue;
      mem.recycled.delete(e.object);
      expect(zoneOfCard(after, card), 'a spell that does not resolve is not exiled').toBe(
        'graveyard',
      );
      t.notExiled += 1;
    } else if (e.kind === 'zoneChanged' && e.card !== null && mem.waiting.has(e.card)) {
      if (e.fromZone === 'exile' && e.toZone === 'hand') {
        mem.waiting.delete(e.card);
        t.returned += 1;
      } else if (e.fromZone === 'exile') {
        // The card left exile some other way (a cast from exile is not offered to these decks): it is no longer waiting.
        mem.waiting.delete(e.card);
      }
    }
  }
  for (const card of mem.waiting) {
    expect(zoneOfCard(after, card), 'a card exiled by the Recycler waits in exile').toBe('exile');
  }
}

test(
  `${GAMES} featherG3 games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = FEATHER_G3_STYLE_PAIRS[g % FEATHER_G3_STYLE_PAIRS.length] ?? [
        'featherG3',
        'featherG3',
      ];
      const config = smallGameConfig(g, styles);
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? g % 8 < 4
            ? new CasualAgent({ seed: 311000 + 2 * g + seat })
            : new HeuristicAgent({ seed: 311000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 311000 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const t = newTally();
      const mem = newMemory();
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkCasts(t, mem, step);
        checkCopies(t, mem, step);
        checkExile(t, mem, step);
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
      // Every Heroic trigger a cast was owed went on the stack, unless a creature that left was owed one in the same step it died (none can).
      expect(
        [...mem.owed.values()].reduce((n, x) => n + x, 0),
        `${tag}: owed triggers`,
      ).toBe(0);
      for (const key of COUNTS) total[key] += t[key];
      for (const [name, n] of t.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    console.log(
      `${GAMES} featherG3 games: ${JSON.stringify({ ...total, byCard: Object.fromEntries([...total.byCard].sort()) })}`,
    );
    for (const key of COUNTS) {
      if (key !== 'notExiled') expectPath(total[key], key);
    }
    for (const name of FEATHER_G3_NAMES) expectPath(total.byCard.get(name) ?? 0, name);
  },
  soakTimeout(300_000),
);
