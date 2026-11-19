// The Jeskai copy group (issue 100): the Oracle lines of Narset's Reversal, Shiko and Narset, Unified and Adaptive Training Post through the grammar. The three share the copy
// of a spell (CR 707.10, 707.10c). The lines are the real Oracle text of the three cards as the issue gives it; the other lines are SYNTHETIC siblings and the near misses the
// grammar must not read. The engine runs what is lowered in convert-grammar-engine-jeskai-copy.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, read, readAll, spellEffect } from './parser-p5-helpers';

const REVERSAL =
  "Copy target instant or sorcery spell, then return it to its owner's hand. You may choose new targets for the copy.";
const FLURRY =
  "Flurry — Whenever you cast your second spell each turn, copy that spell if it targets a permanent or player, and you may choose new targets for the copy. If you don't copy a spell this way, draw a card.";
const POST_COUNT =
  'Whenever you cast an instant or sorcery spell, if this artifact has fewer than three charge counters on it, put a charge counter on it.';
const POST_COPY =
  'Remove three charge counters from this artifact: When you next cast an instant or sorcery spell this turn, copy it and you may choose new targets for the copy.';
const INSTANT_OR_SORCERY = {
  stackKind: 'spell',
  anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
};
const T1 = { kind: 'target', id: 't1' };

describe("Narset's Reversal: copy target instant or sorcery spell, then return it to its owner's hand (CR 707.10, 400.3)", () => {
  test('the real text: the copy, then the target spell goes to its owner hand', () => {
    expect(spellEffect(REVERSAL)).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'copySpell', spell: T1, newTargets: 'may' },
        { kind: 'moveToZone', objects: T1, to: 'hand' },
      ],
    });
    expect(readAll(REVERSAL).spell?.targets).toEqual([
      { id: 't1', what: { kind: 'object', filter: { zone: 'stack', ...INSTANT_OR_SORCERY } } },
    ]);
  });

  test('without the sentence about the new targets: the copy keeps the targets (SYNTHETIC)', () => {
    expect(
      spellEffect("Copy target instant or sorcery spell, then return it to its owner's hand."),
    ).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'copySpell', spell: T1, newTargets: 'no' },
        { kind: 'moveToZone', objects: T1, to: 'hand' },
      ],
    });
  });

  test.each([
    'Copy target instant or sorcery spell, then return it to your hand. You may choose new targets for the copy.',
    "Copy target instant or sorcery spell, then return it to its owner's hand and draw a card.",
    "Copy target instant or sorcery spell, then return it to its owner's library.",
    "Copy target instant or sorcery spell, then return that spell to its owner's hand.",
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'instant');
    expect(parsed.spell).toBeNull();
    expect(parsed.unparsed).toHaveLength(1);
  });
});

describe('Shiko and Narset, Unified: "copy that spell if it targets a permanent or player ... If you don\'t copy a spell this way, draw a card." (CR 115.1, 608.2c, 707.10)', () => {
  test('the real line: a conditional copy of the spell that was cast, otherwise draw', () => {
    const parsed = readAll(FLURRY, 'creature', ['Human']);
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'you', nth: 2 },
        effect: {
          kind: 'conditional',
          condition: {
            kind: 'objectMatches',
            of: { kind: 'triggerSubject' },
            filter: {
              anyOf: [{ targetsObject: { zone: 'battlefield' } }, { targetsPlayer: true }],
            },
          },
          effect: { kind: 'copySpell', spell: { kind: 'triggerSubject' }, newTargets: 'may' },
          else: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        },
      },
    ]);
  });

  test('without the "otherwise" sentence nothing is drawn (SYNTHETIC)', () => {
    const parsed = readAll(
      'Whenever you cast your second spell each turn, copy that spell if it targets a permanent or player, and you may choose new targets for the copy.',
      'creature',
    );
    expect(JSON.stringify(parsed.abilities[0])).not.toContain('"else"');
    expect(JSON.stringify(parsed.abilities[0])).toContain('"newTargets":"may"');
  });

  test.each([
    // another condition, another otherwise
    'Whenever you cast your second spell each turn, copy that spell if it targets a creature, and you may choose new targets for the copy.',
    "Whenever you cast your second spell each turn, copy that spell if it targets a permanent or player, and you may choose new targets for the copy. If you don't copy a spell this way, draw two cards.",
    "Whenever you cast your second spell each turn, copy that spell. If you don't copy a spell this way, draw a card.",
    'Whenever you cast your second spell each turn, copy that spell if it targets a permanent or player, and draw a card.',
    "Whenever you cast your second spell each turn, copy that spell if it targets a permanent or player, and you may choose new targets for the copy. If you don't copy a spell this way, draw a card and gain 1 life.",
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'creature');
    expect(parsed.abilities).toEqual([]);
    expect(parsed.unparsed).toHaveLength(1);
  });

  test('on a spell the condition has no trigger subject: nothing reads it (SYNTHETIC)', () => {
    const parsed = read(
      'Copy target instant or sorcery spell if it targets a permanent or player.',
      'instant',
    );
    expect(parsed.spell).toBeNull();
    expect(parsed.unparsed).toHaveLength(1);
  });
});

describe('Adaptive Training Post (CR 122.1, 603.4, 603.7, 707.10)', () => {
  test('the charge counter trigger: an intervening "if" of fewer than three counters, the counter goes on the artifact itself', () => {
    expect(readAll(POST_COUNT, 'artifact').abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'castSpell', filter: INSTANT_OR_SORCERY, by: 'you' },
        interveningIf: {
          kind: 'amountIs',
          amount: { kind: 'countersOn', of: { kind: 'this' }, counter: 'charge' },
          compare: { cmp: 'atMost', value: 2 },
        },
        effect: { kind: 'addCounters', objects: { kind: 'this' }, counter: 'charge', count: 1 },
      },
    ]);
  });

  test('the counters are the cost, the next instant or sorcery cast this turn is copied', () => {
    expect(readAll(POST_COPY, 'artifact').abilities).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'removeCounters', counter: 'charge', count: 3 }],
        effect: {
          kind: 'delayedCast',
          filter: INSTANT_OR_SORCERY,
          effect: { kind: 'copySpell', spell: { kind: 'triggerSubject' }, newTargets: 'may' },
        },
      },
    ]);
  });

  test('"or more" and another number of counters (SYNTHETIC)', () => {
    const parsed = readAll(
      'Whenever you cast an instant or sorcery spell, if this artifact has two or more charge counters on it, draw a card.',
      'artifact',
    );
    expect(JSON.stringify(parsed.abilities[0])).toContain('"compare":{"cmp":"atLeast","value":2}');
  });

  test.each([
    'Whenever you cast an instant or sorcery spell, if this artifact has more than three charge counters on it, put a charge counter on it.',
    'Whenever you cast an instant or sorcery spell, if target artifact has fewer than three charge counters on it, draw a card.',
    'Whenever you cast an instant or sorcery spell, if this artifact has fewer than three counters on it, draw a card.',
    'Remove three charge counters from this artifact: When you next cast an instant or sorcery spell this turn, copy it and you may choose new targets for the copy and draw a card.',
    'Remove three charge counters from this artifact: When you next cast an instant or sorcery spell this turn, copy it for each creature you control.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const first = dropped(text, 'artifact');
    expect(first.text.length).toBeGreaterThan(0);
  });
});
