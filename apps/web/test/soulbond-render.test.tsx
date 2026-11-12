/**
 * Soulbond drawn (D-984, CR 702.95): the dock panel that asks which creature to pair with (a `choosePermanent`, no new dialog kind) never speaks of a sacrifice, a pair
 * shows a flag and an accessible name on both tiles and a fact in the card preview, and two identical tokens of which one is paired are not grouped, from a real engine
 * view built with the scenario DSL. Cards are SYNTHETIC (the engine's `SYNTHETIC Soulbound Squire`).
 */
import { type GameView, getView, type ObjectView } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';

// The panel hovers cards through the store, which a render over no store does not have: no hover here.
vi.mock('../src/ui/decisions/hover', () => ({ useHoverProps: () => () => ({}) }));

import { GameHost } from '../src/game/host';
import { createAppStore } from '../src/store';
import { groupTokens, tokenKey } from '../src/ui/board/group';
import { PreviewPanel } from '../src/ui/board/PreviewPanel';
import { Tile } from '../src/ui/board/Tile';
import { PermanentPanel } from '../src/ui/decisions/PermanentPanel';
import { initialUi } from '../src/ui/decisions/ui-state';
import { StoreProvider } from '../src/ui/store-context';

const SQUIRE = 'SYNTHETIC Soulbound Squire';
const LIBRARY = Array.from({ length: 6 }, () => 'Plains');

/** The Squire entered with two creatures of seat 0 on the battlefield and its ability resolved: the question is pending. */
function asked() {
  const g = scenario()
    .seat(0)
    .library(...LIBRARY)
    .hand(SQUIRE)
    .battlefield('Plains', 'Plains', 'Grizzly Bears', 'SYNTHETIC Vanilla 3/3')
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain')
    .build();
  g.act(0).cast(SQUIRE, { pay: true });
  g.passAll();
  g.passAll();
  return g;
}

describe('the panel', () => {
  test('asks which creature to pair, names the creature, offers each candidate and speaks of no sacrifice', () => {
    const g = asked();
    const view = getView(g.state, 0);
    const d = view.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('no choosePermanent decision');
    const html = renderToStaticMarkup(
      <PermanentPanel decision={d} view={view} ui={initialUi(d)} update={() => {}} />,
    );
    expect(html).toContain('>Pair a creature</h3>');
    expect(html).toContain('aria-label="Creatures to pair"');
    expect(html).toContain('Grizzly Bears');
    expect(html).toContain('SYNTHETIC Vanilla 3/3');
    expect(html).not.toMatch(/[Ss]acrifice/);
  });
});

const live = (store: ReturnType<typeof createAppStore>) => ({
  ...store,
  getInitialState: () => store.getState(),
});

/** A game state with a pair of seat 0's creatures, as the view of seat 0 shows it. */
function pairView(): GameView {
  const g = scenario()
    .seat(0)
    .library(...LIBRARY)
    .battlefield(SQUIRE, { label: 'sq', pairedWith: 'bears' })
    .battlefield('Grizzly Bears', { label: 'bears' })
    .battlefield('Grizzly Bears', { label: 'lone' })
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain')
    .build();
  return g.view(0);
}

describe('the board', () => {
  const view = pairView();
  const named = (name: string) => view.battlefield.filter((o) => o.name === name);

  test('both creatures of a pair show the flag and say it in their accessible name; a creature that is not paired does not', () => {
    const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
    const [paired, lone] = named('Grizzly Bears');
    const squire = named(SQUIRE)[0];
    if (paired === undefined || lone === undefined || squire === undefined)
      throw new Error('no creatures');
    const html = (o: typeof paired) =>
      renderToStaticMarkup(
        <StoreProvider store={live(store)}>
          <Tile object={o} w={90} h={120} />
        </StoreProvider>,
      );
    const bearsPaired = view.battlefield.find(
      (o) => o.name === 'Grizzly Bears' && o.pairedWith !== undefined,
    );
    const bearsLone = view.battlefield.find(
      (o) => o.name === 'Grizzly Bears' && o.pairedWith === undefined,
    );
    if (bearsPaired === undefined || bearsLone === undefined) throw new Error('no pair');
    for (const o of [squire, bearsPaired]) {
      const markup = html(o);
      expect(markup).toContain('board-flag-soulbond');
      expect(markup).toContain('>Paired<');
      expect(markup).toContain('paired with another creature');
      expect(markup).toContain(`data-paired-with="${o.pairedWith}"`);
    }
    const markup = html(bearsLone);
    expect(markup).not.toContain('board-flag-soulbond');
    expect(markup).not.toContain('paired with another creature');
  });

  test('a pair with a creature phased out is shown on hold, not as an unpaired creature', () => {
    const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
    const hold = { ...(named(SQUIRE)[0] as ObjectView) } as ObjectView;
    const { pairedWith: _gone, ...rest } = hold;
    const onHold: ObjectView = { ...rest, pairedPhasedOut: true };
    const markup = renderToStaticMarkup(
      <StoreProvider store={live(store)}>
        <Tile object={onHold} w={90} h={120} />
      </StoreProvider>,
    );
    expect(markup).toContain('>Pair on hold<');
    expect(markup).toContain('data-paired-phased-out');
    expect(markup).toContain('paired, on hold while one of the two is phased out');
    expect(markup).not.toContain('>Paired<');
  });

  test('the keyword has a chip of its own, not the first letters of its kind', () => {
    const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
    const squire = named(SQUIRE)[0];
    if (squire === undefined) throw new Error('no squire');
    const markup = renderToStaticMarkup(
      <StoreProvider store={live(store)}>
        <Tile object={squire} w={90} h={120} />
      </StoreProvider>,
    );
    expect(markup).toContain('>Sbd<');
    expect(markup).toContain('title="Soulbond"');
  });

  test('the card preview says which creature it is paired with', () => {
    const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
    const squire = named(SQUIRE)[0];
    if (squire === undefined) throw new Error('no squire');
    const snap = store.getState().snapshot;
    store.setState({ snapshot: { ...(snap ?? {}), view } as never });
    store.getState().pin(squire.id);
    const markup = renderToStaticMarkup(
      <StoreProvider store={live(store)}>
        <PreviewPanel />
      </StoreProvider>,
    );
    expect(markup).toContain('Paired with Grizzly Bears (CR 702.95)');
  });
});

describe('identical tokens', () => {
  test('one of them paired does not group with the others: the badge would be hidden in a group', () => {
    const view = pairView();
    const bears = view.battlefield.filter((o) => o.name === 'Grizzly Bears');
    const [a, b] = bears;
    if (a === undefined || b === undefined) throw new Error('no bears');
    // The same two creatures as tokens, with no pair of their own: one of them paired by a creature, the other not.
    const unpaired = (o: typeof a): ObjectView => {
      const { pairedWith: _gone, ...rest } = o;
      return { ...rest, isToken: true };
    };
    const paired: ObjectView = { ...unpaired(a), pairedWith: 'o99' };
    const plain = unpaired(b);
    expect(tokenKey(paired)).not.toBe(tokenKey(plain));
    expect(groupTokens([paired, plain])).toHaveLength(2);
    // Two that are not paired are one group.
    expect(groupTokens([unpaired(a), plain])).toHaveLength(1);
  });
});
