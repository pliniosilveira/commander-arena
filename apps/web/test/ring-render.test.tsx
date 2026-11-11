/**
 * The Ring (D-196, CR 701.54) drawn: the dock panel that asks which creature becomes the Ring-bearer (a `choosePermanent`, no new dialog kind), the Ring chip of
 * a player's strip and the Ring-bearer flag of a tile, from a real engine view built with the scenario DSL.
 */
import { getView } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

// The panel hovers cards through the store, which a render over no store does not have: no hover here.
vi.mock('../src/ui/decisions/hover', () => ({ useHoverProps: () => () => ({}) }));

import { PermanentPanel } from '../src/ui/decisions/PermanentPanel';
import { initialUi } from '../src/ui/decisions/ui-state';

const LIBRARY = Array.from({ length: 6 }, () => 'Plains');

test('the panel asks for the Ring-bearer among the creatures the player controls, quotes the spell and names no sacrifice', () => {
  const g = scenario()
    .seat(0)
    .library(...LIBRARY)
    .hand('SYNTHETIC Ring Rite')
    .battlefield('Swamp', 'Swamp', 'Grizzly Bears', 'SYNTHETIC Vanilla 3/3')
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain')
    .build();
  g.act(0).cast('SYNTHETIC Ring Rite', { pay: true });
  g.passAll();
  const view = getView(g.state, 0);
  const d = view.pending;
  if (d?.kind !== 'choosePermanent') throw new Error('no choosePermanent decision');
  const html = renderToStaticMarkup(
    <PermanentPanel decision={d} view={view} ui={initialUi(d)} update={() => {}} />,
  );
  expect(html).toContain('>Choose your Ring-bearer</h3>');
  expect(html).toContain('aria-label="Creatures to be the Ring-bearer"');
  expect(html).toContain('The Ring tempts you.');
  expect(html).toContain('Grizzly Bears');
  expect(html).toContain('SYNTHETIC Vanilla 3/3');
  expect(html).not.toMatch(/Sacrifice/);
});
