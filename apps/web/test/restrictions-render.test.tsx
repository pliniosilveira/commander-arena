/** Restriction rendering from small typed views; engine-produced decision shapes are tested in the host suite. */
import type { DeclareAttackersDecision } from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { PreviewPanel } from '../src/ui/board/PreviewPanel';
import { DecisionLayer } from '../src/ui/decisions/DecisionLayer';
import { StoreProvider } from '../src/ui/store-context';
import { Tile } from '../src/ui/board/Tile';
import { gameView, liveStore, objectView, storeFor } from './render-fixtures';

const berserker = objectView('o1', {
  name: 'SYNTHETIC Berserker',
  manaCost: ['1', 'R'],
  oracleText: 'This creature attacks each combat if able.',
  restrictions: ['attacksEachCombat'],
});

const declaration: DeclareAttackersDecision = {
  kind: 'declareAttackers',
  id: 'd1',
  seat: 0,
  candidates: [{ attacker: berserker.id, targets: [{ kind: 'player', seat: 1 }] }],
  mustAttack: [berserker.id],
};

test('the tile carries the must-attack restriction chip', () => {
  const html = renderToStaticMarkup(<Tile object={berserker} w={90} h={120} />);
  expect(html).toContain('class="board-kw board-kw-restrict" title="Attacks each combat"');
  expect(html).toContain('>Atk!<');
});

test('the preview lists the restriction under its own heading', () => {
  const store = storeFor(gameView([berserker]));
  store.getState().hover(berserker.id);
  const html = renderToStaticMarkup(
    <StoreProvider store={liveStore(store)}>
      <PreviewPanel />
    </StoreProvider>,
  );
  expect(html).toContain('<dt>Restrictions</dt>');
  expect(html).toContain('<dd>Attacks each combat</dd>');
  expect(html).not.toContain('<dt>Keywords</dt>');
  store.getState().hover(null);
});

test('the attack declaration shows the required creature, badge and explanation', () => {
  const store = storeFor(gameView([berserker], declaration));
  const html = renderToStaticMarkup(
    <StoreProvider store={liveStore(store)}>
      <DecisionLayer>
        <Tile object={berserker} w={90} h={120} />
      </DecisionLayer>
    </StoreProvider>,
  );
  expect(html).toContain('Must attack');
  expect(html).toContain('SYNTHETIC Berserker must attack each combat if able.');
  expect(html).toMatch(/<button[^>]*data-dec-primary[^>]*>Declare attackers \(\d+\)<\/button>/);
});
