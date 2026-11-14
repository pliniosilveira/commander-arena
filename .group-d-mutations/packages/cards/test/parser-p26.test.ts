// Stage P26 (M6): the "cast later" slice of the engine (D-128, ENGINE_VERSION 26). Four lines lowered to the engine's
// nodes: "Suspend 2—{1}{B}" (the keyword `suspend`), "Madness {1}{B}{B}" and "Foretell {4}{R}{R}" (entries of the
// face's `alternativeCosts`) and "You draw a card at the beginning of the next turn's upkeep." (the effect
// `delayedTrigger`). The real lines are those of reports/templates.json (and reports/backlog.md); every other line is
// SYNTHETIC, among them the near misses, the parenthesis standing for reminder text and the imperative "Draw a
// card ..." beside the real one (a real template of its own, 40 cards, whose example is read through the same rule).
// That the engine runs what is lowered is in convert-grammar-engine-p26.test.ts; that a missing engine feature is
// named is in parser-p26-needs.test.ts.
import type { AlternativeCost } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';
import { dropped, type FaceType, read, readAll } from './parser-p5-helpers';

const SUSPEND = 'Suspend 2—{1}{B}';
const MADNESS = 'Madness {1}{B}{B}';
const FORETELL = 'Foretell {4}{R}{R}';
const DELAYED = "You draw a card at the beginning of the next turn's upkeep.";
const DELAYED_IMPERATIVE = "Draw a card at the beginning of the next turn's upkeep.";

const mana = (...symbols: string[]) => [{ kind: 'mana', symbols }] as const;
const suspend = (count: number, ...symbols: string[]) => ({
  kind: 'keyword',
  keyword: { kind: 'suspend', count, cost: [...mana(...symbols)] },
});
const madness = (...symbols: string[]): AlternativeCost => ({
  kind: 'madness',
  cost: [...mana(...symbols)],
});
const foretell = (...symbols: string[]): AlternativeCost => ({
  kind: 'foretell',
  cost: [...mana(...symbols)],
});
const alternatives = (text: string, type: FaceType = 'creature') =>
  readAll(text, type).alternativeCosts;
const delayedDraw = (count: number) => ({
  kind: 'delayedTrigger',
  at: { step: 'upkeep', whose: 'each' },
  effect: { kind: 'draw', player: { kind: 'you' }, count },
});

describe('keyword.suspend: "Suspend 2—{1}{B}" (CR 702.62a; backlog: 65 cards)', () => {
  test.each<FaceType>(['sorcery', 'instant', 'creature', 'artifact', 'enchantment'])(
    'the real line lowers to the keyword with its count and its mana cost on a %s',
    (type) => {
      expect(readAll(SUSPEND, type).abilities).toEqual([suspend(2, '1', 'B')]);
    },
  );

  test('it is a keyword ability, not an alternative cost of the face', () => {
    const parsed = readAll(SUSPEND, 'sorcery');
    expect(parsed.alternativeCosts).toEqual([]);
    expect(parsed.spell).toBeNull();
  });

  test.each([
    ['Suspend 3—{R}', 3, ['R']],
    ['Suspend 4—{0}', 4, ['0']],
    ['Suspend 1—{G}', 1, ['G']],
    ['Suspend 10—{2}{U}{U}', 10, ['2', 'U', 'U']],
    ['suspend 2—{W}', 2, ['W']],
  ])('"%s" keeps the count and the cost symbol by symbol (SYNTHETIC)', (text, count, symbols) => {
    expect(readAll(text, 'sorcery').abilities).toEqual([suspend(count, ...symbols)]);
  });

  test('the reminder text in parentheses is dropped by the normalizer (SYNTHETIC reminder)', () => {
    const parsed = readAll(`${SUSPEND} (SYNTHETIC reminder text.)`, 'sorcery');
    expect(parsed.abilities).toEqual([suspend(2, '1', 'B')]);
    expect(parsed.lines).toEqual([SUSPEND]);
  });

  test('beside the spell text of the card, in either order (SYNTHETIC spell text)', () => {
    const first = readAll(
      `${SUSPEND}\nYou draw a card at the beginning of the next turn's upkeep.`,
      'sorcery',
    );
    expect(first.abilities).toEqual([suspend(2, '1', 'B')]);
    expect(first.spell?.effect).toEqual(delayedDraw(1));
    const last = readAll(`Draw two cards.\n${SUSPEND}`, 'sorcery');
    expect(last.abilities).toEqual([suspend(2, '1', 'B')]);
    expect(last.spell?.effect).toEqual({ kind: 'draw', player: { kind: 'you' }, count: 2 });
  });
});

describe('keyword.madness: "Madness {1}{B}{B}" (CR 702.35a; backlog: 56 cards)', () => {
  test('the real line lowers to a madness entry, not to an ability', () => {
    const parsed = readAll(MADNESS, 'creature');
    expect(parsed.alternativeCosts).toEqual([madness('1', 'B', 'B')]);
    expect(parsed.abilities).toEqual([]);
  });

  test('on a spell with its text, in either order (SYNTHETIC spell text)', () => {
    const first = readAll(`${MADNESS}\nDraw a card.`, 'instant');
    expect(first.alternativeCosts).toEqual([madness('1', 'B', 'B')]);
    expect(first.spell).not.toBeNull();
    const last = readAll(`Draw a card.\n${MADNESS}`, 'instant');
    expect(last.alternativeCosts).toEqual([madness('1', 'B', 'B')]);
    expect(last.spell?.effect).toEqual(first.spell?.effect);
  });

  test.each([
    ['Madness {R}', ['R']],
    ['Madness {2}{G}', ['2', 'G']],
    ['madness {3}{U}', ['3', 'U']],
  ])('"%s" (the cost is kept symbol by symbol; SYNTHETIC)', (text, symbols) => {
    expect(alternatives(text)).toEqual([madness(...symbols)]);
  });

  test('the engine decides which card types may have it: the line is read on any face', () => {
    expect(alternatives(MADNESS, 'sorcery')).toEqual([madness('1', 'B', 'B')]);
    expect(alternatives(MADNESS, 'artifact')).toEqual([madness('1', 'B', 'B')]);
  });

  test('the reminder text in parentheses is dropped (SYNTHETIC reminder)', () => {
    const parsed = readAll(`${MADNESS} (SYNTHETIC reminder text.)`, 'creature');
    expect(parsed.alternativeCosts).toEqual([madness('1', 'B', 'B')]);
    expect(parsed.lines).toEqual([MADNESS]);
  });
});

describe('keyword.foretell: "Foretell {4}{R}{R}" (CR 702.143a; backlog: 50 cards)', () => {
  test('the real line lowers to a foretell entry, not to an ability', () => {
    const parsed = readAll(FORETELL, 'sorcery');
    expect(parsed.alternativeCosts).toEqual([foretell('4', 'R', 'R')]);
    expect(parsed.abilities).toEqual([]);
  });

  test('on a spell with its text, in either order (SYNTHETIC spell text)', () => {
    const first = readAll(`${FORETELL}\nDraw a card.`, 'sorcery');
    expect(first.alternativeCosts).toEqual([foretell('4', 'R', 'R')]);
    const last = readAll(`Draw a card.\n${FORETELL}`, 'sorcery');
    expect(last.alternativeCosts).toEqual([foretell('4', 'R', 'R')]);
    expect(last.spell?.effect).toEqual(first.spell?.effect);
  });

  test.each([
    ['Foretell {1}{W}', ['1', 'W']],
    ['Foretell {U}', ['U']],
    ['foretell {2}{G}', ['2', 'G']],
  ])('"%s" (the cost is kept symbol by symbol; SYNTHETIC)', (text, symbols) => {
    expect(alternatives(text, 'instant')).toEqual([foretell(...symbols)]);
  });

  test('Madness and Foretell on one card are two entries of the face (SYNTHETIC; validateCard allows two kinds)', () => {
    const parsed = readAll(`${MADNESS}\n${FORETELL}`, 'creature');
    expect(parsed.alternativeCosts).toEqual([madness('1', 'B', 'B'), foretell('4', 'R', 'R')]);
  });
});

describe('effect.delayed-draw: "You draw a card at the beginning of the next turn\'s upkeep." (CR 603.7; backlog: 1 card, and 40 for the imperative form)', () => {
  test.each<'instant' | 'sorcery'>(['instant', 'sorcery'])(
    'the real line is the spell effect, a delayed trigger of the draw at each upkeep, on a %s',
    (type) => {
      expect(readAll(DELAYED, type).spell).toEqual({ effect: delayedDraw(1) });
    },
  );

  test('the real imperative line "Draw a card at the beginning of the next turn\'s upkeep." reads the same', () => {
    expect(readAll(DELAYED_IMPERATIVE, 'instant').spell).toEqual({ effect: delayedDraw(1) });
  });

  test('a number of cards is kept (SYNTHETIC line)', () => {
    expect(
      readAll("You draw two cards at the beginning of the next turn's upkeep.", 'sorcery').spell,
    ).toEqual({ effect: delayedDraw(2) });
  });

  test('the typographic apostrophe reads too (SYNTHETIC spelling of the real line)', () => {
    expect(
      readAll('You draw a card at the beginning of the next turn’s upkeep.', 'sorcery').spell,
    ).toEqual({ effect: delayedDraw(1) });
  });

  test('beside other instructions of the spell the line is one of the sequence (SYNTHETIC lines)', () => {
    expect(readAll(`Gain 2 life.\n${DELAYED_IMPERATIVE}`, 'sorcery').spell?.effect).toEqual({
      kind: 'sequence',
      effects: [{ kind: 'gainLife', player: { kind: 'you' }, amount: 2 }, delayedDraw(1)],
    });
  });

  test('under a triggered ability the grammar already reads, the same effect lowers (SYNTHETIC line)', () => {
    expect(
      readAll(`When ~ enters, ${DELAYED_IMPERATIVE.replace('Draw', 'draw')}`, 'creature').abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: delayedDraw(1),
      },
    ]);
  });

  test("the first sentence of Arcane Denial reads since stage P64 (D-217): the draw of the countered spell's controller, up to two cards (real text)", () => {
    const text = `Counter target spell. Its controller may draw up to two cards at the beginning of the next turn's upkeep.`;
    expect(read(text, 'instant').unparsed).toEqual([]);
    expect(read(text, 'instant').spell).not.toBeNull();
  });
});

describe('what stays unread (never half-executed)', () => {
  test.each([
    // Suspend.
    ['Suspend', 'no count and no cost'],
    ['Suspend 2', 'no cost'],
    ['Suspend {1}{B}', 'no count'],
    ['Suspend 2 {1}{B}', 'no dash'],
    ['Suspend 2-{1}{B}', 'a hyphen, not the dash of the Oracle text'],
    ['Suspend 0—{1}{B}', 'no time counters (the engine needs a positive count)'],
    ['Suspend X—{1}{B}', 'a count that is a variable'],
    ['Suspend two—{1}{B}', 'a count in words (the text writes digits)'],
    ['Suspend 2—{X}{B}', 'X in the cost'],
    ['Suspend 2—{W/U}', 'a hybrid symbol'],
    ['Suspend 2—Pay 2 life.', 'a cost that is not mana (the engine pays mana only)'],
    ['Suspend 2—Discard a card.', 'a cost that is not mana'],
    ['Suspend 2—{1}{B}.', 'a period the real line does not have'],
    ['Suspend 2—{1}{B}, flying', 'a keyword list'],
    ['Flying, suspend 2—{1}{B}', 'a keyword list'],
    ['Suspend 2—{1}{B}, suspend 1—{R}', 'a list of suspend costs'],
    ['Suspended 2—{1}{B}', 'another word'],
    // Madness.
    ['Madness', 'no cost'],
    ['Madness {X}{B}', 'X in the cost'],
    ['Madness {B/R}', 'a hybrid symbol'],
    ['Madness—Discard a card.', 'a cost that is not mana'],
    ['Madness—Pay 2 life.', 'a cost that is not mana'],
    ['Madness {1}{B}.', 'a period the real line does not have'],
    ['Madness {1}{B}, flying', 'a keyword list'],
    ['Madness {1}{B}, madness {R}', 'a list of madness costs'],
    ['Madnesses {1}{B}', 'another word'],
    // Foretell.
    ['Foretell', 'no cost'],
    ['Foretell {X}{R}', 'X in the cost'],
    ['Foretell {R/G}', 'a hybrid symbol'],
    ['Foretell—Pay 2 life.', 'a cost that is not mana'],
    ['Foretell—Sacrifice a creature.', 'a cost that is not mana'],
    ['Foretell {4}{R}{R}.', 'a period the real line does not have'],
    ['Foretell {4}{R}{R}, haste', 'a keyword list'],
    ['Flying, foretell {4}{R}{R}', 'a keyword list'],
    ['Foretell {4}{R}{R}, foretell {1}', 'a list of foretell costs'],
    ['Foretold {4}{R}{R}', 'another word'],
  ])('"%s" is not read (%s; SYNTHETIC)', (text) => {
    expect(dropped(text, 'creature')).toMatchObject({ reason: 'unrecognised' });
    expect(read(text, 'creature').abilities).toEqual([]);
    expect(read(text, 'creature').alternativeCosts).toEqual([]);
  });

  test.each([
    ["You draw X cards at the beginning of the next turn's upkeep.", 'a number that is not fixed'],
    ["You draw cards at the beginning of the next turn's upkeep.", 'no number'],
    ['You draw a card at the beginning of your next upkeep.', '"your next upkeep" is not read'],
    ['You draw a card at the beginning of the next upkeep.', 'no "turn\'s"'],
    ["You draw a card at the beginning of the next turn's end step.", 'another step'],
    ["You draw a card at the beginning of the next turn's draw step.", 'another step'],
    ['You draw a card at the beginning of the next turn.', 'no step'],
    ["You draw a card for each creature at the beginning of the next turn's upkeep.", 'a count'],
    [
      "You may draw a card at the beginning of the next turn's upkeep.",
      'a choice the engine does not give',
    ],
    ["Target player draws a card at the beginning of the next turn's upkeep.", 'another player'],
    ["Each opponent draws a card at the beginning of the next turn's upkeep.", 'another player'],
    [
      "Its controller draws a card at the beginning of the next turn's upkeep.",
      'a remembered player',
    ],
    ["You draw a card at the beginning of the next turn's upkeep and lose 1 life.", 'more words'],
    [
      "You gain 2 life at the beginning of the next turn's upkeep.",
      'a delayed effect that is not the draw',
    ],
    ["You draw a card at the beginning of the next turn's upkeep", 'no period'],
  ])('"%s" is not read (%s; SYNTHETIC line)', (text) => {
    expect(dropped(text, 'sorcery')).toMatchObject({ reason: 'unrecognised' });
    expect(read(text, 'sorcery').spell).toBeNull();
  });

  test('"Its controller may draw up to two cards ..." alone has no spell to name its controller: unbound', () => {
    const text =
      "Its controller may draw up to two cards at the beginning of the next turn's upkeep.";
    expect(dropped(text, 'instant')).toMatchObject({ reason: 'unboundReference' });
  });
});

describe('the support of a card with these lines (validateCard is the last gate, D-007)', () => {
  const card = (typeLine: string, oracleText: string, extra: object = {}) =>
    parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Later Card',
        typeLine,
        oracleText,
        manaCost: '{2}{B}',
        ...extra,
      }),
    );
  const bear = { typeLine: 'Creature — Bear', power: '2', toughness: '2' };

  test.each([
    ['Sorcery', `Draw a card.\n${SUSPEND}`, {}],
    ['Instant', `Draw a card.\n${SUSPEND}`, {}],
    ['Creature — Bear', SUSPEND, { power: '2', toughness: '2' }],
    ['Artifact', SUSPEND, {}],
    ['Creature — Bear', MADNESS, { power: '2', toughness: '2' }],
    ['Sorcery', `Draw a card.\n${MADNESS}`, {}],
    ['Creature — Bear', FORETELL, { power: '2', toughness: '2' }],
    ['Instant', `Draw a card.\n${FORETELL}`, {}],
    ['Sorcery', DELAYED, {}],
    ['Instant', DELAYED_IMPERATIVE, {}],
  ])('a SYNTHETIC %s with "%s" is supported', (typeLine, text, extra) => {
    const imported = card(typeLine, text, extra);
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.reasons).toEqual([]);
    expect(imported.support.status).toBe('supported');
  });

  test('a land with one of the keywords is unsupported: validateCard refuses it (SYNTHETIC)', () => {
    for (const text of [SUSPEND, MADNESS, FORETELL]) {
      const imported = card('Land', text, { manaCost: '' });
      expect(imported.support.unparsed, text).toEqual([]);
      expect(imported.support.status, text).toBe('unsupported');
      expect(imported.support.reasons.length, text).toBeGreaterThan(0);
    }
  });

  test('two suspend lines are unsupported: one suspend ability on a face (SYNTHETIC)', () => {
    const imported = card('Creature — Bear', `${SUSPEND}\nSuspend 1—{R}`, bear);
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.reasons.length).toBeGreaterThan(0);
  });

  test('two madness lines are unsupported: one alternative cost of a kind (SYNTHETIC)', () => {
    const imported = card('Creature — Bear', `${MADNESS}\nMadness {R}`, bear);
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.reasons.length).toBeGreaterThan(0);
  });

  test('a card with a line and one that is not read is unsupported, naming the unread one (SYNTHETIC)', () => {
    const imported = card('Sorcery', `${SUSPEND}\nSomething the grammar does not know.`);
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.unparsed.map((u) => u.text)).toEqual([
      'Something the grammar does not know.',
    ]);
  });

  test('Arcane Denial as printed is supported since stage P64 (D-217, real text)', () => {
    const imported = card(
      'Instant',
      "Counter target spell. Its controller may draw up to two cards at the beginning of the next turn's upkeep.",
      { manaCost: '{1}{U}{U}' },
    );
    expect(imported.support.status).toBe('supported');
    expect(imported.support.unparsed).toHaveLength(0);
  });

  test('a suspend cost with X or one that is not mana is unsupported (SYNTHETIC)', () => {
    expect(card('Sorcery', 'Suspend 2—{X}{B}').support.status).toBe('unsupported');
    expect(card('Sorcery', 'Suspend 2—Pay 2 life.').support.status).toBe('unsupported');
  });
});
