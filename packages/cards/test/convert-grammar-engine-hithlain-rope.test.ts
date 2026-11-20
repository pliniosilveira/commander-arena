// Food and Fellowship deck (issue 149), Hithlain Rope: "This artifact can't be sacrificed.", and two abilities that end "The player to your right gains control of this artifact."
// Pins: CR 701.21a and 101.2 (a "can't" effect: no sacrifice, a cost that sacrifices it can't be paid), CR 613.1b and 611.2a (a control-changing effect with no duration
// lasts until the game ends or something else changes control), CR 701.23a (search, then shuffle), CR 121.1 (draw). With two players the player to your right is the opponent.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';
import { parsed } from './convert-grammar-helpers';

const ROPE = real('Hithlain Rope');
const OUTLET = parsed(
  'SYNTHETIC Artifact Outlet',
  'Artifact',
  'Sacrifice an artifact: You gain 2 life.',
  {
    manaCost: '{1}',
  },
);
const TRINKET = parsed('SYNTHETIC Trinket', 'Artifact', '', { manaCost: '{1}' });

describe('Hithlain Rope', () => {
  test('the abilities are the static one and two that hand the Rope over', () => {
    const face = ROPE.faces[0];
    expect(face?.abilities.map((a) => a.kind)).toEqual(['static', 'activated', 'activated']);
    const handOver = { kind: 'gainControl', player: { kind: 'playerToYourRight' } };
    for (const ability of face?.abilities.slice(1) ?? []) {
      if (ability.kind !== 'activated' || ability.effect.kind !== 'sequence') throw new Error('x');
      expect(ability.effect.effects[1]).toMatchObject(handOver);
    }
  });

  test('{1}, {T}: a basic land is fetched onto the battlefield tapped, the library is shuffled and the opponent takes the Rope', () => {
    const g = scenario()
      .define(ROPE)
      .seat(0)
      .battlefield(ROPE.name, 'Forest')
      .library('Island', 'Plains')
      .seat(1)
      .library('Forest')
      .build();
    g.act(0).activate(ROPE.name, { ability: 1, pay: true });
    g.passAll();
    g.act(0).chooseCards('Island');
    g.passAll();
    g.expect.zone('Island', 'battlefield', { seat: 0 });
    g.expect.tapped('Island', true);
    g.expect.zone(ROPE.name, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('{2}, {T}: a card is drawn and the opponent takes the Rope', () => {
    const g = scenario()
      .define(ROPE)
      .seat(0)
      .battlefield(ROPE.name, 'Forest', 'Forest')
      .library('Island')
      .seat(1)
      .library('Forest')
      .build();
    g.act(0).activate(ROPE.name, { ability: 2, pay: true });
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.zone(ROPE.name, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('"Sacrifice an artifact" is paid by the other artifact: the Rope is not offered', () => {
    const g = scenario().define(ROPE).define(OUTLET).seat(0).battlefield(ROPE.name, OUTLET.name);
    const game = g.seat(1).build();
    // The Outlet is the only artifact that can be sacrificed, so it is chosen without a question.
    expect(
      game.legalActions(0).some((a) => a.kind === 'activate' && a.object === game.id(OUTLET.name)),
    ).toBe(true);
    game.act(0).activate(OUTLET.name);
    game.expect.zone(OUTLET.name, 'graveyard', { seat: 0 });
    game.expect.zone(ROPE.name, 'battlefield', { seat: 0 });
  });

  test('with another artifact present the Rope is never the one sacrificed', () => {
    const game = scenario()
      .define(ROPE)
      .define(OUTLET)
      .define(TRINKET)
      .seat(0)
      .battlefield(ROPE.name, OUTLET.name, TRINKET.name)
      .seat(1)
      .build();
    game.act(0).activate(OUTLET.name);
    const d = game.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected a permanent choice');
    expect(d.legal).toHaveLength(2);
    expect(d.legal).not.toContain(game.id(ROPE.name));
  });
});
