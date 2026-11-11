/**
 * The target prompt of a triggered ability and the stack panel, rendered from real games of the
 * hidden SYNTHETIC deck `synthetic-trigger-targets` (CR 603.3d, D-089).
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { DecisionLayer } from '../src/ui/decisions/DecisionLayer';
import { useInteraction } from '../src/ui/interaction';
import { StackPanel } from '../src/ui/panels/StackPanel';
import { StoreProvider } from '../src/ui/store-context';
import {
  REAPER,
  searchTriggerTargets,
  startStore,
  type TargetsStore,
  triggerTargetsAsked,
} from './trigger-targets-decks';

vi.setConfig({ testTimeout: 60_000 });

function ProbeBoard() {
  const i = useInteraction();
  return <div data-testid="probe" data-clickable={[...i.clickable].join(' ')} />;
}

/** Server rendering reads zustand's initial state, so report the current one instead. */
const live = (store: TargetsStore) => ({ ...store, getInitialState: () => store.getState() });

const render = (store: TargetsStore): string =>
  renderToStaticMarkup(
    <StoreProvider store={live(store)}>
      <DecisionLayer>
        <ProbeBoard />
      </DecisionLayer>
      <StackPanel />
    </StoreProvider>,
  );

async function askTrigger(): Promise<TargetsStore> {
  const reached = await searchTriggerTargets(startStore('swamp-forest'), triggerTargetsAsked);
  if (reached === null) throw new Error('no seed reaches the situation');
  return (reached.session as typeof reached.session & { store: TargetsStore }).store;
}

test('the prompt names the trigger and what it does; there is no Cancel; the stack shows the ability', async () => {
  const store = await askTrigger();
  const html = render(store);
  expect(html).toContain(
    `Choose a target for ${REAPER}&#x27;s ability (whenever ${REAPER} enters): Destroy target creature an opponent controls.`,
  );
  // The stack says what set the ability off and what it does.
  expect(html).toContain(`Whenever ${REAPER} enters, destroy target creature an opponent controls`);
  expect(html).toContain('aria-label="Legal targets"');
  expect(html).toMatch(/<button[^>]*data-dec-primary[^>]*>Confirm<\/button>/);
  expect(html).not.toContain('>Cancel<');
  // The ability is on the stack already, as a triggered ability of its source, with no target yet.
  expect(html).toContain('Triggered ability');
  expect(html).not.toContain('pnl-stack-targets');
});

test('once the target is chosen the stack shows the trigger with its target', async () => {
  const store = await askTrigger();
  const view = store.getState().snapshot?.view;
  const pending = view?.pending;
  if (pending?.kind !== 'targets') throw new Error('not a targets decision');
  const target = pending.specs.flatMap((s) => s.legal)[0];
  if (target === undefined || target.kind !== 'object') throw new Error('no object target');
  const name = view?.battlefield.find((o) => o.id === target.id)?.name;
  await store.getState().act({ kind: 'chooseTargets', targets: [target] });
  const html = render(store);
  expect(html).toContain('Triggered ability');
  expect(html).toContain('class="pnl-stack-targets"');
  expect(html).toContain(String(name).replace(/'/g, '&#x27;'));
});
