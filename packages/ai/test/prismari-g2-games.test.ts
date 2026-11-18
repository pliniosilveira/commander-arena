// Slice soak (issue 87, D-646 and later): whole games with the 'prismariG2' deck style (SYNTHETIC cards of the engine fixtures `synthetic-prismari-g2.ts`: the creatures whose triggers read the
// spell that was cast, the creature that casts a copy of an exiled card, the divided damage among any targets, the tokens that must attack each opponent, the creature that copies itself,
// the land that becomes a creature, the dragon that gives artifacts a mana ability, the creature that can block only creatures with flying, the flashback that costs life and the suspended
// sorcery that adds mana that stays) between random agents, with CasualAgent and HeuristicAgent in some seats. Every game finishes with a result, no fallback, no rejected action and
// consistent state after every action; the action log replays to the same final state; and, with the rules read again here from CR 202.3 (the mana value of a spell), 601.2i (a spell is
// cast), 500.5 (mana empties as each step and phase ends), 514.2 and 702.34a (Flashback), 119.4 (paying life), 509.1b (what a creature can block), 707.12 and 704.5e (a copy of a card
// ceases to exist outside the stack and the battlefield), 702.62b (a suspended card) and the cards' texts (not from the engine's own code), at every step:
//   - a Piano Elemental makes three tokens for a spell of mana value 5 or more, else one (CR 202.3), and a Name Composer makes a copy of itself for each of them, for a spell of mana value 5 or more only;
//   - a Moment Master makes one token whose size is the greatest mana value among the instants and sorceries its controller cast this turn, and none when none was cast;
//   - a Flocking Gale makes two tokens with flying (one opponent, two for each) when it resolves;
//   - a Rushing Refrain that resolves is exiled with three time counters and adds one red mana for each card in the target opponent's hand (CR 702.62b, 500.5);
//   - the mana pools are empty when a new turn starts (CR 500.5);
//   - a Deep Study cast from the graveyard costs 3 life, and goes to exile and never to the graveyard (CR 702.34a);
//   - a Skittish Borrower blocks only creatures with flying (CR 509.1b);
//   - a copy of a card that was cast is on the stack, and one that is anywhere else is gone by the end of the action (CR 704.5e).
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import {
  applyAction,
  checkInvariants,
  type GameState,
  getLegalActions,
  getView,
  manaValue,
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
import { tokenOrCopyNameOf } from './game-names';
import { PRISMARI_G2_STYLE_PAIRS, type StepInfo, smallGameConfig, stepGame } from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

const PIANO = 'SYNTHETIC Piano Elemental';
const ROOTHA = 'SYNTHETIC Moment Master';
const HELLKITE = 'SYNTHETIC Manaform Drake';
const FLOCKING = 'SYNTHETIC Flocking Gale';
const COMPOSER = 'SYNTHETIC Name Composer';
const REFRAIN = 'SYNTHETIC Rushing Refrain';
const STUDY = 'SYNTHETIC Deep Study';
const BORROWER = 'SYNTHETIC Skittish Borrower';

interface Tally {
  pianoTriggers: number;
  pianoBig: number;
  composerCopies: number;
  roothaTokens: number;
  flockingTokens: number;
  refrains: number;
  flashbacks: number;
  borrowerBlocks: number;
  copiesCast: number;
  hellkiteTokens: number;
}

const newTally = (): Tally => ({
  pianoTriggers: 0,
  pianoBig: 0,
  composerCopies: 0,
  roothaTokens: 0,
  flockingTokens: 0,
  refrains: 0,
  flashbacks: 0,
  borrowerBlocks: 0,
  copiesCast: 0,
  hellkiteTokens: 0,
});

interface Memory {
  /** The name of the card behind each triggered ability on the stack, and the mana value of the spell that made it trigger (when a cast did). */
  triggers: Map<ObjectId, { name: string; spellValue: number | null }>;
  /** The spells on the stack: the card's name, the seat, whether it was cast from a graveyard and its target player. */
  spells: Map<
    ObjectId,
    { name: string; seat: number; fromGraveyard: boolean; opponentHand: number; copy: boolean }
  >;
  /** The greatest mana value among the instants and sorceries each seat cast in a turn. */
  greatest: Map<string, number>;
  /** The instant or sorcery just cast whose triggers are being put on the stack: its caster, mana value and the Composers that must trigger. */
  awaiting: {
    spell: ObjectId;
    seat: number;
    value: number;
    composers: number;
    composerTriggers: number;
  } | null;
  /** The life of each seat as the last cast began (the life is paid in a step of the cast, before the spell is on the stack). */
  lifeBeforeCast: number[];
  /** The card ids of the spells cast with flashback, to be found in exile once they leave the stack. */
  flashbackCards: Set<string>;
  /** The tokens made by a Hellkite: gone after the turn. */
  temporary: Map<ObjectId, number>;
}

const nameIn = (step: StepInfo, id: ObjectId): string => {
  const known = tokenOrCopyNameOf(step.before, id);
  return known === '?' ? tokenOrCopyNameOf(step.after, id) : known;
};

/** A spell that is a copy of a card (CR 707.12): it has no card of its own and copies one. */
const isCopyOfCard = (obj: { card: unknown; copyOf?: unknown } | undefined): boolean =>
  obj !== undefined && obj.card === null && obj.copyOf != null;

/** CR 202.3: the mana value of a spell on the stack counts the X announced. */
function spellValueOf(state: GameState, seat: number, id: ObjectId): number | null {
  const spell = getView(state, seat).stack.find((o) => o.id === id);
  if (spell === undefined) return null;
  const cost = spell.manaCost ?? [];
  const xs = cost.filter((s) => s === 'X').length;
  return manaValue(cost.filter((s) => s !== 'X')) + xs * (spell.x ?? 0);
}

const isInstantOrSorcery = (state: GameState, seat: number, id: ObjectId): boolean => {
  const types = getView(state, seat).stack.find((o) => o.id === id)?.types ?? [];
  return types.includes('instant') || types.includes('sorcery');
};

function checkRules(t: Tally, step: StepInfo, memory: Memory): void {
  const { before, after, events } = step;
  const turn = before.turn.number;
  if (before.casting == null) memory.lifeBeforeCast = before.seats.map((seat) => seat.life);
  // CR 500.5: the mana empties as the steps and phases end, and what stays does so until the end of the turn: no pool has mana when the next turn starts.
  if (after.turn.number > turn) {
    for (const seat of after.seats)
      expect(seat.manaPool, 'no mana left in a new turn').toHaveLength(0);
  }
  // A Hellkite's token is exiled at the next end step.
  for (const [id, madeIn] of memory.temporary) {
    if (after.turn.number > madeIn) {
      expect(
        after.objects[id]?.zone === 'battlefield',
        `token ${id} is gone after turn ${madeIn}`,
      ).toBe(false);
      memory.temporary.delete(id);
    }
  }
  // CR 704.5e: a copy of a card ceases to exist anywhere but on the stack or the battlefield (it waits in exile only while its controller is asked whether to cast it).
  for (const obj of Object.values(after.objects)) {
    if (obj.cardCopy === true && obj.zone !== 'stack' && obj.zone !== 'battlefield') {
      expect(obj.zone, 'a copy of a card waits in exile only for the answer').toBe('exile');
      expect(after.pending, 'a copy of a card waits in exile only for the answer').not.toBeNull();
    }
  }
  // The events in order: a spell is cast, then the triggers it caused are put on the stack (in this action or the one that orders them), then something resolves.
  const closeCast = () => {
    const open = memory.awaiting;
    if (open === null) return;
    // A Name Composer triggers for a spell of mana value 5 or more, once for each Composer its controller has (copies included), and never for less.
    expect(
      open.composerTriggers,
      'a Name Composer triggers for a mana value of 5 or more only',
    ).toBe(open.value >= 5 ? open.composers : 0);
    memory.awaiting = null;
  };
  for (const e of events) {
    if (e.kind === 'spellCast') {
      closeCast();
      const value = spellValueOf(after, e.seat, e.object);
      const name = nameIn(step, e.object);
      const opponent = after.seats[1 - e.seat];
      memory.spells.set(e.object, {
        name,
        seat: e.seat,
        fromGraveyard: e.fromZone === 'graveyard',
        opponentHand: opponent?.hand.length ?? 0,
        copy: isCopyOfCard(after.objects[e.object]),
      });
      if (e.fromZone === 'graveyard' && name === STUDY) {
        // CR 702.34a, 119.4: flashback {1}{U} and 3 life.
        t.flashbacks += 1;
        expect(after.seats[e.seat]?.life, 'flashback costs 3 life').toBe(
          (memory.lifeBeforeCast[e.seat] ?? 0) - 3,
        );
        const obj = after.objects[e.object];
        if (obj?.card != null) memory.flashbackCards.add(obj.card);
      }
      if (isInstantOrSorcery(after, e.seat, e.object) && value !== null) {
        const key = `${turn}:${e.seat}`;
        memory.greatest.set(key, Math.max(memory.greatest.get(key) ?? 0, value));
        memory.awaiting = {
          spell: e.object,
          seat: e.seat,
          value,
          composers: Object.values(before.objects).filter(
            (o) =>
              o.zone === 'battlefield' &&
              o.controller === e.seat &&
              tokenOrCopyNameOf(before, o.id) === COMPOSER,
          ).length,
          composerTriggers: 0,
        };
      }
    }
    if (e.kind === 'abilityTriggered') {
      const name = nameIn(step, e.source);
      const open = memory.awaiting;
      // The mana value of the spell just cast is the one the triggers of the caster's permanents read (CR 202.3).
      const mine = open !== null && after.objects[e.source]?.controller === open.seat;
      memory.triggers.set(e.stackObject, {
        name,
        spellValue: mine ? open.value : null,
      });
      if (mine && name === COMPOSER && e.abilityIndex === 1) open.composerTriggers += 1;
    }
    // The triggers of the cast are all on the stack once the cast spell or one of them leaves it (not when the ability that cast a copy of a card resolves: its triggers come after).
    if (e.kind === 'resolved' || e.kind === 'fizzled' || e.kind === 'countered') {
      const open = memory.awaiting;
      if (
        open !== null &&
        (e.object === open.spell || memory.triggers.get(e.object)?.spellValue != null)
      ) {
        closeCast();
      }
    }
  }
  if (after.turn.number > turn) closeCast();
  // Skittish Borrower: only creatures with flying are blocked by it (CR 509.1b).
  if (step.action.kind === 'declareBlockers') {
    for (const block of step.action.blocks) {
      if (nameIn(step, block.blocker) !== BORROWER) continue;
      t.borrowerBlocks += 1;
      const attacker = getView(before, 1 - step.seat).battlefield.find(
        (o) => o.id === block.attacker,
      );
      expect(
        attacker?.keywords.includes('flying'),
        'a Skittish Borrower blocks a creature with flying',
      ).toBe(true);
    }
  }
  // What resolved in this step: the ability or spell, and the tokens it made.
  const resolved = events.flatMap((e) => (e.kind === 'resolved' ? [e.object] : []));
  const fizzled = events.some((e) => e.kind === 'fizzled' || e.kind === 'countered');
  const created = events.flatMap((e) =>
    e.kind === 'tokenCreated' ? [{ id: e.object, seat: e.seat }] : [],
  );
  for (const id of resolved) {
    const trigger = memory.triggers.get(id);
    const spell = memory.spells.get(id);
    const name = trigger?.name ?? spell?.name;
    if (name === undefined) continue;
    if (name === PIANO && trigger?.spellValue != null && !fizzled) {
      t.pianoTriggers += 1;
      if (trigger.spellValue >= 5) t.pianoBig += 1;
      // CR 202.3: three tokens for a mana value of 5 or more, else one.
      expect(created.length, 'three tokens for a mana value of 5 or more, else one').toBe(
        trigger.spellValue >= 5 ? 3 : 1,
      );
    }
    if (name === COMPOSER && trigger?.spellValue != null && !fizzled) {
      t.composerCopies += created.length;
      expect(created.length, 'a copy of the creature').toBe(1);
      expect(tokenOrCopyNameOf(after, created[0]?.id as ObjectId)).toBe(COMPOSER);
    }
    if (name === ROOTHA && trigger !== undefined && !fizzled) {
      const seat = trigger.name === ROOTHA ? (created[0]?.seat ?? null) : null;
      const key = seat === null ? '' : `${turn}:${seat}`;
      const greatest = memory.greatest.get(key);
      if (seat !== null) {
        expect(
          greatest,
          'a Moment Master makes a token only after an instant or sorcery',
        ).not.toBeUndefined();
        expect(created.length).toBe(1);
        const view = getView(after, seat).battlefield.find((o) => o.id === created[0]?.id);
        if (view !== undefined) {
          expect(view.power, 'X/X, X the greatest mana value cast this turn').toBe(greatest);
          expect(view.toughness).toBe(greatest);
        }
        t.roothaTokens += 1;
      }
    }
    if (name === HELLKITE && trigger !== undefined && !fizzled) {
      for (const made of created) {
        // CR 603.7a: "the next end step" is the one of the next turn when the token is made during the end step itself.
        memory.temporary.set(made.id, before.turn.step === 'end' ? turn + 1 : turn);
        const view = getView(after, made.seat).battlefield.find((o) => o.id === made.id);
        if (view !== undefined) expect(view.power, 'an X/X token').toBe(view.toughness);
        t.hellkiteTokens += 1;
      }
    }
    if (name === FLOCKING && spell !== undefined && !fizzled) {
      // One opponent, two tokens with flying for each (CR 508.1d).
      expect(created.length, 'two tokens for the opponent').toBe(2);
      t.flockingTokens += created.length;
      for (const made of created) {
        const view = getView(after, made.seat).battlefield.find((o) => o.id === made.id);
        if (view !== undefined) expect(view.keywords.includes('flying')).toBe(true);
      }
    }
    if (name === REFRAIN && spell !== undefined && !fizzled) {
      t.refrains += 1;
      // CR 702.62b, 608.2n: exiled with three time counters.
      const exiled = Object.values(after.objects).filter(
        (o) => o.zone === 'exile' && o.card !== null && tokenOrCopyNameOf(after, o.id) === REFRAIN,
      );
      // A copy of the card that was cast (CR 707.12) is not a card: it is put into exile and ceases to exist (CR 704.5e).
      if (!spell.copy) {
        expect(
          exiled.some((o) => (o.counters?.time ?? 0) === 3),
          'Rushing Refrain is exiled with three time counters',
        ).toBe(true);
      }
      // One red mana for each card in the target opponent's hand, kept in the pool (CR 500.5).
      const gained =
        (after.seats[spell.seat]?.manaPool.length ?? 0) -
        (before.seats[spell.seat]?.manaPool.length ?? 0);
      expect(gained, 'one red mana for each card in the opponent’s hand').toBe(spell.opponentHand);
    }
  }
  // CR 702.34a: a spell cast with flashback is exiled once it leaves the stack, never put into the graveyard.
  for (const card of memory.flashbackCards) {
    const objects = Object.values(after.objects).filter((o) => o.card === card);
    const where = objects.map((o) => o.zone);
    expect(
      where.every((z) => z === 'stack' || z === 'exile' || z === 'hand'),
      'a flashback card is never in the graveyard once it was cast with flashback',
    ).toBe(true);
  }
}

test(
  `${GAMES} prismariG2 games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = PRISMARI_G2_STYLE_PAIRS[g % PRISMARI_G2_STYLE_PAIRS.length] ?? [
        'prismariG2',
        'prismariG2',
      ];
      const config = smallGameConfig(g, styles);
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? g % 8 < 4
            ? new CasualAgent({ seed: 264000 + 2 * g + seat })
            : new HeuristicAgent({ seed: 264000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 264000 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const t = newTally();
      const memory: Memory = {
        triggers: new Map(),
        spells: new Map(),
        greatest: new Map(),
        awaiting: null,
        lifeBeforeCast: [],
        flashbackCards: new Set(),
        temporary: new Map(),
      };
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        // CR 707.12: a copy of an exiled card, cast.
        for (const e of step.events) {
          if (e.kind === 'spellCast' && isCopyOfCard(step.after.objects[e.object])) {
            t.copiesCast += 1;
          }
        }
        checkRules(t, step, memory);
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
      for (const key of Object.keys(total) as (keyof Tally)[]) total[key] += t[key];
    }
    console.log(`${GAMES} prismariG2 games: ${JSON.stringify(total)}`);
    expectPath(total.pianoTriggers, 'a Piano Elemental trigger that made tokens');
    expectPath(total.roothaTokens, 'a token of a Moment Master');
    expectPath(total.hellkiteTokens, 'a token of a Manaform Drake');
    expectPath(total.refrains, 'a Rushing Refrain that resolved');
    expectPath(total.copiesCast, 'a copy of an exiled card that was cast');
  },
  soakTimeout(600_000),
);
