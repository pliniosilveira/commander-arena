// The Riders of Rohan deck, group B: the REAL Oracle text of Gilraen, Dúnedain Protector (the corpus's golden.jsonl) goes through the grammar as a card with no override, is defined in an engine
// scenario and is played through applyAction. Every test runs with three seats: the card comes back under its OWNER's control, which is not always the player who activated the ability.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const BEARS = 'Grizzly Bears';
const FILLER = Array.from({ length: 14 }, () => 'Island');
const GILRAEN = real('Gilraen, Dúnedain Protector');

function board(stolen = false) {
  const b = scenario({ seats: 3 });
  b.define(GILRAEN);
  for (let seat = 0; seat < 3; seat += 1) b.seat(seat).library(...FILLER);
  b.seat(0)
    .battlefield(GILRAEN.name)
    .battlefield('Island', { count: 2 })
    .battlefield(BEARS, { label: 'ally', tapped: true, counters: { '+1/+1': 1 } });
  if (stolen) {
    // A creature owned by seat 1 that seat 0 controls: it comes back under its owner's control (CR 110.2, 108.3).
    b.seat(1).battlefield(BEARS, { label: 'loan', controller: 0 });
  }
  b.seat(2).battlefield(BEARS, { label: 'other' });
  return b.at('precombatMain', { active: 0, turn: 4 }).build();
}

const view = (g: ReturnType<typeof board>, name: string, seat: number) =>
  g.view(0).battlefield.filter((o) => o.name === name && o.controller === seat);

describe('Gilraen, Dúnedain Protector (CR 608.2c, 603.7c, 400.7, 122.6, 110.2)', () => {
  test('accepting the offer brings the card back at once, as a new object with no counters', () => {
    const g = board();
    g.act(0).activate(GILRAEN.name, { targets: ['ally'], pay: true });
    g.passAll();
    g.act(0).accept();
    expect(view(g, BEARS, 0)).toHaveLength(1);
    g.expect.tapped({ name: BEARS, zone: 'battlefield', seat: 0 }, false);
    expect(view(g, BEARS, 0)[0]?.counters ?? {}).toEqual({});
    g.advanceTo('end');
    expect(view(g, BEARS, 0)).toHaveLength(1);
    expect(view(g, BEARS, 0)[0]?.keywords ?? []).not.toContain('lifelink');
  });

  test('declining leaves it exiled until the next end step, then it returns with a vigilance and a lifelink counter', () => {
    const g = board();
    g.act(0).activate(GILRAEN.name, { targets: ['ally'], pay: true });
    g.passAll();
    g.act(0).decline();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    expect(view(g, BEARS, 0)).toHaveLength(0);
    g.advanceTo('end');
    g.passAll();
    const back = view(g, BEARS, 0);
    expect(back).toHaveLength(1);
    expect(back[0]?.counters).toMatchObject({ vigilance: 1, lifelink: 1 });
    expect(back[0]?.keywords).toEqual(expect.arrayContaining(['vigilance', 'lifelink']));
  });

  test('a creature you control but another player owns comes back under its owner control, accepted or not', () => {
    for (const accept of [true, false]) {
      const g = board(true);
      g.act(0).activate(GILRAEN.name, { targets: ['loan'], pay: true });
      g.passAll();
      if (accept) g.act(0).accept();
      else g.act(0).decline();
      if (!accept) {
        g.advanceTo('end');
        g.passAll();
      }
      expect(view(g, BEARS, 1)).toHaveLength(1);
      expect(view(g, BEARS, 0)).toHaveLength(1);
    }
  });

  test('another creature: Gilraen cannot target herself, nor a creature an opponent controls', () => {
    const g = board();
    g.act(0).activate(GILRAEN.name);
    expect(() => g.act(0).chooseTargets(GILRAEN.name)).toThrow();
    expect(() => g.act(0).chooseTargets('other')).toThrow();
  });
});
