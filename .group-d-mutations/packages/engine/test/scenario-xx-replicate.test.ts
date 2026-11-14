// Replicate (CR 702.56a, 702.56b, D-129): "As an additional cost to cast this spell, you may pay [cost] any number of times"
// and "When you cast this spell, if a replicate cost was paid for it, copy it for each time its replicate cost was paid. If
// the spell has any targets, you may choose new targets for any of the copies."
// Pins: CR 702.56a (the count is asked as the spell is cast, after the kicker and before X and the targets, up to what the
// whole cost can pay; paying follows 601.2b and 601.2f-h; the trigger has an intervening "if", CR 603.4, so nothing
// triggers when it was not paid; one copy per payment, each with the choices of the spell and with new targets
// possible), 707.10 (copies are not cast), 707.10f (a copy of a permanent spell becomes a token), 113.7a (a spell
// countered in response to the trigger is still copied), 733 (cancel).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-copies.ts) except Lightning Bolt, Counterspell and the creatures.
import { describe, expect, test } from 'vitest';
import {
  type GameObject,
  getView,
  isFeatureSupported,
  syntheticCard,
  validateCard,
} from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { chooseXDecision } from './pending-helpers';

const BOLT = 'SYNTHETIC Replicate Bolt'; // {R}, replicate {R}: 1 damage to any target
const DRAIN = 'SYNTHETIC Replicate Drain'; // {B} sorcery, replicate {B}: each opponent loses 1 life
const IMP = 'SYNTHETIC Replicate Imp'; // {1}{R} 1/1, replicate {1}: when it enters, you gain 1 life
const KICK = 'SYNTHETIC Replicate Kick Bolt'; // {R}, kicker {1}, replicate {R}: 1 (3 kicked) damage to target creature
const X_BURN = 'SYNTHETIC Replicate X Burn'; // {X}{R}, replicate {R}: X damage to any target
const TWIN = 'SYNTHETIC Twin Spell';
const COUNTERSPELL = 'Counterspell';
const SPIDER = 'Giant Spider'; // 2/4
const BEARS = 'Grizzly Bears';

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;
type Builder = ReturnType<typeof scenario>;

function game(configure: (b: Builder) => Builder): ScenarioGame {
  return configure(scenario().seat(0).life(20))
    .seat(0)
    .library(...FILLER)
    .seat(1)
    .life(20)
    .library(...FILLER)
    .build();
}

const resolveTop = (g: ScenarioGame): void => {
  g.pass();
  g.pass();
};

const copies = (g: ScenarioGame): GameObject[] =>
  [...g.state.stack]
    .reverse()
    .map((id) => g.state.objects[id])
    .filter((o): o is GameObject => o?.copyOf !== undefined);

const mountains = (b: Builder, n: number) => b.battlefield('Mountain', { count: n });

describe('the question: how many times to pay the replicate cost (CR 702.56a, 601.2b)', () => {
  test('is asked as the spell is cast, with the most times the whole cost could be paid', () => {
    const g = game((b) => mountains(b.seat(0).hand(BOLT), 4));
    g.act(0).cast(BOLT);
    const d = chooseXDecision(g);
    expect(d).toMatchObject({
      seat: 0,
      purpose: 'replicate',
      min: 0,
      max: 3,
      perX: { mana: 0, life: 0 },
      cost: [{ kind: 'mana', symbols: ['R'] }],
      sourceName: BOLT,
    });
    expect(d.source).toBe(g.id({ name: BOLT, zone: 'stack' }));
    expect(g.state.casting?.stage).toBe('kicker');
    // Every count from 0 to the most is a legal answer.
    expect(
      g
        .legalActions(0)
        .flatMap((a) => (a.kind === 'chooseX' ? [a.value] : []))
        .sort(),
    ).toEqual([0, 1, 2, 3]);
  });

  test('is not asked when the cost could not be paid even once', () => {
    const g = game((b) => mountains(b.seat(0).hand(BOLT), 1));
    g.act(0).cast(BOLT);
    g.expect.pending('targets', 0);
  });

  test('comes after the targets of nothing: first the count, then the targets, then the payment', () => {
    const g = game((b) => mountains(b.seat(0).hand(BOLT), 3));
    g.act(0).cast(BOLT);
    g.act(0).chooseX(2);
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 1 });
    g.expect.pending('payMana', 0);
    expect(g.state.casting?.totalCost).toEqual(['R', 'R', 'R']);
  });

  test('pays the cost once for each time: the total is the mana cost plus the replicate cost times the count', () => {
    for (const n of [0, 1, 2, 3]) {
      const g = game((b) => mountains(b.seat(0).hand(BOLT), 4));
      g.act(0).cast(BOLT, { replicas: n, targets: [{ player: 1 }], pay: true });
      expect(
        g.find({ name: 'Mountain', zone: 'battlefield' }).filter((o) => o.tapped),
      ).toHaveLength(1 + n);
    }
  });

  test('can be taken back: cancelling rewinds the cast (CR 733)', () => {
    const g = game((b) => mountains(b.seat(0).hand(BOLT), 4));
    const before = g.positionHash();
    g.act(0).cast(BOLT);
    g.act(0).chooseX(2);
    g.act(0).cancel();
    g.expect.position(before);
  });
});

describe('the trigger and the copies (CR 702.56a, 603.4, 707.10)', () => {
  test('not paid: nothing triggers and the spell is alone on the stack', () => {
    const g = game((b) => mountains(b.seat(0).hand(BOLT), 4));
    g.act(0).cast(BOLT, { replicas: 0, targets: [{ player: 1 }], pay: true });
    g.expect.stack([BOLT]);
    g.expect.noEvent({ kind: 'abilityTriggered' });
    expect(g.eventsSince(0).find((e) => e.kind === 'spellCast')).not.toHaveProperty('replicas');
    expect(g.object({ name: BOLT, zone: 'stack' }).stack?.replicated).toBeUndefined();
  });

  test('paid twice: the trigger goes above the spell, and makes two copies, each asking for new targets', () => {
    const g = game((b) => mountains(b.seat(0).hand(BOLT), 4).seat(1).battlefield(SPIDER));
    g.act(0).cast(BOLT, { replicas: 2, targets: [{ player: 1 }], pay: true });
    g.expect.stack([`${BOLT} (ability)`, BOLT]);
    expect(g.eventsSince(0)).toContainEqual(
      expect.objectContaining({ kind: 'spellCast', replicas: 2 }),
    );
    expect(g.object({ name: BOLT, zone: 'stack' }).stack?.replicated).toBe(2);
    expect(getView(g.state, 1).stack.find((o) => o.name === BOLT)?.replicated).toBe(2);
    resolveTop(g);
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets(SPIDER);
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 1 });
    expect(copies(g)).toHaveLength(2);
    g.expect.stack([BOLT, BOLT, BOLT]);
    // The copies are not cast: the seat has cast one spell.
    expect(g.state.seats[0]?.spellsCastThisTurn).toBe(1);
    g.passAll();
    // The original and one copy hit the opponent, the other copy the Spider.
    g.expect.life(1, 18);
    g.expect.damage(SPIDER, 1);
    g.expect.invariants();
  });

  test('a spell with no targets is copied without a question, once for each payment', () => {
    const g = game((b) => b.seat(0).hand(DRAIN).battlefield('Swamp', { count: 4 }));
    g.act(0).cast(DRAIN, { replicas: 3, pay: true });
    resolveTop(g);
    expect(copies(g)).toHaveLength(3);
    g.expect.pending('priority', 0);
    g.passAll();
    g.expect.life(1, 16);
  });

  test('a copy does not replicate again, and a copy made by another effect has the same count', () => {
    const g = game((b) =>
      mountains(b.seat(0).hand(BOLT, TWIN), 3).battlefield('Island', { count: 2 }),
    );
    g.act(0).cast(BOLT, { replicas: 1, targets: [{ player: 1 }], pay: true });
    resolveTop(g); // the replicate trigger: one copy, new targets asked
    g.act(0).chooseTargets({ player: 1 });
    g.act(0).cast(TWIN, { targets: [{ name: BOLT, zone: 'stack', nth: 0 }], pay: true });
    resolveTop(g);
    g.act(0).chooseTargets({ player: 1 });
    expect(copies(g)).toHaveLength(2);
    expect(copies(g).map((c) => c.stack?.replicated)).toEqual([1, 1]);
    // Only the casts count and only the cast triggered: no trigger is on the stack.
    expect(g.state.stack.filter((id) => g.state.objects[id]?.stack?.ability != null)).toHaveLength(
      0,
    );
  });

  test('a spell countered in response to the trigger is still copied: from last-known information', () => {
    const g = game((b) =>
      mountains(b.seat(0).hand(BOLT), 3)
        .seat(1)
        .hand(COUNTERSPELL)
        .battlefield('Island', { count: 2 }),
    );
    g.act(0).cast(BOLT, { replicas: 2, targets: [{ player: 1 }], pay: true });
    g.pass(0);
    g.act(1).cast(COUNTERSPELL, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    resolveTop(g);
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    resolveTop(g); // the trigger
    g.act(0).chooseTargets({ player: 1 });
    g.act(0).chooseTargets({ player: 1 });
    expect(copies(g)).toHaveLength(2);
    g.passAll();
    g.expect.life(1, 18);
    g.expect.zone(BOLT, 'graveyard', { seat: 0, count: 1 });
  });
});

describe('what the copies have (CR 707.10)', () => {
  test('the kicker is asked first, then the count; the copies are kicked and the total cost has both', () => {
    const g = game((b) => mountains(b.seat(0).hand(KICK), 5).seat(1).battlefield(SPIDER));
    g.act(0).cast(KICK);
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept(); // kicker
    expect(chooseXDecision(g)).toMatchObject({ purpose: 'replicate', max: 3 });
    g.act(0).chooseX(2);
    g.act(0).chooseTargets(SPIDER);
    // {R} + the kicker {1} + two replicate costs {R}{R}
    expect(g.state.casting?.totalCost).toEqual(['R', '1', 'R', 'R']);
    g.act(0).payAuto();
    resolveTop(g);
    // The Spider is the only creature a copy could target: there is nothing to choose, so nothing is asked.
    g.expect.pending('priority', 0);
    expect(copies(g).map((c) => c.stack?.kicked)).toEqual([true, true]);
    g.passAll();
    // Three kicked spells, 3 damage each, on a 2/4 Spider: it dies to the second.
    g.expect.noObject(SPIDER, { zone: 'battlefield' });
  });

  test('the kicker can be declined and the count still asked', () => {
    const g = game((b) => mountains(b.seat(0).hand(KICK), 3).seat(1).battlefield(SPIDER));
    g.act(0).cast(KICK);
    g.act(0).decline();
    expect(chooseXDecision(g)).toMatchObject({ purpose: 'replicate', max: 2 });
  });

  test('X is announced after the count, and the copies have the same X', () => {
    const g = game((b) => mountains(b.seat(0).hand(X_BURN), 5));
    g.act(0).cast(X_BURN);
    g.act(0).chooseX(1);
    // The most X leaves the mana of the replicate cost: 5 lands - {R} - {R} = 3.
    const d = chooseXDecision(g);
    expect(d).toMatchObject({ purpose: 'spell', max: 3 });
    g.act(0).chooseX(3);
    g.act(0).chooseTargets({ player: 1 });
    g.act(0).payAuto();
    resolveTop(g);
    g.act(0).chooseTargets({ player: 1 });
    expect(copies(g)[0]?.stack?.x).toBe(3);
    g.passAll();
    g.expect.life(1, 14);
  });

  test('a permanent spell: each copy becomes a token, and enters with its trigger', () => {
    const g = game((b) => mountains(b.seat(0).hand(IMP), 4));
    g.act(0).cast(IMP, { replicas: 2, pay: true });
    resolveTop(g);
    expect(copies(g)).toHaveLength(2);
    g.passAll();
    const imps = g.find({ name: IMP, zone: 'battlefield' });
    expect(imps).toHaveLength(3);
    expect(imps.filter((o) => o.token !== null)).toHaveLength(2);
    g.expect.life(0, 23);
    g.expect.invariants();
  });
});

describe('validation and features', () => {
  test('the keyword, the effect and the condition are supported features', () => {
    expect(isFeatureSupported('keyword:replicate')).toBe(true);
    expect(isFeatureSupported('effect:replicate')).toBe(true);
    expect(isFeatureSupported('condition:replicated')).toBe(true);
  });

  test('every synthetic card of the slice is valid', () => {
    for (const name of [BOLT, DRAIN, IMP, KICK, X_BURN]) {
      expect(validateCard(syntheticCard(name)), name).toEqual([]);
    }
  });

  const withAbilities = (name: string, abilities: unknown) => {
    const base = syntheticCard(name);
    const face = base.faces[0];
    if (face === undefined) throw new Error('no face');
    return { ...base, faces: [{ ...face, abilities: abilities as never }] };
  };
  const messages = (card: ReturnType<typeof withAbilities>) =>
    validateCard(card)
      .map((i) => i.message)
      .join(' | ');

  test('the cost is mana, with no X, and there is one', () => {
    const rep = (cost: unknown) => [{ kind: 'keyword', keyword: { kind: 'replicate', cost } }];
    expect(messages(withAbilities(BOLT, rep([{ kind: 'mana', symbols: ['X'] }])))).toContain(
      'X in a replicate',
    );
    expect(messages(withAbilities(BOLT, rep([{ kind: 'payLife', amount: 2 }])))).toContain(
      'mana only',
    );
    expect(messages(withAbilities(BOLT, rep([])))).toContain('needs a cost');
  });

  test('a face has at most one replicate ability', () => {
    const one = {
      kind: 'keyword',
      keyword: { kind: 'replicate', cost: [{ kind: 'mana', symbols: ['R'] }] },
    };
    expect(messages(withAbilities(BOLT, [one, one]))).toContain('more than one replicate');
  });

  test('the replicate effect stands only in "when you cast this spell", and the condition needs a replicate ability', () => {
    const trig = (trigger: unknown, interveningIf?: unknown) => [
      {
        kind: 'triggered',
        trigger,
        ...(interveningIf === undefined ? {} : { interveningIf }),
        effect: { kind: 'replicate' },
      },
    ];
    expect(messages(withAbilities(BOLT, trig({ kind: 'upkeep', whose: 'you' })))).toContain(
      'replicate',
    );
    expect(
      messages(
        withAbilities(DRAIN, [
          {
            kind: 'triggered',
            trigger: { kind: 'upkeep', whose: 'you' },
            interveningIf: { kind: 'replicated' },
            effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
          },
        ]),
      ),
    ).toContain('replicated condition needs a replicate');
  });
});

describe('the engine reads it as the rules do (CR 702.56a)', () => {
  test("the replicate trigger is the spell's own: a card in a hand has none, and a Bears has no such ability", () => {
    const g = game((b) => mountains(b.seat(0).hand(BOLT).battlefield(BEARS), 4));
    expect(getView(g.state, 0).seats[0]?.hand?.[0]?.keywords).toContain('replicate');
    g.expect.noEvent({ kind: 'abilityTriggered' });
  });
});
