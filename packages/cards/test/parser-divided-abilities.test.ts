// Divided damage of abilities, "one or two targets", "that spell's mana value" as the limit of a target filter, "that spell's power is N or greater" and "~ has a +1/+1
// counter on it" (CR 601.2d, 602.2b, 603.3d, 202.3, 208.1, 602.5b): what the grammar reads and what it leaves unread. The cards are SYNTHETIC (the real ones are in
// convert-grammar-engine-divided-damage.test.ts).
import { describe, expect, test } from 'vitest';
import { parsed, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const CREATURE = 'Legendary Creature — Dragon';

/** The status of a creature card with this text, written with `~` for its own name. */
function statusOf(text: string, typeLine = CREATURE) {
  const imported = parseOnly(
    syntheticCard({
      name: 'Zed',
      manaCost: '{3}{R}',
      typeLine,
      oracleText: text.replaceAll('~', 'Zed'),
      power: '3',
      toughness: '3',
    }),
  );
  return imported.support.status;
}

describe('damage divided among targets in an ability', () => {
  test('an enters trigger divides among any number of creatures and/or planeswalkers', () => {
    const def = parsed(
      'Zed',
      CREATURE,
      'When ~ enters, it deals 5 damage divided as you choose among any number of target creatures and/or planeswalkers your opponents control.',
      { power: '3', toughness: '3' },
    );
    const ability = def.faces[0]?.abilities[0];
    expect(ability?.kind).toBe('triggered');
    if (ability?.kind !== 'triggered') return;
    expect(ability.targets?.[0]).toEqual({
      id: 't1',
      what: {
        kind: 'object',
        filter: {
          anyOf: [{ types: ['creature'] }, { types: ['planeswalker'] }],
          controller: 'opponent',
          zone: 'battlefield',
        },
      },
      divide: { total: 5 },
    });
  });

  test('an activated ability divides among one or two targets', () => {
    const def = parsed(
      'Zed',
      CREATURE,
      '{2}{R}: ~ deals 3 damage divided as you choose among one or two targets.',
      {
        power: '3',
        toughness: '3',
      },
    );
    const ability = def.faces[0]?.abilities[0];
    expect(ability?.kind).toBe('activated');
    if (ability?.kind !== 'activated') return;
    expect(ability.targets).toEqual([
      { id: 't1', what: { kind: 'anyTarget' }, min: 1, max: 2, divide: { total: 3 } },
    ]);
  });

  test('"~" may deal it in a trigger, and a spell still divides as before', () => {
    expect(
      statusOf(
        'When ~ enters, ~ deals 4 damage divided as you choose among any number of target creatures.',
      ),
    ).toBe('supported');
    expect(
      statusOf('~ deals 4 damage divided as you choose among one or two targets.', 'Instant'),
    ).toBe('supported');
  });

  test('"it" that is another permanent deals the damage of nothing the engine can name: unread', () => {
    expect(
      statusOf(
        'Whenever another creature enters under your control, it deals 4 damage divided as you choose among one or two targets.',
      ),
    ).toBe('unsupported');
  });

  test('an announced X is not a total read as the ability goes on the stack: unread', () => {
    expect(
      statusOf('{X}{R}: ~ deals X damage divided as you choose among one or two targets.'),
    ).toBe('unsupported');
  });

  test('the number of targets must be said: "one target", "two targets" and a bare "targets" are unread', () => {
    expect(statusOf('{2}{R}: ~ deals 3 damage divided as you choose among one target.')).toBe(
      'unsupported',
    );
    expect(statusOf('{2}{R}: ~ deals 3 damage divided as you choose among two targets.')).toBe(
      'unsupported',
    );
    expect(statusOf('{2}{R}: ~ deals 3 damage divided as you choose among targets.')).toBe(
      'unsupported',
    );
  });
});

describe('"Activate only if ~ has a +1/+1 counter on it."', () => {
  test("is the engine's test of the source", () => {
    const def = parsed(
      'Zed',
      CREATURE,
      '{3}{R}: ~ deals 2 damage divided as you choose among one or two targets. Activate only if ~ has a +1/+1 counter on it.',
      { power: '3', toughness: '3' },
    );
    const ability = def.faces[0]?.abilities[0];
    if (ability?.kind !== 'activated') throw new Error('no ability');
    expect(ability.activateOnlyIf).toEqual({
      kind: 'thisMatches',
      filter: { hasCounter: '+1/+1' },
    });
  });

  test('any counter, a named kind, and nothing else', () => {
    const ability = (counter: string) =>
      `{2}: Draw a card. Activate only if ~ has ${counter} on it.`;
    expect(statusOf(ability('a +1/+1 counter'))).toBe('supported');
    expect(statusOf(ability('a stun counter'))).toBe('supported');
    expect(statusOf(ability('a counter'))).toBe('supported');
    expect(statusOf(ability('no counters'))).toBe('unsupported');
    expect(statusOf(ability('two +1/+1 counters'))).toBe('unsupported');
  });
});

describe('a cast trigger that reads the spell that caused it', () => {
  test('"mana value less than or equal to that spell\'s mana value" limits the targets', () => {
    expect(
      statusOf(
        "Whenever you cast a spell, return up to one target nonland permanent an opponent controls with mana value less than or equal to that spell's mana value to its owner's hand.",
      ),
    ).toBe('supported');
    expect(
      statusOf(
        "Whenever an opponent casts a spell, return up to one target nonland permanent you control with mana value less than or equal to that spell's mana value to its owner's hand.",
      ),
    ).toBe('supported');
  });

  test('without a cast trigger there is no spell: unread', () => {
    expect(
      statusOf(
        "When ~ enters, return up to one target nonland permanent an opponent controls with mana value less than or equal to that spell's mana value to its owner's hand.",
      ),
    ).toBe('unsupported');
    expect(
      statusOf(
        "Whenever ~ attacks, return up to one target nonland permanent an opponent controls with mana value less than or equal to that spell's mana value to its owner's hand.",
      ),
    ).toBe('unsupported');
  });

  test('"that spell\'s power is N or greater" follows the instruction it is about', () => {
    const def = parsed(
      'Zed',
      CREATURE,
      "Whenever you cast a creature spell, put a +1/+1 counter on ~. If that spell's power is 4 or greater, draw a card.",
      { power: '2', toughness: '2' },
    );
    const ability = def.faces[0]?.abilities[0];
    if (ability?.kind !== 'triggered') throw new Error('no trigger');
    expect(JSON.stringify(ability.effect)).toContain(
      '"condition":{"kind":"objectMatches","of":{"kind":"triggerSubject"},"filter":{"power":{"cmp":"atLeast","value":4}}}',
    );
  });

  test('outside a cast trigger it names no spell: unread', () => {
    expect(
      statusOf(
        "Whenever ~ attacks, draw a card. If that spell's power is 4 or greater, draw a card.",
      ),
    ).toBe('unsupported');
  });

  test('as the intervening "if" of the trigger it is read when the ability triggers, which the engine does not do: unread', () => {
    expect(
      statusOf(
        "Whenever you cast a creature spell, if that spell's power is 4 or greater, draw a card.",
      ),
    ).toBe('unsupported');
  });
});
