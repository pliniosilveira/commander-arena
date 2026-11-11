/**
 * Keyword batch 2 rendered (D-116, D-120): the cost-payment dialog of Convoke, Improvise and Delve (candidates as
 * cards, the engine's suggestion picked, the live line, the buttons), Extort's and Cascade's questions, the chips
 * and the regeneration shield on a tile and in the preview. Static markup only; the click paths are in
 * `e2e/keywords2.e2e.ts`.
 */
import type { GameView, ObjectView } from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { PreviewPanel } from '../src/ui/board/PreviewPanel';
import { Tile } from '../src/ui/board/Tile';
import { DecisionLayer } from '../src/ui/decisions/DecisionLayer';
import { StoreProvider } from '../src/ui/store-context';
import {
  asksConfirm,
  asksPayOptions,
  type Keywords2Store,
  payOptionsOf,
  reachKeywords2Store,
} from './keywords2-decks';

// The seed search plays whole games: give each test room.
vi.setConfig({ testTimeout: 120_000 });

const live = (store: Keywords2Store) => ({ ...store, getInitialState: () => store.getState() });
const renderWith = (store: Keywords2Store, node: React.ReactNode) =>
  renderToStaticMarkup(<StoreProvider store={live(store)}>{node}</StoreProvider>);

async function must(accept: (view: GameView) => boolean): Promise<Keywords2Store> {
  const store = await reachKeywords2Store(accept);
  if (store === null) throw new Error('no seed reaches the situation');
  return store;
}

const layer = (
  <DecisionLayer>
    <div />
  </DecisionLayer>
);

const viewOf = (store: Keywords2Store): GameView => {
  const view = store.getState().snapshot?.view;
  if (view === undefined) throw new Error('no game');
  return view;
};

/** The store with its view replaced by `change(view)`, as the page would show a later game. */
function withView(store: Keywords2Store, change: (view: GameView) => GameView): Keywords2Store {
  const snap = store.getState().snapshot;
  if (snap === null) throw new Error('no game');
  store.setState({ snapshot: { ...snap, view: change(snap.view) } });
  return store;
}

test('the Convoke dialog names the spell and its cost, lists the creatures and preselects the suggestion', async () => {
  const store = await must(asksPayOptions('convoke', { nonEmpty: true }));
  const d = payOptionsOf(viewOf(store));
  if (d === null) throw new Error('wrong decision');
  const spell = viewOf(store).stack.find((o) => o.id === d.source);
  const html = renderWith(store, layer);
  expect(html).toContain('aria-label="Convoke"');
  expect(html).toContain(
    `Convoke: tap creatures to pay for ${spell?.name} (${d.cost.map((x) => `{${x}}`).join('')})`,
  );
  expect(html).toContain('data-pay-cards');
  // One button per candidate; the suggested ones are pressed and badged "Tap".
  const buttons = html.match(/<button[^>]*dec-card-button[^>]*>/g) ?? [];
  expect(buttons.length).toBe(d.candidates.length);
  expect(buttons.filter((b) => b.includes('aria-pressed="true"')).length).toBe(d.suggested.length);
  expect((html.match(/dec-card-badge">Tap</g) ?? []).length).toBe(d.suggested.length);
  // The live line, the count, the buttons.
  expect(html).toMatch(/data-pay-line[^>]*>These pay /);
  expect(html).toContain(`${d.suggested.length} of up to ${d.maxUsable}`);
  expect(html).toMatch(/<button[^>]*data-dec-primary[^>]*>Tap \d+ creatures?<\/button>/);
  expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*data-dec-primary/);
  expect(html).toContain('>Cancel<');
  expect(html).toContain('>Use suggested<');
  expect(html).toContain('>Clear<');
});

test('the Delve dialog lists graveyard cards to exile', async () => {
  const store = await must(asksPayOptions('delve'));
  const d = payOptionsOf(viewOf(store));
  if (d === null) throw new Error('wrong decision');
  const html = renderWith(store, layer);
  expect(html).toContain('aria-label="Delve"');
  expect(html).toContain('Delve: exile cards from your graveyard to pay for');
  expect(html).toContain('Click the cards to exile.');
  const buttons = html.match(/<button[^>]*dec-card-button[^>]*>/g) ?? [];
  expect(buttons.length).toBe(d.candidates.length);
  // Delve has no colors to say.
  expect(html).not.toContain('data-pay-colors');
});

test('Extort asks "Pay {W/B} for extort?" and Cascade names the card', async () => {
  const may = await must(asksConfirm('mayPay'));
  const mayHtml = renderWith(may, layer);
  expect(mayHtml).toContain('aria-label="You may pay"');
  expect(mayHtml).toContain('Pay {W/B} for extort?');
  expect(mayHtml).toContain('>Pay<');
  expect(mayHtml).toContain('Don&#x27;t pay');
  expect(mayHtml).not.toContain('>Cancel<');

  const cascade = await reachKeywords2Store(asksConfirm('cascade'), {
    prefer: ['SYNTHETIC Cascade Giant'],
  });
  if (cascade === null) throw new Error('no seed reaches the situation');
  const html = renderWith(cascade, layer);
  expect(html).toMatch(/Cascade: cast .+ without paying its mana cost\?/);
  expect(html).toContain('aria-label="Cascade"');
  expect(html).toContain('>Cast it<');
  expect(html).not.toContain('>Cancel<');
});

const permanent = (patch: Partial<ObjectView>): ObjectView =>
  ({
    id: 'o901',
    owner: 0,
    controller: 0,
    zone: 'battlefield',
    name: 'SYNTHETIC Regenerating Troll',
    manaCost: ['2', 'B'],
    supertypes: [],
    types: ['creature'],
    subtypes: [],
    colors: ['B'],
    power: 2,
    toughness: 2,
    oracleText: '{1}{B}: Regenerate this creature.',
    counters: {},
    keywords: [],
    isCommander: false,
    isToken: false,
    support: 'supported',
    targets: [],
    tapped: false,
    damage: 0,
    summoningSick: false,
    protector: null,
    ...patch,
  }) as ObjectView;

test('a regeneration shield is a chip on the tile and a row in the preview; none without one', async () => {
  const store = await must(asksPayOptions('convoke'));
  const shielded = permanent({ regenerationShields: 1 });
  const plain = permanent({ id: 'o902' });
  withView(store, (v) => ({ ...v, battlefield: [...v.battlefield, shielded, plain] }));
  const tile = renderWith(store, <Tile object={shielded} w={90} h={120} />);
  expect(tile).toContain('title="Regeneration shield"');
  expect(tile).toContain('>Reg<');
  expect(tile).toContain('regeneration shield');
  const none = renderWith(store, <Tile object={plain} w={90} h={120} />);
  expect(none).not.toContain('Regeneration shield');
  store.getState().hover(shielded.id);
  const preview = renderWith(store, <PreviewPanel />);
  expect(preview).toContain('<dt>Regeneration shield</dt>');
  expect(preview).toContain('data-regeneration-shield');
  expect(preview).toContain('1 shield');
  store.getState().hover(plain.id);
  expect(renderWith(store, <PreviewPanel />)).not.toContain('data-regeneration-shield');
});

test('the chips of batch 2 read their numbers and words from the text on a tile', async () => {
  const store = await must(asksPayOptions('convoke'));
  const duelist = permanent({
    id: 'o903',
    name: 'SYNTHETIC Bushido Duelist',
    keywords: ['bushido', 'skulk', 'affinity'],
    oracleText: 'Bushido 2\nSkulk\nAffinity for artifacts',
  });
  withView(store, (v) => ({ ...v, battlefield: [...v.battlefield, duelist] }));
  const tile = renderWith(store, <Tile object={duelist} w={90} h={120} />);
  expect(tile).toContain('>Bus 2<');
  expect(tile).toContain('title="Bushido 2"');
  expect(tile).toContain('>Skl<');
  expect(tile).toContain('title="Affinity for artifacts"');
  expect(tile).not.toContain('undefined');
});
