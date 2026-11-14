// What validateCard says about Saga cards (CR 714): the chapter trigger's numbers (CR 714.2a), only a
// Saga having chapter abilities (CR 714.1, 714.2), the final chapter being the greatest chapter number
// and every chapter I to final having exactly one ability (CR 714.2d, 714.2b, 714.2c), and the honest
// refusals (a chapter ability with a target, on a token). Cards are SYNTHETIC.
import { describe, expect, test } from 'vitest';
import {
  type Ability,
  type CardDefinition,
  type CardFace,
  syntheticCard,
  validateCard,
  validateCardStructure,
} from '../src/index';

const RITE = syntheticCard('SYNTHETIC Rite of Three'); // chapters I, II, III; final chapter 3
const ECHO = syntheticCard('SYNTHETIC Echo Verse'); // "I, II" and III

const messages = (def: CardDefinition): string[] => validateCard(def).map((i) => i.message);

function withFace(def: CardDefinition, patch: Partial<CardFace>): CardDefinition {
  const face = def.faces[0];
  if (face === undefined) throw new Error('no face');
  return { ...def, faces: [{ ...face, ...patch }] };
}

const chapter = (from: number, to: number): Ability => ({
  kind: 'triggered',
  trigger: { kind: 'chapter', from, to },
  effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
});

describe('the Saga cards validate clean', () => {
  test('every synthetic Saga, including one chapter ability for two chapters', () => {
    for (const name of [
      'SYNTHETIC Rite of Three',
      'SYNTHETIC Echo Verse',
      'SYNTHETIC Rising Golem',
      'SYNTHETIC Brief Tale',
      'SYNTHETIC Lore Surge',
      'SYNTHETIC Lore Flood',
      'SYNTHETIC Saga Breaker',
      'SYNTHETIC Saga Flicker',
      'SYNTHETIC Saga Mirror',
    ]) {
      expect(validateCard(syntheticCard(name)), name).toEqual([]);
    }
    expect(RITE.layout).toBe('saga');
    expect(RITE.faces[0]?.finalChapter).toBe(3);
    expect(ECHO.faces[0]?.finalChapter).toBe(3);
  });
});

describe('the chapter numbers of a trigger (CR 714.2a, 714.2c)', () => {
  test('a chapter number is a positive integer and a range does not run backwards', () => {
    for (const [from, to] of [
      [0, 1],
      [1, 0],
      [1.5, 2],
      [3, 2],
    ] as const) {
      const def = withFace(RITE, { abilities: [chapter(from, to)] });
      expect(validateCardStructure(def).length, `${from}-${to}`).toBeGreaterThan(0);
    }
  });
});

describe('only a Saga has chapter abilities (CR 714.1, 714.2)', () => {
  test('a chapter ability on a card that is not a Saga is refused, even when unsupported', () => {
    const bear = syntheticCard('SYNTHETIC Rite of Three');
    const normal: CardDefinition = { ...bear, layout: 'normal' };
    const found = validateCardStructure(normal).filter((i) => i.message.includes('chapter'));
    expect(found.length).toBe(3);
    const unsupported: CardDefinition = { ...normal, support: 'unsupported' };
    expect(validateCard(unsupported).some((i) => i.message.includes('chapter'))).toBe(true);
  });

  test('a Saga layout needs the subtype Saga and the enchantment type', () => {
    expect(validateCardStructure(withFace(RITE, { subtypes: [] })).map((i) => i.message)).toContain(
      'layout saga needs a face with the subtype Saga (CR 714.1)',
    );
    expect(
      validateCardStructure(withFace(RITE, { types: ['creature'] })).map((i) => i.message),
    ).toContain('a Saga is an enchantment (CR 714.1)');
  });

  test('an unsupported Saga whose text was dropped is structurally valid', () => {
    const dropped: CardDefinition = {
      ...withFace(RITE, { abilities: [] }),
      support: 'unsupported',
    };
    expect(validateCard(dropped)).toEqual([]);
  });
});

describe('the final chapter and the coverage of chapters (CR 714.2d)', () => {
  test('a supported Saga states its final chapter', () => {
    const { finalChapter: _gone, ...rest } = RITE.faces[0] as CardFace;
    const def: CardDefinition = { ...RITE, faces: [rest] };
    expect(messages(def)).toEqual([
      'a Saga needs its final chapter number, a positive integer (CR 714.2d)',
    ]);
  });

  test('a skipped chapter is refused', () => {
    const def = withFace(RITE, { abilities: [chapter(1, 1), chapter(3, 3)] });
    expect(messages(def)).toEqual([
      'chapter 2 has no chapter ability, but the final chapter is 3 (CR 714.2d)',
    ]);
  });

  test('a chapter with two abilities is refused', () => {
    const def = withFace(RITE, {
      abilities: [chapter(1, 2), chapter(2, 2), chapter(3, 3)],
    });
    expect(messages(def)).toEqual(['chapter 2 has more than one chapter ability']);
  });

  test('a chapter ability beyond the stated final chapter is refused', () => {
    const def = withFace(RITE, { finalChapter: 2 });
    expect(messages(def)).toEqual([
      'finalChapter is 2 but a chapter ability reaches chapter 3 (CR 714.2d)',
    ]);
  });

  test('other abilities next to the chapters are fine', () => {
    const extra: Ability = { kind: 'keyword', keyword: { kind: 'flash' } };
    const def = withFace(RITE, { abilities: [...(RITE.faces[0]?.abilities ?? []), extra] });
    expect(messages(def)).toEqual([]);
  });
});

describe('what the engine does not run for a Saga', () => {
  test('a chapter ability with a target is executable like any triggered ability with a target (CR 603.3d)', () => {
    const targeted: Ability = {
      kind: 'triggered',
      trigger: { kind: 'chapter', from: 3, to: 3 },
      targets: [{ id: 't1', what: { kind: 'object', filter: { zone: 'battlefield' } } }],
      effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
    };
    const def = withFace(RITE, {
      abilities: [...(RITE.faces[0]?.abilities ?? []).slice(0, 2), targeted],
    });
    expect(messages(def)).toEqual([]);
  });

  test('a chapter ability on a token definition is refused', () => {
    const def: CardDefinition = {
      ...syntheticCard('SYNTHETIC Rising Golem'),
    };
    const face = def.faces[0] as CardFace;
    const bad: CardFace = {
      ...face,
      abilities: [
        ...face.abilities.slice(0, 2),
        {
          kind: 'triggered',
          trigger: { kind: 'chapter', from: 3, to: 3 },
          effect: {
            kind: 'createToken',
            count: 1,
            token: {
              kind: 'custom',
              definition: {
                name: 'Odd',
                manaCost: null,
                supertypes: [],
                types: ['creature'],
                subtypes: ['Saga'],
                colors: [],
                power: 1,
                toughness: 1,
                loyalty: null,
                defense: null,
                oracleText: '',
                abilities: [chapter(1, 1)],
              },
            },
          },
        },
      ],
    };
    expect(messages({ ...def, faces: [bad] })).toContain(
      'a chapter ability on a token is not implemented by the engine yet',
    );
  });
});
