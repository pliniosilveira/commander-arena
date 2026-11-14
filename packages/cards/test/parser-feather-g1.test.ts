// The Feather deck (issue 27), group 1 (D-450 to D-457): the real Oracle lines of Crimson Wisps, Gods Willing, Shelter, Might of the Meek, Legion Leadership, Fleeting Flight and Fists
// of Flame read through the whole pipeline, the nodes they lower to, SYNTHETIC siblings, the near misses the grammar must not read and the features the engine lacks (D-068). The
// engine runs what is lowered in convert-grammar-engine-feather-g1.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { dropped, END, read, readAll, spellEffect, withoutFeature } from './parser-p5-helpers';

const T1 = { kind: 'target', id: 't1' } as const;

describe('Crimson Wisps: "becomes red and gains haste until end of turn" (CR 613.1e, 613.1f)', () => {
  test('the real line: the color replaces the colors and haste is granted, to one target, for the turn', () => {
    expect(
      spellEffect('Target creature becomes red and gains haste until end of turn. Draw a card.'),
    ).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'setColors', objects: T1, colors: ['R'], duration: END },
        { kind: 'grantKeyword', objects: T1, keyword: { kind: 'haste' }, duration: END },
        { kind: 'draw', player: { kind: 'you' }, count: 1 },
      ],
    });
  });

  test('several keywords, and "colorless" (SYNTHETIC siblings)', () => {
    const effect = spellEffect(
      'Target creature becomes blue and gains flying and first strike until end of turn.',
    );
    expect(effect).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'setColors', colors: ['U'] },
        { kind: 'grantKeyword', keyword: { kind: 'flying' } },
        { kind: 'grantKeyword', keyword: { kind: 'firstStrike' } },
      ],
    });
    expect(
      spellEffect('Target creature becomes colorless and gains haste until end of turn.'),
    ).toMatchObject({ kind: 'sequence', effects: [{ kind: 'setColors', colors: [] }, {}] });
  });

  test.each([
    'Target creature becomes red and gains haste.',
    'Target creature becomes red and gains haste until your next turn.',
    'Target creature becomes red and gains flash until end of turn.',
    'Target creature becomes red and has haste until end of turn.',
    // a type that goes with keywords is another rule's (replacing it would also need the "in addition" of CR 205.1b)
    'Target creature becomes a Frog and gains haste until end of turn.',
    'Target creature becomes an artifact creature and gains haste until end of turn.',
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(read(text).unparsed.length).toBeGreaterThan(0);
  });
});

describe('Gods Willing and Shelter: "gains protection from the color of your choice until end of turn" (CR 702.16, 608.2d)', () => {
  test('the real line: a grant of a protection whose color is the controller’s choice, to a creature you control', () => {
    const parsed = readAll(
      'Target creature you control gains protection from the color of your choice until end of turn.\nDraw a card.',
    );
    expect(parsed.spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        {
          kind: 'grantKeyword',
          objects: T1,
          keyword: { kind: 'protection', from: 'colorOfChoice' },
          duration: END,
        },
        { kind: 'draw', player: { kind: 'you' }, count: 1 },
      ],
    });
    expect(parsed.spell?.targets?.[0]?.what).toMatchObject({
      kind: 'object',
      filter: { types: ['creature'], controller: 'you' },
    });
  });

  test('the same words with "Scry 1" read too (Gods Willing)', () => {
    expect(
      spellEffect(
        'Target creature you control gains protection from the color of your choice until end of turn.\nScry 1.',
      ),
    ).toMatchObject({ kind: 'sequence', effects: [{ kind: 'grantKeyword' }, { kind: 'scry' }] });
  });

  test('protection from named colors lowers to the same grant with the colors (SYNTHETIC)', () => {
    expect(spellEffect('Target creature gains protection from red until end of turn.')).toEqual({
      kind: 'grantKeyword',
      objects: T1,
      keyword: { kind: 'protection', from: 'color', colors: ['R'] },
      duration: END,
    });
    expect(
      spellEffect('Target creature gains protection from red and from blue until end of turn.'),
    ).toMatchObject({ keyword: { kind: 'protection', from: 'color', colors: ['R', 'U'] } });
  });

  test.each([
    'Target creature you control gains protection from the color of your choice.',
    'Target creature you control gains protection from the color of your choice until your next turn.',
    'Target creature you control gains protection from the colors of your choice until end of turn.',
    'Target creature gains protection from artifacts until end of turn.',
    'Target creature gains protection from the player of your choice until end of turn.',
    'Target creature gains flying and protection from red until end of turn.',
    'Creatures you control gain protection from the color of your choice until end of turn.',
    // a color word the engine's colors do not include
    'Target creature gains protection from purple until end of turn.',
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(read(text).unparsed.length).toBeGreaterThan(0);
  });

  test('it names the feature the engine lacks (D-068)', () => {
    const missing = withoutFeature(
      'keyword:protection',
      'Target creature you control gains protection from the color of your choice until end of turn.',
      'instant',
    );
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('keyword:protection');
  });
});

describe('Might of the Meek: "It also gets +1/+0 until end of turn if you control a Mouse." (CR 608.2c, 611.2a)', () => {
  test('the real text: trample for the target, then a pump of the same creature that runs only if you control a Mouse', () => {
    const effect = spellEffect(
      'Target creature gains trample until end of turn. It also gets +1/+0 until end of turn if you control a Mouse.\nDraw a card.',
    );
    expect(effect).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'grantKeyword', objects: T1, keyword: { kind: 'trample' }, duration: END },
        {
          kind: 'conditional',
          condition: { kind: 'controlsAtLeast', filter: { subtypes: ['Mouse'] } },
          effect: { kind: 'modifyPt', objects: T1, power: 1, toughness: 0, duration: END },
        },
        { kind: 'draw' },
      ],
    });
  });

  test('"also" is read for "gets" as it is for "gains" (SYNTHETIC)', () => {
    expect(
      spellEffect(
        'Target creature gains trample until end of turn. It also gets +2/+2 until end of turn.',
      ),
    ).toMatchObject({
      kind: 'sequence',
      effects: [{ kind: 'grantKeyword' }, { kind: 'modifyPt', power: 2, toughness: 2 }],
    });
  });

  test.each([
    'Target creature gains trample until end of turn. It also get +1/+0 until end of turn.',
    'Target creature gains trample until end of turn. It also gets +1/+0.',
    'Target creature gains trample until end of turn. It also gets +1/+0 until end of turn if you control a Mouse and a Rat.',
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(read(text).unparsed.length).toBeGreaterThan(0);
  });
});

describe('Legion Leadership: "Until end of turn, double target creature\'s power and it gains first strike." (CR 701.10)', () => {
  test('the real line: the power is doubled as the effect resolves and first strike is granted, to one target', () => {
    expect(
      spellEffect("Until end of turn, double target creature's power and it gains first strike."),
    ).toEqual({
      kind: 'sequence',
      effects: [
        {
          kind: 'modifyPt',
          objects: T1,
          power: { kind: 'affected', stat: 'power' },
          toughness: 0,
          duration: END,
        },
        { kind: 'grantKeyword', objects: T1, keyword: { kind: 'firstStrike' }, duration: END },
      ],
    });
  });

  test('the doubling alone, toughness alone and both (SYNTHETIC siblings)', () => {
    expect(spellEffect("Until end of turn, double target creature's power.")).toMatchObject({
      kind: 'modifyPt',
      power: { kind: 'affected', stat: 'power' },
      toughness: 0,
    });
    expect(spellEffect("Until end of turn, double target creature's toughness.")).toMatchObject({
      kind: 'modifyPt',
      power: 0,
      toughness: { kind: 'affected', stat: 'toughness' },
    });
    expect(
      spellEffect("Until end of turn, double target creature's power and toughness."),
    ).toMatchObject({
      kind: 'modifyPt',
      power: { kind: 'affected', stat: 'power' },
      toughness: { kind: 'affected', stat: 'toughness' },
    });
  });

  test.each([
    "Until end of turn, double target creature's power and it gains first strike until end of turn.",
    "Until your next turn, double target creature's power and it gains first strike.",
    "Until end of turn, double target creature's power and it gains flash.",
    "Until end of turn, double target creatures' power and they gain first strike.",
    "Until end of turn, double target creature's mana value and it gains first strike.",
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(read(text).unparsed.length).toBeGreaterThan(0);
  });
});

describe('Fleeting Flight: "Prevent all combat damage that would be dealt to it this turn." (CR 615)', () => {
  test('the real text: a counter, flying, and a shield for the combat damage dealt to the same creature', () => {
    expect(
      spellEffect(
        'Put a +1/+1 counter on target creature. It gains flying until end of turn. Prevent all combat damage that would be dealt to it this turn.',
      ),
    ).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'addCounters', objects: T1, counter: '+1/+1' },
        { kind: 'grantKeyword', objects: T1, keyword: { kind: 'flying' }, duration: END },
        { kind: 'preventDamage', scope: 'combat', amount: 'all', to: T1 },
      ],
    });
  });

  test.each([
    'Put a +1/+1 counter on target creature. Prevent all combat damage that would be dealt to it.',
    'Put a +1/+1 counter on target creature. Prevent all combat damage that would be dealt to them this turn.',
    'Prevent all combat damage that would be dealt to it this turn.',
  ])('is dropped when "it" has nothing to be (SYNTHETIC): %s', (text) => {
    expect(dropped(text)).toBeDefined();
  });
});

describe('Fists of Flame: "+1/+0 for each card you\'ve drawn this turn" (CR 121.1, 608.2h)', () => {
  test('the real text: draw, then a grant and a pump counted from the cards drawn this turn', () => {
    expect(
      spellEffect(
        "Draw a card. Until end of turn, target creature gains trample and gets +1/+0 for each card you've drawn this turn.",
      ),
    ).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'draw', player: { kind: 'you' }, count: 1 },
        { kind: 'grantKeyword', objects: T1, keyword: { kind: 'trample' }, duration: END },
        {
          kind: 'modifyPt',
          objects: T1,
          power: { kind: 'cardsDrawnThisTurn' },
          toughness: 0,
          duration: END,
        },
      ],
    });
  });

  test('the count after the duration, with "have", and the card draw it can count for (SYNTHETIC siblings)', () => {
    expect(
      spellEffect(
        'Target creature gets +1/+0 until end of turn for each card you have drawn this turn.',
      ),
    ).toMatchObject({ kind: 'modifyPt', power: { kind: 'cardsDrawnThisTurn' } });
    expect(
      spellEffect(
        "Until end of turn, target creature gets +2/+0 for each card you've drawn this turn.",
      ),
    ).toMatchObject({
      kind: 'modifyPt',
      power: { kind: 'times', factor: 2, of: { kind: 'cardsDrawnThisTurn' } },
    });
  });

  test.each([
    "Until end of turn, target creature gets +X/+0 for each card you've drawn this turn.",
    'Target creature gets +1/+0 until end of turn for each card an opponent has drawn this turn.',
    "Target creature gets +1/+0 until end of turn for each card you've drawn.",
    'Target creature gets +1/+0 until end of turn for each card you drew this turn.',
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(read(text).unparsed.length).toBeGreaterThan(0);
  });

  test('it names the feature the engine lacks (D-068)', () => {
    const missing = withoutFeature(
      'amount:cardsDrawnThisTurn',
      "Target creature gets +1/+0 until end of turn for each card you've drawn this turn.",
      'instant',
    );
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('amount:cardsDrawnThisTurn');
    expect(DECLARED_NEEDS).toContain('amount:cardsDrawnThisTurn');
  });
});
