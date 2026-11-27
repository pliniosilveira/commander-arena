// Planeswalker Party deck (issue 132), group 3: Oreskos Explorer, read from the golden corpus through the grammar with no override and played with the scenario DSL.
// Pins: CR 102.1 and 109.4 (the players who control more lands than you), CR 701.23 (search, "up to X" finds fewer), CR 608.2c (X counted as the ability resolves), CR 101.4.
// Three seats, so the count of players is a count and never a yes or no.
import { scenario } from '@commander-arena/engine/testing';
import { describe, test } from 'vitest';
import { real } from './agatha-helpers';

const EXPLORER = real('Oreskos Explorer');
const LIBRARY = Array.from({ length: 4 }, () => 'Plains');

describe('Oreskos Explorer', () => {
  const build = (lands: readonly [number, number, number]) => {
    const b = scenario({ seats: 3 }).define(EXPLORER);
    b.seat(0)
      .library(...LIBRARY)
      .hand(EXPLORER.name)
      .battlefield('Plains', 'Plains');
    for (let i = 0; i < lands[0]; i += 1) b.battlefield('Island');
    b.seat(1).library(...LIBRARY);
    for (let i = 0; i < lands[1]; i += 1) b.battlefield('Island');
    b.seat(2).library(...LIBRARY);
    for (let i = 0; i < lands[2]; i += 1) b.battlefield('Island');
    return b.at('precombatMain', { active: 0, turn: 3 }).build();
  };

  test('two players control more lands than you: up to two Plains', () => {
    const g = build([1, 6, 6]);
    g.act(0).cast(EXPLORER.name, { pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('Plains[0]', 'Plains[1]');
    g.expect.handSize(0, 2);
  });

  test('one player controls more lands than you: one Plains', () => {
    const g = build([1, 6, 0]);
    g.act(0).cast(EXPLORER.name, { pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('Plains[0]');
    g.expect.handSize(0, 1);
  });

  test('nobody controls more lands than you: none', () => {
    const g = build([6, 1, 1]);
    g.act(0).cast(EXPLORER.name, { pay: true });
    g.passAll();
    g.expect.handSize(0, 0);
  });
});
