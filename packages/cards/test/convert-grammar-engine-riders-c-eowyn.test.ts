// Éowyn, Shieldmaiden of the Riders of Rohan deck (group C), run as written: "At the beginning of combat on your turn, if another Human entered the battlefield under your control
// this turn, create two 2/2 red Human Knight creature tokens with trample and haste. Then if you control six or more Humans, draw a card." (CR 400.7, 603.4, 603.2, 111.4). A
// SYNTHETIC card imported through the grammar and played with three seats.
import { getView } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

const EOWYN = parsed(
  'SYNTHETIC Parsed Eowyn',
  'Legendary Creature — Human Knight',
  'First strike\nAt the beginning of combat on your turn, if another Human entered the battlefield under your control this turn, create two 2/2 red Human Knight creature tokens with trample and haste. Then if you control six or more Humans, draw a card.',
  { manaCost: '{2}{W}', colors: ['W'], power: '5', toughness: '4' },
);
const HUMAN = parsed('SYNTHETIC Parsed Villager', 'Creature — Human Peasant', 'Vigilance', {
  manaCost: '{W}',
  colors: ['W'],
  power: '1',
  toughness: '1',
});
const BIG_HUMAN = parsed('SYNTHETIC Parsed Veteran', 'Creature — Human Soldier', 'Vigilance', {
  manaCost: '{W}',
  colors: ['W'],
  power: '2',
  toughness: '2',
});

const CAT = parsed('SYNTHETIC Parsed Cat', 'Creature — Cat', 'Vigilance', {
  manaCost: '{W}',
  colors: ['W'],
  power: '1',
  toughness: '1',
});

const tokens = (g: ScenarioGame, seat: 0 | 1 | 2) =>
  g.state.battlefield
    .map((id) => g.state.objects[id])
    .filter((o) => o?.token?.characteristics.name === 'Human Knight' && o.controller === seat);

const humansOnBattlefield = (g: ScenarioGame) =>
  getView(g.state, 0).battlefield.filter(
    (o) => o.controller === 0 && o.types.includes('creature') && o.subtypes.includes('Human'),
  );

/** My turn: Éowyn is on the battlefield, `others` Humans besides her too, and a Human card in hand. */
const turn = (others: number, handName: string = HUMAN.name) =>
  scenario({ seats: 3 })
    .define(EOWYN)
    .define(HUMAN)
    .define(BIG_HUMAN)
    .define(CAT)
    .seat(0)
    .battlefield(EOWYN.name, { label: 'eowyn' })
    .battlefield(...Array.from({ length: others }, () => BIG_HUMAN.name))
    .battlefield('Plains', 'Plains')
    .hand(handName, { label: 'newcomer' })
    .library(...FILLER)
    .seat(1)
    .library(...FILLER)
    .seat(2)
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();

describe('Éowyn, Shieldmaiden as written (CR 400.7, 603.4)', () => {
  test('no other Human entered this turn: nothing at the beginning of combat', () => {
    const g = turn(2);
    g.advanceTo('beginningOfCombat');
    g.passAll();
    expect(tokens(g, 0)).toHaveLength(0);
    g.expect.handSize(0, 1);
  });

  test('another Human entered: two 2/2 red Human Knight tokens with trample and haste', () => {
    const g = turn(1);
    g.act(0).cast('newcomer', { pay: true });
    g.passAll();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    const made = tokens(g, 0);
    expect(made).toHaveLength(2);
    const view = getView(g.state, 0).battlefield.find((o) => o.id === made[0]?.id);
    expect([view?.power, view?.toughness]).toEqual([2, 2]);
    expect(view?.keywords).toEqual(expect.arrayContaining(['trample', 'haste']));
    expect(view?.colors).toEqual(['R']);
    expect(view?.subtypes).toEqual(expect.arrayContaining(['Human', 'Knight']));
    g.expect.invariants();
  });

  test('five Humans after the tokens: no card; six: a card (the Humans of both kinds count)', () => {
    // Éowyn, one other, the Human cast this turn and the two tokens: five.
    const five = turn(1);
    five.act(0).cast('newcomer', { pay: true });
    five.passAll();
    five.advanceTo('beginningOfCombat');
    five.passAll();
    expect(humansOnBattlefield(five)).toHaveLength(5);
    five.expect.handSize(0, 0);
    // One more on the battlefield: six, so a card.
    const six = turn(2);
    six.act(0).cast('newcomer', { pay: true });
    six.passAll();
    six.advanceTo('beginningOfCombat');
    six.passAll();
    expect(humansOnBattlefield(six)).toHaveLength(6);
    six.expect.handSize(0, 1);
  });

  test('a creature that is not a Human does not count as another Human', () => {
    const g = turn(0, CAT.name);
    g.act(0).cast('newcomer', { pay: true });
    g.passAll();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    expect(tokens(g, 0)).toHaveLength(0);
  });

  test('Éowyn entering is not another Human (the ruling: "another")', () => {
    const g = scenario({ seats: 3 })
      .define(EOWYN)
      .seat(0)
      .hand(EOWYN.name, { label: 'eowyn' })
      .battlefield('Plains', 'Plains', 'Plains')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast('eowyn', { pay: true });
    g.passAll();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    expect(tokens(g, 0)).toHaveLength(0);
  });

  test('a Human that entered under an opponent’s control does not count', () => {
    const g = scenario({ seats: 3 })
      .define(EOWYN)
      .define(HUMAN)
      .seat(0)
      .battlefield(EOWYN.name, { label: 'eowyn' })
      .library(...FILLER)
      .seat(1)
      .hand(HUMAN.name, { label: 'theirs' })
      .battlefield('Plains')
      .library(...FILLER)
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.act(1).cast('theirs', { pay: true });
    g.passAll();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    expect(tokens(g, 0)).toHaveLength(0);
  });

  test('it triggers only on my turn: a Human entering under my control on an opponent’s turn does not', () => {
    const g = scenario({ seats: 3 })
      .define(EOWYN)
      .define(HUMAN)
      .seat(0)
      .battlefield(EOWYN.name, { label: 'eowyn' })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    expect(tokens(g, 0)).toHaveLength(0);
    expect(tokens(g, 1)).toHaveLength(0);
  });
});
