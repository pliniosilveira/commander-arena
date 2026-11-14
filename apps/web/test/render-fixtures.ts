import type { GameView, ObjectView, PendingDecision } from '@commander-arena/engine';
import { GameHost } from '../src/game/host';
import type { Snapshot } from '../src/game/protocol';
import { type AppStore, createAppStore } from '../src/store';

export function objectView(id: string, patch: Partial<ObjectView> = {}): ObjectView {
  return {
    id,
    owner: 0,
    controller: 0,
    zone: 'battlefield',
    name: `Card ${id}`,
    manaCost: null,
    supertypes: [],
    types: ['creature'],
    subtypes: [],
    colors: [],
    power: 2,
    toughness: 2,
    oracleText: '',
    tapped: false,
    damage: 0,
    counters: {},
    isCommander: false,
    summoningSick: false,
    isToken: false,
    keywords: [],
    restrictions: [],
    support: 'supported',
    targets: [],
    ...patch,
  } as ObjectView;
}

export function gameView(
  battlefield: readonly ObjectView[],
  pending: PendingDecision | null = null,
  patch: Partial<GameView> = {},
): GameView {
  return {
    viewer: 0,
    turn: 3,
    activeSeat: 0,
    phase: 'combat',
    step: 'declareAttackers',
    prioritySeat: 0,
    seats: [
      { id: 0, hand: [], graveyard: [], command: [], mulligans: 0, poison: 0, manaPool: [] },
      { id: 1, hand: null, graveyard: [], command: [], mulligans: 0, poison: 0, manaPool: [] },
    ],
    monarch: null,
    battlefield,
    exile: [],
    stack: [],
    combat: null,
    pending,
    decidingSeat: pending === null ? null : 0,
    commanderDamage: {},
    result: null,
    ...patch,
  } as unknown as GameView;
}

export function storeFor(view: GameView): AppStore {
  const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
  const snapshot: Snapshot = {
    revision: 1,
    view,
    steps: [],
    log: [],
    actionCount: 0,
    aiFallbacks: 0,
    error: null,
    undoDepth: 0,
    logReset: null,
  };
  store.setState({ screen: 'playing', snapshot });
  return store;
}

export function liveStore(store: AppStore): AppStore {
  return { ...store, getInitialState: () => store.getState() };
}
