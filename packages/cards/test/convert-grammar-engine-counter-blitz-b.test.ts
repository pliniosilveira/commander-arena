// The Counter Blitz deck, group B (moving and removing counters, counter-based amounts and mana). The REAL Oracle text of O'aka, Traveling Merchant, Incubation Druid, Maester Seymour and
// Lulu, Stern Guardian from the golden corpus goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction. Rikku, Resourceful
// Guardian, Resourceful Defense, Tidus, Yuna's Guardian and Tromell, Seymour's Butler have one ability each in this group (the rest of each card is another group's): the real line of that
// ability goes through the grammar as a SYNTHETIC card ("SYNTHETIC Parsed ...") whose only text it is. Pins: CR 118.3, 122.1 and 602.2b (a counter taken off for a cost), CR 122.5 (moving
// a counter), CR 608.2d (the controller chooses), CR 701.34a (proliferate), CR 701.37a (monstrosity), CR 106.7 (mana a land could produce), CR 508.1b (an attack at a player) and CR 400.7.
import { readFileSync } from 'node:fs';
import { type CardDefinition, type PendingDecision, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

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

const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4
const ELVES = 'Llanowar Elves'; // 1/1
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

/** The options of the decision now pending (a `counterPick`). */
const pickOptions = (state: { pending: PendingDecision | null }): readonly string[] => {
  const d = state.pending;
  if (d?.kind !== 'chooseOption') throw new Error(`pending is ${d?.kind}`);
  expect(d.purpose).toBe('counterPick');
  return d.options;
};

describe('O\'aka, Traveling Merchant: "{T}, Remove a counter from a nonland permanent you control: Draw a card."', () => {
  const oaka = real("O'aka, Traveling Merchant");
  const OAKA = oaka.name;

  test('the AST: a tap and a counter of any kind from a nonland permanent you control', () => {
    expect(oaka.faces[0]?.abilities[0]).toMatchObject({
      kind: 'activated',
      cost: [
        { kind: 'tap' },
        {
          kind: 'removeCounters',
          count: 1,
          among: { controller: 'you', notTypes: ['land'] },
        },
      ],
      effect: { kind: 'draw' },
    });
  });

  const start = () =>
    scenario()
      .define(oaka)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(OAKA)
      .battlefield(ELVES, { label: 'elves', counters: { '+1/+1': 2, oil: 1 } })
      .battlefield(BEARS, { label: 'bears', counters: { charge: 1 } })
      .battlefield('Forest', { label: 'land', counters: { charge: 3 } })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'theirs', counters: { '+1/+1': 4 } })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the player chooses the permanent and the kind together; the counter is a cost, taken before the draw (CR 118.3, 122.1, 602.2b)', () => {
    const g = start();
    g.act(0).activate(OAKA);
    g.expect.pending('chooseOption', 0);
    // Only nonland permanents the player controls: not the Forest, not the opponent's Spider.
    expect(pickOptions(g.state)).toEqual([
      '+1/+1 counter on Llanowar Elves (yours)',
      'oil counter on Llanowar Elves (yours)',
      'charge counter on Grizzly Bears (yours)',
    ]);
    g.act(0).chooseOption('oil counter on Llanowar Elves (yours)');
    g.expect.counters('elves', { '+1/+1': 2 });
    g.expect.tapped(OAKA, true);
    g.expect.handSize(0, 0);
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.invariants();
  });

  test('the counter can come off the permanent itself, which is tapped for the cost', () => {
    const g = scenario()
      .define(oaka)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(OAKA, { counters: { '+1/+1': 1 } })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(OAKA);
    // One counter to take: nothing is asked.
    g.expect.pending('priority', 0);
    g.expect.counters(OAKA, {});
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test("cancel takes the activation back: the counter stays and O'aka is untapped (CR 733)", () => {
    const g = start();
    g.act(0).activate(OAKA);
    expect(g.act(0).try.action({ kind: 'cancel' }).ok).toBe(true);
    g.expect.counters('elves', { '+1/+1': 2, oil: 1 });
    g.expect.tapped(OAKA, false);
    g.expect.pending('priority', 0);
  });

  test('with no counter on a nonland permanent you control, the ability is not offered', () => {
    const g = scenario()
      .define(oaka)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(OAKA)
      .battlefield('Forest', { counters: { charge: 3 } })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { counters: { '+1/+1': 4 } })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    expect(g.act(0).try.activate(OAKA).ok).toBe(false);
  });
});

describe('Incubation Druid: mana of a type a land you control could produce, three with a +1/+1 counter, and Adapt 3', () => {
  const druid = real('Incubation Druid');
  const DRUID = druid.name;

  test('the AST: a "could produce" mana ability whose production, with a +1/+1 counter, is three of the type', () => {
    expect(druid.faces[0]?.abilities[0]).toMatchObject({
      kind: 'mana',
      production: { kind: 'couldProduce', anyType: true },
      instead: {
        condition: { kind: 'thisMatches' },
        production: { kind: 'couldProduce', anyType: true, count: 3 },
      },
    });
  });

  const start = (druidCounters: Record<string, number>) =>
    scenario()
      .define(druid)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(DRUID, { counters: druidCounters })
      .battlefield('Forest')
      .battlefield('Mountain')
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Island')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('with no counter it adds one mana of a type your lands could produce (CR 106.7)', () => {
    const g = start({});
    g.act(0).tapForMana(DRUID, { color: 'R' });
    g.expect.pool(0, 'R');
    g.expect.invariants();
  });

  test("a type only an opponent's land makes is not offered", () => {
    const g = start({});
    expect(g.act(0).try.tapForMana(DRUID, { color: 'U' }).ok).toBe(false);
    expect(g.act(0).try.tapForMana(DRUID, { color: 'G' }).ok).toBe(true);
  });

  test('with a +1/+1 counter it adds three mana of that one type instead', () => {
    const g = start({ '+1/+1': 1 });
    g.act(0).tapForMana(DRUID, { color: 'G' });
    g.expect.pool(0, 'GGG');
    g.expect.invariants();
  });

  test('{3}{G}{G}: Adapt 3 puts three +1/+1 counters on it only when it has none (CR 701.46a)', () => {
    const g = scenario()
      .define(druid)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(DRUID)
      .battlefield('Forest', { count: 5 })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(DRUID, { ability: 1, pay: true });
    g.passAll();
    g.expect.counters(DRUID, { '+1/+1': 3 });
    g.expect.pt(DRUID, 3, 5);
  });
});

describe('Maester Seymour: "Monstrosity X, where X is the number of counters among creatures you control."', () => {
  const seymour = real('Maester Seymour');
  const SEYMOUR = seymour.name;

  test('the AST: monstrosity of the counters among the creatures you control', () => {
    expect(seymour.faces[0]?.abilities[1]).toMatchObject({
      kind: 'activated',
      effect: {
        kind: 'monstrosity',
        count: { kind: 'aggregate', stat: 'counters', filter: { types: ['creature'] } },
      },
    });
  });

  const start = () =>
    scenario()
      .define(seymour)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SEYMOUR, { counters: { '+1/+1': 1 } })
      .battlefield('Forest', { count: 5 })
      .battlefield(ELVES, { label: 'elves', counters: { '+1/+1': 2, oil: 1 } })
      .battlefield('Forest', { label: 'land', counters: { charge: 4 } })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { counters: { '+1/+1': 4 } })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('X counts every counter on the creatures you control, itself included, and only those (CR 701.37a)', () => {
    const g = start();
    g.act(0).activate(SEYMOUR, { ability: 1, pay: true });
    g.passAll();
    // 1 on Seymour + 3 on the Elves = 4; the land's and the opponent's counters are not counted.
    g.expect.counters(SEYMOUR, { '+1/+1': 5 });
    g.expect.invariants();
  });

  test('a monstrous creature stays monstrous: a second use adds nothing (CR 701.37b)', () => {
    const g = scenario()
      .define(seymour)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SEYMOUR, { counters: { '+1/+1': 1 } })
      .battlefield('Forest', { count: 10 })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(SEYMOUR, { ability: 1, pay: true });
    g.passAll();
    g.expect.counters(SEYMOUR, { '+1/+1': 2 });
    g.act(0).activate(SEYMOUR, { ability: 1, pay: true });
    g.passAll();
    g.expect.counters(SEYMOUR, { '+1/+1': 2 });
  });

  test('at the beginning of combat it puts counters equal to its power on another creature you control', () => {
    const g = scenario()
      .define(seymour)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SEYMOUR, { counters: { '+1/+1': 2 } })
      .battlefield(ELVES, { label: 'elves' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('beginningOfCombat', { attack: false });
    g.passAll();
    g.expect.counters('elves', { '+1/+1': 3 });
  });
});

describe('Lulu, Stern Guardian: "Whenever an opponent attacks you, choose target creature attacking you. Put a stun counter on that creature."', () => {
  const lulu = real('Lulu, Stern Guardian');
  const LULU = lulu.name;

  test('the AST: an attack batch of an opponent that attacked you, and a stun counter on the target', () => {
    expect(lulu.faces[0]?.abilities[0]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'attackBatch', who: 'opponent', atLeast: 1, attackedYou: true },
      targets: [{ what: { filter: { attackingYou: true } } }],
    });
  });

  const board = () =>
    scenario({ seats: 3 })
      .define(lulu)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(LULU)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(SPIDER, ELVES)
      .seat(2)
      .library(...LIBRARY)
      .battlefield('Forest')
      .at('precombatMain', { active: 1, turn: 2 })
      .build();

  test('an opponent attacks me with two creatures: one trigger, one stun counter on the creature I choose (CR 603.2c)', () => {
    const g = board();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).declareAttackers([
      { attacker: BEARS, target: { player: 0 } },
      { attacker: SPIDER, target: { player: 0 } },
    ]);
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets(SPIDER);
    g.expect.stack([`${LULU} (ability)`]);
    g.passAll();
    g.expect.counters(SPIDER, { stun: 1 });
    g.expect.counters('bears', {});
    g.expect.invariants();
  });

  test('only a creature attacking me is a legal target (CR 508.1b): not one attacking another player', () => {
    const g = board();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).declareAttackers([
      { attacker: BEARS, target: { player: 0 } },
      { attacker: SPIDER, target: { player: 2 } },
    ]);
    // The only creature attacking me is the Bears, so it is the target.
    g.expect.stack([`${LULU} (ability)`]);
    g.passAll();
    g.expect.counters('bears', { stun: 1 });
    g.expect.counters(SPIDER, {});
  });

  test('an opponent attacking only a third player does not trigger it', () => {
    const g = board();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).declareAttackers([{ attacker: BEARS, target: { player: 2 } }]);
    g.expect.stack([]);
  });

  test('I attacking an opponent does not trigger it', () => {
    const g = scenario({ seats: 3 })
      .define(lulu)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(LULU, BEARS)
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: BEARS, target: { player: 1 } }]);
    g.expect.stack([]);
  });

  test('{3}{U}: Proliferate gives each chosen permanent another counter of each kind it has (CR 701.34a)', () => {
    const g = scenario()
      .define(lulu)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(LULU)
      .battlefield('Island', { count: 4 })
      .battlefield(ELVES, { label: 'elves', counters: { '+1/+1': 1, oil: 2 } })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'theirs', counters: { '-1/-1': 1 } })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(LULU, { pay: true });
    g.passAll();
    g.act(0).choosePermanents('elves');
    g.expect.counters('elves', { '+1/+1': 2, oil: 3 });
    g.expect.counters('theirs', { '-1/-1': 1 });
  });
});

describe('Rikku, Resourceful Guardian, Steal: "{1}, {T}: Move a counter from target creature an opponent controls onto target creature you control. Activate only as a sorcery."', () => {
  const rikku = parsed(
    'SYNTHETIC Parsed Rikku',
    'Legendary Creature — Human Artificer',
    '{1}, {T}: Move a counter from target creature an opponent controls onto target creature you control. Activate only as a sorcery.',
    { manaCost: '{2}{U}', power: '2', toughness: '3', colors: ['U'] },
  );
  const RIKKU = rikku.name;

  test('the AST: a sorcery-speed move between two different targets', () => {
    expect(rikku.faces[0]?.abilities[0]).toMatchObject({
      kind: 'activated',
      effect: { kind: 'moveCounter', from: { kind: 'target' }, to: { kind: 'target' } },
      timing: 'sorcery',
    });
    expect(rikku.faces[0]?.abilities[0]).not.toHaveProperty('effect.anyNumber');
  });

  const start = (theirs: Record<string, number>) =>
    scenario()
      .define(rikku)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(RIKKU)
      .battlefield('Forest')
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'theirs', counters: theirs })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test("a counter moves from the opponent's creature onto mine (CR 122.5)", () => {
    const g = start({ '+1/+1': 2 });
    g.act(0).activate(RIKKU, { targets: ['theirs', 'mine'], pay: true });
    g.passAll();
    g.expect.counters('theirs', { '+1/+1': 1 });
    g.expect.counters('mine', { '+1/+1': 1 });
    g.expect.invariants();
  });

  test('with two kinds the controller chooses which one is stolen', () => {
    const g = start({ '+1/+1': 1, stun: 1 });
    g.act(0).activate(RIKKU, { targets: ['theirs', 'mine'], pay: true });
    g.passAll();
    expect(pickOptions(g.state)).toEqual([
      "+1/+1 counter on Giant Spider (opponent's)",
      "stun counter on Giant Spider (opponent's)",
    ]);
    g.act(0).chooseOption("stun counter on Giant Spider (opponent's)");
    g.expect.counters('theirs', { '+1/+1': 1 });
    g.expect.counters('mine', { stun: 1 });
  });

  test("the first target must be an opponent's creature and the second mine (CR 115.1)", () => {
    const g = start({ '+1/+1': 1 });
    expect(() => g.act(0).activate(RIKKU, { targets: ['mine', 'theirs'], pay: true })).toThrow();
  });

  test('only as a sorcery', () => {
    const g = start({ '+1/+1': 1 });
    g.expect.legal(0, { activate: RIKKU });
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.illegal(0, { activate: RIKKU });
  });
});

describe('Resourceful Defense: "{4}{W}: Move any number of counters from target permanent you control onto a second target permanent you control."', () => {
  const defense = parsed(
    'SYNTHETIC Parsed Resourceful Defense',
    'Enchantment',
    '{4}{W}: Move any number of counters from target permanent you control onto a second target permanent you control.',
    { manaCost: '{2}{W}', colors: ['W'] },
  );
  const DEFENSE = defense.name;

  test('the AST: a move of any number of counters between two targets', () => {
    expect(defense.faces[0]?.abilities[0]).toMatchObject({
      kind: 'activated',
      effect: {
        kind: 'moveCounter',
        from: { kind: 'target' },
        to: { kind: 'target' },
        anyNumber: true,
      },
    });
  });

  const start = (mine: Record<string, number>) =>
    scenario()
      .define(defense)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(DEFENSE)
      .battlefield('Plains', { count: 5 })
      .battlefield(ELVES, { label: 'from', counters: mine })
      .battlefield(BEARS, { label: 'to' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the controller moves counters one at a time, of the kinds they choose, and may stop (CR 122.5, 608.2d)', () => {
    const g = start({ '+1/+1': 2, oil: 1 });
    g.act(0).activate(DEFENSE, { targets: ['from', 'to'], pay: true });
    g.passAll();
    // Three counters could go, and "Done" is the last option.
    expect(pickOptions(g.state)).toEqual([
      '+1/+1 counter on Llanowar Elves (yours)',
      'oil counter on Llanowar Elves (yours)',
      'Done',
    ]);
    g.act(0).chooseOption('oil counter on Llanowar Elves (yours)');
    g.act(0).chooseOption('+1/+1 counter on Llanowar Elves (yours)');
    g.expect.counters('from', { '+1/+1': 1 });
    g.expect.counters('to', { '+1/+1': 1, oil: 1 });
    g.act(0).chooseOption('Done');
    g.expect.counters('from', { '+1/+1': 1 });
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('moving every counter ends the question by itself', () => {
    const g = start({ oil: 2 });
    g.act(0).activate(DEFENSE, { targets: ['from', 'to'], pay: true });
    g.passAll();
    g.act(0).chooseOption('oil counter on Llanowar Elves (yours)');
    g.act(0).chooseOption('oil counter on Llanowar Elves (yours)');
    g.expect.counters('from', {});
    g.expect.counters('to', { oil: 2 });
    g.expect.pending('priority', 0);
  });

  test('"any number" includes none: stopping at once moves nothing', () => {
    const g = start({ oil: 2 });
    g.act(0).activate(DEFENSE, { targets: ['from', 'to'], pay: true });
    g.passAll();
    g.act(0).chooseOption('Done');
    g.expect.counters('from', { oil: 2 });
    g.expect.counters('to', {});
  });

  test('a permanent with no counter: nothing is asked and nothing moves', () => {
    const g = start({});
    g.act(0).activate(DEFENSE, { targets: ['from', 'to'], pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
    g.expect.counters('to', {});
  });
});

describe('Tidus, Yuna\'s Guardian: "At the beginning of combat on your turn, you may move a counter from target creature you control onto a second target creature you control."', () => {
  const tidus = parsed(
    'SYNTHETIC Parsed Tidus',
    'Legendary Creature — Human Warrior',
    'At the beginning of combat on your turn, you may move a counter from target creature you control onto a second target creature you control.',
    { manaCost: '{G}{W}{U}', power: '3', toughness: '3', colors: ['G', 'W', 'U'] },
  );
  const TIDUS = tidus.name;

  const start = () =>
    scenario()
      .define(tidus)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(TIDUS)
      .battlefield(ELVES, { label: 'elves', counters: { '+1/+1': 1 } })
      .battlefield(BEARS, { label: 'bears' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the AST: an optional move between two targets of a beginning-of-combat trigger', () => {
    expect(tidus.faces[0]?.abilities[0]).toMatchObject({
      kind: 'triggered',
      effect: { kind: 'moveCounter', from: { kind: 'target' }, to: { kind: 'target' } },
    });
  });

  test('I may move the counter at the beginning of combat (CR 603.5, 122.5)', () => {
    const g = start();
    g.advanceTo('beginningOfCombat', { attack: false });
    g.act(0).chooseTargets('elves', 'bears');
    g.passAll();
    g.act(0).accept();
    g.expect.counters('elves', {});
    g.expect.counters('bears', { '+1/+1': 1 });
  });

  test('or decline: nothing moves', () => {
    const g = start();
    g.advanceTo('beginningOfCombat', { attack: false });
    g.act(0).chooseTargets('elves', 'bears');
    g.passAll();
    g.act(0).decline();
    g.expect.counters('elves', { '+1/+1': 1 });
    g.expect.counters('bears', {});
  });
});

describe('Tromell, Seymour\'s Butler: "{1}, {T}: Proliferate X times, where X is the number of nontoken creatures you control that entered this turn."', () => {
  const tromell = parsed(
    'SYNTHETIC Parsed Tromell',
    'Legendary Creature — Elf Advisor',
    '{1}, {T}: Proliferate X times, where X is the number of nontoken creatures you control that entered this turn.',
    { manaCost: '{2}{G}', power: '2', toughness: '3', colors: ['G'] },
  );
  const TROMELL = tromell.name;

  test('the AST: proliferate that many times, X counting the nontoken creatures that entered this turn', () => {
    expect(tromell.faces[0]?.abilities[0]).toMatchObject({
      kind: 'activated',
      effect: {
        kind: 'proliferate',
        times: {
          kind: 'countOf',
          filter: { types: ['creature'], controller: 'you', token: false, enteredThisTurn: true },
        },
      },
    });
  });

  const start = (entered: string[]) =>
    scenario()
      .define(tromell)
      .seat(0)
      .library(...LIBRARY)
      .hand(...entered)
      .battlefield(TROMELL)
      .battlefield('Forest', { count: 14 })
      .battlefield(ELVES, { label: 'old', counters: { oil: 1 } })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('no creature entered this turn: X is 0 and nothing is proliferated', () => {
    const g = start([]);
    g.act(0).activate(TROMELL, { pay: true });
    g.passAll();
    g.expect.counters('old', { oil: 1 });
    g.expect.pending('priority', 0);
  });

  test('two nontoken creatures entered this turn: it proliferates twice, with a choice each time (CR 701.34a)', () => {
    const g = start([BEARS, SPIDER]);
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.act(0).cast(SPIDER, { pay: true });
    g.passAll();
    g.act(0).activate(TROMELL, { pay: true });
    g.passAll();
    g.act(0).choosePermanents('old');
    g.act(0).choosePermanents('old');
    g.expect.counters('old', { oil: 3 });
    g.expect.invariants();
  });

  test('a creature that was already on the battlefield is not counted', () => {
    const g = start([BEARS]);
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.act(0).activate(TROMELL, { pay: true });
    g.passAll();
    g.act(0).choosePermanents('old');
    g.expect.counters('old', { oil: 2 });
    g.expect.pending('priority', 0);
  });
});
