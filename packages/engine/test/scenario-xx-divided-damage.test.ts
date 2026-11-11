// "~ deals X damage divided as you choose among any number of target creatures, where X is the greatest power among creatures you control as
// you cast this spell." (D-145): `TargetSpec.divide` (the division announced with the targets) and the effect `dealDividedDamage`.
// Pins: CR 601.2d (the player announces the division as the spell is cast; each target gets at least one), CR 601.2c (a variable number of
// targets; "any number" includes none), CR 608.2b (an illegal target is not affected by the effect, the others still are; with every target
// illegal the spell does not resolve), CR 120.3 (damage dealt by the spell), CR 107.3c and 601.2d (the amount is read as the spell is
// cast, and does not change afterwards). Cards are SYNTHETIC (src/cards/fixtures/synthetic-divide.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import type { ChosenTarget } from '../src/index';
import { legalActionsForDecision, syntheticCard, validateCard } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';
import { targetsDecision } from './pending-helpers';

const RAMPAGE = 'SYNTHETIC Divided Rampage'; // {2}{R} sorcery: X divided among any number of target creatures, X = greatest power I control
const MEASURED = 'SYNTHETIC Measured Volley'; // {R} instant: like Rampage, among one or two target creatures
const VOLLEY = 'SYNTHETIC Arc Volley'; // {1}{R} instant: 3 divided among one, two or three targets
const V22 = 'SYNTHETIC Vanilla 2/2';
const V33 = 'SYNTHETIC Vanilla 3/3';
const V55 = 'SYNTHETIC Vanilla 5/5';
const BOLT = 'Lightning Bolt';

/** Answers the targets decision with `(label, share)` pairs, returning the engine's verdict instead of throwing. */
const answer = (g: ScenarioGame, picks: readonly (readonly [string, number | undefined])[]) =>
  g.act(0).try.action({
    kind: 'chooseTargets',
    targets: picks.map(
      ([label, share]): ChosenTarget => ({
        kind: 'object',
        id: g.id(label),
        specId: 't1',
        ...(share === undefined ? {} : { share }),
      }),
    ),
  });

describe('the cards are valid', () => {
  test.each([RAMPAGE, VOLLEY, MEASURED])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('any number of target creatures, X = greatest power as it is cast', () => {
  const game = () =>
    scenario()
      .seat(0)
      .hand(RAMPAGE)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .battlefield(V55, { label: 'big' })
      .battlefield(V22, { label: 'mine2' })
      .seat(1)
      .battlefield(V22, { label: 'a' })
      .battlefield(V33, { label: 'b' })
      .battlefield(V55, { label: 'c' })
      .build();

  test('the decision says what is divided and how many targets there can be', () => {
    const g = game();
    g.act(0).cast(RAMPAGE);
    const spec = targetsDecision(g).specs[0];
    expect(spec?.divide).toBe(5);
    expect(spec?.min).toBe(0);
    expect(spec?.max).toBe(5);
    // Every creature is a legal target, mine included.
    expect(spec?.legal).toHaveLength(5);
  });

  test('the damage is dealt by the spell, each target getting its share', () => {
    const g = game();
    g.act(0).cast(RAMPAGE, { targets: ['a', 'b'], divide: [2, 3], pay: true });
    g.passAll();
    g.expect.zone(V22, 'graveyard', { seat: 1 });
    g.expect.zone(V33, 'graveyard', { seat: 1 });
    g.expect.damage('c', 0);
    g.expect.invariants();
  });

  test('a share smaller than the toughness only marks damage', () => {
    const g = game();
    g.act(0).cast(RAMPAGE, { targets: ['c', 'b'], divide: [4, 1], pay: true });
    g.passAll();
    g.expect.damage('c', 4);
    g.expect.damage('b', 1);
    g.expect.zone(V55, 'battlefield', { seat: 1 });
  });

  test('all of it may go to one target, a creature of the caster included', () => {
    const g = game();
    g.act(0).cast(RAMPAGE, { targets: ['mine2'], divide: [5], pay: true });
    g.passAll();
    g.expect.zone(V22, 'graveyard', { seat: 0 });
  });

  test('no target at all is allowed: the spell resolves and does nothing', () => {
    const g = game();
    g.act(0).cast(RAMPAGE, { targets: [], pay: true });
    g.passAll();
    g.expect.zone(RAMPAGE, 'graveyard', { seat: 0 });
    g.expect.damage('a', 0);
    g.expect.damage('b', 0);
  });

  test('the division must give out all of X, at least 1 to each target, and exactly X', () => {
    const g = game();
    g.act(0).cast(RAMPAGE);
    expect(
      answer(g, [
        ['a', 2],
        ['b', 2],
      ]).ok,
    ).toBe(false); // 4 of 5
    expect(
      answer(g, [
        ['a', 3],
        ['b', 3],
      ]).ok,
    ).toBe(false); // 6 of 5
    expect(
      answer(g, [
        ['a', 5],
        ['b', 0],
      ]).ok,
    ).toBe(false); // each target gets at least one
    expect(
      answer(g, [
        ['a', 5],
        ['b', undefined],
      ]).ok,
    ).toBe(false); // a share is announced for each
    expect(
      answer(g, [
        ['a', 2.5],
        ['b', 2.5],
      ]).ok,
    ).toBe(false); // whole numbers
    expect(answer(g, [['a', 5]]).ok).toBe(true);
  });

  test('a target twice in the one slot is refused (CR 601.2c)', () => {
    const g = game();
    g.act(0).cast(RAMPAGE);
    expect(
      answer(g, [
        ['a', 2],
        ['a', 3],
      ]).ok,
    ).toBe(false);
  });

  test('X is read as the spell is cast: killing the biggest creature in response changes nothing', () => {
    const g = scenario()
      .seat(0)
      .hand(RAMPAGE, BOLT)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain')
      .battlefield(V33, { label: 'big' })
      .seat(1)
      .battlefield(V55, { label: 'c' })
      .build();
    g.act(0).cast(RAMPAGE, { targets: ['c'], divide: [3], pay: true });
    g.act(0).cast(BOLT, { targets: ['big'], pay: true });
    g.passAll();
    g.passAll();
    g.expect.zone(V33, 'graveyard', { seat: 0 });
    g.expect.damage('c', 3);
  });

  test('a target that became illegal gets nothing, the others still get theirs (CR 608.2b)', () => {
    const g = scenario()
      .seat(0)
      .hand(RAMPAGE, BOLT)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain')
      .battlefield(V55, { label: 'big' })
      .seat(1)
      .battlefield(V22, { label: 'a' })
      .battlefield(V33, { label: 'b' })
      .build();
    g.act(0).cast(RAMPAGE, { targets: ['a', 'b'], divide: [2, 3], pay: true });
    g.act(0).cast(BOLT, { targets: ['a'], pay: true });
    g.passAll();
    g.passAll();
    g.expect.zone(V22, 'graveyard', { seat: 1 });
    g.expect.zone(V33, 'graveyard', { seat: 1 });
    expect(g.eventsSince(0).some((e) => e.kind === 'fizzled')).toBe(false);
  });

  test('every target illegal: the spell does not resolve (CR 608.2b)', () => {
    const g = scenario()
      .seat(0)
      .hand(RAMPAGE, BOLT)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain')
      .battlefield(V55, { label: 'big' })
      .seat(1)
      .battlefield(V22, { label: 'a' })
      .build();
    g.act(0).cast(RAMPAGE, { targets: ['a'], divide: [5], pay: true });
    g.act(0).cast(BOLT, { targets: ['a'], pay: true });
    g.passAll();
    g.passAll();
    expect(g.eventsSince(0).some((e) => e.kind === 'fizzled')).toBe(true);
    g.expect.damage('big', 0);
  });

  test('with no creature of mine X is 0: no target can be chosen, the spell can still be cast', () => {
    const g = scenario()
      .seat(0)
      .hand(RAMPAGE)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .battlefield(V22, { label: 'a' })
      .build();
    g.act(0).cast(RAMPAGE);
    const spec = targetsDecision(g).specs[0];
    expect(spec?.divide).toBe(0);
    expect(spec?.max).toBe(0);
    expect(answer(g, [['a', 1]]).ok).toBe(false);
    expect(answer(g, []).ok).toBe(true);
  });
});

describe('a division needs at least one damage for each target the spell requires (CR 601.2c, 601.2d)', () => {
  const game = (creature: boolean) => {
    const b = scenario().seat(0).hand(MEASURED).battlefield('Mountain');
    return (creature ? b.battlefield(V33) : b).seat(1).battlefield(V22, { label: 'a' }).build();
  };

  test('with X = 0 and one target required the spell can not be cast', () => {
    const g = game(false);
    g.expect.illegal(0, { cast: MEASURED });
  });

  test('with X = 3 it can: one or two targets', () => {
    const g = game(true);
    g.expect.legal(0, { cast: MEASURED });
    g.act(0).cast(MEASURED);
    expect(targetsDecision(g).specs[0]).toMatchObject({ min: 1, max: 2, divide: 3 });
  });
});

describe('one, two or three targets of any kind, 3 damage', () => {
  const game = () =>
    scenario()
      .seat(0)
      .hand(VOLLEY)
      .battlefield('Mountain', 'Mountain')
      .seat(1)
      .life(20)
      .battlefield(V22, { label: 'a' })
      .battlefield(V33, { label: 'b' })
      .build();

  test('players and creatures share the damage', () => {
    const g = game();
    g.act(0).cast(VOLLEY, { targets: [{ player: 1 }, 'a'], divide: [1, 2], pay: true });
    g.passAll();
    g.expect.life(1, 19);
    g.expect.zone(V22, 'graveyard', { seat: 1 });
  });

  test('the number of targets is at most the total and at most 3: with 3 damage three targets get 1 each', () => {
    const g = game();
    g.act(0).cast(VOLLEY, { targets: [{ player: 1 }, 'a', 'b'], divide: [1, 1, 1], pay: true });
    g.passAll();
    g.expect.life(1, 19);
    g.expect.damage('a', 1);
    g.expect.damage('b', 1);
  });

  test('at least one target is needed', () => {
    const g = game();
    g.act(0).cast(VOLLEY);
    const spec = targetsDecision(g).specs[0];
    expect(spec?.min).toBe(1);
    expect(spec?.max).toBe(3);
    expect(g.act(0).try.action({ kind: 'chooseTargets', targets: [] }).ok).toBe(false);
  });

  test('a spell that divides nothing takes no share', () => {
    const g = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield('Mountain')
      .seat(1)
      .battlefield(V22, { label: 'a' })
      .build();
    g.act(0).cast(BOLT);
    const verdict = g.act(0).try.action({
      kind: 'chooseTargets',
      targets: [
        {
          kind: 'object',
          id: g.id('a'),
          specId: targetsDecision(g).specs[0]?.specId ?? '',
          share: 3,
        },
      ],
    });
    expect(verdict.ok).toBe(false);
  });
});

describe('the validator: a division and its damage go together, in a spell', () => {
  const withSpell = (name: string, change: (spell: Record<string, unknown>) => void) => {
    const card = syntheticCard(name);
    const face = card.faces[0];
    if (face === undefined || face.spell === undefined) throw new Error('no spell');
    const spell = structuredClone(face.spell) as unknown as Record<string, unknown>;
    change(spell);
    // biome-ignore lint/suspicious/noExplicitAny: a deliberately malformed card for the validator
    return validateCard({ ...card, faces: [{ ...face, spell }] } as any).map((i) => i.message);
  };

  test('a slot with a division needs the effect that deals it', () => {
    const issues = withSpell(RAMPAGE, (s) => {
      s.effect = { kind: 'dealDamage', amount: 1, to: { kind: 'target', id: 't1' } };
    });
    expect(issues.join('\n')).toContain('divides something but no dealDividedDamage deals it');
  });

  test('the effect needs a slot with a division', () => {
    const issues = withSpell(RAMPAGE, (s) => {
      (s.targets as { divide?: unknown }[])[0] = { id: 't1', what: { kind: 'anyTarget' } } as never;
    });
    expect(issues.join('\n')).toContain('whose slot has no divide');
  });

  test('the total is an amount read as the spell is cast: no X, no target', () => {
    const issues = withSpell(RAMPAGE, (s) => {
      const slot = (s.targets as { divide: { total: unknown } }[])[0];
      if (slot !== undefined) slot.divide.total = { kind: 'x' };
    });
    expect(issues.length).toBeGreaterThan(0);
  });

  test('the effect of an ability cannot divide: it is announced as a spell is cast', () => {
    const card = syntheticCard('SYNTHETIC Duel');
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const bad = {
      ...card,
      faces: [
        {
          ...face,
          abilities: [
            {
              kind: 'activated',
              cost: [{ kind: 'tap' }],
              targets: [{ id: 't1', what: { kind: 'anyTarget' }, divide: { total: 2 } }],
              effect: { kind: 'dealDividedDamage', to: { kind: 'target', id: 't1' } },
            },
          ],
        },
      ],
    };
    // biome-ignore lint/suspicious/noExplicitAny: a deliberately malformed card for the validator
    const issues = validateCard(bad as any).map((i) => i.message);
    expect(issues.join('\n')).toContain('only the targets of a spell');
  });
});

describe('the legal actions list a division with every set of targets', () => {
  test.each([
    [RAMPAGE, 5],
    [VOLLEY, 3],
  ])('%s: each listed answer is accepted and divides everything', (card, total) => {
    const make = () =>
      scenario()
        .seat(0)
        .hand(card)
        .battlefield('Mountain', 'Mountain', 'Mountain')
        .battlefield(V55)
        .seat(1)
        .battlefield(V22)
        .battlefield(V33)
        .build();
    const g = make();
    g.act(0).cast(card);
    const listed = legalActionsForDecision(targetsDecision(g)).filter(
      (a) => a.kind === 'chooseTargets',
    );
    expect(listed.length).toBeGreaterThan(3);
    for (const action of listed) {
      if (action.kind !== 'chooseTargets') continue;
      if (action.targets.length > 0) {
        expect(action.targets.reduce((n, t) => n + (t.share ?? 0), 0)).toBe(total);
      }
      const fresh = make();
      fresh.act(0).cast(card);
      expect(fresh.act(0).try.action(action).ok).toBe(true);
    }
  });
});
