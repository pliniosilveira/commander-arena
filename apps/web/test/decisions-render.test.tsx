import type { GameView, ObjectView, PendingDecision } from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { GameHost } from '../src/game/host';
import { createAppStore } from '../src/store';
import { ChooserPopover } from '../src/ui/decisions/Chooser';
import { DecisionLayer } from '../src/ui/decisions/DecisionLayer';
import { passLabel } from '../src/ui/decisions/priority';
import { initialUi, type UiState } from '../src/ui/decisions/ui-state';
import { useInteraction } from '../src/ui/interaction';
import { StoreProvider } from '../src/ui/store-context';
import { chooseAction } from './bot';

// Each test searches seeds for its situation; a loaded machine needs more than 5 seconds.
vi.setConfig({ testTimeout: 30_000 });

type Kind = PendingDecision['kind'];

/** A stand-in board that reports what the decision layer provided through the Interaction. */
function ProbeBoard() {
  const i = useInteraction();
  return (
    <div
      data-testid="probe"
      data-clickable={i.clickable.size}
      data-dim={String(i.dimOthers)}
      data-seats={i.clickableSeats.size}
    />
  );
}

/**
 * Server rendering reads zustand's *initial* state, so the store is wrapped to report its current
 * state instead; that way the markup shows the game as it is now.
 */
function render(store: ReturnType<typeof createAppStore>): string {
  const live: typeof store = { ...store, getInitialState: () => store.getState() };
  return renderToStaticMarkup(
    <StoreProvider store={live}>
      <DecisionLayer>
        <ProbeBoard />
      </DecisionLayer>
    </StoreProvider>,
  );
}

/** Plays the scripted human until the game asks `kind`, over several seeds. */
async function reach(kind: Kind, decks: [string, string]) {
  for (let seed = 1; seed <= 12; seed += 1) {
    const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
    await store.getState().startGame({ seed, humanDeck: decks[0], aiDeck: decks[1] });
    for (let clicks = 0; clicks < 1500; clicks += 1) {
      const view = store.getState().snapshot?.view;
      if (view === undefined || view.result !== null || view.pending === null) break;
      if (view.pending.kind === kind) return store;
      // Attackers are never declared by the bot, so a blockers decision can appear for the human.
      await store.getState().act(chooseAction(view, view.pending));
    }
  }
  return null;
}

test('mulligan: the opening hand, Keep and Mulligan', async () => {
  const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
  await store.getState().startGame({ seed: 7, humanDeck: 'white-knights', aiDeck: 'swamp-forest' });
  const html = render(store);
  expect(store.getState().snapshot?.view.pending?.kind).toBe('mulligan');
  expect(html).toContain('Your opening hand');
  expect(html).toContain('>Keep<');
  expect(html).toContain('>Mulligan<');
  expect(html).toContain('data-clickable="0"');
  // Seven cards, each drawn once, with its name from the view.
  expect(html.match(/class="dec-card"/g)).toHaveLength(7);
  const hand = store.getState().snapshot?.view.seats[0]?.hand ?? [];
  for (const card of hand) expect(html).toContain(card.name.replace(/'/g, '&#x27;'));
});

test('priority: playable cards are clickable and, with nothing able to attack, the button reads Pass Turn', async () => {
  const store = await reach('priority', ['white-knights', 'swamp-forest']);
  expect(store).not.toBeNull();
  if (store === null) return;
  const html = render(store);
  const view = store.getState().snapshot?.view;
  expect(view?.step).toBe('precombatMain');
  expect(html).toMatch(/data-clickable="[1-9]/);
  expect(html).toContain(passLabel(view as GameView));
  expect(passLabel(view as GameView)).toBe('Pass Turn');
  expect(html).toContain('Full Control');
  expect(html).toContain('Manual mana');
  // Concede is in the Settings panel now (issue 43), not in the action bar.
  expect(html).not.toContain('Concede');
});

test('declareAttackers: candidates are clickable, the default label is No Attack', async () => {
  const store = await reach('declareAttackers', ['white-knights', 'swamp-forest']);
  expect(store).not.toBeNull();
  if (store === null) return;
  const html = render(store);
  expect(html).toContain('No Attack');
  expect(html).toContain('Attack with all');
  expect(html).toContain('data-dim="true"');
  expect(html).toMatch(/data-seats="[1-9]"/);
  expect(html).toMatch(/data-clickable="[1-9]/);
});

test('declareBlockers: shown when the opponent attacks', async () => {
  const store = await reach('declareBlockers', ['white-knights', 'swamp-forest']);
  expect(store).not.toBeNull();
  if (store === null) return;
  const html = render(store);
  expect(html).toContain('No Blocks');
  expect(html).toContain('Declare blockers');
  expect(html).toContain('data-dim="true"');
});

test('the passing chip replaces the buttons and nothing is clickable', async () => {
  const store = await reach('priority', ['white-knights', 'swamp-forest']);
  expect(store).not.toBeNull();
  if (store === null) return;
  store.setState({ passing: true });
  const html = render(store);
  expect(html).toContain('click to hold priority');
  expect(html).not.toContain('data-dec-primary');
  expect(html).toContain('data-clickable="0"');
});

test('a refused action shows a dismissible toast, but payment errors stay inline', async () => {
  const store = await reach('priority', ['white-knights', 'swamp-forest']);
  expect(store).not.toBeNull();
  if (store === null) return;
  store.setState({ error: 'That is not allowed' });
  const html = render(store);
  expect(html).toContain('That is not allowed');
  expect(html).toContain('aria-label="Dismiss message"');
});

test('nothing is pending before the first snapshot: only the children render', () => {
  const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
  const html = render(store);
  expect(html).toContain('data-testid="probe"');
  expect(html).not.toContain('dec-bar');
});

test('every decision kind the engine produced renders without throwing', async () => {
  const seen = new Set<string>();
  for (const decks of [
    ['white-knights', 'swamp-forest'],
    ['swamp-forest', 'white-knights'],
    ['instants', 'white-knights'],
  ] as const) {
    const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
    await store.getState().startGame({ seed: 3, humanDeck: decks[0], aiDeck: decks[1] });
    for (let clicks = 0; clicks < 1500; clicks += 1) {
      const view = store.getState().snapshot?.view;
      if (view === undefined || view.result !== null || view.pending === null) break;
      seen.add(view.pending.kind);
      expect(render(store)).toContain('decision-layer');
      await store.getState().act(chooseAction(view, view.pending));
    }
  }
  expect(seen.has('priority')).toBe(true);
  expect(seen.has('targets')).toBe(true);
});

/** A real mid-game view whose pending decision is replaced by a hand-made one. */
async function withPending(make: (view: GameView) => PendingDecision) {
  const store = await reach('priority', ['white-knights', 'swamp-forest']);
  if (store === null) throw new Error('no game reached priority');
  const snapshot = store.getState().snapshot;
  if (snapshot === null) throw new Error('no snapshot');
  store.setState({
    snapshot: { ...snapshot, view: { ...snapshot.view, pending: make(snapshot.view) } },
  });
  return store;
}

const firstOf = (view: GameView, zone: 'hand' | 'battlefield') =>
  (zone === 'hand' ? (view.seats[0]?.hand ?? []) : view.battlefield)[0] as ObjectView;

test('assignDamage: names, lethal amounts, steppers and remaining points', async () => {
  const store = await withPending((view) => {
    const [a, b, c] = view.seats[0]?.hand ?? [];
    if (a === undefined || b === undefined || c === undefined) throw new Error('hand too small');
    return {
      id: 'd900',
      seat: 0,
      kind: 'assignDamage',
      step: 'regular',
      choices: [
        {
          source: a.id,
          power: 5,
          deathtouch: false,
          trample: true,
          blockers: [
            { object: b.id, lethal: 2 },
            { object: c.id, lethal: 1 },
          ],
          tramplesOver: { kind: 'player', seat: 1 },
        },
      ],
    };
  });
  const html = render(store);
  expect(html).toContain('Divide combat damage');
  expect(html).toContain('trample');
  expect(html).toContain('lethal: 2');
  expect(html).toContain('lethal: 1');
  expect(html).toContain('tramples over');
  expect(html).toContain('All damage assigned.');
  expect(html).toContain('aria-label="More damage to Opponent"');
  expect(html).toContain('>Confirm<');
  // Issue 92: a docked panel, not a modal over the board; every creature has its card face beside its row.
  expect(html).toContain('dec-damage-dock');
  expect(html).not.toContain('dec-overlay');
  expect(html).not.toContain('role="dialog"');
  expect(html.match(/dec-damage-thumb/g)).toHaveLength(3);
  expect(html.match(/data-damage-row=/g)).toHaveLength(3);
});

test('targets: the legal target list reaches players and objects, Cancel is offered', async () => {
  const store = await withPending((view) => {
    const target = firstOf(view, 'hand');
    return {
      id: 'd901',
      seat: 0,
      kind: 'targets',
      source: target.id,
      specs: [
        {
          specId: 's0',
          min: 1,
          max: 1,
          legal: [
            { kind: 'object', id: target.id, specId: 's0' },
            { kind: 'player', seat: 1, specId: 's0' },
          ],
        },
      ],
    };
  });
  const html = render(store);
  expect(html).toContain('Legal targets');
  expect(html).toContain('>Opponent<');
  expect(html).toContain('>Cancel<');
  expect(html).toContain('0 of 1 chosen');
  expect(html).toContain('data-seats="1"');
});

test('payMana: the cost, Pay, Auto-pay and the engine error stay inline', async () => {
  const store = await withPending((view) => {
    const land = firstOf(view, 'hand');
    return {
      id: 'd902',
      seat: 0,
      kind: 'payMana',
      source: land.id,
      totalCost: ['1', 'W'],
      manaSources: [{ object: land.id, abilityIndex: 0 }],
    };
  });
  store.setState({ error: 'The taps do not pay the cost' });
  const html = render(store);
  expect(html).toContain('>Pay<');
  expect(html).toContain('>Auto-pay<');
  expect(html).toContain('The taps do not pay the cost');
  // Shown inline once, not also as a toast.
  expect(html.split('The taps do not pay the cost')).toHaveLength(2);
  expect(html).not.toContain('Dismiss message');
});

test('commanderZone and mulliganBottom render their dialogs', async () => {
  const zone = await withPending((view) => ({
    id: 'd903',
    seat: 0,
    kind: 'commanderZone',
    card: 'c1',
    object: firstOf(view, 'hand').id,
    from: 'graveyard',
  }));
  const zoneHtml = render(zone);
  expect(zoneHtml).toContain('to the command zone?');
  expect(zoneHtml).toContain('>Yes<');
  expect(zoneHtml).toContain('>No<');

  const bottom = await withPending((view) => ({
    id: 'd904',
    seat: 0,
    kind: 'mulliganBottom',
    count: 2,
    hand: (view.seats[0]?.hand ?? []).map((o) => o.id),
  }));
  const bottomHtml = render(bottom);
  expect(bottomHtml).toContain('Put 2 cards on the bottom of your library.');
  expect(bottomHtml).toContain('0 of 2 chosen');
  expect(bottomHtml).toContain('aria-pressed="false"');
});

test('confirmOptional with a cost reads "Pay 2 life?" with Pay and two buttons, and says what declining does', async () => {
  const store = await withPending((view) => ({
    id: 'd905',
    seat: 0,
    kind: 'confirmOptional',
    // The land is still in the hand: `source` is not an ability on the stack.
    source: firstOf(view, 'hand').id,
    sourceName: 'SYNTHETIC Shock Land',
    sourceOracleText: "As this land enters, you may pay 2 life. If you don't, it enters tapped.",
    cost: [{ kind: 'payLife', amount: 2 }],
  }));
  const html = render(store);
  expect(html).toContain('aria-label="Optional ability"');
  expect(html).toContain('SYNTHETIC Shock Land');
  expect(html).toContain('Pay 2 life?');
  expect(html).toContain('If you don&#x27;t, SYNTHETIC Shock Land enters tapped.');
  expect(html).toContain('>Pay<');
  expect(html).toContain('>Don&#x27;t pay<');
  expect(html).not.toContain('Do it?');
  expect(html).not.toContain('>Yes<');
});

test('the color popover offers exactly the colors the engine listed for the ability', () => {
  const pending: PendingDecision = {
    id: 'd906',
    seat: 0,
    kind: 'payMana',
    source: 'o1',
    totalCost: ['1'],
    manaSources: [
      { object: 'o2', abilityIndex: 0 },
      { object: 'o2', abilityIndex: 1, colors: ['U', 'B'] },
    ],
  };
  const ui: UiState = {
    ...initialUi(pending),
    chooser: { object: 'o2', abilityIndex: 1, left: 0, top: 0 },
  };
  const html = renderToStaticMarkup(
    <ChooserPopover pending={pending} ui={ui} act={() => {}} update={() => {}} close={() => {}} />,
  );
  expect(html).toContain('aria-label="Add U"');
  expect(html).toContain('aria-label="Add B"');
  for (const other of ['W', 'R', 'G']) expect(html).not.toContain(`aria-label="Add ${other}"`);
});
