// Issue 144: the Oracle text of Boggart Shenanigans, Gempalm Incinerator, Goblin Negotiation and Frontline Heroism goes through the grammar as a card with no override, is defined in an
// engine scenario and is played through applyAction, so the nodes the parser writes are what the engine runs. The cards are SYNTHETIC (invented names and costs around the Oracle
// wording of the issue; no card data was fetched). Pins: CR 603.10a (a "dies" trigger looks back), CR 702.29c (when you cycle this card), CR 113.7a (last-known information of the
// card that deals the damage), CR 120.10 (excess damage), CR 120.6 and 702.2c (lethal damage), CR 608.2c (this way), CR 707.10 and 707.10e (a copy that targets a new object, which
// must be a legal target for each instance of the word "target"), CR 115.9c (a spell that targets only one object), CR 111.2 (tokens).
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const SEVEN_MOUNTAINS = Array.from({ length: 7 }, () => 'Mountain');
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');
const BEARS = 'Grizzly Bears';

const goblin = (name: string): CardDefinition =>
  parsed(name, 'Creature — Goblin', '', { manaCost: '{R}', power: '1', toughness: '1' });

const SHENANIGANS = 'SYNTHETIC Goblin Haunt';
const shenanigans = parsed(
  SHENANIGANS,
  'Enchantment',
  'Whenever another Goblin you control is put into a graveyard from the battlefield, you may have ~ deal 1 damage to target player or planeswalker.',
  { manaCost: '{2}{R}' },
);

const INCINERATOR = 'SYNTHETIC Goblin Cycler';
const incinerator = parsed(
  INCINERATOR,
  'Creature — Goblin',
  'Cycling {1}{R}\nWhen you cycle ~, you may have it deal X damage to target creature, where X is the number of Goblins on the battlefield.',
  { manaCost: '{2}{R}', power: '2', toughness: '1' },
);

const NEGOTIATION = 'SYNTHETIC Goblin Haggle';
const negotiation = parsed(
  NEGOTIATION,
  'Sorcery',
  '~ deals X damage to target creature. Create a number of 1/1 red Goblin creature tokens equal to the amount of excess damage dealt to that creature this way.',
  { manaCost: '{X}{R}' },
);

const HEROISM = 'SYNTHETIC Soldier Fervor';
const heroism = parsed(
  HEROISM,
  'Enchantment',
  'When ~ enters, create a 1/1 red Soldier creature token with haste.\nWhenever you cast a spell that targets only a single creature you control, create a 1/1 red Soldier creature token with haste, then copy that spell. The copy targets that token.',
  { manaCost: '{2}{R}{W}' },
);

// A spell the token of Frontline Heroism cannot be a target of: "with flying".
const FLY_BOOST = 'SYNTHETIC Wing Boost';
const flyBoost = parsed(
  FLY_BOOST,
  'Instant',
  'Target creature you control with flying gets +1/+1 until end of turn.',
  { manaCost: '{W}' },
);
const SPIDER = 'Serra Angel'; // 4/4 flying

const PUMP = 'SYNTHETIC Big Pump';
const pump = parsed(PUMP, 'Instant', 'Target creature gets +3/+3 until end of turn.', {
  manaCost: '{G}',
});
const GIANT = 'SYNTHETIC Hill Brute';
const giant = parsed(GIANT, 'Creature — Giant', '', {
  manaCost: '{3}{R}',
  power: '3',
  toughness: '3',
});
const GOBLIN_A = 'SYNTHETIC Goblin A';
const GOBLIN_B = 'SYNTHETIC Goblin B';

const defineAll = () =>
  scenario()
    .define(shenanigans)
    .define(incinerator)
    .define(negotiation)
    .define(heroism)
    .define(flyBoost)
    .define(pump)
    .define(giant)
    .define(goblin(GOBLIN_A))
    .define(goblin(GOBLIN_B));

describe('the cards are valid', () => {
  test.each([shenanigans, incinerator, negotiation, heroism])('$name', (card) => {
    expect(validateCard(card)).toEqual([]);
  });
});

describe('Boggart Shenanigans: "... you may have this enchantment deal 1 damage to target player or planeswalker."', () => {
  const start = (...mine: string[]) =>
    defineAll()
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .hand('Lightning Bolt')
      .battlefield(SHENANIGANS, 'Mountain', ...mine)
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .battlefield(GOBLIN_B)
      .at('precombatMain', { active: 0 })
      .build();

  test('another Goblin you control dies: 1 damage to the player it was aimed at', () => {
    const g = start(GOBLIN_A);
    g.act(0).cast('Lightning Bolt', { targets: [GOBLIN_A], pay: true });
    g.passAll();
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.act(0).accept();
    g.expect.life(1, 19);
    g.expect.life(0, 20);
    g.expect.invariants();
  });

  test('declined: no damage', () => {
    const g = start(GOBLIN_A);
    g.act(0).cast('Lightning Bolt', { targets: [GOBLIN_A], pay: true });
    g.passAll();
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.act(0).decline();
    g.expect.life(1, 20);
  });

  test('a creature that is not a Goblin does not trigger it', () => {
    const g = start(BEARS);
    g.act(0).cast('Lightning Bolt', { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.stack([]);
    g.expect.life(1, 20);
  });

  test('a Goblin an opponent controls does not trigger it', () => {
    const g = start();
    g.act(0).cast('Lightning Bolt', { targets: [GOBLIN_B], pay: true });
    g.passAll();
    g.expect.stack([]);
    g.expect.life(1, 20);
  });
});

describe('Gempalm Incinerator: "When you cycle this card, you may have it deal X damage to target creature, where X is the number of Goblins on the battlefield."', () => {
  const start = (...battlefield: string[]) =>
    defineAll()
      .seat(0)
      .library(...LIBRARY)
      .hand(INCINERATOR)
      .battlefield('Mountain', 'Mountain', ...battlefield)
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Giant Spider', GIANT)
      .at('precombatMain', { active: 0 })
      .build();

  test('cycled with two Goblins on the battlefield: 2 damage; the cycled card is in the graveyard and does not count', () => {
    const g = start(GOBLIN_A, GOBLIN_B);
    g.act(0).activate({ name: INCINERATOR, zone: 'hand' }, { pay: true });
    g.act(0).chooseTargets('Giant Spider');
    g.passAll();
    g.act(0).accept();
    expect(g.find({ name: 'Giant Spider', zone: 'battlefield' })).toHaveLength(1);
    expect(g.find({ name: 'Giant Spider' })[0]?.damage).toBe(2);
    g.expect.zone(INCINERATOR, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('enough Goblins to kill: the creature dies', () => {
    const h = scenario()
      .define(incinerator)
      .define(goblin(GOBLIN_A))
      .define(goblin(GOBLIN_B))
      .seat(0)
      .library(...LIBRARY)
      .hand(INCINERATOR)
      .battlefield('Mountain', 'Mountain', GOBLIN_A, GOBLIN_B)
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Typhoid Rats', GOBLIN_A)
      .at('precombatMain', { active: 0 })
      .build();
    h.act(0).activate({ name: INCINERATOR, zone: 'hand' }, { pay: true });
    h.act(0).chooseTargets('Typhoid Rats');
    h.passAll();
    h.act(0).accept();
    // three Goblins on the battlefield, whoever controls them: 3 damage to a 1/1
    h.expect.zone('Typhoid Rats', 'graveyard', { seat: 1 });
  });

  test('declined: nothing is dealt', () => {
    const g = start(GOBLIN_A);
    g.act(0).activate({ name: INCINERATOR, zone: 'hand' }, { pay: true });
    g.act(0).chooseTargets('Giant Spider');
    g.passAll();
    g.act(0).decline();
    expect(g.find({ name: 'Giant Spider' })[0]?.damage).toBe(0);
  });
});

describe('Goblin Negotiation: "~ deals X damage to target creature. Create a number of 1/1 red Goblin creature tokens equal to the amount of excess damage dealt to that creature this way."', () => {
  const start = () =>
    defineAll()
      .seat(0)
      .library(...LIBRARY)
      .hand(NEGOTIATION)
      .battlefield(...SEVEN_MOUNTAINS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, 'Giant Spider')
      .at('precombatMain', { active: 0 })
      .build();

  const goblins = (g: ScenarioGame) =>
    g.view(0).battlefield.filter((o) => o.name === 'Goblin' && o.controller === 0);

  test('X = 5 to a 2/2: 3 of the damage is excess, so three Goblin tokens', () => {
    const g = start();
    g.act(0).cast(NEGOTIATION, { x: 5, targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    const made = goblins(g);
    expect(made).toHaveLength(3);
    for (const t of made) expect([t.power, t.toughness]).toEqual([1, 1]);
    g.expect.invariants();
  });

  test('X = 2 to a 2/2: exactly lethal damage is no excess, no token', () => {
    const g = start();
    g.act(0).cast(NEGOTIATION, { x: 2, targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    expect(goblins(g)).toHaveLength(0);
  });

  test('X = 3 to a 2/4 that does not die: no excess (the damage is less than its toughness)', () => {
    const g = start();
    g.act(0).cast(NEGOTIATION, { x: 3, targets: ['Giant Spider'], pay: true });
    g.passAll();
    expect(goblins(g)).toHaveLength(0);
  });

  test('X = 6 to a 2/4: 2 damage over lethal, two tokens', () => {
    const g = start();
    g.act(0).cast(NEGOTIATION, { x: 6, targets: ['Giant Spider'], pay: true });
    g.passAll();
    expect(goblins(g)).toHaveLength(2);
  });

  test('damage already marked counts: lethal damage is what is left of the toughness (CR 120.6)', () => {
    const g = defineAll()
      .seat(0)
      .library(...LIBRARY)
      .hand(NEGOTIATION, 'Lightning Bolt')
      .battlefield(...SEVEN_MOUNTAINS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Giant Spider')
      .at('precombatMain', { active: 0 })
      .build();
    // 3 damage marked on the 2/4: only 1 more is lethal, so X = 3 leaves 2 in excess
    g.act(0).cast('Lightning Bolt', { targets: ['Giant Spider'], pay: true });
    g.passAll();
    g.act(0).cast(NEGOTIATION, { x: 3, targets: ['Giant Spider'], pay: true });
    g.passAll();
    expect(goblins(g)).toHaveLength(2);
  });
});

describe('Frontline Heroism: "Whenever you cast a spell that targets only a single creature you control, create a 1/1 red Soldier creature token with haste, then copy that spell. The copy targets that token."', () => {
  const start = (opponent: readonly string[] = []) =>
    defineAll()
      .seat(0)
      .library(...LIBRARY)
      .hand('Lightning Bolt', PUMP, FLY_BOOST)
      .battlefield(HEROISM, BEARS, SPIDER, 'Mountain', 'Forest', 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(...opponent)
      .at('precombatMain', { active: 0 })
      .build();

  const soldiers = (g: ScenarioGame) => g.find({ name: 'Soldier', zone: 'battlefield' });

  test('enters: a Soldier token with haste', () => {
    const g = defineAll()
      .seat(0)
      .library(...LIBRARY)
      .hand(HEROISM)
      .battlefield('Mountain', 'Mountain', 'Plains', 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(HEROISM, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.derived({ name: 'Soldier', seat: 0 }, { keywords: ['haste'] });
    const [soldier] = g.view(0).battlefield.filter((o) => o.name === 'Soldier');
    expect([soldier?.power, soldier?.toughness]).toEqual([1, 1]);
  });

  test('a spell that targets only one creature you control: a token, then a copy of the spell aimed at the token', () => {
    const g = start();
    g.act(0).cast(PUMP, { targets: [BEARS], pay: true });
    g.pass();
    // the trigger resolves: the token is made and the copy is put onto the stack above the spell
    g.pass();
    const token = soldiers(g)[0];
    expect(soldiers(g)).toHaveLength(1);
    const copy = g.state.stack.map((id) => g.state.objects[id]).find((o) => o?.copyOf != null);
    expect(copy?.stack?.chosenTargets).toEqual([expect.objectContaining({ id: token?.id })]);
    g.passAll();
    // the copy pumped the token, the spell pumped the Bears
    g.expect.pt(BEARS, 5, 5);
    const [soldier] = g.view(0).battlefield.filter((o) => o.name === 'Soldier');
    expect([soldier?.power, soldier?.toughness]).toEqual([4, 4]);
    g.expect.invariants();
  });

  test('the copy is not cast: the trigger does not trigger itself again', () => {
    const g = start();
    g.act(0).cast(PUMP, { targets: [BEARS], pay: true });
    g.passAll();
    expect(soldiers(g)).toHaveLength(1);
  });

  test('a spell that targets a player does not trigger it', () => {
    const g = start();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.expect.stack(['Lightning Bolt']);
  });

  test('a spell that targets a creature an opponent controls does not trigger it', () => {
    const g = start(['Giant Spider']);
    g.act(0).cast('Lightning Bolt', { targets: [{ name: 'Giant Spider', seat: 1 }], pay: true });
    g.expect.stack(['Lightning Bolt']);
  });

  test('the token must be a legal target for the copy: for a spell that needs flying no copy is made (CR 707.10e)', () => {
    const g = start();
    g.act(0).cast(FLY_BOOST, { targets: [SPIDER], pay: true });
    g.pass();
    g.pass();
    // the token was made, the copy was not
    expect(soldiers(g)).toHaveLength(1);
    expect(g.state.stack.filter((id) => g.state.objects[id]?.copyOf != null)).toHaveLength(0);
    g.passAll();
    g.expect.pt(SPIDER, 5, 5);
  });
});
