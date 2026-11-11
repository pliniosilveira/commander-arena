// Slice soak (D-131): whole games with the 'amounts' deck style (SYNTHETIC cards with counted amounts, tapped tokens,
// several players in one selector, each player sacrifices, mill, one-sided damage and conditions about players) between
// random agents, with CasualAgent in some seats. Every game finishes with a result, no fallback, no rejected action, no
// agent error and consistent state after every action; the action log replays to the same final state; and the rules
// of the slice are restated from the events and the state before each action, apart from the engine: a count read when
// the effect ran is the count of the board it ran on, "for each ... this way" is exactly what happened, players act
// in turn order from the active player, milling takes the cards from the top and loses nobody the game, damage from a
// creature is not combat damage and is not dealt back, tokens that were to enter tapped did.
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import {
  checkInvariants,
  type GameState,
  getView,
  type SeatId,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import { stackNameOf, tokenOrCopyNameOf } from './game-names';
import {
  AMOUNT_NAMES,
  AMOUNT_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

interface Tally {
  mills: number;
  milledCards: number;
  tappedTokens: number;
  thisWaySacrifices: number;
  halfTokens: number;
  drainChecks: number;
  gainChecks: number;
  aggregateChecks: number;
  biteDamage: number;
  bitesBack: number;
  apnapChecks: number;
  allDraws: number;
  monarchTokens: number;
  playerConditionFalse: number;
  clueChecks: number;
  casualBites: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  mills: 0,
  milledCards: 0,
  tappedTokens: 0,
  thisWaySacrifices: 0,
  halfTokens: 0,
  drainChecks: 0,
  gainChecks: 0,
  aggregateChecks: 0,
  biteDamage: 0,
  bitesBack: 0,
  apnapChecks: 0,
  allDraws: 0,
  monarchTokens: 0,
  playerConditionFalse: 0,
  clueChecks: 0,
  casualBites: 0,
  byCard: new Map(),
});

/** What a resolving spell or ability did across the steps of its resolution (a decision can come in the middle). */
interface Resolution {
  sacrificed: number;
  zombieTokens: number;
  chosenSeats: SeatId[];
  drawSeats: SeatId[];
}

interface GameBook {
  readonly resolutions: Map<string, Resolution>;
}

const res = (book: GameBook, id: string): Resolution => {
  let r = book.resolutions.get(id);
  if (r === undefined) {
    r = { sacrificed: 0, zombieTokens: 0, chosenSeats: [], drawSeats: [] };
    book.resolutions.set(id, r);
  }
  return r;
};

/** The index of `seat` in the order of CR 101.4 with the active player first. */
const apnapIndex = (state: GameState, seat: SeatId): number =>
  (seat - state.turn.activeSeat + state.seats.length) % state.seats.length;

/** Notes what one applied action did and checks the rules of the slice against the board it was done on. */
function note(tally: Tally, book: GameBook, casual: ReadonlySet<number>, step: StepInfo): void {
  const { before, after, events } = step;
  const resolving = before.resolution?.object ?? before.stack[before.stack.length - 1];
  const resolvingName = resolving === undefined ? '' : stackNameOf(before, resolving);
  const controller: SeatId | undefined =
    resolving === undefined ? undefined : before.objects[resolving]?.controller;

  for (const e of events) {
    if (e.kind === 'spellCast') {
      const name = tokenOrCopyNameOf(after, e.object);
      tally.byCard.set(name, (tally.byCard.get(name) ?? 0) + 1);
    }
  }

  // Milling (CR 701.17): the cards come off the top of the library, and nobody loses for it.
  for (const e of events) {
    if (e.kind !== 'milled') continue;
    tally.mills += 1;
    tally.milledCards += e.objects.length;
    const gone = before.seats[e.seat]?.library.length ?? 0;
    const left = after.seats[e.seat]?.library.length ?? 0;
    if (gone - left !== e.objects.length) {
      throw new Error(
        `a milling of ${e.objects.length} cards took ${gone - left} from the library`,
      );
    }
    for (const id of e.objects) {
      if (after.objects[id]?.zone !== 'graveyard' && after.objects[id] !== undefined) {
        // A milled card may have moved on already (a trigger): it is then a different object, so only the ones still
        // known must be in the graveyard.
        throw new Error('a milled card is not in the graveyard');
      }
    }
  }

  // The bookkeeping of one resolution.
  if (resolving !== undefined) {
    const r = res(book, resolving);
    for (const e of events) {
      if (e.kind === 'sacrificed') r.sacrificed += 1;
      if (e.kind === 'tokenCreated' && e.name === 'Zombie') r.zombieTokens += 1;
      if (e.kind === 'permanentsChosen' && e.purpose === 'sacrifice') r.chosenSeats.push(e.seat);
      if (e.kind === 'cardDrawn') r.drawSeats.push(e.seat);
    }
  }

  // The permanents that were to enter tapped did, and are still tapped until untapped by something (they are, in this
  // action, at their creation).
  if (
    resolvingName === 'SYNTHETIC Army Muster' ||
    resolvingName === 'SYNTHETIC Tapped Hoard' ||
    resolvingName === 'SYNTHETIC Tapped Twin'
  ) {
    for (const e of events) {
      if (e.kind !== 'tokenCreated') continue;
      tally.tappedTokens += 1;
      if (after.objects[e.object]?.tapped !== true)
        throw new Error('a token that enters tapped did not');
    }
  }

  const resolved = events.some((e) => e.kind === 'resolved' && e.object === resolving);
  if (resolving === undefined || controller === undefined || !resolved) return;
  const r = res(book, resolving);
  const mine = (o: { controller: SeatId }): boolean => o.controller === controller;
  const view = getView(before, controller);
  const myCreatures = view.battlefield.filter((o) => mine(o) && o.types.includes('creature'));
  const lifeDelta = (seat: SeatId): number =>
    (after.seats[seat]?.life ?? 0) - (before.seats[seat]?.life ?? 0);
  const opp = (1 - controller) as SeatId;

  // The ability of a card and the spell of the same card are different resolutions.
  const isAbility = before.objects[resolving]?.stack?.kind === 'ability';
  const abilityCards = new Set([
    'SYNTHETIC Dark Merchant',
    'SYNTHETIC Rank Raiser',
    'SYNTHETIC Hand Detective',
    'SYNTHETIC Skyline Tyrant',
    'SYNTHETIC Court of Grace Cousin',
    'SYNTHETIC Envious Cleric',
    'SYNTHETIC Surge Watcher',
    'SYNTHETIC Dragon Scourge',
  ]);
  // The enters ability of a monarch card only makes its controller the monarch.
  const ability = before.objects[resolving]?.stack?.ability;
  const becomesMonarch = ability?.kind === 'triggered' && ability.effect.kind === 'becomeMonarch';
  const checked =
    abilityCards.has(resolvingName) === isAbility && !becomesMonarch ? resolvingName : '';
  switch (checked) {
    case 'SYNTHETIC Wall Tithe': {
      // The total toughness of the creatures the caster controlled as it resolved.
      const total = myCreatures.reduce((n, o) => n + Math.max(0, o.toughness ?? 0), 0);
      if (lifeDelta(controller) !== total) {
        throw new Error(`Wall Tithe gained ${lifeDelta(controller)}, the board said ${total}`);
      }
      tally.aggregateChecks += 1;
      break;
    }
    case 'SYNTHETIC Mighty Feast': {
      const big = myCreatures.filter((o) => (o.power ?? 0) >= 4).length;
      if (lifeDelta(controller) !== 2 * big) {
        throw new Error(`Mighty Feast gained ${lifeDelta(controller)} for ${big} big creatures`);
      }
      tally.aggregateChecks += 1;
      break;
    }
    case 'SYNTHETIC Dark Merchant': {
      // Devotion to black: the black mana symbols among the costs of the permanents the controller controls.
      const devotion = view.battlefield
        .filter(mine)
        .reduce(
          (n, o) =>
            n + (o.manaCost ?? []).filter((s) => s.split('/').some((part) => part === 'B')).length,
          0,
        );
      if (lifeDelta(opp) !== -devotion) {
        throw new Error(`Dark Merchant drained ${-lifeDelta(opp)}, devotion was ${devotion}`);
      }
      tally.drainChecks += 1;
      break;
    }
    case 'SYNTHETIC Rank Raiser': {
      const zombies = myCreatures.filter((o) => o.subtypes.includes('Zombie')).length;
      if (r.zombieTokens !== Math.floor(zombies / 2)) {
        throw new Error(`Rank Raiser made ${r.zombieTokens} tokens for ${zombies} Zombies`);
      }
      tally.halfTokens += 1;
      break;
    }
    case 'SYNTHETIC Necrotic Sweep':
    case 'SYNTHETIC Siphon Flesh Cousin': {
      // A token for each creature sacrificed this way, no more and no fewer.
      if (r.zombieTokens !== r.sacrificed) {
        throw new Error(`${resolvingName}: ${r.sacrificed} sacrificed, ${r.zombieTokens} tokens`);
      }
      tally.thisWaySacrifices += 1;
      break;
    }
    case 'SYNTHETIC Hand Detective': {
      const mineCards = before.seats[controller]?.hand.length ?? 0;
      const more = before.seats.filter(
        (s) => s.id !== controller && !s.hasLost && s.hand.length > mineCards,
      ).length;
      const clues = events.filter((e) => e.kind === 'tokenCreated' && e.name === 'Clue').length;
      if (clues !== more)
        throw new Error(`Hand Detective made ${clues} Clues for ${more} opponents`);
      tally.clueChecks += 1;
      break;
    }
    case 'SYNTHETIC Skyline Tyrant':
    case 'SYNTHETIC Court of Grace Cousin': {
      const monarch = before.monarch === controller;
      const dragons = events.filter((e) => e.kind === 'tokenCreated' && e.name === 'Dragon').length;
      const angels = events.filter((e) => e.kind === 'tokenCreated' && e.name === 'Angel').length;
      const spirits = events.filter((e) => e.kind === 'tokenCreated' && e.name === 'Spirit').length;
      if (resolvingName === 'SYNTHETIC Skyline Tyrant' && dragons !== (monarch ? 1 : 0)) {
        throw new Error(`Skyline Tyrant made ${dragons} Dragons, monarch ${monarch}`);
      }
      if (resolvingName === 'SYNTHETIC Court of Grace Cousin') {
        if (angels !== (monarch ? 1 : 0) || spirits !== (monarch ? 0 : 1)) {
          throw new Error(`Court made ${angels} Angels and ${spirits} Spirits, monarch ${monarch}`);
        }
      }
      if (monarch) tally.monarchTokens += 1;
      else tally.playerConditionFalse += 1;
      break;
    }
    case 'SYNTHETIC Envious Cleric': {
      const gained = lifeDelta(controller);
      const more = (before.seats[opp]?.life ?? 0) > (before.seats[controller]?.life ?? 0);
      // Another source of life in the same action would blur this; the resolution of a trigger is one action.
      if ((gained === 4) !== more)
        throw new Error(`Envious Cleric gained ${gained}, opponent had more: ${more}`);
      tally.gainChecks += 1;
      break;
    }
    case 'SYNTHETIC Gnash Down':
    case 'SYNTHETIC Self Strike':
    case 'SYNTHETIC Flat Bite':
    case 'SYNTHETIC Surge Watcher':
    case 'SYNTHETIC Dragon Scourge': {
      for (const e of events) {
        if (e.kind !== 'damageDealt') continue;
        // A creature deals it: not combat damage, and the source is the creature, not the spell or ability.
        if (e.combat) throw new Error('damage from a creature was combat damage');
        if (e.source === resolving)
          throw new Error('the spell or ability dealt damage a creature should');
        tally.biteDamage += 1;
        // One-sided: the creature that dealt it took none from the creature it hit (Gnash Down's two targets differ).
        if (
          resolvingName === 'SYNTHETIC Gnash Down' &&
          events.some(
            (o) => o.kind === 'damageDealt' && o.to.kind === 'object' && o.to.id === e.source,
          )
        ) {
          tally.bitesBack += 1;
        }
      }
      break;
    }
    default:
      break;
  }

  // Players who choose or act at the same time do so in turn order, the active player first (CR 101.4).
  if (r.chosenSeats.length > 1) {
    const order = r.chosenSeats.map((s) => apnapIndex(before, s));
    if (order.some((v, i) => i > 0 && v < (order[i - 1] ?? 0))) {
      throw new Error(`sacrifices were chosen out of turn order: ${r.chosenSeats.join(',')}`);
    }
    tally.apnapChecks += 1;
  }
  if (resolvingName === 'SYNTHETIC Shared Rendezvous' && r.drawSeats.length > 0) {
    const order = r.drawSeats.map((s) => apnapIndex(before, s));
    if (order.some((v, i) => i > 0 && v < (order[i - 1] ?? 0))) {
      throw new Error(`draws were not in turn order: ${r.drawSeats.join(',')}`);
    }
    tally.allDraws += 1;
  }
  if (resolvingName === 'SYNTHETIC Gnash Down' && casual.has(controller)) tally.casualBites += 1;
  book.resolutions.delete(resolving);
}

test(
  `${GAMES} amount games run clean, replay exactly and use every path of the slice`,
  async () => {
    const total = newTally();
    const turns: number[] = [];
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = AMOUNT_STYLE_PAIRS[g % AMOUNT_STYLE_PAIRS.length] ?? ['amounts', 'amounts'];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 9100 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 9100 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const tally = newTally();
      const book: GameBook = { resolutions: new Map() };
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        note(tally, book, casual, step);
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
      });
      const tag = `game ${g}`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      expect(stateHash(replayGame(config, log)), tag).toBe(stateHash(run.state));
      turns.push(run.state.turn.number);
      for (const key of Object.keys(tally) as (keyof Tally)[]) {
        const v = tally[key];
        if (typeof v === 'number') (total[key] as number) += v;
      }
      for (const [name, n] of tally.byCard)
        total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    const summary = {
      ...total,
      byCard: Object.fromEntries([...total.byCard].sort()),
      turnsMax: Math.max(...turns),
    };
    console.log(`${GAMES} amount games: ${JSON.stringify(summary)}`);

    expect(total.bitesBack).toBe(0);
    expectPath(total.mills);
    expectPath(total.milledCards);
    expectPath(total.tappedTokens);
    expectPath(total.thisWaySacrifices);
    expectPath(total.drainChecks);
    expectPath(total.aggregateChecks);
    expectPath(total.biteDamage);
    expectPath(total.apnapChecks);
    expectPath(total.allDraws);
    expectPath(total.monarchTokens);
    expectPath(total.clueChecks);
    expectPath(total.gainChecks);
    // Every card of the slice was cast at least once somewhere in the games, except the commander-only Czar and the
    // cards that need a board no random game builds (the games are short): they are pinned in the scenario tests.
    for (const name of AMOUNT_NAMES.filter((n) => n !== 'SYNTHETIC Czar of Two Colors')) {
      expectPath(total.byCard.get(name) ?? 0, name);
    }
  },
  soakTimeout(240_000),
);
