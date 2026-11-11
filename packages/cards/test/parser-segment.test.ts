// The segmenter (D-063, proposal 3.4): the skeleton of an ability line from punctuation and a few
// structural words, with no vocabulary. Spans are offsets into the line.
import { describe, expect, test } from 'vitest';
import { segment, splitSentences } from '../src/convert/parser/index';

const slice = (text: string, span: { start: number; end: number } | undefined) =>
  span === undefined ? undefined : text.slice(span.start, span.end);

describe('heads', () => {
  test.each([
    ['Flying', 'other'],
    ['Flying, first strike', 'other'],
    ['Ward {2}', 'other'],
    ['Destroy target creature.', 'other'],
    ['~ enters tapped.', 'replacement'],
    ['~ enters the battlefield with two +1/+1 counters on it.', 'replacement'],
    ['If ~ would die, exile it instead.', 'replacement'],
    ['When ~ enters, draw a card.', 'triggered'],
    ['Whenever you cast a spell, draw a card.', 'triggered'],
    ['At the beginning of your upkeep, draw a card.', 'triggered'],
    ['{T}: Add {G}.', 'activated'],
    ['{1}, {T}, Sacrifice ~: Draw a card.', 'activated'],
    ['Sacrifice a creature: Draw a card.', 'activated'],
    ['Choose one —\n• Draw a card.\n• Gain 2 life.', 'modal'],
    ['Choose one or both —\n• Draw a card.\n• Gain 2 life.', 'modal'],
  ] as const)('%j is %s', (text, head) => {
    expect(segment(text, 'permanent').head).toBe(head);
  });

  test('a colon that is not after a cost does not make an activated ability', () => {
    // "Note: ..." has no cost words and no braces.
    expect(segment('Choose a card name: draw a card.', 'permanent').head).toBe('other');
    // A sentence ends before the colon, so the colon is inside a later sentence.
    expect(segment('Draw a card. Then: gain life.', 'spell').head).toBe('other');
  });

  test('a colon inside quotes does not end a cost list', () => {
    expect(segment('Creatures you control have "{T}: Add {G}."', 'permanent').head).toBe('other');
  });
});

describe('triggered abilities', () => {
  const text =
    'Whenever a creature you control dies, if you control a land, draw a card. Gain 1 life.';
  const sk = segment(text, 'permanent');

  test('the word, the trigger, the intervening if and the body sentences', () => {
    expect(slice(text, sk.triggerWord)).toBe('Whenever');
    expect(slice(text, sk.trigger)).toBe('a creature you control dies');
    expect(slice(text, sk.interveningIf)).toBe('if you control a land');
    expect(sk.sentences.map((s) => slice(text, s))).toEqual(['draw a card.', 'Gain 1 life.']);
  });

  test('a body that begins with "if" but has no comma is not an intervening if', () => {
    const t = 'When ~ dies, if able, draw a card.';
    expect(slice(t, segment(t, 'permanent').interveningIf)).toBe('if able');
    const u = 'When ~ dies, if you do draw a card.';
    expect(segment(u, 'permanent').interveningIf).toBeUndefined();
  });

  test('a comma inside quotes or braces does not end the trigger', () => {
    const t = 'Whenever you cast a spell with "a, b" in its name, draw a card.';
    expect(slice(t, segment(t, 'permanent').trigger)).toBe(
      'you cast a spell with "a, b" in its name',
    );
  });

  test('a trigger with no body has no sentences', () => {
    const t = 'When ~ dies';
    const s = segment(t, 'permanent');
    expect(slice(t, s.trigger)).toBe('~ dies');
    expect(s.sentences).toEqual([]);
  });
});

describe('activated abilities', () => {
  test('costs are split on commas outside braces and quotes', () => {
    const t = '{2}{B}, {T}, Sacrifice a creature: Draw a card.';
    const s = segment(t, 'permanent');
    expect(s.costs.map((c) => slice(t, c))).toEqual(['{2}{B}', '{T}', 'Sacrifice a creature']);
    expect(s.sentences.map((x) => slice(t, x))).toEqual(['Draw a card.']);
  });

  test('"Activate only ..." sentences are restrictions, not body', () => {
    const t = '{T}: Draw a card. Activate only as a sorcery. Activate only once each turn.';
    const s = segment(t, 'permanent');
    expect(s.sentences.map((x) => slice(t, x))).toEqual(['Draw a card.']);
    expect(s.restrictions.map((x) => slice(t, x))).toEqual([
      'Activate only as a sorcery.',
      'Activate only once each turn.',
    ]);
  });
});

describe('modal text', () => {
  test('the header and one span per bullet, without the bullet mark', () => {
    const t = 'Choose one —\n• Draw a card.\n• Gain 2 life.';
    const s = segment(t, 'spell');
    expect(s.head).toBe('modal');
    expect(slice(t, s.modalHeader)).toBe('Choose one —');
    expect(s.modes.map((m) => slice(t, m))).toEqual(['Draw a card.', 'Gain 2 life.']);
  });

  test('a lead line with no bullet is not modal text', () => {
    expect(segment('Choose two target creature cards in your graveyard.', 'spell').head).toBe(
      'other',
    );
  });

  test('a trigger whose body is modal keeps its trigger, and has modes in place of sentences', () => {
    const t = 'When ~ enters, choose one —\n• Draw a card.\n• You gain 3 life.';
    const s = segment(t, 'permanent');
    expect(s.head).toBe('triggered');
    expect(slice(t, s.trigger)).toBe('~ enters');
    expect(slice(t, s.modalHeader)).toBe('choose one —');
    expect(s.modes.map((m) => slice(t, m))).toEqual(['Draw a card.', 'You gain 3 life.']);
    expect(s.sentences).toEqual([]);
  });

  test('an activated ability whose effect is modal keeps its costs', () => {
    const t = '{2}, {T}: Choose one —\n• Draw a card.\n• You gain 3 life.';
    const s = segment(t, 'permanent');
    expect(s.head).toBe('activated');
    expect(s.costs.map((c) => slice(t, c))).toEqual(['{2}', '{T}']);
    expect(slice(t, s.modalHeader)).toBe('Choose one —');
    expect(s.modes).toHaveLength(2);
    expect(s.sentences).toEqual([]);
  });

  test('the intervening if of a modal trigger stays its own slot', () => {
    const t = 'When ~ enters, if you control a creature, choose one —\n• Draw a card.\n• Scry 1.';
    const s = segment(t, 'permanent');
    expect(slice(t, s.interveningIf)).toBe('if you control a creature');
    expect(slice(t, s.modalHeader)).toBe('choose one —');
  });
});

describe('sentences', () => {
  test('a period followed by a space or the end ends a sentence, and stays with it', () => {
    const t = 'Destroy target creature. Draw a card.';
    expect(splitSentences(t, 0, t.length).map((s) => slice(t, s))).toEqual([
      'Destroy target creature.',
      'Draw a card.',
    ]);
  });

  test('a period inside quotes does not end a sentence', () => {
    const t = 'Create a token with "Draw a card. Gain 1 life." Draw a card.';
    expect(splitSentences(t, 0, t.length).map((s) => slice(t, s))).toEqual([
      'Create a token with "Draw a card. Gain 1 life." Draw a card.',
    ]);
    const u = 'Creatures have “Draw a card. Gain 1 life.” Draw a card.';
    expect(splitSentences(u, 0, u.length)).toHaveLength(1);
  });

  test('a decimal point or a period inside a word does not end a sentence', () => {
    const t = 'Gain 1.5 life.';
    expect(splitSentences(t, 0, t.length).map((s) => slice(t, s))).toEqual(['Gain 1.5 life.']);
  });

  test('a last sentence with no period is kept, and the sentence parser then stops at its end', () => {
    const t = 'Draw a card';
    expect(splitSentences(t, 0, t.length).map((s) => slice(t, s))).toEqual(['Draw a card']);
  });
});

describe('what an unclassified line means depends on the face', () => {
  test('the face kind is carried, not decided here', () => {
    expect(segment('Destroy target creature.', 'spell').face).toBe('spell');
    expect(segment('Destroy target creature.', 'permanent').face).toBe('permanent');
    expect(segment('Destroy target creature.', 'spell').sentences).toHaveLength(1);
  });
});
