/**
 * "Pass turn" (playtest issue 46): the button, the key, the policy verdict and the autopilot yield.
 * The store runs against a scripted client (a tiny turn simulator with hooks that put the
 * opponent's spell on the stack or ask the player a question), so each interrupt is exact; one test
 * plays the real engine through the host.
 */
import type {
  Action,
  GameView,
  ObjectId,
  ObjectView,
  PendingDecision,
  StepId,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { GameHost } from '../src/game/host';
import type { GameClient, Snapshot } from '../src/game/protocol';
import {
  canPassTurn,
  DEFAULT_STOPS,
  passTurnVerdict,
  type StopSettings,
} from '../src/policy/should-stop';
import { createAppStore } from '../src/store';
import { type KeyContext, type KeyEventInfo, keyCommand } from '../src/ui/decisions/keys';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import {
  nextStepLabel,
  PASS_TURN_NAME,
  passLabel,
  passTurnHint,
  passTurnIsPrimary,
} from '../src/ui/decisions/priority';
import { initialUi, uiFor } from '../src/ui/decisions/ui-state';
import { chooseAction } from './bot';

const o = (n: number): ObjectId => `o${n}`;

const ORDER: readonly StepId[] = [
  'upkeep',
  'draw',
  'precombatMain',
  'beginningOfCombat',
  'declareAttackers',
  'endOfCombat',
  'postcombatMain',
  'end',
];

// ---- a scripted game: views the page can be driven through ---------------------------------

interface Sim {
  turn: number;
  active: 0 | 1;
  step: StepId;
  stack: ObjectView[];
  pending: PendingDecision | null;
}

interface Script {
  /** A creature of the player can attack in the declare attackers step. */
  attackers?: boolean;
  /** ... and it must attack (CR 508.1d). */
  required?: boolean;
  /** Runs after each step is entered: put something on the stack or ask a question. */
  enter?: (sim: Sim) => void;
}

const stackObject = (n: number, controller: 0 | 1, targets: ObjectView['targets']): ObjectView =>
  ({
    id: o(n),
    name: `Spell ${n}`,
    controller,
    owner: controller,
    types: ['instant'],
    keywords: [],
    targets,
  }) as unknown as ObjectView;

const priority = (id: `d${number}`): PendingDecision => ({
  id,
  seat: 0,
  kind: 'priority',
  options: [{ kind: 'pass' }],
});

function viewOf(sim: Sim): GameView {
  const seat = (id: number) => ({ id, hand: id === 0 ? [] : null, graveyard: [], command: [] });
  return {
    viewer: 0,
    turn: sim.turn,
    activeSeat: sim.active,
    step: sim.step,
    seats: [seat(0), seat(1)],
    battlefield: [],
    exile: [],
    stack: sim.stack,
    combat: null,
    pending: sim.pending,
    result: null,
  } as unknown as GameView;
}

interface Played {
  readonly turn: number;
  readonly active: number;
  readonly step: StepId;
  readonly action: Action;
}

/** The game starts at the player's first main phase, with priority. */
function scripted(script: Script = {}): { client: GameClient; played: Played[]; sim: Sim } {
  const sim: Sim = {
    turn: 1,
    active: 0,
    step: 'precombatMain',
    stack: [],
    pending: priority('d0'),
  };
  const played: Played[] = [];
  let revision = 0;
  const snapshot = (error: string | null = null): Snapshot => {
    revision += 1;
    return {
      revision,
      view: viewOf(sim),
      steps: [],
      log: [],
      actionCount: revision,
      aiFallbacks: 0,
      error,
      undoDepth: 0,
      logReset: null,
    };
  };
  const enter = (): void => {
    sim.pending = priority(`d${revision}`);
    if (sim.step === 'declareAttackers' && script.attackers === true && sim.active === 0) {
      sim.pending = {
        id: `d${revision}`,
        seat: 0,
        kind: 'declareAttackers',
        candidates: [{ attacker: o(1), targets: [{ kind: 'player', seat: 1 }] }],
        mustAttack: script.required === true ? [o(1)] : [],
      };
    }
    script.enter?.(sim);
  };
  const advance = (): void => {
    const next = ORDER[ORDER.indexOf(sim.step) + 1];
    if (next === undefined) {
      sim.turn += 1;
      sim.active = sim.active === 0 ? 1 : 0;
      sim.step = 'upkeep';
    } else sim.step = next;
    enter();
  };
  const client: GameClient = {
    newGame: async () => ({ snapshot: snapshot(), summary: { unsupported: [] } }),
    act: async (action) => {
      played.push({ turn: sim.turn, active: sim.active, step: sim.step, action });
      if (action.kind === 'pass') {
        if (sim.stack.length > 0) {
          sim.stack.pop();
          sim.pending = priority(`d${revision}`);
        } else advance();
      } else if (action.kind === 'declareAttackers') advance();
      else if (action.kind === 'chooseCards') advance();
      return snapshot();
    },
    undo: async () => snapshot(),
  };
  return { client, played, sim };
}

async function started(script: Script = {}, settings: Partial<StopSettings> = {}) {
  const game = scripted(script);
  const store = createAppStore({ client: game.client });
  store.getState().setSettings(settings);
  await store.getState().startGame({ seed: 1, humanDeck: 'x', aiDeck: 'y' });
  return { ...game, store };
}

const stepsOf = (played: readonly Played[]) =>
  played.map((p) => `${p.active === 0 ? 'me' : 'opp'} ${p.step} ${p.action.kind}`);

// ---- labels -----------------------------------------------------------------------------------

describe('the labels (issue 46)', () => {
  const view = (patch: Partial<GameView>): GameView =>
    ({
      viewer: 0,
      activeSeat: 0,
      step: 'precombatMain',
      stack: [],
      battlefield: [],
      ...patch,
    }) as GameView;
  const bear = { controller: 0, tapped: false, keywords: [], types: ['creature'] } as never;

  test('nextStepLabel never says "Pass Turn": a single pass names its step', () => {
    for (const step of [...ORDER, 'firstStrikeDamage', 'combatDamage', 'cleanup'] as const) {
      for (const activeSeat of [0, 1]) {
        for (const battlefield of [[], [bear]]) {
          expect(nextStepLabel(view({ step, activeSeat, battlefield }))).not.toMatch(/Pass Turn/);
        }
      }
    }
    expect(nextStepLabel(view({}))).toBe('To Combat');
  });

  test('the first main phase with nothing able to attack: the primary button is the real Pass Turn', () => {
    expect(passTurnIsPrimary(view({}))).toBe(true);
    expect(passLabel(view({}))).toBe('Pass Turn');
    expect(passTurnIsPrimary(view({ battlefield: [bear] }))).toBe(false);
    expect(passLabel(view({ battlefield: [bear] }))).toBe('To Combat');
  });

  test('Pass Turn is on offer only in the main phases of the viewer turn with an empty stack', () => {
    expect(canPassTurn(view({}))).toBe(true);
    expect(canPassTurn(view({ step: 'postcombatMain' }))).toBe(true);
    expect(canPassTurn(view({ step: 'beginningOfCombat' }))).toBe(false);
    expect(canPassTurn(view({ step: 'end' }))).toBe(false);
    expect(canPassTurn(view({ activeSeat: 1 }))).toBe(false);
    expect(canPassTurn(view({ stack: [stackObject(1, 1, [])] }))).toBe(false);
    // On the opponent's main phase, with nothing able to attack, the button stays a one-step pass.
    expect(passLabel(view({ activeSeat: 1 }))).toBe('To Combat');
  });

  test('the tooltip says that Full Control still stops, only when it is on', () => {
    expect(passTurnHint(false)).not.toMatch(/Full Control/);
    expect(passTurnHint(true)).toMatch(/Full Control is on/);
  });
});

// ---- the buttons and the key --------------------------------------------------------------------

describe('the buttons and the shortcut (issue 46)', () => {
  const pending: PendingDecision = priority('d1');
  const creature = {
    id: o(1),
    controller: 0,
    owner: 0,
    tapped: false,
    keywords: [],
    types: ['creature'],
    summoningSick: false,
  };
  function modelFor(patch: Partial<GameView>, extra: Partial<Controller> = {}) {
    const acts: Action[] = [];
    let passed = 0;
    const ctl: Controller = {
      act: (a) => acts.push(a),
      update: () => {},
      openChooser: () => {},
      passTurn: () => {
        passed += 1;
      },
      ...extra,
    };
    const view = {
      viewer: 0,
      turn: 1,
      activeSeat: 0,
      step: 'precombatMain',
      battlefield: [],
      stack: [],
      exile: [],
      seats: [
        { id: 0, hand: [], graveyard: [], command: [] },
        { id: 1, hand: null, graveyard: [], command: [] },
      ],
      pending,
      ...patch,
    } as unknown as GameView;
    const model = buildModel(view, pending, uiFor(initialUi(null), pending), ctl);
    return { model, acts, passed: () => passed };
  }

  test('nothing can attack: one button, the real Pass Turn, with its accessible name', () => {
    const { model, acts, passed } = modelFor({});
    expect(model.bar.buttons.map((b) => [b.key, b.label, b.variant])).toEqual([
      ['passTurn', 'Pass Turn', 'primary'],
    ]);
    expect(model.bar.buttons[0]?.ariaLabel).toBe(PASS_TURN_NAME);
    model.bar.buttons[0]?.run();
    expect(passed()).toBe(1);
    expect(acts).toEqual([]);
  });

  test('a creature could attack: the primary names the step, a separate Pass Turn sits next to it', () => {
    const { model, acts, passed } = modelFor({ battlefield: [creature as never] });
    expect(model.bar.buttons.map((b) => [b.key, b.label, b.variant])).toEqual([
      ['pass', 'To Combat', 'primary'],
      ['passTurn', 'Pass Turn', 'secondary'],
    ]);
    model.bar.buttons[0]?.run();
    expect(acts).toEqual([{ kind: 'pass' }]);
    expect(passed()).toBe(0);
    model.bar.buttons[1]?.run();
    expect(passed()).toBe(1);
  });

  test('the second main phase offers it too; other steps, the opponent turn and the stack do not', () => {
    const keys = (patch: Partial<GameView>) => modelFor(patch).model.bar.buttons.map((b) => b.key);
    expect(keys({ step: 'postcombatMain' })).toEqual(['pass', 'passTurn']);
    expect(keys({ step: 'beginningOfCombat' })).toEqual(['pass']);
    expect(keys({ step: 'end' })).toEqual(['pass']);
    expect(keys({ activeSeat: 1 })).toEqual(['pass']);
    expect(keys({ stack: [stackObject(2, 1, [])] })).toEqual(['pass']);
  });

  test('the tooltip follows Full Control', () => {
    const on = modelFor({}, { fullControl: true }).model.bar.buttons[0]?.hint;
    const off = modelFor({}, { fullControl: false }).model.bar.buttons[0]?.hint;
    expect(on).toMatch(/Full Control is on/);
    expect(off).not.toMatch(/Full Control/);
  });

  const key = (k: string): KeyEventInfo => ({
    key: k,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    tag: 'BODY',
    editable: false,
    foreignModalOpen: false,
  });
  const ctx = (bar: KeyContext['bar'], extra: Partial<KeyContext> = {}): KeyContext => ({
    bar,
    pinned: false,
    chooserOpen: false,
    canUndo: false,
    ...extra,
  });

  test('P passes the turn where the button is on offer; Esc cancels a running pass first', () => {
    const { model } = modelFor({ battlefield: [creature as never] });
    expect(keyCommand(key('p'), ctx(model.bar))).toBe('passTurn');
    expect(keyCommand(key('P'), ctx(model.bar))).toBe('passTurn');
    const inCombat = modelFor({ step: 'beginningOfCombat' }).model.bar;
    expect(keyCommand(key('p'), ctx(inCombat))).toBeNull();
    expect(keyCommand(key('p'), ctx(null))).toBeNull();
    expect(keyCommand(key('Escape'), ctx(null, { passTurnActive: true, pinned: true }))).toBe(
      'cancelPassTurn',
    );
    expect(keyCommand(key('Escape'), ctx(null, { pinned: true }))).toBe('unpin');
    // The primary key (Space) still presses the primary button.
    expect(keyCommand(key(' '), ctx(model.bar))).toBe('primary');
  });
});

// ---- the policy -----------------------------------------------------------------------------------

describe('passTurnVerdict', () => {
  const sim = (patch: Partial<Sim> = {}): GameView =>
    viewOf({
      turn: 4,
      active: 0,
      step: 'beginningOfCombat',
      stack: [],
      pending: priority('d1'),
      ...patch,
    });
  const verdict = (patch: Partial<Sim>, settings: StopSettings = DEFAULT_STOPS, turn = 4) =>
    passTurnVerdict(sim(patch), settings, turn);

  test('passes at every step of the turn, the main phase stops included', () => {
    for (const step of ORDER) expect(verdict({ step }), step).toBe('pass');
    expect(verdict({ step: 'end' }, { ...DEFAULT_STOPS, myTurnStops: ['end'] })).toBe('pass');
    expect(
      verdict({ step: 'end' }, { ...DEFAULT_STOPS, thisTurn: { turn: 4, steps: ['end'] } }),
    ).toBe('pass');
  });

  test('ends when the turn is over, on the opponent turn, or when the game is', () => {
    expect(verdict({ turn: 5, active: 1, step: 'upkeep' })).toBe('end');
    expect(verdict({ active: 1 })).toBe('end');
    expect(verdict({ turn: 6 })).toBe('end');
    expect(verdict({ pending: null })).toBe('end');
    expect(passTurnVerdict({ ...sim(), result: { winner: 0 } } as never, DEFAULT_STOPS, 4)).toBe(
      'end',
    );
  });

  test('Full Control is not overridden', () => {
    expect(verdict({}, { ...DEFAULT_STOPS, fullControl: true })).toBe('end');
  });

  test('a question is never answered, except declaring no attack when none is required', () => {
    const decisions: readonly PendingDecision[] = [
      { id: 'd0', seat: 0, kind: 'discard', count: 1, hand: [] },
      { id: 'd0', seat: 0, kind: 'confirmOptional' } as unknown as PendingDecision,
      { id: 'd0', seat: 0, kind: 'choosePermanent' } as unknown as PendingDecision,
      { id: 'd0', seat: 0, kind: 'targets' } as unknown as PendingDecision,
    ];
    for (const pending of decisions) expect(verdict({ pending }), pending.kind).toBe('end');
    const attack = (mustAttack: ObjectId[]): PendingDecision => ({
      id: 'd0',
      seat: 0,
      kind: 'declareAttackers',
      candidates: [{ attacker: o(1), targets: [{ kind: 'player', seat: 1 }] }],
      mustAttack,
    });
    expect(verdict({ step: 'declareAttackers', pending: attack([]) })).toBe('declareNoAttack');
    expect(verdict({ step: 'declareAttackers', pending: attack([o(1)]) })).toBe('end');
  });

  test("an opponent's spell aimed at the player ends it; their other spells and the player's own do not", () => {
    const aimed = stackObject(7, 1, [{ kind: 'player', seat: 0, specId: 's' }]);
    const elsewhere = stackObject(8, 1, [{ kind: 'player', seat: 1, specId: 's' }]);
    const mine = stackObject(9, 0, [{ kind: 'player', seat: 1, specId: 's' }]);
    expect(verdict({ step: 'end', stack: [aimed] })).toBe('end');
    expect(verdict({ step: 'end', stack: [mine] })).toBe('pass');
    // Issue 105: an opponent's spell is looked at too, whatever it is aimed at; the setting turns that off.
    expect(verdict({ step: 'end', stack: [elsewhere] })).toBe('end');
    expect(
      verdict(
        { step: 'end', stack: [elsewhere] },
        { ...DEFAULT_STOPS, stopForOpponentSpells: false },
      ),
    ).toBe('pass');
    expect(
      verdict(
        { step: 'end', stack: [aimed] },
        { ...DEFAULT_STOPS, stopWhenTargeted: false, stopForOpponentSpells: false },
      ),
    ).toBe('pass');
  });
});

// ---- the store -----------------------------------------------------------------------------------

describe('the store: a running pass', () => {
  test('from the first main phase it gets through combat, the second main and the end step', async () => {
    const { store, played } = await started({ attackers: true });
    await store.getState().passTurn();
    const s = store.getState();
    // One click; everything else was the autopilot. The creature attacked with nothing declared.
    expect(s.stats.humanActions).toBe(1);
    expect(stepsOf(played)).toEqual([
      'me precombatMain pass',
      'me beginningOfCombat pass',
      'me declareAttackers declareAttackers',
      'me endOfCombat pass',
      'me postcombatMain pass',
      'me end pass',
      // The opponent's turn: the normal policy has no stops there, so it passes on to the next question.
      ...stepsOf(played).slice(6),
    ]);
    expect(played[2]?.action).toEqual({ kind: 'declareAttackers', attacks: [] });
    expect(s.yieldTurn).toBeNull();
    expect(s.passing).toBe(false);
  });

  test('it ends at the start of the opponent turn, where the stops of that turn apply again', async () => {
    const { store } = await started({}, { opponentTurnStops: ['upkeep'] });
    await store.getState().passTurn();
    const view = store.getState().snapshot?.view;
    expect(store.getState().yieldTurn).toBeNull();
    expect([view?.turn, view?.activeSeat, view?.step]).toEqual([2, 1, 'upkeep']);
    expect(view?.pending?.kind).toBe('priority');
  });

  test('without it a plain pass still stops at the next stop of the player', async () => {
    const { store } = await started();
    await store.getState().act({ kind: 'pass' });
    expect(store.getState().snapshot?.view.step).toBe('postcombatMain');
  });

  test('started in the second main phase it ends the turn the same way', async () => {
    const { store, played } = await started();
    await store.getState().act({ kind: 'pass' });
    expect(store.getState().snapshot?.view.step).toBe('postcombatMain');
    const before = played.length;
    await store.getState().passTurn();
    expect(stepsOf(played).slice(before, before + 2)).toEqual([
      'me postcombatMain pass',
      'me end pass',
    ]);
    expect(store.getState().yieldTurn).toBeNull();
  });

  test('it cannot start outside a main phase, or with something on the stack', async () => {
    const outside = await started({}, { myTurnStops: ['beginningOfCombat'] });
    await outside.store.getState().act({ kind: 'pass' });
    expect(outside.store.getState().snapshot?.view.step).toBe('beginningOfCombat');
    const count = outside.played.length;
    await outside.store.getState().passTurn();
    expect(outside.played.length).toBe(count);

    const game = scripted();
    // Aimed at the player, so the autopilot stops with it on the stack.
    game.sim.stack = [stackObject(3, 1, [{ kind: 'player', seat: 0, specId: 's' }])];
    const store = createAppStore({ client: game.client });
    await store.getState().startGame({ seed: 1, humanDeck: 'x', aiDeck: 'y' });
    expect(store.getState().snapshot?.view.stack).toHaveLength(1);
    await store.getState().passTurn();
    expect(game.played).toEqual([]);
    expect(store.getState().yieldTurn).toBeNull();
  });

  test('any opponent spell in the end step cancels it, so the player sees it before it resolves (issue 105)', async () => {
    const elsewhere = stackObject(8, 1, [{ kind: 'player', seat: 1, specId: 's' }]);
    const { store } = await started({
      enter: (s) => {
        if (s.step === 'end' && s.active === 0) s.stack = [elsewhere];
      },
    });
    await store.getState().passTurn();
    const view = store.getState().snapshot?.view;
    expect([view?.turn, view?.activeSeat, view?.step]).toEqual([1, 0, 'end']);
    expect(view?.stack.map((x) => x.id)).toEqual([o(8)]);
    expect(view?.pending?.kind).toBe('priority');
    expect(store.getState().yieldTurn).toBeNull();
  });

  test('an opponent spell aimed at the player in the end step cancels it', async () => {
    const aimed = stackObject(7, 1, [{ kind: 'player', seat: 0, specId: 's' }]);
    const { store, played } = await started({
      enter: (s) => {
        if (s.step === 'end' && s.active === 0) s.stack = [aimed];
      },
    });
    await store.getState().passTurn();
    const view = store.getState().snapshot?.view;
    expect([view?.turn, view?.activeSeat, view?.step]).toEqual([1, 0, 'end']);
    expect(view?.stack.map((x) => x.id)).toEqual([o(7)]);
    expect(view?.pending?.kind).toBe('priority');
    expect(store.getState().yieldTurn).toBeNull();
    expect(stepsOf(played).at(-1)).toBe(
      'me beginningOfCombat pass'.replace('beginningOfCombat', 'postcombatMain'),
    );
  });

  test('an opponent spell that is not aimed at the player and cannot be answered does not stop it when that stop is off', async () => {
    const elsewhere = stackObject(8, 1, [{ kind: 'player', seat: 1, specId: 's' }]);
    const { store, played } = await started({
      enter: (s) => {
        if (s.step === 'end' && s.active === 0) s.stack = [elsewhere];
      },
    });
    store.getState().setSettings({ stopForOpponentSpells: false });
    await store.getState().passTurn();
    expect(played.some((p) => p.step === 'end' && p.active === 0 && p.action.kind === 'pass')).toBe(
      true,
    );
    // After the end step the opponent's turn began; the normal policy carried on from there.
    expect(played.some((p) => p.active === 1)).toBe(true);
  });

  test('Full Control keeps stopping: the pass moves one step and the stop holds', async () => {
    const { store } = await started({}, { fullControl: true });
    await store.getState().passTurn();
    const view = store.getState().snapshot?.view;
    expect(view?.step).toBe('beginningOfCombat');
    expect(view?.pending?.kind).toBe('priority');
    expect(store.getState().yieldTurn).toBeNull();
  });

  test('a question stops it and is not answered', async () => {
    const { store, played } = await started({
      enter: (s) => {
        if (s.step === 'end' && s.active === 0) {
          s.pending = { id: 'd99', seat: 0, kind: 'discard', count: 1, hand: [o(3)] };
        }
      },
    });
    await store.getState().passTurn();
    const view = store.getState().snapshot?.view;
    expect(view?.pending?.kind).toBe('discard');
    expect(store.getState().yieldTurn).toBeNull();
    expect(played.some((p) => p.action.kind === 'chooseCards')).toBe(false);
  });

  test('a creature that must attack stops it at the declaration', async () => {
    const { store, played } = await started({ attackers: true, required: true });
    await store.getState().passTurn();
    expect(store.getState().snapshot?.view.pending?.kind).toBe('declareAttackers');
    expect(store.getState().yieldTurn).toBeNull();
    expect(played.some((p) => p.action.kind === 'declareAttackers')).toBe(false);
  });

  test('cancelling holds the autopilot before its next pass', async () => {
    const waiting: (() => void)[] = [];
    const game = scripted();
    const store = createAppStore({
      client: game.client,
      autoPassDelayMs: 1,
      sleep: () => new Promise<void>((resolve) => waiting.push(resolve)),
    });
    await store.getState().startGame({ seed: 1, humanDeck: 'x', aiDeck: 'y' });
    const running = store.getState().passTurn();
    while (waiting.length === 0) await new Promise((r) => setTimeout(r, 1));
    expect(store.getState().yieldTurn).toBe(1);
    const passes = game.played.length;
    store.getState().cancelPassTurn();
    expect(store.getState().yieldTurn).toBeNull();
    for (const release of waiting) release();
    await running;
    expect(game.played.length).toBe(passes);
    expect(store.getState().passing).toBe(false);
    expect(store.getState().snapshot?.view.step).toBe('beginningOfCombat');
  });

  test('a click of the player while it runs ends it', async () => {
    const waiting: (() => void)[] = [];
    let open = false;
    const game = scripted();
    const store = createAppStore({
      client: game.client,
      autoPassDelayMs: 1,
      sleep: () =>
        open ? Promise.resolve() : new Promise<void>((resolve) => waiting.push(resolve)),
    });
    await store.getState().startGame({ seed: 1, humanDeck: 'x', aiDeck: 'y' });
    const running = store.getState().passTurn();
    while (waiting.length === 0) await new Promise((r) => setTimeout(r, 1));
    open = true;
    const click = store.getState().act({ kind: 'pass' });
    expect(store.getState().yieldTurn).toBeNull();
    for (const release of waiting) release();
    await Promise.all([running, click]);
    expect(store.getState().yieldTurn).toBeNull();
  });

  test('starting a new game clears a pass', async () => {
    const { store } = await started({}, { fullControl: true });
    await store.getState().passTurn();
    await store.getState().startGame({ seed: 2, humanDeck: 'x', aiDeck: 'y' });
    expect(store.getState().yieldTurn).toBeNull();
  });
});

// ---- the real engine ------------------------------------------------------------------------------

describe('the real engine', () => {
  test('one click gets through the rest of the turn, and the opponent turn resumes its stops', async () => {
    const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
    store.getState().setSettings({ opponentTurnStops: ['upkeep'] });
    await store
      .getState()
      .startGame({ seed: 5, humanDeck: 'white-knights', aiDeck: 'swamp-forest' });
    // Play like a bot (lands and spells, a pass at the first main phase) until a main phase of the
    // player's own turn with creatures able to attack, and take the Pass Turn there.
    for (let i = 0; i < 400; i += 1) {
      const view = store.getState().snapshot?.view;
      const pending = view?.pending;
      if (view === undefined || pending === null || pending === undefined || view.result !== null) {
        break;
      }
      if (
        pending.kind === 'priority' &&
        view.turn >= 5 &&
        view.activeSeat === 0 &&
        view.step === 'precombatMain' &&
        view.stack.length === 0
      ) {
        const clicks = store.getState().stats.humanActions;
        const turn = view.turn;
        await store.getState().passTurn();
        const after = store.getState().snapshot?.view;
        expect(store.getState().stats.humanActions).toBe(clicks + 1);
        expect(store.getState().yieldTurn).toBeNull();
        // The turn is over: the game is in a later turn, at its first stop or question.
        expect(after?.turn).toBeGreaterThan(turn);
        return;
      }
      await store.getState().act(chooseAction(view, pending));
    }
    throw new Error('the game never reached the situation');
  }, 60000);
});
