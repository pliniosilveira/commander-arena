/**
 * "As this enters, choose a creature type / a color" (CR 614.12a, D-100) through the game host with
 * the hidden SYNTHETIC deck `synthetic-chosen`: the question, the answer, the log, the choice on
 * the permanent, no undo of it, and that the autopilot never answers it. Seeds are searched.
 */
import { describe, expect, test } from 'vitest';
import { chosenLabel } from '../src/game/chosen';
import { GameHost } from '../src/game/host';
import type { Snapshot } from '../src/game/protocol';
import { createAppStore } from '../src/store';
import { chooseAction } from './bot';
import { asksChoice, CHOSEN_DECK, chooseOptionOf, reachChosen } from './chosen-decks';
import { resolveStack } from './kicker-decks';

const texts = (snap: Snapshot) => snap.log.map((l) => l.text);

async function must(purpose: 'creatureType' | 'color', name: string) {
  const reached = await reachChosen(asksChoice(purpose, name), { seeds: 120 });
  if (reached === null) throw new Error('no seed reaches the situation');
  return reached;
}

describe('the creature type question', () => {
  test('lists every creature type, then Goblin is chosen: logged, shown on the permanent', async () => {
    const { host, snap } = await must('creatureType', 'SYNTHETIC Rally Banner');
    const pending = chooseOptionOf(snap.view);
    if (pending === null) throw new Error('wrong decision');
    expect(pending.options.length).toBeGreaterThan(300);
    expect(pending.options).toContain('Goblin');
    expect(pending.sourceOracleText).toContain('choose a creature type');
    const next = await host.act({ kind: 'chooseOption', option: 'Goblin' });
    expect(next.error).toBeNull();
    expect(texts(next)).toContain('You choose Goblin for SYNTHETIC Rally Banner.');
    const done = await resolveStack(host, next);
    const banner = done.view.battlefield.find((o) => o.name === 'SYNTHETIC Rally Banner');
    expect(banner?.chosen).toEqual({ creatureType: 'Goblin' });
    expect(banner !== undefined && chosenLabel(banner)?.title).toBe('Chosen type: Goblin');
  });

  test('an answer that is not an option is refused and the question stays', async () => {
    const { host } = await must('creatureType', 'SYNTHETIC Rally Banner');
    const bad = await host.act({ kind: 'chooseOption', option: 'Not A Type' });
    expect(bad.error).not.toBeNull();
    // The question is still pending: a real option is accepted next.
    const good = await host.act({ kind: 'chooseOption', option: 'Goblin' });
    expect(good.error).toBeNull();
  });

  test('there is nothing to cancel and nothing to undo: the answer clears the history', async () => {
    const { host } = await must('creatureType', 'SYNTHETIC Rally Banner');
    const cancel = await host.act({ kind: 'cancel' });
    expect(cancel.error).not.toBeNull();
    const answered = await host.act({ kind: 'chooseOption', option: 'Elf' });
    expect(answered.error).toBeNull();
    expect(answered.undoDepth).toBe(0);
  });
});

describe('the color question', () => {
  test('five colors; Blue is logged by name and shown on the permanent', async () => {
    const { host, snap } = await must('color', 'SYNTHETIC Hue Banner');
    const pending = chooseOptionOf(snap.view);
    expect(pending?.options).toEqual(['W', 'U', 'B', 'R', 'G']);
    const next = await host.act({ kind: 'chooseOption', option: 'U' });
    expect(next.error).toBeNull();
    expect(texts(next)).toContain('You choose Blue for SYNTHETIC Hue Banner.');
    const done = await resolveStack(host, next);
    const banner = done.view.battlefield.find((o) => o.name === 'SYNTHETIC Hue Banner');
    expect(banner?.chosen).toEqual({ color: 'U' });
    expect(banner !== undefined && chosenLabel(banner)?.short).toBe('Blue');
  });
});

test('the autopilot never answers the question for the human', async () => {
  for (let seed = 1; seed <= 120; seed += 1) {
    const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
    await store.getState().startGame({ seed, humanDeck: CHOSEN_DECK, aiDeck: 'swamp-forest' });
    for (let clicks = 0; clicks < 500; clicks += 1) {
      const view = store.getState().snapshot?.view;
      const revision = store.getState().snapshot?.revision;
      if (view === undefined || view.result !== null || view.pending === null) break;
      if (view.pending.kind === 'chooseOption') {
        // Nobody has answered: the store stopped here, is not passing and stays here.
        await new Promise((done) => setTimeout(done, 25));
        expect(store.getState().passing).toBe(false);
        expect(store.getState().snapshot?.view.pending?.kind).toBe('chooseOption');
        expect(store.getState().snapshot?.revision).toBe(revision);
        return;
      }
      const before = store.getState().snapshot?.revision;
      await store.getState().act(chooseAction(view, view.pending));
      if (store.getState().snapshot?.revision === before) break;
    }
  }
  throw new Error('no seed reaches the situation');
});
