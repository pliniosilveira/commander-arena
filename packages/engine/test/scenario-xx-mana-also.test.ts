// Mana abilities with an extra effect: "{T}: Add {U} or {B}. ~ deals 1 damage to you." (a pain land).
// Pins: CR 605.1a (an activated ability that could add mana and has no target is a mana ability,
// whatever else it does), CR 605.3b (it resolves immediately, as one resolution: the mana is added,
// then the rest), CR 120.3a (damage to a player causes that much life loss), CR 119.3 (life
// changes), CR 704.5a (a player with 0 or less life loses).
// All cards are SYNTHETIC (src/cards/fixtures/synthetic-mana.ts) or the real fixtures named.
import { describe, expect, test } from 'vitest';
import type { Ability } from '../src/index';
import { validateAbility } from '../src/index';
import { scenario } from '../src/testing/index';

const PAIN = 'SYNTHETIC Pain Land';

describe('a pain land: mana, then damage to you, in the same activation (CR 605.3b)', () => {
  test('the colored ability adds the mana and the land deals 1 damage to its controller', () => {
    const g = scenario().seat(0).battlefield(PAIN).build();
    const before = g.mark();
    g.act(0).tapForMana(PAIN, { ability: 1, color: 'U' });
    g.expect.pool(0, 'U');
    g.expect.life(0, 39);
    g.expect.tapped(PAIN);
    // Costs first, then the mana, then the extra effect, all with no pass of priority in between.
    g.expect.eventLog(
      [
        { kind: 'tapped' },
        { kind: 'manaAdded', seat: 0, count: 1 },
        { kind: 'damageDealt', amount: 1, combat: false, to: { kind: 'player', seat: 0 } },
        { kind: 'lifeChanged', seat: 0, from: 40, to: 39 },
      ],
      { since: before },
    );
    g.expect.stack([]);
    g.expect.noEvent({ kind: 'priorityPassed' }, { since: before });
  });

  test('the damage comes from the land itself (CR 120.1: it is the source)', () => {
    const g = scenario().seat(0).battlefield(PAIN).build();
    const land = g.id(PAIN);
    const before = g.mark();
    g.act(0).tapForMana(PAIN, { ability: 1, color: 'B' });
    const hit = g.eventsSince(before).find((e) => e.kind === 'damageDealt');
    expect(hit).toMatchObject({ source: land });
  });

  test('the colorless ability of the same land does no damage', () => {
    const g = scenario().seat(0).battlefield(PAIN).build();
    g.act(0).tapForMana(PAIN, { ability: 0 });
    g.expect.pool(0, 'C');
    g.expect.life(0, 40);
  });

  test('its colors are a choice of two, like any "or" land', () => {
    const g = scenario().seat(0).battlefield(PAIN).build();
    const offered = g
      .legalActions(0)
      .flatMap((a) => (a.kind === 'activateAbility' && a.abilityIndex === 1 ? [a.color] : []));
    expect(offered.sort()).toEqual(['B', 'U']);
    expect(g.act(0).try.tapForMana(PAIN, { ability: 1, color: 'G' }).ok).toBe(false);
  });

  test('lifegain and life loss riders work the same way', () => {
    const g = scenario().seat(0).battlefield('SYNTHETIC Gain Land', 'SYNTHETIC Drain Land').build();
    g.act(0).tapForMana('SYNTHETIC Gain Land');
    g.expect.life(0, 41);
    g.act(0).tapForMana('SYNTHETIC Drain Land');
    g.expect.life(0, 39);
    g.expect.pool(0, 'WBB');
  });

  test('the controller loses at once if the damage takes them to 0 (CR 704.5a)', () => {
    const g = scenario().seat(0).life(1).battlefield(PAIN).seat(1).build();
    g.act(0).tapForMana(PAIN, { ability: 1, color: 'U' });
    g.expect.life(0, 0);
    g.expect.hasLost(0);
    g.expect.gameOver({ win: 1 });
  });
});

describe('payment by the planner', () => {
  test('a plain land is tapped before a pain land (no damage when it is not needed)', () => {
    const g = scenario().seat(0).hand('Typhoid Rats').battlefield(PAIN, 'Swamp').build();
    g.act(0).cast('Typhoid Rats', { pay: true });
    g.expect.tapped('Swamp');
    g.expect.tapped(PAIN, false);
    g.expect.life(0, 40);
  });

  test('the pain land pays the colored mana when nothing else can, and its damage happens', () => {
    const g = scenario().seat(0).hand('Typhoid Rats').battlefield(PAIN).build();
    g.act(0).cast('Typhoid Rats', { pay: true });
    g.expect.tapped(PAIN);
    g.expect.life(0, 39);
  });

  test('generic mana is paid with its colorless ability, so there is no damage', () => {
    const g = scenario().seat(0).hand('Grizzly Bears').battlefield(PAIN, 'Forest').build();
    g.act(0).cast('Grizzly Bears', { pay: true });
    g.expect.life(0, 40);
  });

  test('automatic payment never takes its own player to 0: the spell is not offered', () => {
    const dying = scenario().seat(0).life(1).hand('Typhoid Rats').battlefield(PAIN).build();
    dying.expect.illegal(0, { cast: 'Typhoid Rats' });
    const safe = scenario().seat(0).life(2).hand('Typhoid Rats').battlefield(PAIN).build();
    safe.expect.legal(0, { cast: 'Typhoid Rats' });
    safe.act(0).cast('Typhoid Rats', { pay: true });
    safe.expect.life(0, 1);
  });

  test('the damage of a source used by manual payment happens when it is tapped', () => {
    const g = scenario().seat(0).hand('Typhoid Rats').battlefield(PAIN).build();
    g.act(0)
      .cast('Typhoid Rats')
      .payManual([{ source: PAIN, color: 'B', ability: 1 }]);
    g.expect.life(0, 39);
  });
});

describe('validation of the extra effects of a mana ability', () => {
  const mana = (also: unknown): Ability =>
    ({
      kind: 'mana',
      cost: [{ kind: 'tap' }],
      production: { kind: 'fixed', mana: ['G'] },
      also,
    }) as Ability;
  const messages = (also: unknown) => validateAbility(mana(also)).map((i) => i.message);

  test('damage to you, losing life and gaining life are valid', () => {
    expect(messages([{ kind: 'dealDamage', amount: 1, to: { kind: 'you' } }])).toEqual([]);
    expect(messages([{ kind: 'loseLife', player: { kind: 'you' }, amount: 2 }])).toEqual([]);
    expect(messages([{ kind: 'gainLife', player: { kind: 'you' }, amount: 1 }])).toEqual([]);
  });

  test('anything with a target, a choice or another recipient is rejected', () => {
    const target = { kind: 'target', id: 't1' };
    expect(messages([{ kind: 'dealDamage', amount: 1, to: target }]).join()).toContain(
      'only deal damage to you',
    );
    expect(
      messages([{ kind: 'dealDamage', amount: 1, to: { kind: 'eachOpponent' } }]),
    ).toHaveLength(1);
    expect(
      messages([{ kind: 'loseLife', player: { kind: 'eachOpponent' }, amount: 1 }]),
    ).toHaveLength(1);
    expect(messages([{ kind: 'draw', player: { kind: 'you' }, count: 1 }]).join()).toContain(
      'CR 605.1a',
    );
    expect(messages([{ kind: 'destroy', objects: { kind: 'this' } }])).toHaveLength(1);
    expect(
      messages([{ kind: 'dealDamage', amount: { kind: 'x' }, to: { kind: 'you' } }]),
    ).toHaveLength(1);
    expect(messages([{ kind: 'dealDamage', amount: 0, to: { kind: 'you' } }])).toHaveLength(1);
  });

  test('an empty list is rejected', () => {
    expect(messages([])).toHaveLength(1);
  });
});
