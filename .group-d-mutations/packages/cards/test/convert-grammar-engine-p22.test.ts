// Parsed text is only worth something if the engine runs it as written (stage P22). These tests import SYNTHETIC
// cards through the grammar (never through a fixture), define them in an engine scenario and play them through
// applyAction: Overload (CR 702.96), Evoke (CR 702.74) and Dash (CR 702.109), the named alternative costs of
// D-117 and D-121. Every card name starts with "SYNTHETIC"; the keyword lines are the real ones of
// reports/templates.json ("Overload {6}{U}", "Evoke {2}{U}", "Dash {1}{R}") with other costs SYNTHETIC, and the
// ordinary text is the real wording of Cyclonic Rift ("Return target nonland permanent you don't control to its
// owner's hand.") or SYNTHETIC. No real card's text is claimed. The board uses the engine's own fixtures
// (Grizzly Bears, Serra Angel, Llanowar Elves, the basic lands).
import { getLegalActions, getView } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const BEARS = 'Grizzly Bears'; // 2/2 {1}{G}
const ELVES = 'Llanowar Elves'; // 1/1
const ANGEL = 'Serra Angel'; // 4/4 flying vigilance

const resolveTop = (g: ScenarioGame): void => {
  g.pass();
  g.pass();
};

const options = (g: ScenarioGame, kind: 'overload' | 'evoke' | 'dash') =>
  getLegalActions(g.state, 0).filter((a) => a.kind === 'castSpell' && a.alternative === kind);

describe('"Overload {6}{U}" (backlog: 26 cards; CR 702.96a)', () => {
  const RIFT = parsed(
    'SYNTHETIC Parsed Rift',
    'Instant',
    "Return target nonland permanent you don't control to its owner's hand.\nOverload {6}{U}",
    { manaCost: '{1}{U}', colors: ['U'] },
  );
  const MINE = 'Sol Ring'; // an artifact the caster controls

  test('the lowering is the face field, with the spell text read as for a plain spell', () => {
    const face = RIFT.faces[0];
    expect(face?.alternativeCosts).toEqual([
      { kind: 'overload', cost: [{ kind: 'mana', symbols: ['6', 'U'] }] },
    ]);
    expect(face?.abilities).toEqual([]);
    expect(face?.spell?.targets).toHaveLength(1);
  });

  test('both casts are options; the view shows the overload cost', () => {
    const g = scenario()
      .define(RIFT)
      .seat(0)
      .hand(RIFT.name)
      .battlefield('Island', { count: 7 })
      .seat(1)
      .battlefield(BEARS)
      .build();
    g.expect.legal(0, { cast: RIFT.name });
    g.expect.legal(0, { cast: RIFT.name, alternative: 'overload' });
    expect(getView(g.state, 0).seats[0]?.hand?.[0]?.alternativeCosts).toEqual([
      { kind: 'overload', cost: ['6', 'U'] },
    ]);
  });

  test('cast for its overload cost it returns every matching permanent and none of the caster’s', () => {
    const g = scenario()
      .define(RIFT)
      .seat(0)
      .hand(RIFT.name)
      .battlefield('Island', { count: 7 })
      .battlefield(MINE)
      .seat(1)
      .battlefield(BEARS, ANGEL, ELVES, 'Forest')
      .build();
    g.act(0).cast(RIFT.name, { alternative: 'overload', pay: true });
    // No targets were chosen (CR 702.96b): the spell is on the stack and resolves as it is.
    g.expect.stack([RIFT.name]);
    resolveTop(g);
    for (const name of [BEARS, ANGEL, ELVES]) g.expect.zone(name, 'hand', { seat: 1 });
    g.expect.zone('Forest', 'battlefield', { seat: 1 });
    g.expect.zone(MINE, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('cast for its mana cost it still asks for one target and returns only that permanent', () => {
    const g = scenario()
      .define(RIFT)
      .seat(0)
      .hand(RIFT.name)
      .battlefield('Island', { count: 2 })
      .seat(1)
      .battlefield(BEARS, ANGEL)
      .build();
    g.act(0).cast(RIFT.name, { targets: [BEARS], pay: true });
    resolveTop(g);
    g.expect.zone(BEARS, 'hand', { seat: 1 });
    g.expect.zone(ANGEL, 'battlefield', { seat: 1 });
  });

  test('without seven mana only the ordinary cast is offered', () => {
    const g = scenario()
      .define(RIFT)
      .seat(0)
      .hand(RIFT.name)
      .battlefield('Island', { count: 6 })
      .seat(1)
      .battlefield(BEARS)
      .build();
    expect(options(g, 'overload')).toEqual([]);
    g.expect.legal(0, { cast: RIFT.name });
  });
});

describe('"Evoke {2}{U}" (backlog: 30 cards; CR 702.74a)', () => {
  const DRIFTER = parsed(
    'SYNTHETIC Parsed Drifter',
    'Creature — Test',
    'Flying\nWhen ~ enters, draw two cards.\nEvoke {2}{U}',
    { manaCost: '{3}{U}{U}', power: '2', toughness: '2', colors: ['U'] },
  );

  test('the lowering is the face field and the other abilities are read as usual', () => {
    const face = DRIFTER.faces[0];
    expect(face?.alternativeCosts).toEqual([
      { kind: 'evoke', cost: [{ kind: 'mana', symbols: ['2', 'U'] }] },
    ]);
    expect(face?.abilities.map((a) => a.kind)).toEqual(['keyword', 'triggered']);
  });

  test('cast for the evoke cost it enters, its trigger draws two cards, and it is sacrificed', () => {
    const g = scenario()
      .define(DRIFTER)
      .seat(0)
      .hand(DRIFTER.name)
      .battlefield('Island', { count: 3 })
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .build();
    g.expect.legal(0, { cast: DRIFTER.name, alternative: 'evoke' });
    g.expect.illegal(0, { cast: DRIFTER.name });
    g.act(0).cast(DRIFTER.name, { alternative: 'evoke', pay: true });
    g.passAll();
    // The draw and the sacrifice both trigger as it enters: the controller orders them.
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(1, 0);
    g.passAll();
    g.expect.zone(DRIFTER.name, 'graveyard', { seat: 0 });
    g.expect.handSize(0, 2);
    g.expect.invariants();
  });

  test('cast for its mana cost it stays on the battlefield', () => {
    const g = scenario()
      .define(DRIFTER)
      .seat(0)
      .hand(DRIFTER.name)
      .battlefield('Island', { count: 5 })
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .build();
    g.act(0).cast(DRIFTER.name, { pay: true });
    g.passAll();
    g.expect.zone(DRIFTER.name, 'battlefield', { seat: 0 });
    g.expect.handSize(0, 2);
  });
});

describe('"Dash {1}{R}" (backlog: 22 cards; CR 702.109a)', () => {
  const RIDER = parsed('SYNTHETIC Parsed Rider', 'Creature — Test', 'Dash {1}{R}', {
    manaCost: '{2}{R}{R}',
    power: '3',
    toughness: '1',
    colors: ['R'],
  });

  test('the lowering is the face field', () => {
    expect(RIDER.faces[0]?.alternativeCosts).toEqual([
      { kind: 'dash', cost: [{ kind: 'mana', symbols: ['1', 'R'] }] },
    ]);
    expect(RIDER.faces[0]?.abilities).toEqual([]);
  });

  test('cast for the dash cost it has haste, attacks, and returns to the hand at the end step', () => {
    const g = scenario()
      .define(RIDER)
      .seat(0)
      .hand(RIDER.name)
      .battlefield('Mountain', { count: 2 })
      .seat(1)
      .build();
    g.expect.legal(0, { cast: RIDER.name, alternative: 'dash' });
    g.expect.illegal(0, { cast: RIDER.name });
    g.act(0).cast(RIDER.name, { alternative: 'dash', pay: true });
    g.passAll();
    g.playCombat({ attack: [RIDER.name], until: 'postcombatMain' });
    g.expect.life(1, 37);
    g.advanceTo('end');
    g.expect.stack([`${RIDER.name} (ability)`]);
    g.passAll();
    g.expect.zone(RIDER.name, 'hand', { seat: 0 });
    g.expect.noObject(RIDER.name, { zone: 'battlefield' });
    g.expect.invariants();
  });

  test('cast for its mana cost it has no haste and stays', () => {
    const g = scenario()
      .define(RIDER)
      .seat(0)
      .hand(RIDER.name)
      .battlefield('Mountain', { count: 4 })
      .seat(1)
      .build();
    g.act(0).cast(RIDER.name, { pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack(RIDER.name, false);
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(RIDER.name, 'battlefield', { seat: 0 });
  });
});

describe('a card with two alternatives (CR 118.9a: one applies to a spell)', () => {
  const BOTH = parsed('SYNTHETIC Parsed Both', 'Creature — Test', 'Evoke {1}{B}\nDash {B}', {
    manaCost: '{3}{B}',
    power: '2',
    toughness: '2',
    colors: ['B'],
  });

  test('each is its own option beside the ordinary cast', () => {
    const g = scenario()
      .define(BOTH)
      .seat(0)
      .hand(BOTH.name)
      .battlefield('Swamp', { count: 4 })
      .seat(1)
      .build();
    g.expect.legal(0, { cast: BOTH.name });
    g.expect.legal(0, { cast: BOTH.name, alternative: 'evoke' });
    g.expect.legal(0, { cast: BOTH.name, alternative: 'dash' });
    g.expect.illegal(0, { cast: BOTH.name, alternative: 'overload' });
  });
});
