// "Target player's life total becomes N." (CR 119.5, D-201): the player gains or loses the life that takes the life total to N, so the life
// change events and what they trigger are those of a gain or a loss; nothing happens to a player who has N already. The cards are SYNTHETIC
// (src/cards/fixtures/synthetic-planeswalkers.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const SETTER = 'SYNTHETIC Life Setter';
const RAISER = 'SYNTHETIC Life Raiser';

describe('a life total that becomes a number', () => {
  test('down: the opponent loses the difference, as a life loss event', () => {
    const g = scenario().seat(0).hand(SETTER).battlefield('Swamp').build();
    g.act(0).cast(SETTER, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 1);
    g.expect.eventLog([{ kind: 'lifeChanged', seat: 1, from: 40, to: 1 }]);
  });

  test('up: the player gains the difference', () => {
    const g = scenario().seat(0).hand(RAISER).battlefield('Plains').build();
    g.act(0).cast(RAISER, { pay: true });
    g.passAll();
    g.expect.life(0, 60);
    g.expect.eventLog([{ kind: 'lifeChanged', seat: 0, from: 40, to: 60 }]);
  });

  test('a player who has the number already gets no event', () => {
    const g = scenario().seat(0).hand(SETTER).battlefield('Swamp').seat(1).life(1).build();
    g.act(0).cast(SETTER, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 1);
    g.expect.noEvent({ kind: 'lifeChanged', seat: 1 });
  });

  test('the cards are executable, and a negative number is refused', () => {
    expect(validateCard(syntheticCard(SETTER))).toEqual([]);
    const bad = JSON.parse(JSON.stringify(syntheticCard(SETTER)));
    bad.faces[0].spell.effect.amount = -1;
    expect(
      validateCard(bad)
        .map((i) => i.message)
        .join('|'),
    ).toContain('0 or more');
  });
});
