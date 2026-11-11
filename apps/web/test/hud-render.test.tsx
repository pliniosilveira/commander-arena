/**
 * Playtest issue 34: the monarch and the commander damage taken are in the HUD where they are seen,
 * not only in a corner the action bar covers. Rendered from a view with the fields set.
 */
import type { GameView } from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { GameHost } from '../src/game/host';
import { createAppStore } from '../src/store';
import { Board } from '../src/ui/board/Board';
import { commanderDamageTitle } from '../src/ui/board/PlayerStrip';
import { TurnTracker } from '../src/ui/panels/TurnTracker';
import { StoreProvider } from '../src/ui/store-context';

async function gameWith(change: (view: GameView) => GameView) {
  const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
  await store.getState().startGame({ seed: 7, humanDeck: 'white-knights', aiDeck: 'swamp-forest' });
  const snap = store.getState().snapshot;
  if (snap === null) throw new Error('no game');
  store.setState({ snapshot: { ...snap, view: change(snap.view) } });
  return store;
}

const render = (store: Awaited<ReturnType<typeof gameWith>>, node: React.ReactNode) =>
  renderToStaticMarkup(
    <StoreProvider store={{ ...store, getInitialState: store.getState }}>{node}</StoreProvider>,
  );

test('the top bar names the monarch, for you and for the opponent, and says nothing without one', async () => {
  const none = await gameWith((v) => ({ ...v, monarch: null }));
  expect(render(none, <TurnTracker />)).not.toContain('data-monarch-hud');
  const me = await gameWith((v) => ({ ...v, monarch: v.viewer }));
  const mine = render(me, <TurnTracker />);
  expect(mine).toContain('data-monarch-hud="0"');
  expect(mine).toContain('You are the monarch');
  const them = await gameWith((v) => ({ ...v, monarch: 1 }));
  expect(render(them, <TurnTracker />)).toContain('Opponent is the monarch');
});

test('commander damage taken shows beside the life total as damage out of 21, named when it is clear', async () => {
  const store = await gameWith((v) => {
    const commander = v.seats[1]?.command[0];
    if (commander === undefined) throw new Error('the opponent has a commander');
    return { ...v, commanderDamage: { '0:card1': 7 } };
  });
  const html = render(store, <Board />);
  expect(html.match(/data-cmdr-damage="7"/g)).toHaveLength(1);
  expect(html).toContain('Cmdr 7/21');
  // Only the player who took it has the chip.
  const mine = html.slice(html.indexOf('board-strip-me'));
  expect(mine).toContain('data-cmdr-damage="7"');
  expect(html.slice(0, html.indexOf('board-strip-me'))).not.toContain('data-cmdr-damage');
});

test('no chip while no commander damage was dealt', async () => {
  const store = await gameWith((v) => v);
  expect(render(store, <Board />)).not.toContain('data-cmdr-damage');
});

test('the tooltip says whose commander and the rule', () => {
  expect(commanderDamageTitle('You', 'Ghoulcaller Gisa', 7)).toBe(
    'You have taken 7 combat damage from Ghoulcaller Gisa. 21 from one commander loses the game (CR 704.6c).',
  );
  expect(commanderDamageTitle('Opponent', null, 3)).toContain('Opponent has taken 3');
});
