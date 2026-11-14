/**
 * Keyword batch 2 rendered (D-116, D-120): the cost-payment dialog of Convoke, Improvise and Delve (candidates as
 * cards, the engine's suggestion picked, the live line, the buttons), Extort's and Cascade's questions, the chips
 * and the regeneration shield on a tile and in the preview. Static markup only; the click paths are in
 * `e2e/keywords2.e2e.ts`. The view shapes are synthetic; host-backed cases live in `keywords2-host.test.ts`.
 */
import type {
  ChoosePayOptionsDecision,
  ConfirmOptionalDecision,
  GameView,
  ObjectView,
} from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { PreviewPanel } from '../src/ui/board/PreviewPanel';
import { Tile } from '../src/ui/board/Tile';
import { DecisionLayer } from '../src/ui/decisions/DecisionLayer';
import { StoreProvider } from '../src/ui/store-context';
import { gameView, liveStore, objectView, storeFor } from './render-fixtures';

const renderWith = (view: GameView, node: React.ReactNode) =>
  renderToStaticMarkup(<StoreProvider store={liveStore(storeFor(view))}>{node}</StoreProvider>);

const layer = (
  <DecisionLayer>
    <div />
  </DecisionLayer>
);

function payDecision(
  mechanism: ChoosePayOptionsDecision['mechanism'],
  candidates: readonly ObjectView[],
): ChoosePayOptionsDecision {
  const first = candidates[0];
  const suggested = first === undefined ? [] : [first.id];
  return {
    id: 'd1',
    seat: 0,
    kind: 'choosePayOptions',
    source: 'o1',
    mechanism,
    cost: ['2', 'W'],
    candidates: candidates.map((candidate) => candidate.id),
    ...(mechanism === 'convoke'
      ? { colors: Object.fromEntries(candidates.map((candidate) => [candidate.id, candidate.colors])) }
      : {}),
    maxUsable: candidates.length,
    suggested,
    choices: [suggested],
  };
}

function sourceObject(id: string, name: string, oracleText: string): ObjectView {
  return objectView(id, { zone: 'stack', name, oracleText, types: ['instant'] });
}

function confirmDecision(
  purpose: 'mayPay',
  source: ObjectView,
): ConfirmOptionalDecision;
function confirmDecision(
  purpose: 'cascade',
  source: ObjectView,
  subject: ObjectView,
): ConfirmOptionalDecision;
function confirmDecision(
  purpose: 'mayPay' | 'cascade',
  source: ObjectView,
  subject?: ObjectView,
): ConfirmOptionalDecision {
  const base = {
    id: 'd1',
    seat: 0,
    kind: 'confirmOptional' as const,
    source: source.id,
    sourceName: source.name,
    sourceOracleText: source.oracleText,
  };
  if (purpose === 'mayPay') {
    return { ...base, purpose, cost: [{ kind: 'mana', symbols: ['W/B'] }] };
  }
  if (subject === undefined) throw new Error('Cascade needs the exiled card');
  return {
    ...base,
    purpose,
    subject: subject.id,
  };
}

test('the Convoke dialog names the spell and its cost, lists the creatures and preselects the suggestion', () => {
  const spell = sourceObject('o1', 'SYNTHETIC Convoke Spell', '');
  const candidates = [
    objectView('o2', { name: 'SYNTHETIC White Creature', colors: ['W'] }),
    objectView('o3', { name: 'SYNTHETIC Green Creature', colors: ['G'] }),
  ];
  const decision = payDecision('convoke', candidates);
  const html = renderWith(
    gameView(candidates, decision, { stack: [spell] }),
    layer,
  );
  expect(html).toContain('aria-label="Convoke"');
  expect(html).toContain(
    `Convoke: tap creatures to pay for ${spell.name} (${decision.cost.map((x) => `{${x}}`).join('')})`,
  );
  expect(html).toContain('data-pay-cards');
  const buttons = html.match(/<button[^>]*dec-card-button[^>]*>/g) ?? [];
  expect(buttons.length).toBe(decision.candidates.length);
  expect(buttons.filter((b) => b.includes('aria-pressed="true"')).length).toBe(decision.suggested.length);
  expect((html.match(/dec-card-badge">Tap</g) ?? []).length).toBe(decision.suggested.length);
  expect(html).toMatch(/data-pay-line[^>]*>These pay /);
  expect(html).toContain(`${decision.suggested.length} of up to ${decision.maxUsable}`);
  expect(html).toMatch(/<button[^>]*data-dec-primary[^>]*>Tap \d+ creatures?<\/button>/);
  expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*data-dec-primary/);
  expect(html).toContain('>Cancel<');
  expect(html).toContain('>Use suggested<');
  expect(html).toContain('>Clear<');
});

test('the Delve dialog lists graveyard cards to exile', () => {
  const spell = sourceObject('o1', 'SYNTHETIC Delve Spell', '');
  const candidates = [
    objectView('o2', { zone: 'graveyard', name: 'SYNTHETIC Graveyard Card' }),
    objectView('o3', { zone: 'graveyard', name: 'SYNTHETIC Another Card' }),
  ];
  const decision = payDecision('delve', candidates);
  const seats = [
    { id: 0, hand: [], graveyard: candidates, command: [], mulligans: 0, poison: 0, manaPool: [] },
    { id: 1, hand: null, graveyard: [], command: [], mulligans: 0, poison: 0, manaPool: [] },
  ] as unknown as GameView['seats'];
  const html = renderWith(gameView([], decision, { stack: [spell], seats }), layer);
  expect(html).toContain('aria-label="Delve"');
  expect(html).toContain('Delve: exile cards from your graveyard to pay for');
  expect(html).toContain('Click the cards to exile.');
  const buttons = html.match(/<button[^>]*dec-card-button[^>]*>/g) ?? [];
  expect(buttons.length).toBe(decision.candidates.length);
  expect(html).not.toContain('data-pay-colors');
});

test('Extort asks "Pay {W/B} for extort?" and Cascade names the card', () => {
  const extort = sourceObject('o1', 'SYNTHETIC Extort Ability', 'Extort');
  const may = confirmDecision('mayPay', extort);
  const mayHtml = renderWith(gameView([], may, { stack: [extort] }), layer);
  expect(mayHtml).toContain('aria-label="You may pay"');
  expect(mayHtml).toContain('Pay {W/B} for extort?');
  expect(mayHtml).toContain('>Pay<');
  expect(mayHtml).toContain('Don&#x27;t pay');
  expect(mayHtml).not.toContain('>Cancel<');

  const cascadeSource = sourceObject('o1', 'SYNTHETIC Cascade Giant', 'Cascade');
  const exiled = objectView('o2', { zone: 'exile', name: 'SYNTHETIC Cascade Card' });
  const cascade = confirmDecision('cascade', cascadeSource, exiled);
  const cascadeHtml = renderWith(
    gameView([], cascade, { stack: [cascadeSource], exile: [exiled] }),
    layer,
  );
  expect(cascadeHtml).toMatch(/Cascade: cast .+ without paying its mana cost\?/);
  expect(cascadeHtml).toContain('aria-label="Cascade"');
  expect(cascadeHtml).toContain('>Cast it<');
  expect(cascadeHtml).not.toContain('>Cancel<');
});

const permanent = (patch: Partial<ObjectView>): ObjectView =>
  objectView('o901', {
    name: 'SYNTHETIC Regenerating Troll',
    manaCost: ['2', 'B'],
    types: ['creature'],
    colors: ['B'],
    power: 2,
    toughness: 2,
    oracleText: '{1}{B}: Regenerate this creature.',
    ...patch,
  });

test('a regeneration shield is a chip on the tile and a row in the preview; none without one', () => {
  const shielded = permanent({ regenerationShields: 1 });
  const plain = permanent({ id: 'o902' });
  const view = gameView([shielded, plain]);
  const tile = renderWith(view, <Tile object={shielded} w={90} h={120} />);
  expect(tile).toContain('title="Regeneration shield"');
  expect(tile).toContain('>Reg<');
  expect(tile).toContain('regeneration shield');
  const none = renderWith(view, <Tile object={plain} w={90} h={120} />);
  expect(none).not.toContain('Regeneration shield');
  const store = storeFor(view);
  store.getState().hover(shielded.id);
  const preview = renderToStaticMarkup(
    <StoreProvider store={liveStore(store)}>
      <PreviewPanel />
    </StoreProvider>,
  );
  expect(preview).toContain('<dt>Regeneration shield</dt>');
  expect(preview).toContain('data-regeneration-shield');
  expect(preview).toContain('1 shield');
  store.getState().hover(plain.id);
  expect(
    renderToStaticMarkup(
      <StoreProvider store={liveStore(store)}>
        <PreviewPanel />
      </StoreProvider>,
    ),
  ).not.toContain('data-regeneration-shield');
});

test('the chips of batch 2 read their numbers and words from the text on a tile', () => {
  const duelist = permanent({
    id: 'o903',
    name: 'SYNTHETIC Bushido Duelist',
    keywords: ['bushido', 'skulk', 'affinity'],
    oracleText: 'Bushido 2\nSkulk\nAffinity for artifacts',
  });
  const tile = renderWith(gameView([duelist]), <Tile object={duelist} w={90} h={120} />);
  expect(tile).toContain('>Bus 2<');
  expect(tile).toContain('title="Bushido 2"');
  expect(tile).toContain('>Skl<');
  expect(tile).toContain('title="Affinity for artifacts"');
  expect(tile).not.toContain('undefined');
});
