// The Final Fantasy X counter deck, group A: what the lowering refuses (a card is supported or not, never half run) and what it writes. The rules' own examples and rejects are run by the
// registry meta tests (`parser-registry.test.ts`); these are the lowering decisions that depend on the text around a phrase.
import { describe, expect, test } from 'vitest';
import { parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

function status(
  typeLine: string,
  text: string,
  extra: { power?: string; toughness?: string } = {},
) {
  const name = 'SYNTHETIC Probe';
  const card = parseOnly(
    syntheticCard({ name, typeLine, oracleText: text.replaceAll('~', name), ...extra }),
  );
  return { status: card.support.status, definition: card.definition, support: card.support };
}

const CREATURE = { power: '2', toughness: '2' };

describe('Support (CR 701.41a)', () => {
  test('a spell supports up to N target creatures, the permanent itself not being left out', () => {
    const probe = status('Sorcery', 'Support 2.');
    expect(probe.status).toBe('supported');
    expect(probe.definition.faces[0]?.spell?.targets).toEqual([
      {
        id: 't1',
        what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
        min: 0,
        max: 2,
      },
    ]);
  });

  test('a permanent supports other target creatures', () => {
    const probe = status('Enchantment', 'When this enchantment enters, support 3.');
    expect(probe.status).toBe('supported');
    expect(probe.definition.faces[0]?.abilities[0]).toMatchObject({
      targets: [{ what: { filter: { other: true } }, min: 0, max: 3 }],
    });
  });

  test('support X is read only in the enters trigger of the permanent itself: not in another trigger', () => {
    expect(status('Artifact', 'Whenever you gain life, support X.', {}).status).toBe('unsupported');
  });

  test('support X needs an {X} in the mana cost of the card (CR 107.3m)', () => {
    const name = 'SYNTHETIC Probe';
    const card = parseOnly(
      syntheticCard({
        name,
        typeLine: 'Artifact',
        manaCost: '{1}{U}',
        oracleText: 'When this artifact enters, support X.',
      }),
    );
    expect(card.support.status).toBe('unsupported');
  });
});

describe('"those counters" and "that number" name the counters of an intervening "if it had counters on it"', () => {
  test('without that "if", "put those counters on" is refused', () => {
    expect(
      status(
        'Enchantment',
        'Whenever a permanent you control leaves the battlefield, put those counters on target permanent you control.',
      ).status,
    ).toBe('unsupported');
  });

  test('"if it had one or more -1/-1 counters on it" names a kind of counter: not the counters of every kind', () => {
    expect(
      status(
        'Enchantment',
        'Whenever a permanent you control leaves the battlefield, if it had a -1/-1 counter on it, put those counters on target permanent you control.',
      ).status,
    ).toBe('unsupported');
  });

  test('"that number" without that "if" is refused', () => {
    expect(
      status(
        'Creature — Cleric',
        'Whenever another permanent you control dies, put that number of +1/+1 counters on target creature.',
        CREATURE,
      ).status,
    ).toBe('unsupported');
  });

  test('"that number" of a trigger about the permanent itself is the counters of a kind it names: not read here', () => {
    expect(
      status(
        'Creature — Cleric',
        'When this creature dies, if it had one or more counters on it, put that number of +1/+1 counters on target creature.',
        CREATURE,
      ).status,
    ).toBe('unsupported');
  });
});

describe('"until end of turn, that creature can\'t be blocked by creatures your opponents control"', () => {
  test("as the effect of a trigger about the creature, it is the engine's cantBeBlockedByPlayer of each opponent", () => {
    const probe = status(
      'Creature — Human',
      'Whenever you put one or more counters on a creature, until end of turn, that creature can’t be blocked by creatures your opponents control.',
      CREATURE,
    );
    expect(probe.status).toBe('supported');
    expect(probe.definition.faces[0]?.abilities[0]).toMatchObject({
      effect: {
        kind: 'cantBeBlockedByPlayer',
        objects: { kind: 'triggerSubject' },
        player: { kind: 'eachOpponent' },
      },
    });
  });

  test('another duration is not read', () => {
    expect(
      status(
        'Creature — Human',
        'Whenever you put one or more counters on a creature, until your next turn, that creature can’t be blocked by creatures your opponents control.',
        CREATURE,
      ).status,
    ).toBe('unsupported');
  });
});

describe('"you may [A] and [B]" (CR 608.2d): one question for the whole instruction', () => {
  test('is the ability optional as a whole', () => {
    const probe = status(
      'Creature — Human',
      'Whenever ~ deals combat damage to a player, you may draw a card and proliferate.',
      CREATURE,
    );
    expect(probe.status).toBe('supported');
    expect(probe.definition.faces[0]?.abilities[0]).toMatchObject({
      optional: true,
      effect: { kind: 'sequence', effects: [{ kind: 'draw' }, { kind: 'proliferate' }] },
    });
  });

  test('two sentences each with a "you may" are two questions: not read as one', () => {
    expect(
      status(
        'Creature — Human',
        'Whenever ~ deals combat damage to a player, you may draw a card. You may proliferate.',
        CREATURE,
      ).status,
    ).toBe('unsupported');
  });
});

describe('Together Forever: "Choose target creature ... When that creature dies this turn, return that card to its owner\'s hand."', () => {
  test('is one instruction of two sentences, with a target', () => {
    const probe = status(
      'Enchantment',
      "{1}: Choose target creature with a counter on it. When that creature dies this turn, return that card to its owner's hand.",
    );
    expect(probe.status).toBe('supported');
  });

  test('another consequence than the return is not read', () => {
    expect(
      status(
        'Enchantment',
        '{1}: Choose target creature with a counter on it. When that creature dies this turn, you gain 2 life.',
      ).status,
    ).toBe('unsupported');
  });
});
