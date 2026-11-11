// Stage P5 (D-063, D-083), part 1: keyword gains and pumps on spells and abilities, the Turn to Frog
// shape (lose all abilities, becomes a Frog, base power and toughness), and the flicker sentence.
// Each line is read through the whole pipeline and compared with the AST of the engine's
// SYNTHETIC fixtures (cards/fixtures/synthetic-layers.ts) or with a node written out here. Lines
// come from the backlog (reports/backlog.md and templates.json, counts as printed, parser version
// 4) or say SYNTHETIC. Giant Growth, Turn to Frog and Cloudshift are real cards whose texts here
// come from memory or from the backlog and are UNVERIFIED against Scryfall: nothing here marks a
// real card supported.
import type { Effect } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { compileLine } from '../src/convert/parser/index';
import {
  CREATURE_TARGET,
  dropped,
  END,
  fixture,
  grant,
  MY_CREATURES,
  pump,
  read,
  readAll,
  SET,
  spellEffect,
  T1,
  THIS,
} from './parser-p5-helpers';

describe('keyword gains on a spell: "Target creature gains flying until end of turn." (CR 613.1f)', () => {
  test('equals SYNTHETIC Gust of Wings', () => {
    const parsed = readAll('Target creature gains flying until end of turn.');
    const expected = fixture('SYNTHETIC Gust of Wings');
    expect(parsed.spell).toEqual(expected.spell);
    expect(parsed.abilities).toEqual([]);
  });

  test('the pump is unchanged: SYNTHETIC Growth Spurt', () => {
    expect(readAll('Target creature gets +3/+3 until end of turn.').spell).toEqual(
      fixture('SYNTHETIC Growth Spurt').spell,
    );
  });

  test.each([
    'flying',
    'trample',
    'haste',
    'vigilance',
    'lifelink',
    'deathtouch',
    'menace',
    'reach',
    'hexproof',
    'shroud',
    'indestructible',
    'defender',
  ])('"gains %s" is a grantKeyword', (word) => {
    expect(spellEffect(`Target creature gains ${word} until end of turn.`)).toEqual(grant(word));
  });

  test('two-word keywords use the AST spelling', () => {
    expect(spellEffect('Target creature gains first strike until end of turn.')).toEqual(
      grant('firstStrike'),
    );
    expect(spellEffect('Target creature gains double strike until end of turn.')).toEqual(
      grant('doubleStrike'),
    );
  });

  test('"gets +2/+2 and gains first strike" is a sequence of modifyPt and grantKeyword (D-083)', () => {
    const parsed = readAll('Target creature gets +2/+2 and gains first strike until end of turn.');
    expect(parsed.spell).toEqual({
      targets: [CREATURE_TARGET],
      effect: { kind: 'sequence', effects: [pump(2, 2), grant('firstStrike')] },
    });
  });

  test('the backlog shape "Target creature gets +N/+N and gains trample" (22 cards)', () => {
    expect(spellEffect('Target creature gets +3/+1 and gains trample until end of turn.')).toEqual({
      kind: 'sequence',
      effects: [pump(3, 1), grant('trample')],
    });
  });

  test('two keywords are two grantKeyword nodes, in text order', () => {
    expect(spellEffect('Target creature gains flying and first strike until end of turn.')).toEqual(
      {
        kind: 'sequence',
        effects: [grant('flying'), grant('firstStrike')],
      },
    );
    expect(
      spellEffect('Target creature gains flying, first strike, and vigilance until end of turn.'),
    ).toEqual({
      kind: 'sequence',
      effects: [grant('flying'), grant('firstStrike'), grant('vigilance')],
    });
  });

  test('a pump with two keywords: the same target and duration on every node', () => {
    expect(
      spellEffect('Target creature gets +1/+1 and gains flying and lifelink until end of turn.'),
    ).toEqual({
      kind: 'sequence',
      effects: [pump(1, 1), grant('flying'), grant('lifelink')],
    });
  });

  test('a target you control keeps its filter', () => {
    const parsed = readAll('Target creature you control gains hexproof until end of turn.');
    expect(parsed.spell?.targets).toEqual([
      {
        id: 't1',
        what: {
          kind: 'object',
          filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
        },
      },
    ]);
    expect(parsed.spell?.effect).toEqual(grant('hexproof'));
  });

  test('a group: "Creatures you control gain trample until end of turn."', () => {
    expect(spellEffect('Creatures you control gain trample until end of turn.')).toEqual(
      grant('trample', MY_CREATURES),
    );
  });

  test('the backlog shape "Creatures you control gain indestructible" (2 cards)', () => {
    expect(spellEffect('Creatures you control gain indestructible until end of turn.')).toEqual(
      grant('indestructible', MY_CREATURES),
    );
  });

  test('a group with several keywords and any permanent: "Permanents you control gain hexproof and indestructible"', () => {
    const everything = {
      kind: 'each',
      filter: { zone: 'battlefield', controller: 'you' },
    } as const;
    expect(
      spellEffect('Permanents you control gain hexproof and indestructible until end of turn.'),
    ).toEqual({
      kind: 'sequence',
      effects: [grant('hexproof', everything), grant('indestructible', everything)],
    });
  });

  test('a group pump with a keyword: "Creatures you control get +1/+1 and gain haste"', () => {
    expect(
      spellEffect('Creatures you control get +1/+1 and gain haste until end of turn.'),
    ).toEqual({
      kind: 'sequence',
      effects: [pump(1, 1, MY_CREATURES), grant('haste', MY_CREATURES)],
    });
  });

  test('"each creature" is not a subject of the group rule: `effect.gain-keyword-each` reads it (stage P29)', () => {
    expect(spellEffect('Each creature gains flying until end of turn.')).toEqual(
      grant('flying', { kind: 'each', filter: { zone: 'battlefield', types: ['creature'] } }),
    );
    expect(dropped('Each creature gain flying until end of turn.')).toMatchObject({
      reason: 'unrecognised',
    });
  });

  test('lowers with the features of the effect and its duration', () => {
    const r = compileLine('Target creature gets +1/+1 and gains flying until end of turn.', {
      rules: SET,
      face: 'spell',
    });
    expect(r).toMatchObject({ ok: true, kind: 'spell' });
    if (r.ok && r.kind === 'spell') {
      expect(r.parts.targets).toEqual([CREATURE_TARGET]);
      expect(r.parts.effects.map((e) => e.kind)).toEqual(['modifyPt', 'grantKeyword']);
    }
  });
});

describe('keyword gains in abilities: "{M}: ~ gains flying until end of turn."', () => {
  test('an activated ability on the source (31 cards in the backlog)', () => {
    expect(readAll('{1}: ~ gains flying until end of turn.', 'creature').abilities).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['1'] }],
        effect: grant('flying', THIS),
      },
    ]);
  });

  test.each([
    ['{2}: ~ gains deathtouch until end of turn.', 'deathtouch', '2'],
    ['{R}: ~ gains first strike until end of turn.', 'firstStrike', 'R'],
  ] as const)('%s', (text, keyword, symbol) => {
    expect(readAll(text, 'creature').abilities).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: [symbol] }],
        effect: grant(keyword, THIS),
      },
    ]);
  });

  test('a group in an activated ability: "{M}: Creatures you control gain lifelink"', () => {
    expect(
      readAll('{3}{B}{B}: Creatures you control gain lifelink until end of turn.', 'creature')
        .abilities,
    ).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['3', 'B', 'B'] }],
        effect: grant('lifelink', MY_CREATURES),
      },
    ]);
  });

  test('a target in an activated ability keeps its declaration', () => {
    const [ability] = readAll(
      '{G}, {T}: Target creature gets +1/+1 and gains trample until end of turn.',
      'creature',
    ).abilities;
    expect(ability).toMatchObject({
      kind: 'activated',
      targets: [CREATURE_TARGET],
      effect: { kind: 'sequence', effects: [pump(1, 1), grant('trample')] },
    });
  });

  test('in a triggered ability on the source', () => {
    expect(
      readAll('Whenever ~ attacks, ~ gains lifelink until end of turn.', 'creature').abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { kind: 'this' } },
        effect: grant('lifelink', THIS),
      },
    ]);
  });
});

describe('what a gain does not read', () => {
  test.each([
    // No duration: a keyword gain with none would last for ever (CR 611.2a), a different effect.
    ['Target creature gains flying.', '.'],
    ['Target creature gains flying until your next turn.', 'until your next turn.'],
    // A list written the wrong way fails at the wrong separator (Oracle: "A, B, and C").
    [
      'Target creature gains flying, first strike and vigilance until end of turn.',
      'vigilance until end of turn.',
    ],
    ['Target creature gains flying and flying until end of turn.', 'until end of turn.'],
    ['Target creatures gain flying until end of turn.', 'creatures gain flying until end of turn.'],
  ] as const)('%s', (text, stoppedAt) => {
    expect(dropped(text)).toMatchObject({ reason: 'unrecognised', stoppedAt });
  });

  test('a keyword with a parameter is unread: protection, ward, landwalk', () => {
    expect(dropped('Target creature gains protection from red until end of turn.')).toMatchObject({
      reason: 'unrecognised',
    });
    expect(dropped('Target creature gains ward {2} until end of turn.')).toMatchObject({
      reason: 'unrecognised',
    });
  });

  test('"gains flash" is unread: flash does nothing on the battlefield, and the engine excludes it', () => {
    expect(dropped('Target creature gains flash until end of turn.')).toMatchObject({
      reason: 'unrecognised',
      stoppedAt: 'flash until end of turn.',
    });
  });

  test('"gains prowess" is read since D-149: the engine expands a granted prowess into its triggered ability', () => {
    // Every instance of prowess is its own triggered ability (CR 702.108b), so a granted one adds its ability to the creature
    // (`applyAbilityLayer`); the engine now lists prowess among the grantable keywords.
    expect(spellEffect('Target creature gains prowess until end of turn.')).toEqual(
      grant('prowess'),
    );
  });

  test('"storm" and other keywords the engine lacks are unread', () => {
    // Fear, intimidate and shadow were here until the engine learned them (D-094, stage P11), skulk until
    // stage P21 (D-120). The engine has no Storm (D-118).
    expect(dropped('Target creature gains storm until end of turn.')).toMatchObject({
      reason: 'unrecognised',
      stoppedAt: 'storm until end of turn.',
    });
  });

  test('"where X is ..." after a pump is read since stage P28: X is the amount the text defines, in both clauses', () => {
    const effect = spellEffect(
      'Target creature you control gets +X/+X and gains hexproof until end of turn, where X is the number of creatures you control.',
    );
    const count = { kind: 'countOf', filter: { types: ['creature'], controller: 'you' } };
    expect(effect).toMatchObject({
      kind: 'sequence',
      effects: [{ kind: 'modifyPt', power: count, toughness: count }, { kind: 'grantKeyword' }],
    });
  });

  test('a granted ability in quotes is not a keyword gain', () => {
    expect(
      dropped('Target creature gains "When this creature dies, draw a card." until end of turn.'),
    ).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('Turn to Frog: "loses all abilities and becomes a blue Frog" (CR 613.1d-f, 205.1a, 105.3)', () => {
  const FROG =
    'Target creature loses all abilities and becomes a blue Frog with base power and toughness 1/1 until end of turn.';

  test('equals SYNTHETIC Frog Hex, node for node', () => {
    const parsed = readAll(FROG);
    expect(parsed.spell).toEqual(fixture('SYNTHETIC Frog Hex').spell);
  });

  test('the nodes, written out: lose, types, colors, base power and toughness, all until end of turn', () => {
    expect(spellEffect(FROG)).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'loseAllAbilities', objects: T1, duration: END },
        { kind: 'setTypes', objects: T1, subtypes: ['Frog'], duration: END },
        { kind: 'setColors', objects: T1, colors: ['U'], duration: END },
        { kind: 'setPt', objects: T1, power: 1, toughness: 1, duration: END },
      ],
    });
  });

  test('only "loses all abilities until end of turn"', () => {
    expect(spellEffect('Target creature loses all abilities until end of turn.')).toEqual({
      kind: 'loseAllAbilities',
      objects: T1,
      duration: END,
    });
  });

  test('only "becomes a blue Frog" with no abilities lost', () => {
    expect(spellEffect('Target creature becomes a blue Frog until end of turn.')).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'setTypes', objects: T1, subtypes: ['Frog'], duration: END },
        { kind: 'setColors', objects: T1, colors: ['U'], duration: END },
      ],
    });
  });

  test('a type with no color and base power and toughness', () => {
    expect(
      spellEffect(
        'Target creature becomes a Frog with base power and toughness 0/1 until end of turn.',
      ),
    ).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'setTypes', objects: T1, subtypes: ['Frog'], duration: END },
        { kind: 'setPt', objects: T1, power: 0, toughness: 1, duration: END },
      ],
    });
  });

  test('"an" before a vowel, and several creature types', () => {
    expect(spellEffect('Target creature becomes an Elk Wizard until end of turn.')).toEqual({
      kind: 'setTypes',
      objects: T1,
      subtypes: ['Elk', 'Wizard'],
      duration: END,
    });
  });

  test('a color alone, and colorless (CR 105.3)', () => {
    expect(spellEffect('Target creature becomes red until end of turn.')).toEqual({
      kind: 'setColors',
      objects: T1,
      colors: ['R'],
      duration: END,
    });
    expect(spellEffect('Target creature becomes colorless until end of turn.')).toEqual({
      kind: 'setColors',
      objects: T1,
      colors: [],
      duration: END,
    });
  });

  test('base power and toughness alone: "has base power and toughness 4/4"', () => {
    expect(
      spellEffect('Target creature has base power and toughness 4/4 until end of turn.'),
    ).toEqual({ kind: 'setPt', objects: T1, power: 4, toughness: 4, duration: END });
  });

  test('loses all abilities and has base power and toughness is not one phrase', () => {
    expect(
      dropped(
        'Target creature loses all abilities and has base power and toughness 1/1 until end of turn.',
      ),
    ).toMatchObject({ reason: 'unrecognised' });
  });

  test('in an activated ability on the source: "~ becomes a blue Frog"', () => {
    expect(readAll('{U}: ~ becomes a blue Frog until end of turn.', 'creature').abilities).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['U'] }],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'setTypes', objects: THIS, subtypes: ['Frog'], duration: END },
            { kind: 'setColors', objects: THIS, colors: ['U'], duration: END },
          ],
        },
      },
    ]);
  });

  test.each([
    // The additive forms are read since stage P6 (parser-p6-copies.test.ts); what stays unread is
    // an artifact type alone, which would replace the card types (CR 205.1a).
    ['Target creature becomes an artifact until end of turn.', 'artifact until'],
    [
      'Target land becomes a 3/3 blue Elemental creature until end of turn. It is still a land.',
      '3/3',
    ],
    ['Target creature becomes a copy of target creature until end of turn.', 'copy'],
    ['Target creature becomes a Dragon until your next turn.', 'until your next turn'],
    ['Target creature becomes a Frog.', '.'],
    ['Target creature becomes a blue and black Frog until end of turn.', 'and black'],
    ['Target creature becomes a Frogs until end of turn.', 'Frogs'],
    ['Target creature becomes a Island until end of turn.', 'Island'],
  ] as const)('stays unread: %s', (text, part) => {
    const d = dropped(text);
    expect(d.reason).toBe('unrecognised');
    expect(d.stoppedAt).toContain(part);
  });

  test('a non-creature subtype is not a creature type, so it is unread (CR 205.3g-i)', () => {
    expect(dropped('Target creature becomes a Forest until end of turn.')).toMatchObject({
      reason: 'unrecognised',
    });
    expect(dropped('Target creature becomes an Equipment until end of turn.')).toMatchObject({
      reason: 'unrecognised',
    });
  });

  test('the engine accepts the lowered nodes (validateCard is the last gate)', () => {
    const imported = readAll(FROG);
    expect(imported.spell?.targets).toEqual([CREATURE_TARGET]);
  });
});

describe('flicker: "Exile target creature, then return it to the battlefield under its owner\'s control."', () => {
  const OWNER =
    "Exile target creature, then return it to the battlefield under its owner's control.";
  const flicker = (controller: 'owner' | 'you'): Effect => ({
    kind: 'sequence',
    effects: [
      { kind: 'exile', objects: T1 },
      { kind: 'moveToZone', objects: { kind: 'moved' }, to: 'battlefield', controller },
    ],
  });

  test('equals SYNTHETIC Flicker Spell', () => {
    expect(readAll(OWNER).spell).toEqual(fixture('SYNTHETIC Flicker Spell').spell);
  });

  test("\"under its owner's control\" is controller 'owner'", () => {
    expect(spellEffect(OWNER)).toEqual(flicker('owner'));
  });

  test('"under your control" is controller \'you\'', () => {
    expect(
      spellEffect('Exile target creature, then return it to the battlefield under your control.'),
    ).toEqual(flicker('you'));
  });

  test('the backlog shape (Ephemerate, Momentary Blink): "target creature you control"', () => {
    const parsed = readAll(
      "Exile target creature you control, then return it to the battlefield under its owner's control.",
    );
    expect(parsed.spell?.targets).toEqual([
      {
        id: 't1',
        what: {
          kind: 'object',
          filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
        },
      },
    ]);
    expect(parsed.spell?.effect).toEqual(flicker('owner'));
  });

  test('the backlog shape (Cloudshift): "return that card ... under your control"', () => {
    const parsed = readAll(
      'Exile target creature you control, then return that card to the battlefield under your control.',
    );
    expect(parsed.spell?.effect).toEqual(flicker('you'));
  });

  test('"it" and "that card" after the exile are the moved object, and only in this shape', () => {
    // The binding rule: the pronoun of `effect.flicker` is read inside the rule against the noun
    // it exiles, like the search rule's "put it": it is the object the exile made (CR 400.7j), not
    // the target it was before (CR 400.7). Anywhere else a pronoun after an exile is not read.
    // "Tap it" is read since stage P15 and refused: the exiled card has no tapped state to change.
    expect(dropped('Exile target creature. Tap it.')).toMatchObject({ reason: 'notRunnable' });
    expect(dropped('Exile target creature, then return it to your hand.')).toMatchObject({
      reason: 'unrecognised',
    });
    expect(
      dropped("Exile target creature. Return it to the battlefield under its owner's control."),
    ).toMatchObject({ reason: 'unrecognised', stoppedAt: expect.stringContaining('it to the') });
  });

  test('the delayed form is read since stage P48 (D-205): a delayed triggered ability that returns the exiled card (CR 603.7, 603.7c)', () => {
    const delayed = {
      kind: 'delayedTrigger',
      at: { step: 'endStep', whose: 'each' },
      effect: {
        kind: 'moveToZone',
        objects: { kind: 'moved' },
        to: 'battlefield',
        controller: 'owner',
      },
    };
    expect(
      spellEffect(
        "Exile target creature. Return it to the battlefield under its owner's control at the beginning of the next end step.",
      ),
    ).toEqual({ kind: 'sequence', effects: [{ kind: 'exile', objects: T1 }, delayed] });
    // With "then" in one sentence the clause after it is no different; a destroyed creature has no card to return that way.
    expect(
      spellEffect(
        "Exile target creature, then return it to the battlefield under its owner's control at the beginning of the next end step.",
      ),
    ).toEqual({ kind: 'sequence', effects: [{ kind: 'exile', objects: T1 }, delayed] });
    expect(
      dropped(
        "Destroy target creature. Return it to the battlefield under its owner's control at the beginning of the next end step.",
      ),
    ).toMatchObject({ reason: 'notRunnable' });
  });

  test('a plain exile is still an exile', () => {
    expect(spellEffect('Exile target creature.')).toEqual({ kind: 'exile', objects: T1 });
  });

  test("a flicker in a triggered ability (Conjurer's Closet shape), optional only as a whole", () => {
    const [ability] = readAll(
      'At the beginning of your end step, exile target creature you control, then return that card to the battlefield under your control.',
      'creature',
    ).abilities;
    expect(ability).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'endStep', whose: 'you' },
      effect: flicker('you'),
    });
  });

  test('"each" and plural operands are unread: the engine\'s `moved` is per exile, one noun', () => {
    expect(
      dropped(
        "Exile each creature you control, then return them to the battlefield under their owners' control.",
      ),
    ).toMatchObject({ reason: 'unrecognised' });
    expect(
      dropped(
        "Exile two target creatures you control, then return those cards to the battlefield under their owners' control.",
      ),
    ).toMatchObject({ reason: 'unrecognised' });
  });

  test('an enchantment or permanent target lowers; the engine refuses it for Auras (CR 303.4f)', () => {
    const r = read(
      "Exile target permanent, then return it to the battlefield under its owner's control.",
    );
    expect(r.unparsed).toEqual([]);
    expect(r.spell?.effect).toEqual(flicker('owner'));
  });
});
