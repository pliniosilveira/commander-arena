/**
 * Amass drawn (D-370, CR 701.47a): the dock panel that asks which Army creature gets the counters (a `choosePermanent`, no new dialog kind) never speaks of a sacrifice and
 * offers every Army the player controls, a token the effect made included, from a real engine view built with the scenario DSL. Cards are SYNTHETIC (the engine's
 * `SYNTHETIC Amass Rite` and Army creatures).
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

test('the panel asks which Army gets the counters, names the Armies and speaks of no sacrifice', () => {
  const g = scenario()
    .seat(0)
    .library(...LIBRARY)
    .hand('SYNTHETIC Amass Rite')
    .battlefield('Swamp', 'Swamp', 'SYNTHETIC Orc Army Veteran', 'SYNTHETIC Soldier Army Recruit')
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain')
    .build();
  g.act(0).cast('SYNTHETIC Amass Rite', { pay: true });
  g.passAll();
  const view = getView(g.state, 0);
  const d = view.pending;
  if (d?.kind !== 'choosePermanent') throw new Error('no choosePermanent decision');
  const html = renderToStaticMarkup(
    <PermanentPanel decision={d} view={view} ui={initialUi(d)} update={() => {}} />,
  );
  expect(html).toContain('>Amass: choose an Army</h3>');
  expect(html).toContain('aria-label="Armies to amass on"');
  expect(html).toContain('SYNTHETIC Orc Army Veteran');
  expect(html).toContain('SYNTHETIC Soldier Army Recruit');
  expect(html).not.toMatch(/[Ss]acrifice/);
});

test('with an Army the replacement effect made, the question offers the tokens', () => {
  const g = scenario()
    .seat(0)
    .library(...LIBRARY)
    .hand('SYNTHETIC Amass Rite')
    .battlefield('Swamp', 'Swamp', 'SYNTHETIC Army Recruiter')
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain')
    .build();
  g.act(0).cast('SYNTHETIC Amass Rite', { pay: true });
  g.passAll();
  const view = getView(g.state, 0);
  const d = view.pending;
  if (d?.kind !== 'choosePermanent') throw new Error('no choosePermanent decision');
  const html = renderToStaticMarkup(
    <PermanentPanel decision={d} view={view} ui={initialUi(d)} update={() => {}} />,
  );
  expect(html).toContain('Zombie Army');
  expect(html).toContain('Orc Army');
});
