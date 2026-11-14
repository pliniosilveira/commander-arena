// Parsed text is only worth something if the engine runs it as written (stage P18). These tests import
// SYNTHETIC cards through the grammar (never through a fixture), define them in an engine scenario and
// play them through applyAction: the trigger slice of the engine (D-108, D-111) written as Oracle text says
// it. The steps ("At the beginning of combat on your turn", "your draw step", "each opponent's upkeep",
// the main phases, "end of combat"), a card drawn ("Whenever you draw a card", "your second card each
// turn"), combat damage dealt, leaving the battlefield, the attached permanent ("equipped creature"),
// power, toughness and mana value in a filter, "unless that player pays {1}" and "its controller". Every
// card name starts with "SYNTHETIC"; the Oracle text is the real line of the shape in
// reports/template-replay.md where the replay has one (cited in each describe) and SYNTHETIC otherwise,
// with bodies that are one plain effect so that what is tested is the trigger or the filter. No real
// card's text is claimed; the real cards used as targets and blockers (Grizzly Bears, Giant Spider,
// Serra Angel, Lightning Bolt, Murder, the basic lands) are the engine's own fixtures.
import type {
  CardDefinition,
  ConfirmOptionalDecision,
  PayManaDecision,
  StepId,
} from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const enchantment = (name: string, text: string) =>
  parsed(name, 'Enchantment', text, { manaCost: '{1}{G}', colors: ['G'] });
const creature = (name: string, text: string, p: string, t: string) =>
  parsed(name, 'Creature — Bear', text, {
    manaCost: '{1}{G}',
    power: p,
    toughness: t,
    colors: ['G'],
  });
const sorcery = (name: string, text: string) =>
  parsed(name, 'Sorcery', text, { manaCost: '{1}{G}', colors: ['G'] });

const BEARS = 'Grizzly Bears'; // 2/2, {1}{G}
const SPIDER = 'Giant Spider'; // 2/4, {3}{G}
const ANGEL = 'Serra Angel'; // 4/4, {3}{W}{W}
const BOLT = 'Lightning Bolt'; // {R}
const MURDER = 'Murder';
const V22 = 'SYNTHETIC Vanilla 2/2';
const V55 = 'SYNTHETIC Vanilla 5/5';
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

/** A scenario with every card defined (the builder takes one at a time). */
function game(...cards: readonly CardDefinition[]) {
  return cards.reduce((builder, card) => builder.define(card), scenario());
}

const life = (g: ScenarioGame, seat: 0 | 1) => g.state.seats[seat]?.life ?? 0;

describe('the beginning of a step or phase (CR 500.2, 603.2b; replay: 4 cards "At the beginning of combat on your turn, put a +1/+1 counter on target creature you control", "your draw step" and "each opponent\'s upkeep" lines)', () => {
  const STEP_ID: Record<string, StepId> = {
    upkeep: 'upkeep',
    draw: 'draw',
    main1: 'precombatMain',
    beginCombat: 'beginningOfCombat',
    combatEnd: 'endOfCombat',
    main2: 'postcombatMain',
    endStep: 'end',
  };

  // [oracle words, step, whose]: the watcher gains 1 life when its step begins.
  const CASES = [
    ['At the beginning of combat on your turn', 'beginCombat', 'you'],
    ['At the beginning of each combat', 'beginCombat', 'each'],
    ['At the beginning of your draw step', 'draw', 'you'],
    ['At the beginning of each draw step', 'draw', 'each'],
    ["At the beginning of each opponent's draw step", 'draw', 'opponent'],
    ["At the beginning of each opponent's upkeep", 'upkeep', 'opponent'],
    ["At the beginning of each player's upkeep", 'upkeep', 'each'],
    ["At the beginning of each opponent's end step", 'endStep', 'opponent'],
    ['At the beginning of your precombat main phase', 'main1', 'you'],
    ['At the beginning of your first main phase', 'main1', 'you'],
    ['At the beginning of your postcombat main phase', 'main2', 'you'],
    ['At the beginning of your second main phase', 'main2', 'you'],
    ['At the beginning of the end of combat step', 'combatEnd', 'each'],
    ['At end of combat', 'combatEnd', 'each'],
    ['At end of combat on your turn', 'combatEnd', 'you'],
    ['At the beginning of your upkeep', 'upkeep', 'you'],
    ['At the beginning of your end step', 'endStep', 'you'],
  ] as const;

  test.each(CASES)('"%s, you gain 1 life."', (words, step, whose) => {
    const card = enchantment(
      `SYNTHETIC Parsed Watcher ${step} ${whose}`,
      `${words}, you gain 1 life.`,
    );
    for (const active of [0, 1] as const) {
      const g = game(card)
        .seat(0)
        .life(20)
        .battlefield(card.name)
        .library(...FILLER)
        .seat(1)
        .library(...FILLER)
        .at('postcombatMain', { active: active === 0 ? 1 : 0, turn: 2 })
        .build();
      g.advanceTo(STEP_ID[step] as StepId, { turn: 'next' });
      g.expect.step(STEP_ID[step] as StepId, { active });
      const expected = whose === 'each' || (whose === 'you') === (active === 0);
      g.expect.stack(expected ? [`${card.name} (ability)`] : []);
      if (expected) {
        g.passAll();
        // The watcher also triggered in the steps walked through, so only compare with the walk's start.
        expect(life(g, 0)).toBeGreaterThan(20);
      }
      g.expect.invariants();
    }
  });

  test('"At the beginning of combat on your turn, put a +1/+1 counter on target creature you control." targets a creature (replay: 4 cards)', () => {
    const card = enchantment(
      'SYNTHETIC Parsed Combat Pumper',
      'At the beginning of combat on your turn, put a +1/+1 counter on target creature you control.',
    );
    const g = game(card).seat(0).battlefield(card.name, BEARS).seat(1).build();
    g.advanceTo('beginningOfCombat');
    // The one creature is the only legal target, chosen as the trigger goes on the stack (CR 603.3d).
    g.expect.stack([`${card.name} (ability)`]);
    g.passAll();
    g.expect.counters(BEARS, { '+1/+1': 1 });
  });

  test('the draw step trigger goes on the stack after the turn-based draw (CR 504.1, 504.2)', () => {
    const card = enchantment(
      'SYNTHETIC Parsed Draw Step Watcher',
      'At the beginning of your draw step, you gain 1 life.',
    );
    const g = game(card)
      .seat(0)
      .life(20)
      .battlefield(card.name)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('endOfCombat', { active: 1, turn: 2 })
      .build();
    g.advanceTo('draw', { turn: 'next' });
    g.expect.handSize(0, 1);
    g.expect.stack([`${card.name} (ability)`]);
  });
});

describe('a card drawn (CR 121.1, 603.2c; replay: 10 cards "Whenever you draw a card, put a +1/+1 counter on ~", "an opponent draws their second card each turn" lines)', () => {
  const YOU = enchantment(
    'SYNTHETIC Parsed Draw Watcher',
    'Whenever you draw a card, you gain 1 life.',
  );
  const OPPONENT = enchantment(
    'SYNTHETIC Parsed Rival Draw Watcher',
    'Whenever an opponent draws a card, you gain 1 life.',
  );
  const ANY = enchantment(
    'SYNTHETIC Parsed Any Draw Watcher',
    'Whenever a player draws a card, you gain 1 life.',
  );
  const SECOND = enchantment(
    'SYNTHETIC Parsed Second Draw Watcher',
    'Whenever you draw your second card each turn, you gain 1 life.',
  );
  const RIVAL_SECOND = enchantment(
    'SYNTHETIC Parsed Rival Second Draw Watcher',
    'Whenever an opponent draws their second card each turn, you gain 1 life.',
  );
  const COUNTER = creature(
    'SYNTHETIC Parsed Draw Grower',
    'Whenever you draw a card, put a +1/+1 counter on ~.',
    '1',
    '1',
  );
  const DRAW_TWO = sorcery('SYNTHETIC Parsed Draw Two', 'Draw two cards.');

  /** Seat 0 controls `watcher`; `caster` casts Draw Two in a main phase of its own turn. */
  function draws(watcher: CardDefinition, caster: 0 | 1): ScenarioGame {
    const g = game(watcher, DRAW_TWO)
      .seat(0)
      .life(20)
      .battlefield(watcher.name)
      .battlefield(...(caster === 0 ? ['Forest', 'Forest'] : []))
      .hand(...(caster === 0 ? [DRAW_TWO.name] : []))
      .library(...FILLER)
      .seat(1)
      .battlefield(...(caster === 1 ? ['Forest', 'Forest'] : []))
      .hand(...(caster === 1 ? [DRAW_TWO.name] : []))
      .library(...FILLER)
      .at('precombatMain', { active: caster })
      .build();
    g.act(caster).cast(DRAW_TWO.name, { pay: true });
    g.passAll();
    return g;
  }

  test('"Whenever you draw a card": once for each card, and not for the opponent', () => {
    const own = draws(YOU, 0);
    own.passAll();
    expect(life(own, 0)).toBe(22);
    const other = draws(YOU, 1);
    other.passAll();
    expect(life(other, 0)).toBe(20);
  });

  test('"Whenever an opponent draws a card" and "Whenever a player draws a card"', () => {
    const rival = draws(OPPONENT, 1);
    rival.passAll();
    expect(life(rival, 0)).toBe(22);
    expect(life(draws(OPPONENT, 0), 0)).toBe(20);
    const any = draws(ANY, 1);
    any.passAll();
    expect(life(any, 0)).toBe(22);
  });

  test('"Whenever you draw a card, put a +1/+1 counter on ~": ~ is the creature itself', () => {
    const g = draws(COUNTER, 0);
    g.passAll();
    g.expect.counters(COUNTER.name, { '+1/+1': 2 });
  });

  test('"your second card each turn": the draw step is the first, the spell makes the second and third', () => {
    const g = game(SECOND, DRAW_TWO)
      .seat(0)
      .life(20)
      .battlefield(SECOND.name, 'Forest', 'Forest')
      .hand(DRAW_TWO.name)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('endOfCombat', { active: 1, turn: 2 })
      .build();
    g.advanceTo('precombatMain', { turn: 'next' });
    // The draw step drew the first card of the turn: nothing triggered.
    g.expect.stack([]);
    g.act(0).cast(DRAW_TWO.name, { pay: true });
    g.pass();
    g.pass();
    // The spell drew the second card (the trigger) and the third (no trigger).
    g.expect.stack([`${SECOND.name} (ability)`]);
    g.passAll();
    expect(life(g, 0)).toBe(21);
    g.expect.invariants();
  });

  test('"an opponent draws their second card each turn" reads that opponent\'s count', () => {
    const g = game(RIVAL_SECOND, DRAW_TWO)
      .seat(0)
      .life(20)
      .battlefield(RIVAL_SECOND.name)
      .library(...FILLER)
      .seat(1)
      .battlefield('Forest', 'Forest')
      .hand(DRAW_TWO.name)
      .library(...FILLER)
      .at('endOfCombat', { active: 0, turn: 2 })
      .build();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.stack([]);
    g.act(1).cast(DRAW_TWO.name, { pay: true });
    g.pass();
    g.pass();
    g.expect.stack([`${RIVAL_SECOND.name} (ability)`]);
    g.passAll();
    expect(life(g, 0)).toBe(21);
  });
});

describe('combat damage dealt (CR 120.2a, 510.2, 603.2; replay: 21 cards "Whenever ~ deals combat damage to a player, draw a card", 5 cards "a creature you control")', () => {
  const SELF = creature(
    'SYNTHETIC Parsed Biting Bear',
    'Whenever ~ deals combat damage to a player, draw a card.',
    '2',
    '2',
  );
  const COUNTER = creature(
    'SYNTHETIC Parsed Growing Bear',
    'Whenever ~ deals combat damage to a player, put a +1/+1 counter on it.',
    '2',
    '2',
  );
  const TEAM = enchantment(
    'SYNTHETIC Parsed Team Watcher',
    'Whenever a creature you control deals combat damage to a player, draw a card.',
  );
  const OPPONENT = creature(
    'SYNTHETIC Parsed Opponent Biter',
    'Whenever ~ deals combat damage to an opponent, you gain 1 life.',
    '2',
    '2',
  );
  const CREATURES = creature(
    'SYNTHETIC Parsed Scrapping Bear',
    'Whenever ~ deals combat damage to a creature, you gain 1 life.',
    '2',
    '2',
  );
  const ANYTHING = creature(
    'SYNTHETIC Parsed Every Hit Bear',
    'Whenever ~ deals combat damage, you gain 1 life.',
    '2',
    '2',
  );

  /** Seat 0 attacks with `attackers`; Giant Spider blocks the first one when `block` is set. */
  function fight(attackers: readonly CardDefinition[], block = false): ScenarioGame {
    const g = game(...attackers)
      .seat(0)
      .life(20)
      .battlefield(...attackers.map((c) => c.name))
      .library(...FILLER)
      .seat(1)
      .life(20)
      .battlefield(...(block ? [SPIDER] : []))
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    return attack(
      g,
      attackers.map((c) => c.name),
      block ? attackers[0]?.name : undefined,
    );
  }

  /** Declares the attack and the blocks, and stops in the combat damage step, damage dealt. */
  function attack(g: ScenarioGame, names: readonly string[], blocked?: string): ScenarioGame {
    g.advanceTo('declareAttackers');
    g.act(0).attack(names.map((name) => ({ name, seat: 0 as const })));
    g.advanceTo('declareBlockers');
    if (g.state.pending?.kind === 'declareBlockers') {
      g.act(1).declareBlockers(
        blocked === undefined
          ? []
          : [
              {
                blocker: { name: SPIDER, seat: 1 as const },
                attacker: { name: blocked, seat: 0 as const },
              },
            ],
      );
    }
    g.advanceTo('combatDamage');
    return g;
  }

  test('"~ deals combat damage to a player": triggers when unblocked, not when blocked', () => {
    const hit = fight([SELF]);
    hit.expect.stack([`${SELF.name} (ability)`]);
    hit.passAll();
    hit.expect.handSize(0, 1);
    const blocked = fight([SELF], true);
    blocked.expect.stack([]);
  });

  test('"put a +1/+1 counter on it": "it" is the creature that dealt the damage', () => {
    const g = fight([COUNTER]);
    g.passAll();
    g.expect.counters(COUNTER.name, { '+1/+1': 1 });
  });

  test('"Whenever a creature you control deals combat damage to a player": once for each creature', () => {
    const g = game(TEAM)
      .seat(0)
      .life(20)
      .battlefield(TEAM.name, BEARS, V22)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    attack(g, [BEARS, V22]);
    g.expect.stack([`${TEAM.name} (ability)`, `${TEAM.name} (ability)`]);
    g.passAll();
    g.expect.handSize(0, 2);
  });

  test('"to an opponent", "to a creature" and no recipient', () => {
    const opponent = fight([OPPONENT]);
    opponent.passAll();
    expect(life(opponent, 0)).toBe(21);
    const noBlock = fight([CREATURES]);
    noBlock.expect.stack([]);
    const blocked = fight([CREATURES], true);
    blocked.passAll();
    expect(life(blocked, 0)).toBe(21);
    const everything = fight([ANYTHING]);
    everything.passAll();
    expect(life(everything, 0)).toBe(21);
    const everythingBlocked = fight([ANYTHING], true);
    everythingBlocked.passAll();
    expect(life(everythingBlocked, 0)).toBe(21);
  });
});

describe('leaving the battlefield (CR 603.6c, 603.10a)', () => {
  const LEAVER = creature(
    'SYNTHETIC Parsed Leaver',
    'When ~ leaves the battlefield, you gain 3 life.',
    '2',
    '2',
  );
  const WATCHER = enchantment(
    'SYNTHETIC Parsed Departure Watcher',
    'Whenever a creature you control leaves the battlefield, you gain 1 life.',
  );

  test('"When ~ leaves the battlefield": dying and bouncing both trigger it', () => {
    for (const spell of [MURDER, 'Unsummon']) {
      const g = game(LEAVER)
        .seat(0)
        .life(20)
        .battlefield(LEAVER.name)
        .seat(1)
        .hand(spell)
        .pool('BBBU')
        .at('precombatMain', { active: 1 })
        .build();
      g.act(1).cast(spell, { targets: [LEAVER.name], pay: true });
      g.pass();
      g.pass();
      g.expect.stack([`${LEAVER.name} (ability)`]);
      g.passAll();
      expect(life(g, 0), spell).toBe(23);
    }
  });

  test('"Whenever a creature you control leaves the battlefield": only your creatures', () => {
    const g = game(WATCHER)
      .seat(0)
      .life(20)
      .battlefield(WATCHER.name, BEARS)
      .seat(1)
      .battlefield(V22)
      .hand(MURDER, { count: 2 })
      .pool('BBBBBB')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast({ name: MURDER, zone: 'hand', nth: 0 }, { targets: [V22], pay: true });
    g.passAll();
    g.expect.stack([]);
    g.act(1).cast({ name: MURDER, zone: 'hand', nth: 0 }, { targets: [BEARS], pay: true });
    g.pass();
    g.pass();
    g.expect.stack([`${WATCHER.name} (ability)`]);
  });
});

describe('the attached permanent as a trigger subject (CR 301.5a, 303.4b, 603.10a; replay: "Whenever equipped creature dies, draw two cards.", "Whenever enchanted creature attacks, scry 1.")', () => {
  const BLADE = parsed(
    'SYNTHETIC Parsed Last Gift Blade',
    'Artifact — Equipment',
    'Whenever equipped creature dies, draw two cards.\nEquip {2}',
    { manaCost: '{2}' },
  );
  const DRUM = parsed(
    'SYNTHETIC Parsed Drumbeat Blade',
    'Artifact — Equipment',
    'Whenever equipped creature attacks, you gain 1 life.\nEquip {1}',
    { manaCost: '{1}' },
  );
  const HIT = parsed(
    'SYNTHETIC Parsed Striking Blade',
    'Artifact — Equipment',
    'Whenever equipped creature deals combat damage to a player, you gain 1 life.\nEquip {1}',
    { manaCost: '{1}' },
  );
  const AURA = parsed(
    'SYNTHETIC Parsed Marching Aura',
    'Enchantment — Aura',
    'Enchant creature\nWhenever enchanted creature attacks, you gain 1 life.',
    { manaCost: '{1}{W}', colors: ['W'] },
  );
  const DOOM = parsed(
    'SYNTHETIC Parsed Doom Aura',
    'Enchantment — Aura',
    'Enchant creature\nWhenever enchanted creature dies, you gain 3 life.',
    { manaCost: '{1}{B}', colors: ['B'] },
  );
  const TAPPER = parsed(
    'SYNTHETIC Parsed Tap Blade',
    'Artifact — Equipment',
    'Whenever equipped creature becomes tapped, you gain 1 life.\nEquip {1}',
    { manaCost: '{1}' },
  );

  const withEquipped = (card: CardDefinition) =>
    game(card)
      .seat(0)
      .life(20)
      .battlefield(V22, BEARS)
      .battlefield(card.name, { attachedTo: V22 })
      .library(...FILLER)
      .seat(1)
      .life(20)
      .hand(MURDER)
      .pool('BBB')
      .at('precombatMain', { active: 1 })
      .build();

  test('"Whenever equipped creature dies, draw two cards.": the host dies, another creature does not', () => {
    const g = withEquipped(BLADE);
    g.act(1).cast(MURDER, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.stack([]);
    const h = withEquipped(BLADE);
    h.act(1).cast(MURDER, { targets: [V22], pay: true });
    h.pass();
    h.pass();
    h.expect.stack([`${BLADE.name} (ability)`]);
    h.passAll();
    h.expect.handSize(0, 2);
    h.expect.zone(BLADE.name, 'battlefield', { seat: 0 });
    h.expect.attached(BLADE.name, null);
  });

  test('"Whenever enchanted creature dies": an Aura goes to the graveyard after its host', () => {
    const g = game(DOOM)
      .seat(0)
      .life(20)
      .battlefield(V22)
      .battlefield(DOOM.name, { attachedTo: V22 })
      .seat(1)
      .hand(MURDER)
      .pool('BBB')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(MURDER, { targets: [V22], pay: true });
    g.pass();
    g.pass();
    g.expect.stack([`${DOOM.name} (ability)`]);
    g.passAll();
    expect(life(g, 0)).toBe(23);
  });

  test('"attacks": the equipped creature and the enchanted creature trigger when they attack', () => {
    for (const card of [DRUM, AURA]) {
      const g = game(card)
        .seat(0)
        .life(20)
        .battlefield(V22, BEARS)
        .battlefield(card.name, { attachedTo: V22 })
        .seat(1)
        .at('precombatMain', { active: 0 })
        .build();
      g.advanceTo('declareAttackers');
      g.act(0).attack([{ name: BEARS, seat: 0 }]);
      g.expect.stack([]);
      const h = game(card)
        .seat(0)
        .life(20)
        .battlefield(V22, BEARS)
        .battlefield(card.name, { attachedTo: V22 })
        .seat(1)
        .at('precombatMain', { active: 0 })
        .build();
      h.advanceTo('declareAttackers');
      h.act(0).attack([{ name: V22, seat: 0 }]);
      h.expect.stack([`${card.name} (ability)`]);
    }
  });

  test('"you may" on an equipped creature trigger asks its controller (replay: "Whenever equipped creature attacks, you may search ...")', () => {
    const MAY = parsed(
      'SYNTHETIC Parsed Optional Blade',
      'Artifact — Equipment',
      'Whenever equipped creature attacks, you may draw a card.\nEquip {1}',
      { manaCost: '{1}' },
    );
    const g = game(MAY)
      .seat(0)
      .battlefield(V22)
      .battlefield(MAY.name, { attachedTo: V22 })
      .library(...FILLER)
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([{ name: V22, seat: 0 }]);
    g.pass();
    g.pass();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.handSize(0, 1);
  });

  test('"deals combat damage to a player" and "becomes tapped" follow the equipped creature', () => {
    const g = game(HIT)
      .seat(0)
      .life(20)
      .battlefield(V22)
      .battlefield(HIT.name, { attachedTo: V22 })
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([{ name: V22, seat: 0 }]);
    g.advanceTo('combatDamage');
    g.expect.stack([`${HIT.name} (ability)`]);
    const t = game(TAPPER)
      .seat(0)
      .life(20)
      .battlefield(V22)
      .battlefield(TAPPER.name, { attachedTo: V22 })
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    t.advanceTo('declareAttackers');
    t.act(0).attack([{ name: V22, seat: 0 }]);
    t.expect.stack([`${TAPPER.name} (ability)`]);
  });
});

describe('power, toughness and mana value in a filter (CR 202.3, 208.1; replay: "Whenever a creature you control with power 4 or greater enters, draw a card.", "if you control a creature with power 4 or greater")', () => {
  const BIG_ARRIVAL = enchantment(
    'SYNTHETIC Parsed Big Arrival Watcher',
    'Whenever a creature you control with power 4 or greater enters, draw a card.',
  );
  const BIG_ATTACK = enchantment(
    'SYNTHETIC Parsed Big Attack Watcher',
    'Whenever a creature with power 4 or greater attacks, you gain 1 life.',
  );
  const SMALL_DEATH = enchantment(
    'SYNTHETIC Parsed Small Death Watcher',
    'Whenever a creature with power 2 or less dies, you gain 1 life.',
  );
  const TOUGH_DEATH = enchantment(
    'SYNTHETIC Parsed Tough Death Watcher',
    'Whenever a creature with toughness 4 or greater dies, you gain 1 life.',
  );
  const CHEAP_SPELL = enchantment(
    'SYNTHETIC Parsed Cheap Spell Watcher',
    'Whenever you cast a spell with mana value 2 or less, you gain 1 life.',
  );
  const SIZABLE = creature(
    'SYNTHETIC Parsed Sizable Scout',
    'When ~ enters, if you control a creature with power 4 or greater, draw a card.',
    '1',
    '1',
  );

  test('"Whenever a creature you control with power 4 or greater enters": a 4/4 draws, a 2/2 does not', () => {
    const big = game(BIG_ARRIVAL)
      .seat(0)
      .battlefield(BIG_ARRIVAL.name)
      .hand(ANGEL)
      .pool('CCCWW')
      .library(...FILLER)
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    big.act(0).cast(ANGEL, { pay: true });
    big.passAll();
    big.expect.handSize(0, 1);
    const small = game(BIG_ARRIVAL)
      .seat(0)
      .battlefield(BIG_ARRIVAL.name)
      .hand(BEARS)
      .pool('CG')
      .library(...FILLER)
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    small.act(0).cast(BEARS, { pay: true });
    small.passAll();
    small.expect.handSize(0, 0);
  });

  test('"Whenever a creature with power 4 or greater attacks": any player\'s creature', () => {
    const g = game(BIG_ATTACK)
      .seat(0)
      .life(20)
      .battlefield(BIG_ATTACK.name, V55, V22)
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([{ name: V22, seat: 0 }]);
    g.expect.stack([]);
    const h = game(BIG_ATTACK)
      .seat(0)
      .life(20)
      .battlefield(BIG_ATTACK.name, V55, V22)
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    h.advanceTo('declareAttackers');
    h.act(0).attack([{ name: V55, seat: 0 }]);
    h.expect.stack([`${BIG_ATTACK.name} (ability)`]);
  });

  test('"with power 2 or less" and "with toughness 4 or greater" on a creature that dies', () => {
    const kill = (watcher: CardDefinition, victim: string) => {
      const g = game(watcher)
        .seat(0)
        .battlefield(watcher.name, victim)
        .seat(1)
        .hand(MURDER)
        .pool('BBB')
        .at('precombatMain', { active: 1 })
        .build();
      g.act(1).cast(MURDER, { targets: [victim], pay: true });
      g.pass();
      g.pass();
      return g;
    };
    kill(SMALL_DEATH, V22).expect.stack([`${SMALL_DEATH.name} (ability)`]);
    kill(SMALL_DEATH, V55).expect.stack([]);
    kill(TOUGH_DEATH, V55).expect.stack([`${TOUGH_DEATH.name} (ability)`]);
    kill(TOUGH_DEATH, V22).expect.stack([]);
  });

  test('"a spell with mana value 2 or less" reads the spell on the stack', () => {
    const cast = (spell: string, pool: string, target?: { player: 1 }) => {
      const g = game(CHEAP_SPELL)
        .seat(0)
        .life(20)
        .battlefield(CHEAP_SPELL.name)
        .hand(spell)
        .pool(pool)
        .seat(1)
        .at('precombatMain', { active: 0 })
        .build();
      g.act(0).cast(spell, { ...(target === undefined ? {} : { targets: [target] }), pay: true });
      return g;
    };
    cast(BOLT, 'R', { player: 1 }).expect.stack([`${CHEAP_SPELL.name} (ability)`, BOLT]);
    cast(ANGEL, 'CCCWW').expect.stack([ANGEL]);
  });

  test('"if you control a creature with power 4 or greater" is checked as it enters (CR 603.4)', () => {
    const play = (board: readonly string[]) => {
      const g = game(SIZABLE)
        .seat(0)
        .battlefield(...board)
        .hand(SIZABLE.name)
        .pool('CG')
        .library(...FILLER)
        .seat(1)
        .at('precombatMain', { active: 0 })
        .build();
      g.act(0).cast(SIZABLE.name, { pay: true });
      g.pass();
      g.pass();
      return g;
    };
    play([ANGEL]).expect.stack([`${SIZABLE.name} (ability)`]);
    play([BEARS]).expect.stack([]);
  });

  test('"Activate only if you control a creature with power 4 or greater." gates a mana ability', () => {
    const MINE = parsed(
      'SYNTHETIC Parsed Titan Garden',
      'Land',
      '{T}: Add {G}{G}{G}{G}. Activate only if you control a creature with power 4 or greater.',
    );
    const board = (creatureName: string) =>
      game(MINE).seat(0).battlefield(MINE.name, creatureName).seat(1).build();
    board(ANGEL).expect.legal(0, { tap: MINE.name });
    board(BEARS).expect.illegal(0, { tap: MINE.name });
  });

  test('"Counter target spell with mana value 1." targets only a spell with that mana value', () => {
    const SNIP = parsed(
      'SYNTHETIC Parsed Snip',
      'Instant',
      'Counter target spell with mana value 1.',
      {
        manaCost: '{U}',
        colors: ['U'],
      },
    );
    const stackedWith = (spell: string) => {
      const g = game(SNIP)
        .seat(0)
        .hand(spell)
        .pool(spell === BOLT ? 'R' : 'CG')
        .seat(1)
        .hand(SNIP.name)
        .pool('U')
        .at('precombatMain', { active: 0 })
        .build();
      g.act(0).cast(
        spell,
        spell === BOLT ? { targets: [{ player: 1 }], pay: true } : { pay: true },
      );
      // The caster passes, and the opponent may respond.
      g.pass();
      return g;
    };
    stackedWith(BOLT).expect.legal(1, { cast: SNIP.name });
    stackedWith(BEARS).expect.illegal(1, { cast: SNIP.name });
  });

  test('"Destroy target nonland permanent with mana value 3 or less." and the graveyard card with mana value', () => {
    const SMITE = sorcery(
      'SYNTHETIC Parsed Smite',
      'Destroy target nonland permanent with mana value 3 or less.',
    );
    const RAISE = sorcery(
      'SYNTHETIC Parsed Raise Small',
      'Return target creature card with mana value 3 or less from your graveyard to the battlefield.',
    );
    const smite = (permanent: string) =>
      game(SMITE)
        .seat(0)
        .hand(SMITE.name)
        .pool('CG')
        .seat(1)
        .battlefield(permanent)
        .at('precombatMain', { active: 0 })
        .build();
    smite(SPIDER).expect.illegal(0, { cast: SMITE.name });
    const g = smite(BEARS);
    g.expect.legal(0, { cast: SMITE.name });
    g.act(0).cast(SMITE.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });

    const raise = (card: string) =>
      game(RAISE)
        .seat(0)
        .hand(RAISE.name)
        .graveyard(card)
        .pool('CG')
        .seat(1)
        .at('precombatMain', { active: 0 })
        .build();
    raise(SPIDER).expect.illegal(0, { cast: RAISE.name });
    const r = raise(BEARS);
    r.act(0).cast(RAISE.name, { targets: [{ name: BEARS, zone: 'graveyard' }], pay: true });
    r.passAll();
    r.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('"Exile target permanent with mana value 4 or greater." names only such permanents (replay: 2 cards)', () => {
    const BANISH = parsed(
      'SYNTHETIC Parsed Banish Big',
      'Instant',
      'Exile target permanent with mana value 4 or greater.',
      { manaCost: '{W}', colors: ['W'] },
    );
    const only = (permanent: string) =>
      game(BANISH).seat(0).hand(BANISH.name).pool('W').seat(1).battlefield(permanent).build();
    only(BEARS).expect.illegal(0, { cast: BANISH.name });
    const g = only(SPIDER);
    g.act(0).cast(BANISH.name, { targets: [SPIDER], pay: true });
    g.passAll();
    g.expect.zone(SPIDER, 'exile');
  });

  test('"Target creature with power 3 or less can\'t be blocked this turn." names only such creatures', () => {
    const VEIL = parsed(
      'SYNTHETIC Parsed Veil',
      'Instant',
      "Target creature with power 3 or less can't be blocked this turn.",
      { manaCost: '{U}', colors: ['U'] },
    );
    const only = (creatureName: string) =>
      game(VEIL).seat(0).hand(VEIL.name).pool('U').battlefield(creatureName).seat(1).build();
    only(V55).expect.illegal(0, { cast: VEIL.name });
    only(V22).expect.legal(0, { cast: VEIL.name });
  });

  test('"Creatures you control with power 2 or less get +1/+1." is a +1/+1 effect read after the others (CR 613.8a)', () => {
    const LORD = enchantment(
      'SYNTHETIC Parsed Small Lord',
      'Creatures you control with power 2 or less get +1/+1.',
    );
    const g = game(LORD).seat(0).battlefield(LORD.name, V22, V55).seat(1).build();
    g.expect.pt(V22, 3, 3);
    g.expect.pt(V55, 5, 5);
  });
});

describe('"unless that player pays {1}" (CR 118.12a; replay: "Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.")', () => {
  const TAX = enchantment(
    'SYNTHETIC Parsed Tax Collector',
    'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.',
  );
  const NONCREATURE = enchantment(
    'SYNTHETIC Parsed Noncreature Tax',
    'Whenever an opponent casts a noncreature spell, you may draw a card unless that player pays {4}.',
  );
  const PLAIN = enchantment(
    'SYNTHETIC Parsed Strict Tax',
    'Whenever an opponent casts a spell, draw a card unless that player pays {1}.',
  );
  const TAX_THEN_GAIN = enchantment(
    'SYNTHETIC Parsed Tax Then Gain',
    'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}. You gain 3 life.',
  );

  /** Seat 1, the active player, casts `spell` with `lands` Mountains of its own; seat 0 controls `watcher`. */
  function board(watcher: CardDefinition, spell: string, lands: number): ScenarioGame {
    const g = game(watcher)
      .seat(0)
      .life(20)
      .battlefield(watcher.name)
      .library(...FILLER)
      .seat(1)
      .life(20)
      .hand(spell)
      .battlefield(...Array.from({ length: lands }, () => 'Mountain'))
      .library(...FILLER)
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(spell, spell === BOLT ? { targets: [{ player: 0 }], pay: true } : { pay: true });
    return g;
  }

  /** Both players pass: the trigger, on top of the spell, resolves and asks its question. */
  function resolveTrigger(g: ScenarioGame): void {
    g.pass();
    g.pass();
  }

  test("the opponent's spell triggers it, with the payer asked first and the effect optional for the controller", () => {
    const g = board(TAX, BOLT, 2);
    g.expect.stack([`${TAX.name} (ability)`, BOLT]);
    resolveTrigger(g);
    // The player who cast the spell, not the controller of the ability, is asked.
    g.expect.pending('confirmOptional', 1);
    const d = g.state.pending as ConfirmOptionalDecision;
    expect(d.purpose).toBe('unlessPays');
    expect(d.cost).toEqual([{ kind: 'mana', symbols: ['1'] }]);
  });

  test('paying {1} stops the draw', () => {
    const g = board(TAX, BOLT, 2);
    resolveTrigger(g);
    g.act(1).accept();
    g.expect.pending('payMana', 1);
    expect((g.state.pending as PayManaDecision).purpose).toBe('unlessPays');
    g.act(1).payAuto();
    g.expect.handSize(0, 0);
    g.expect.noEvent({ kind: 'cardDrawn' });
  });

  test('not paying lets the controller choose: "you may draw a card"', () => {
    const g = board(TAX, BOLT, 2);
    resolveTrigger(g);
    g.act(1).decline();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.handSize(0, 1);
    const h = board(TAX, BOLT, 2);
    resolveTrigger(h);
    h.act(1).decline();
    h.act(0).decline();
    h.expect.handSize(0, 0);
  });

  test('a payer who cannot pay is not asked (CR 118.3), and without "you may" the draw happens', () => {
    const g = board(PLAIN, BOLT, 1);
    resolveTrigger(g);
    g.expect.handSize(0, 1);
    g.expect.invariants();
  });

  test('"you may" covers the one instruction: the rest of the ability still happens after a decline', () => {
    const g = board(TAX_THEN_GAIN, BOLT, 2);
    resolveTrigger(g);
    g.act(1).decline();
    g.act(0).decline();
    expect(life(g, 0)).toBe(23);
  });

  test('"noncreature spell" and a payment of {4} that the payer cannot afford', () => {
    const g = board(NONCREATURE, BOLT, 1);
    resolveTrigger(g);
    // Seat 1 has no mana left for {4}: nobody is asked about paying, the controller is.
    g.expect.pending('confirmOptional', 0);
    const h = game(NONCREATURE)
      .seat(0)
      .battlefield(NONCREATURE.name)
      .seat(1)
      .hand(BEARS)
      .battlefield('Forest', 'Forest')
      .at('precombatMain', { active: 1 })
      .build();
    h.act(1).cast(BEARS, { pay: true });
    h.expect.stack([BEARS]);
  });

  test('"At the beginning of your upkeep, sacrifice ~ unless you pay {U}." asks the controller', () => {
    const TAXED = creature(
      'SYNTHETIC Parsed Taxed Drake',
      'At the beginning of your upkeep, sacrifice ~ unless you pay {U}.',
      '3',
      '3',
    );
    const upkeep = (decide: (g: ScenarioGame) => void) => {
      const g = game(TAXED)
        .seat(0)
        .battlefield(TAXED.name, 'Island')
        .library(...FILLER)
        .seat(1)
        .library(...FILLER)
        .at('endOfCombat', { active: 1, turn: 2 })
        .build();
      g.advanceTo('upkeep', { turn: 'next' });
      g.passAll();
      g.expect.pending('confirmOptional', 0);
      decide(g);
      return g;
    };
    upkeep((g) => g.act(0).decline()).expect.zone(TAXED.name, 'graveyard', { seat: 0 });
    const paid = upkeep((g) => {
      g.act(0).accept();
      g.act(0).payAuto();
    });
    paid.expect.zone(TAXED.name, 'battlefield', { seat: 0 });
    paid.expect.tapped('Island', true);
  });
});

describe('"its controller" of the creature that caused a trigger (CR 608.2h)', () => {
  const OTHER = enchantment(
    'SYNTHETIC Parsed Death Tax',
    'Whenever another creature dies, its controller gains 2 life.',
  );

  test('the controller of the creature that died gains the life, whoever it is', () => {
    const g = game(OTHER)
      .seat(0)
      .life(20)
      .battlefield(OTHER.name, BEARS)
      .seat(1)
      .life(20)
      .battlefield(V22)
      .hand(MURDER, { count: 2 })
      .pool('BBBBBB')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast({ name: MURDER, zone: 'hand', nth: 0 }, { targets: [V22], pay: true });
    g.passAll();
    expect(life(g, 1)).toBe(22);
    expect(life(g, 0)).toBe(20);
    g.act(1).cast({ name: MURDER, zone: 'hand', nth: 0 }, { targets: [BEARS], pay: true });
    g.passAll();
    expect(life(g, 0)).toBe(22);
  });
});
