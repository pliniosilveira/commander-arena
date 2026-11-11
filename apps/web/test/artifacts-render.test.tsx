/**
 * The questions of the Artifacts slice rendered (D-139), in real games of the hidden SYNTHETIC deck `synthetic-artifacts`:
 * the "look at the top cards" pick with the cards that cannot be taken, the "discard two cards unless you discard an
 * artifact card" choice, the "tap any number of creatures" choice, and the "reselect an attack" dialog (drawn from a
 * decision: a one-on-one game without planeswalkers never asks it).
 */
import type { ChooseOptionDecision, GameView, ObjectView } from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { AttackTargetDialog } from '../src/ui/decisions/AttackTargetDialog';
import { DecisionLayer } from '../src/ui/decisions/DecisionLayer';
import { StoreProvider } from '../src/ui/store-context';
import {
  type ArtifactsStore,
  asksDiscardUnless,
  asksLookTake,
  asksTapAny,
  reachArtifactsStore,
} from './artifacts-decks';

/** Server rendering reads zustand's initial state, so report the current one instead. */
const live = (store: ArtifactsStore) => ({ ...store, getInitialState: () => store.getState() });

async function must(accept: (view: GameView) => boolean): Promise<ArtifactsStore> {
  const store = await reachArtifactsStore(accept, { seeds: 40 });
  if (store === null) throw new Error('no seed reaches the situation');
  return store;
}

const render = (store: ArtifactsStore) =>
  renderToStaticMarkup(
    <StoreProvider store={live(store)}>
      <DecisionLayer>
        <div />
      </DecisionLayer>
    </StoreProvider>,
  );

test('look at the top cards: the cards that may be taken, the others shown apart, Take none', async () => {
  const store = await must(asksLookTake);
  const html = render(store);
  expect(html).toContain('aria-label="Cards looked at"');
  expect(html).toContain('Only you see these cards.');
  expect(html).toContain('Also looked at (cannot be taken):');
  expect(html).toContain('aria-label="Other cards looked at"');
  expect(html).toMatch(/<button(?![^>]*disabled)[^>]*data-dec-primary[^>]*>Take none<\/button>/);
  const others = store.getState().snapshot?.lookedCards ?? [];
  expect(others.length).toBeGreaterThan(0);
  for (const card of others) expect(html).toContain(card.name);
  // Taking nothing puts every card on the bottom; the log names no card, only how many were looked at.
  await store.getState().act({ kind: 'chooseCards', objects: [] });
  expect(store.getState().error).toBeNull();
  expect(store.getState().snapshot?.lookedCards).toBeUndefined();
  const log = store.getState().log.map((l) => l.text);
  expect(log.some((t) => /^You look at the top \d+ cards of your library\.$/.test(t))).toBe(true);
}, 120_000);

test('discard unless: two cards or one marked card alone', async () => {
  const store = await must(asksDiscardUnless);
  const html = render(store);
  expect(html).toContain(
    'Discard 2 cards, or one card marked “enough alone” instead, for SYNTHETIC Study Rite.',
  );
  expect(html).toContain('dec-pick-alone');
  expect(html).toMatch(/<button[^>]*disabled[^>]*data-dec-primary[^>]*>Discard<\/button>/);
  const pending = store.getState().snapshot?.view.pending;
  if (pending?.kind !== 'chooseCards' || pending.orSingle === undefined)
    throw new Error('no question');
  const [alone] = pending.orSingle;
  if (alone === undefined) throw new Error('no card that will do alone');
  const handBefore = store.getState().snapshot?.view.seats[0]?.handCount ?? 0;
  await store.getState().act({ kind: 'chooseCards', objects: [alone] });
  expect(store.getState().error).toBeNull();
  expect(store.getState().snapshot?.view.seats[0]?.handCount).toBe(handBefore - 1);
}, 120_000);

test('tap any number: a panel to tap, a Confirm that works with none', async () => {
  const store = await must(asksTapAny);
  const html = render(store);
  expect(html).toContain(
    'Tap any number of untapped creatures you control for SYNTHETIC Idle Scribe.',
  );
  expect(html).toContain('aria-label="Permanents to tap"');
  expect(html).toContain('Tap for SYNTHETIC Idle Scribe');
  expect(html).toMatch(/<button(?![^>]*disabled)[^>]*data-dec-primary[^>]*>Confirm<\/button>/);
}, 120_000);

test('reselect an attack: a button per target, the current one marked, no way out', () => {
  const bears = {
    id: 'o1',
    name: 'Grizzly Bears',
    types: ['creature'],
    zone: 'battlefield',
  } as unknown as ObjectView;
  const jace = {
    id: 'o2',
    name: 'SYNTHETIC Jace',
    types: ['planeswalker'],
    zone: 'battlefield',
  } as unknown as ObjectView;
  const view = {
    viewer: 0,
    battlefield: [bears, jace],
    stack: [],
    exile: [],
    seats: [],
    combat: {
      attackers: [
        { object: 'o1', target: { kind: 'player', seat: 0 }, blocked: false, blockedBy: [] },
      ],
    },
  } as unknown as GameView;
  const d: ChooseOptionDecision = {
    id: 'd1',
    seat: 0,
    kind: 'chooseOption',
    purpose: 'attackTarget',
    options: ['player:0', 'permanent:o2'],
    attacker: 'o1',
    attackTargets: [
      { kind: 'player', seat: 0 },
      { kind: 'permanent', object: 'o2' },
    ],
    source: 'o9',
    sourceName: 'SYNTHETIC Crooked Signpost',
    sourceOracleText: 'Flash',
  };
  const html = renderToStaticMarkup(<AttackTargetDialog d={d} view={view} act={() => {}} />);
  expect(html).toContain('aria-label="Reselect attack"');
  expect(html).toContain('Choose what Grizzly Bears attacks (SYNTHETIC Crooked Signpost).');
  expect(html).toContain('data-option="player:0"');
  expect(html).toContain('You (player)');
  expect(html).toContain('attacking now');
  expect(html).toContain('SYNTHETIC Jace (planeswalker)');
  expect(html).not.toContain('Search creature types');
  expect(html).not.toContain('>Cancel<');
});
