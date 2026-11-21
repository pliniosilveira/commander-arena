// Ahoy Mateys deck, group 7 (control and "until" effects): Coercive Recruiter, Merchant Raiders, Warkite Marauder and Admiral Beckett Brass, read from their real Oracle text and run by the
// engine. Pins: CR 613.1b (a control-changing effect is layer 2), CR 611.2a and 611.2b (durations, "for as long as you control this creature"), CR 502.3 (the untap step and what
// keeps a permanent from untapping), CR 613.1f (losing all abilities, layer 6), CR 613.4b and 613.4c (base power and toughness, layer 7b, and counters, layer 7c), CR 613.1d (a creature
// type added in layer 4), CR 510.2 and 120.2a (combat damage, read from what each source was as it dealt it). The CR text was not available here: the numbers are those the engine's
// comments cite.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';
import { dropped, readAll } from './parser-p5-helpers';

const RECRUITER = real('Coercive Recruiter');
const RAIDERS = real('Merchant Raiders');
const MARAUDER = real('Warkite Marauder');
const BECKETT = real('Admiral Beckett Brass');
const BEARS = 'Grizzly Bears';
const ANGEL = 'Serra Angel';
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('Coercive Recruiter: gain control until end of turn, untap, haste, and a Pirate too', () => {
  const play = () => {
    const g = scenario()
      .define(RECRUITER)
      .seat(0)
      .library(...LIBRARY)
      .hand(RECRUITER.name)
      .battlefield('Mountain', { count: 5 })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { tapped: true })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(RECRUITER.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(BEARS);
    g.passAll();
    return g;
  };

  test('the creature is yours, untapped, with haste, and a Pirate in addition to its other types (CR 613.1b, 613.1d, 613.1f)', () => {
    const g = play();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.tapped(BEARS, false);
    g.expect.derived(BEARS, {
      subtypes: ['Bear', 'Pirate'],
      types: ['creature'],
      keywords: ['haste'],
    });
    g.expect.invariants();
  });

  test('it goes back at the end of the turn, and is no Pirate any more (CR 611.2a, 514.2)', () => {
    const g = play();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.derived(BEARS, { subtypes: ['Bear'], keywords: [] });
  });

  test('the grammar reads the whole text', () => {
    const [trigger] = readAll(
      'Whenever ~ or another Pirate you control enters, gain control of target creature until end of turn. Untap that creature. Until end of turn, it gains haste and becomes a Pirate in addition to its other types.',
      'creature',
    ).abilities;
    expect(JSON.stringify(trigger)).toContain('"kind":"gainControl"');
    expect(JSON.stringify(trigger)).toContain('"additive":true');
    expect(JSON.stringify(trigger)).toContain('"subtypes":["Pirate"]');
  });

  test.each([
    ['the type replaces', 'Until end of turn, it gains haste and becomes a Pirate.'],
    [
      'a color too',
      'Until end of turn, it gains haste and becomes a blue Pirate in addition to its other types.',
    ],
  ])('%s: not read', (_what, text) => {
    expect(
      dropped(
        `When ~ enters, gain control of target creature until end of turn. ${text}`,
        'creature',
      ),
    ).toBeDefined();
  });
});

describe('Merchant Raiders: tap, and no untapping for as long as you control it', () => {
  const play = () => {
    const g = scenario()
      .define(RAIDERS)
      .seat(0)
      .library(...LIBRARY)
      .hand(RAIDERS.name)
      .battlefield('Island', { count: 4 })
      .seat(1)
      .library(...LIBRARY)
      .hand(BOLT, BOLT)
      .battlefield('Mountain', { count: 2 })
      .battlefield(BEARS)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(RAIDERS.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(BEARS);
    g.passAll();
    return g;
  };

  test('the creature is tapped and stays tapped through its controller untap step (CR 502.3, 611.2b)', () => {
    const g = play();
    g.expect.tapped(BEARS, true);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.tapped(BEARS, true);
    g.expect.invariants();
  });

  test('it untaps once the controller of the ability no longer controls the Pirate (CR 611.2b)', () => {
    const g = play();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(1).cast({ name: BOLT, nth: 0 }, { targets: [RAIDERS.name], pay: true });
    g.passAll();
    g.act(1).cast({ name: BOLT, nth: 0 }, { targets: [RAIDERS.name], pay: true });
    g.passAll();
    g.expect.zone(RAIDERS.name, 'graveyard', { seat: 0 });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.tapped(BEARS, false);
  });

  test('the grammar reads the whole text', () => {
    const [trigger] = readAll(
      "Whenever ~ or another Pirate you control enters, tap up to one target creature. That creature doesn't untap during its controller's untap step for as long as you control ~.",
      'creature',
    ).abilities;
    expect(JSON.stringify(trigger)).toContain('"restriction":"doesntUntap"');
    expect(JSON.stringify(trigger)).toContain('"duration":"forAsLongAsYouControlThis"');
  });
});

describe('Warkite Marauder: loses all abilities and is 0/1 until end of turn', () => {
  const attack = (counters: Readonly<Record<string, number>> = {}) => {
    const g = scenario()
      .define(MARAUDER)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(MARAUDER.name)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(ANGEL, { counters })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: MARAUDER.name }]);
    g.passAll();
    return g;
  };

  test('the target has no abilities and base power and toughness 0/1 (CR 613.1f, 613.4b)', () => {
    const g = attack();
    g.expect.derived(ANGEL, { keywords: [] });
    g.expect.pt(ANGEL, 0, 1);
  });

  test('a +1/+1 counter still applies on top of the base values (CR 613.4b, 613.4c)', () => {
    const g = attack({ '+1/+1': 2 });
    g.expect.pt(ANGEL, 2, 3);
  });

  test('it is over at the end of the turn (CR 514.2)', () => {
    const g = attack();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.pt(ANGEL, 4, 4);
    g.expect.derived(ANGEL, { keywords: ['flying', 'vigilance'] });
  });

  test('the grammar reads both parts for the same target', () => {
    const [, trigger] = readAll(
      'Flying\nWhenever ~ attacks, target creature defending player controls loses all abilities and has base power and toughness 0/1 until end of turn.',
      'creature',
    ).abilities;
    const json = JSON.stringify(trigger);
    expect(json).toContain('"kind":"loseAllAbilities"');
    expect(json).toContain('"kind":"setPt"');
  });

  test('a pump instead of base values is not read as base values', () => {
    expect(
      dropped(
        'Whenever ~ attacks, target creature defending player controls loses all abilities and has base power and toughness +0/-1 until end of turn.',
        'creature',
      ),
    ).toBeDefined();
  });
});

describe('Admiral Beckett Brass: take a permanent of a player three or more Pirates dealt combat damage to', () => {
  const play = (attackers: readonly string[]) => {
    const g = scenario()
      .define(BECKETT)
      .define(RAIDERS)
      .define(RECRUITER)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BECKETT.name, RAIDERS.name, RECRUITER.name)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, 'Forest')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers(attackers.map((attacker) => ({ attacker })));
    g.advanceTo('end');
    g.passAll();
    return g;
  };

  test('the other Pirates get +1/+1 (CR 613.4c)', () => {
    const g = scenario()
      .define(BECKETT)
      .define(RAIDERS)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BECKETT.name, RAIDERS.name)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.pt(RAIDERS.name, 3, 5);
    g.expect.pt(BECKETT.name, 3, 3);
  });

  test('with three Pirates dealing combat damage, the end step takes a nonland permanent (CR 613.1b, 510.2)', () => {
    const g = play([BECKETT.name, RAIDERS.name, RECRUITER.name]);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone('Forest', 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('with two Pirates it takes nothing', () => {
    const g = play([BECKETT.name, RAIDERS.name]);
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });

  test('a creature that is no Pirate does not count', () => {
    const g = scenario()
      .define(BECKETT)
      .define(RAIDERS)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BECKETT.name, RAIDERS.name, BEARS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(ANGEL)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers(
      [BECKETT.name, RAIDERS.name, BEARS].map((attacker) => ({ attacker })),
    );
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(ANGEL, 'battlefield', { seat: 1 });
  });

  test('the grammar reads the filter of the target', () => {
    const [, trigger] = readAll(
      'Other Pirates you control get +1/+1.\nAt the beginning of your end step, gain control of target nonland permanent controlled by a player who was dealt combat damage by three or more Pirates this turn.',
      'creature',
    ).abilities;
    expect(JSON.stringify(trigger)).toContain(
      '"controllerDealtCombatDamageByAtLeast":{"atLeast":3,"subtypes":["Pirate"]}',
    );
  });

  test.each([
    ['one or more', 'one or more Pirates'],
    ['a singular type', 'three or more Pirate'],
  ])('%s: not read', (_what, words) => {
    expect(
      dropped(
        `At the beginning of your end step, gain control of target nonland permanent controlled by a player who was dealt combat damage by ${words} this turn.`,
        'creature',
      ),
    ).toBeDefined();
  });
});
