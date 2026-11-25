// "Each opponent can't draw more than one card each turn" (Narset, Parter of Veils): the static `drawLimit`.
// Pins: CR 121.2b (applies to individual card draws: an instruction to draw several draws up to the limit), CR 604.1, CR 121.1 (a draw that does not happen is no card drawn: no event),
// CR 613.1f (lost with "loses all abilities"). Cards are SYNTHETIC, defined here, and the table has three seats.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const WARDEN = singleFace({
  name: 'SYNTHETIC Draw Warden',
  manaCost: ['1', 'U'],
  types: ['artifact'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: "Each opponent can't draw more than one card each turn.",
  abilities: [{ kind: 'static', static: { kind: 'drawLimit', who: 'opponents', max: 1 } }],
});
const SCRIBE = singleFace({
  name: 'SYNTHETIC Draw Three',
  manaCost: ['1'],
  types: ['sorcery'],
  colors: [],
  colorIdentity: [],
  oracleText: 'Target player draws three cards.',
  spell: {
    targets: [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
    effect: { kind: 'draw', player: { kind: 'target', id: 't1' }, count: 3 },
  },
});
const LIBRARY = Array.from({ length: 12 }, () => 'Island');

describe('drawLimit', () => {
  test('the card is valid', () => {
    expect(validateCard(WARDEN)).toEqual([]);
  });

  test('an opponent told to draw three cards draws one; the controller and the other opponent are limited the same way', () => {
    const g = scenario({ seats: 3 })
      .define(WARDEN)
      .define(SCRIBE)
      .seat(0)
      .library(...LIBRARY)
      .hand(SCRIBE.name)
      .battlefield(WARDEN.name, 'Island')
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(SCRIBE.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.handSize(1, 1);
    g.expect.handSize(2, 0);
  });

  test('its controller draws without a limit', () => {
    const g = scenario({ seats: 3 })
      .define(WARDEN)
      .define(SCRIBE)
      .seat(0)
      .library(...LIBRARY)
      .hand(SCRIBE.name)
      .battlefield(WARDEN.name, 'Island')
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(SCRIBE.name, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.handSize(0, 3);
  });
});
