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

  test('"if ~ is paired with another creature" is read as the condition of no triggered ability (D-985)', () => {
    const c = read('When ~ attacks, if ~ is paired with another creature, you gain 1 life.');
    expect(c.unparsed.length).toBeGreaterThan(0);
    expect(JSON.stringify(c.face.abilities)).not.toContain('paired');
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

describe('"~ is paired" is read only as the "as long as" condition of a static ability (D-985, CR 400.7, 603.4, 608.2h)', () => {
  // The engine reads a pair on the permanent that is on the battlefield now. In a triggered ability the source can leave between the event and the resolution (a Lightning
  // Bolt in response to the attack trigger): CR 603.4 checks the intervening "if" again then and CR 608.2h reads the permanent with its last-known information, which was
  // paired, but the engine reads no pair of a permanent that is gone. So the card is unsupported, never wrong; the same for every consumer of a condition that is not a static one.
  test.each([
    ['attacks', 'Whenever ~ attacks, if ~ is paired with another creature, you gain 3 life.'],
    ['attacks, "it"', "Whenever ~ attacks, if it's paired with another creature, you gain 3 life."],
    [
      'is dealt damage',
      'Whenever ~ is dealt damage, if ~ is paired with another creature, you gain 3 life.',
    ],
    [
      'becomes blocked',
      'Whenever ~ becomes blocked, if ~ is paired with another creature, you gain 3 life.',
    ],
    [
      'attacks or blocks',
      'Whenever ~ attacks or blocks, if ~ is paired with another creature, you gain 3 life.',
    ],
    [
      'enters or attacks',
      'Whenever ~ enters or attacks, if ~ is paired with another creature, you gain 3 life.',
    ],
    [
      'deals combat damage',
      'Whenever ~ deals combat damage to a player, if ~ is paired with another creature, draw a card.',
    ],
    [
      'upkeep',
      'At the beginning of your upkeep, if ~ is paired with another creature, draw a card.',
    ],
    ['dies', 'When ~ dies, if ~ is paired with another creature, draw a card.'],
    ["dies, 'it'", "When ~ dies, if it's paired with another creature, draw a card."],
    [
      'leaves the battlefield',
      'Whenever ~ leaves the battlefield, if ~ is paired with another creature, draw a card.',
    ],
    [
      'another creature dies (the permanent may die with it)',
      'Whenever another creature dies, if ~ is paired with another creature, draw a card.',
    ],
    [
      'another creature enters',
      'Whenever another creature enters under your control, if ~ is paired with another creature, draw a card.',
    ],
    [
      'a conditional effect of a trigger',
      'Whenever ~ attacks, if ~ is paired with another creature, you gain 3 life. Otherwise, you gain 1 life.',
    ],
    [
      'a conditional instruction of a trigger',
      'Whenever ~ attacks, draw a card. If ~ is paired with another creature, you gain 3 life.',
    ],
    [
      'a conditional effect, otherwise form',
      'Whenever ~ attacks, if ~ is paired with another creature, draw a card, otherwise you gain 1 life.',
    ],
    [
      'a conditional instruction of an activated ability',
      '{T}: Draw a card. If ~ is paired with another creature, you gain 3 life.',
    ],
    [
      'an activation restriction',
      '{T}: Draw a card. Activate only if ~ is paired with another creature.',
    ],
    [
      'a mana ability condition',
      '{T}: Add {G}. Activate only if ~ is paired with another creature.',
    ],
    [
      'a trigger of the pair, inside the quotation',
      'As long as ~ is paired with another creature, each of those creatures has "Whenever this creature attacks, if this creature is paired with another creature, you draw a card."',
    ],
    [
      'a dies trigger of the pair, inside the quotation',
      'As long as ~ is paired with another creature, each of those creatures has "When this creature dies, if this creature is paired with another creature, you draw a card."',
    ],
    [
      'a static ability inside the quotation',
      'As long as ~ is paired with another creature, each of those creatures has "As long as this creature is paired with another creature, this creature has flying."',
    ],
    [
      'a conditional effect inside the quotation',
      'As long as ~ is paired with another creature, each of those creatures has "Whenever this creature attacks, you gain 1 life. If this creature is paired with another creature, you gain 3 life."',
    ],
    ['a restriction that is lifted', "~ can't attack unless it's paired with another creature."],
    ['a spell', 'Draw a card. If ~ is paired with another creature, gain 3 life.'],
  ])('is not read: %s', (_why, text) => {
    const s = status(text);
    expect(s.status).toBe('unsupported');
    expect(s.unparsed.length).toBeGreaterThan(0);
  });

  test('is still read as the condition of a static ability: a keyword of the permanent, a granted ability, in and, a negation is not', () => {
    for (const text of [
      'As long as ~ is paired with another creature, ~ has flying.',
      SERAPH_LINE,
    ]) {
      expect(status(text).status, text).toBe('supported');
    }
    expect(status("As long as ~ isn't paired with another creature, ~ has flying.").status).toBe(
      'unsupported',
    );
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

describe('"your next upkeep" is the controller\'s: not read when another player is the one who acts (D-985, CR 608.2d, 603.7)', () => {
  // With "may" asked of another player and no "have you", the engine runs the instruction with the asked player as "you" (`runsAs: 'chooser'`), so a delayed ability created
  // there belongs to them and triggers at their upkeep, not at the controller's that the text names. The text is refused, never read for the wrong player.
  const RETURN =
    "return it to the battlefield under its owner's control at the beginning of your next upkeep";
  test.each([
    ['each opponent may', `When ~ dies, each opponent may ${RETURN}.`],
    ['target opponent may', `When ~ dies, target opponent may ${RETURN}.`],
    ['each player may', `When ~ dies, each player may ${RETURN}.`],
    ['target player may', `When ~ dies, target player may ${RETURN}.`],
    [
      'a second instruction in the same "may"',
      `When ~ dies, each opponent may ${RETURN} and you draw a card.`,
    ],
    ['each opponent, no "may"', `When ~ dies, each opponent ${RETURN}.`],
    ['target opponent, no "may"', `When ~ dies, target opponent ${RETURN}.`],
    ['for each opponent', `When ~ dies, for each opponent, ${RETURN}.`],
    [
      '"if they do" after a question to the opponent',
      `When ~ dies, each opponent may discard a card. If they do, ${RETURN}.`,
    ],
    [
      "the opponent's refusal",
      `When ~ dies, each opponent may discard a card. If they don't, ${RETURN}.`,
    ],
  ])('is not read: %s', (_why, text) => {
    const s = status(text);
    expect(s.status).toBe('unsupported');
  });

  test('"your next main phase" of an added mana is not read for a player asked either, and is for the controller', () => {
    const add =
      'add an amount of {C} equal to the amount of mana spent to cast that spell at the beginning of your next main phase';
    const spell = (text: string) =>
      parseOnly(
        syntheticCard({
          name: 'SYNTHETIC Denial',
          manaCost: '{1}{U}',
          typeLine: 'Instant',
          oracleText: text,
        }),
      ).support.status;
    expect(spell(`Counter target spell. If you control a Wizard, ${add}.`)).toBe('supported');
    expect(spell(`Counter target spell. Each opponent may ${add}.`)).toBe('unsupported');
    expect(spell(`Counter target spell. Target opponent may ${add}.`)).toBe('unsupported');
  });

  test('is read when the controller is the one who acts: the ability\'s own "you may", no "may", and "may have you"', () => {
    for (const text of [
      `When ~ dies, you may ${RETURN}.`,
      `When ~ dies, ${RETURN}.`,
      `When ~ dies, target opponent may have you ${RETURN}.`,
      `When ~ dies, each opponent may have you ${RETURN}.`,
    ]) {
      expect(status(text).status, text).toBe('supported');
    }
    const c = read(`When ~ dies, each opponent may have you ${RETURN}.`);
    expect(c.face.abilities[0]).toMatchObject({
      effect: {
        kind: 'playersMay',
        players: { kind: 'eachOpponent' },
        effect: { kind: 'delayedTrigger', at: { step: 'upkeep', whose: 'you' } },
      },
    });
    expect(JSON.stringify(c.face.abilities[0])).not.toContain('chooser');
  });
});
