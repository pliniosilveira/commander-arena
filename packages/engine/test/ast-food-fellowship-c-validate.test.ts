// Validation of the nodes of group C of the Food and Fellowship deck: the devour quality ("Devour Food 3", CR 702.82c), the revolt history (`diedThisTurn` with `leftBattlefield`),
// the Ring conditions `thisIsRingBearer` and `ringTemptedAtLeast` (CR 701.54) and the static amount `countersOnSource` (CR 122.1). A node the engine does not run is refused with a
// message, never accepted and half run.
import { describe, expect, test } from 'vitest';
import { type CardDefinition, syntheticCard, validateCard } from '../src/index';

/** The card with the ability at `index` replaced by `ability`. */
function withAbility(name: string, ability: unknown, index = 0): CardDefinition {
  const card = syntheticCard(name);
  const [face] = card.faces;
  if (face === undefined) throw new Error('no face');
  const abilities = face.abilities.map((a, i) => (i === index ? ability : a));
  return { ...card, faces: [{ ...face, abilities }] } as never;
}

const messages = (card: CardDefinition) => validateCard(card).map((i) => i.message);

const BRUTE = 'SYNTHETIC Devouring Brute'; // devour 2, ability 0
const WARDEN = 'SYNTHETIC Rivendell Warden'; // a ringTempted trigger with a conditional effect
const YOU = { kind: 'you' };
const DRAW = { kind: 'draw', player: YOU, count: 1 };
const keyword = (k: Record<string, unknown>) => ({ kind: 'keyword', keyword: k });

describe('devour with a quality (CR 702.82c)', () => {
  test('Food is valid, and so is no quality', () => {
    expect(messages(withAbility(BRUTE, keyword({ kind: 'devour', count: 3, of: 'Food' })))).toEqual(
      [],
    );
    expect(messages(withAbility(BRUTE, keyword({ kind: 'devour', count: 3 })))).toEqual([]);
  });

  test.each(['Goblin', '', 7])('the quality %j is refused: it must be an artifact type', (of) => {
    expect(
      messages(withAbility(BRUTE, keyword({ kind: 'devour', count: 3, of }))).join(' | '),
    ).toContain('the quality is an artifact type');
  });
});

describe('the condition "ringTemptedAtLeast" and "thisIsRingBearer"', () => {
  const conditional = (condition: unknown) => ({
    kind: 'triggered',
    trigger: { kind: 'ringTempted' },
    effect: { kind: 'conditional', condition, effect: DRAW },
  });

  test('both are valid in a conditional effect, alone or joined by "and"', () => {
    const times = { kind: 'ringTemptedAtLeast', times: 2 };
    const bearer = { kind: 'thisIsRingBearer' };
    for (const condition of [times, bearer, { kind: 'and', terms: [bearer, times] }]) {
      expect(messages(withAbility(WARDEN, conditional(condition)))).toEqual([]);
    }
  });

  test.each([0, -1, 1.5, '2'])('times %j is refused', (times) => {
    expect(
      messages(withAbility(WARDEN, conditional({ kind: 'ringTemptedAtLeast', times }))).join(' | '),
    ).toContain('ringTemptedAtLeast times is a whole number of 1 or more');
  });
});

describe('the history amount "diedThisTurn" with "leftBattlefield" (Revolt)', () => {
  const amount = (extra: Record<string, unknown>) => ({
    kind: 'triggered',
    trigger: { kind: 'step', step: 'endStep', whose: 'you' },
    effect: {
      kind: 'conditional',
      condition: {
        kind: 'amountIs',
        amount: { kind: 'diedThisTurn', controller: 'you', ...extra },
        compare: { cmp: 'atLeast', value: 1 },
      },
      effect: DRAW,
    },
  });

  test('left the battlefield, under your control, is valid', () => {
    expect(messages(withAbility(WARDEN, amount({ leftBattlefield: true })))).toEqual([]);
  });

  test('a value other than true is refused, and so is "modified" with it', () => {
    expect(messages(withAbility(WARDEN, amount({ leftBattlefield: false }))).join(' | ')).toContain(
      'leftBattlefield filter must be true',
    );
    expect(
      messages(withAbility(WARDEN, amount({ leftBattlefield: true, modified: true }))).join(' | '),
    ).toContain('not read as modified');
  });
});

describe('the static amount "countersOnSource" (CR 122.1)', () => {
  const lord = (power: unknown, toughness: unknown) => ({
    kind: 'static',
    static: {
      kind: 'modifyPt',
      subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you' } },
      power,
      toughness,
    },
  });

  test('a kind of counter is valid as +N/+N', () => {
    const unity = { kind: 'countersOnSource', counter: 'unity' };
    expect(messages(withAbility(BRUTE, lord(unity, unity)))).toEqual([]);
  });

  test('an empty kind is refused (leaving the kind out counts every kind)', () => {
    const bad = { kind: 'countersOnSource', counter: '' };
    expect(messages(withAbility(BRUTE, lord(bad, 0))).join(' | ')).toContain(
      'countersOnSource names a kind of counter',
    );
  });
});
