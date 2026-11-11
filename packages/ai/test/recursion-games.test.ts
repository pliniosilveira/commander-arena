// Slice soak (D-135): whole games with the 'recursion' deck style (SYNTHETIC cards that return creature cards from the graveyard
// with a follow-up that reads the card, "you may ... if you do", reflexive triggers, any number of sacrifices, a card put third from
// the top, Gift, a permission to cast a creature card from the graveyard, abilities that work from the graveyard with a reduced
// cost, lands that enter untapped or tapped with a trigger, and life paid by an amount) between random agents, with CasualAgent in
// some seats. Every game finishes with a result, no fallback, no rejected action, no agent error and consistent state after every
// action; the action log replays to the same final state; and the rules of the slice are restated from the events and the state
// before each action, apart from the engine: a gift is promised to an opponent and is drawn before the other effects of a spell,
// a creature sacrificed for "the greatest power" has it, "any number" of sacrifices draws that many cards, a card put third from
// the top is third (or last), a land enters tapped unless three other Swamps are there and its trigger fires only when it entered
// untapped, a card is cast from a graveyard only with a permission, an ability from the graveyard costs {4} less only when an
// opponent controls four nonbasic lands, and life paid by an amount is the amount.
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import {
  checkInvariants,
  type GameEvent,
  type GameState,
  getView,
  type ObjectId,
  type SeatId,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import { faceOf, stackNameOf, tokenOrCopyNameOf } from './game-names';
import {
  RECURSION_NAMES,
  RECURSION_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

interface Tally {
  gifts: number;
  giftDraws: number;
  giftTargets: number;
  greatestChecks: number;
  anyNumberSacrifices: number;
  anyNumberNone: number;
  thirdFromTop: number;
  cottageChecks: number;
  untappedTriggers: number;
  tappedTriggers: number;
  graveyardCasts: number;
  permissions: number;
  revenantActivations: number;
  reducedActivations: number;
  lifeByAmount: number;
  reflexiveChecks: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  gifts: 0,
  giftDraws: 0,
  giftTargets: 0,
  greatestChecks: 0,
  anyNumberSacrifices: 0,
  anyNumberNone: 0,
  thirdFromTop: 0,
  cottageChecks: 0,
  untappedTriggers: 0,
  tappedTriggers: 0,
  graveyardCasts: 0,
  permissions: 0,
  revenantActivations: 0,
  reducedActivations: 0,
  lifeByAmount: 0,
  reflexiveChecks: 0,
  byCard: new Map(),
});

const isCreatureCard = (state: GameState, id: ObjectId): boolean =>
  faceOf(state, id)?.types.includes('creature') ?? false;

/** The number of colors in the color identity of a seat's commanders (CR 903.4). */
function commanderColors(state: GameState, seat: SeatId): number {
  const colors = new Set<string>();
  for (const id of state.seats[seat]?.commanders ?? []) {
    const instance = state.cards[id];
    const def = instance === undefined ? undefined : state.definitions[instance.definition];
    for (const c of def?.colorIdentity ?? []) colors.add(c);
  }
  return colors.size;
}

const swampsOf = (state: GameState, seat: SeatId): number =>
  state.battlefield.filter(
    (id) =>
      state.objects[id]?.controller === seat &&
      (faceOf(state, id)?.subtypes ?? []).includes('Swamp'),
  ).length;

const nonbasicLandsOf = (state: GameState, seat: SeatId): number =>
  state.battlefield.filter((id) => {
    const face = faceOf(state, id);
    return (
      state.objects[id]?.controller === seat &&
      face?.types.includes('land') === true &&
      !face.supertypes.includes('basic')
    );
  }).length;

const GIFT_SPELLS = ['SYNTHETIC Greedy Reaper', 'SYNTHETIC Gift Study'] as const;

interface Watch {
  /** An activation of a land with life paid by an amount, begun and not yet finished. */
  well: { seat: SeatId; name: string; expected: number; lifeBefore: number } | null;
}

const tally = (t: Tally, name: string): void => {
  t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
};

function checkRules(t: Tally, watch: Watch, step: StepInfo): void {
  const { before, after, action, events } = step;
  const seatLife = (s: GameState, seat: SeatId) => s.seats[seat]?.life ?? 0;
  const hands = (s: GameState, seat: SeatId) => s.seats[seat]?.hand.length ?? 0;
  const views = new Map<SeatId, ReturnType<typeof getView>>();
  const powerOf = (id: ObjectId): number | null => {
    const obj = before.objects[id];
    if (obj === undefined) return null;
    let view = views.get(obj.controller);
    if (view === undefined) {
      view = getView(before, obj.controller);
      views.set(obj.controller, view);
    }
    return view.battlefield.find((o) => o.id === id)?.power ?? null;
  };

  // A life payment by an amount (D-135): the amount is worked out as the ability is activated.
  if (action.kind === 'activate') {
    const name = tokenOrCopyNameOf(before, action.object);
    if (name === 'SYNTHETIC Tithe Well' || name === 'SYNTHETIC Blood Well') {
      const seat = step.seat as SeatId;
      const expected =
        name === 'SYNTHETIC Tithe Well'
          ? commanderColors(before, seat)
          : before.battlefield.filter(
              (id) => before.objects[id]?.controller === seat && isCreatureCard(before, id),
            ).length;
      watch.well = { seat, name, expected, lifeBefore: seatLife(before, seat) };
    }
  }
  if (action.kind === 'cancel') watch.well = null;
  for (const e of events) {
    if (e.kind === 'abilityActivated' && watch.well !== null && watch.well.seat === e.seat) {
      const { name, expected, lifeBefore, seat } = watch.well;
      if (tokenOrCopyNameOf(after, e.source) === name) {
        if (lifeBefore - seatLife(after, seat) !== expected) {
          throw new Error(
            `${name} paid ${lifeBefore - seatLife(after, seat)} life, expected ${expected}`,
          );
        }
        t.lifeByAmount += 1;
        watch.well = null;
      }
    }
  }

  for (const e of events) {
    switch (e.kind) {
      case 'spellCast': {
        const name = tokenOrCopyNameOf(after, e.object);
        tally(t, name);
        if (e.gift !== undefined) {
          // CR 702.174a: the chosen player is an opponent of the caster, and only a card with Gift asks.
          if (e.gift === e.seat) throw new Error(`${name}: the gift was promised to its caster`);
          if (!(RECURSION_NAMES as readonly string[]).includes(name)) {
            throw new Error(`${name} was cast with a gift`);
          }
          t.gifts += 1;
        }
        if (name === 'SYNTHETIC Greedy Reaper') {
          // CR 702.174m: the second target exists only if the gift was promised.
          const targets = after.objects[e.object]?.stack?.chosenTargets.length ?? 0;
          if (targets !== (e.gift === undefined ? 1 : 2)) {
            throw new Error(`Greedy Reaper was cast with ${targets} targets`);
          }
          t.giftTargets += 1;
        }
        break;
      }
      case 'resolved': {
        const spell = before.objects[e.object];
        const name = tokenOrCopyNameOf(before, e.object);
        const giftTo = spell?.stack?.giftTo;
        if (giftTo !== undefined && (GIFT_SPELLS as readonly string[]).includes(name)) {
          // CR 702.174b, 702.174j: the chosen player drew a card as the spell resolved (if they had one to draw).
          if ((before.seats[giftTo]?.library.length ?? 0) > 0) {
            if (hands(after, giftTo) < hands(before, giftTo) + 1) {
              throw new Error(`${name}: the gift was not drawn`);
            }
            t.giftDraws += 1;
          }
        }
        break;
      }
      case 'sacrificed': {
        // "A creature with the greatest power among creatures they control" (D-135).
        const source =
          before.resolution === null ? null : tokenOrCopyNameOf(before, before.resolution.source);
        if (source === 'SYNTHETIC Greedy Reaper' || source === 'SYNTHETIC Edict of the Mighty') {
          const power = powerOf(e.permanent);
          const owner = before.objects[e.permanent]?.controller;
          if (power !== null && owner !== undefined) {
            const others = before.battlefield
              .filter(
                (id) => before.objects[id]?.controller === owner && isCreatureCard(before, id),
              )
              .map((id) => powerOf(id))
              .filter((p): p is number => p !== null);
            if (power !== Math.max(...others)) {
              throw new Error(
                `${source}: a creature of power ${power} was sacrificed, not the greatest`,
              );
            }
            t.greatestChecks += 1;
          }
        }
        // "When you do" (CR 603.12): the creature sacrificed for Heart Striker starts its reflexive trigger.
        if (source === 'SYNTHETIC Heart Striker') {
          const triggered = events.some(
            (x) => x.kind === 'abilityTriggered' && stackNameOf(after, x.stackObject) === source,
          );
          if (!triggered)
            throw new Error('Heart Striker: no reflexive trigger after the sacrifice');
          t.reflexiveChecks += 1;
        }
        break;
      }
      case 'zoneChanged': {
        const name = tokenOrCopyNameOf(after, e.to);
        // Third from the top (CR 401.7).
        if (e.toZone === 'library' && name === 'SYNTHETIC Greedy God' && e.fromZone !== 'hand') {
          const owner = after.objects[e.to]?.zoneOwner;
          const library = owner == null ? [] : (after.seats[owner]?.library ?? []);
          const at = library.indexOf(e.to);
          if (at !== Math.min(2, library.length - 1)) {
            throw new Error(`Greedy God went to place ${at} of ${library.length}`);
          }
          t.thirdFromTop += 1;
        }
        if (e.toZone === 'battlefield' && name === 'SYNTHETIC Haunted Cottage') {
          // CR 614.12: tapped unless three other Swamps; the enters-untapped trigger needs one that entered untapped (CR 603.6a).
          const controller = after.objects[e.to]?.controller as SeatId;
          const expectTapped = swampsOf(before, controller) < 3;
          if (after.objects[e.to]?.tapped !== expectTapped) {
            throw new Error(`Haunted Cottage entered ${expectTapped ? 'untapped' : 'tapped'}`);
          }
          const triggered = events.some((x) => x.kind === 'abilityTriggered' && x.source === e.to);
          const target = (after.seats[controller]?.graveyard ?? []).some((id) =>
            isCreatureCard(after, id),
          );
          // An enters-untapped trigger needs a creature card to name; a land that entered tapped has none at all.
          if (expectTapped && triggered)
            throw new Error('Haunted Cottage entered tapped and triggered');
          if (!expectTapped && target && !triggered) {
            throw new Error('Haunted Cottage entered untapped with a target and did not trigger');
          }
          t.cottageChecks += 1;
          if (!expectTapped) t.untappedTriggers += 1;
        }
        if (e.toZone === 'battlefield' && name === 'SYNTHETIC Sulking Tarn') {
          const triggered = events.some((x) => x.kind === 'abilityTriggered' && x.source === e.to);
          if (!triggered) throw new Error('Sulking Tarn entered tapped and did not trigger');
          t.tappedTriggers += 1;
        }
        // An ability that works from the graveyard returns its card with a +1/+1 counter (CR 122.6).
        if (
          e.fromZone === 'graveyard' &&
          e.toZone === 'battlefield' &&
          name.startsWith('SYNTHETIC Revenant ') &&
          before.resolution !== null &&
          tokenOrCopyNameOf(before, before.resolution.source) === name
        ) {
          if ((after.objects[e.to]?.counters['+1/+1'] ?? 0) !== 1) {
            throw new Error(`${name} returned without its counter`);
          }
        }
        // "You may exile it. When you do, ...": the reflexive trigger goes on the stack when there is a creature card to name.
        if (
          e.fromZone === 'graveyard' &&
          e.toZone === 'exile' &&
          name === 'SYNTHETIC Keen Butler' &&
          before.resolution !== null &&
          tokenOrCopyNameOf(before, before.resolution.source) === 'SYNTHETIC Keen Butler'
        ) {
          const owner = after.objects[e.to]?.owner as SeatId;
          const target = (after.seats[owner]?.graveyard ?? []).some((id) =>
            isCreatureCard(after, id),
          );
          const triggered = events.some(
            (x) => x.kind === 'abilityTriggered' && stackNameOf(after, x.stackObject) === name,
          );
          if (triggered !== target) {
            throw new Error(
              `Keen Butler: reflexive trigger ${triggered}, target available ${target}`,
            );
          }
          t.reflexiveChecks += 1;
        }
        break;
      }
      case 'abilityActivated': {
        const name = tokenOrCopyNameOf(after, e.source);
        if (
          name.startsWith('SYNTHETIC Revenant ') &&
          before.objects[e.source]?.zone === 'graveyard'
        ) {
          // The ability costs {4} less only when an opponent controls four or more nonbasic lands (CR 601.2f).
          const opponent = (1 - e.seat) as SeatId;
          const reduced = nonbasicLandsOf(before, opponent) >= 4;
          const ability =
            e.stackObject === null ? undefined : after.objects[e.stackObject]?.stack?.ability;
          const cost = ability?.kind === 'activated' ? ability.cost : [];
          const symbols = cost.flatMap((c) => (c.kind === 'mana' ? c.symbols : []));
          const expected = reduced ? ['B', 'B'] : ['4', 'B', 'B'];
          if (symbols.join('') !== expected.join('')) {
            throw new Error(`${name} cost ${symbols.join('')}, expected ${expected.join('')}`);
          }
          t.revenantActivations += 1;
          if (reduced) t.reducedActivations += 1;
        }
        if (name.startsWith('SYNTHETIC Grave Chanter ')) t.permissions += 1;
        break;
      }
      default:
        break;
    }
  }

  // The choice of "any number" of permanents (D-135): each one sacrificed is a card drawn.
  if (action.kind === 'choosePermanents' && before.pending?.kind === 'choosePermanent') {
    const d = before.pending;
    const source = before.objects[d.source];
    const name = source === undefined ? '?' : stackNameOf(before, d.source);
    if (name === 'SYNTHETIC Greedy God' && d.purpose === 'sacrifice' && d.min === 0) {
      const seat = d.seat;
      const n = action.objects.length;
      const library = before.seats[seat]?.library.length ?? 0;
      const drew = hands(after, seat) - hands(before, seat);
      if (drew !== Math.min(n, library)) {
        throw new Error(`Greedy God sacrificed ${n} and drew ${drew} (library ${library})`);
      }
      if (action.objects.some((id) => id === source?.stack?.source)) {
        throw new Error('Greedy God sacrificed itself');
      }
      if (n === 0) t.anyNumberNone += 1;
      else t.anyNumberSacrifices += 1;
    }
  }

  // A card is cast from a graveyard only with a permission for that very card (D-135).
  if (action.kind === 'castSpell') {
    const was = before.objects[action.object];
    if (was?.zone === 'graveyard' && action.alternative === undefined) {
      const permitted = before.continuousEffects.some(
        (c) =>
          c.change.kind === 'castPermission' &&
          c.change.seat === was.owner &&
          c.objects.includes(action.object),
      );
      if (!permitted) {
        throw new Error(
          `${tokenOrCopyNameOf(before, action.object)} was cast from a graveyard with no permission`,
        );
      }
      t.graveyardCasts += 1;
    }
  }
}

test(
  `${GAMES} recursion games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    const turns: number[] = [];
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = RECURSION_STYLE_PAIRS[g % RECURSION_STYLE_PAIRS.length] ?? [
        'recursion',
        'recursion',
      ];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 9500 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 9500 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const t = newTally();
      const watch: Watch = { well: null };
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkRules(t, watch, step);
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
    console.log(`${GAMES} recursion games: ${JSON.stringify(summary)}`);

    expectPath(total.gifts);
    expectPath(total.giftDraws);
    expectPath(total.greatestChecks);
    expectPath(total.anyNumberSacrifices);
    expectPath(total.graveyardCasts);
    expectPath(total.cottageChecks);
    expectPath(total.untappedTriggers);
    expectPath(total.revenantActivations);
    expectPath(total.reflexiveChecks);
    // Every spell of the slice was cast at least once somewhere in the games.
    for (const name of RECURSION_NAMES) {
      expectPath(total.byCard.get(name) ?? 0, name);
    }
  },
  soakTimeout(240_000),
);

// A type check of the events this file reads, so that a renamed event fails here and not silently.
const _events: readonly GameEvent['kind'][] = [
  'spellCast',
  'resolved',
  'sacrificed',
  'zoneChanged',
  'abilityActivated',
  'abilityTriggered',
];
void _events;
