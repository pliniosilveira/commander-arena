/** The M5 S2 decision UI, rendered from real games of the SYNTHETIC trigger deck. */
import type { PendingDecision } from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { DecisionLayer } from '../src/ui/decisions/DecisionLayer';
import { useInteraction } from '../src/ui/interaction';
import { StackPanel } from '../src/ui/panels/StackPanel';
import { StoreProvider } from '../src/ui/store-context';
import { reachTriggerDecision, type TriggerStore } from './trigger-decks';

/** A stand-in board that reports what the decision layer provided through the Interaction. */
function ProbeBoard() {
  const i = useInteraction();
  return (
    <div
      data-testid="probe"
      data-clickable={[...i.clickable].join(' ')}
      data-selected={i.selected.size}
      data-dim={String(i.dimOthers)}
    />
  );
}

/** Server rendering reads zustand's initial state, so report the current one instead. */
function live(store: TriggerStore) {
  return { ...store, getInitialState: () => store.getState() };
}

function render(store: TriggerStore): string {
  return renderToStaticMarkup(
    <StoreProvider store={live(store)}>
      <DecisionLayer>
        <ProbeBoard />
      </DecisionLayer>
    </StoreProvider>,
  );
}

async function reach<K extends PendingDecision['kind']>(kind: K) {
  const reached = await reachTriggerDecision(kind);
  if (reached === null) throw new Error(`no seed reached ${kind}`);
  const pending = reached.store.getState().snapshot?.view.pending;
  if (pending?.kind !== kind) throw new Error(`pending is not ${kind}`);
  return { store: reached.store, pending: pending as Extract<PendingDecision, { kind: K }> };
}

const htmlEscape = (text: string) => text.replace(/'/g, '&#x27;');

test('choosePermanent: legal permanents are highlighted, the panel names the source, Confirm waits', async () => {
  const { store, pending } = await reach('choosePermanent');
  const html = render(store);
  expect(html).toContain('data-dim="true"');
  // The board is told every legal permanent is clickable.
  const clickable = /data-clickable="([^"]*)"/.exec(html)?.[1]?.split(' ') ?? [];
  expect([...clickable].sort()).toEqual([...pending.legal].sort());
  expect(html).toContain('aria-label="Permanents to sacrifice"');
  expect(html).toMatch(/Sacrifice for [^<]+</);
  expect(html).toContain('Sacrifice a permanent for');
  expect(html).toContain('0 of 1 chosen');
  // One chip per legal permanent, none pressed yet, and Confirm is disabled.
  expect(html.match(/class="dec-chip"/g)).toHaveLength(pending.legal.length);
  expect(html).not.toContain('aria-pressed="true"');
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Confirm<\/button>/);
  // The ability that asks is on the stack and the stack panel shows it as an ability.
  const view = store.getState().snapshot?.view;
  const source = view?.stack.find((o) => o.id === pending.source);
  expect(source?.abilitySource).toBeDefined();
});

test('orderTriggers: rows say when they resolve and have move buttons; the bar says what to do', async () => {
  const { store, pending } = await reach('orderTriggers');
  const html = render(store);
  expect(html).toContain('aria-label="Trigger order"');
  expect(html).toContain('Top resolves first. Bottom resolves last.');
  expect(html).toContain('Resolves first');
  expect(html).toContain('Resolves last');
  for (const t of pending.triggers) expect(html).toContain(htmlEscape(t.sourceName));
  // Two rows: the first row cannot move up and the last cannot move down.
  expect(html.match(/class="dec-order-row"/g)).toHaveLength(pending.triggers.length);
  expect(html.match(/aria-label="Move [^"]*up[^"]*"/g)).toHaveLength(pending.triggers.length);
  expect(html.match(/aria-label="Move [^"]*down[^"]*"/g)).toHaveLength(pending.triggers.length);
  expect(html.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(2);
  expect(html).toContain('Order your triggered abilities.');
  expect(html).toContain('>Confirm order<');
  // The default list is the engine's default order reversed: the last put on the stack resolves first.
  const names = [...html.matchAll(/class="dec-order-name">([^<]*)</g)].map((m) => m[1]);
  expect(names).toEqual([...pending.triggers].reverse().map((t) => htmlEscape(t.sourceName)));
});

test('confirmOptional: a dialog with the source, its text, Yes and No', async () => {
  const { store, pending } = await reach('confirmOptional');
  const html = render(store);
  expect(html).toContain('role="dialog"');
  expect(html).toContain('aria-label="Optional ability"');
  expect(html).toContain(htmlEscape(pending.sourceName));
  expect(html).toContain(htmlEscape(pending.sourceOracleText));
  expect(html).toContain('Do it?');
  expect(html).toContain('>Yes<');
  expect(html).toContain('>No<');
  // A modal: the board is not interactive and no action bar competes with the dialog.
  expect(html).toContain('data-clickable=""');
  expect(html).not.toContain('class="dec-bar');
});

test('the stack panel shows a triggered ability under its source, not as a card', async () => {
  const { store } = await reach('confirmOptional');
  const html = renderToStaticMarkup(
    <StoreProvider store={live(store)}>
      <StackPanel />
    </StoreProvider>,
  );
  expect(html).toContain('pnl-triggered');
  expect(html).toContain('Triggered ability');
  expect(html).toContain('SYNTHETIC May Draw Creature');
  // An ability has no mana cost to draw.
  expect(html).not.toContain('class="mana-cost');
});
