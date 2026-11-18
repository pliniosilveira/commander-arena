// Populate (CR 701.36, issue 160): "To populate means to choose a creature token you control and create a token that's a copy of that creature token. If you control no
// creature tokens when instructed to populate, you won't create a token."
// Pins: CR 701.36a (a creature token of yours, chosen; the new token is a copy), CR 701.36b (no creature token, no token), CR 707.2 (a copy has the copiable values), CR 111.2
// (the player who creates a token owns and controls it), CR 608.2d (the controller chooses). Cards are SYNTHETIC (src/cards/fixtures/synthetic-populate.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { twoSeatGame } from './two-seat-helpers';

const RITE = 'SYNTHETIC Rite of Populating'; // {1}{W} sorcery: populate
const SOLDIER = 'SYNTHETIC Soldier Muster'; // {W}: a 1/1 white Soldier token
const BEAST = 'SYNTHETIC Beast Muster'; // {2}{G}: a 3/3 green Beast token
const BEARS = 'Grizzly Bears';

const tokensNamed = (g: ScenarioGame, name: string, seat: 0 | 1 = 0) =>
  g.state.battlefield
    .map((id) => g.state.objects[id])
    .filter((o) => o?.token?.characteristics.name === name && o.controller === seat);

describe('the cards are valid', () => {
  test.each([RITE, SOLDIER, BEAST])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('populate (CR 701.36)', () => {
  test('with one creature token it is the one copied, with no question (CR 701.36a)', () => {
    const g = twoSeatGame((b) => b.hand(SOLDIER, RITE).battlefield('Plains', { count: 4 }));
    g.act(0).cast(SOLDIER, { pay: true });
    g.passAll();
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    expect(tokensNamed(g, 'Soldier')).toHaveLength(2);
    g.expect.invariants();
  });

  test('with no creature token nothing is created (CR 701.36b): a creature card is not copied', () => {
    const g = twoSeatGame((b) =>
      b.hand(RITE).battlefield('Plains', { count: 2 }).battlefield(BEARS),
    );
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    expect(tokensNamed(g, 'Soldier')).toHaveLength(0);
    expect(g.state.battlefield.filter((id) => g.state.objects[id]?.token != null)).toHaveLength(0);
  });

  test('with two the controller chooses which to copy, among creature tokens they control', () => {
    const g = twoSeatGame((b) =>
      b.hand(SOLDIER, BEAST, RITE).battlefield('Plains', { count: 6 }).battlefield('Forest'),
    );
    g.act(0).cast(SOLDIER, { pay: true });
    g.passAll();
    g.act(0).cast(BEAST, { pay: true });
    g.passAll();
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected a choice');
    expect(d.purpose).toBe('populate');
    expect(d.min).toBe(1);
    expect(d.max).toBe(1);
    expect(d.legal).toHaveLength(2);
    const beast = tokensNamed(g, 'Beast')[0];
    if (beast === undefined) throw new Error('no Beast');
    g.act(0).choosePermanents(beast.id);
    expect(tokensNamed(g, 'Beast')).toHaveLength(2);
    expect(tokensNamed(g, 'Soldier')).toHaveLength(1);
    g.expect.invariants();
  });
});
