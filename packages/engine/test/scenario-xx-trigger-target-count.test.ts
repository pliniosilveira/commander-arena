// A cast trigger can read how many targets the spell had when it was cast.
import { describe, expect, test } from 'vitest';
import { getView } from '../src';
import { singleFace } from '../src/cards/fixtures/helpers';
import { scenario } from '../src/testing/index';

const WATCHER = singleFace({
  name: 'SYNTHETIC Target Count Watcher',
  manaCost: ['2', 'U'],
  types: ['creature'],
  colors: ['U'],
  colorIdentity: ['U'],
  power: 2,
  toughness: 2,
  oracleText: 'test',
  abilities: [
    {
      kind: 'triggered',
      trigger: {
        kind: 'castSpell',
        filter: { stackKind: 'spell', targetCountAtLeast: 1 },
        by: 'you',
      },
      effect: {
        kind: 'draw',
        player: { kind: 'you' },
        count: { kind: 'triggerTargetCount' },
      },
    },
  ],
});

const TWO_TARGETS = singleFace({
  name: 'SYNTHETIC Spell with Two Targets',
  manaCost: ['U'],
  types: ['instant'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: 'test',
  spell: {
    targets: [
      { id: 'p1', what: { kind: 'player', filter: 'any' } },
      { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } } },
    ],
    effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
  },
});

describe('target count of a cast spell', () => {
  test('a spell with two targets draws two cards for the watcher', () => {
    const g = scenario()
      .define(WATCHER)
      .define(TWO_TARGETS)
      .seat(0)
      .battlefield(WATCHER.name)
      .battlefield('Island', { count: 4 })
      .hand(TWO_TARGETS.name)
      .library('Plains', { count: 4 })
      .seat(1)
      .battlefield('Grizzly Bears')
      .at('precombatMain', { active: 0 })
      .build();

    g.act(0).cast(TWO_TARGETS.name, { targets: [{ player: 1 }, 'Grizzly Bears'], pay: true });
    g.passAll();

    expect(getView(g.state, 0).seats[0]?.hand).toHaveLength(2);
  });

  test('a spell without targets does not trigger the watcher', () => {
    const g = scenario()
      .define(WATCHER)
      .seat(0)
      .battlefield(WATCHER.name)
      .battlefield('Island', { count: 4 })
      .hand('Divination')
      .library('Plains', { count: 4 })
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();

    g.act(0).cast('Divination', { pay: true });
    g.passAll();

    expect(getView(g.state, 0).seats[0]?.hand).toHaveLength(2);
  });
});
