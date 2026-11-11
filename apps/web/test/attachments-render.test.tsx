/**
 * Attached Auras and Equipment on the board: drawn as strips under their host, not as tiles; an
 * unattached Equipment is an ordinary tile; the host's power and toughness is the view's number.
 * The first tests use hand-made views (the shapes are the engine's), the last two a real game of the
 * hidden SYNTHETIC deck `synthetic-attachments`.
 */
import type { ObjectView } from '@commander-arena/engine';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { GameHost } from '../src/game/host';
import { createAppStore } from '../src/store';
import { splitAttachments } from '../src/ui/board/attach';
import { Board } from '../src/ui/board/Board';
import { PreviewPanel } from '../src/ui/board/PreviewPanel';
import { BattlefieldRow } from '../src/ui/board/Row';
import { type Interaction, InteractionProvider, NO_INTERACTION } from '../src/ui/interaction';
import { StoreProvider } from '../src/ui/store-context';
import { type AttachmentsStore, reachAttachmentsStore } from './attachments-decks';

let next = 0;
function obj(over: Partial<ObjectView> = {}): ObjectView {
  next += 1;
  return {
    id: `o${next}`,
    owner: 0,
    controller: 0,
    zone: 'battlefield',
    name: 'Bear',
    manaCost: null,
    supertypes: [],
    types: ['creature'],
    subtypes: ['Bear'],
    colors: ['G'],
    power: 2,
    toughness: 2,
    oracleText: '',
    tapped: false,
    damage: 0,
    counters: {},
    isCommander: false,
    summoningSick: false,
    isToken: false,
    keywords: [],
    protector: null,
    support: 'supported',
    targets: [],
    ...over,
  };
}

const store = () => createAppStore({ client: new GameHost({ clock: () => 0 }) });
const live = (s: AttachmentsStore) => ({ ...s, getInitialState: s.getState });

function renderWith(s: AttachmentsStore, node: ReactNode, ix: Interaction = NO_INTERACTION) {
  return renderToStaticMarkup(
    <StoreProvider store={live(s)}>
      <InteractionProvider value={ix}>{node}</InteractionProvider>
    </StoreProvider>,
  );
}

/** The markup of the one button for this object. */
const button = (html: string, id: string) =>
  html.split('<button').find((chunk) => chunk.includes(`data-object-id="${id}"`)) ?? '';

describe('a battlefield row with attachments', () => {
  // A 4/4 Bear: printed 2/2 plus an Aura's +2/+2, as the engine's view already derives it.
  const host = obj({ power: 4, toughness: 4, keywords: ['flying'], attachments: [] });
  const aura = obj({
    name: 'Might Aura',
    types: ['enchantment'],
    subtypes: ['Aura'],
    power: null,
    toughness: null,
    attachedTo: host.id,
  });
  const boots = obj({
    name: 'Wing Boots',
    types: ['artifact'],
    subtypes: ['Equipment'],
    colors: [],
    power: null,
    toughness: null,
    attachedTo: host.id,
  });
  const hostView = { ...host, attachments: [aura.id, boots.id] };
  const idle = obj({
    name: 'Blade',
    types: ['artifact'],
    subtypes: ['Equipment'],
    colors: [],
    power: null,
    toughness: null,
  });

  function row(kind: 'creature' | 'other', objects: ObjectView[], all: ObjectView[]) {
    const { byHost } = splitAttachments(all);
    return renderWith(
      store(),
      <BattlefieldRow kind={kind} objects={objects} roles={new Map()} attachments={byHost} />,
    );
  }

  test('the Aura and the Equipment are strips under the host, each named and linked to it', () => {
    const html = row('creature', [hostView], [hostView, aura, boots]);
    const strip = (o: ObjectView) => button(html, o.id);
    expect(strip(aura)).toContain('board-attach');
    expect(strip(aura)).not.toContain('board-tile');
    expect(strip(aura)).toContain(`data-attached-to="${host.id}"`);
    expect(strip(aura)).toContain('aria-label="Might Aura, attached to Bear"');
    expect(strip(aura)).toContain('board-attach-aura');
    expect(strip(boots)).toContain('board-attach-gear');
    expect(html).toContain(`data-host-id="${host.id}"`);
    // The host is still a tile, drawn first, with the strips after it in oldest-first order.
    expect(button(html, host.id)).toContain('board-tile');
    expect(html.indexOf(`data-object-id="${aura.id}"`)).toBeGreaterThan(
      html.indexOf(`data-object-id="${host.id}"`),
    );
    expect(html.indexOf(`data-object-id="${boots.id}"`)).toBeGreaterThan(
      html.indexOf(`data-object-id="${aura.id}"`),
    );
  });

  test('the tile shows the power and toughness of the view once, and the granted keyword', () => {
    const html = row('creature', [hostView], [hostView, aura, boots]);
    const tile = button(html, host.id);
    expect(tile).toContain('<span class="board-stat board-stat-pt">4/4</span>');
    expect(tile).not.toMatch(/6\/6|7\/7/);
    // Keywords come from `view.keywords` as before: flying is on the tile.
    expect(tile).toContain('title="Flying"');
    // The Aura and the Equipment draw no corner stat: they have no power or toughness.
    expect(button(html, aura.id)).not.toContain('board-stat');
  });

  test('an unattached Equipment is an ordinary tile in its own row, with no strip', () => {
    const html = row('other', [idle], [hostView, aura, boots, idle]);
    expect(button(html, idle.id)).toContain('board-tile');
    expect(html).not.toContain('board-attach');
    expect(html).not.toContain('board-stack');
  });

  test('a row without attachments is unchanged: plain tiles, no stack wrapper', () => {
    const html = row('creature', [host], [host]);
    expect(html).not.toContain('board-stack');
    expect(html).toContain('--attach-reserve:0px');
  });

  test('a row with a host reserves room under its tiles for the strips', () => {
    const html = row('creature', [hostView], [hostView, aura, boots]);
    expect(html).toContain('--attach-reserve:28px');
  });

  test('clicking the host and a strip are separate: each reads the interaction for its own id', () => {
    const { byHost } = splitAttachments([hostView, aura, boots]);
    const html = renderWith(
      store(),
      <BattlefieldRow
        kind="creature"
        objects={[hostView]}
        roles={new Map()}
        attachments={byHost}
      />,
      {
        ...NO_INTERACTION,
        clickable: new Set([host.id, boots.id]),
        selected: new Set([host.id]),
        dimOthers: true,
        badge: (id) => (id === host.id ? 'Target' : null),
      },
    );
    expect(button(html, host.id)).toContain('is-clickable');
    expect(button(html, host.id)).toContain('is-selected');
    expect(button(html, host.id)).toContain('Target');
    expect(button(html, boots.id)).toContain('is-clickable');
    expect(button(html, boots.id)).not.toContain('is-dimmed');
    expect(button(html, aura.id)).toContain('is-dimmed');
  });

  test('a tapped host puts the strips under its turned card, which is shorter and wider', () => {
    const tapped = { ...hostView, tapped: true };
    const { byHost } = splitAttachments([tapped, aura, boots]);
    const html = renderWith(
      store(),
      <BattlefieldRow kind="creature" objects={[tapped]} roles={new Map()} attachments={byHost} />,
    );
    expect(html).toContain('board-attach-list');
    expect(button(html, host.id)).toContain('is-tapped');
  });
});

describe('a real game with an Aura on a creature', () => {
  async function attachedGame() {
    const s = await reachAttachmentsStore((view) =>
      view.battlefield.some((o) => o.attachedTo !== undefined && o.controller === view.viewer),
    );
    if (s === null) throw new Error('no seed attached anything');
    return s;
  }

  test('the Board draws the attachment as a strip and its host tile shows the derived P/T', async () => {
    const s = await attachedGame();
    const view = s.getState().snapshot?.view;
    const attachment = view?.battlefield.find((o) => o.attachedTo !== undefined);
    const host = view?.battlefield.find((o) => o.id === attachment?.attachedTo);
    if (attachment === undefined || host === undefined) throw new Error('no attachment');
    const html = renderWith(s, <Board />);
    expect(button(html, attachment.id)).toContain('board-attach');
    expect(button(html, attachment.id)).not.toContain('board-tile');
    const tile = button(html, host.id);
    expect(tile).toContain('board-tile');
    expect(tile).toContain(`board-stat-pt">${host.power}/${host.toughness}<`);
    // Drawn exactly once: as a strip, never also as a tile.
    expect(html.split(`data-object-id="${attachment.id}"`)).toHaveLength(2);
  });

  test('the preview of the host lists its attachments, and of the attachment names the host', async () => {
    const s = await attachedGame();
    const view = s.getState().snapshot?.view;
    const attachment = view?.battlefield.find((o) => o.attachedTo !== undefined);
    const host = view?.battlefield.find((o) => o.id === attachment?.attachedTo);
    if (attachment === undefined || host === undefined) throw new Error('no attachment');
    s.getState().hover(host.id);
    const hostHtml = renderWith(s, <PreviewPanel />);
    expect(hostHtml).toContain('<dt>Attached</dt>');
    expect(hostHtml).toContain(attachment.name);
    s.getState().hover(attachment.id);
    const attachmentHtml = renderWith(s, <PreviewPanel />);
    expect(attachmentHtml).toContain('<dt>Attached to</dt>');
    expect(attachmentHtml).toContain(host.name);
    s.getState().hover(null);
  });
});
