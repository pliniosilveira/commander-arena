/**
 * The companion (SPEC 5.8, 10, CR 702.139) through the game host with the hidden SYNTHETIC deck `synthetic-companion` (game/precons.ts): both seats reveal a
 * companion, the viewer's view shows both (they are public), the action bar offers "Bring your companion" only when the engine offers it, the click sends the
 * special action, and afterwards the companion is shown as used and the button is gone. Auto-pass follows the policy of Foretell: the mere offer never stops it.
 */
import type { Action, GameView } from '@commander-arena/engine';
import { describe, expect, test, vi } from 'vitest';
import { BRING_COMPANION_LABEL, companionObject } from '../src/game/companion';
import { GameHost } from '../src/game/host';
import { DEFAULT_STOPS, shouldStop } from '../src/policy/should-stop';
import { findObject } from '../src/ui/board/resolve';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import { initialUi } from '../src/ui/decisions/ui-state';
import { priority, reach } from './alt-costs-decks';
import { must } from './costs-decks';
import { hostSession } from './ward-decks';

vi.setConfig({ testTimeout: 120_000 });

const DECK = 'synthetic-companion';
const canBring = (view: GameView) =>
  priority(view)?.options.some((o) => o.kind === 'bringCompanion') === true;

function barOf(view: GameView, acts: Action[] = []) {
  const pending = view.pending;
  if (pending === null) throw new Error('nothing pending');
  const ctl: Controller = {
    act: (a) => acts.push(a),
    update: () => {},
    openChooser: () => {},
  };
  return buildModel(view, pending, initialUi(null), ctl).bar;
}

describe('the companion in a game', () => {
  test('both companions are public in the view, outside the game, with a card to preview', async () => {
    const host = new GameHost({ clock: () => 0 });
    const first = (await host.newGame({ seed: 1, humanDeck: DECK, aiDeck: DECK })).snapshot;
    const view = hostSession(host, first).snapshot().view;
    expect(view.seats.map((s) => s.companion?.name)).toEqual([
      'SYNTHETIC Companion Spider',
      'SYNTHETIC Companion Spider',
    ]);
    expect(view.seats.every((s) => s.companion?.brought === false)).toBe(true);
    // The hover and the pin find the card of each seat by its own id, and no real object has it.
    const mine = companionObject(view, 0);
    const theirs = companionObject(view, 1);
    expect(mine?.name).toBe('SYNTHETIC Companion Spider');
    expect(findObject(view, mine?.id ?? 'o0')?.name).toBe('SYNTHETIC Companion Spider');
    expect(theirs?.id).not.toBe(mine?.id);
    // A game of a deck with no companion has none to show.
    const none = await reach('swamp-forest', () => true, 1);
    expect(companionObject(none.session.snapshot().view, 0)).toBeNull();
  });

  test('the button appears only when the engine offers the action, sends it, and is gone after', async () => {
    const { session } = await reach(
      DECK,
      (view) => canBring(view) && view.step === 'precombatMain',
      60,
    );
    const before = session.snapshot().view;
    const acts: Action[] = [];
    const bring = barOf(before, acts).buttons.find((b) => b.key === 'bringCompanion');
    expect(bring?.label).toBe(BRING_COMPANION_LABEL);
    expect(bring?.variant).toBe('secondary');
    expect(bring?.disabled).toBe(false);
    // Pass stays the primary button (Space and Enter press it).
    expect(barOf(before).buttons[0]?.variant).toBe('primary');
    bring?.run();
    expect(acts).toEqual([{ kind: 'bringCompanion' }]);

    const snap = await must(session, { kind: 'bringCompanion' });
    const after = snap.view;
    expect(after.seats[0]?.companion?.brought).toBe(true);
    expect(after.seats[1]?.companion).toBeUndefined();
    expect(session.log().some((l) => l.text.includes('companion SYNTHETIC Companion Spider'))).toBe(
      true,
    );
    // Once per game: the engine no longer offers it, so there is no button.
    expect(canBring(after)).toBe(false);
    expect(barOf(after).buttons.some((b) => b.key === 'bringCompanion')).toBe(false);
  });

  test('no button when the engine does not offer it (an opponent turn, nothing to pay)', async () => {
    const { session } = await reach(DECK, (view) => view.activeSeat === 0, 1);
    const view = session.snapshot().view;
    expect(canBring(view)).toBe(false);
    expect(barOf(view).buttons.some((b) => b.key === 'bringCompanion')).toBe(false);
  });

  test('the offer alone does not stop auto-pass, like Foretell; the normal stops still do', async () => {
    const { session } = await reach(DECK, canBring, 60);
    const view = session.snapshot().view;
    const decision = priority(view);
    if (decision === null) throw new Error('no priority');
    const noStops = { ...DEFAULT_STOPS, myTurnStops: [], opponentTurnStops: [] };
    // The same view with the offer, with Foretell in its place, and with neither: all pass through.
    const withOption = (kind: 'bringCompanion' | 'pass') =>
      ({
        ...view,
        pending: {
          ...decision,
          options: [{ kind: 'pass' }, ...(kind === 'pass' ? [] : [{ kind }])],
        },
      }) as GameView;
    expect(shouldStop(withOption('bringCompanion'), noStops)).toBe(false);
    expect(shouldStop(withOption('pass'), noStops)).toBe(false);
    // The default stop of the player's own main phase is the one that gives them the window.
    expect(shouldStop(withOption('bringCompanion'), DEFAULT_STOPS)).toBe(
      view.step === 'precombatMain' || view.step === 'postcombatMain',
    );
  });
});
