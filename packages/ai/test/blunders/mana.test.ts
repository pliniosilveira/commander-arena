// Blunder suite (issue 624), mana: the HeuristicAgent (seat 0) decides what to do with its lands and its
// mana. Tapping out with a counterspell in hand is not a blunder in general; each case here is decided by its
// position: a flash creature that could wait for the end step against an opponent with a full grip and
// mana, a payment that taps the wrong lands for nothing, an opponent with an empty hand (tapping out is
// right), a removal spell on its commander. Also: skipping a land drop, casting ramp after what it pays for.
//
// Convention of the blunder suite: a case the agent gets right today is a plain `test`; a case it gets
// wrong today is `test.fails` with a one-line comment saying what it does instead. Those are the known
// blunders later phases must fix: when one starts passing, vitest reports it, and it becomes a plain test.
// A case is never weakened to make it pass. Each case is a blunder in its own position, never a general
// rule: a move a strong player could defend there does not belong here. Its comment says in one line why.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { HeuristicAgent } from '../../src/index';
import { askHeuristic } from '../heuristic-helpers';
import { playUntilPass } from './drive';

const V2 = 'SYNTHETIC Vanilla 2/2';
const V5 = 'SYNTHETIC Vanilla 5/5';
const BEARS = 'Grizzly Bears'; // 1G
const FLASH_BEAR = 'SYNTHETIC Flash Bear'; // 1G, flash
const ANGEL = 'Serra Angel'; // 3WW
const LIBRARY = { count: 10 } as const;

describe('use the mana', () => {
  test('with a land in hand and nothing to attack with, the land is played', async () => {
    // Wrong to hold it here: nothing rewards holding a land (no landfall, no discard), and skipping it delays the 5/5.
    const g = scenario()
      .seat(0)
      .hand('Forest', V5)
      .battlefield('Forest', 'Forest')
      .library('Island', LIBRARY)
      .seat(1)
      .library('Island', LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    const { actions } = await playUntilPass(g, 0);
    expect(actions.some((a) => a.kind === 'playLand')).toBe(true);
  });

  test('Sol Ring first: with one land, Sol Ring then the 2/2 it pays for', async () => {
    // Wrong otherwise here: the 2/2 first uses the only land and strands Sol Ring; Sol Ring first casts both.
    const g = scenario()
      .seat(0)
      .hand('Sol Ring', V2)
      .battlefield('Plains')
      .landsPlayed(1)
      .library('Island', LIBRARY)
      .seat(1)
      .library('Island', LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    const { cast } = await playUntilPass(g, 0);
    expect(cast).toEqual(['Sol Ring', V2]);
  });
});

describe('hold up the counterspell', () => {
  test("on the opponent's upkeep, the flash creature is not cast with the counterspell's mana", async () => {
    // Wrong here: the Bear (1G) leaves one Island for a UU Counterspell against seven cards and seven lands, and flash lets it wait for the end step.
    const g = scenario()
      .seat(0)
      .hand('Counterspell', FLASH_BEAR)
      .battlefield('Island', 'Island', 'Forest')
      .library('Island', LIBRARY)
      .seat(1)
      .hand(V5, V5, ANGEL, ANGEL, 'Plains', 'Plains', V2)
      .battlefield('Plains', { count: 7 })
      .library('Island', LIBRARY)
      .at('upkeep', { active: 1 })
      .build();
    g.act(1).pass();
    const { cast } = await playUntilPass(g, 0);
    expect(cast).not.toContain(FLASH_BEAR);
  });

  test('on its own turn the Bears are paid with the Forests, keeping both Islands for Counterspell', async () => {
    // Wrong here: paying with an Island turns off Counterspell and gains nothing, since the Forests pay the same.
    const g = scenario()
      .seat(0)
      .hand('Counterspell', BEARS)
      .battlefield('Island', 'Island', 'Forest', 'Forest')
      .landsPlayed(1)
      .library('Island', LIBRARY)
      .seat(1)
      .library('Island', LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    const { cast } = await playUntilPass(g, 0);
    expect(cast).toContain(BEARS);
    const islands = g.find({ name: 'Island', zone: 'battlefield' });
    expect(islands.filter((o) => !o.tapped)).toHaveLength(2);
  });

  test('against an opponent with an empty hand, the Angel is cast even though it taps the Counterspell mana', async () => {
    // Wrong to hold here: the opponent's only possible spell is its next draw, so a turn without the Angel buys almost nothing.
    const g = scenario()
      .seat(0)
      .hand('Counterspell', ANGEL)
      .battlefield('Plains', 'Plains', 'Plains', 'Island', 'Island')
      .landsPlayed(1)
      .library('Island', LIBRARY)
      .seat(1)
      .battlefield('Plains', { count: 4 })
      .library('Island', LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    const { cast } = await playUntilPass(g, 0);
    expect(cast).toContain(ANGEL);
  });

  test('a removal spell aimed at its commander is countered', async () => {
    // Wrong not to counter here: the two Islands have no better use, and the commander dies otherwise.
    const g = scenario()
      .seat(0)
      .hand('Counterspell')
      .battlefield('Island', 'Island')
      .battlefield('Isamaru, Hound of Konda', { commander: true })
      .library('Island', LIBRARY)
      .seat(1)
      .hand('Murder')
      .battlefield('Swamp', { count: 3 })
      .library('Island', LIBRARY)
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast('Murder').targets(['Isamaru, Hound of Konda']).pay();
    g.act(1).pass();
    const agent = new HeuristicAgent({ seed: 1 });
    expect(await askHeuristic(g, agent)).toMatchObject({
      kind: 'castSpell',
      object: g.id('Counterspell'),
    });
  });
});
