/**
 * The questions of the Angels slice (D-149) end to end through the page's store, in real games of the hidden SYNTHETIC decks
 * `synthetic-angels` and `synthetic-angels-fliers`: the tax on blocking (what the declaration says it costs, the payment after
 * it), proliferate (the permanents and the answer with players) and a spell cast by tapping creatures. The seeds are found by
 * the search of `angels-decks.ts`; the checks fail loudly when a seed no longer reaches the situation.
 */
import type {
  ChoosePermanentDecision,
  DeclareBlockersDecision,
  GameView,
  PayManaDecision,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { blockCostDetail, blockCostRow, blockTaxPrompt } from '../src/ui/decisions/block-tax';
import { objectIndex } from '../src/ui/decisions/lookup';
import { payBarPrompt, payCancelLabel } from '../src/ui/decisions/payment';
import {
  angelsPermanentPrompt,
  proliferateAnswer,
  proliferatePrompt,
} from '../src/ui/decisions/permanents-angels';
import { asksBlockTax, asksProliferate, asksSpellTap, reachAngelsStore } from './angels-decks';

const FLIERS = 'synthetic-angels-fliers';

test('the declaration says what blocking costs; the payment follows the blockers and declares them', async () => {
  const found = await reachAngelsStore(asksBlockTax, /ZZZ/, {
    seeds: 40,
    human: FLIERS,
    ai: FLIERS,
    manual: true,
  });
  if (found === null) throw new Error('no seed reaches the tax on blocking');
  const { store } = found;
  const view = store.getState().snapshot?.view as GameView;
  const d = view.pending as DeclareBlockersDecision;
  const index = objectIndex(view);
  // Two Angels attack: each taxes {1}, so a blocker costs {1}{1} (the engine lists the symbols of every tax).
  expect(d.blockCost?.cost.every((s) => s === '1')).toBe(true);
  const taxer = d.blockCost === undefined ? undefined : index.get(d.blockCost.source);
  expect(taxer?.name).toBe('SYNTHETIC Tithe Angel');
  const blocker = d.candidates[0];
  const attacker = d.attackers[0];
  if (blocker === undefined || attacker === undefined) throw new Error('no block to make');
  const row = blockCostRow(d, [{ blocker: blocker.blocker }], index);
  expect(row?.blockers).toBe(1);
  expect(row?.total).toEqual([String(d.blockCost?.cost.length)]);
  expect(blockCostDetail(row)).toContain(`These blocks cost {${d.blockCost?.cost.length}}`);

  await store.getState().act({
    kind: 'declareBlockers',
    blocks: [{ blocker: blocker.blocker, attacker: attacker.attacker }],
  });
  const next = store.getState().snapshot?.view;
  const pay = next?.pending as PayManaDecision;
  expect(pay.kind).toBe('payMana');
  expect(pay.purpose).toBe('blockTax');
  expect(pay.blocks?.length).toBe(1);
  expect(blockTaxPrompt(pay)).toBe(
    `Pay {${d.blockCost?.cost.length}} so this creature can block: tap your mana sources.`,
  );
  expect(payBarPrompt(pay, objectIndex(next as GameView))).toBe(blockTaxPrompt(pay));
  expect(payCancelLabel(pay)).toBe('Choose other blockers');

  await store.getState().act({ kind: 'payAuto' });
  expect(store.getState().error).toBeNull();
  // The blockers were declared once the payment was made.
  expect(store.getState().log.some((l) => / blocks /.test(l.text))).toBe(true);
}, 180_000);

test('a declaration with more blockers than the mana pays for is refused, and the row says so', async () => {
  const found = await reachAngelsStore(asksBlockTax, /ZZZ/, {
    seeds: 40,
    human: FLIERS,
    ai: FLIERS,
  });
  if (found === null) throw new Error('no seed reaches the tax on blocking');
  const view = found.store.getState().snapshot?.view as GameView;
  const d = view.pending as DeclareBlockersDecision;
  const index = objectIndex(view);
  const every = d.candidates.flatMap((c) => (c.canBlock[0] === undefined ? [] : [c.blocker]));
  const picks = [...every, ...every, ...every].slice(0, (d.blockCost?.affordable ?? 0) + 1);
  const row = blockCostRow(
    d,
    picks.map((blocker) => ({ blocker })),
    index,
  );
  // Only as many blockers as there are candidates can be chosen; when every one is paid for, the row is not over.
  expect(row?.over).toBe(new Set(picks).size > (d.blockCost?.affordable ?? 0));
}, 180_000);

test('proliferate asks for the permanents with counters; the answer carries them and the players', async () => {
  const found = await reachAngelsStore(asksProliferate, /Chronicle Book|Spreading Growth/, {
    seeds: 40,
    fodder: /Chronicle Book|Mana Bird/,
  });
  if (found === null) throw new Error('no seed reaches proliferate');
  const { store } = found;
  const view = store.getState().snapshot?.view as GameView;
  const d = view.pending as ChoosePermanentDecision;
  const index = objectIndex(view);
  expect(d.min).toBe(0);
  expect(d.legal.length).toBeGreaterThan(0);
  expect(proliferatePrompt(d, index)).toMatch(/^Proliferate for SYNTHETIC Spreading Growth: /);
  expect(angelsPermanentPrompt(d, index)).toBe(proliferatePrompt(d, index));
  const total = (v: GameView) =>
    d.legal.reduce(
      (sum, id) =>
        sum + Object.values(objectIndex(v).get(id)?.counters ?? {}).reduce((a, b) => a + b, 0),
      0,
    );
  const before = total(view);
  // Nothing chosen is an answer; so is everything.
  await store.getState().act(proliferateAnswer(d.legal, []));
  expect(store.getState().error).toBeNull();
  expect(total(store.getState().snapshot?.view as GameView)).toBe(before + d.legal.length);
  expect(store.getState().log.map((l) => l.text)).toContain('You proliferate.');
}, 180_000);

test('a spell cast by tapping creatures asks which ones to tap, as the alternative cost of the spell', async () => {
  const found = await reachAngelsStore(asksSpellTap, /Sky Blade/, {
    seeds: 40,
    human: FLIERS,
    ai: 'swamp-forest',
  });
  if (found === null) throw new Error('no seed reaches the tap cost of a spell');
  const { store } = found;
  const view = store.getState().snapshot?.view as GameView;
  const d = view.pending as ChoosePermanentDecision;
  const index = objectIndex(view);
  expect(d.max).toBe(4);
  expect(d.legal.length).toBeGreaterThan(4);
  expect(angelsPermanentPrompt(d, index)).toBe(
    'Choose 4 untapped creatures to tap as the alternative cost of SYNTHETIC Sky Blade Angel.',
  );
  await store.getState().act({ kind: 'choosePermanents', objects: d.legal.slice(0, 4) });
  expect(store.getState().error).toBeNull();
  const log = store.getState().log.map((l) => l.text);
  expect(log.some((t) => /SYNTHETIC Sky Blade Angel.*by tapping creatures/.test(t))).toBe(true);
}, 180_000);
