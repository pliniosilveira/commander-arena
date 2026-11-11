/**
 * Ward (CR 702.21a) and the legend rule (CR 704.5j) rendered from real games of the hidden
 * SYNTHETIC deck `synthetic-ward`: the ward dialog, its payment panel and Cancel, the legend-rule
 * panel and its chips, and that the autopilot still pays the mana of a ward by itself.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { DecisionLayer } from '../src/ui/decisions/DecisionLayer';
import { useInteraction } from '../src/ui/interaction';
import { StoreProvider } from '../src/ui/store-context';
import {
  canStrike,
  canTwin,
  legendAsk,
  searchWard,
  startStore,
  strikeWarded,
  twinKnight,
  type WardStore,
  wardAsk,
} from './ward-decks';

// Each test searches seeds for its situation; a loaded machine needs more than 5 seconds.
vi.setConfig({ testTimeout: 30_000 });

/** A stand-in board that reports what the decision layer provided through the Interaction. */
function ProbeBoard() {
  const i = useInteraction();
  return <div data-testid="probe" data-clickable={[...i.clickable].join(' ')} />;
}

/** Server rendering reads zustand's initial state, so report the current one instead. */
const live = (store: WardStore) => ({ ...store, getInitialState: () => store.getState() });

const render = (store: WardStore): string =>
  renderToStaticMarkup(
    <StoreProvider store={live(store)}>
      <DecisionLayer>
        <ProbeBoard />
      </DecisionLayer>
    </StoreProvider>,
  );

async function askWard(manualPay = false): Promise<WardStore> {
  const reached = await searchWard(startStore, (view) =>
    canStrike(view, 'Lightning Bolt', 'SYNTHETIC Warded Guard', 1),
  );
  if (reached === null) throw new Error('no seed reaches the situation');
  const { store } = reached.session as typeof reached.session & { store: WardStore };
  store.getState().setManualPay(manualPay);
  const snap = await strikeWarded(reached.session, 'Lightning Bolt', 'SYNTHETIC Warded Guard');
  if (!wardAsk(snap.view)) throw new Error(`no ward question: ${snap.view.pending?.kind}`);
  return store;
}

test("the ward question: a dialog with the ward text, the prompt, Pay and Don't pay, no Cancel", async () => {
  const html = render(await askWard());
  expect(html).toContain('role="dialog"');
  expect(html).toContain('aria-label="Ward"');
  expect(html).toContain('SYNTHETIC Warded Guard');
  expect(html).toContain('Ward {1}');
  expect(html).toContain('Pay {1} or Lightning Bolt is countered?');
  expect(html).toMatch(/<button[^>]*data-dec-primary[^>]*>Pay<\/button>/);
  expect(html).toContain('>Don&#x27;t pay<');
  expect(html).not.toContain('>Cancel<');
  // The shock-land and kicker wordings are not used for this question.
  expect(html).not.toContain('enters tapped');
  expect(html).not.toContain('aria-label="Kicker"');
  expect(html).not.toContain('Optional ability');
  // A modal: the board is not interactive and no action bar competes with the dialog.
  expect(html).toContain('data-clickable=""');
  expect(html).not.toContain('class="dec-bar');
});

test('paying by hand: the payment panel, its prompt and a Cancel that says the spell is countered', async () => {
  const store = await askWard(true);
  await store.getState().act({ kind: 'acceptOptional' });
  const view = store.getState().snapshot?.view;
  expect(view?.pending?.kind).toBe('payMana');
  const html = render(store);
  expect(html).toContain('aria-label="Payment"');
  expect(html).toContain('Pay {1} for ward or Lightning Bolt is countered: tap your mana sources.');
  expect(html).toContain('Don&#x27;t pay (it is countered)');
  expect(html).not.toContain('>Cancel<');
  expect(html).toContain('>Auto-pay<');
});

test("with automatic payment the autopilot pays a ward's mana after the answer, as for a cast", async () => {
  const store = await askWard(false);
  await store.getState().act({ kind: 'acceptOptional' });
  const view = store.getState().snapshot?.view;
  expect(view?.pending?.kind).not.toBe('payMana');
  // The spell was not countered: it is still on the stack or has resolved by now.
  const lines = store.getState().log.map((l) => l.text);
  expect(lines).toContain('You pay {1} for ward.');
  expect(lines.some((t) => t.includes('is countered'))).toBe(false);
  const onStack = view?.stack.some((o) => o.name === 'Lightning Bolt') === true;
  expect(onStack || lines.includes('Lightning Bolt resolves.')).toBe(true);
});

test('the legend rule: a panel with the prompt, a chip per copy (the token marked) and no Cancel', async () => {
  const reached = await searchWard(startStore, canTwin);
  if (reached === null) throw new Error('no seed reaches the situation');
  const { store } = reached.session as typeof reached.session & { store: WardStore };
  const snap = await twinKnight(reached.session);
  expect(legendAsk(snap.view)).toBe(true);
  const pending = snap.view.pending;
  if (pending?.kind !== 'choosePermanent') throw new Error('wrong decision');
  const html = render(store);
  expect(html).toContain('aria-label="Legend rule"');
  expect(html).toContain('>Legend rule<');
  expect(html).not.toContain('Permanents to sacrifice');
  expect(html).toContain(
    'You control 2 legendary permanents named SYNTHETIC Ancient Knight. Choose one to keep; the others go to the graveyard.',
  );
  expect(html).toContain('SYNTHETIC Ancient Knight 1');
  expect(html).toContain('SYNTHETIC Ancient Knight 2 (token)');
  expect(html.match(/class="dec-chip"/g)).toHaveLength(2);
  expect(html).toContain('0 of 1 chosen');
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Confirm<\/button>/);
  expect(html).not.toContain('>Cancel<');
  const clickable = /data-clickable="([^"]*)"/.exec(html)?.[1]?.split(' ') ?? [];
  expect([...clickable].sort()).toEqual([...pending.legal].sort());
});
