/**
 * Split, Adventure, modal double-faced and transforming cards rendered: the face chooser, the
 * "on an Adventure" badge, the chips and zone list for casting from exile, the card face of a
 * transformed permanent, and the preview panel listing every face with the one that is up marked.
 */
import type { GameView, ObjectView } from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { CardFace } from '../src/ui/board/CardFace';
import { OtherZonesStrip } from '../src/ui/board/OtherZonesStrip';
import { PreviewPanel } from '../src/ui/board/PreviewPanel';
import { Tile } from '../src/ui/board/Tile';
import { ZoneViewer } from '../src/ui/board/ZoneViewer';
import { AbilityChooser } from '../src/ui/decisions/AbilityChooser';
import type { MenuItem } from '../src/ui/decisions/abilities';
import { ChooserPopover } from '../src/ui/decisions/Chooser';
import { DecisionLayer } from '../src/ui/decisions/DecisionLayer';
import { objectIndex } from '../src/ui/decisions/lookup';
import { initialUi } from '../src/ui/decisions/ui-state';
import { StoreProvider } from '../src/ui/store-context';
import {
  adventureCards,
  basicLandBot,
  finishCast,
  inHand,
  moonBot,
  must,
  offers,
  resolveAll,
  type Session,
  searchLayouts,
  startStore,
} from './layouts-decks';
import type { WardStore } from './ward-decks';

vi.setConfig({ testTimeout: 60_000 });

/** Server rendering reads zustand's initial state, so report the current one instead. */
const live = (store: WardStore) => ({ ...store, getInitialState: () => store.getState() });

type Reached = Session & { store: WardStore };

async function reach(
  accept: (view: GameView) => boolean,
  bot?: Parameters<typeof searchLayouts>[2],
): Promise<Reached> {
  const reached = await searchLayouts(startStore, accept, bot);
  if (reached === null) throw new Error('no seed reaches the situation');
  return reached.session as Reached;
}

const viewOf = (session: Session) => session.snapshot().view;

test('the chooser draws each face as a button with its cost and type line under the name', () => {
  const items: MenuItem[] = [
    {
      key: 'cast-face-0',
      label: 'Cast Study',
      detail: '{1}{U} · Sorcery',
      action: { kind: 'castSpell', object: 'o1', face: 0 },
    },
    {
      key: 'cast-face-1',
      label: 'Cast Zap',
      detail: '{R} · Instant',
      action: { kind: 'castSpell', object: 'o1', face: 1 },
    },
  ];
  const html = renderToStaticMarkup(
    <AbilityChooser
      items={items}
      anchor={{ object: 'o1', left: 4, top: 8 }}
      pick={() => {}}
      close={() => {}}
    />,
  );
  expect(html.match(/<button/g)).toHaveLength(3);
  expect(html.indexOf('Cast Study')).toBeLessThan(html.indexOf('Cast Zap'));
  expect(html).toContain('<span class="dec-chip-detail">{1}{U} · Sorcery</span>');
  expect(html).toContain('<span class="dec-chip-detail">{R} · Instant</span>');
  // An item without a detail has no empty line.
  const bare = renderToStaticMarkup(
    <AbilityChooser
      items={[{ key: 'k', label: 'Cast Bear', action: { kind: 'castSpell', object: 'o1' } }]}
      anchor={{ object: 'o1', left: 0, top: 0 }}
      pick={() => {}}
      close={() => {}}
    />,
  );
  expect(bare).not.toContain('dec-chip-detail');
});

test('a split card in the hand opens the popover with one item per half', async () => {
  const session = await reach(offers('Study // Zap', 'castSpell 0', 'castSpell 1'));
  const view = viewOf(session);
  const card = inHand(view, 'Study // Zap');
  const pending = view.pending;
  if (pending === null) throw new Error('nothing pending');
  const ui = { ...initialUi(pending), chooser: { object: card.id, left: 10, top: 20 } };
  const html = renderToStaticMarkup(
    <ChooserPopover
      pending={pending}
      ui={ui}
      act={() => {}}
      update={() => {}}
      close={() => {}}
      index={objectIndex(view)}
    />,
  );
  expect(html).toContain('Cast Study');
  expect(html).toContain('Cast Zap');
  expect(html).toContain('{1}{U} · Sorcery');
  expect(html).toContain('{R} · Instant');
  expect(html.match(/<button/g)).toHaveLength(3);
});

const spell = (patch: Partial<ObjectView>): ObjectView =>
  ({
    id: 'o1',
    owner: 0,
    controller: 0,
    zone: 'exile',
    name: 'Wise Owl',
    manaCost: ['2', 'U'],
    supertypes: [],
    types: ['creature'],
    subtypes: ['Bird'],
    colors: ['U'],
    power: null,
    toughness: null,
    oracleText: 'Flying',
    counters: {},
    keywords: [],
    isCommander: false,
    isToken: false,
    support: 'supported',
    ...patch,
  }) as ObjectView;

test('the card face shows "on an Adventure" for a card in exile and a back-face mark for a transformed one', async () => {
  const store = await reach(offers('Study // Zap', 'castSpell 0'));
  const face = (o: ObjectView) =>
    renderToStaticMarkup(
      <StoreProvider store={live(store.store)}>
        <CardFace object={o} variant="hand" />
      </StoreProvider>,
    );
  expect(face(spell({ onAdventure: true }))).toContain('>on an Adventure<');
  expect(face(spell({}))).not.toContain('on an Adventure');
  const beast = spell({
    zone: 'battlefield',
    name: 'Moon Beast',
    layout: 'transform',
    face: 1,
    oracleText: 'Trample. At the beginning of your upkeep, transform this creature.',
  });
  const shown = face(beast);
  expect(shown).toContain('Moon Beast');
  expect(shown).toContain('>back face<');
  expect(face({ ...beast, face: 0, name: 'Moon Cub' })).not.toContain('back face');
});

test('a transformed permanent: the tile names the back face and says so; the preview lists both faces', async () => {
  const session = await reach((view) => view.battlefield.some((o) => o.name === 'Moon Beast'), {
    bot: moonBot,
    maxClicks: 700,
  });
  const view = viewOf(session);
  const beast = view.battlefield.find((o) => o.name === 'Moon Beast');
  if (beast === undefined) throw new Error('no beast');
  const tile = renderToStaticMarkup(
    <StoreProvider store={live(session.store)}>
      <Tile object={beast} w={80} h={100} />
    </StoreProvider>,
  );
  expect(tile).toContain('Moon Beast');
  expect(tile).toContain('back face');
  expect(tile).toContain('>back<');

  session.store.getState().pin(beast.id);
  const html = renderToStaticMarkup(
    <StoreProvider store={live(session.store)}>
      <PreviewPanel />
    </StoreProvider>,
  );
  // The card is the face that is up, with its own text.
  expect(html).toContain('Trample');
  expect(html).toContain('Back face up');
  // Both faces are listed, in the card's order, and only the back face is marked as showing.
  expect(html).toContain('aria-label="Faces"');
  expect(html.indexOf('Moon Cub')).toBeGreaterThan(-1);
  const faces = html.slice(html.indexOf('aria-label="Faces"'));
  expect(faces.indexOf('Front face')).toBeLessThan(faces.indexOf('Back face'));
  expect(faces.match(/aria-current="true"/g)).toHaveLength(1);
  expect(faces.match(/>showing</g)).toHaveLength(1);
  expect(faces.indexOf('Moon Beast')).toBeGreaterThan(faces.indexOf('aria-current="true"') - 400);
});

test('the preview of a split card in the hand lists both halves, both showing', async () => {
  const session = await reach(offers('Study // Zap', 'castSpell 0'));
  const card = inHand(viewOf(session), 'Study // Zap');
  session.store.getState().pin(card.id);
  const html = renderToStaticMarkup(
    <StoreProvider store={live(session.store)}>
      <PreviewPanel />
    </StoreProvider>,
  );
  const faces = html.slice(html.indexOf('aria-label="Faces"'));
  expect(faces).toContain('Split, left half');
  expect(faces).toContain('Split, right half');
  expect(faces).toContain('Draw two cards.');
  expect(faces).toContain('{R} · Instant');
  expect(faces.match(/>showing</g)).toHaveLength(2);
  // A single-faced card has no list.
  const bolt = renderToStaticMarkup(
    <StoreProvider store={live(session.store)}>
      <CardFace object={spell({ zone: 'hand' })} variant="full" />
    </StoreProvider>,
  );
  expect(bolt).not.toContain('Faces');
});

test('an Adventure card in exile: the chip row, the zone list badge and the card badge', async () => {
  const session = await reach(offers('Wise Owl', 'castSpell 1'), { bot: basicLandBot });
  const card = inHand(viewOf(session), 'Wise Owl');
  await must(session, { kind: 'castSpell', object: card.id, face: 1 });
  await finishCast(session);
  await resolveAll(session);
  // Play on until the owl can be cast from exile (it costs {2}{U}).
  for (let i = 0; i < 300; i += 1) {
    const view = viewOf(session);
    const [owl] = adventureCards(view);
    if (
      owl !== undefined &&
      view.pending?.kind === 'priority' &&
      view.pending.options.some((o) => o.kind === 'castSpell' && o.object === owl.id)
    ) {
      break;
    }
    if (view.pending === null) break;
    await must(session, basicLandBot(view, view.pending));
  }
  const view = viewOf(session);
  const [owl] = adventureCards(view);
  if (owl === undefined) throw new Error('nothing on an adventure');
  const strip = renderToStaticMarkup(
    <StoreProvider store={live(session.store)}>
      <DecisionLayer>
        <OtherZonesStrip view={view} />
      </DecisionLayer>
    </StoreProvider>,
  );
  expect(strip).toContain('aria-label="Cast from exile"');
  expect(strip).toContain('aria-label="Cast from exile: Wise Owl"');
  expect(strip).toContain('<b>Wise Owl</b>');
  expect(strip).not.toContain('Cast from your graveyard');

  const list = renderToStaticMarkup(
    <StoreProvider store={live(session.store)}>
      <DecisionLayer>
        <ZoneViewer title="Exile (shared)" objects={view.exile} onClose={() => {}} />
      </DecisionLayer>
    </StoreProvider>,
  );
  expect(list).toContain('class="board-ibadge">Cast from exile<');
  expect(list).toContain('>on an Adventure<');
  expect(list).toContain('is-clickable');
});
