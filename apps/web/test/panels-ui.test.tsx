import type { GameView, ObjectView, StepId } from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { GameHost } from '../src/game/host';
import type { Snapshot } from '../src/game/protocol';
import { createAppStore } from '../src/store';
import { LogPanel } from '../src/ui/panels/LogPanel';
import { ConcedeControl, SettingsPanel } from '../src/ui/panels/SettingsPanel';
import { StackPanel } from '../src/ui/panels/StackPanel';
import { stopSide, TurnTracker } from '../src/ui/panels/TurnTracker';
import { StoreProvider } from '../src/ui/store-context';
import { chooseAction } from './bot';

const options = { seed: 7, humanDeck: 'white-knights', aiDeck: 'swamp-forest' };

async function startedStore() {
  const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
  await store.getState().startGame(options);
  return store;
}

/**
 * zustand renders the server snapshot from `getInitialState`, which ignores later `setState`
 * calls. The wrapper makes the current state the one that renders.
 */
const html = (store: Awaited<ReturnType<typeof startedStore>>, node: React.ReactNode) =>
  renderToStaticMarkup(
    <StoreProvider store={{ ...store, getInitialState: store.getState }}>{node}</StoreProvider>,
  );

/** SYNTHETIC: a stack object shaped like an ObjectView, not taken from a real game. */
function syntheticSpell(over: Partial<ObjectView>): ObjectView {
  return {
    id: 'o900',
    owner: 1,
    controller: 1,
    zone: 'stack',
    name: 'Synthetic Bolt',
    manaCost: ['R'],
    supertypes: [],
    types: ['instant'],
    subtypes: [],
    colors: ['R'],
    power: null,
    toughness: null,
    oracleText: '',
    tapped: false,
    damage: 0,
    counters: {},
    isCommander: false,
    summoningSick: false,
    isToken: false,
    keywords: [],
    protector: null,
    support: 'supported',
    targets: [],
    ...over,
  };
}

function withView(snapshot: Snapshot, patch: Partial<GameView>): Snapshot {
  return { ...snapshot, view: { ...snapshot.view, ...patch } };
}

describe('TurnTracker', () => {
  test('shows the turn, whose turn it is, priority and every step', async () => {
    const store = await startedStore();
    const out = html(store, <TurnTracker />);
    const view = store.getState().snapshot?.view;
    expect(view).toBeDefined();
    expect(out).toContain(`turn ${Math.floor(((view?.turn ?? 1) - 1) / 2) + 1}`);
    for (const label of [
      'Untap',
      'Upkeep',
      'Draw',
      'Main 1',
      'Begin combat',
      'Attackers',
      'Blockers',
      'First strike',
      'Damage',
      'End combat',
      'Main 2',
      'End step',
      'Cleanup',
    ]) {
      expect(out).toContain(label);
    }
    expect(out).toContain('Priority:');
    expect(out).not.toContain('AI fallback');
  });

  test('marks the current step and the stops of the side whose turn it is', async () => {
    const store = await startedStore();
    const snap = store.getState().snapshot;
    if (snap === null) throw new Error('no snapshot');
    store.setState({
      snapshot: withView(snap, { activeSeat: 0, step: 'precombatMain', turn: 3 }),
    });
    const out = html(store, <TurnTracker />);
    // Engine turn 3 is the second round: "Your turn 2" (D-153).
    expect(out).toContain('Your turn 2');
    // Default stops: Main 1 and Main 2 are marked; the current step is Main 1.
    expect((out.match(/pnl-step-stop/g) ?? []).length).toBe(2);
    expect(out).toMatch(/aria-current="step"[^>]*><button[^>]*pnl-step-current/);

    store.setState({
      snapshot: withView(snap, { activeSeat: 1, step: 'upkeep', turn: 4 }),
    });
    const opp = html(store, <TurnTracker />);
    expect(opp).toContain('Opponent&#x27;s turn 2');
    expect(opp).not.toContain('pnl-step-stop');
    store.getState().toggleStop('opponent', 'upkeep');
    expect(html(store, <TurnTracker />)).toContain('pnl-step-stop');
  });

  test('stopSide follows the active seat', async () => {
    const store = await startedStore();
    const view = store.getState().snapshot?.view;
    if (view === undefined) throw new Error('no view');
    expect(stopSide({ ...view, activeSeat: view.viewer })).toBe('mine');
    expect(stopSide({ ...view, activeSeat: 1 - view.viewer })).toBe('opponent');
  });

  test('the AI watchdog count shows only when it fired', async () => {
    const store = await startedStore();
    const snap = store.getState().snapshot;
    if (snap === null) throw new Error('no snapshot');
    store.setState({ snapshot: { ...snap, aiFallbacks: 2 } });
    expect(html(store, <TurnTracker />)).toContain('AI fallback ×2');
  });
});

describe('StackPanel', () => {
  test('an empty stack says so', async () => {
    const out = html(await startedStore(), <StackPanel />);
    expect(out).toContain('Stack is empty');
    expect(out).toContain('pnl-arrows');
  });

  test('lists the top item first with controller and target names', async () => {
    const store = await startedStore();
    const snap = store.getState().snapshot;
    if (snap === null) throw new Error('no snapshot');
    const bottom = syntheticSpell({ id: 'o901', name: 'Synthetic Mercy', controller: 0 });
    const top = syntheticSpell({
      id: 'o902',
      name: 'Synthetic Bolt',
      controller: 1,
      targets: [
        { kind: 'object', id: 'o901', specId: 't0' },
        { kind: 'player', seat: 0, specId: 't1' },
      ],
    });
    store.setState({ snapshot: withView(snap, { stack: [bottom, top] }) });
    const out = html(store, <StackPanel />);
    expect(out.indexOf('Synthetic Bolt')).toBeLessThan(out.indexOf('Synthetic Mercy'));
    expect(out).toContain('data-object-id="o902"');
    expect(out).toContain('data-object-id="o901"');
    expect(out).toContain('Top · Opponent');
    expect(out).toContain('Synthetic Mercy, You');
    expect(out).not.toContain('Stack is empty');
  });
});

describe('LogPanel', () => {
  test('renders the log as a live region grouped by turn, major lines only by default', async () => {
    const store = await startedStore();
    store.setState({
      log: [
        {
          id: 1,
          turn: 0,
          seat: 0,
          level: 'major',
          text: 'You keep your hand.',
          objects: [],
          rule: 'CR 103.5',
        },
        { id: 2, turn: 1, seat: 1, level: 'detail', text: 'Detail line.', objects: [], rule: null },
        {
          id: 3,
          turn: 1,
          activeSeat: 0,
          round: 1,
          seat: null,
          level: 'major',
          text: 'Your turn 1 begins.',
          objects: [],
          rule: null,
        },
      ],
    });
    const out = html(store, <LogPanel />);
    expect(out).toContain('role="log"');
    expect(out).toContain('aria-live="polite"');
    expect(out).toContain('Setup');
    expect(out).toContain('Your turn 1');
    expect(out).toContain('You keep your hand.');
    expect(out).not.toContain('Detail line.');
    // CR references are off by default.
    expect(out).not.toContain('CR 103.5');
    expect(out).toContain('pnl-log-me');
  });

  test('a real game produces log text', async () => {
    const store = await startedStore();
    const view = store.getState().snapshot?.view;
    if (view?.pending == null) throw new Error('expected a decision');
    await store.getState().act(chooseAction(view, view.pending));
    const out = html(store, <LogPanel />);
    expect(store.getState().log.length).toBeGreaterThan(0);
    expect(out).not.toContain('Nothing has happened yet');
  });
});

describe('SettingsPanel through a real store', () => {
  test('collapsed by default with a summary; open shows every control', async () => {
    const store = await startedStore();
    const closed = html(store, <SettingsPanel />);
    expect(closed).toContain('aria-expanded="false"');
    expect(closed).toContain('Auto-pass');
    expect(closed).not.toContain('Leave game');
    const open = html(store, <SettingsPanel startOpen />);
    expect(open).toContain('Full Control');
    expect(open).toContain('Manual mana payment');
    expect(open).toContain('Leave game');
    expect(open).toContain('Concede game');
    expect(open).not.toContain('Yes, concede');
    expect(open).toContain('Text size');
    // The combat animations switch and their speed (D-228): Normal until another is picked.
    expect(open).toContain('Combat animations');
    expect(open).toContain('Animation speed');
    expect(open).toMatch(/aria-pressed="false"[^>]*>Fast</);
    expect(open).toMatch(/aria-pressed="true"[^>]*>Normal</);
    expect(open).toMatch(/aria-pressed="false"[^>]*>Slow</);
    expect(open).toMatch(/aria-pressed="true"[^>]*>Large</);
    expect(open).toContain('>Normal<');
    // The column of the stack and the controls is on the right by default and can be flipped (issue 47).
    expect(open).toContain('Stack and controls');
    expect(open).toMatch(/aria-pressed="true"[^>]*>Right</);
    expect(open).toContain('>Left<');
    expect(open).toContain('Dark');
    expect(open).toContain('Light');
    for (const label of ['Upkeep', 'Main 1', 'Main 2', 'End step']) expect(open).toContain(label);
  });

  test('Concede asks first, then offers to concede or keep playing (issue 43)', () => {
    const idle = renderToStaticMarkup(<ConcedeControl onConcede={() => {}} />);
    expect(idle).toContain('Concede game');
    expect(idle).not.toContain('Yes, concede');
    const asking = renderToStaticMarkup(<ConcedeControl onConcede={() => {}} startConfirming />);
    expect(asking).toContain('Concede and lose this game?');
    expect(asking).toContain('Yes, concede');
    expect(asking).toContain('Keep playing');
  });

  test('Concede leaves once the game is over', async () => {
    const store = await startedStore();
    await store.getState().act({ kind: 'concede' });
    expect(store.getState().snapshot?.view.result).not.toBeNull();
    expect(html(store, <SettingsPanel startOpen />)).not.toContain('Concede game');
  });

  test('toggles reach the store and show in the markup', async () => {
    const store = await startedStore();
    const checked = (out: string, label: string) =>
      new RegExp(`<input[^>]*aria-label="${label}"[^>]*checked`).test(out) ||
      new RegExp(`<input[^>]*checked[^>]*aria-label="${label}"`).test(out);
    const before = html(store, <SettingsPanel startOpen />);
    expect(checked(before, 'Stop at Main 1 on my turns')).toBe(true);
    expect(checked(before, 'Stop at Upkeep on opponent turns')).toBe(false);

    const { setSettings, setManualPay, toggleStop, toggleThisTurn } = store.getState();
    setSettings({ fullControl: true });
    setManualPay(true);
    toggleStop('mine', 'precombatMain' as StepId);
    toggleStop('opponent', 'upkeep');
    toggleThisTurn('end');
    const after = html(store, <SettingsPanel startOpen />);
    expect(checked(after, 'Stop at Main 1 on my turns')).toBe(false);
    expect(checked(after, 'Stop at Upkeep on opponent turns')).toBe(true);
    expect(checked(after, 'Stop at End step this turn only')).toBe(true);
    const closed = html(store, <SettingsPanel />);
    expect(closed).toContain('Full Control · manual mana');
  });
});
