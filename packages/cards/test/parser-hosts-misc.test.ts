// The Hosts of Mordor deck (issue 150): seven cards, each with its own small primitive. The lines are the real Oracle text of the acceptance cards of the golden
// corpus (names replaced by ~) read through the whole pipeline; the other lines are SYNTHETIC siblings and near misses the grammar must not read.
import { describe, expect, test } from 'vitest';
import { dropped, read, readAll } from './parser-p5-helpers';

describe('"Add two mana in any combination of {U}, {B}, and/or {R}" (Relic of Sauron, CR 106.1b, 605.3b)', () => {
  test('the real line: a mana ability of two mana, each one of the three listed colors', () => {
    const parsed = readAll(
      '{T}: Add two mana in any combination of {U}, {B}, and/or {R}.',
      'artifact',
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'anyCombination', count: 2, colors: ['U', 'B', 'R'] },
      },
    ]);
  });

  test('two colors joined by "or", and a count of three (SYNTHETIC)', () => {
    const parsed = readAll('{T}: Add three mana in any combination of {W} or {G}.', 'artifact');
    expect(parsed.abilities).toEqual([
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'anyCombination', count: 3, colors: ['W', 'G'] },
      },
    ]);
  });

  test('the instruction of a spell chooses each mana among the listed colors only (SYNTHETIC)', () => {
    const parsed = readAll('Add two mana in any combination of {U} and/or {B}.', 'instant');
    const text = JSON.stringify(parsed.spell);
    expect(text).toContain('"chooseOne"');
    expect(text).not.toContain('"W"');
    expect(text).not.toContain('"G"');
  });

  test.each([
    '{T}: Add two mana in any combination of {U}.',
    '{T}: Add two mana in any combination of {U}{B}.',
    '{T}: Add two mana in any combination of {U}, {U}, and/or {R}.',
    '{T}: Add two mana in any combination of {U}, {B}, and/or.',
    '{T}: Add two mana in any combination of {U}, {B}, and/or {R}, then draw a card.',
    '{T}: Add five mana in any combination of {U}, {B}, and/or {R}.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'artifact').reason).toBeDefined();
  });
});

describe('"tap all creatures your opponents control, then put a stun counter on each of those creatures" (Monstrosity of the Lake, CR 608.2c, 122.1d)', () => {
  const EACH_OPPONENT_CREATURE = {
    kind: 'each',
    filter: { zone: 'battlefield', types: ['creature'], controller: 'opponent' },
  };

  test('the real line: after the payment, the same group is tapped and then given the counter', () => {
    const parsed = readAll(
      'When ~ enters, you may pay {5}. If you do, tap all creatures your opponents control, then put a stun counter on each of those creatures.',
      'creature',
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: {
          kind: 'mayPay',
          cost: [{ kind: 'mana', symbols: ['5'] }],
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'tap', objects: EACH_OPPONENT_CREATURE },
              { kind: 'addCounters', objects: EACH_OPPONENT_CREATURE, counter: 'stun', count: 1 },
            ],
          },
        },
      },
    ]);
  });

  test('another counter and another group read the same way (SYNTHETIC)', () => {
    const parsed = readAll(
      'When ~ enters, tap all creatures you control, then put a +1/+1 counter on each of those creatures.',
      'creature',
    );
    const text = JSON.stringify(parsed.abilities);
    expect(text).toContain('"counter":"+1/+1"');
    expect(text.match(/"controller":"you"/g)).toHaveLength(2);
  });

  test.each([
    // No group before it to name, and a group the text never named.
    'When ~ enters, put a stun counter on each of those creatures.',
    'When ~ enters, tap target creature, then put a stun counter on each of those creatures.',
    'When ~ enters, tap all creatures your opponents control, then put a stun counter on each of those cards.',
    'When ~ enters, tap all creatures your opponents control, then put a stun counter on each of these creatures.',
  ])('is not read with nothing to name (SYNTHETIC): %s', (text) => {
    expect(JSON.stringify(read(text, 'creature').abilities)).not.toContain('"counter":"stun"');
  });
});

describe('"it deals 3 damage divided as you choose among one, two, or three targets" (Inferno Titan, CR 601.2d, 603.3d)', () => {
  const SLOT = [{ id: 't1', what: { kind: 'anyTarget' }, min: 1, max: 3, divide: { total: 3 } }];
  const EFFECT = { kind: 'dealDividedDamage', to: { kind: 'target', id: 't1' } };

  test('the real line: an enters trigger and an attacks trigger, each dividing 3 among one to three targets', () => {
    const parsed = readAll(
      'Whenever ~ enters or attacks, it deals 3 damage divided as you choose among one, two, or three targets.',
      'creature',
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        targets: SLOT,
        effect: EFFECT,
      },
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { kind: 'this' } },
        targets: SLOT,
        effect: EFFECT,
      },
    ]);
  });

  test.each([
    'When ~ enters, it deals 3 damage divided as you choose among one, two or three targets.',
    'When ~ enters, it deals 3 damage divided as you choose among one, two, or four targets.',
    'When ~ enters, it deals 3 damage divided as you choose among one, two, or three target creatures.',
    'When ~ enters, it deals 3 damage divided among one, two, or three targets.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'creature').reason).toBeDefined();
  });
});

describe('"When you cycle this card, destroy up to X target artifacts" (Rampaging War Mammoth, CR 702.29a, 603.3d)', () => {
  test('the real line: a slot of up to as many targets as the X of the cycling cost', () => {
    const parsed = readAll(
      'When you cycle this card, destroy up to X target artifacts.',
      'creature',
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'cycled' },
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { zone: 'battlefield', types: ['artifact'] } },
            upToTriggerAmount: true,
          },
        ],
        effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
      },
    ]);
  });

  test.each([
    // Another trigger has no X to read, and an exact X is not "up to".
    'When ~ enters, destroy up to X target artifacts.',
    'When you cycle this card, destroy X target artifacts.',
    // An activated ability announces its own X: not this slot.
    '{X}, {T}: Destroy up to X target artifacts.',
  ])('another wording is not read as the cycling X (SYNTHETIC): %s', (text) => {
    // Dropped as a whole or read some other way, never with the cycling slot.
    expect(JSON.stringify(read(text, 'creature').abilities)).not.toContain('upToTriggerAmount');
  });
});
