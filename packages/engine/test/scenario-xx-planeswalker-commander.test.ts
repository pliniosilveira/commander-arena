// A planeswalker as a commander (CR 903, D-200). Pins: CR 903.3 and 113.6n (a card that says it can be your commander), 903.6 and 903.8 (cast from the
// command zone, with the tax of every earlier cast), 306.5b (it enters with its loyalty counters each time), 903.9a and 903.9b (it may go back to the
// command zone), 903.10a (commander damage is combat damage dealt by a commander: a planeswalker commander deals combat damage only as a creature), 704.5i
// (0 loyalty). The card is SYNTHETIC (src/cards/fixtures/synthetic-planeswalkers.ts): the wording "~ can be your commander." is read from the owner's golden
// corpus (Teferi, Temporal Archmage; Nahiri, the Lithomancer; Lord Windgrace).
import { describe, expect, test } from 'vitest';
import { getLegalActions, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const CMD = 'SYNTHETIC Walker Commander';

const table = (casts = 0) =>
  scenario()
    .seat(0)
    .library('Forest', { count: 6 })
    .commander(CMD, { casts, label: 'cmd' })
    .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest')
    .seat(1)
    .library('Island', { count: 6 });

describe('casting a planeswalker commander from the command zone', () => {
  test('is offered, costs its mana cost, and it enters with its loyalty and its abilities', () => {
    const g = table().build();
    expect(getLegalActions(g.state, 0).some((a) => a.kind === 'castSpell')).toBe(true);
    g.act(0).cast(CMD, { pay: true });
    g.passAll();
    g.expect.zone(CMD, 'battlefield', { seat: 0 });
    g.expect.counters(CMD, { loyalty: 4 });
    g.act(0).activate(CMD, { ability: 0 });
    g.passAll();
    g.expect.life(0, 41);
  });

  test('the second cast costs {2} more (CR 903.8), and a command zone that also holds an emblem is no problem', () => {
    const g = table(1).build();
    // {2}{G}{G} plus the tax of one earlier cast: six mana, which the table has.
    g.act(0).cast(CMD, { pay: true });
    g.passAll();
    g.expect.zone(CMD, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('with too little mana for the tax it is not offered', () => {
    const g = scenario()
      .seat(0)
      .library('Forest', { count: 6 })
      .commander(CMD, { casts: 2 })
      .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .build();
    g.expect.illegal(0, { cast: CMD });
  });
});

describe('a planeswalker commander that leaves the battlefield (CR 903.9a)', () => {
  test('at 0 loyalty it goes to the graveyard and its owner may put it into the command zone', () => {
    const g = scenario()
      .seat(0)
      .library('Forest', { count: 6 })
      .battlefield(CMD, { commander: true, counters: { loyalty: 1 } })
      .seat(1)
      .library('Island', { count: 6 })
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    g.act(1).cast('Lightning Bolt', { targets: [CMD], pay: true });
    g.passAll();
    g.expect.pending('commanderZone', 0);
    g.act(0).sendToCommandZone();
    g.expect.zone(CMD, 'command', { seat: 0 });
  });
});

describe('commander damage from a planeswalker commander (CR 903.10a)', () => {
  test('it deals commander damage only as a creature, in combat', () => {
    const g = scenario()
      .seat(0)
      .library('Forest', { count: 6 })
      .battlefield(CMD, { commander: true })
      .seat(1)
      .library('Island', { count: 6 })
      .build();
    g.act(0).activate(CMD, { ability: 1 });
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([{ attacker: CMD }]);
    g.advanceTo('combatDamage');
    g.expect.life(1, 34);
    g.expect.commanderDamage(1, CMD, 6);
  });
});

describe('the card is executable', () => {
  test('it validates, with canBeCommander among its abilities', () => {
    const card = syntheticCard(CMD);
    expect(validateCard(card)).toEqual([]);
    expect(
      card.faces[0]?.abilities.some(
        (a) => a.kind === 'keyword' && a.keyword.kind === 'canBeCommander',
      ),
    ).toBe(true);
  });
});
