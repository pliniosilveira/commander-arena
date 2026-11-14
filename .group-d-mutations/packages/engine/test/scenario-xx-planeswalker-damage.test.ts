// Damage to a planeswalker, and the target "player or planeswalker" (D-200). Pins: CR 115.1 (a target may be a player or a planeswalker),
// CR 120.3c (damage to a planeswalker removes that many loyalty counters, whatever the source), CR 120.3 (a creature that is also a
// planeswalker takes both), CR 702.15b (lifelink), CR 704.5i (0 loyalty), CR 615.1 and 616.1 (prevention shields apply to a planeswalker, and
// its controller orders the effects), CR 614.9 (redirection), CR 306.7 (no redirection from a player to a planeswalker: that rule is gone).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-planeswalkers.ts, synthetic-damage-order.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { chooseOptionDecision } from './pending-helpers';

const BURN = 'SYNTHETIC Walker Burn';
const WALKER = 'SYNTHETIC Vanilla Planeswalker';
const LOYAL = 'SYNTHETIC Loyalty Walker';
const ANIMATE = 'SYNTHETIC Animate Walker';
const BOLT = 'Lightning Bolt';
const LIFEBOLT = 'SYNTHETIC Lifelink Bolt';
const BLAST = 'SYNTHETIC Order Blast';
const SHIELD2 = 'SYNTHETIC Shield Two';
const SHIELD3 = 'SYNTHETIC Shield Three';
const TOISE = 'SYNTHETIC Ancient Adamantoise';
const INFECT = 'SYNTHETIC Infect Bear';
const BEARS = 'Grizzly Bears';
const V33 = 'SYNTHETIC Vanilla 3/3';

describe('"target player or planeswalker and each creature that player or that planeswalker\'s controller controls" (CR 115.1)', () => {
  const table = () =>
    scenario()
      .seat(0)
      .battlefield('Mountain', 'Mountain', 'Mountain', V33)
      .hand(BURN)
      .seat(1)
      .battlefield(WALKER, BEARS, 'SYNTHETIC Vanilla 5/5');

  test('aimed at a player: the player and their creatures are dealt the damage', () => {
    const g = table().build();
    g.act(0).cast(BURN, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 37);
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.damage('SYNTHETIC Vanilla 5/5', 3);
    g.expect.counters(WALKER, { loyalty: 4 });
    g.expect.damage(V33, 0);
  });

  test('aimed at a planeswalker: it loses loyalty, and the creatures of its controller are dealt the damage, not the player', () => {
    const g = table().build();
    g.act(0).cast(BURN, { targets: [WALKER], pay: true });
    g.passAll();
    g.expect.counters(WALKER, { loyalty: 1 });
    g.expect.life(1, 40);
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.damage('SYNTHETIC Vanilla 5/5', 3);
    g.expect.damage(V33, 0);
  });

  test('the legal targets are the players and the planeswalkers, not creatures', () => {
    const g = table().build();
    g.act(0).cast(BURN, { pay: false });
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error('expected targets');
    const legal = d.specs[0]?.legal ?? [];
    expect(
      legal.filter((t) => t.kind === 'player').map((t) => (t.kind === 'player' ? t.seat : -1)),
    ).toEqual([0, 1]);
    expect(legal.filter((t) => t.kind === 'object')).toHaveLength(1);
    const creature = g.id(BEARS);
    expect(legal.some((t) => t.kind === 'object' && t.id === creature)).toBe(false);
  });

  test('your own planeswalker is a legal target of "any" (CR 115.1), and the creatures hit are its controller\'s', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Mountain', 'Mountain', 'Mountain', LOYAL, BEARS)
      .hand(BURN)
      .seat(1)
      .battlefield(V33)
      .build();
    g.act(0).cast(BURN, { targets: [LOYAL], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.damage(V33, 0);
    g.expect.counters(LOYAL, { loyalty: 1 });
  });
});

describe('damage that is not combat damage to a planeswalker (CR 120.3c)', () => {
  test('a source with lifelink: the loyalty is removed and the controller gains the life', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Mountain')
      .hand(LIFEBOLT)
      .seat(1)
      .battlefield(WALKER)
      .build();
    g.act(0).cast(LIFEBOLT, { targets: [WALKER], pay: true });
    g.passAll();
    g.expect.counters(WALKER, { loyalty: 1 });
    g.expect.life(0, 43);
  });

  test('exactly the loyalty: it goes to the graveyard (CR 704.5i); more is lost', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .hand(BLAST)
      .seat(1)
      .battlefield(WALKER)
      .build();
    g.act(0).cast(BLAST, { targets: [WALKER], pay: true });
    g.passAll();
    g.expect.zone(WALKER, 'graveyard', { seat: 1 });
    g.expect.life(1, 40);
  });

  test('an infect creature in combat: loyalty counters are removed, no -1/-1 counters, no poison (CR 120.3c)', () => {
    const g = scenario()
      .seat(0)
      .library('Island', { count: 4 })
      .battlefield(INFECT)
      .seat(1)
      .library('Island', { count: 4 })
      .battlefield(WALKER)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([{ attacker: INFECT, target: WALKER }]);
    g.advanceTo('combatDamage');
    const power = g.view(0).battlefield.find((o) => o.name === INFECT)?.power ?? 0;
    g.expect.counters(WALKER, { loyalty: 4 - power });
    expect(g.view(1).seats[1]?.poison).toBe(0);
  });

  test('a creature that is also a planeswalker takes marked damage and loses loyalty (CR 120.3)', () => {
    const g = scenario().seat(0).battlefield('Mountain', ANIMATE).hand(BOLT).build();
    g.act(0).activate(ANIMATE, { ability: 0 });
    g.passAll();
    g.expect.counters(ANIMATE, { loyalty: 5 });
    g.act(0).cast(BOLT, { targets: [ANIMATE], pay: true });
    g.passAll();
    g.expect.counters(ANIMATE, { loyalty: 2 });
    g.expect.damage(ANIMATE, 3);
  });

  test('lethal damage and 0 loyalty at once put it into the graveyard once (CR 704.3, 704.5g, 704.5i)', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Mountain', 'Mountain', ANIMATE)
      .hand(BOLT, BOLT)
      .build();
    g.act(0).activate(ANIMATE, { ability: 0 });
    g.passAll();
    g.act(0).cast('Lightning Bolt[1]', { targets: [ANIMATE], pay: true });
    g.passAll();
    g.act(0).cast(BOLT, { targets: [ANIMATE], pay: true });
    g.passAll();
    g.expect.zone(ANIMATE, 'graveyard', { seat: 0 });
  });
});

describe('prevention and redirection with a planeswalker as the recipient (CR 615, 614.9, 616.1)', () => {
  test('a shield "prevent the next 2 damage to any target" on a planeswalker', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Plains')
      .hand(BLAST, SHIELD2)
      .seat(1)
      .battlefield(WALKER)
      .build();
    g.act(0).cast(SHIELD2, { targets: [WALKER], pay: true });
    g.passAll();
    g.act(0).cast(BLAST, { targets: [WALKER], pay: true });
    g.passAll();
    g.expect.zone(WALKER, 'graveyard', { seat: 1 });
    const g2 = scenario()
      .seat(0)
      .battlefield('Mountain', 'Plains')
      .hand(BOLT, SHIELD2)
      .seat(1)
      .battlefield(WALKER)
      .build();
    g2.act(0).cast(SHIELD2, { targets: [WALKER], pay: true });
    g2.passAll();
    g2.act(0).cast(BOLT, { targets: [WALKER], pay: true });
    g2.passAll();
    g2.expect.counters(WALKER, { loyalty: 3 });
  });

  test('a shield and an Adamantoise: the controller of the planeswalker orders them', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Mountain', 'Plains')
      .hand(BOLT, SHIELD3)
      .seat(1)
      .battlefield(TOISE, WALKER)
      .build();
    g.act(0).cast(SHIELD3, { targets: [WALKER], pay: true });
    g.passAll();
    g.act(0).cast(BOLT, { targets: [WALKER], pay: true });
    g.passAll();
    const d = chooseOptionDecision(g);
    expect(d.seat).toBe(1);
    expect(d.replacement?.choices.map((c) => c.kind)).toEqual(['prevent', 'redirect']);
    // The shield first: prevented, nothing else happens.
    g.act(1).chooseOption(d.options[0] ?? '');
    g.expect.counters(WALKER, { loyalty: 4 });
    g.expect.damage(TOISE, 0);
  });

  test('the redirection first: the Adamantoise is dealt the damage and the shield is kept', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Mountain', 'Plains')
      .hand(BOLT, SHIELD3)
      .seat(1)
      .battlefield(TOISE, WALKER)
      .build();
    g.act(0).cast(SHIELD3, { targets: [WALKER], pay: true });
    g.passAll();
    g.act(0).cast(BOLT, { targets: [WALKER], pay: true });
    g.passAll();
    const d = chooseOptionDecision(g);
    g.act(1).chooseOption(d.options[1] ?? '');
    g.expect.counters(WALKER, { loyalty: 4 });
    g.expect.damage(TOISE, 3);
  });
});
