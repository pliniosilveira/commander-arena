// Lands that become creatures for a while (issue 692): the REAL Oracle text of Embodiment of Fury, Embodiment of Insight and Sylvan Awakening (the corpus's golden.jsonl) goes through the
// grammar with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs, with three seats.
// Pins: CR 205.1b (Type Line: "becomes an artifact creature"-style effects keep the types), CR 611.2a, 611.2c (a continuous effect of a resolving ability or spell affects the objects it
// named as it began), CR 500.1 and 611.2a ("until your next turn"), CR 613.1d and 613.4b (layers 4 and 7b), CR 603.3d (targets of a triggered ability).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  expect(validateCard(imported.definition), name).toEqual([]);
  return imported.definition;
}

const LIBRARY = Array.from({ length: 8 }, () => 'Swamp');

/** The landfall ability is on the stack: its target is chosen as it goes there (CR 603.3d), the offer is made as it resolves (CR 608.2d, 603.5). */
function animate(g: ScenarioGame, target: string, accept = true): void {
  g.act(0).chooseTargets(target);
  g.passAll();
  if (accept) g.act(0).accept();
  else g.act(0).decline();
}

describe('Embodiment of Fury', () => {
  const fury = real('Embodiment of Fury');

  /** Three seats; seat 0 has the Embodiment and a Mountain on the battlefield and a Forest in hand. */
  const board = () =>
    scenario({ seats: 3 })
      .define(fury)
      .seat(0)
      .library(...LIBRARY)
      .hand('Forest')
      .battlefield(fury.name, 'Mountain')
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Plains')
      .seat(2)
      .library(...LIBRARY)
      .battlefield('Island')
      .at('precombatMain', { active: 0 })
      .build();

  test('the whole card is read: trample, the land creatures it gives trample and the landfall ability', () => {
    expect(fury.faces[0]?.abilities.length).toBe(3);
  });

  test('landfall: the land that entered becomes a 3/3 Elemental creature with haste until end of turn and is still a land (CR 205.1b, 613.4b)', () => {
    const g = board();
    g.act(0).playLand('Forest');
    animate(g, 'Forest');
    g.expect.pt('Forest', 3, 3);
    g.expect.derived('Forest', {
      types: ['land', 'creature'],
      subtypes: ['Forest', 'Elemental'],
      keywords: ['haste', 'trample'],
    });
    // CR 302.6: it came under the player's control this turn, and its haste lets it attack anyway.
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack('Forest', true);
  });

  test('the land creature keeps its land abilities and can still tap for mana (CR 205.1b)', () => {
    const g = board();
    g.act(0).playLand('Forest');
    animate(g, 'Forest');
    expect(g.act(0).try.tapForMana('Forest').ok).toBe(true);
  });

  test('"Land creatures you control have trample": a land that is a creature has it, a plain land does not (CR 613.1f)', () => {
    const g = board();
    g.act(0).playLand('Forest');
    animate(g, 'Forest');
    g.expect.derived('Forest', { keywords: ['haste', 'trample'] });
    g.expect.derived('Mountain', { types: ['land'], keywords: [] });
  });

  test('"you may": declining leaves the land alone', () => {
    const g = board();
    g.act(0).playLand('Forest');
    animate(g, 'Forest', false);
    g.expect.derived('Forest', { types: ['land'], keywords: [] });
  });

  test('the target may be another land of its controller, but not a land another player controls', () => {
    const g = board();
    g.act(0).playLand('Forest');
    expect(() => g.act(0).chooseTargets('Plains')).toThrow();
    expect(() => g.act(0).chooseTargets('Island')).toThrow();
    animate(g, 'Mountain');
    g.expect.pt('Mountain', 3, 3);
    g.expect.derived('Forest', { types: ['land'] });
  });

  test('it lasts until end of turn only', () => {
    const g = board();
    g.act(0).playLand('Forest');
    animate(g, 'Forest');
    g.expect.derived('Forest', { types: ['land', 'creature'] });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.derived('Forest', { types: ['land'], subtypes: ['Forest'], keywords: [] });
  });

  test('a land that came under control this turn cannot attack without the haste the ability gives (CR 302.6)', () => {
    // Two seats: the negative form of `canAttack` names the one opponent itself.
    const g = scenario()
      .define(fury)
      .seat(0)
      .library(...LIBRARY)
      .hand('Forest')
      .battlefield(fury.name, 'Mountain')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).playLand('Forest');
    animate(g, 'Mountain');
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack('Forest', false);
    g.expect.canAttack('Mountain', true);
  });
});

describe('Embodiment of Insight', () => {
  const insight = real('Embodiment of Insight');

  test('lands that are creatures have vigilance, and the landfall ability is the same animation', () => {
    const g = scenario({ seats: 4 })
      .define(insight)
      .seat(0)
      .library(...LIBRARY)
      .hand('Forest')
      .battlefield(insight.name, 'Mountain')
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .seat(3)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).playLand('Forest');
    animate(g, 'Forest');
    g.expect.pt('Forest', 3, 3);
    g.expect.derived('Forest', {
      types: ['land', 'creature'],
      subtypes: ['Forest', 'Elemental'],
      keywords: ['haste', 'vigilance'],
    });
  });
});

describe('Sylvan Awakening', () => {
  const awakening = real('Sylvan Awakening');

  /** Three seats: seat 0 has the spell, a Plains in hand and four lands; the others have one land each. */
  const board = () =>
    scenario({ seats: 3 })
      .define(awakening)
      .seat(0)
      .library(...LIBRARY)
      .hand(awakening.name, 'Plains')
      .battlefield('Forest', 'Forest', 'Forest', 'Mountain')
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Island', 'Grizzly Bears')
      .seat(2)
      .library(...LIBRARY)
      .battlefield('Swamp')
      .at('precombatMain', { active: 0 })
      .build();

  const cast = () => {
    const g = board();
    g.act(0).cast(awakening.name, { pay: true });
    g.passAll();
    return g;
  };

  test('every land you control becomes a 2/2 Elemental creature with reach, indestructible and haste, and stays a land (CR 205.1b, 613.4b)', () => {
    const g = cast();
    for (const land of ['Forest[0]', 'Forest[1]', 'Forest[2]', 'Mountain']) {
      g.expect.pt(land, 2, 2);
      g.expect.derived(land, {
        types: ['land', 'creature'],
        keywords: ['reach', 'indestructible', 'haste'],
      });
    }
    g.expect.derived('Mountain', { subtypes: ['Mountain', 'Elemental'] });
  });

  test('the lands of the other players are not affected, however many they are', () => {
    const g = cast();
    g.expect.derived('Island', { types: ['land'], keywords: [] });
    g.expect.derived(
      { name: 'Swamp', seat: 2, zone: 'battlefield' },
      { types: ['land'], keywords: [] },
    );
    g.expect.pt('Grizzly Bears', 2, 2);
  });

  test('the set is fixed as the spell resolves: a land played afterwards is not a creature (CR 611.2c)', () => {
    const g = cast();
    g.act(0).playLand('Plains');
    g.expect.derived('Plains', { types: ['land'], keywords: [] });
  });

  test('the lands are creatures through the turn of every opponent and are lands again as the next turn of their controller begins (CR 500.1, 611.2a)', () => {
    const g = cast();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 1 });
    g.expect.derived('Forest[0]', { types: ['land', 'creature'] });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 2 });
    g.expect.derived('Mountain', { types: ['land', 'creature'] });
    g.expect.pt('Mountain', 2, 2);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 0 });
    g.expect.derived('Forest[0]', { types: ['land'], subtypes: ['Forest'], keywords: [] });
    g.expect.derived('Mountain', { types: ['land'], subtypes: ['Mountain'], keywords: [] });
  });

  test("on an opponent's turn a creature land can block (CR 509.1a)", () => {
    const g = cast();
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).attack('Grizzly Bears', { player: 0 });
    g.advanceTo('declareBlockers', { block: false });
    // A land blocks only because it is a creature now (CR 509.1a).
    g.act(0).declareBlockers([{ blocker: 'Mountain', attacker: 'Grizzly Bears' }]);
  });

  test('the lands can attack the turn it resolves (haste, CR 302.6), even a land that was tapped for the spell', () => {
    const g = cast();
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack('Mountain', true);
  });
});
