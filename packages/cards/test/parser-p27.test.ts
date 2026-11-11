// Stage P27 (M6): the copy slice of the engine (D-129, ENGINE_VERSION 27). The lines lowered to the engine's nodes:
// "Storm" (the keyword `storm`), "Replicate {2}" (the keyword `replicate` with its cost) and the copies of a spell,
// `copySpell`: "Copy target instant or sorcery spell. You may choose new targets for the copy." (a spell effect, the
// activated ability with "you control", the enters trigger) and "Whenever you cast a spell of the chosen type, copy
// that spell." (a cast trigger copying its subject). The real lines are those of reports/templates.json (and
// reports/backlog.md); every other line is SYNTHETIC, among them the near misses and the parenthesis standing for
// reminder text. That the engine runs what is lowered is in convert-grammar-engine-p27.test.ts; that a missing engine
// feature is named is in parser-p27-needs.test.ts.
import { describe, expect, test } from 'vitest';
import { parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';
import { dropped, type FaceType, read, readAll } from './parser-p5-helpers';

const STORM = 'Storm';
const REPLICATE = 'Replicate {2}';
const COPY = 'Copy target instant or sorcery spell. You may choose new targets for the copy.';
const COPY_YOURS =
  '{7}, {T}: Copy target instant or sorcery spell you control. You may choose new targets for the copy.';
const COPY_ENTERS =
  'When ~ enters, copy target instant or sorcery spell. You may choose new targets for the copy.';
const COPY_CAST = 'Whenever you cast a spell of the chosen type, copy that spell.';

const mana = (...symbols: string[]) => [{ kind: 'mana', symbols }] as const;
const replicate = (...symbols: string[]) => ({
  kind: 'keyword',
  keyword: { kind: 'replicate', cost: [...mana(...symbols)] },
});
const storm = { kind: 'keyword', keyword: { kind: 'storm' } };

const SPELLS = {
  kind: 'object',
  filter: {
    zone: 'stack',
    stackKind: 'spell',
    anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
  },
} as const;
const target = (extra: object = {}) => ({
  id: 't1',
  what: { ...SPELLS, filter: { ...SPELLS.filter, ...extra } },
});
const copy = (newTargets: 'may' | 'no') => ({
  kind: 'copySpell',
  spell: { kind: 'target', id: 't1' },
  newTargets,
});

describe('keyword.storm: "Storm" (CR 702.40a; backlog: 33 cards)', () => {
  test.each<FaceType>(['sorcery', 'instant', 'creature', 'artifact', 'enchantment'])(
    'the real line lowers to the keyword with no data on a %s',
    (type) => {
      expect(readAll(STORM, type).abilities).toEqual([storm]);
    },
  );

  test('it is a keyword ability, not an alternative cost or the spell text', () => {
    const parsed = readAll(STORM, 'sorcery');
    expect(parsed.alternativeCosts).toEqual([]);
    expect(parsed.spell).toBeNull();
  });

  test('beside the spell text of the card, in either order (SYNTHETIC spell text)', () => {
    const first = readAll(`${STORM}\nDraw a card.`, 'sorcery');
    expect(first.abilities).toEqual([storm]);
    expect(first.spell?.effect).toEqual({ kind: 'draw', player: { kind: 'you' }, count: 1 });
    const last = readAll('Draw a card.\nStorm', 'sorcery');
    expect(last.abilities).toEqual([storm]);
    expect(last.spell?.effect).toEqual(first.spell?.effect);
  });

  test('the lower-case spelling and the reminder text in parentheses (SYNTHETIC reminder)', () => {
    expect(readAll('storm', 'sorcery').abilities).toEqual([storm]);
    const parsed = readAll(`${STORM} (SYNTHETIC reminder text.)`, 'sorcery');
    expect(parsed.abilities).toEqual([storm]);
    expect(parsed.lines).toEqual([STORM]);
  });
});

describe('keyword.replicate: "Replicate {2}" (CR 702.56a; backlog: 16 cards)', () => {
  test.each<FaceType>(['sorcery', 'instant'])(
    'the real line lowers to the keyword with its mana cost on a %s',
    (type) => {
      expect(readAll(REPLICATE, type).abilities).toEqual([replicate('2')]);
    },
  );

  test.each([
    ['Replicate {U}', ['U']],
    ['Replicate {1}{R}', ['1', 'R']],
    ['replicate {3}{G}', ['3', 'G']],
    ['Replicate {0}', ['0']],
  ])('"%s" keeps the cost symbol by symbol (SYNTHETIC)', (text, symbols) => {
    expect(readAll(text, 'instant').abilities).toEqual([replicate(...symbols)]);
  });

  test('the reminder text in parentheses is dropped (SYNTHETIC reminder)', () => {
    const parsed = readAll(`${REPLICATE} (SYNTHETIC reminder text.)`, 'sorcery');
    expect(parsed.abilities).toEqual([replicate('2')]);
    expect(parsed.lines).toEqual([REPLICATE]);
  });

  test('beside the spell text, Kicker and Storm (SYNTHETIC lines)', () => {
    const parsed = readAll(`Kicker {1}\n${REPLICATE}\nStorm\nDraw a card.`, 'sorcery');
    expect(parsed.abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'kicker', cost: [...mana('1')] } },
      replicate('2'),
      storm,
    ]);
    expect(parsed.spell).not.toBeNull();
  });
});

describe('effect.copy-spell: "Copy target instant or sorcery spell. You may choose new targets for the copy." (CR 707.10, 707.10c; backlog: 6 cards)', () => {
  test.each<'instant' | 'sorcery'>(['instant', 'sorcery'])(
    'the real line is the spell: a target of the instant and sorcery spells on the stack and the copy with new targets, on a %s',
    (type) => {
      expect(readAll(COPY, type).spell).toEqual({
        targets: [target()],
        effect: copy('may'),
      });
    },
  );

  test('without the second sentence the copy has the targets of the original: newTargets "no" (SYNTHETIC)', () => {
    expect(readAll('Copy target instant or sorcery spell.', 'instant').spell).toEqual({
      targets: [target()],
      effect: copy('no'),
    });
  });

  test('another spell filter is kept as the words say it (SYNTHETIC)', () => {
    expect(readAll('Copy target spell. You may choose new targets for the copy.').spell).toEqual({
      targets: [
        { id: 't1', what: { kind: 'object', filter: { zone: 'stack', stackKind: 'spell' } } },
      ],
      effect: copy('may'),
    });
    expect(
      readAll('Copy target noncreature spell. You may choose new targets for the copy.').spell,
    ).toEqual({
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: { zone: 'stack', notTypes: ['creature'], stackKind: 'spell' },
          },
        },
      ],
      effect: copy('may'),
    });
  });

  test('the second sentence belongs to the first: no sentence of its own is left over (segmentation)', () => {
    const parsed = readAll(COPY, 'instant');
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.spell?.effect).toEqual(copy('may'));
  });

  test('"... spell you control" in an activated ability keeps the controller in the target slot (real line: Twinning Staff, Lithoform Engine)', () => {
    expect(readAll(COPY_YOURS, 'artifact').abilities).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['7'] }, { kind: 'tap' }],
        targets: [target({ controller: 'you' })],
        effect: copy('may'),
      },
    ]);
  });

  test('under an enters trigger (real line: Dualcaster Mage)', () => {
    expect(readAll(COPY_ENTERS, 'creature').abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        targets: [target()],
        effect: copy('may'),
      },
    ]);
  });

  test('beside another instruction of the spell the copy is one of the sequence (SYNTHETIC lines)', () => {
    expect(readAll(`${COPY}\nDraw a card.`, 'instant').spell?.effect).toEqual({
      kind: 'sequence',
      effects: [copy('may'), { kind: 'draw', player: { kind: 'you' }, count: 1 }],
    });
  });
});

describe('effect.copy-spell: "Whenever you cast a spell of the chosen type, copy that spell." (real line: Reflections of Littjara)', () => {
  test('a cast trigger of the chosen type whose effect copies the spell that caused it, with no new targets', () => {
    expect(readAll(COPY_CAST, 'enchantment').abilities).toEqual([
      {
        kind: 'triggered',
        trigger: {
          kind: 'castSpell',
          filter: { stackKind: 'spell', chosenType: true },
          by: 'you',
        },
        effect: { kind: 'copySpell', spell: { kind: 'triggerSubject' }, newTargets: 'no' },
      },
    ]);
  });

  test('with the second sentence the copy may get new targets (SYNTHETIC)', () => {
    const [ability] = readAll(
      'Whenever you cast an instant or sorcery spell, copy that spell. You may choose new targets for the copy.',
      'enchantment',
    ).abilities;
    expect(ability).toMatchObject({
      trigger: { kind: 'castSpell', by: 'you' },
      effect: { kind: 'copySpell', spell: { kind: 'triggerSubject' }, newTargets: 'may' },
    });
  });

  test('a creature spell of the chosen type is a spell for "that spell" (SYNTHETIC)', () => {
    const [ability] = readAll(
      'Whenever you cast a creature spell of the chosen type, copy that spell.',
      'enchantment',
    ).abilities;
    expect(ability).toMatchObject({
      trigger: { kind: 'castSpell', filter: { types: ['creature'], chosenType: true } },
      effect: { kind: 'copySpell', spell: { kind: 'triggerSubject' }, newTargets: 'no' },
    });
  });

  test('"that spell" after an event that is not a cast has nothing to point at (SYNTHETIC)', () => {
    expect(dropped('Whenever a creature enters, copy that spell.', 'enchantment')).toMatchObject({
      reason: 'unboundReference',
    });
    expect(dropped('Copy that spell.', 'instant')).toMatchObject({ reason: 'unboundReference' });
  });
});

describe('what stays unread (never half-executed)', () => {
  test.each([
    ['Storm 2', 'a number'],
    ['Storm {1}', 'a cost'],
    ['Storm.', 'a period the real line does not have'],
    ['Storm, flying', 'a keyword list'],
    ['Flying, storm', 'a keyword list'],
    ['Storm, storm', 'a list of storm'],
    ['Storms', 'another word'],
    ['Replicate', 'no cost'],
    ['Replicate {X}', 'X in the cost'],
    ['Replicate {X}{R}', 'X in the cost'],
    ['Replicate {R/G}', 'a hybrid symbol'],
    ['Replicate—Pay 2 life.', 'a cost that is not mana'],
    ['Replicate {2}.', 'a period the real line does not have'],
    ['Replicate {2}, haste', 'a keyword list'],
    ['Flying, replicate {2}', 'a keyword list'],
    ['Replicate {2}, replicate {1}', 'a list of replicate costs'],
    ['Replicates {2}', 'another word'],
  ])('"%s" is not read (%s; SYNTHETIC)', (text) => {
    expect(dropped(text, 'creature')).toMatchObject({ reason: 'unrecognised' });
    expect(read(text, 'creature').abilities).toEqual([]);
  });

  test.each([
    [
      "Copy target instant or sorcery spell, then return it to its owner's hand. You may choose new targets for the copy.",
      'the real line of 1 card: a second instruction on the card the copy came from',
    ],
    [
      'Copy target instant or sorcery spell and draw a card. You may choose new targets for the copy.',
      'a join the copy does not take (SYNTHETIC)',
    ],
    [
      'Copy target instant or sorcery spell. You may choose new targets for the copies.',
      'another wording of the second sentence (SYNTHETIC)',
    ],
    [
      'Copy target instant or sorcery spell. You may choose a new target for the copy.',
      'another wording of the second sentence (SYNTHETIC)',
    ],
    [
      'Copy target instant or sorcery spell. You may choose new targets for the copy and draw a card.',
      'more words on the second sentence (SYNTHETIC)',
    ],
    [
      'Copy target instant or sorcery spell you don’t control.',
      'a spell of another player (SYNTHETIC)',
    ],
    ['Copy target spell with mana value X or less.', 'a variable comparison (SYNTHETIC)'],
    ['Copy target instant or sorcery.', 'no "spell" (SYNTHETIC)'],
    ['Copy target creature.', 'not a spell (SYNTHETIC)'],
    ['Copy target spells.', 'a plural (SYNTHETIC)'],
    [
      'Copy target instant spell, sorcery spell, activated ability, or triggered ability. You may choose new targets for the copy.',
      'the real line of a planeswalker ability (1 card): copies of abilities are not built',
    ],
    [
      'Copy target triggered ability you control. You may choose new targets for the copy.',
      'copies of abilities are not built',
    ],
    ['Copy it. You may choose new targets for the copy.', 'a copy of what "it" is (SYNTHETIC)'],
    ['Copy this spell.', 'a copy of the source (SYNTHETIC)'],
    ['Copy that spell for each creature you control.', 'a count of copies (SYNTHETIC)'],
  ])('"%s" is not read (%s)', (text) => {
    expect(dropped(text, 'instant')).toMatchObject({ reason: expect.any(String) });
    expect(read(text, 'instant').spell).toBeNull();
  });

  test('"Whenever you cast or copy an instant or sorcery spell, ..." (6 cards) is read since stage P65 (D-218): the trigger sees the copy', () => {
    const text = 'Whenever you cast or copy an instant or sorcery spell, create a Treasure token.';
    expect(read(text, 'enchantment').unparsed).toEqual([]);
    expect(read(text, 'enchantment').abilities).toHaveLength(1);
  });

  test('"You may choose new targets for the copy." alone is not an effect (SYNTHETIC)', () => {
    expect(dropped('You may choose new targets for the copy.', 'instant')).toMatchObject({
      reason: 'unrecognised',
    });
  });
});

describe('the support of a card with these lines (validateCard is the last gate, D-007)', () => {
  const card = (typeLine: string, oracleText: string, extra: object = {}) =>
    parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Copy Card',
        typeLine,
        oracleText,
        manaCost: '{2}{R}',
        ...extra,
      }),
    );

  test.each([
    ['Sorcery', `Draw a card.\n${STORM}`, {}],
    ['Instant', `${STORM}\nDraw a card.`, {}],
    ['Creature — Bear', STORM, { power: '2', toughness: '2' }],
    ['Sorcery', `Draw a card.\n${REPLICATE}`, {}],
    ['Instant', `${REPLICATE}\nDestroy target creature.`, {}],
    ['Instant', COPY, {}],
    ['Sorcery', 'Copy target instant or sorcery spell.', {}],
    ['Artifact', COPY_YOURS, {}],
    ['Creature — Wizard', COPY_ENTERS, { power: '2', toughness: '2' }],
    ['Enchantment', `As ~ enters, choose a creature type.\n${COPY_CAST}`, {}],
  ])('a SYNTHETIC %s with "%s" is supported', (typeLine, text, extra) => {
    const imported = card(typeLine, text, extra);
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.reasons).toEqual([]);
    expect(imported.support.status).toBe('supported');
  });

  test('the chosen-type copy trigger needs a type chosen as the permanent enters: unsupported without it (SYNTHETIC)', () => {
    const imported = card('Enchantment', COPY_CAST);
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.reasons.length).toBeGreaterThan(0);
  });

  test('two replicate lines are unsupported: one replicate ability on a face (SYNTHETIC)', () => {
    const imported = card('Instant', `${REPLICATE}\nReplicate {R}\nDraw a card.`);
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.reasons.join('\n')).toContain('replicate');
  });

  test('a card with a line and one that is not read is unsupported, naming the unread one (SYNTHETIC)', () => {
    const imported = card('Sorcery', `${STORM}\nSomething the grammar does not know.`);
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.unparsed.map((u) => u.text)).toEqual([
      'Something the grammar does not know.',
    ]);
  });

  test('a copy that returns the spell to its owner stays unsupported, naming the whole line (real text)', () => {
    const imported = card(
      'Instant',
      "Copy target instant or sorcery spell, then return it to its owner's hand. You may choose new targets for the copy.",
    );
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.unparsed).toHaveLength(1);
  });
});
