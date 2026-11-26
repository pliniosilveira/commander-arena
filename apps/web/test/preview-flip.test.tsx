/**
 * The other face of a double-faced card in the preview panel: a card in a hand, a graveyard or exile can be read on its back face
 * (key T or the button of the panel); a permanent or a spell, and every card with one face, is shown as it is. Views made up for the
 * test (SYNTHETIC names), no engine.
 */
import type { FaceView, ObjectView } from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { GameHost } from '../src/game/host';
import { createAppStore } from '../src/store';
import { PreviewPanel } from '../src/ui/board/PreviewPanel';
import { asFace, otherFaceOf } from '../src/ui/decisions/layouts';
import { StoreProvider } from '../src/ui/store-context';

const face = (name: string, patch: Partial<FaceView> = {}): FaceView => ({
  name,
  manaCost: null,
  colors: [],
  supertypes: [],
  types: ['creature'],
  subtypes: [],
  power: null,
  toughness: null,
  loyalty: null,
  defense: null,
  oracleText: '',
  ...patch,
});

const spell = face('SYNTHETIC Rush', {
  manaCost: ['1', 'U'],
  colors: ['U'],
  types: ['instant'],
  oracleText: 'Draw two cards.',
});
const land = face('SYNTHETIC Falls', {
  types: ['land'],
  oracleText: 'This land enters tapped.',
});
const mdfc = (patch: Partial<ObjectView> = {}): ObjectView =>
  ({
    id: 'o1',
    name: spell.name,
    controller: 0,
    owner: 0,
    zone: 'hand',
    types: spell.types,
    subtypes: [],
    supertypes: [],
    colors: spell.colors,
    keywords: [],
    oracleText: spell.oracleText,
    manaCost: spell.manaCost,
    tapped: false,
    damage: 0,
    counters: {},
    isCommander: false,
    summoningSick: false,
    isToken: false,
    power: null,
    toughness: null,
    layout: 'modal_dfc',
    face: 0,
    faces: [spell, land],
    ...patch,
  }) as ObjectView;

describe('otherFaceOf', () => {
  test('a modal or transforming card outside the battlefield and the stack offers the other face', () => {
    expect(otherFaceOf(mdfc())).toBe(1);
    expect(otherFaceOf(mdfc({ zone: 'graveyard' }))).toBe(1);
    expect(otherFaceOf(mdfc({ zone: 'exile' }))).toBe(1);
    expect(otherFaceOf(mdfc({ layout: 'transform' }))).toBe(1);
    expect(otherFaceOf(mdfc({ face: 1 }))).toBe(0);
  });

  test('a permanent, a spell and cards with another layout are shown as they are', () => {
    expect(otherFaceOf(mdfc({ zone: 'battlefield' }))).toBeNull();
    expect(otherFaceOf(mdfc({ zone: 'stack' }))).toBeNull();
    expect(otherFaceOf(mdfc({ layout: 'split' }))).toBeNull();
    expect(otherFaceOf(mdfc({ layout: 'adventure' }))).toBeNull();
    const { layout: _layout, face: _face, faces: _faces, ...single } = mdfc();
    expect(otherFaceOf(single as ObjectView)).toBeNull();
  });
});

describe('asFace', () => {
  test("the card has the other face's name, cost, types and rules text and keeps the rest", () => {
    const flipped = asFace(mdfc({ owner: 1 }), 1);
    expect(flipped).toMatchObject({
      face: 1,
      name: land.name,
      manaCost: null,
      types: ['land'],
      oracleText: 'This land enters tapped.',
      owner: 1,
      zone: 'hand',
      id: 'o1',
    });
  });

  test('numbers are kept, a star and no loyalty are left out, the loyalty of the card is the face one', () => {
    const walker = face('SYNTHETIC Walker', { types: ['planeswalker'], loyalty: 4 });
    const beast = face('SYNTHETIC Beast', { power: 3, toughness: '*' });
    const card = mdfc({ faces: [walker, beast], printedLoyalty: 4 });
    const back = asFace(card, 1);
    expect(back.power).toBe(3);
    expect(back.toughness).toBeNull();
    expect(back.printedLoyalty).toBeUndefined();
    expect(asFace(card, 0).printedLoyalty).toBe(4);
  });
});

describe('the preview panel of a double-faced card in the hand', () => {
  async function panel() {
    const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
    await store
      .getState()
      .startGame({ seed: 11, humanDeck: 'white-knights', aiDeck: 'swamp-forest' });
    const snap = store.getState().snapshot;
    const seat = snap?.view.seats[snap.view.viewer];
    const first = seat?.hand?.[0];
    if (snap === null || seat === undefined || first === undefined) throw new Error('no hand');
    const card = mdfc({ id: first.id });
    const seats = snap.view.seats.map((s) => (s === seat ? { ...s, hand: [card] } : s));
    store.setState({ snapshot: { ...snap, view: { ...snap.view, seats } } });
    store.getState().hover(first.id);
    return renderToStaticMarkup(
      <StoreProvider store={{ ...store, getInitialState: store.getState }}>
        <PreviewPanel />
      </StoreProvider>,
    );
  }

  test('offers the back face, and lists both faces', async () => {
    const html = await panel();
    expect(html).toContain('data-preview-flip="front"');
    expect(html).toContain('Show back face (T)');
    expect(html).toContain(spell.name);
    expect(html).toContain(land.name);
  });
});
