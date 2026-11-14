// Stage P48 (D-204, D-205): the Vraska deck's text and token slice. The cards are the real cards of the owner's golden corpus (`fixtures/corpus/golden.jsonl`,
// real Oracle text, extracted with `pnpm corpus:extract`): the lessons of the Korvold program (Lobelia read at SYNTHETIC text and failed at the real one) are
// why the grammar is driven from these lines. The near misses are SYNTHETIC.
import { readFileSync } from 'node:fs';
import { validateCard } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { stripFlavorWord } from '../src/convert/parser/index';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { dropped, END, read, readAll, spellEffect, T1, THIS } from './parser-p5-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string) {
  const card = cards.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  return importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
}

describe('flavor words (CR 207.2d): taken off only when the line does not read as written', () => {
  test.each([
    [
      'Rage — Whenever ~ attacks, put a +1/+1 counter on it.',
      'Whenever ~ attacks, put a +1/+1 counter on it.',
    ],
    ['The Allagan Eye — Whenever ~ dies, draw a card.', 'Whenever ~ dies, draw a card.'],
    ['A Test of Your Reflexes! — When ~ enters, draw a card.', 'When ~ enters, draw a card.'],
    ['Gae Bolg — Equip {4}', 'Equip {4}'],
    [
      'Dance — At the beginning of your end step, draw a card.',
      'At the beginning of your end step, draw a card.',
    ],
    ["Who's Next? — Draw a card.", 'Draw a card.'],
    ["Mog-Mog's Bane — Draw a card.", 'Draw a card.'],
  ])('%s', (line, rest) => {
    expect(stripFlavorWord(line)).toBe(rest);
  });

  test.each([
    // The head of a mode list, a chapter, a mode bullet.
    'Choose one — • Draw a card.',
    'Choose one or more —',
    'Choose two —',
    'I — Draw a card.',
    'II — Draw a card.',
    'IV — Draw a card.',
    'I, II — Draw a card.',
    'I, II, III, IV — Exile up to one target creature or land you control.',
    '• Rage — Draw a card.',
    '+ {1}{R} — Draw a card.',
    // Keyword forms written without spaces around the dash.
    'Escape—{R}{R}, Exile three other cards from your graveyard.',
    'Ward—Pay 3 life.',
    'Equip—Pay 3 life.',
    'Cycling—Discard a land card.',
    // Keywords and words with rules meaning that are written with spaces.
    'Boast — {1}: Draw a card.',
    'Forecast — {1}{W}, Reveal this card from your hand: Draw a card.',
    'Companion — Each creature card in your starting deck has a different name.',
    'Solved — Draw a card.',
    'Level 2 — Draw a card.',
    // Not a label.
    'Draw a card — then discard a card.',
    'Rage — whenever ~ attacks, draw a card.',
    'Rage — 3 damage.',
    'rage — Draw a card.',
    'Rage - Draw a card.',
    'Rage— Draw a card.',
    'Rage —Draw a card.',
    'Rage — ',
    'Draw a card. Rage — Draw a card.',
    '~ — Draw a card.',
    '{T}: Draw a card.',
    'Rage, Fury — Draw a card.',
    'Rage: Fury — Draw a card.',
    'Round 2 — Draw a card.',
    'One Two Three Four Five Six Seven — Draw a card.',
  ])('is left as it is: %s', (line) => {
    expect(stripFlavorWord(line)).toBe(line);
  });

  test('a line that reads as written is never changed: the ability words of CR 207.2c and a label that is part of what reads', () => {
    // "Landfall — " is an ability word (CR 207.2c), taken off by the normalization as before.
    expect(
      readAll('Landfall — Whenever a land you control enters, you gain 1 life.', 'creature')
        .abilities,
    ).toHaveLength(1);
    // A line the grammar reads whole with a capital word and a dash inside is not retried without it.
    const lines = read('Gae Bolg — Equip {4}', 'artifact', ['Equipment']);
    expect(lines.unparsed).toEqual([]);
  });

  test('a label that is stripped and still does not read leaves the diagnostic of the line without it, under the text as written', () => {
    const d = dropped('Rage — Whenever ~ attacks, frobnicate.', 'creature');
    expect(d.text).toBe('Rage — Whenever ~ attacks, frobnicate.');
    expect(d.closestRule).not.toBe('none');
    expect(d.stoppedAt).toContain('frobnicate');
  });

  test('a labelled line that reads only without the label is read, and its ability is the one of the line without it', () => {
    const labelled = readAll('Rage — Whenever ~ attacks, put a +1/+1 counter on it.', 'creature');
    const bare = readAll('Whenever ~ attacks, put a +1/+1 counter on it.', 'creature');
    expect(labelled.abilities).toEqual(bare.abilities);
  });

  test('the real labelled lines read: Gau, Gae Bolg and the Allagan Eye reach the rules that need no other slice', () => {
    // Stage P49 (D-206) built what followed the labels of these four: they read completely and are played in `convert-grammar-engine-p49.test.ts`.
    for (const name of ['Gau, Feral Youth', "Dragoon's Lance", "G'raha Tia", 'Magitek Scythe']) {
      expect(real(name).support.unparsed, name).toEqual([]);
      expect(real(name).support.status, name).toBe('supported');
    }
    // Stage P52 (D-210) built what followed the label of Mog: it reads completely and is played in `convert-grammar-engine-p51.test.ts`.
    expect(real('Mog, Moogle Warrior').support.status).toBe('supported');
  });
});

describe('"That token gains haste until end of turn" and "then attach ~ to it": the token the text made (CR 111.2, 400.7j)', () => {
  const grantHaste = {
    kind: 'grantKeyword',
    objects: { kind: 'moved' },
    keyword: { kind: 'haste' },
    duration: END,
  };

  test('Loyal Apprentice: the one token, then its haste', () => {
    const imported = real('Loyal Apprentice');
    expect(imported.support.status).toBe('supported');
    const lieutenant = imported.definition.faces[0]?.abilities.find((a) => a.kind === 'triggered');
    expect(lieutenant).toMatchObject({
      kind: 'triggered',
      effect: { kind: 'sequence', effects: [{ kind: 'createToken', count: 1 }, grantHaste] },
    });
    expect(validateCard(imported.definition)).toEqual([]);
  });

  test('a SYNTHETIC token with a quoted ability keeps it: the sentence after it is the haste, not an ability of the token', () => {
    const effect = spellEffect(
      'Create a 2/2 red Dwarf creature token. That token gains haste until end of turn.',
      'sorcery',
    );
    expect(effect).toMatchObject({
      kind: 'sequence',
      effects: [{ kind: 'createToken' }, grantHaste],
    });
  });

  test('"that token" after two tokens, after a copy and with no token before it is not read', () => {
    expect(
      dropped(
        'Create two 2/2 red Dwarf creature tokens. That token gains haste until end of turn.',
        'sorcery',
      ),
    ).toMatchObject({ reason: 'unboundReference' });
    expect(
      dropped(
        "Create a token that's a copy of target creature. That token gains haste until end of turn.",
        'sorcery',
      ),
    ).toMatchObject({ reason: 'unboundReference' });
    expect(
      dropped('Draw a card. That token gains haste until end of turn.', 'sorcery'),
    ).toMatchObject({
      reason: 'unboundReference',
    });
    expect(
      dropped(
        'Create a 2/2 red Dwarf creature token. That creature gains haste until end of turn.',
        'sorcery',
      ),
    ).toMatchObject({ reason: 'unboundReference' });
  });

  test('"that token" is the token only until another instruction moves or makes objects', () => {
    expect(
      dropped(
        'Create a 2/2 red Dwarf creature token. Exile target creature. That token gains haste until end of turn.',
        'sorcery',
      ),
    ).toBeDefined();
    // "That token" is the last one made: the engine's `moved` is what the last `createToken` made.
    expect(
      spellEffect(
        'Create a 2/2 red Dwarf creature token. Create a 1/1 white Soldier creature token. That token gains haste until end of turn.',
        'sorcery',
      ),
    ).toMatchObject({
      kind: 'sequence',
      effects: [{ kind: 'createToken' }, { kind: 'createToken' }, grantHaste],
    });
  });

  test('Dwarven Shortsword: a Dwarf token, then the Equipment attached to it', () => {
    const imported = real('Dwarven Shortsword');
    expect(imported.support.status).toBe('supported');
    const enters = imported.definition.faces[0]?.abilities.find((a) => a.kind === 'triggered');
    expect(enters).toMatchObject({
      kind: 'triggered',
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'createToken', count: 1 },
          { kind: 'attach', object: THIS, to: { kind: 'moved' } },
        ],
      },
    });
    expect(validateCard(imported.definition)).toEqual([]);
  });

  test('"attach ~ to it" with no token before it, and "attach it to it" are not read', () => {
    expect(dropped('When ~ enters, attach ~ to it.', 'artifact', ['Equipment'])).toMatchObject({
      reason: 'unboundReference',
    });
    expect(
      dropped(
        'When ~ enters, create two 2/2 red Dwarf creature tokens, then attach ~ to it.',
        'artifact',
        ['Equipment'],
      ),
    ).toMatchObject({ reason: 'unboundReference' });
  });
});

describe('Mirkwood Meditator: "you may have ~\'s base power and toughness become 4/2 until end of turn" (CR 613.4b)', () => {
  test('the real card reads: a may, a base power and toughness of this creature until end of turn', () => {
    const imported = real('Mirkwood Meditator');
    expect(imported.support.status).toBe('supported');
    const landfall = imported.definition.faces[0]?.abilities.find((a) => a.kind === 'triggered');
    expect(landfall).toMatchObject({
      kind: 'triggered',
      // "You may" is the ability's own (D-060).
      optional: true,
      effect: { kind: 'setPt', objects: THIS, power: 4, toughness: 2, duration: END },
    });
  });

  test('without "~\'s", with a change instead of a number, or for another creature it is not read', () => {
    for (const text of [
      'Whenever a land you control enters, you may have ~ become 4/2 until end of turn.',
      "Whenever a land you control enters, you may have ~'s base power and toughness become +4/+2 until end of turn.",
      "Whenever a land you control enters, you may have target creature's base power and toughness become 4/2 until end of turn.",
    ]) {
      expect(dropped(text, 'creature'), text).toBeDefined();
    }
  });
});

describe('Mind Transfer Protocol: "becomes an artifact creature with base power and toughness 4/5" (CR 205.1b, 613.4b)', () => {
  test('the real card: types that add and a base power and toughness, until end of turn, on one target', () => {
    const imported = real('Mind Transfer Protocol');
    expect(imported.support.status).toBe('supported');
    const effects = imported.definition.faces[0]?.spell?.effect;
    expect(effects).toMatchObject({
      kind: 'sequence',
      effects: [
        {
          kind: 'setTypes',
          objects: T1,
          types: ['artifact', 'creature'],
          additive: true,
          duration: END,
        },
        { kind: 'setPt', objects: T1, power: 4, toughness: 5, duration: END },
        { kind: 'draw' },
      ],
    });
    expect(validateCard(imported.definition)).toEqual([]);
  });

  test('the same on the other word order, and on a creature that is no artifact', () => {
    expect(
      spellEffect(
        'Target creature becomes an artifact creature with base power and toughness 2/2 until end of turn.',
      ),
    ).toMatchObject({ kind: 'sequence' });
  });
});

describe('Refute Destiny: "target creature or planeswalker that\'s green or blue" (CR 105.2, 115.1)', () => {
  test('the real card: a choice of the two types, each with one of the two colors', () => {
    const imported = real('Refute Destiny');
    expect(imported.support.status).toBe('supported');
    expect(imported.definition.faces[0]?.spell?.targets).toMatchObject([
      {
        id: 't1',
        what: {
          kind: 'object',
          filter: {
            anyOf: [
              { types: ['creature'], colors: ['G'] },
              { types: ['creature'], colors: ['U'] },
              { types: ['planeswalker'], colors: ['G'] },
              { types: ['planeswalker'], colors: ['U'] },
            ],
          },
        },
      },
    ]);
  });

  test('colors are read by their letters: green is G, blue is U', () => {
    const targets = readAll("Exile target creature that's green or blue.", 'sorcery').spell
      ?.targets;
    expect(targets).toMatchObject([
      {
        what: {
          filter: { types: ['creature'], anyOf: [{ colors: ['G'] }, { colors: ['U'] }] },
        },
      },
    ]);
  });

  test('three colors and the shapes that are not read', () => {
    readAll("Exile target creature that's white, blue, or black.", 'sorcery');
    for (const text of [
      "Exile target creature that's green.",
      "Exile target green creature that's blue or red.",
      "Exile target creatures that's green or blue.",
      "Exile target creature that's green and blue.",
      "Exile target creature that's green or green.",
    ]) {
      expect(dropped(text, 'sorcery'), text).toBeDefined();
    }
  });
});

describe('Homesickness: "Put a stun counter on each of them" (CR 122.1d, 608.2c)', () => {
  test('the real card: draw, tap up to two targets, a stun counter on those targets', () => {
    const imported = real('Homesickness');
    expect(imported.support.status).toBe('supported');
    expect(imported.definition.faces[0]?.spell?.effect).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'draw', count: 2 },
        { kind: 'tap', objects: { kind: 'target', id: 't2' } },
        { kind: 'addCounters', objects: { kind: 'target', id: 't2' }, counter: 'stun', count: 1 },
      ],
    });
    expect(imported.definition.faces[0]?.spell?.targets).toMatchObject([
      { id: 't1' },
      { id: 't2', min: 0, max: 2 },
    ]);
  });

  test('"each of them" needs several objects before it: after a single target it is read as the one of them is unbound or plural', () => {
    // A pronoun is bound to the most recent plural noun; without one it is an unbound reference.
    expect(dropped('Draw a card. Put a stun counter on each of them.', 'sorcery')).toMatchObject({
      reason: 'unboundReference',
    });
  });
});

describe('Flaring Cinder: "When ~ enters and whenever you cast a spell with mana value 4 or greater" (CR 603.2c)', () => {
  test('the real card: two triggered abilities that share one effect', () => {
    const imported = real('Flaring Cinder');
    expect(imported.support.status).toBe('supported');
    const triggered = (imported.definition.faces[0]?.abilities ?? []).filter(
      (a) => a.kind === 'triggered',
    );
    expect(triggered).toHaveLength(2);
    expect(triggered[0]).toMatchObject({ trigger: { kind: 'entersBattlefield', what: THIS } });
    expect(triggered[1]).toMatchObject({ trigger: { kind: 'castSpell' } });
    expect(
      triggered[0]?.kind === 'triggered' &&
        triggered[1]?.kind === 'triggered' &&
        triggered[0].effect,
    ).toEqual(triggered[1]?.kind === 'triggered' && triggered[1].effect);
  });

  test('"~ enters, and whenever", another subject and a third event are not read', () => {
    for (const text of [
      'When ~ enters, and whenever you cast a spell, draw a card.',
      'When another creature enters and whenever you cast a spell, draw a card.',
      'When ~ enters and whenever you cast a spell and whenever you draw a card, draw a card.',
      'When ~ enters and when you cast a spell, draw a card.',
    ]) {
      expect(dropped(text, 'creature'), text).toBeDefined();
    }
  });
});

describe('Roll-Roll-Roll-Roll: "If you do, return it to the battlefield under its owner\'s control at the beginning of the next end step" (CR 603.7)', () => {
  test('the real Saga: chapters I to IV exile up to one target and, if it did, a delayed return of that card', () => {
    const imported = real('Roll-Roll-Roll-Roll');
    expect(imported.support.status).toBe('supported');
    expect(imported.definition.layout).toBe('saga');
    const chapter = imported.definition.faces[0]?.abilities.find((a) => a.kind === 'triggered');
    expect(chapter).toMatchObject({
      trigger: { kind: 'chapter', from: 1, to: 4 },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'exile', objects: T1 },
          {
            kind: 'conditional',
            condition: { kind: 'didPrevious' },
            effect: {
              kind: 'delayedTrigger',
              at: { step: 'endStep', whose: 'each' },
              effect: {
                kind: 'moveToZone',
                objects: { kind: 'moved' },
                to: 'battlefield',
                controller: 'owner',
              },
            },
          },
        ],
      },
    });
    expect(validateCard(imported.definition)).toEqual([]);
  });

  test('only an exile of a target of the same text, the next end step and a stated control are read', () => {
    for (const text of [
      "Destroy target creature. If you do, return it to the battlefield under its owner's control at the beginning of the next end step.",
      "Tap target creature. Return it to the battlefield under its owner's control at the beginning of the next end step.",
      "Exile target creature. Return it to the battlefield under its owner's control at the beginning of your next end step.",
      'Exile target creature. Return it to the battlefield at the beginning of the next end step.',
    ]) {
      expect(dropped(text, 'sorcery'), text).toBeDefined();
    }
  });
});
