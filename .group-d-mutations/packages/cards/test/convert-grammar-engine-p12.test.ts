// Parsed text is only worth something if the engine runs it as written (stage P12). These tests
// import SYNTHETIC cards through the grammar (never through a fixture), define them in an engine
// scenario and play them through applyAction: "can't block", "can't be blocked", "attacks each
// combat if able", "doesn't untap during your untap step", "can't be countered" on a spell and on
// a creature, an Equipment and an Aura that give them to their host, a group, "target creature
// can't be blocked this turn" as a spell, a land's ability and a trigger, and the landwalk keywords.
// Every card name starts with "SYNTHETIC"; the Oracle text is template text (the real line of the
// shape in reports/template-replay.md) or marked SYNTHETIC where no real line has the shape. No
// real card's text is claimed; the real cards used as attackers, blockers and counters (Grizzly
// Bears, Giant Spider, Counterspell, the basic lands, Command Tower) are the engine's own fixtures.
// Each rule is read the way the engine's `applyAction`, its legal-action list and the blockers
// decision's candidates all say it (they must agree), so a lowering that the engine runs
// differently from what the words say fails here.
import {
  type Action,
  applyAction,
  type CardDefinition,
  getLegalActions,
} from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

type Builder = ReturnType<typeof scenario>;
type Ref = Parameters<ScenarioGame['id']>[0];

const creature = (name: string, text: string, power = '2', toughness = '2') =>
  parsed(name, 'Creature — Bear', text, { manaCost: '{1}{G}', power, toughness, colors: ['G'] });

const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4
const COUNTERSPELL = 'Counterspell';

/**
 * Seat 0 attacks with `attackers`; seat 1 has what `seat1` puts on the battlefield. Returns the game
 * at the declare blockers step: seat 1's decision, or priority when nothing can block.
 */
function attackedGame(
  defs: readonly CardDefinition[],
  attackers: readonly string[],
  seat1: (b: Builder) => void,
  seat0: (b: Builder) => void = () => {},
): ScenarioGame {
  const b = scenario().seat(0).library('Island', { count: 4 });
  for (const def of defs) b.define(def);
  for (const a of attackers) b.battlefield(a);
  seat0(b);
  b.seat(1).library('Island', { count: 4 });
  seat1(b);
  const g = b.at('precombatMain', { active: 0 }).build();
  g.advanceTo('declareAttackers');
  g.act(0).attack(attackers);
  g.advanceTo('declareBlockers');
  return g;
}

/**
 * Whether seat 1 may block `attacker` with `blocker` alone. What `applyAction` accepts, what the
 * legal-action list offers and what the decision's candidates say must agree (CR 509.1b).
 */
function canBlock(g: ScenarioGame, blocker: Ref, attacker: Ref): boolean {
  const action: Action = {
    kind: 'declareBlockers',
    blocks: [{ blocker: g.id(blocker), attacker: g.id(attacker) }],
  };
  const accepted = applyAction(g.state, 1, action).ok;
  const listed = getLegalActions(g.state, 1).some(
    (a) => JSON.stringify(a) === JSON.stringify(action),
  );
  const d = g.state.pending;
  const candidate =
    d?.kind === 'declareBlockers' &&
    d.candidates.some((c) => c.blocker === g.id(blocker) && c.canBlock.includes(g.id(attacker)));
  expect({ accepted, listed, candidate }, JSON.stringify(blocker)).toEqual({
    accepted,
    listed: accepted,
    candidate: accepted,
  });
  return accepted;
}

const restrictionsOf = (g: ScenarioGame, name: string, seat: 0 | 1 = 0) =>
  g.view(seat).battlefield.find((o) => o.name === name)?.restrictions ?? [];

describe('"~ can\'t block." (CR 509.1b)', () => {
  const walled = () => creature('SYNTHETIC Parsed Sleeper', "~ can't block.");

  test('the creature is not a candidate and its block is refused; another creature blocks', () => {
    const card = walled();
    const g = attackedGame([card], [BEARS], (b) => b.battlefield(card.name, SPIDER));
    expect(canBlock(g, card.name, BEARS)).toBe(false);
    expect(canBlock(g, SPIDER, BEARS)).toBe(true);
    expect(g.act(1).try.declareBlockers([{ blocker: card.name, attacker: BEARS }])).toEqual({
      ok: false,
      error: 'That creature cannot block',
    });
  });

  test('alone, it leaves nothing to ask: the attacker is unblocked', () => {
    const card = walled();
    const g = attackedGame([card], [BEARS], (b) => b.battlefield(card.name));
    g.expect.pending('priority', 0);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 38);
  });

  test('it can still attack', () => {
    const card = walled();
    const g = scenario()
      .define(card)
      .seat(0)
      .battlefield(card.name)
      .library('Island', { count: 4 })
      .seat(1)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.expect.canAttack(card.name, true);
  });
});

describe('"~ can\'t be blocked." (CR 509.1b)', () => {
  test('no creature can block it, however many the defender has; another attacker can be blocked', () => {
    const card = creature('SYNTHETIC Parsed Shade', "~ can't be blocked.");
    const g = attackedGame([card], [card.name, BEARS], (b) => b.battlefield(SPIDER, 'Serra Angel'));
    expect(canBlock(g, SPIDER, card.name)).toBe(false);
    expect(canBlock(g, 'Serra Angel', card.name)).toBe(false);
    expect(canBlock(g, SPIDER, BEARS)).toBe(true);
  });

  test('"~ can\'t block and can\'t be blocked." is both abilities', () => {
    const card = creature('SYNTHETIC Parsed Ghost', "~ can't block and can't be blocked.");
    const g = scenario().define(card).seat(0).battlefield(card.name).seat(1).build();
    expect(restrictionsOf(g, card.name)).toEqual(['cantBlock', 'cantBeBlocked']);
  });
});

describe('"~ attacks each combat if able." (CR 508.1d)', () => {
  const beast = () => creature('SYNTHETIC Parsed Berserker', '~ attacks each combat if able.');
  const atAttackers = (card: CardDefinition) => {
    const g = scenario()
      .define(card)
      .seat(0)
      .battlefield(card.name, BEARS)
      .library('Island', { count: 4 })
      .seat(1)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    return g;
  };

  test('the decision names it, and a declaration without it is refused', () => {
    const card = beast();
    const g = atAttackers(card);
    const d = g.state.pending;
    if (d?.kind !== 'declareAttackers')
      throw new Error(`expected declareAttackers, got ${d?.kind}`);
    expect(d.mustAttack).toEqual([g.id(card.name)]);
    expect(g.act(0).try.declareAttackers([]).ok).toBe(false);
    expect(g.act(0).try.declareAttackers([{ attacker: BEARS }]).ok).toBe(false);
  });

  test('declaring it, alone or with another creature, is accepted', () => {
    const card = beast();
    const g = atAttackers(card);
    g.act(0).attack([card.name, BEARS]);
    g.expect.combat({ attackers: [card.name, BEARS] });
  });
});

describe('"~ doesn\'t untap during your untap step." (CR 502.3)', () => {
  test("it stays tapped through its controller's untap step; the others untap", () => {
    const card = creature(
      'SYNTHETIC Parsed Sleepy Giant',
      "~ doesn't untap during your untap step.",
    );
    const g = scenario()
      .define(card)
      .seat(0)
      .library('Island', { count: 4 })
      .battlefield(card.name, { tapped: true })
      .battlefield(BEARS, { tapped: true })
      .seat(1)
      .library('Island', { count: 4 })
      .at('end', { active: 1, turn: 2 })
      .build();
    g.advanceTo('upkeep');
    g.expect.tapped(card.name, true);
    g.expect.tapped(BEARS, false);
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped(card.name, true);
  });
});

describe('"This spell can\'t be countered." and "~ can\'t be countered." (CR 101.2, 113.6g)', () => {
  const cast = (spell: CardDefinition, lands: readonly string[], target?: string) => {
    const g = scenario()
      .define(spell)
      .seat(0)
      .hand(spell.name)
      .battlefield(...lands)
      .seat(1)
      .hand(COUNTERSPELL)
      .battlefield('Island', 'Island', 'Island')
      .battlefield(SPIDER)
      .build();
    g.act(0).cast(spell.name, { ...(target ? { targets: [target] } : {}), pay: true });
    g.act(0).pass();
    g.act(1).cast(COUNTERSPELL, { targets: [{ name: spell.name, zone: 'stack' }], pay: true });
    return g;
  };

  test('an instant that says it resolves although Counterspell resolved first', () => {
    const spell = parsed(
      'SYNTHETIC Parsed Stubborn Kill',
      'Instant',
      "This spell can't be countered.\nDestroy target creature.",
      { manaCost: '{1}{B}', colors: ['B'] },
    );
    const g = cast(spell, ['Swamp', 'Swamp'], SPIDER);
    g.pass().pass();
    g.expect.stack([spell.name]);
    g.pass().pass();
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
    g.expect.zone(spell.name, 'graveyard', { seat: 0 });
  });

  test('the control: the same instant without the sentence is countered', () => {
    const spell = parsed('SYNTHETIC Parsed Plain Kill', 'Instant', 'Destroy target creature.', {
      manaCost: '{1}{B}',
      colors: ['B'],
    });
    const g = cast(spell, ['Swamp', 'Swamp'], SPIDER);
    g.pass().pass();
    g.expect.zone(spell.name, 'graveyard', { seat: 0 });
    g.expect.zone(SPIDER, 'battlefield', { seat: 1 });
  });

  test('a creature spell that says it enters although it was "countered"', () => {
    const beast = parsed(
      'SYNTHETIC Parsed Stubborn Beast',
      'Creature — Beast',
      "~ can't be countered.",
      { manaCost: '{1}{G}', power: '3', toughness: '3', colors: ['G'] },
    );
    const g = cast(beast, ['Forest', 'Forest']);
    g.pass().pass();
    g.pass().pass();
    g.expect.zone(beast.name, 'battlefield', { seat: 0 });
  });
});

describe('what an Equipment and an Aura say of their host', () => {
  const veil = () =>
    parsed(
      'SYNTHETIC Parsed Veil Blade',
      'Artifact — Equipment',
      "Equipped creature can't be blocked and has shroud.\nEquip {1}",
      { manaCost: '{1}' },
    );

  test('"Equipped creature can\'t be blocked and has shroud." follows the Equipment', () => {
    const blade = veil();
    const build = (equipped: boolean) =>
      attackedGame(
        [blade],
        [BEARS],
        (b) => b.battlefield(SPIDER),
        (b) => b.battlefield(blade.name, equipped ? { attachedTo: BEARS } : {}),
      );
    const on = build(true);
    expect(canBlock(on, SPIDER, BEARS)).toBe(false);
    expect(restrictionsOf(on, BEARS)).toEqual(['cantBeBlocked']);
    expect(on.view(0).battlefield.find((o) => o.name === BEARS)?.keywords).toContain('shroud');
    // The control: the same Equipment lying unattached gives nothing.
    expect(canBlock(build(false), SPIDER, BEARS)).toBe(true);
  });

  test('equipping pays and attaches at resolution, and the restriction moves with it', () => {
    const blade = veil();
    const g = scenario()
      .define(blade)
      .seat(0)
      .battlefield(blade.name, 'Forest', BEARS, 'Serra Angel')
      .seat(1)
      .build();
    expect(restrictionsOf(g, BEARS)).toEqual([]);
    g.act(0).activate(blade.name, { targets: [BEARS], pay: true });
    g.passAll();
    expect(restrictionsOf(g, BEARS)).toEqual(['cantBeBlocked']);
    expect(restrictionsOf(g, 'Serra Angel')).toEqual([]);
  });

  test('an Aura: "Enchanted creature can\'t block." and "doesn\'t untap" (SYNTHETIC)', () => {
    const aura = parsed(
      'SYNTHETIC Parsed Chains',
      'Enchantment — Aura',
      "Enchant creature\nEnchanted creature can't block.\nEnchanted creature doesn't untap during its controller's untap step.",
      { manaCost: '{1}{W}', colors: ['W'] },
    );
    const g = attackedGame(
      [aura],
      [BEARS],
      (b) => b.battlefield(SPIDER, 'Serra Angel'),
      (b) => b.battlefield(aura.name, { attachedTo: SPIDER }),
    );
    expect(canBlock(g, SPIDER, BEARS)).toBe(false);
    expect(canBlock(g, 'Serra Angel', BEARS)).toBe(true);
    expect(restrictionsOf(g, SPIDER, 1)).toEqual(['cantBlock', 'doesntUntap']);

    const untap = scenario()
      .define(aura)
      .seat(0)
      .library('Island', { count: 4 })
      .seat(1)
      .library('Island', { count: 4 })
      .battlefield(SPIDER, { tapped: true })
      .battlefield('Serra Angel', { tapped: true })
      .seat(0)
      .battlefield(aura.name, { attachedTo: SPIDER })
      .at('end', { active: 0, turn: 1 })
      .build();
    untap.advanceTo('upkeep', { turn: 'next' });
    untap.expect.tapped(SPIDER, true);
    untap.expect.tapped('Serra Angel', false);
  });
});

describe('"Creatures your opponents control can\'t block." (SYNTHETIC; CR 611.3)', () => {
  test("it stops the opponent's creatures and not its controller's", () => {
    const banner = parsed(
      'SYNTHETIC Parsed Banner',
      'Enchantment',
      "Creatures your opponents control can't block.",
      { manaCost: '{2}{R}', colors: ['R'] },
    );
    const g = attackedGame(
      [banner],
      [BEARS],
      (b) => b.battlefield(SPIDER),
      (b) => b.battlefield(banner.name),
    );
    g.expect.pending('priority', 0);
    expect(canBlock(g, SPIDER, BEARS)).toBe(false);
    expect(restrictionsOf(g, SPIDER, 1)).toEqual(['cantBlock']);
    expect(restrictionsOf(g, BEARS)).toEqual([]);
  });
});

describe('"Target creature can\'t be blocked this turn." as an effect (CR 509.1b, 611.2a, 514.2)', () => {
  const ghostStep = () =>
    parsed(
      'SYNTHETIC Parsed Ghost Step',
      'Instant',
      "Target creature can't be blocked this turn.",
      {
        manaCost: '{U}',
        colors: ['U'],
      },
    );
  const world = (spell: CardDefinition) =>
    scenario()
      .define(spell)
      .seat(0)
      .battlefield(BEARS, 'Island')
      .hand(spell.name)
      .library('Island', { count: 4 })
      .seat(1)
      .battlefield(SPIDER)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();

  test('cast before blockers, it makes the attacker unblockable for the turn, and it ends', () => {
    const spell = ghostStep();
    const g = world(spell);
    g.act(0).cast(spell.name, { targets: [BEARS], pay: true });
    g.passAll();
    expect(restrictionsOf(g, BEARS)).toEqual(['cantBeBlocked']);
    g.advanceTo('declareAttackers');
    g.act(0).attack(BEARS);
    g.advanceTo('declareBlockers');
    expect(canBlock(g, SPIDER, BEARS)).toBe(false);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 38);
    g.advanceTo('upkeep', { turn: 'next' });
    expect(g.state.continuousEffects).toEqual([]);
    expect(restrictionsOf(g, BEARS)).toEqual([]);
  });

  test('"Target creature can\'t block this turn." on the defender, and it is the effect of a trigger', () => {
    const spell = parsed(
      'SYNTHETIC Parsed Muzzle',
      'Instant',
      "Target creature can't block this turn.",
      { manaCost: '{R}', colors: ['R'] },
    );
    const g = scenario()
      .define(spell)
      .seat(0)
      .battlefield(BEARS, 'Mountain')
      .hand(spell.name)
      .library('Island', { count: 4 })
      .seat(1)
      .battlefield(SPIDER)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(spell.name, { targets: [SPIDER], pay: true });
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).attack(BEARS);
    g.advanceTo('declareBlockers');
    g.expect.pending('priority', 0);
    expect(canBlock(g, SPIDER, BEARS)).toBe(false);

    const raider = creature(
      'SYNTHETIC Parsed Raider',
      "Whenever ~ attacks, target creature can't block this turn.",
    );
    const t = scenario()
      .define(raider)
      .seat(0)
      .battlefield(raider.name)
      .library('Island', { count: 4 })
      .seat(1)
      .battlefield(SPIDER)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    t.advanceTo('declareAttackers');
    t.act(0).attack(raider.name);
    t.act(0).chooseTargets(SPIDER);
    t.pass().pass();
    expect(restrictionsOf(t, SPIDER, 1)).toEqual(['cantBlock']);
    t.advanceTo('declareBlockers');
    t.expect.pending('priority', 0);
  });

  test("Rogue's Passage: {4}, {T}: Target creature can't be blocked this turn.", () => {
    const gate = parsed(
      'SYNTHETIC Parsed Rogue Gate',
      'Land',
      "{T}: Add {C}.\n{4}, {T}: Target creature can't be blocked this turn.",
    );
    const g = scenario()
      .define(gate)
      .seat(0)
      .battlefield(BEARS, gate.name, 'Forest', 'Forest', 'Forest', 'Forest')
      .library('Island', { count: 4 })
      .seat(1)
      .battlefield(SPIDER)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(gate.name, { ability: 1, targets: [BEARS], pay: true });
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).attack(BEARS);
    g.advanceTo('declareBlockers');
    expect(canBlock(g, SPIDER, BEARS)).toBe(false);
  });

  test('"Target creature attacks this turn if able." names it in the attack decision (SYNTHETIC)', () => {
    const spell = parsed(
      'SYNTHETIC Parsed Goad',
      'Instant',
      'Target creature attacks this turn if able.',
      { manaCost: '{R}', colors: ['R'] },
    );
    const g = scenario()
      .define(spell)
      .seat(0)
      .battlefield(BEARS, 'Mountain')
      .hand(spell.name)
      .library('Island', { count: 4 })
      .seat(1)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(spell.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    const d = g.state.pending;
    if (d?.kind !== 'declareAttackers')
      throw new Error(`expected declareAttackers, got ${d?.kind}`);
    expect(d.mustAttack).toEqual([g.id(BEARS)]);
  });
});

describe('landwalk (CR 702.14c)', () => {
  test('Islandwalk: an Island makes the attacker unblockable, no Island does not', () => {
    const walker = creature('SYNTHETIC Parsed Islandwalker', 'Islandwalk');
    const withIsland = attackedGame([walker], [walker.name], (b) => b.battlefield('Island', BEARS));
    expect(canBlock(withIsland, BEARS, walker.name)).toBe(false);
    const without = attackedGame([walker], [walker.name], (b) =>
      b.battlefield('Forest', 'Swamp', BEARS),
    );
    expect(canBlock(without, BEARS, walker.name)).toBe(true);
  });

  test('each basic landwalk looks for its own land type', () => {
    const cases = [
      ['Plainswalk', 'Plains'],
      ['Swampwalk', 'Swamp'],
      ['Mountainwalk', 'Mountain'],
      ['Forestwalk', 'Forest'],
    ] as const;
    for (const [word, land] of cases) {
      const walker = creature(`SYNTHETIC Parsed ${word}`, word);
      const other = land === 'Plains' ? 'Island' : 'Plains';
      const hit = attackedGame([walker], [walker.name], (b) => b.battlefield(land, BEARS));
      expect(canBlock(hit, BEARS, walker.name), word).toBe(false);
      const miss = attackedGame([walker], [walker.name], (b) => b.battlefield(other, BEARS));
      expect(canBlock(miss, BEARS, walker.name), word).toBe(true);
    }
  });

  test('"Nonbasic landwalk": a nonbasic land, and no basic one, makes it unblockable', () => {
    const walker = creature('SYNTHETIC Parsed Nonbasic Walker', 'Nonbasic landwalk');
    const nonbasic = attackedGame([walker], [walker.name], (b) =>
      b.battlefield('Command Tower', BEARS),
    );
    expect(canBlock(nonbasic, BEARS, walker.name)).toBe(false);
    const basic = attackedGame([walker], [walker.name], (b) => b.battlefield('Island', BEARS));
    expect(canBlock(basic, BEARS, walker.name)).toBe(true);
  });

  test('a mixed keyword line: "Flying, islandwalk" is both keywords', () => {
    const flyer = creature('SYNTHETIC Parsed Flying Walker', 'Flying, islandwalk');
    const g = scenario().define(flyer).seat(0).battlefield(flyer.name).seat(1).build();
    const view = g.view(0).battlefield.find((o) => o.name === flyer.name);
    expect(view?.keywords).toContain('flying');
    expect(view?.landwalks).toEqual(['Island']);
  });
});
