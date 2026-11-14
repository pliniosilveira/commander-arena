// Stage P39 (M54): the Korvold deck's mana-spent slice, read by the grammar (D-184; the engine's `manaSpent` amount, a count of the mana spent to cast a spell,
// D-183, ENGINE_VERSION 40). The lines of `REAL` are the real Oracle text of the two cards of the slice (the owner's request file of 2026-10-29), names replaced
// by ~, each with the nodes the grammar produces for it; the other tests read lines that say the same things over other numbers, types and names, and the
// lines a rule must not read (flagged, never half run). Every sibling and refused line is SYNTHETIC. The engine runs what is lowered in
// convert-grammar-engine-p39.test.ts; a missing engine feature is named in parser-p39-needs.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const KOBOLD = {
  kind: 'custom',
  definition: {
    name: 'Kobolds of Kher Keep',
    manaCost: null,
    supertypes: [],
    types: ['creature'],
    subtypes: ['Kobold'],
    colors: ['R'],
    power: 0,
    toughness: 1,
    loyalty: null,
    defense: null,
    oracleText: '',
    abilities: [],
  },
};

const CAST_SELF = { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'you', self: true };

describe('the two real cards of the slice read as the engine runs them (D-183, D-184)', () => {
  test('Prossh: the spell is the source of its own cast trigger and X is the mana spent', () => {
    const parsed = readAll(
      'When you cast this spell, create X 0/1 red Kobold creature tokens named Kobolds of Kher Keep, where X is the amount of mana spent to cast it.\nFlying\nSacrifice another creature: ~ gets +1/+0 until end of turn.',
      'creature',
      ['Dragon'],
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: CAST_SELF,
        effect: { kind: 'createToken', token: KOBOLD, count: { kind: 'manaSpent' } },
      },
      { kind: 'keyword', keyword: { kind: 'flying' } },
      {
        kind: 'activated',
        cost: [{ kind: 'sacrifice', what: { types: ['creature'], other: true } }],
        effect: {
          kind: 'modifyPt',
          objects: { kind: 'this' },
          power: 1,
          toughness: 0,
          duration: 'untilEndOfTurn',
        },
      },
    ]);
  });

  test('Coin of Mastery: each creature you control enters with a counter for each mana from an artifact source', () => {
    const parsed = readAll(
      'Each creature you control enters with an additional +1/+1 counter on it for each mana from an artifact source spent to cast it.\n{T}: Create a Treasure token.',
      'artifact',
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'replacement',
        replacement: {
          kind: 'othersEnterWithCounters',
          what: { types: ['creature'], controller: 'you' },
          counter: '+1/+1',
          count: { kind: 'manaSpent', fromType: 'artifact' },
        },
      },
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Treasure' }, count: 1 },
      },
    ]);
  });
});

describe('"When you cast this spell" (CR 601.2i, 603.2)', () => {
  test('the spell is the source: the engine reads `castSpell` with `self`, for the controller', () => {
    const [ability] = readAll('When you cast this spell, you gain 2 life.', 'creature').abilities;
    expect(ability).toEqual({
      kind: 'triggered',
      trigger: CAST_SELF,
      effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 2 },
    });
  });

  test('"~" is the card itself, as the text of the real card says it after normalization', () => {
    const [ability] = readAll('When you cast ~, you gain 2 life.', 'creature').abilities;
    expect(ability).toMatchObject({ kind: 'triggered', trigger: CAST_SELF });
  });

  test('a description of a spell is another trigger: "you cast a creature spell" is not the spell itself', () => {
    const [ability] = readAll(
      'Whenever you cast a creature spell, you gain 2 life.',
      'creature',
    ).abilities;
    expect(ability).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'castSpell', by: 'you', filter: { types: ['creature'] } },
    });
    expect(ability).not.toMatchObject({ trigger: { self: true } });
  });

  test('another amount of the same ability still reads: "X" is the mana spent, for any effect that takes an amount', () => {
    const [ability] = readAll(
      'When you cast this spell, you gain X life, where X is the amount of mana spent to cast it.',
      'creature',
    ).abilities;
    expect(ability).toMatchObject({
      kind: 'triggered',
      trigger: CAST_SELF,
      effect: { kind: 'gainLife', amount: { kind: 'manaSpent' } },
    });
  });

  test('an ability that is not "When you cast this spell" does not read the amount of mana spent', () => {
    const upkeep = dropped(
      'At the beginning of your upkeep, you gain X life, where X is the amount of mana spent to cast it.',
      'creature',
    );
    expect(upkeep.reason).toBe('notRunnable');
    const whenever = dropped(
      'Whenever you cast a spell, you gain X life, where X is the amount of mana spent to cast it.',
      'creature',
    );
    expect(whenever.reason).toBe('notRunnable');
  });

  test("a spell's own effect does not read it either (the engine reads it in the cast trigger only)", () => {
    const drawn = dropped(
      'Draw X cards, where X is the amount of mana spent to cast it.',
      'sorcery',
    );
    expect(drawn.reason).toBe('notRunnable');
  });
});

describe('a token with a name of its own (CR 111.4)', () => {
  const token = (name: string) => ({
    kind: 'custom',
    definition: { ...KOBOLD.definition, name },
  });

  test('"named Kobolds of Kher Keep": the name, with the creature types unchanged', () => {
    const [ability] = readAll(
      'When you cast this spell, create two 0/1 red Kobold creature tokens named Kobolds of Kher Keep.',
      'creature',
    ).abilities;
    expect(ability).toMatchObject({
      effect: { kind: 'createToken', token: token('Kobolds of Kher Keep'), count: 2 },
    });
  });

  test('a one-word name, and a name before "with"', () => {
    const [one] = readAll(
      'When ~ enters, create a 0/1 red Kobold creature token named Hero.',
      'creature',
    ).abilities;
    expect(one).toMatchObject({ effect: { token: token('Hero') } });
    const [withFlying] = readAll(
      'When ~ enters, create a 0/1 red Kobold creature token named Hero with flying.',
      'creature',
    ).abilities;
    expect(withFlying).toMatchObject({
      effect: {
        token: {
          definition: {
            name: 'Hero',
            abilities: [{ kind: 'keyword', keyword: { kind: 'flying' } }],
          },
        },
      },
    });
  });

  test('a token with no name is named by its creature types, as it was', () => {
    const [ability] = readAll(
      'When ~ enters, create a 0/1 red Kobold creature token.',
      'creature',
    ).abilities;
    expect(ability).toMatchObject({ effect: { token: { definition: { name: 'Kobold' } } } });
  });

  test('a name in lower case, or none after "named", is not read', () => {
    expect(
      dropped('When ~ enters, create a 0/1 red Kobold creature token named hero.', 'creature')
        .reason,
    ).toBe('unrecognised');
    expect(
      dropped('When ~ enters, create a 0/1 red Kobold creature token named.', 'creature').reason,
    ).toBe('unrecognised');
  });
});

describe('"for each mana spent to cast it" (CR 601.2h)', () => {
  const entersWith = (tail: string) =>
    readAll(
      `Each creature you control enters with an additional +1/+1 counter on it ${tail}.`,
      'artifact',
    ).abilities[0];

  test('all of the mana, or the mana of a source with a card type', () => {
    expect(entersWith('for each mana spent to cast it')).toMatchObject({
      replacement: { count: { kind: 'manaSpent' } },
    });
    expect(entersWith('for each mana from a creature source spent to cast it')).toMatchObject({
      replacement: { count: { kind: 'manaSpent', fromType: 'creature' } },
    });
  });

  test('one counter for each: "two counters for each" is another statement', () => {
    const text =
      'Each creature you control enters with two additional +1/+1 counters on it for each mana spent to cast it.';
    expect(dropped(text, 'artifact').reason).toBe('unrecognised');
  });

  test('"it" is the creature that enters; "~" would be the permanent with the ability, which is not read', () => {
    const text =
      'Each creature you control enters with an additional +1/+1 counter on it for each mana spent to cast ~.';
    expect(dropped(text, 'artifact').reason).toBe('unrecognised');
  });

  test('a source that is not a card type, or a spell that is not "it", is not read', () => {
    for (const tail of [
      'for each mana from a Treasure source spent to cast it',
      'for each mana from artifact sources spent to cast it',
      'for each mana spent to cast that spell',
      'for each mana spent to cast',
      'for each mana spent',
    ]) {
      const text = `Each creature you control enters with an additional +1/+1 counter on it ${tail}.`;
      expect(dropped(text, 'artifact').reason, text).toBe('unrecognised');
    }
  });

  test('a creature that is not yours, or "other", keeps its own rules', () => {
    expect(
      dropped(
        'Each creature enters with an additional +1/+1 counter on it for each mana spent to cast it.',
        'artifact',
      ).reason,
    ).toBe('unrecognised');
  });
});
