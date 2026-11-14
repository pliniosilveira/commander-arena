// The Vraska EDHREC deck, group 3 (stage P65, D-218): the REAL cards of the owner's golden corpus read through the grammar only and played through
// applyAction: the batch triggers (attack, tokens entering), cast or copy, and the attackers of the opponents. Stand-ins are SYNTHETIC (named so).
import { readFileSync } from 'node:fs';
import { type CardDefinition, getView } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, name).toBe('supported');
  expect(imported.support.unparsed, name).toEqual([]);
  return imported.definition;
}

const FILLER = Array.from({ length: 30 }, () => 'Island');
const BEARS = 'Grizzly Bears';

const FANTASTIC = real('Mister Fantastic, Reed Richards');
const KILN = real('Storm-Kiln Artist');
const ALIBOU = real('Alibou, Ancient Witness');
const ROAR = real('Roar of Resistance');

const ROCK = parsed('SYNTHETIC Rock', 'Artifact', '{T}: Add {C}.');
const MAKER = parsed(
  'SYNTHETIC Soldier Maker',
  'Sorcery',
  'Create two 1/1 white Soldier creature tokens.',
  {
    manaCost: '{W}',
  },
);
const SPARK = parsed('SYNTHETIC Spark', 'Instant', '~ deals 1 damage to any target.', {
  manaCost: '{R}',
});
const ECHO = parsed(
  'SYNTHETIC Echo',
  'Instant',
  'Copy target instant or sorcery spell you control. You may choose new targets for the copy.',
  { manaCost: '{U}' },
);

describe('Mister Fantastic, Reed Richards (whenever one or more tokens you control enter, you may draw a card)', () => {
  const game = () =>
    scenario()
      .define(FANTASTIC)
      .define(MAKER)
      .seat(0)
      .hand(MAKER.name)
      .battlefield(FANTASTIC.name)
      .battlefield('Plains')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test("reads as a batch trigger of the controller's tokens (CR 603.2c)", () => {
    const trigger = FANTASTIC.faces[0]?.abilities.find((a) => a.kind === 'triggered');
    expect(trigger).toMatchObject({
      trigger: { kind: 'entersBatch', what: { token: true, controller: 'you' } },
      optional: true,
    });
  });

  test('two tokens made together trigger it once, and the draw is a question', () => {
    const g = game();
    g.act(0).cast(MAKER.name, { pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.passAll();
    expect(g.state.seats[0]?.hand).toHaveLength(1);
    // No second question: one trigger for the two tokens.
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('a creature card that enters is not a token', () => {
    const g = scenario()
      .define(FANTASTIC)
      .seat(0)
      .hand(BEARS)
      .battlefield(FANTASTIC.name)
      .battlefield('Forest', { count: 2 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
    expect(g.state.seats[0]?.hand).toHaveLength(0);
  });
});

describe('Storm-Kiln Artist (magecraft: whenever you cast or copy an instant or sorcery spell, create a Treasure)', () => {
  const treasures = (g: { state: import('@commander-arena/engine').GameState }) =>
    getView(g.state, 0).battlefield.filter((o) => o.name === 'Treasure').length;

  test('reads as a cast trigger that also counts copies (CR 707.10)', () => {
    const trigger = KILN.faces[0]?.abilities.find((a) => a.kind === 'triggered');
    expect(trigger).toMatchObject({ trigger: { kind: 'castSpell', by: 'you', orCopy: true } });
  });

  test('casting an instant makes a Treasure and copying it makes another; a creature spell makes none', () => {
    const g = scenario()
      .define(KILN)
      .define(SPARK)
      .define(ECHO)
      .seat(0)
      .hand(SPARK.name, ECHO.name, BEARS)
      .battlefield(KILN.name)
      .battlefield('Mountain', { count: 4 })
      .battlefield('Island')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(SPARK.name, { pay: true, targets: [{ player: 1 }] });
    // The trigger of the cast goes on the stack above the Spark; it resolves first.
    g.act(0).pass();
    g.act(1).pass();
    expect(treasures(g)).toBe(1);
    // Respond with the copy of the Spark: casting the Echo (an instant) is a Treasure, and so is the copy it makes.
    g.act(0).cast(ECHO.name, { pay: true, targets: [SPARK.name] });
    g.passAll();
    // The copy of the Spark asks for its targets (it may keep them): the opponent again.
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    expect(treasures(g)).toBe(3);
    g.expect.invariants();
  });
});

describe('Alibou, Ancient Witness (whenever one or more artifact creatures you control attack: X damage and scry X)', () => {
  test('reads as an attack batch of artifact creatures with X counted as it resolves', () => {
    const trigger = ALIBOU.faces[0]?.abilities.find((a) => a.kind === 'triggered');
    expect(trigger).toMatchObject({
      trigger: {
        kind: 'attackBatch',
        who: 'you',
        atLeast: 1,
        what: { types: ['artifact', 'creature'] },
      },
    });
  });

  test('attacking taps the artifact creature: X is the number of tapped artifacts, for the damage and the scry', () => {
    const g = scenario()
      .define(ALIBOU)
      .define(ROCK)
      .seat(0)
      .battlefield(ALIBOU.name)
      .battlefield(ROCK.name, { count: 2, tapped: true })
      .library('Forest', 'Plains', 'Swamp', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(ALIBOU.name);
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    // Alibou (tapped by attacking) and the two Rocks: X = 3.
    expect(g.state.seats[1]?.life).toBe(37);
    g.expect.pending('arrangeCards', 0);
    g.expect.invariants();
  });

  // CR 107.3c, 107.3i, 608.2h (D-225): the value of X is defined by the text, so every instance of X has the same value at any given time, and a count is
  // read as the instruction applies. Damage only marks damage (CR 120.3e): a creature with lethal damage dies at the next state-based check (CR 704.5g), after
  // the ability has finished resolving, so nothing changes between the damage and the scry.
  test('damage that is lethal to one of the tapped artifacts does not change X for the scry: both are 3', () => {
    const GOLEM = parsed('SYNTHETIC Golem', 'Artifact Creature \u2014 Golem', '', {
      manaCost: '{1}',
      power: '1',
      toughness: '1',
    });
    const g = scenario()
      .define(ALIBOU)
      .define(ROCK)
      .define(GOLEM)
      .seat(0)
      .battlefield(ALIBOU.name)
      .battlefield(GOLEM.name, { tapped: true })
      .battlefield(ROCK.name, { tapped: true })
      .library('Forest', 'Plains', 'Swamp', 'Mountain', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(ALIBOU.name);
    g.act(0).chooseTargets({ name: GOLEM.name, seat: 0 });
    g.passAll();
    // X = Alibou (tapped by attacking), the Golem and the Rock: 3 damage to the Golem, and the scry looks at 3 cards.
    const d = g.state.pending;
    if (d?.kind !== 'arrangeCards') throw new Error('expected the scry');
    expect(d.cards).toHaveLength(3);
    expect(g.state.objects[g.id(GOLEM.name)]?.damage).toBe(3);
    g.expect.zone(GOLEM.name, 'battlefield');
    g.expect.invariants();
  });
});

describe('Roar of Resistance (whenever one or more creatures attack, you may pay {1}{R}: your attackers of your opponents get +2/+0)', () => {
  const game = () =>
    scenario()
      .define(ROAR)
      .seat(0)
      .battlefield(ROAR.name)
      .battlefield(BEARS)
      .battlefield('Mountain', { count: 2 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('paying {1}{R} gives the creatures attacking the opponent +2/+0 until end of turn', () => {
    const g = game();
    g.advanceTo('declareAttackers');
    g.act(0).attack(BEARS);
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.act(0).payAuto();
    g.passAll();
    const bears = getView(g.state, 0).battlefield.find((o) => o.name === BEARS);
    expect(bears?.power).toBe(4);
    g.expect.invariants();
  });

  test('declining leaves them as they were', () => {
    const g = game();
    g.advanceTo('declareAttackers');
    g.act(0).attack(BEARS);
    g.passAll();
    g.act(0).decline();
    g.passAll();
    expect(getView(g.state, 0).battlefield.find((o) => o.name === BEARS)?.power).toBe(2);
  });
});
