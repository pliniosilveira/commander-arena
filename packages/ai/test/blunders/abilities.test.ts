// Blunder suite (issue 624), activated abilities: the HeuristicAgent (seat 0) holds permanents with
// activated abilities, an empty hand and nothing else to spend mana on: spare mana at the end of the
// opponent's turn, a pump that wins a fight or the game, a pump in the main phase that does nothing, and
// abilities that only cost it life or creatures in that position.
//
// Convention of the blunder suite: a case the agent gets right today is a plain `test`; a case it gets
// wrong today is `test.fails` with a one-line comment saying what it does instead. Those are the known
// blunders later phases must fix: when one starts passing, vitest reports it, and it becomes a plain test.
// A case is never weakened to make it pass. Each case is a blunder in its own position, never a general
// rule: a move a strong player could defend there does not belong here. Its comment says in one line why.
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { BANNER_CAPTAIN, CURSED_IDOL, LIBRARY_LAMP, PINGER, SCRY_ORB, SERVO_WORKS } from './cards';
import { blunderAgent, isActivation, playUntilPass } from './drive';

const V1 = 'SYNTHETIC Vanilla 1/1';
const V3 = 'SYNTHETIC Vanilla 3/3';
const PUMP_BEAR = 'SYNTHETIC Pump Bear'; // 2/2, {1}: +1/+1 until end of turn
const FIREBREATHER = 'SYNTHETIC Firebreather'; // 1/1, {R}: +1/+0 until end of turn
const LIFE_TAP = 'SYNTHETIC Life Tap'; // {T}, Pay 2 life: Draw a card.
const ALTAR = 'SYNTHETIC Altar'; // Sacrifice a creature: You gain 2 life.
const BEARS = 'Grizzly Bears';
const LIBRARY = { count: 10 } as const;

/** Seat 0 holds priority in seat 1's end step with `mine` (lands included) on the battlefield. */
function endStep(
  mine: string[],
  theirs: string[] = [],
  opts: { defs?: CardDefinition[]; life?: number; commander?: string } = {},
) {
  let b = scenario();
  for (const d of opts.defs ?? []) b = b.define(d);
  b = b
    .seat(0)
    .life(opts.life ?? 20)
    .battlefield(...mine);
  if (opts.commander !== undefined) b = b.battlefield(opts.commander, { commander: true });
  b = b.library('Island', LIBRARY).seat(1).library('Island', LIBRARY);
  if (theirs.length > 0) b = b.battlefield(...theirs);
  const g = b.at('end', { active: 1 }).build();
  g.act(1).pass();
  return g;
}

/** Seat 0 in its own precombat main phase with `mine` on the battlefield and nothing in hand. */
function ownMain(mine: string[], opts: { defs?: CardDefinition[]; life?: number } = {}) {
  let b = scenario();
  for (const d of opts.defs ?? []) b = b.define(d);
  return b
    .seat(0)
    .life(opts.life ?? 20)
    .battlefield(...mine)
    .landsPlayed(1)
    .library('Island', LIBRARY)
    .seat(1)
    .library('Island', LIBRARY)
    .at('precombatMain', { active: 0 })
    .build();
}

const activationsOf = async (g: ReturnType<typeof ownMain>) =>
  (await playUntilPass(g, 0)).actions.filter(isActivation);

describe('spare mana at the end of the opposing turn is used', () => {
  test('three untapped lands and "{3}: Draw a card": it draws', async () => {
    // Wrong to pass here: the hand is empty, the lands untap next, and the 10-card library is in no danger.
    const g = endStep([LIBRARY_LAMP.name, 'Island', 'Island', 'Island'], [], {
      defs: [LIBRARY_LAMP],
    });
    expect(await activationsOf(g)).toHaveLength(1);
  });

  test('an untapped pinger kills the opposing 1/1 at the end of the turn', async () => {
    // Wrong to pass here: the pinger untaps next turn anyway, and the 1/1 is the opponent's only creature.
    const g = endStep([PINGER.name], [V1], { defs: [PINGER] });
    const agent = blunderAgent();
    // The names are read before the play: the 1/1 the pinger kills leaves the battlefield.
    const names = new Map([[g.id(V1), V1]]);
    const { actions } = await playUntilPass(g, 0, agent);
    const targets = actions.flatMap((a) => (a.kind === 'chooseTargets' ? a.targets : []));
    expect(actions.some(isActivation)).toBe(true);
    expect(
      targets.map((t) => (t.kind === 'object' ? (names.get(t.id) ?? '?') : `player ${t.seat}`)),
    ).toEqual([V1]);
  });
});

describe('the main abilities of the board are used, not only the first ones listed', () => {
  test('at the opposing end step the commander makes a 2/2 token though three cheap scry abilities come first', async () => {
    // Wrong to pass or scry here: the hand is empty, the lands untap next turn, and a 2/2 body beats looking at the top card.
    const g = endStep(
      [SCRY_ORB.name, SCRY_ORB.name, SCRY_ORB.name, 'Plains', 'Plains', 'Plains'],
      [],
      { defs: [SCRY_ORB, BANNER_CAPTAIN], commander: BANNER_CAPTAIN.name },
    );
    const captain = g.id(BANNER_CAPTAIN.name);
    const orbs = g.view(0).battlefield.filter((o) => o.name === SCRY_ORB.name);
    // The position is the one named: every filler's id comes before the commander's as text.
    expect(orbs.every((o) => o.id < captain)).toBe(true);
    const activated = (await activationsOf(g)).map((a) => (a.kind === 'activate' ? a.object : ''));
    expect(activated).toContain(captain);
  });

  test('a sorcery-speed "{2}: create a 1/1" is activated while six lands pay for it', async () => {
    // Wrong to stop after one token here: the hand is empty and the mana has no other use this turn.
    const g = ownMain([SERVO_WORKS.name, ...Array.from({ length: 6 }, () => 'Plains')], {
      defs: [SERVO_WORKS],
    });
    expect(await activationsOf(g)).toHaveLength(3);
  });
});

describe('pumps that change the result are used', () => {
  test('a Pump Bear blocked by a 3/3 pumps twice with two lands: it kills the blocker and lives', async () => {
    // Wrong to stop at one pump here: the hand is empty, so the second {1} has no other use and saves the Bear.
    const g = scenario()
      .seat(0)
      .battlefield(PUMP_BEAR, 'Forest', 'Forest')
      .library('Island', LIBRARY)
      .seat(1)
      .battlefield(V3)
      .library('Island', LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({
      attack: [PUMP_BEAR],
      block: [{ blocker: V3, attacker: PUMP_BEAR }],
      until: 'declareBlockers',
    });
    const { actions } = await playUntilPass(g, 0);
    expect(actions.filter(isActivation)).toHaveLength(2);
  });

  test('an unblocked Firebreather pumps for exactly lethal on an opponent at 3', async () => {
    // Wrong to pass here: two pumps make 3 damage against 3 life, and the hand is empty.
    const g = scenario()
      .seat(0)
      .battlefield(FIREBREATHER, 'Mountain', 'Mountain')
      .library('Island', LIBRARY)
      .seat(1)
      .life(3)
      .library('Island', LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({ attack: [FIREBREATHER], block: [], until: 'declareBlockers' });
    const { actions } = await playUntilPass(g, 0);
    expect(actions.filter(isActivation)).toHaveLength(2);
  });
});

describe('abilities that waste or hurt are left alone', () => {
  test('a Pump Bear is not pumped in the main phase, before any combat', async () => {
    // Wrong here: the +1/+1 ends with the turn before any fight, and the opponent has no creatures to fight.
    const g = ownMain([PUMP_BEAR, 'Forest', 'Forest']);
    expect(await activationsOf(g)).toEqual([]);
  });

  test('at 2 life, "{T}, Pay 2 life: Draw a card" is not activated', async () => {
    // Wrong here: paying 2 life at 2 life loses the game for one card.
    const g = endStep([LIFE_TAP], [], { life: 2 });
    expect(await activationsOf(g)).toEqual([]);
  });

  test('"{T}: You lose 3 life" is not activated', async () => {
    // Wrong here: nothing on the board turns the life loss into a gain, so it only costs 3 life.
    const g = ownMain([CURSED_IDOL.name, 'Island'], { defs: [CURSED_IDOL] });
    expect(await activationsOf(g)).toEqual([]);
  });

  test('at 20 life, the sacrifice outlet does not eat its creatures for 2 life', async () => {
    // Wrong here: at 20 life with no threat on the opposing board, 2 life is not worth a creature.
    const g = ownMain([ALTAR, BEARS, BEARS]);
    expect(await activationsOf(g)).toEqual([]);
  });
});
