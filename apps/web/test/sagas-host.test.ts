/**
 * Sagas (CR 714) through the game host with the hidden SYNTHETIC deck `synthetic-sagas`: the view
 * fields the page reads, and the log lines of the lore counters, the chapter triggers and the
 * sacrifice. Seeds are searched, not fixed.
 */
import { expect, test, vi } from 'vitest';
import { RITE, riteChapterOnStack, sagaBot, sagaOf, searchSagas, startHost } from './sagas-decks';

// Each test searches seeds for its situation; a loaded machine needs more than 5 seconds.
vi.setConfig({ testTimeout: 30_000 });

async function reach() {
  const reached = await searchSagas(startHost, (view) => riteChapterOnStack(view));
  if (reached === null) throw new Error('no seed reaches the situation');
  return reached.session;
}

test('a Saga that just entered: one lore counter, its final chapter, chapter I on the stack', async () => {
  const session = await reach();
  const { view } = session.snapshot();
  const saga = sagaOf(view);
  expect(saga?.counters.lore).toBe(1);
  expect(saga?.finalChapter).toBe(3);
  const ability = view.stack.find((o) => o.name === RITE);
  expect(ability?.chapter).toBe(1);
  expect(ability?.abilitySource).toBe(saga?.id);
  const lines = session.log().map((l) => l.text);
  expect(lines).toContain(`A lore counter on ${RITE} (I).`);
  expect(lines).toContain(`${RITE}'s chapter I triggers.`);
});

test('on the next turns: the precombat lore counter and chapter II read as such, then III', async () => {
  const session = await reach();
  const lines = () => session.log().map((l) => l.text);
  // Until a chapter III has resolved and the Saga has gone: the sacrifice reads as any sacrifice.
  const done = () => lines().includes(`You sacrifice ${RITE}.`);
  for (let i = 0; i < 400 && !done(); i += 1) {
    const view = session.snapshot().view;
    if (view.result !== null || view.pending === null) break;
    if (view.pending.seat !== view.viewer) break;
    if ((await session.act(sagaBot(view, view.pending))) === null) break;
  }
  expect(lines()).toContain(`A lore counter on ${RITE} (II).`);
  expect(lines()).toContain(`${RITE}'s chapter II triggers.`);
  expect(lines()).toContain(`${RITE}'s chapter II ability resolves.`);
  expect(lines()).toContain(`A lore counter on ${RITE} (III).`);
  expect(lines()).toContain(`${RITE}'s chapter III triggers.`);
  expect(lines()).toContain(`${RITE}'s chapter III ability resolves.`);
  expect(lines()).toContain(`You sacrifice ${RITE}.`);
}, 60_000);
