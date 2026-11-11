/**
 * Vehicles and Crew (CR 301.7, 702.122) rendered from real games of the hidden SYNTHETIC deck
 * `synthetic-vehicles`: the crew panel, the "crewed" badge and the printed P/T of an uncrewed
 * Vehicle on the tile, the face and the preview.
 */
import type { ObjectView } from '@commander-arena/engine';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { Board } from '../src/ui/board/Board';
import { CardFace } from '../src/ui/board/CardFace';
import { PreviewPanel } from '../src/ui/board/PreviewPanel';
import { DecisionLayer } from '../src/ui/decisions/DecisionLayer';
import { PermanentPanel } from '../src/ui/decisions/PermanentPanel';
import { initialUi } from '../src/ui/decisions/ui-state';
import { useInteraction } from '../src/ui/interaction';
import { StoreProvider } from '../src/ui/store-context';
import {
  canCrewWagon,
  crewWithTwo,
  passUntil,
  searchVehicles,
  startCrew,
  startStore,
  type VehicleStore,
  WAGON,
} from './vehicles-decks';
import { permanent } from './ward-decks';

// Each test searches seeds for its situation; a loaded machine needs more than 5 seconds.
vi.setConfig({ testTimeout: 30_000 });

function ProbeBoard() {
  const i = useInteraction();
  return (
    <div
      data-testid="probe"
      data-clickable={[...i.clickable].join(' ')}
      data-badges={[...i.selected].map((id) => `${id}:${i.badge(id)}`).join(' ')}
    />
  );
}

/** Server rendering reads zustand's initial state, so report the current one instead. */
const live = (store: VehicleStore) => ({ ...store, getInitialState: () => store.getState() });
const render = (store: VehicleStore, node: ReactNode): string =>
  renderToStaticMarkup(<StoreProvider store={live(store)}>{node}</StoreProvider>);

async function reach() {
  const reached = await searchVehicles(startStore, (view) => canCrewWagon(view));
  if (reached === null) throw new Error('no seed reaches the situation');
  const { store } = reached.session as typeof reached.session & { store: VehicleStore };
  return { session: reached.session, store };
}

/** The HTML of the Wagon's tile on the board, from its `data-object-id` button to its end. */
function tileOf(html: string, id: string): string {
  const start = html.indexOf(`data-object-id="${id}"`);
  if (start < 0) throw new Error('the Wagon is not drawn');
  return html.slice(start, html.indexOf('</button>', start));
}

test('the crew panel: Vehicle title, prompt, a chip per creature with its power, the total, Cancel', async () => {
  const { session, store } = await reach();
  const asked = await startCrew(session);
  const pending = asked.view.pending;
  if (pending?.kind !== 'choosePermanent') throw new Error('wrong decision');
  const html = render(
    store,
    <DecisionLayer>
      <ProbeBoard />
    </DecisionLayer>,
  );
  expect(html).toContain(`aria-label="Crew ${WAGON}"`);
  expect(html).toContain(`>Crew ${WAGON}<`);
  expect(html).not.toContain('Permanents to sacrifice');
  expect(html).not.toContain('Sacrifice');
  expect(html).toContain(`Tap creatures with total power 3 or greater to crew ${WAGON}.`);
  expect(html).toContain('Crew 3');
  const chips = html.match(/class="dec-chip"/g) ?? [];
  expect(chips).toHaveLength(pending.legal.length);
  expect(html).toMatch(/\((2|1) power\)/);
  expect(html).toContain('Total power: 0 of 3');
  expect(html).toContain('data-valid="false"');
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Confirm<\/button>/);
  expect(html).toContain('>Cancel<');
  const clickable = /data-clickable="([^"]*)"/.exec(html)?.[1]?.split(' ') ?? [];
  expect([...clickable].sort()).toEqual([...pending.legal].sort());
});

test('the panel with two creatures chosen: pressed chips and a total that has reached N', async () => {
  const { session, store } = await reach();
  const asked = await startCrew(session);
  const view = asked.view;
  const pending = view.pending;
  if (pending?.kind !== 'choosePermanent') throw new Error('wrong decision');
  const chosen = pending.legal.slice(0, 2);
  const html = render(
    store,
    <PermanentPanel
      decision={pending}
      view={view}
      ui={{ ...initialUi(pending), permanents: chosen }}
      update={() => {}}
    />,
  );
  expect(html.match(/aria-pressed="true"/g)).toHaveLength(2);
  const total = chosen.reduce((n, id) => n + (pending.powers?.[id] ?? 0), 0);
  expect(html).toContain(`Total power: ${total} of 3`);
  expect(html).toContain(`data-valid="${total >= 3}"`);
});

test('an uncrewed Vehicle: its printed 4/4 greyed in the P/T place, no "crewed" badge', async () => {
  const { store } = await reach();
  const view = store.getState().snapshot?.view;
  const wagon = view === undefined ? undefined : permanent(view, WAGON, true);
  if (wagon === undefined) throw new Error('no Wagon');
  const tile = tileOf(render(store, <Board />), wagon.id);
  expect(tile).toContain('class="board-stat board-stat-printed"');
  expect(tile).toMatch(/board-stat-printed[^>]*>4\/4</);
  expect(tile).not.toContain('board-stat-pt');
  expect(tile).not.toContain('board-flag-crewed');
  expect(tile).not.toContain('>crewed<');
  expect(tile).toContain('>Crew<');
  expect(tile).toContain('aria-label="SYNTHETIC Rattle Wagon, 4/4 if crewed"');
});

test('a crewed Vehicle: a "crewed" chip and a live 4/4 on the tile, a badge on the card and the preview', async () => {
  const { session, store } = await reach();
  await startCrew(session);
  await crewWithTwo(session);
  await passUntil(session, (v) => v.stack.length === 0, 3);
  const view = store.getState().snapshot?.view;
  const wagon = view === undefined ? undefined : permanent(view, WAGON, true);
  if (view === undefined || wagon === undefined) throw new Error('no Wagon');
  expect(wagon.types).toContain('creature');
  const tile = tileOf(render(store, <Board />), wagon.id);
  expect(tile).toContain('board-flag-crewed');
  expect(tile).toContain('>crewed<');
  expect(tile).toMatch(/board-stat-pt[^>]*>4\/4</);
  expect(tile).not.toContain('board-stat-printed');
  expect(tile).toContain('4/4, crewed"');
  const face = render(store, <CardFace object={wagon} variant="full" />);
  expect(face).toContain('>crewed<');
  expect(face).toMatch(/board-stat-pt[^>]*>4\/4</);
  store.getState().pin(wagon.id);
  const preview = render(store, <PreviewPanel />);
  expect(preview).toContain('<dt>Now</dt>');
  expect(preview).toContain('4/4');
  expect(preview).toContain('Crewed');
  expect(preview).not.toContain('<dt>Printed</dt>');
});

test('the card face of an uncrewed Vehicle shows the greyed printed pair and no badge', async () => {
  const { store } = await reach();
  const view = store.getState().snapshot?.view;
  const wagon = view === undefined ? undefined : permanent(view, WAGON, true);
  if (wagon === undefined) throw new Error('no Wagon');
  const face = render(store, <CardFace object={wagon} variant="hand" />);
  expect(face).toMatch(/board-stat-printed[^>]*>4\/4</);
  expect(face).not.toContain('>crewed<');
});

test('the preview of an uncrewed Vehicle lists the printed pair, not a live "Now"', async () => {
  const { store } = await reach();
  const view = store.getState().snapshot?.view;
  const wagon: ObjectView | undefined =
    view === undefined ? undefined : permanent(view, WAGON, true);
  if (wagon === undefined) throw new Error('no Wagon');
  store.getState().pin(wagon.id);
  const html = render(store, <PreviewPanel />);
  expect(html).toContain('<dt>Printed</dt>');
  expect(html).toContain('4/4, only while it is a creature');
  expect(html).not.toContain('<dt>Now</dt>');
  expect(html).not.toContain('Crewed');
});
