// Party Time deck (issue 170), combat triggers and miscellaneous effects: the real Oracle lines of Calculating Lich, Felisa, Frontline Medic, Jazal Goldmane, Unbreakable Formation
// and Order of Whiteclay read through the whole pipeline, the nodes they lower to and the near misses. The engine runs what is lowered in packages/engine/test/
// (scenario-xx-attacks-opponent, -dies-counters-tokens, -battalion, -counter-x-spell, -attackers-pump, -addendum-those-creatures, -untap-symbol-cost).
import { describe, expect, test } from 'vitest';
import { dropped, read, readAll } from './parser-p5-helpers';

const creature = (text: string, subtypes: readonly string[] = []) =>
  readAll(text, 'creature', subtypes).abilities;

describe('Calculating Lich: "Whenever a creature attacks one of your opponents, that player loses 1 life."', () => {
  test('"that player" is the opponent attacked, not the attacking player', () => {
    expect(
      creature('Whenever a creature attacks one of your opponents, that player loses 1 life.'),
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { types: ['creature'] }, at: 'opponent' },
        effect: { kind: 'loseLife', player: { kind: 'triggerAttackedPlayer' }, amount: 1 },
      },
    ]);
  });

  test.each([
    'Whenever a creature attacks one of your opponent, that player loses 1 life.',
    'Whenever a creature attacks one of their opponents, that player loses 1 life.',
  ])('is dropped, never half read: %s', (text) => {
    expect(dropped(text, 'creature').text).toBe(text);
  });
});

describe('Felisa, Fang of Silverquill: "create X tapped ... Inkling creature tokens ..., where X is the number of counters it had on it"', () => {
  test('X is the counters of the creature that died, of every kind', () => {
    expect(
      creature(
        'Whenever a nontoken creature you control dies, if it had counters on it, create X tapped 2/1 white and black Inkling creature tokens with flying, where X is the number of counters it had on it.',
        ['Vampire'],
      ),
    ).toMatchObject([
      {
        kind: 'triggered',
        trigger: {
          kind: 'dies',
          what: { types: ['creature'], token: false, controller: 'you', hasCounter: true },
        },
        effect: {
          kind: 'createToken',
          count: { kind: 'countersOn', of: { kind: 'triggerSubject' } },
          tapped: true,
        },
      },
    ]);
  });
});

describe('Frontline Medic', () => {
  test('"counter target spell with {X} in its mana cost unless its controller pays {3}"', () => {
    expect(
      creature(
        'Sacrifice ~: Counter target spell with {X} in its mana cost unless its controller pays {3}.',
      ),
    ).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'sacrifice', what: { kind: 'this' } }],
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'stack', stackKind: 'spell', xInManaCost: true },
            },
          },
        ],
        effect: {
          kind: 'counterUnlessPays',
          objects: { kind: 'target', id: 't1' },
          cost: [{ kind: 'mana', symbols: ['3'] }],
        },
      },
    ]);
  });

  test.each([
    'Whenever ~ and at least two other creatures attack alone, you gain 1 life.',
    'Whenever ~ and two other creatures attack, you gain 1 life.',
  ])('is dropped, never half read: %s', (text) => {
    expect(dropped(text, 'creature').text).toBe(text);
  });
});

describe('Jazal Goldmane: "+X/+X, where X is the number of attacking creatures"', () => {
  test('the count is every attacking creature, whoever controls it', () => {
    const attacking = { kind: 'countOf', filter: { types: ['creature'], attacking: true } };
    expect(
      creature(
        '{3}{W}{W}: Attacking creatures you control get +X/+X until end of turn, where X is the number of attacking creatures.',
      ),
    ).toMatchObject([
      {
        kind: 'activated',
        effect: {
          kind: 'modifyPt',
          objects: {
            kind: 'each',
            filter: { types: ['creature'], controller: 'you', attacking: true },
          },
          power: attacking,
          toughness: attacking,
          duration: 'untilEndOfTurn',
        },
      },
    ]);
  });
});

describe('Unbreakable Formation: Addendum with "each of those creatures"', () => {
  test('the counters and vigilance are for the creatures the first sentence affected, only when cast in a main phase', () => {
    const mine = {
      kind: 'each',
      filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
    };
    const parsed = readAll(
      'Creatures you control gain indestructible until end of turn.\nAddendum — If you cast this spell during your main phase, put a +1/+1 counter on each of those creatures and they gain vigilance until end of turn.',
      'instant',
    );
    expect(parsed.spell?.effect).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'grantKeyword', objects: mine, keyword: { kind: 'indestructible' } },
        {
          kind: 'conditional',
          condition: { kind: 'castInOwnMainPhase' },
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'addCounters', objects: mine, counter: '+1/+1', count: 1 },
              { kind: 'grantKeyword', objects: mine, keyword: { kind: 'vigilance' } },
            ],
          },
        },
      ],
    });
  });

  test('"those creatures" with no group before it is an unbound reference, not guessed', () => {
    const parsed = read('Put a +1/+1 counter on each of those creatures.', 'instant');
    expect(parsed.unparsed).toHaveLength(1);
  });
});

describe('Order of Whiteclay: "{1}{W}{W}, {Q}: Return target creature card with mana value 3 or less ..."', () => {
  test('{Q} is the untap cost of the permanent itself', () => {
    expect(
      creature(
        '{1}{W}{W}, {Q}: Return target creature card with mana value 3 or less from your graveyard to the battlefield.',
      ),
    ).toMatchObject([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['1', 'W', 'W'] }, { kind: 'untap' }],
        effect: { kind: 'moveToZone', to: 'battlefield', controller: 'you' },
      },
    ]);
  });
});
