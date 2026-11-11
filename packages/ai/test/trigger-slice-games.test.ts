// Slice soak (D-111): whole games (the `soakGames()` count, test/soak.ts) with the 'triggerSlice' deck style (SYNTHETIC cards: step triggers,
// "whenever you draw", combat damage dealt, leaving the battlefield, power and mana value comparisons,
// "equipped / enchanted creature", "an opponent casts", "unless that player pays") between random agents,
// with CasualAgent in some seats. Every game finishes with a result, no fallback, no rejected action and
// consistent state after every action; the action log replays to the same final state; and, with the rules
// read again here from the cards' texts (not from the engine's own trigger code), at every step:
//   - each step watcher triggers exactly once as its step begins, on the turns its text names (CR 503 to 514);
//   - the draw watchers trigger once for each card drawn by the player they name, and "your second card
//     each turn" on the second card only, counting the turn's draws apart from the engine (CR 121.1);
//   - the combat damage watchers trigger once for each source and each player or creature it damages,
//     as its text says (CR 120.2a, 510.2), never for noncombat damage;
//   - a creature that leaves triggers its own "leaves the battlefield [and is put into ...]" once, and the
//     watchers of its controller (last-known information, CR 603.10a);
//   - a creature with power 4 or greater entering, and a creature with power 3 or less or toughness 4 or
//     more dying, are read from the power it has as it enters, or had as it left (CR 603.6a, 603.10a);
//   - "mana value 2 or less" and "mana value 3" read the spell's mana value as it is cast (CR 202.3);
//   - an Equipment or Aura sees its host die, attack, deal combat damage or leave (CR 603.10a);
//   - the opponent's spell triggers "an opponent casts" once, and its caster, not the watcher's controller,
//     is asked whether to pay; paying ends it, declining or being unable to pay lets the effect happen
//     (CR 118.12a, 118.3).
import {
  applyAction,
  checkInvariants,
  type GameEvent,
  type GameState,
  getLegalActions,
  getView,
  manaValue,
  type ObjectId,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import {
  type DeckStyle,
  landSlots,
  type StepInfo,
  smallGameConfig,
  spellSlots,
  stepGame,
  TRIGGER_SLICE_NAMES,
  TRIGGER_SLICE_STYLE_PAIRS,
  TRIGGER_SLICE_UNUSED_NAMES,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 6000 };

/** What the cards' texts say, restated here (src/cards/fixtures/synthetic-triggers-more.ts). */
const STEP_WATCHERS: Readonly<
  Record<string, { step: string; whose: 'you' | 'each' | 'opponent' }>
> = {
  'SYNTHETIC Step Watcher beginCombat you': { step: 'beginningOfCombat', whose: 'you' },
  'SYNTHETIC Step Watcher draw opponent': { step: 'draw', whose: 'opponent' },
  'SYNTHETIC Step Watcher main1 each': { step: 'precombatMain', whose: 'each' },
  'SYNTHETIC Step Watcher main2 each': { step: 'postcombatMain', whose: 'each' },
  'SYNTHETIC Step Watcher combatEnd you': { step: 'endOfCombat', whose: 'you' },
  'SYNTHETIC Step Watcher upkeep opponent': { step: 'upkeep', whose: 'opponent' },
  'SYNTHETIC Step Watcher endStep each': { step: 'end', whose: 'each' },
};
const DRAW_WATCHERS: Readonly<Record<string, { who: 'you' | 'opponent'; nth?: number }>> = {
  'SYNTHETIC Draw Watcher': { who: 'you' },
  'SYNTHETIC Opponent Draw Watcher': { who: 'opponent' },
  'SYNTHETIC Second Draw Watcher': { who: 'you', nth: 2 },
};
/** Combat damage watchers: whose creature, and what it must hit. */
type Recipient = 'player' | 'opponent' | 'creature' | 'bigCreature' | 'any';
const HIT_WATCHERS: Readonly<Record<string, { own: boolean; to: Recipient }>> = {
  'SYNTHETIC Player Hit Watcher': { own: true, to: 'player' },
  'SYNTHETIC Opponent Hit Watcher': { own: true, to: 'opponent' },
  'SYNTHETIC Creature Hit Watcher': { own: true, to: 'creature' },
  'SYNTHETIC Big Creature Hit Watcher': { own: true, to: 'bigCreature' },
  'SYNTHETIC Any Damage Watcher': { own: true, to: 'any' },
  'SYNTHETIC Every Hit Watcher': { own: false, to: 'player' },
};
/** Creatures that watch their own combat damage. */
const SELF_HIT: Readonly<Record<string, 'player' | 'creature'>> = {
  'SYNTHETIC Biting Bear': 'player',
  'SYNTHETIC Scrapping Bear': 'creature',
  'SYNTHETIC Striking Bear': 'player',
};
/** Creatures that watch themselves leave: the zone they must go to, or null for any. */
const LEAVERS: Readonly<Record<string, string | null>> = {
  'SYNTHETIC Leaver any': null,
  'SYNTHETIC Leaver graveyard': 'graveyard',
  'SYNTHETIC Leaver exile': 'exile',
  'SYNTHETIC Leaver hand': 'hand',
};
const TAX: Readonly<Record<string, { optional: boolean; cost: string }>> = {
  'SYNTHETIC Tax Collector': { optional: true, cost: 'mana' },
  'SYNTHETIC Strict Tax Collector': { optional: false, cost: 'mana' },
  'SYNTHETIC Blood Tax Collector': { optional: false, cost: 'payLife' },
  'SYNTHETIC Tithe Collector': { optional: false, cost: 'discard' },
};

interface Tally {
  stepTriggers: number;
  stepOpponentTurn: number;
  drawTriggers: number;
  secondDraws: number;
  hitTriggers: number;
  hitCreature: number;
  hitDoubleStrike: number;
  leaveTriggers: number;
  leaveRivals: number;
  arrivals: number;
  frailDeaths: number;
  spellMv: number;
  attachedTriggers: number;
  taxAsked: number;
  taxPaid: number;
  taxDeclined: number;
  taxCannotPay: number;
  casualAnswers: number;
  randomAnswers: number;
}
const newTally = (): Tally => ({
  stepTriggers: 0,
  stepOpponentTurn: 0,
  drawTriggers: 0,
  secondDraws: 0,
  hitTriggers: 0,
  hitCreature: 0,
  hitDoubleStrike: 0,
  leaveTriggers: 0,
  leaveRivals: 0,
  arrivals: 0,
  frailDeaths: 0,
  spellMv: 0,
  attachedTriggers: 0,
  taxAsked: 0,
  taxPaid: 0,
  taxDeclined: 0,
  taxCannotPay: 0,
  casualAnswers: 0,
  randomAnswers: 0,
});

/** The name of the card behind an object (the object, or its last-known information). */
function nameOf(state: GameState, id: ObjectId): string {
  const obj = state.objects[id];
  const origin =
    obj?.stack?.kind === 'ability' && obj.stack.source !== null ? obj.stack.source : id;
  const card = state.objects[origin];
  if (card === undefined) return state.lki[origin]?.characteristics.name ?? '';
  if (card.token !== null) return card.token.characteristics.name;
  if (card.card === null) return '';
  return state.definitions[state.cards[card.card]?.definition ?? -1]?.faces[card.face]?.name ?? '';
}

const eventsOf = <K extends GameEvent['kind']>(events: readonly GameEvent[], kind: K) =>
  events.filter((e): e is Extract<GameEvent, { kind: K }> => e.kind === kind);

/** The controller of an object, or of its last-known information. */
function controllerOf(state: GameState, id: ObjectId): number | undefined {
  return (state.objects[id] ?? state.lki[id]?.object)?.controller;
}

/** A battlefield object's derived power and toughness in the view of the state (public information). */
function ptOf(state: GameState, id: ObjectId) {
  const o = getView(state, 0).battlefield.find((v) => v.id === id);
  return o === undefined ? undefined : { power: o.power, toughness: o.toughness, types: o.types };
}

/** How many triggers of the permanent were made by this action: put on the stack, or still waiting. */
function created(step: StepInfo, id: ObjectId): number {
  const onStack = eventsOf(step.events, 'abilityTriggered').filter((e) => e.source === id).length;
  const waiting = (s: GameState) => s.pendingTriggers.filter((t) => t.source === id).length;
  return onStack + waiting(step.after) - waiting(step.before);
}

/** The watchers of the slice that were on the battlefield before the action, with their names. */
function watchers(step: StepInfo): { id: ObjectId; name: string; controller: number }[] {
  return step.before.battlefield.flatMap((id) => {
    const name = nameOf(step.before, id);
    const controller = controllerOf(step.before, id);
    return (TRIGGER_SLICE_NAMES as readonly string[]).includes(name) && controller !== undefined
      ? [{ id, name, controller }]
      : [];
  });
}

/** Per-game counts the independent rules need: the cards each seat has drawn this turn. */
interface GameCounts {
  turn: number;
  drawn: number[];
}

function checkTriggers(tally: Tally, step: StepInfo, counts: GameCounts) {
  const expected = new Map<ObjectId, number>();
  const expect1 = (id: ObjectId, n = 1) => expected.set(id, (expected.get(id) ?? 0) + n);
  const present = watchers(step);
  const gone = new Set<ObjectId>();

  // The turn's draws, counted here and compared with the engine's own count (CR 121.1).
  for (const e of step.events) {
    if (e.kind === 'turnBegan') {
      counts.turn = e.turn;
      counts.drawn = [0, 0];
    }
    if (e.kind === 'cardDrawn') {
      const n = (counts.drawn[e.seat] ?? 0) + 1;
      counts.drawn[e.seat] = n;
      expect(e.nth, 'nth card drawn this turn').toBe(n);
      expect(step.after.seats[e.seat]?.cardsDrawnThisTurn).toBeGreaterThanOrEqual(e.nth);
    }
  }

  for (const e of step.events) {
    switch (e.kind) {
      case 'stepBegan':
        for (const w of present) {
          const spec = STEP_WATCHERS[w.name];
          if (spec === undefined || spec.step !== e.step || gone.has(w.id)) continue;
          const yes = spec.whose === 'each' || (spec.whose === 'you') === (w.controller === e.seat);
          if (yes) {
            expect1(w.id);
            tally.stepTriggers += 1;
            if (w.controller !== e.seat) tally.stepOpponentTurn += 1;
          }
        }
        break;
      case 'cardDrawn': {
        for (const w of present) {
          const spec = DRAW_WATCHERS[w.name];
          if (spec === undefined || gone.has(w.id)) continue;
          if ((spec.who === 'you') !== (w.controller === e.seat)) continue;
          if (spec.nth !== undefined && spec.nth !== e.nth) continue;
          expect1(w.id);
          tally.drawTriggers += 1;
          if (spec.nth !== undefined) tally.secondDraws += 1;
        }
        break;
      }
      case 'damageDealt': {
        if (!e.combat) break;
        const sourceController =
          controllerOf(step.before, e.source) ?? controllerOf(step.after, e.source);
        const hitPlayer = e.to.kind === 'player';
        const hit = e.to.kind === 'object' ? ptOf(step.before, e.to.id) : undefined;
        const hitCreature = hit?.types.includes('creature') === true;
        for (const w of present) {
          if (gone.has(w.id)) continue;
          const spec = HIT_WATCHERS[w.name];
          if (spec !== undefined && sourceController !== undefined) {
            if (spec.own && sourceController !== w.controller) continue;
            if (!spec.own && !hitPlayer) continue;
            const isCreature = (
              getView(step.before, 0).battlefield.find((v) => v.id === e.source)?.types ?? []
            ).includes('creature');
            if (!isCreature) continue;
            const yes =
              spec.to === 'any' ||
              (spec.to === 'player' && hitPlayer) ||
              (spec.to === 'opponent' &&
                hitPlayer &&
                e.to.kind === 'player' &&
                e.to.seat !== w.controller) ||
              (spec.to === 'creature' && hitCreature) ||
              (spec.to === 'bigCreature' && hitCreature && (hit?.power ?? 0) >= 3);
            if (yes) {
              expect1(w.id);
              tally.hitTriggers += 1;
              if (hitCreature) tally.hitCreature += 1;
            }
          }
          if (w.id === e.source) {
            const self = SELF_HIT[w.name];
            if ((self === 'player' && hitPlayer) || (self === 'creature' && hitCreature)) {
              expect1(w.id);
              tally.hitTriggers += 1;
              if (w.name === 'SYNTHETIC Striking Bear') tally.hitDoubleStrike += 1;
            }
          }
          // "Whenever equipped creature deals combat damage to a player": the host is the source.
          if (w.name === 'SYNTHETIC Drumbeat Blade' && hitPlayer) {
            if (step.before.objects[w.id]?.attachedTo === e.source) {
              expect1(w.id);
              tally.attachedTriggers += 1;
            }
          }
        }
        break;
      }
      case 'attackersDeclared':
        for (const a of e.attackers) {
          for (const w of present) {
            if (
              w.name === 'SYNTHETIC Drumbeat Blade' &&
              step.before.objects[w.id]?.attachedTo === a.object
            ) {
              expect1(w.id);
              tally.attachedTriggers += 1;
            }
          }
        }
        break;
      case 'tapped':
        for (const w of present) {
          if (
            w.name === 'SYNTHETIC Tap Aura' &&
            step.before.objects[w.id]?.attachedTo === e.object
          ) {
            // Whenever enchanted creature becomes tapped (CR 603.2e: by a tap, not entering tapped).
            expect1(w.id);
            tally.attachedTriggers += 1;
          }
        }
        break;
      case 'zoneChanged': {
        if (e.fromZone === 'battlefield') {
          const was = step.before.objects[e.from];
          const wasName = nameOf(step.before, e.from);
          const wasCreature = (
            getView(step.before, 0).battlefield.find((v) => v.id === e.from)?.types ?? []
          ).includes('creature');
          for (const w of present) {
            // A leaver sees itself leave; the watchers see the creatures that left, by their last controller.
            if (w.id === e.from && wasName in LEAVERS) {
              const to = LEAVERS[wasName];
              if (to === null || to === e.toZone) {
                expect1(w.id);
                tally.leaveTriggers += 1;
              }
            }
            if (
              w.name === 'SYNTHETIC Departure Watcher' &&
              wasCreature &&
              was?.controller === w.controller
            ) {
              expect1(w.id);
              tally.leaveTriggers += 1;
            }
            if (
              w.name === 'SYNTHETIC Rival Departure Watcher' &&
              wasCreature &&
              was !== undefined &&
              was.controller !== w.controller
            ) {
              expect1(w.id);
              tally.leaveRivals += 1;
            }
            if (w.name === 'SYNTHETIC Exile Watcher' && e.toZone === 'exile') {
              expect1(w.id);
              tally.leaveTriggers += 1;
            }
            if (
              w.name === 'SYNTHETIC Drumbeat Blade' &&
              step.before.objects[w.id]?.attachedTo === e.from
            ) {
              expect1(w.id);
              tally.attachedTriggers += 1;
            }
          }
          gone.add(e.from);
        }
        if (e.toZone === 'battlefield') {
          const view = ptOf(step.after, e.to);
          if (view?.types.includes('creature') && (view.power ?? 0) >= 4) {
            for (const w of present) {
              if (w.name === 'SYNTHETIC Big Arrival Watcher' && !gone.has(w.id)) {
                expect1(w.id);
                tally.arrivals += 1;
              }
            }
          }
        }
        break;
      }
      case 'died': {
        const pt = ptOf(step.before, e.object);
        for (const w of present) {
          if (pt !== undefined) {
            if (w.name === 'SYNTHETIC Frail Death Watcher' && (pt.power ?? 99) <= 3) {
              expect1(w.id);
              tally.frailDeaths += 1;
            }
            if (w.name === 'SYNTHETIC Tough Death Watcher' && (pt.toughness ?? 0) >= 4)
              expect1(w.id);
          }
          const host = step.before.objects[w.id]?.attachedTo;
          if (
            (w.name === 'SYNTHETIC Last Gift Blade' || w.name === 'SYNTHETIC Doom Aura') &&
            host === e.object
          ) {
            expect1(w.id);
            tally.attachedTriggers += 1;
          }
        }
        break;
      }
      case 'spellCast': {
        const cost = step.after.objects[e.object]?.card;
        const def =
          cost === null || cost === undefined
            ? undefined
            : step.after.definitions[step.after.cards[cost]?.definition ?? -1];
        const mv = manaValue(def?.faces[e.face ?? 0]?.manaCost ?? []);
        for (const w of present) {
          if (w.name === 'SYNTHETIC Cheap Spell Watcher' && mv <= 2) {
            expect1(w.id);
            tally.spellMv += 1;
          }
          if (w.name === 'SYNTHETIC Exact Spell Watcher' && mv === 3) {
            expect1(w.id);
            tally.spellMv += 1;
          }
          if (w.name === 'SYNTHETIC Rival Spell Watcher' && e.seat !== w.controller) expect1(w.id);
          if (TAX[w.name] !== undefined && e.seat !== w.controller) expect1(w.id);
        }
        break;
      }
      default:
        break;
    }
  }
  for (const w of present) {
    // Only the cards whose every ability is modelled above are compared.
    if (!MODELLED.has(w.name)) continue;
    expect(created(step, w.id), `${w.name} (${w.id}) triggers in action ${step.index}`).toBe(
      expected.get(w.id) ?? 0,
    );
  }
}

const MODELLED = new Set<string>([
  ...Object.keys(STEP_WATCHERS),
  ...Object.keys(DRAW_WATCHERS),
  ...Object.keys(HIT_WATCHERS),
  ...Object.keys(SELF_HIT),
  ...Object.keys(LEAVERS),
  ...Object.keys(TAX),
  'SYNTHETIC Departure Watcher',
  'SYNTHETIC Rival Departure Watcher',
  'SYNTHETIC Exile Watcher',
  'SYNTHETIC Big Arrival Watcher',
  'SYNTHETIC Frail Death Watcher',
  'SYNTHETIC Tough Death Watcher',
  'SYNTHETIC Cheap Spell Watcher',
  'SYNTHETIC Exact Spell Watcher',
  'SYNTHETIC Rival Spell Watcher',
  'SYNTHETIC Last Gift Blade',
  'SYNTHETIC Doom Aura',
  'SYNTHETIC Tap Aura',
]);

/** "Unless that player pays": who is asked, what, and what follows (CR 118.12a). */
function checkUnlessPays(tally: Tally, step: StepInfo) {
  const d = step.before.pending;
  if (d?.kind === 'confirmOptional' && d.purpose === 'unlessPays') {
    tally.taxAsked += 1;
    const ability = step.before.objects[d.source]?.stack;
    expect(ability?.kind, 'the question comes from an ability on the stack').toBe('ability');
    const name = nameOf(step.before, d.source);
    const spec = TAX[name];
    if (spec !== undefined) {
      // The payer is the caster of the spell, never the controller of the watcher (the watcher says "opponent").
      expect(d.seat, `${name} asks the opponent`).not.toBe(
        step.before.objects[d.source]?.controller,
      );
      expect(d.cost?.[0]?.kind).toBe(spec.cost);
    }
    expect(d.subject).toBeUndefined();
    expect(getLegalActions(step.before, d.seat).map((a) => a.kind)).toEqual(
      expect.arrayContaining(['acceptOptional', 'declineOptional']),
    );
    // Nobody else may answer it.
    expect(applyAction(step.before, 1 - d.seat, { kind: 'acceptOptional' }).ok).toBe(false);
    if (step.action.kind === 'declineOptional') {
      tally.taxDeclined += 1;
      const controller = step.before.objects[d.source]?.controller ?? 0;
      if (spec !== undefined && !spec.optional) {
        // Declining lets the effect happen at once: the controller draws (or tries to).
        const drew = step.events.some(
          (e) =>
            (e.kind === 'cardDrawn' || e.kind === 'drewFromEmptyLibrary') && e.seat === controller,
        );
        expect(drew, `${name}: a declined payment draws`).toBe(true);
      } else if (spec !== undefined) {
        // "You may draw": the controller is asked next.
        expect(step.after.pending).toMatchObject({ kind: 'confirmOptional', seat: controller });
      }
    }
    if (step.action.kind === 'acceptOptional' && spec?.cost === 'payLife') {
      tally.taxPaid += 1;
      expect(step.events.some((e) => e.kind === 'cardDrawn')).toBe(false);
    }
  }
  if (d?.kind === 'payMana' && d.purpose === 'unlessPays' && step.action.kind === 'payAuto') {
    tally.taxPaid += 1;
    const controller = step.before.objects[d.source]?.controller ?? 0;
    expect(
      step.events.some((e) => e.kind === 'cardDrawn' && e.seat === controller),
      'a paid cost draws nothing',
    ).toBe(false);
  }
  // A payer who cannot pay is never asked: the trigger resolves and the effect happens without it.
  for (const e of eventsOf(step.events, 'resolved')) {
    const obj = step.before.objects[e.object];
    if (obj?.stack?.kind !== 'ability') continue;
    const name = nameOf(step.before, e.object);
    const spec = TAX[name];
    if (spec === undefined) continue;
    if (step.before.pending?.kind === 'priority') tally.taxCannotPay += 1;
  }
}

test(
  `${GAMES} trigger slice games run clean, replay exactly and use every path`,
  async () => {
    const total = newTally();
    const turns: number[] = [];
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = TRIGGER_SLICE_STYLE_PAIRS[g % TRIGGER_SLICE_STYLE_PAIRS.length] ?? [
        'triggerSlice',
        'triggerSlice',
      ];
      const config = smallGameConfig(g, styles);
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 23000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 23000 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const counts: GameCounts = { turn: 0, drawn: [0, 0] };
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkTriggers(total, step, counts);
        checkUnlessPays(total, step);
        if (step.before.pending !== null) {
          if (casual.has(step.seat)) total.casualAnswers += 1;
          else total.randomAnswers += 1;
        }
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
      });
      const tag = `game ${g}`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      expect(stateHash(replayGame(config, log)), tag).toBe(stateHash(run.state));
      turns.push(run.state.turn.number);
    }
    console.log(
      `100 trigger slice games: ${JSON.stringify({ ...total, turnsMax: Math.max(...turns) })}`,
    );

    expectPath(total.stepTriggers);
    expectPath(total.stepOpponentTurn);
    expectPath(total.drawTriggers);
    expectPath(total.secondDraws);
    expectPath(total.hitTriggers);
    expectPath(total.hitCreature);
    expectPath(total.leaveTriggers);
    expectPath(total.arrivals + total.frailDeaths);
    expectPath(total.spellMv);
    expectPath(total.attachedTriggers);
    expectPath(total.taxAsked);
    expectPath(total.taxDeclined);
    expectPath(total.casualAnswers);
    expectPath(total.randomAnswers);
  },
  soakTimeout(900_000),
);

test('the trigger slice cards are in no other deck style, so the older seeded games are unchanged', () => {
  const styles: DeckStyle[] = [
    'spells',
    'creatures',
    'brawl',
    'triggers',
    'keywords',
    'mana',
    'search',
    'activated',
    'attachments',
    'kicker',
    'food',
    'layers',
    'ward',
    'vehicles',
    'prevention',
    'layouts',
    'sagas',
    'triggerTargets',
    'library',
    'references',
    'restrictions',
    'costs',
    'manaPlus',
    'chosen',
    'x',
    'keywordBatch',
  ];
  const names = new Set<string>(TRIGGER_SLICE_NAMES);
  for (const style of styles) {
    for (const slot of [...spellSlots(style), ...landSlots(style)]) {
      expect(names.has(slot), `${slot} is in the ${style} style`).toBe(false);
    }
  }
  const own = new Set([...spellSlots('triggerSlice'), ...landSlots('triggerSlice')]);
  for (const name of names) expect(own.has(name), name).toBe(true);
  // The cards of the fixture file that the style does not play are in no style at all.
  for (const name of TRIGGER_SLICE_UNUSED_NAMES) {
    for (const style of [...styles, 'triggerSlice' as const]) {
      expect(
        [...spellSlots(style), ...landSlots(style)].includes(name),
        `${name} is in the ${style} style`,
      ).toBe(false);
    }
  }
});
