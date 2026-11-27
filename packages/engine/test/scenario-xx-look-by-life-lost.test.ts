// "At the beginning of each of your postcombat main phases, look at the top X cards of your library, where X is the total amount of life your opponents lost this turn. Exile one of those cards
// and put the rest on the bottom of your library in a random order. You may play the exiled card this turn" (Florian, Voldaren Scion; CR 401.2, 406.3, 119.3, 601.2, 305.1): `lookAtTop` by
// `opponentsLifeLostThisTurn`, one card exiled, `mayPlay`. The card is SYNTHETIC (src/cards/fixtures/synthetic-life-lost-group.ts). Pins: X is the life all the opponents lost together (with 3
// seats two opponents' losses add up), no life lost looks at no card, the card exiled may be played this turn, and the rest goes to the bottom.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const SCION = 'SYNTHETIC Patient Scion';
const DRAIN = 'SYNTHETIC Drain One';

test('the card is valid', () => {
  expect(validateCard(syntheticCard(SCION))).toEqual([]);
});

describe('"look at the top X cards ... where X is the total amount of life your opponents lost this turn"', () => {
  const build = (seats: 2 | 3 = 2, drains = 0) => {
    let b = scenario({ seats })
      .seat(0)
      .library('Forest', 'Mountain', 'Island', 'Plains', 'Swamp')
      .hand(...Array.from({ length: drains }, () => DRAIN))
      .battlefield(SCION, 'Swamp', 'Swamp', 'Swamp');
    for (let s = 1; s < seats; s++) b = b.seat(s).library('Plains', 'Plains');
    return b.at('precombatMain', { active: 0 }).build();
  };

  test('no life lost: no card is looked at', () => {
    const g = build();
    g.advanceTo('postcombatMain');
    g.passAll();
    g.expect.zone('Forest', 'library', { seat: 0 });
    expect(g.state.pending?.kind).not.toBe('chooseCards');
  });

  test('two life lost: two cards are looked at and one exiled and playable this turn', () => {
    const g = build(2, 2);
    g.act(0).cast(`${DRAIN}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.act(0).cast(`${DRAIN}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.advanceTo('postcombatMain');
    g.passAll();
    g.act(0).chooseCards({ name: 'Mountain', zone: 'library', seat: 0 });
    g.expect.zone('Mountain', 'exile', { seat: 0 });
    g.expect.legal(0, { playLand: { name: 'Mountain', zone: 'exile', seat: 0 } });
  });

  test('with 3 seats the losses of both opponents add up', () => {
    const g = build(3, 2);
    g.act(0).cast(`${DRAIN}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.act(0).cast(`${DRAIN}[0]`, { targets: [{ player: 2 }], pay: true });
    g.passAll();
    g.advanceTo('postcombatMain');
    g.passAll();
    // X is 2: the top two cards are looked at, Forest and Mountain.
    g.act(0).chooseCards({ name: 'Forest', zone: 'library', seat: 0 });
    g.expect.zone('Forest', 'exile', { seat: 0 });
    g.expect.zone('Mountain', 'library', { seat: 0 });
  });
});
