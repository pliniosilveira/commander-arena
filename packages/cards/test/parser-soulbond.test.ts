// What the grammar reads of soulbond and of the line of Breathkeeper Seraph (D-984, D-982): "Soulbond" (CR 702.95a), "As long as ~ is paired with another creature, each of
// those creatures has \"When this creature dies, you may return it to the battlefield under its owner's control at the beginning of your next upkeep.\"" (CR 702.95b, 603.7,
// 603.10a). The texts are SYNTHETIC or the shapes of the real card; every refusal is a line left unparsed or a card the validator refuses, never half read. "This creature" is
// written inside the quotation (the normalizer writes it as `~`); a card's own name inside a quotation would be read as a name (`namedInQuotes`) and the grant refused.
import { describe, expect, test } from 'vitest';
import { convertFace } from '../src/convert/face';
import { parseOnly } from './convert-grammar-helpers';
import { syntheticCard, syntheticFace } from './convert-helpers';

const SERAPH_LINE =
  'As long as ~ is paired with another creature, each of those creatures has "When this creature dies, you may return it to the battlefield under its owner\'s control at the beginning of your next upkeep."';

const read = (text: string, typeLine = 'Creature — Angel') =>
  convertFace(
    syntheticFace({
      name: 'SYNTHETIC Seraph',
      manaCost: '{4}{W}{W}',
      typeLine,
      oracleText: text.replaceAll('~', 'SYNTHETIC Seraph'),
      power: '4',
      toughness: '4',
      colors: ['W'],
    }),
    0,
  );

/** The whole card through the importer, so the validator's refusals count: supported or not. */
const status = (text: string, typeLine = 'Creature — Angel') =>
  parseOnly(
    syntheticCard({
      name: 'SYNTHETIC Seraph',
      manaCost: '{4}{W}{W}',
      typeLine,
      oracleText: text.replaceAll('~', 'SYNTHETIC Seraph'),
      power: '4',
      toughness: '4',
    }),
  ).support;

describe('the keyword', () => {
  test('"Soulbond" and a line of keywords with it, with and without the reminder text', () => {
    expect(read('Soulbond').face.abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'soulbond' } },
    ]);
    const withReminder = read(
      'Flying, soulbond (You may pair this creature with another unpaired creature when either enters. They remain paired for as long as you control both of them.)',
    );
    expect(withReminder.unparsed).toEqual([]);
    expect(withReminder.face.abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'flying' } },
      { kind: 'keyword', keyword: { kind: 'soulbond' } },
    ]);
  });

  test('a card with the keyword and no other line is supported', () => {
    expect(status('Soulbond').status).toBe('supported');
  });

  test('the keyword on a card whose other line is not read stays unsupported as a whole', () => {
    for (const second of [
      'As long as ~ is paired with another creature, both creatures have flying.',
      'As long as ~ is paired with another creature, each of those creatures has flying.',
      'As long as ~ is paired with another creature, each of those creatures gets +1/+1.',
      'As long as ~ is paired with a Human, each of those creatures has "When this creature dies, you draw a card."',
      "As long as ~ isn't paired with another creature, ~ has flying.",
      'As long as ~ is unpaired, ~ has flying.',
      'Whenever ~ attacks, draw a card and frobnicate.',
    ]) {
      const s = status(`Soulbond\n${second}`);
      expect(s.status, second).toBe('unsupported');
      expect(s.unparsed.length, second).toBeGreaterThan(0);
    }
  });

  test('soulbond can not be given: a grant of the keyword is not read', () => {
    for (const text of [
      'Creatures you control have soulbond.',
      'Other creatures you control have "Soulbond".',
      'Target creature gains soulbond until end of turn.',
      'Equipped creature has soulbond.',
    ]) {
      const s = status(text);
      expect(s.status, text).toBe('unsupported');
    }
  });

  test('on a card that is not a creature the validator refuses it (CR 702.95a)', () => {
    for (const typeLine of ['Artifact', 'Enchantment', 'Instant', 'Sorcery']) {
      const s = status('Soulbond', typeLine);
      expect(s.status, typeLine).toBe('unsupported');
      expect(s.reasons.join(' '), typeLine).toContain('not a creature');
    }
  });

  test('near misses of the word itself are not the keyword', () => {
    for (const text of ['Soulbond.', 'Soulbonds', 'Soulbond 1', 'Flying soulbond', 'Soulbonded']) {
      expect(read(text).unparsed.length, text).toBeGreaterThan(0);
    }
  });
});

describe('the line of the Seraph', () => {
  test('is a static ability: a grant of the dies-and-return ability to the pair, as long as it is paired', () => {
    const c = read(`Flying, soulbond\n${SERAPH_LINE}`);
    expect(c.unparsed).toEqual([]);
    expect(c.face.abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'flying' } },
      { kind: 'keyword', keyword: { kind: 'soulbond' } },
      {
        kind: 'static',
        static: {
          kind: 'grantAbility',
          subject: { kind: 'pair' },
          ability: {
            kind: 'triggered',
            trigger: { kind: 'dies', what: { kind: 'this' } },
            optional: true,
            effect: {
              kind: 'delayedTrigger',
              at: { step: 'upkeep', whose: 'you' },
              effect: {
                kind: 'moveToZone',
                objects: { kind: 'triggerCard' },
                to: 'battlefield',
                controller: 'owner',
              },
            },
          },
        },
        condition: { kind: 'paired' },
      },
    ]);
  });

  test('the whole card is supported, line by line', () => {
    const s = status(`Flying, soulbond\n${SERAPH_LINE}`);
    expect(s.unparsed).toEqual([]);
    expect(s.reasons).toEqual([]);
    expect(s.status).toBe('supported');
  });

  test('"under your control" is read, and means the controller of the ability', () => {
    const c = read(
      'As long as ~ is paired with another creature, each of those creatures has "When this creature dies, you may return it to the battlefield under your control at the beginning of your next upkeep."',
    );
    expect(c.unparsed).toEqual([]);
    expect(JSON.stringify(c.face.abilities)).toContain('"controller":"you"');
  });

  test.each([
    // the pair
    [
      'both creatures',
      'As long as ~ is paired with another creature, both creatures have "When this creature dies, you may return it to the battlefield under its owner\'s control at the beginning of your next upkeep."',
    ],
    [
      'a kind of partner',
      'As long as ~ is paired with another Human, each of those creatures has "When this creature dies, you may return it to the battlefield under its owner\'s control at the beginning of your next upkeep."',
    ],
    [
      'paired with a creature',
      'As long as ~ is paired with a creature, each of those creatures has "When this creature dies, you may return it to the battlefield under its owner\'s control at the beginning of your next upkeep."',
    ],
    [
      'paired alone',
      'As long as ~ is paired, each of those creatures has "When this creature dies, you may return it to the battlefield under its owner\'s control at the beginning of your next upkeep."',
    ],
    [
      'no condition',
      'Each of those creatures has "When this creature dies, you may return it to the battlefield under its owner\'s control at the beginning of your next upkeep."',
    ],
    [
      'the name inside the quotation',
      'As long as ~ is paired with another creature, each of those creatures has "When ~ dies, you may return it to the battlefield under its owner\'s control at the beginning of your next upkeep."',
    ],
    // what is given
    [
      'a keyword',
      'As long as ~ is paired with another creature, each of those creatures has flying.',
    ],
    [
      'power and toughness',
      'As long as ~ is paired with another creature, each of those creatures gets +1/+1.',
    ],
    [
      'a restriction',
      "As long as ~ is paired with another creature, each of those creatures can't be blocked.",
    ],
    [
      'base values',
      'As long as ~ is paired with another creature, each of those creatures has base power and toughness 3/3.',
    ],
    [
      'a mana ability',
      'As long as ~ is paired with another creature, each of those creatures has "{T}: Add {G}."',
    ],
    // the delayed return
    [
      'the next upkeep of anyone',
      'As long as ~ is paired with another creature, each of those creatures has "When this creature dies, you may return it to the battlefield under its owner\'s control at the beginning of the next upkeep."',
    ],
    [
      'a next end step',
      'As long as ~ is paired with another creature, each of those creatures has "When this creature dies, you may return it to the battlefield under its owner\'s control at the beginning of the next end step."',
    ],
    [
      'tapped',
      'As long as ~ is paired with another creature, each of those creatures has "When this creature dies, you may return it to the battlefield tapped under its owner\'s control at the beginning of your next upkeep."',
    ],
    [
      'no control',
      'As long as ~ is paired with another creature, each of those creatures has "When this creature dies, you may return it to the battlefield at the beginning of your next upkeep."',
    ],
    [
      'to the hand',
      'As long as ~ is paired with another creature, each of those creatures has "When this creature dies, you may return it to your hand at the beginning of your next upkeep."',
    ],
    [
      'a leave-the-battlefield trigger',
      'As long as ~ is paired with another creature, each of those creatures has "When this creature leaves the battlefield, you may return it to the battlefield under its owner\'s control at the beginning of your next upkeep."',
    ],
    [
      'an enters trigger',
      'As long as ~ is paired with another creature, each of those creatures has "When this creature enters, you may return it to the battlefield under its owner\'s control at the beginning of your next upkeep."',
    ],
  ])('is not read: %s', (_why, line) => {
    const s = status(line);
    expect(s.status).toBe('unsupported');
  });

  test('"each of those creatures" elsewhere is not a noun the effects take', () => {
    for (const text of [
      'When ~ enters, each of those creatures gains flying until end of turn.',
      'When ~ enters, destroy each of those creatures.',
      'When ~ enters, ~ deals 1 damage to each of those creatures.',
    ]) {
      expect(status(text).status, text).toBe('unsupported');
    }
  });

  test('"if ~ is paired with another creature" reads as the condition of an ability of the permanent, nothing else', () => {
    const c = read('When ~ attacks, if ~ is paired with another creature, you gain 1 life.');
    expect(c.unparsed).toEqual([]);
    expect(c.face.abilities[0]).toMatchObject({ interveningIf: { kind: 'paired' } });
    expect(
      status('When ~ attacks, if target creature is paired with another creature, you gain 1 life.')
        .status,
    ).toBe('unsupported');
  });
});

describe("any triggered ability quoted to the pair is read, not only the Seraph's (D-984)", () => {
  // The lowering of a granted ability is general: the subject `pair` is accepted for a quoted triggered ability, and the engine runs a layer 6 grant of it through the
  // same subject (`scenario-xx-soulbond-grant.test.ts`). So these shapes are read and supported although no card of the deck has them. A granted keyword, +N/+N or activated
  // ability of the pair stays unsupported (`parser-soulbond-needs.test.ts`, the table above).
  test.each([
    ['an attack trigger', 'Whenever this creature attacks, you draw a card.', 'attacks'],
    ['a death trigger', 'When this creature dies, each opponent loses 2 life.', 'dies'],
    ['an upkeep trigger', 'At the beginning of your upkeep, you gain 1 life.', '"upkeep"'],
  ])('%s', (_name, quoted, trigger) => {
    const text = `As long as ~ is paired with another creature, each of those creatures has "${quoted}"`;
    const c = read(text);
    expect(c.unparsed).toEqual([]);
    const grant = c.face.abilities[0];
    expect(grant).toMatchObject({
      kind: 'static',
      static: { kind: 'grantAbility', subject: { kind: 'pair' } },
      condition: { kind: 'paired' },
    });
    const given =
      grant?.kind === 'static' && grant.static.kind === 'grantAbility'
        ? grant.static.ability
        : null;
    expect(given?.kind).toBe('triggered');
    expect(JSON.stringify(given)).toContain(trigger);
    expect(status(text).status).toBe('supported');
  });
});

describe('"if ~ is paired" where the permanent may be gone is not read (D-985, CR 400.7, 603.10a)', () => {
  // The engine reads a pair on the permanent that is on the battlefield now. A dies or leaves trigger of the permanent runs on the card in the graveyard (CR 400.7), which has
  // no pair, so the condition would be false for ever: such a card must be unsupported, not wrong.
  test.each([
    ['dies, intervening if', 'When ~ dies, if ~ is paired with another creature, draw a card.'],
    [
      "dies, intervening if, 'it'",
      "When ~ dies, if it's paired with another creature, draw a card.",
    ],
    [
      'leaves the battlefield',
      'Whenever ~ leaves the battlefield, if ~ is paired with another creature, draw a card.',
    ],
    [
      'another creature dies (the permanent may die with it)',
      'Whenever another creature dies, if ~ is paired with another creature, draw a card.',
    ],
    [
      'a dies trigger of the pair',
      'As long as ~ is paired with another creature, each of those creatures has "When this creature dies, if this creature is paired with another creature, you draw a card."',
    ],
  ])('%s', (_why, text) => {
    const s = status(text);
    expect(s.status).toBe('unsupported');
    expect(s.unparsed.length).toBeGreaterThan(0);
  });

  test('the same condition in a trigger of a permanent that stays is read', () => {
    for (const text of [
      'As long as ~ is paired with another creature, each of those creatures has "Whenever this creature attacks, if this creature is paired with another creature, you draw a card."',
      'When ~ attacks, if ~ is paired with another creature, you gain 1 life.',
      'Whenever ~ deals combat damage to a player, if ~ is paired with another creature, draw a card.',
    ]) {
      expect(status(text).status, text).toBe('supported');
    }
  });
});

describe('"Return it" at the next upkeep names the dying creature only when nothing else came before (D-985)', () => {
  test.each([
    [
      'a token before',
      "When ~ dies, create a 1/1 white Spirit creature token with flying. Return it to the battlefield under its owner's control at the beginning of your next upkeep.",
    ],
    [
      'a Treasure before',
      "When ~ dies, create a Treasure token. Return it to the battlefield under its owner's control at the beginning of your next upkeep.",
    ],
    [
      'a discard before',
      "When ~ dies, you may discard a card. If you do, return it to the battlefield under its owner's control at the beginning of your next upkeep.",
    ],
  ])('is not read: %s', (_why, text) => {
    expect(status(text).status).toBe('unsupported');
  });

  test('is read as the only instruction', () => {
    expect(
      status(
        "When ~ dies, you may return it to the battlefield under its owner's control at the beginning of your next upkeep.",
      ).status,
    ).toBe('supported');
  });
});
