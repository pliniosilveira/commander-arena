// "Whenever a land you control enters, manifest dread if this is the first time this ability has resolved this turn. Otherwise, you may turn a permanent you control face up."
// Pins: CR 608.2c (the first resolution this turn manifests dread, a later one takes the otherwise), CR 608.2d (the controller chooses the permanent), CR 701.40g and 708.8 (an effect turns a
// face-down permanent face up and pays no cost), CR 603.5 ("you may": none is a legal choice). The card is SYNTHETIC (src/cards/fixtures/synthetic-manifest-b.ts).
import { describe, expect, test } from 'vitest';
import type { GameObject } from '../src/index';
import { syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { chooseCardsDecision, choosePermanentDecision } from './pending-helpers';

const UNRAVELER = 'SYNTHETIC Dread Unraveler';
const VANILLA = 'SYNTHETIC Manifest Brute'; // {3}{G} 4/4, a creature card
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

const faceDown = (g: ScenarioGame, seat?: number): GameObject[] =>
  Object.values(g.state.objects).flatMap((o) =>
    o !== undefined &&
    o.zone === 'battlefield' &&
    o.faceDown !== undefined &&
    (seat === undefined || o.controller === seat)
      ? [o]
      : [],
  );

/** Two lands in hand and an extra land drop; the first land's trigger has resolved (it manifested dread), the second land is played next. */
const afterFirstLand = (): ScenarioGame => {
  const g = scenario()
    .seat(0)
    .battlefield(UNRAVELER)
    .battlefield(VANILLA, { faceDown: true, label: 'old' })
    .hand('Forest')
    .hand('Island')
    .library('Island', { label: 'a' })
    .library('Forest', { label: 'b' })
    .library(...FILLER)
    .seat(1)
    .battlefield(VANILLA, { faceDown: true, label: 'theirs' })
    .library('Plains')
    .at('precombatMain', { active: 0, extraLandDrops: 1 })
    .build();
  g.act(0).playLand('Forest');
  g.passAll();
  expect(chooseCardsDecision(g).purpose).toBe('lookTake');
  g.act(0).chooseCards('b');
  return g;
};

describe('landfall: manifest dread the first time, turn a permanent face up after', () => {
  test('the card is valid', () => {
    expect(validateCard(syntheticCard(UNRAVELER))).toEqual([]);
  });

  test('the first land manifests dread', () => {
    const g = afterFirstLand();
    expect(faceDown(g, 0)).toHaveLength(2);
    g.expect.invariants();
  });

  test('the second land: the controller picks a face-down permanent of theirs; it is turned face up, nothing is paid', () => {
    const g = afterFirstLand();
    g.act(0).playLand('Island');
    g.passAll();
    const d = choosePermanentDecision(g);
    expect(d.min).toBe(0);
    expect(d.max).toBe(1);
    // only the controller's own face-down permanents are offered, never the opponent's
    expect(d.legal).toHaveLength(2);
    g.act(0).choosePermanents('old');
    expect(faceDown(g, 0)).toHaveLength(1);
    expect(faceDown(g, 1)).toHaveLength(1);
    g.expect.pt('old', 4, 4);
    g.expect.invariants();
  });

  test('the second land: "you may" says none, and everything stays face down', () => {
    const g = afterFirstLand();
    g.act(0).playLand('Island');
    g.passAll();
    g.act(0).choosePermanents();
    expect(faceDown(g, 0)).toHaveLength(2);
  });

  test('the second land offers only the face-down permanents there are', () => {
    const g = scenario()
      .seat(0)
      .battlefield(UNRAVELER)
      .hand('Forest')
      .hand('Island')
      .library('Island')
      .library(...FILLER)
      .seat(1)
      .library('Plains')
      .at('precombatMain', { active: 0, extraLandDrops: 1 })
      .build();
    g.act(0).playLand('Forest');
    g.passAll();
    g.act(0).chooseCards('Island');
    // the manifested creature is the only face-down permanent: the choice offers just it
    g.act(0).playLand('Island');
    g.passAll();
    expect(choosePermanentDecision(g).legal).toHaveLength(1);
  });
});
