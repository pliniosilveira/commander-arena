/**
 * Keyword batch 1 rendered (D-104, D-110): the multikicker dialog, the kicks badge on the stack and
 * in the preview, poison on the player strip, the chips and type line of a changeling, and the
 * split second note under the pass button. Static markup only; the click paths are in
 * `e2e/keywords.e2e.ts`.
 */
import { CREATURE_TYPES, type GameView, type ObjectView } from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { Board } from '../src/ui/board/Board';
import { POISON_TITLE } from '../src/ui/board/PlayerStrip';
import { PreviewPanel } from '../src/ui/board/PreviewPanel';
import { Tile } from '../src/ui/board/Tile';
import { DecisionLayer } from '../src/ui/decisions/DecisionLayer';
import { StackPanel } from '../src/ui/panels/StackPanel';
import { StoreProvider } from '../src/ui/store-context';
import { asksMultikicker, type KeywordStore, reachKeywordsStore } from './keywords-decks';

/** Server rendering reads zustand's initial state, so report the current one instead. */
const live = (store: KeywordStore) => ({ ...store, getInitialState: () => store.getState() });
const renderWith = (store: KeywordStore, node: React.ReactNode) =>
  renderToStaticMarkup(<StoreProvider store={live(store)}>{node}</StoreProvider>);

async function must(accept: (view: GameView) => boolean): Promise<KeywordStore> {
  const store = await reachKeywordsStore(accept);
  if (store === null) throw new Error('no seed reaches the situation');
  return store;
}

const layer = (
  <DecisionLayer>
    <div />
  </DecisionLayer>
);

/** The store with its view replaced by `change(view)`, as the page would show a later game. */
function withView(store: KeywordStore, change: (view: GameView) => GameView): KeywordStore {
  const snap = store.getState().snapshot;
  if (snap === null) throw new Error('no game');
  store.setState({ snapshot: { ...snap, view: change(snap.view) } });
  return store;
}

const stackSpell = (patch: Partial<ObjectView>): ObjectView =>
  ({
    id: 'o900',
    owner: 0,
    controller: 0,
    zone: 'stack',
    name: 'SYNTHETIC Volley Barrage',
    manaCost: ['R'],
    supertypes: [],
    types: ['sorcery'],
    subtypes: [],
    colors: ['R'],
    power: null,
    toughness: null,
    oracleText: 'Multikicker {1}.',
    counters: {},
    keywords: ['multikicker'],
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

test('the multikicker dialog names the card, the cost and the most times, and starts at "Don\'t kick"', async () => {
  const store = await must(asksMultikicker('SYNTHETIC Volley Barrage'));
  const d = store.getState().snapshot?.view.pending;
  if (d?.kind !== 'chooseX') throw new Error('wrong decision');
  const html = renderWith(store, layer);
  expect(html).toContain('aria-label="Multikicker"');
  expect(html).toContain('SYNTHETIC Volley Barrage');
  expect(html).toContain(
    `Pay the multikicker cost {1} how many times? You can afford up to ${d.max}.`,
  );
  expect(html).toContain('aria-label="Fewer kicks"');
  expect(html).toContain('aria-label="More kicks"');
  expect(html).toMatch(/<input[^>]*aria-label="Times kicked"[^>]*value="0"/);
  expect(html).toMatch(/<button[^>]*data-dec-primary[^>]*>Don&#x27;t kick<\/button>/);
  expect(html).toContain('Not kicked.');
  expect(html).toContain('>Max<');
  expect(html).toContain('>Cancel<');
});

test('a spell kicked 3 times shows "kicked 3 times" on the stack and in the preview', async () => {
  const store = await must(asksMultikicker('SYNTHETIC Volley Barrage'));
  const spell = stackSpell({ kicked: true, kicks: 3 });
  withView(store, (v) => ({ ...v, stack: [spell] }));
  const stack = renderWith(store, <StackPanel />);
  expect(stack).toContain('SYNTHETIC Volley Barrage');
  expect(stack).toContain('data-kicks="3"');
  expect(stack).toContain('kicked 3 times');
  store.getState().hover(spell.id);
  const preview = renderWith(store, <PreviewPanel />);
  expect(preview).toContain('Kicked 3 times');
  expect(preview).toContain('Multikicker');
});

test('a spell kicked once says just "kicked"', async () => {
  const store = await must(asksMultikicker('SYNTHETIC Volley Barrage'));
  withView(store, (v) => ({ ...v, stack: [stackSpell({ kicked: true })] }));
  const stack = renderWith(store, <StackPanel />);
  expect(stack).toContain('>kicked<');
  expect(stack).not.toContain('kicked 1 times');
});

test('poison shows on a strip only when it is more than 0, with the rule in its title', async () => {
  const store = await must(asksMultikicker('SYNTHETIC Volley Barrage'));
  expect(renderWith(store, <Board />)).not.toContain('board-flag-poison');
  withView(store, (v) => ({
    ...v,
    seats: v.seats.map((s) => (s.id === v.viewer ? s : { ...s, poison: 3 })),
  }));
  const html = renderWith(store, <Board />);
  expect(html).toContain('board-flag-poison');
  expect(html).toContain('3 poison');
  expect(html).toContain('data-poison="3"');
  expect(html).toContain('ten or more poison counters loses the game (CR 704.5c)'.slice(4));
  expect(POISON_TITLE).toContain('CR 704.5c');
  expect(html).toContain('Opponent, 40 life, 3 poison');
});

test('a changeling reads "Every creature type" in the preview and on its tile label, never all 300', async () => {
  const store = await must(asksMultikicker('SYNTHETIC Volley Barrage'));
  const changeling = stackSpell({
    id: 'o901',
    zone: 'battlefield',
    name: 'SYNTHETIC Chameleon Drifter',
    types: ['creature'],
    subtypes: [...CREATURE_TYPES] as ObjectView['subtypes'],
    keywords: ['changeling', 'annihilator'],
    oracleText: 'Changeling\nAnnihilator 2',
    power: 2,
    toughness: 2,
  });
  withView(store, (v) => ({ ...v, battlefield: [...v.battlefield, changeling] }));
  store.getState().hover(changeling.id);
  const preview = renderWith(store, <PreviewPanel />);
  expect(preview).toContain('Creature — Every creature type');
  expect(preview).not.toContain('Aetherborn');
  expect(preview).toContain('Changeling, Annihilator 2');
  const tile = renderWith(store, <Tile object={changeling} w={90} h={120} />);
  expect(tile).toContain('every creature type');
  expect(tile).toContain('>Chg<');
  expect(tile).toContain('>Ann 2<');
  expect(tile).toContain('title="Annihilator 2"');
  expect(tile).not.toContain('Aetherborn');
});

test('with a split second spell on the stack the bar says why nothing can be cast', async () => {
  // The store's autopilot passes a priority that offers nothing, so the held priority is made from
  // the first one the game stops at: its view gets a Hush Bolt on the stack and no options.
  const store = await must(
    (view) => view.pending?.kind === 'priority' && view.pending.seat === view.viewer,
  );
  const bolt = stackSpell({
    id: 'o902',
    name: 'SYNTHETIC Hush Bolt',
    types: ['instant'],
    keywords: ['splitSecond'],
    oracleText: 'Split second. This spell deals 3 damage to any target.',
  });
  withView(store, (v) => ({
    ...v,
    stack: [bolt],
    pending: v.pending?.kind === 'priority' ? { ...v.pending, options: [{ kind: 'pass' }] } : null,
  }));
  const html = renderWith(store, layer);
  expect(html).toContain('SYNTHETIC Hush Bolt');
  expect(html).toContain(
    'Split second: no spells or abilities can be cast or activated until this resolves',
  );
  expect(html).toContain('dec-detail');
});
