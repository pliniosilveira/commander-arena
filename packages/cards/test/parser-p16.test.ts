// Stage P16 (M6): X (D-103, D-107). The engine now announces X for a spell with an {X} in its mana
// cost or "pay X life" among its additional costs, and for an activated ability with either in its
// cost, and reads it as `Amount` `{ kind: 'x' }`. Each line is read through the whole pipeline and
// compared with the engine AST it must produce; each near miss says where it stops or why it is
// dropped. The lines of reports/template-replay.md (the owner's run) are the real ones: "~ enters with
// X +1/+1 counters on it.", "~ enters with X charge counters on it.", "As an additional cost to cast ~,
// pay X life." and "{X}{X}, {T}, Sacrifice ~: Create X Treasure tokens."; every other line is
// SYNTHETIC (the wordings D-103 lists), and no real card is marked supported here. That the engine
// runs what is lowered is in convert-grammar-engine-p16.test.ts; that a missing engine feature is
// named, not guessed at, is in parser-p16-needs.test.ts.
import type { Ability, Cost, Effect, TargetSpec } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { dropped, type FaceType, readAll } from './parser-p5-helpers';

const X = { kind: 'x' } as const;
const T1 = { kind: 'target', id: 't1' } as const;

const abilities = (text: string, type: FaceType = 'creature'): readonly Ability[] =>
  readAll(text, type).abilities;

const spell = (text: string) => {
  const parsed = readAll(text, 'sorcery').spell;
  if (parsed === undefined || parsed === null) throw new Error(`"${text}" has no spell text`);
  return parsed;
};

const effectOf = (text: string): Effect | undefined => spell(text).effect;

const creatureTarget: TargetSpec = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
};

describe('X as the amount of an effect in a spell (CR 107.3a, 608.2)', () => {
  test('"Return up to X target creatures" keeps the optional X-sized target slot', () => {
    expect(spell('Return up to X target creatures to their owners’ hands.')).toEqual({
      targets: [{ ...creatureTarget, countX: true, min: 0 }],
      effect: { kind: 'moveToZone', objects: T1, to: 'hand' },
      x: true,
    });
  });

  test.each([
    ['Draw X cards.', { kind: 'draw', player: { kind: 'you' }, count: X }],
    ['You draw X cards.', { kind: 'draw', player: { kind: 'you' }, count: X }],
    ['Each player draws X cards.', { kind: 'draw', player: { kind: 'eachPlayer' }, count: X }],
    ['You gain X life.', { kind: 'gainLife', player: { kind: 'you' }, amount: X }],
    [
      'Each opponent loses X life.',
      { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount: X },
    ],
    ['Scry X.', { kind: 'scry', count: X }],
    ['Surveil X.', { kind: 'surveil', count: X }],
    [
      'Create X Treasure tokens.',
      { kind: 'createToken', token: { kind: 'preset', preset: 'Treasure' }, count: X },
    ],
  ] as const)('%s', (text, effect) => {
    const parsed = spell(text);
    expect(parsed.effect).toEqual(effect);
    expect(parsed.x).toBe(true);
  });

  test('"~ deals X damage to any target" and its variants (the damage rules read X since D-103)', () => {
    expect(spell('~ deals X damage to any target.')).toEqual({
      targets: [{ id: 't1', what: { kind: 'anyTarget' } }],
      effect: { kind: 'dealDamage', amount: X, to: T1 },
      x: true,
    });
    expect(spell('~ deals X damage to target creature.')).toEqual({
      targets: [creatureTarget],
      effect: { kind: 'dealDamage', amount: X, to: T1 },
      x: true,
    });
    expect(effectOf('~ deals X damage to each opponent.')).toEqual({
      kind: 'dealDamage',
      amount: X,
      to: { kind: 'eachOpponent' },
    });
  });

  test('"Target player draws X cards", "target player loses X life"', () => {
    const draws = spell('Target player draws X cards.');
    expect(draws.effect).toEqual({ kind: 'draw', player: T1, count: X });
    expect(draws.targets).toEqual([{ id: 't1', what: { kind: 'player', filter: 'any' } }]);
    expect(effectOf('Target player loses X life.')).toEqual({
      kind: 'loseLife',
      player: T1,
      amount: X,
    });
    expect(effectOf('Target player discards X cards.')).toEqual({
      kind: 'discard',
      player: T1,
      count: X,
    });
  });

  test('"Put X +1/+1 counters on target creature" and on each creature you control', () => {
    expect(spell('Put X +1/+1 counters on target creature.')).toEqual({
      targets: [creatureTarget],
      effect: { kind: 'addCounters', objects: T1, counter: '+1/+1', count: X },
      x: true,
    });
    expect(effectOf('Put X +1/+1 counters on each creature you control.')).toEqual({
      kind: 'addCounters',
      objects: {
        kind: 'each',
        filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
      },
      counter: '+1/+1',
      count: X,
    });
  });

  test('X tokens of a made-up kind: the definition carries the printed values', () => {
    const effect = effectOf('Create X 1/1 white Soldier creature tokens.');
    expect(effect).toMatchObject({
      kind: 'createToken',
      count: X,
      token: {
        kind: 'custom',
        definition: {
          name: 'Soldier',
          types: ['creature'],
          subtypes: ['Soldier'],
          colors: ['W'],
          power: 1,
          toughness: 1,
        },
      },
    });
  });

  test('"Its controller creates X Treasure tokens" after a destroy keeps the controller', () => {
    expect(effectOf('Destroy target creature. Its controller creates X Treasure tokens.')).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'destroy', objects: T1 },
        {
          kind: 'createToken',
          token: { kind: 'preset', preset: 'Treasure' },
          count: X,
          controller: { kind: 'controllerOf', of: T1 },
        },
      ],
    });
  });

  test('two effects that read X share the one announced value', () => {
    expect(effectOf('Draw X cards and gain X life.')).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'draw', player: { kind: 'you' }, count: X },
        { kind: 'gainLife', player: { kind: 'you' }, amount: X },
      ],
    });
  });

  test('a spell that reads no X does not say so', () => {
    expect(spell('Draw two cards.').x).toBeUndefined();
  });
});

describe('"~ enters with X +1/+1 counters on it." (CR 107.3m, 614.1c, 122.6)', () => {
  test.each([
    ['~ enters with X +1/+1 counters on it.', '+1/+1'],
    ['~ enters the battlefield with X +1/+1 counters on it.', '+1/+1'],
    ['~ enters with X charge counters on it.', 'charge'],
    ['~ enters with X -1/-1 counters on it.', '-1/-1'],
  ])('%s', (text, counter) => {
    expect(abilities(text)).toEqual([
      { kind: 'replacement', replacement: { kind: 'entersWithCounters', counter, count: X } },
    ]);
  });

  test('a number is still a number', () => {
    expect(abilities('~ enters with two +1/+1 counters on it.')).toEqual([
      {
        kind: 'replacement',
        replacement: { kind: 'entersWithCounters', counter: '+1/+1', count: 2 },
      },
    ]);
  });

  test.each([
    ['~ enters with Y +1/+1 counters on it.', 'Y +1/+1 counters on it.'],
    ['~ enters with up to X +1/+1 counters on it.', 'up to X +1/+1 counters on it.'],
    ['~ enters with X counters on it.', 'on it.'],
  ])('%s stops at "%s"', (text, stoppedAt) => {
    expect(dropped(text)).toMatchObject({ reason: 'unrecognised', stoppedAt });
  });

  test('"If ~ was kicked, it enters with X counters" is not read: the replacement has no condition', () => {
    expect(dropped('If ~ was kicked, it enters with X +1/+1 counters on it.')).toMatchObject({
      reason: 'unrecognised',
      stoppedAt: 'X +1/+1 counters on it.',
    });
  });
});

describe('"As an additional cost to cast ~, pay X life." (CR 118.8, 107.3a)', () => {
  test.each([
    'As an additional cost to cast ~, pay X life.',
    'As an additional cost to cast this spell, pay X life.',
  ])('%s', (text) => {
    const parsed = readAll(`${text}\nDraw X cards.`, 'sorcery');
    expect(parsed.additionalCosts).toEqual([{ kind: 'payXLife' }]);
    expect(parsed.spell).toEqual({
      effect: { kind: 'draw', player: { kind: 'you' }, count: X },
      x: true,
    });
  });

  test('costs listed in the text order, and "and" joins them', () => {
    const joined = readAll(
      'As an additional cost to cast ~, pay X life and discard a card.\n~ deals X damage to any target.',
      'sorcery',
    );
    expect(joined.additionalCosts).toEqual<Cost[]>([
      { kind: 'payXLife' },
      { kind: 'discard', count: 1 },
    ]);
    const lines = readAll(
      'As an additional cost to cast ~, discard a card.\nAs an additional cost to cast ~, pay X life.\nDraw X cards.',
      'sorcery',
    );
    expect(lines.additionalCosts).toEqual<Cost[]>([
      { kind: 'discard', count: 1 },
      { kind: 'payXLife' },
    ]);
  });

  test('two "pay X life" are not read (the engine allows one)', () => {
    expect(
      dropped('As an additional cost to cast ~, pay X life and pay X life.', 'sorcery'),
    ).toMatchObject({ reason: 'notRunnable', closestRule: 'static.additional-cost' });
  });

  test.each([
    ['As an additional cost to cast ~, pay Y life.', 'Y life.'],
    ['As an additional cost to cast ~, pay {X}.', '{X}.'],
    [
      'As an additional cost to cast ~, pay half your life, rounded up.',
      'half your life, rounded up.',
    ],
  ])('%s stops at "%s"', (text, stoppedAt) => {
    expect(dropped(text, 'sorcery')).toMatchObject({ reason: 'unrecognised', stoppedAt });
  });
});

describe('X in the cost of an activated ability (CR 602.2b, 107.3a, 107.3k)', () => {
  test('"{X}, {T}: ~ deals X damage to target creature."', () => {
    expect(abilities('{X}, {T}: ~ deals X damage to target creature.', 'artifact')).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['X'] }, { kind: 'tap' }],
        targets: [creatureTarget],
        effect: { kind: 'dealDamage', amount: X, to: T1 },
      },
    ]);
  });

  test('two {X} keep both symbols; the symbols stay in the order of the text', () => {
    expect(abilities('{X}{X}, {T}: Draw X cards.', 'artifact')).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['X', 'X'] }, { kind: 'tap' }],
        effect: { kind: 'draw', player: { kind: 'you' }, count: X },
      },
    ]);
    expect(abilities('{1}{X}, {T}: You gain X life.', 'artifact')).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['1', 'X'] }, { kind: 'tap' }],
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: X },
      },
    ]);
  });

  test('the replay line "{X}{X}, {T}, Sacrifice ~: Create X Treasure tokens."', () => {
    expect(abilities('{X}{X}, {T}, Sacrifice ~: Create X Treasure tokens.', 'artifact')).toEqual([
      {
        kind: 'activated',
        cost: [
          { kind: 'mana', symbols: ['X', 'X'] },
          { kind: 'tap' },
          { kind: 'sacrifice', what: { kind: 'this' } },
        ],
        effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Treasure' }, count: X },
      },
    ]);
  });

  test('"Pay X life: ..." is the engine\'s payXLife', () => {
    expect(abilities('Pay X life: ~ deals X damage to any target.')).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'payXLife' }],
        targets: [{ id: 't1', what: { kind: 'anyTarget' } }],
        effect: { kind: 'dealDamage', amount: X, to: T1 },
      },
    ]);
  });

  test('X counters on the permanent itself, with a restriction after the effect', () => {
    expect(abilities('{X}{G}: Put X +1/+1 counters on ~.')).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['X', 'G'] }],
        effect: { kind: 'addCounters', objects: { kind: 'this' }, counter: '+1/+1', count: X },
      },
    ]);
    expect(abilities('{X}, {T}: Draw X cards. Activate only as a sorcery.', 'artifact')).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['X'] }, { kind: 'tap' }],
        effect: { kind: 'draw', player: { kind: 'you' }, count: X },
        timing: 'sorcery',
      },
    ]);
  });

  test('an {X} cost with an effect that does not read X is read as it says', () => {
    expect(abilities('{X}, {T}: Create a Treasure token.', 'artifact')).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['X'] }, { kind: 'tap' }],
        effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Treasure' }, count: 1 },
      },
    ]);
  });
});

describe('what stays unread: X where the engine has no X (CR 107.3, 107.3j)', () => {
  test.each([
    ['{T}: Draw X cards.', 'creature', 'ability.activated'],
    ['{1}, {T}: ~ deals X damage to any target.', 'creature', 'ability.activated'],
    ['When ~ enters, draw X cards.', 'creature', 'ability.triggered'],
    ['Whenever ~ attacks, ~ deals X damage to any target.', 'creature', 'ability.triggered'],
    ['{X}, {T}: Add {G}{G}.', 'artifact', 'cost.mana-x'],
    ['{T}: Add {G}. ~ deals X damage to you.', 'artifact', 'ability.activated'],
  ] as const)('%s is read and refused, nothing is built', (text, type, closestRule) => {
    expect(dropped(text, type)).toMatchObject({ reason: 'notRunnable', closestRule });
  });

  test.each([
    ['Flashback {X}{R}', 'sorcery', '{X}{R}', 'keyword.flashback'],
    ['Kicker {X}', 'sorcery', '{X}', 'keyword.kicker'],
    ['Cycling {X}', 'creature', '{X}', 'keyword.cycling'],
    ['Equip {X}', 'artifact', '{X}', 'keyword.equip'],
    ['Ward {X}', 'creature', '{X}', 'keyword.ward'],
    ['Cycling—Pay X life.', 'creature', 'X life.', 'cost.pay-life'],
    ['Equip—Pay X life.', 'artifact', 'X life.', 'cost.pay-life'],
    ['Ward—Pay X life.', 'creature', 'X life.', 'cost.pay-life'],
  ] as const)(
    '%s: a keyword cost has no X the engine runs',
    (text, type, stoppedAt, closestRule) => {
      expect(dropped(text, type)).toMatchObject({ reason: 'unrecognised', stoppedAt, closestRule });
    },
  );

  // Stage P28 (D-131): "where X is ..." defines X, so the spell and the ability whose cost has no X are read ("Draw X
  // cards, where X is the number of lands you control."); an {X} cost that the text also defines is refused.
  test('an {X} in the cost that the text also defines is read and refused (CR 107.3)', () => {
    expect(
      dropped('{X}, {T}: Draw X cards, where X is the number of lands you control.', 'artifact'),
    ).toMatchObject({ reason: 'notRunnable', closestRule: 'ability.activated' });
  });

  test.each([
    ['Draw Y cards.', 'sorcery'],
    ['Target creature gets +Y/+Y until end of turn.', 'sorcery'],
    ['Creatures you control get +X/+X.', 'enchantment'],
  ] as const)('%s', (text, type) => {
    expect(dropped(text, type)).toMatchObject({ reason: 'unrecognised' });
  });

  test('"X can\'t be 0." is a line of its own that no rule reads: the card stays unsupported', () => {
    const parsed = readAll('Draw X cards.', 'sorcery');
    expect(parsed.unparsed).toEqual([]);
    expect(dropped('X can’t be 0.', 'sorcery')).toMatchObject({
      reason: 'unrecognised',
      closestRule: 'none',
    });
  });
});
