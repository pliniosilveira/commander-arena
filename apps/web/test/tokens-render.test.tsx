/**
 * Playtest issue 36: tokens had no frame of their own, and a stack of tapped tokens drew an upright
 * card behind the tapped one. The generic token frame (SPEC 6.2) is drawn from the view alone, no
 * image, so these tests need no network.
 */
import { readFileSync } from 'node:fs';
import type { ObjectView } from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { GameHost } from '../src/game/host';
import { createAppStore } from '../src/store';
import { CardFace } from '../src/ui/board/CardFace';
import { groupTokens } from '../src/ui/board/group';
import { layoutRow } from '../src/ui/board/layout';
import { rowSpec } from '../src/ui/board/Row';
import { Tile, tokenLine } from '../src/ui/board/Tile';
import { StoreProvider } from '../src/ui/store-context';

function zombie(id: string, over: Partial<ObjectView> = {}): ObjectView {
  return {
    id,
    owner: 0,
    controller: 0,
    zone: 'battlefield',
    name: 'Zombie',
    manaCost: null,
    supertypes: [],
    types: ['creature'],
    subtypes: ['Zombie'],
    colors: ['B'],
    power: 2,
    toughness: 2,
    oracleText: '',
    tapped: false,
    damage: 0,
    counters: {},
    isCommander: false,
    summoningSick: false,
    isToken: true,
    keywords: [],
    protector: null,
    support: 'supported',
    targets: [],
    ...over,
  } as ObjectView;
}

const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
const render = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <StoreProvider store={{ ...store, getInitialState: store.getState }}>{node}</StoreProvider>,
  );

describe('the generic token frame', () => {
  test('the second line says token, then the types and subtypes', () => {
    expect(tokenLine(zombie('a'))).toBe('Token creature — Zombie');
    expect(tokenLine(zombie('a', { types: ['artifact'], subtypes: ['Treasure'] }))).toBe(
      'Token artifact — Treasure',
    );
  });

  test('a token tile is marked and tinted by its colours; a card tile is not', () => {
    const token = render(<Tile object={zombie('a')} w={90} h={120} />);
    expect(token).toContain('is-token');
    expect(token).toContain('data-token-line');
    expect(token).toContain('--token-tint');
    const card = render(<Tile object={zombie('b', { isToken: false })} w={90} h={120} />);
    expect(card).not.toContain('is-token');
    expect(card).not.toContain('data-token-line');
  });

  test('the preview card says Token in its type line and has the token frame', () => {
    const html = render(<CardFace object={zombie('a')} variant="full" />);
    expect(html).toContain('board-card-token');
    expect(html).toContain('Token Creature — Zombie');
  });
});

describe('a stack of tokens is tapped or untapped as a whole', () => {
  test('tapped and untapped tokens never share a group', () => {
    const entries = groupTokens([
      zombie('a', { tapped: true }),
      zombie('b'),
      zombie('c', { tapped: true }),
      zombie('d'),
      zombie('e', { tapped: true }),
    ]);
    const groups = entries.flatMap((e) => (e.kind === 'group' ? [e.objects] : []));
    expect(groups).toHaveLength(2);
    for (const g of groups) expect(new Set(g.map((o) => o.tapped)).size).toBe(1);
  });

  test('a tapped group tile is tapped and carries its stack, so the card behind turns with it', () => {
    const html = render(<Tile object={zombie('a', { tapped: true })} count={13} w={90} h={120} />);
    expect(html).toContain('is-tapped');
    expect(html).toContain('is-group');
    expect(html).toContain('board-tile-stack');
    expect(html).toContain('13 Zombie tokens, 2/2, tapped');
  });
});

describe('issue 36 again: 13 tapped tokens beside untapped ones in a row that is too narrow', () => {
  const tokens = (tapped: number, untapped: number) => [
    ...Array.from({ length: tapped }, (_, i) => zombie(`t${i}`, { tapped: true })),
    ...Array.from({ length: untapped }, (_, i) => zombie(`u${i}`)),
  ];

  test('the row groups them in two stacks, one tapped and one untapped, each with its own count', () => {
    const layout = layoutRow(tokens(13, 17), 600, rowSpec('creature', 100));
    expect(layout.grouped).toBe(true);
    const groups = layout.entries.flatMap((e) => (e.kind === 'group' ? [e.objects] : []));
    expect(groups.map((g) => [g.length, g[0]?.tapped])).toEqual([
      [13, true],
      [17, false],
    ]);
    for (const g of groups) expect(new Set(g.map((o) => o.tapped)).size).toBe(1);
  });

  test('all 13 tapped tokens alone make one tapped stack and nothing untapped', () => {
    const layout = layoutRow(tokens(13, 0), 300, rowSpec('creature', 100));
    const entries = layout.entries;
    expect(entries).toHaveLength(1);
    const only = entries[0];
    expect(only?.kind).toBe('group');
    if (only?.kind === 'group') {
      expect(only.objects).toHaveLength(13);
      expect(only.objects.every((o) => o.tapped)).toBe(true);
    }
  });

  test('the card behind a tapped stack is turned as the front card is, in the stylesheet too', () => {
    // The decorative card behind a stack sits outside the front card's own box, so it has to be
    // turned by a rule of its own: without it a tapped stack drew an upright card behind a tapped
    // one, which looked like untapped and tapped cards in one stack.
    const css = readFileSync(new URL('../src/ui/board/board.css', import.meta.url), 'utf8');
    const rule = css.match(/\.board-tile\.is-tapped \.board-tile-stack \{([^}]*)\}/);
    expect(rule?.[1]).toMatch(/rotate\(90deg\)/);
  });
});
