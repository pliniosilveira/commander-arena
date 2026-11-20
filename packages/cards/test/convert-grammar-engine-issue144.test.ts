// Issue 144 (the Goblin deck): the Oracle text of Searslicer Goblin, Quest for the Goblin Lord and General Kreat, the Boltbringer goes through the grammar as a card with no
// override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs. The cards are built
// with `syntheticCard` (SYNTHETIC stored cards: the Oracle text is the card's, the rest of each stored card is invented), not read from the golden corpus.
// Pins: CR 508.1 (declaring attackers; the turn log keeps who attacked, also after the creature left), CR 603.4 (the intervening "if" of the end step trigger is read as it triggers and as
// it resolves), CR 508.4 and 110.5b (a token that enters tapped and attacking was never declared as an attacker), CR 603.2c (one trigger for the whole declaration), CR 122.1 and
// 611.3a (counters and a condition read all the time after "as long as"), CR 603.6a (an enters trigger), CR 603.10 is not involved.
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { importCard, type StoredFace } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

function imported(face: Partial<StoredFace>): CardDefinition {
  const result = importCard(syntheticCard(face), undefined, NO_OVERRIDES);
  expect(result.support.unparsed, face.name).toEqual([]);
  expect(result.support.reasons, face.name).toEqual([]);
  expect(result.support.status, face.name).toBe('supported');
  expect(validateCard(result.definition), face.name).toEqual([]);
  return result.definition;
}

const SLICER = imported({
  name: 'Searslicer Goblin',
  manaCost: '{1}{R}',
  typeLine: 'Creature — Goblin Berserker',
  oracleText:
    'Raid — At the beginning of your end step, if you attacked this turn, create a 1/1 red Goblin creature token.',
  power: '2',
  toughness: '1',
  colors: ['R'],
});

const QUEST = imported({
  name: 'Quest for the Goblin Lord',
  manaCost: '{R}',
  typeLine: 'Enchantment',
  oracleText:
    'Whenever a Goblin you control enters, you may put a quest counter on this enchantment.\nAs long as this enchantment has five or more quest counters on it, creatures you control get +2/+0.',
  colors: ['R'],
});

const KREAT = imported({
  name: 'General Kreat, the Boltbringer',
  manaCost: '{2}{R}',
  typeLine: 'Legendary Creature — Goblin Soldier',
  oracleText:
    "Whenever one or more Goblins you control attack, create a 1/1 red Goblin creature token that's tapped and attacking.\nWhenever another creature you control enters, General Kreat deals 1 damage to each opponent.",
  power: '2',
  toughness: '3',
  colors: ['R'],
});

const GOBLIN = 'Raging Goblin';
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 12 }, () => 'Mountain');

describe('Searslicer Goblin: "At the beginning of your end step, if you attacked this turn, create a 1/1 red Goblin creature token"', () => {
  const board = () => {
    const g = scenario()
      .define(SLICER)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SLICER.name, GOBLIN, BEARS)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    return g;
  };
  const goblinTokens = (g: ReturnType<typeof board>) =>
    g.find({ name: 'Goblin', zone: 'battlefield' });

  test('after an attack, the end step makes a 1/1 red Goblin token', () => {
    const g = board();
    g.act(0).attack([GOBLIN]);
    g.advanceTo('end');
    g.passAll();
    const tokens = goblinTokens(g);
    expect(tokens).toHaveLength(1);
    const [token] = tokens;
    if (token === undefined) throw new Error('no token');
    g.expect.pt(token.id, 1, 1);
    g.expect.derived(token.id, { colors: ['R'], subtypes: ['Goblin'] });
    g.expect.invariants();
  });

  test('without an attack, nothing happens (the intervening "if" fails, CR 603.4)', () => {
    const g = board();
    g.act(0).noAttackers();
    g.advanceTo('end');
    g.passAll();
    expect(goblinTokens(g)).toHaveLength(0);
  });

  test('the attacker may be the Goblin itself, and may have died: the turn log keeps the attack', () => {
    const g = board();
    g.act(0).attack([SLICER]);
    g.advanceTo('end');
    g.passAll();
    expect(goblinTokens(g)).toHaveLength(1);
  });

  test("an opponent's attack on their own turn is not mine: no token", () => {
    const g = scenario()
      .define(SLICER)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SLICER.name)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).attack([BEARS]);
    g.advanceTo('end');
    g.passAll();
    expect(goblinTokens(g)).toHaveLength(0);
  });
});

describe('Quest for the Goblin Lord: counters, and +2/+0 with five of them', () => {
  const board = (counters: number) =>
    scenario()
      .define(QUEST)
      .seat(0)
      .library(...LIBRARY)
      .hand(GOBLIN, BEARS)
      .battlefield(QUEST.name, { counters: { quest: counters } })
      .battlefield('Mountain', { label: 'm1' })
      .battlefield('Mountain', { label: 'm2' })
      .battlefield('Forest', { label: 'f1' })
      .battlefield('Forest', { label: 'f2' })
      .battlefield(BEARS, { label: 'bear' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('a Goblin entering: the player may put a quest counter on it', () => {
    const g = board(0);
    g.act(0).cast(GOBLIN, { pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.passAll();
    g.expect.counters(QUEST.name, { quest: 1 });
    g.expect.invariants();
  });

  test('declining puts no counter', () => {
    const g = board(0);
    g.act(0).cast(GOBLIN, { pay: true });
    g.passAll();
    g.act(0).decline();
    g.passAll();
    g.expect.counters(QUEST.name, {});
  });

  test('a creature that is not a Goblin does not trigger it', () => {
    const g = board(0);
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
    g.expect.counters(QUEST.name, {});
  });

  test('the fifth counter turns the bonus on, for every creature I control', () => {
    const g = board(4);
    g.expect.pt('bear', 2, 2);
    g.act(0).cast(GOBLIN, { pay: true });
    g.passAll();
    g.act(0).accept();
    g.passAll();
    g.expect.counters(QUEST.name, { quest: 5 });
    g.expect.pt('bear', 4, 2);
    g.expect.pt(GOBLIN, 3, 1);
    g.expect.invariants();
  });

  test('four counters give nothing', () => {
    const g = board(4);
    g.expect.pt('bear', 2, 2);
  });
});

describe('General Kreat, the Boltbringer', () => {
  const board = () => {
    const g = scenario()
      .define(KREAT)
      .seat(0)
      .library(...LIBRARY)
      .hand(BEARS)
      .battlefield(KREAT.name)
      .battlefield(GOBLIN, { label: 'goblin' })
      .battlefield(BEARS, { label: 'bear' })
      .battlefield('Forest', { label: 'f1' })
      .battlefield('Forest', { label: 'f2' })
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    return g;
  };
  const tokens = (g: ReturnType<typeof board>) => g.find({ name: 'Goblin', zone: 'battlefield' });

  test('Goblins attack: one tapped and attacking 1/1 red Goblin token, and it is a creature that entered', () => {
    const g = board();
    g.act(0).attack(['goblin', KREAT.name]);
    g.passAll();
    const made = tokens(g);
    expect(made).toHaveLength(1);
    const [token] = made;
    if (token === undefined) throw new Error('no token');
    g.expect.pt(token.id, 1, 1);
    g.expect.derived(token.id, { colors: ['R'], subtypes: ['Goblin'] });
    expect(token.tapped).toBe(true);
    const entry = g.state.combat?.attackers.find((a) => a.object === token.id);
    expect(entry?.target).toEqual({ kind: 'player', seat: 1 });
    // The token is another creature that entered under my control: General Kreat's other ability deals 1 damage to the opponent (CR 603.6a).
    g.expect.life(1, 39);
    g.expect.invariants();
  });

  test('two Goblins attacking: still one token (CR 603.2c: one trigger for the declaration)', () => {
    const g = board();
    g.act(0).attack(['goblin', KREAT.name]);
    g.passAll();
    expect(tokens(g)).toHaveLength(1);
  });

  test('it was never declared as an attacker (CR 508.4): its damage still goes to the opponent', () => {
    const g = board();
    g.act(0).attack(['goblin']);
    g.passAll();
    g.advanceTo('endOfCombat');
    // 1 from the entering token, then Raging Goblin (1) and the token (1), unblocked.
    g.expect.life(1, 37);
  });

  test('a creature that is not a Goblin attacking does not trigger it', () => {
    const g = board();
    g.act(0).attack(['bear']);
    g.passAll();
    expect(tokens(g)).toHaveLength(0);
    g.expect.life(1, 40);
  });

  test("an opponent's Goblins attacking do not trigger it (who: you)", () => {
    const g = scenario()
      .define(KREAT)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(KREAT.name)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(GOBLIN)
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).attack([GOBLIN]);
    g.passAll();
    expect(g.find({ name: 'Goblin', zone: 'battlefield' })).toHaveLength(0);
    g.expect.life(1, 40);
  });

  test('another creature entering under my control deals 1 damage to each opponent', () => {
    const g = scenario()
      .define(KREAT)
      .seat(0)
      .library(...LIBRARY)
      .hand(BEARS)
      .battlefield(KREAT.name)
      .battlefield('Forest', { label: 'f1' })
      .battlefield('Forest', { label: 'f2' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.life(1, 39);
    g.expect.invariants();
  });
});
