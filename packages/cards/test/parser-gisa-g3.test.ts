// The Gisa deck (issue 41), group 3 (D-1420 to D-1428): the lines of Liliana, Dreadhorde General ("Each opponent chooses a permanent they control of each permanent type and
// sacrifices the rest."), Priest of Forgotten Gods ("{T}, Sacrifice two other creatures: Any number of target players each lose 2 life and sacrifice a creature of their choice. You
// add {B}{B} and draw a card."), Krav, the Unredeemed ("Partner with Regna, the Redeemer" and "{B}, Sacrifice X creatures: Target player draws X cards and gains X life. Put X +1/+1
// counters on ~.") and Plumb the Forbidden ("As an additional cost to cast ~, you may sacrifice one or more creatures. When you do, copy ~ for each creature sacrificed this way.")
// through the whole pipeline, the near misses the grammar must not read, and the features each lowering needs. The engine runs what is lowered in
// convert-grammar-engine-gisa-g3.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { dropped, read, readAll, withoutFeature } from './parser-p5-helpers';

const BOTH = ['artifact', 'battle', 'creature', 'enchantment', 'land', 'planeswalker'];

describe('Liliana, Dreadhorde General: "Each opponent chooses a permanent they control of each permanent type and sacrifices the rest." (CR 608.2d, 701.21a, 110.4)', () => {
  const LINE =
    '−9: Each opponent chooses a permanent they control of each permanent type and sacrifices the rest.';

  test('the real line: the engine sparePermanents of the six permanent types, each opponent choosing for themselves', () => {
    const parsed = readAll(LINE, 'planeswalker' as never);
    expect(parsed.abilities).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'loyalty', change: -9 }],
        effect: {
          kind: 'sparePermanents',
          types: BOTH,
          own: { players: { kind: 'eachOpponent' } },
        },
      },
    ]);
  });

  test.each([
    '−9: Each player chooses a permanent they control of each permanent type and sacrifices the rest.',
    '−9: Each opponent chooses a permanent they control of each permanent type.',
    '−9: Each opponent chooses a permanent they control of each card type and sacrifices the rest.',
    '−9: Each opponent chooses a creature they control of each permanent type and sacrifices the rest.',
    '−9: Each opponent chooses a permanent you control of each permanent type and sacrifices the rest.',
    '−9: Each opponent chooses a permanent they control of each permanent type and sacrifices the others.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'planeswalker' as never);
    expect(parsed.abilities, text).toEqual([]);
    expect(parsed.unparsed, text).toHaveLength(1);
  });

  test('the lowering names the engine feature it needs', () => {
    const missing = withoutFeature('effect:sparePermanents', LINE, 'planeswalker' as never);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('effect:sparePermanents');
  });
});

describe('Priest of Forgotten Gods: "{T}, Sacrifice two other creatures: Any number of target players each lose 2 life and sacrifice a creature of their choice. You add {B}{B} and draw a card." (CR 118.3, 115.1, 605.1a)', () => {
  const LINE =
    '{T}, Sacrifice two other creatures: Any number of target players each lose 2 life and sacrifice a creature of their choice. You add {B}{B} and draw a card.';

  test('the real line: a sacrifice of two other creatures, a slot of any number of target players, the life, the sacrifice, the mana and the card', () => {
    expect(readAll(LINE, 'creature').abilities).toEqual([
      {
        kind: 'activated',
        cost: [
          { kind: 'tap' },
          { kind: 'sacrifice', what: { types: ['creature'], other: true }, count: 2 },
        ],
        targets: [{ id: 't1', what: { kind: 'player', filter: 'any' }, anyNumber: true }],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'loseLife', player: { kind: 'target', id: 't1' }, amount: 2 },
            {
              kind: 'sacrifice',
              objects: { kind: 'choose', filter: { types: ['creature'] } },
              player: { kind: 'target', id: 't1' },
            },
            { kind: 'addMana', mana: { kind: 'fixed', mana: ['B', 'B'] } },
            { kind: 'draw', player: { kind: 'you' }, count: 1 },
          ],
        },
      },
    ]);
  });

  test('the cost alone: other creatures, with a larger count and another kind of permanent (SYNTHETIC)', () => {
    const cost = (text: string) =>
      readAll(`{T}, ${text}: Draw a card.`, 'creature').abilities[0] as unknown as {
        cost: unknown[];
      };
    expect(cost('Sacrifice three other artifacts').cost[1]).toEqual({
      kind: 'sacrifice',
      what: { types: ['artifact'], other: true },
      count: 3,
    });
    expect(cost('Sacrifice two creatures').cost[1]).toEqual({
      kind: 'sacrifice',
      what: { types: ['creature'] },
      count: 2,
    });
  });

  test('mana added by a later instruction of an ability with a target is not a mana ability (CR 605.1a), the first instruction is the target one (SYNTHETIC)', () => {
    const [ability] = readAll(
      '{T}: Target player loses 2 life. You add {B}{B}.',
      'creature',
    ).abilities;
    expect(ability).toMatchObject({
      kind: 'activated',
      targets: [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
    });
    // Without a target it is still not read: mana with no target is a mana ability, which this shape is not.
    const none = read('{T}: You gain 2 life. You add {B}{B}.', 'creature');
    expect(none.abilities).toEqual([]);
    expect(none.unparsed).toHaveLength(1);
  });

  test('any number of target players with another verb (SYNTHETIC)', () => {
    const [ability] = readAll(
      '{T}: Any number of target players each lose 1 life.',
      'creature',
    ).abilities;
    expect(ability).toMatchObject({
      targets: [{ id: 't1', what: { kind: 'player', filter: 'any' }, anyNumber: true }],
      effect: { kind: 'loseLife', player: { kind: 'target', id: 't1' }, amount: 1 },
    });
  });

  test.each([
    '{T}, Sacrifice one other creature: Any number of target players each lose 2 life.',
    '{T}, Sacrifice two other creatures: Any number of target players each loses 2 life.',
    '{T}, Sacrifice two other creatures: Any number of target players lose 2 life.',
    '{T}, Sacrifice two other creatures: Any number of target opponents each lose 2 life.',
    '{T}, Sacrifice two other creatures: Up to two target players each lose 2 life.',
    '{T}, Sacrifice two other creatures: Any number of target players each sacrifices a creature of their choice.',
    '{T}, Sacrifice two other creatures: You may add {B}{B}.',
    '{T}, Sacrifice two other target creatures: Any number of target players each lose 2 life.',
    '{T}, Sacrifice two other creatures an opponent controls: Any number of target players each lose 2 life.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'creature');
    expect(parsed.abilities, text).toEqual([]);
    expect(parsed.unparsed, text).toHaveLength(1);
  });

  test('the lowering names the engine feature each part needs', () => {
    for (const ref of ['selector:anyNumber', 'cost:sacrifice', 'effect:addMana']) {
      const missing = withoutFeature(ref, LINE, 'creature');
      expect(missing, ref).toMatchObject({ reason: 'notRunnable' });
      expect(missing.needs, ref).toContain(ref);
    }
  });
});

describe('Krav, the Unredeemed: "{B}, Sacrifice X creatures: Target player draws X cards and gains X life. Put X +1/+1 counters on ~." (CR 107.3a, 602.2b, 118.3)', () => {
  const LINE =
    '{B}, Sacrifice X creatures: Target player draws X cards and gains X life. Put X +1/+1 counters on ~.';

  test('the real line: the sacrifice of X creatures, the draw and the life of a target player, the counters on it', () => {
    expect(readAll(LINE, 'creature').abilities).toEqual([
      {
        kind: 'activated',
        cost: [
          { kind: 'mana', symbols: ['B'] },
          { kind: 'sacrifice', what: { types: ['creature'] }, countX: true },
        ],
        targets: [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'draw', player: { kind: 'target', id: 't1' }, count: { kind: 'x' } },
            { kind: 'gainLife', player: { kind: 'target', id: 't1' }, amount: { kind: 'x' } },
            {
              kind: 'addCounters',
              objects: { kind: 'this' },
              counter: '+1/+1',
              count: { kind: 'x' },
            },
          ],
        },
      },
    ]);
  });

  test('another kind of permanent (SYNTHETIC)', () => {
    const [ability] = readAll('{1}, Sacrifice X artifacts: Draw X cards.', 'creature').abilities;
    expect(ability).toMatchObject({
      cost: [
        { kind: 'mana', symbols: ['1'] },
        { kind: 'sacrifice', what: { types: ['artifact'] }, countX: true },
      ],
    });
  });

  test.each([
    '{B}, Sacrifice X: Draw X cards.',
    '{B}, Sacrifice X other creatures: Draw X cards.',
    '{B}, Sacrifice X creatures you control: Draw X cards.',
    '{B}, Sacrifice X creature: Draw X cards.',
    '{B}, Sacrifice X target creatures: Draw X cards.',
    '{B}, Sacrifice X creatures and X artifacts: Draw X cards.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'creature');
    expect(parsed.abilities, text).toEqual([]);
    expect(parsed.unparsed, text).toHaveLength(1);
  });

  test('an X that nothing in the cost announces is not read (a triggered ability has no X)', () => {
    const parsed = read('Whenever ~ attacks, sacrifice X creatures.', 'creature');
    expect(parsed.abilities).toEqual([]);
    expect(parsed.unparsed).toHaveLength(1);
  });

  test('the lowering names the engine feature it needs', () => {
    const missing = withoutFeature('ability:sacrificeX', LINE, 'creature');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('ability:sacrificeX');
  });
});

describe('Partner with (CR 702.124j)', () => {
  test('the real line: the keyword with the name of the card (the reminder text is not part of the line)', () => {
    expect(readAll('Partner with Regna, the Redeemer', 'creature').abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'partnerWith', name: 'Regna, the Redeemer' } },
    ]);
  });

  test('another name (SYNTHETIC)', () => {
    expect(readAll('Partner with Pir, Imaginative Rascal', 'creature').abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'partnerWith', name: 'Pir, Imaginative Rascal' } },
    ]);
  });

  test('plain Partner is still the keyword with no name', () => {
    expect(readAll('Partner', 'creature').abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'partner' } },
    ]);
  });

  test.each([
    'Partner with',
    'Partner with regna',
    'Partner with Regna, the Redeemer.',
    'Partner with Regna, the Redeemer, flying',
    'Partner—Friends forever',
    'Partner with Regna, the Redeemer and Krav, the Unredeemed',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'creature');
    expect(parsed.abilities, text).toEqual([]);
    expect(parsed.unparsed, text).toHaveLength(1);
  });

  test('the lowering names the engine feature it needs', () => {
    const missing = withoutFeature(
      'keyword:partnerWith',
      'Partner with Regna, the Redeemer',
      'creature',
    );
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('keyword:partnerWith');
  });
});

describe('Plumb the Forbidden: "As an additional cost to cast ~, you may sacrifice one or more creatures. When you do, copy ~ for each creature sacrificed this way." (CR 118.8, 601.2b, 603.12, 707.10)', () => {
  const LINE =
    'As an additional cost to cast ~, you may sacrifice one or more creatures. When you do, copy ~ for each creature sacrificed this way.';
  const SPELL = 'You draw a card and lose 1 life.';

  test('the real card: an optional sacrifice of any number of creatures, the spell copied for each, and the spell itself', () => {
    const parsed = readAll(`${LINE}\n${SPELL}`, 'instant');
    expect(parsed.additionalCosts).toEqual([
      { kind: 'sacrifice', what: { types: ['creature'] }, anyNumber: true },
    ]);
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'you', self: true },
        interveningIf: { kind: 'sacrificedAsCost' },
        effect: {
          kind: 'copySpell',
          spell: { kind: 'triggerSubject' },
          newTargets: 'no',
          count: { kind: 'sacrificedAsCost' },
        },
      },
    ]);
    expect(parsed.spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'draw', player: { kind: 'you' }, count: 1 },
        { kind: 'loseLife', player: { kind: 'you' }, amount: 1 },
      ],
    });
  });

  test.each([
    'As an additional cost to cast ~, you may sacrifice one or more creatures.',
    'As an additional cost to cast ~, you may sacrifice one or more artifacts. When you do, copy ~ for each creature sacrificed this way.',
    'As an additional cost to cast ~, you may sacrifice a creature. When you do, copy ~ for each creature sacrificed this way.',
    'As an additional cost to cast ~, sacrifice one or more creatures. When you do, copy ~ for each creature sacrificed this way.',
    'As an additional cost to cast ~, you may sacrifice one or more creatures. When you do, copy ~ for each creature sacrificed this way. You may choose new targets for the copies.',
    'As an additional cost to cast ~, you may sacrifice one or more other creatures. When you do, copy ~ for each creature sacrificed this way.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const first = dropped(text, 'instant');
    expect(first, text).toBeDefined();
  });

  test('the lowering names the engine features it needs', () => {
    for (const ref of [
      'ability:optionalSacrifice',
      'effect:copySpell',
      'condition:sacrificedAsCost',
      'amount:sacrificedAsCost',
    ]) {
      const missing = withoutFeature(ref, `${LINE}\n${SPELL}`, 'instant');
      expect(missing, ref).toMatchObject({ reason: 'notRunnable' });
      expect(missing.needs, ref).toContain(ref);
    }
  });
});
