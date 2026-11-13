/**
 * Hashaton deck group 7 (D-1130): the additional beginning phase of Sphinx of the Second Sun in the screen. The ability in the words of the card, the chip that
 * names the added phase in the top bar (the step row shows the untap, upkeep and draw steps as they happen), and what the pass button says before and during it
 * (CR 500.8, 500.10).
 */
import {
  type Ability,
  type GameView,
  type StackAbility,
  syntheticCard,
} from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { GameHost } from '../src/game/host';
import { createAppStore } from '../src/store';
import { triggerCondition, triggerGist } from '../src/ui/decisions/ability-label';
import { nextStepLabel } from '../src/ui/decisions/priority';
import { addedPhaseLabel, TurnTracker } from '../src/ui/panels/TurnTracker';
import { StoreProvider } from '../src/ui/store-context';

const SPHINX = syntheticCard('SYNTHETIC Second Sun Sphinx');

async function gameWith(change: (view: GameView) => GameView) {
  const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
  await store.getState().startGame({ seed: 7, humanDeck: 'white-knights', aiDeck: 'swamp-forest' });
  const snap = store.getState().snapshot;
  if (snap === null) throw new Error('no game');
  store.setState({ snapshot: { ...snap, view: change(snap.view) } });
  return store;
}

const render = (store: Awaited<ReturnType<typeof gameWith>>, node: React.ReactNode) =>
  renderToStaticMarkup(
    <StoreProvider store={{ ...store, getInitialState: store.getState }}>{node}</StoreProvider>,
  );

test('the ability is said in the words of the card: the trigger and the added phase', () => {
  const face = SPHINX.faces[0];
  const trigger = face?.abilities.find(
    (a): a is Ability & { kind: 'triggered' } => a.kind === 'triggered',
  );
  if (face === undefined || trigger === undefined) throw new Error('no trigger');
  const source = { subtypes: face.subtypes, oracleText: face.oracleText };
  expect(triggerCondition(trigger as unknown as StackAbility, SPHINX.name, source as never)).toBe(
    'At the beginning of your postcombat main phase',
  );
  expect(triggerGist(trigger as unknown as StackAbility, { types: face.types } as never)).toBe(
    'After this phase, there is an additional beginning phase (untap, upkeep and draw steps)',
  );
});

test('the top bar names an added phase, and says nothing in the turn’s own phases', async () => {
  const own = await gameWith((v) => ({ ...v, phase: 'beginning', step: 'upkeep' }));
  expect(render(own, <TurnTracker />)).not.toContain('data-added-phase');
  const added = await gameWith((v) => ({
    ...v,
    phase: 'beginning',
    step: 'upkeep',
    addedPhase: true as const,
  }));
  const out = render(added, <TurnTracker />);
  expect(out).toContain('data-added-phase="beginning"');
  expect(out).toContain('Extra beginning phase');
  // the step row marks the upkeep step as the current one
  expect(out).toMatch(/pnl-step-current[^>]*>Upkeep/);
  const combat = await gameWith((v) => ({
    ...v,
    phase: 'combat',
    step: 'declareAttackers',
    addedPhase: true as const,
  }));
  expect(render(combat, <TurnTracker />)).toContain('Extra combat phase');
});

test('the words of the chip for each phase', () => {
  expect(addedPhaseLabel('beginning')).toBe('Extra beginning phase');
  expect(addedPhaseLabel('combat')).toBe('Extra combat phase');
  expect(addedPhaseLabel('postcombatMain')).toBe('Extra main phase');
});

test('the pass button leads to the added beginning phase, and from its draw step to the end step', () => {
  const base = { viewer: 0, activeSeat: 0, battlefield: [], combat: null } as const;
  expect(nextStepLabel({ ...base, step: 'postcombatMain' })).toBe('To End Step');
  expect(nextStepLabel({ ...base, step: 'postcombatMain', nextAddedPhase: 'beginning' })).toBe(
    'To Extra Beginning Phase',
  );
  // the added beginning phase: upkeep to draw as always, the draw step to the end step instead of the first main phase
  expect(nextStepLabel({ ...base, step: 'upkeep', addedPhase: true })).toBe('To Draw');
  expect(nextStepLabel({ ...base, step: 'draw', addedPhase: true })).toBe('To End Step');
  expect(nextStepLabel({ ...base, step: 'draw' })).toBe('To First Main');
  // two added phases: the draw step of the first leads to the second
  expect(
    nextStepLabel({ ...base, step: 'draw', addedPhase: true, nextAddedPhase: 'beginning' }),
  ).toBe('To Extra Beginning Phase');
  // an added combat phase after the combat phase that is going on
  expect(nextStepLabel({ ...base, step: 'endOfCombat', nextAddedPhase: 'combat' })).toBe(
    'To Extra Combat',
  );
});
