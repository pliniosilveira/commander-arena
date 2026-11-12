/**
 * Manifest through the game host with the hidden SYNTHETIC deck `synthetic-manifest` (game/precons.ts: invented engine fixtures, not real cards), the AI playing it: the human's
 * view of the AI's face-down permanents is a labelled 2/2 with nothing of the card, the log words a manifest without naming a card, and what the log links to is face-down in the
 * human's view. The cards themselves are tested in the engine and the soak; this checks what reaches the page.
 */
import { describe, expect, test, vi } from 'vitest';
import { GameHost } from '../src/game/host';
import { landBot } from './alt-costs-decks';
import { hostSession } from './ward-decks';

vi.setConfig({ testTimeout: 120_000 });

describe('the AI manifests in a game with the page', () => {
  test('the human sees labelled 2/2 cards, and the log names none of them', async () => {
    let seen = 0;
    let lineSeen = false;
    for (let seed = 1; seed <= 12 && !(seen > 0 && lineSeen); seed += 1) {
      const host = new GameHost({ clock: () => 0 });
      const first = (
        await host.newGame({ seed, humanDeck: 'swamp-forest', aiDeck: 'synthetic-manifest' })
      ).snapshot;
      const session = hostSession(host, first);
      for (let clicks = 0; clicks < 900; clicks += 1) {
        const view = session.snapshot().view;
        if (view.result !== null || view.pending === null) break;
        if ((await session.act(landBot(view))) === null) break;
        const now = session.snapshot().view;
        for (const o of now.battlefield) {
          if (o.faceDown !== true || o.controller === now.viewer) continue;
          seen += 1;
          expect(o.name).toMatch(/^Face-down creature \d+$/);
          expect(o.hiddenFace).toBeUndefined();
          expect(o.oracleText).toBe('');
          expect(o.types).toEqual(['creature']);
          expect([o.power, o.toughness]).toEqual([2, 2]);
        }
      }
      const texts = session.log().map((l) => l.text);
      if (texts.some((t) => t === 'Opponent manifests the top card of their library.')) {
        lineSeen = true;
      }
      // A manifest is never logged as a card entering from the library.
      expect(texts.filter((t) => /library to battlefield/.test(t))).toEqual([]);
      // What the log links to for a manifest is a face-down permanent in the human's view (or it has left since).
      const view = session.snapshot().view;
      for (const entry of session.log()) {
        if (!/manifests the top card/.test(entry.text)) continue;
        for (const id of entry.objects) {
          const o = view.battlefield.find((x) => x.id === id);
          if (o !== undefined && o.faceDown === true) expect(o.name).toMatch(/^Face-down creature/);
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
    expect(lineSeen).toBe(true);
  });
});
