// Stage P8 (the engine's Sagas, CR 714): a chapter line is "I — ...", "I, II — ...", numerals and an
// em dash (U+2014) at the start of a line. The segmenter says it is a triggered ability whose trigger
// is the numerals, `trigger.chapter` reads them, and lowering makes the engine's `chapter` trigger
// (a range from the least to the greatest numeral). Every line here is SYNTHETIC: it is written to
// exercise the grammar, and no Oracle text of a real Saga is copied.
import { describe, expect, test } from 'vitest';
import {
  ALL_RULES,
  buildRuleSet,
  compileLine,
  DECLARED_NEEDS,
  runDetailed,
  segment,
} from '../src/convert/parser/index';
import { chapterNumbers, romanValue } from '../src/convert/parser/roman';

const SET = buildRuleSet(ALL_RULES);

function chapter(text: string) {
  return compileLine(text, { rules: SET, face: 'permanent', faceTypes: ['enchantment'] });
}

describe('Roman numerals (CR 714.2a)', () => {
  test('the standard forms read, and nothing else does', () => {
    expect(['I', 'II', 'III', 'IV', 'V', 'VI', 'IX', 'X', 'XIV'].map(romanValue)).toEqual([
      1, 2, 3, 4, 5, 6, 9, 10, 14,
    ]);
    for (const bad of ['', 'IIII', 'VV', 'IC', 'VX', 'i', 'IIV']) {
      expect(romanValue(bad), bad).toBeNull();
    }
  });

  test('the chapter numbers at the start of a line', () => {
    expect(chapterNumbers('I — Draw a card.')).toEqual([1]);
    expect(chapterNumbers('I, II — Draw a card.')).toEqual([1, 2]);
    expect(chapterNumbers('II and III — Draw a card.')).toEqual([2, 3]);
    expect(chapterNumbers('IIII — Draw a card.')).toBeNull();
    expect(chapterNumbers('I - Draw a card.')).toBeNull();
    expect(chapterNumbers('Flying')).toBeNull();
    expect(chapterNumbers('When ~ enters, draw a card.')).toBeNull();
  });
});

describe('the segmenter reads a chapter line as a triggered ability', () => {
  const text = 'I, II — You gain 2 life. Draw a card.';
  const sk = segment(text, 'permanent');

  test('the trigger is the numerals, with no trigger word, and the body follows the em dash', () => {
    expect(sk.head).toBe('triggered');
    expect(sk.chapter).toBe(true);
    expect(sk.triggerWord).toBeUndefined();
    expect(sk.trigger === undefined ? null : text.slice(sk.trigger.start, sk.trigger.end)).toBe(
      'I, II',
    );
    expect(sk.sentences.map((s) => text.slice(s.start, s.end))).toEqual([
      'You gain 2 life.',
      'Draw a card.',
    ]);
  });

  test('a line without numerals and an em dash is not a chapter line', () => {
    for (const other of [
      'Flying',
      'I am a creature.',
      'I - You gain 2 life.',
      'I— You gain 2 life.',
      'Choose one —\n• Draw a card.\n• Gain 2 life.',
    ]) {
      expect(segment(other, 'permanent').chapter, other).toBeUndefined();
    }
  });
});

describe('trigger.chapter', () => {
  const rule = ALL_RULES.find((r) => r.id === 'trigger.chapter');
  if (rule === undefined) throw new Error('trigger.chapter is not registered');
  const read = (text: string) => runDetailed(rule.parse, text, 0, text.length, SET);

  test('is a trigger rule and reads the numerals in order', () => {
    expect(rule.family).toBe('trigger');
    const run = read('I, II');
    expect(run.ok).toBe(true);
    if (run.ok) {
      const node = run.value as { event: string; chapters: number[]; rule: string };
      expect(node).toMatchObject({ event: 'chapter', chapters: [1, 2], rule: 'trigger.chapter' });
    }
  });

  test('keeps a list as written, so lowering can refuse one that skips a number', () => {
    const run = read('I, III');
    expect(run.ok && (run.value as { chapters: number[] }).chapters).toEqual([1, 3]);
  });
});

describe('lowering to the engine chapter trigger (CR 714.2b, 714.2c)', () => {
  const abilityOf = (text: string) => {
    const result = chapter(text);
    if (!result.ok || result.kind !== 'abilities') {
      throw new Error(`"${text}" did not read: ${JSON.stringify(!result.ok && result.failure)}`);
    }
    return result.abilities;
  };

  test('"I" is chapter 1 alone and "III" chapter 3 alone', () => {
    expect(abilityOf('I — You gain 2 life.')).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'chapter', from: 1, to: 1 },
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 2 },
      },
    ]);
    expect(abilityOf('III — You gain 2 life.')[0]).toMatchObject({
      trigger: { kind: 'chapter', from: 3, to: 3 },
    });
  });

  test('"I, II" is one ability over the range 1 to 2, and "II and III" the range 2 to 3', () => {
    expect(abilityOf('I, II — Draw a card.')).toHaveLength(1);
    expect(abilityOf('I, II — Draw a card.')[0]).toMatchObject({
      trigger: { kind: 'chapter', from: 1, to: 2 },
      effect: { kind: 'draw' },
    });
    expect(abilityOf('II and III — Draw a card.')[0]).toMatchObject({
      trigger: { kind: 'chapter', from: 2, to: 3 },
    });
  });

  test('the effect is read like any triggered ability: "~" is this, several sentences are a sequence', () => {
    const [ability] = abilityOf('II — Put a +1/+1 counter on ~. You gain 1 life.');
    expect(ability).toMatchObject({
      trigger: { kind: 'chapter', from: 2, to: 2 },
      effect: { kind: 'sequence' },
    });
    expect(JSON.stringify(ability)).toContain('"kind":"this"');
  });

  test.each([['I, III — Draw a card.'], ['II, I — Draw a card.'], ['I, I — Draw a card.']])(
    '%s: a list that is not consecutive numerals in order is recognised, not run',
    (text) => {
      const result = chapter(text);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failure.reason).toBe('notRunnable');
        expect(result.failure.closestRule).toBe('trigger.chapter');
        expect(result.failure.recognised).toContain('trigger.chapter');
      }
    },
  );

  test.each([['IIII — Draw a card.'], ['VV — Draw a card.']])(
    '%s: an invalid numeral is not read',
    (text) => {
      const result = chapter(text);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.failure.reason).toBe('unrecognised');
    },
  );

  test('an effect the grammar does not read leaves the chapter unread, with the effect as the slot', () => {
    const result = chapter('I — Frobnicate the widgets.');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe('unrecognised');
      expect(result.failure.slot).toBe('effect');
      expect(result.failure.stoppedAt).toBe('Frobnicate the widgets.');
    }
  });

  test('the lowering declares the engine features it needs, and they exist', () => {
    expect(DECLARED_NEEDS).toContain('trigger:chapter');
    expect(DECLARED_NEEDS).toContain('layout:saga');
  });
});
