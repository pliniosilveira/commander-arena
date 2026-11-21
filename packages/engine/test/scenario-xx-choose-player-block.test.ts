// "Choose a player with the most life or tied for most life. Target creature can't be blocked by creatures that player controls this turn." (The Black Gate, Witch-king of Angmar deck):
// `choosePlayer`, the selector `chosenPlayer` and `cantBeBlockedByPlayer`. Pins: CR 608.2d (the controller chooses among the tied), CR 119.1 (life totals), CR 509.1b (blocking
// restrictions), CR 611.2a (until end of turn).
// The card is SYNTHETIC; defined here.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const GATE = 'SYNTHETIC Gate Spell';
const BEARS = 'Grizzly Bears';
const ANGEL = 'Serra Angel';

const CARD = singleFaceCard({
  name: GATE,
  manaCost: ['B'],
  types: ['instant'],
  colors: ['B'],
  colorIdentity: ['B'],
  oracleText:
    "Choose a player with the most life or tied for most life. Target creature can't be blocked by creatures that player controls this turn.",
  spell: {
    targets: [
      {
        id: 't1',
        what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
      },
    ],
    effect: {
      kind: 'sequence',
      effects: [
        { kind: 'choosePlayer', among: 'mostLife' },
        {
          kind: 'cantBeBlockedByPlayer',
          objects: { kind: 'target', id: 't1' },
          player: { kind: 'chosenPlayer' },
        },
      ],
    },
  },
});

describe('choose the player with the most life (CR 608.2d, 119.1)', () => {
  const board = (lifeOfOpponent: number) =>
    scenario()
      .define(CARD)
      .seat(0)
      .life(30)
      .hand(GATE)
      .battlefield(BEARS, 'Swamp')
      .seat(1)
      .life(lifeOfOpponent)
      .battlefield(ANGEL)
      .at('precombatMain', { active: 0 })
      .build();

  test('with one player at the most life nothing is asked: that player’s creatures cannot block the target this turn', () => {
    const g = board(40);
    g.act(0).cast(GATE, { targets: [BEARS], pay: true });
    g.passAll();
    expect(g.state.pending?.kind).not.toBe('chooseOption');
    g.advanceTo('declareAttackers');
    g.act(0).attack([BEARS]);
    // No creature can block it, so no declaration of blockers is asked for and the damage is dealt.
    g.advanceTo('endOfCombat');
    g.expect.life(1, 38);
  });

  test('with a tie the controller chooses; choosing themselves leaves the opponent free to block', () => {
    const g = board(30);
    g.act(0).cast(GATE, { targets: [BEARS], pay: true });
    g.passAll();
    expect(g.state.pending).toMatchObject({
      kind: 'chooseOption',
      purpose: 'playerChoice',
      seat: 0,
      options: ['seat:0', 'seat:1'],
    });
    g.act(0).chooseOption('seat:0');
    g.advanceTo('declareAttackers');
    g.act(0).attack([BEARS]);
    g.advanceTo('declareBlockers');
    g.expect.canBlock(ANGEL, BEARS, true);
  });

  test('choosing the opponent bars their creatures from blocking it', () => {
    const g = board(30);
    g.act(0).cast(GATE, { targets: [BEARS], pay: true });
    g.passAll();
    g.act(0).chooseOption('seat:1');
    g.advanceTo('declareAttackers');
    g.act(0).attack([BEARS]);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 28);
  });
});
