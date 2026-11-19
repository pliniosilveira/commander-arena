// The cast triggers that look at an {X} in the mana cost of a spell (the Quandrix Unlimited deck, group E): the engine's `xInManaCost` and `firstXSpellThisTurn` of the spell filter,
// `triggerSpellX` for the X of the spell cast, the first-X-spell cost reduction and the delayed cast of a mana ability. The lines of `REAL` are the real Oracle wordings of Zimone,
// Infinite Analyst, Nev, the Practical Dean, Owlin Spiralmancer, Elementalist's Palette, Brass Infiniscope and Unbound Flourishing (names replaced by ~ where they said their own);
// the rest is SYNTHETIC: the same shapes over other cards and the near misses the grammar must not read. The engine runs what is lowered in convert-grammar-engine-quandrix-e.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, type FaceType, readAll } from './parser-p5-helpers';

const abilities = (text: string, type: FaceType = 'creature') => readAll(text, type).abilities;

const FIRST_X = { stackKind: 'spell', xInManaCost: true, firstXSpellThisTurn: true };
const ANY_X = { stackKind: 'spell', xInManaCost: true };

describe('the cast triggers', () => {
  test('"your first spell with {X} in its mana cost each turn"', () => {
    expect(
      abilities(
        'Whenever you cast your first spell with {X} in its mana cost each turn, put two +1/+1 counters on ~.',
      ),
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'castSpell', filter: FIRST_X, by: 'you' },
        effect: { kind: 'addCounters', objects: { kind: 'this' }, counter: '+1/+1', count: 2 },
      },
    ]);
  });

  test('X is the X of the spell that was cast (real: Nev, the Practical Dean)', () => {
    expect(
      abilities(
        'Whenever you cast your first spell with {X} in its mana cost each turn, put X +1/+1 counters on ~.',
      ),
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'castSpell', filter: FIRST_X, by: 'you' },
        effect: {
          kind: 'addCounters',
          objects: { kind: 'this' },
          counter: '+1/+1',
          count: { kind: 'triggerSpellX' },
        },
      },
    ]);
  });

  test('"a spell with {X} in its mana cost" and "a permanent spell with a mana cost that contains {X}"', () => {
    const [plain] = abilities(
      'Whenever you cast a spell with {X} in its mana cost, put two charge counters on ~.',
      'artifact',
    );
    expect(plain).toMatchObject({ trigger: { kind: 'castSpell', filter: ANY_X, by: 'you' } });
    const [permanent] = abilities(
      'Whenever you cast a permanent spell with a mana cost that contains {X}, you gain 1 life.',
      'enchantment',
    );
    expect(permanent).toMatchObject({
      trigger: {
        kind: 'castSpell',
        filter: { ...ANY_X, anyOf: expect.arrayContaining([{ types: ['creature'] }]) },
      },
    });
  });

  test('"copy it" is the spell that was cast (real: Owlin Spiralmancer)', () => {
    const [copy] = abilities(
      'Whenever you cast your first spell with {X} in its mana cost each turn, you may copy it. You may choose new targets for the copy.',
    );
    expect(copy).toMatchObject({
      trigger: { kind: 'castSpell', filter: FIRST_X },
      optional: true,
      effect: { kind: 'copySpell', spell: { kind: 'triggerSubject' }, newTargets: 'may' },
    });
  });

  test('"copy it" of anything but a cast trigger is not read', () => {
    expect(dropped('When ~ enters, copy it. You may choose new targets for the copy.').reason).toBe(
      'notRunnable',
    );
  });

  test('X outside a cast trigger of a spell with {X} is not the X of a spell', () => {
    expect(
      dropped('Whenever you cast a creature spell, put X +1/+1 counters on ~.', 'creature').reason,
    ).not.toBe(undefined);
  });
});

describe('the first spell with {X} each turn costs less', () => {
  test('real: Zimone, Infinite Analyst', () => {
    const [reduction] = abilities(
      'The first spell you cast with {X} in its mana cost each turn costs {1} less to cast for each +1/+1 counter on ~.',
    );
    expect(reduction).toEqual({
      kind: 'static',
      static: {
        kind: 'costReduction',
        spells: { controller: 'you', xInManaCost: true, firstXSpellThisTurn: true },
        amount: { kind: 'countersOn', of: { kind: 'this' }, counter: '+1/+1' },
      },
    });
  });
});

describe('a token and the counters put on it', () => {
  test('"it" after the token is the token (Lattice Library), not the permanent', () => {
    const [made] = abilities(
      'When ~ enters, create a 0/0 green and blue Fractal creature token. Put a number of +1/+1 counters on it equal to the number of study counters on ~.',
      'enchantment',
    );
    expect(made).toMatchObject({
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'createToken' },
          {
            kind: 'addCounters',
            objects: { kind: 'moved' },
            count: { kind: 'countersOn', of: { kind: 'this' }, counter: 'study' },
          },
        ],
      },
    });
  });

  test("another pronoun after a token keeps its meaning (Ajani's Chosen)", () => {
    const [chosen] = abilities(
      'Whenever an enchantment you control enters, create a 2/2 white Cat creature token. If that enchantment is an Aura, you may attach it to the token.',
    );
    // "it" is the enchantment that entered (the trigger's subject) and the token is "the token".
    expect(JSON.stringify(chosen)).toContain(
      '"attach","object":{"kind":"triggerSubject"},"to":{"kind":"moved"}',
    );
  });
});

describe('the delayed cast trigger of a mana ability (real: Brass Infiniscope)', () => {
  const [mana] = abilities(
    '{T}: Add {C}{C}. When you next cast a spell with {X} in its mana cost this turn, you draw a card and gain half X life, rounded down.',
    'artifact',
  );

  test('lowers to the mana ability with the delayed trigger as its extra effect', () => {
    expect(mana).toMatchObject({
      kind: 'mana',
      production: { kind: 'fixed', mana: ['C', 'C'] },
      also: [
        {
          kind: 'delayedCast',
          filter: ANY_X,
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'draw', count: 1 },
              {
                kind: 'gainLife',
                amount: { kind: 'half', of: { kind: 'triggerSpellX' }, round: 'down' },
              },
            ],
          },
        },
      ],
    });
  });

  test('the older reading of "next cast" (D-336) is unchanged', () => {
    const [copy] = abilities(
      '{T}: Add {C}. When you next cast an instant or sorcery spell this turn, copy that spell. You may choose new targets for the copy.',
      'artifact',
    );
    expect(copy).toMatchObject({ also: [{ kind: 'delayedCast', effect: { kind: 'copySpell' } }] });
  });
});

describe('near misses are not read', () => {
  test.each([
    'Whenever you cast a spell with {Y} in its mana cost, you gain 1 life.',
    'Whenever you cast your first spell with {X} in its mana cost, you gain 1 life.',
    'Whenever an opponent casts a spell with {X} in its mana cost, you gain 1 life.',
    'Whenever you cast your second spell with {X} in its mana cost each turn, you gain 1 life.',
  ])('%s', (text) => {
    expect(dropped(text, 'enchantment').reason).toBe('unrecognised');
  });
});
