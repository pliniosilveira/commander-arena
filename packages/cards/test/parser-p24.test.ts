// Stage P24 (M6): the play rules of the engine slice of D-125 (ENGINE_VERSION 24). Four static lines, each lowered to
// one engine `static` ability: "You may play an additional land on each of your turns.", "You may look at the top card
// of your library any time.", "Creatures can't attack you unless their controller pays {2} for each creature they
// control that's attacking you." (and the planeswalker form) and "You may choose not to untap ~ during your untap
// step.". The real lines are those of reports/templates.json (and reports/backlog.md); every other line is SYNTHETIC,
// among them the near misses. That the engine runs what is lowered is in convert-grammar-engine-p24.test.ts; that a
// missing engine feature is named is in parser-p24-needs.test.ts.
import { describe, expect, test } from 'vitest';
import { parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';
import { dropped, type FaceType, read, readAll } from './parser-p5-helpers';

const ADDITIONAL_LAND = 'You may play an additional land on each of your turns.';
const TWO_LANDS = 'You may play two additional lands on each of your turns.';
const EACH_PLAYER_LAND = 'Each player may play an additional land on each of their turns.';
const LOOK_AT_TOP = 'You may look at the top card of your library any time.';
const PROPAGANDA =
  "Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you.";
const NORNS_ANNEX =
  "Creatures can't attack you or planeswalkers you control unless their controller pays {W/P} for each of those creatures.";
const SPHERE_OF_SAFETY =
  "Creatures can't attack you or planeswalkers you control unless their controller pays {X} for each of those creatures, where X is the number of enchantments you control.";
const OPTIONAL_UNTAP = 'You may choose not to untap ~ during your untap step.';

const stat = (value: object) => ({ kind: 'static', static: value });
const tax = (symbols: string[], planeswalkers?: true) =>
  stat({
    kind: 'attackTax',
    cost: [{ kind: 'mana', symbols }],
    ...(planeswalkers ? { planeswalkers } : {}),
  });

describe('static.additional-land: "You may play an additional land on each of your turns." (CR 305.2; backlog: 17 cards)', () => {
  test.each<FaceType>(['enchantment', 'creature', 'artifact'])(
    'the real line lowers to additionalLandDrops on a %s',
    (type) => {
      expect(readAll(ADDITIONAL_LAND, type).abilities).toEqual([
        stat({ kind: 'additionalLandDrops', count: 1 }),
      ]);
    },
  );

  test('"two additional lands" is count 2 (the real shape "You may play N additional lands ...")', () => {
    expect(readAll(TWO_LANDS, 'enchantment').abilities).toEqual([
      stat({ kind: 'additionalLandDrops', count: 2 }),
    ]);
  });

  test.each([
    ['three', 3],
    ['four', 4],
    ['ten', 10],
  ])('"%s additional lands" is count %i (SYNTHETIC wording)', (word, count) => {
    expect(
      readAll(`You may play ${word} additional lands on each of your turns.`, 'enchantment')
        .abilities,
    ).toEqual([stat({ kind: 'additionalLandDrops', count })]);
  });

  test('"Each player may play an additional land on each of their turns." is eachPlayer', () => {
    expect(readAll(EACH_PLAYER_LAND, 'enchantment').abilities).toEqual([
      stat({ kind: 'additionalLandDrops', count: 1, eachPlayer: true }),
    ]);
  });

  test('beside the other abilities of the card (SYNTHETIC ability text)', () => {
    const parsed = readAll(`Flying\n${ADDITIONAL_LAND}\n${LOOK_AT_TOP}`, 'creature');
    expect(parsed.abilities.map((a) => (a.kind === 'static' ? a.static.kind : a.kind))).toEqual([
      'keyword',
      'additionalLandDrops',
      'lookAtTopOfLibrary',
    ]);
  });
});

describe('static.look-at-top: "You may look at the top card of your library any time." (CR 401.5; backlog: 44 cards)', () => {
  test.each<FaceType>(['enchantment', 'creature', 'artifact', 'land'])(
    'the real line lowers to lookAtTopOfLibrary on a %s',
    (type) => {
      expect(readAll(LOOK_AT_TOP, type).abilities).toEqual([stat({ kind: 'lookAtTopOfLibrary' })]);
    },
  );
});

describe('static.attack-tax: "Creatures can\'t attack you unless their controller pays {M} for each ..." (CR 508.1d, 508.1h)', () => {
  test('the real line (Propaganda, Ghostly Prison, Windborn Muse, Koskun Falls) lowers to the tax', () => {
    expect(readAll(PROPAGANDA, 'enchantment').abilities).toEqual([tax(['2'])]);
  });

  test("the real planeswalker line (Norn's Annex, Baird, Archon of Absolution) is planeswalkers: true, Phyrexian", () => {
    expect(readAll(NORNS_ANNEX, 'artifact').abilities).toEqual([tax(['W/P'], true)]);
  });

  test.each([
    ['{1}', ['1']],
    ['{W}{W}', ['W', 'W']],
    ['{1}{W}', ['1', 'W']],
    ['{C}', ['C']],
    ['{R/W}', ['R/W']],
    ['{2/W}', ['2/W']],
    ['{1}{G/P}', ['1', 'G/P']],
  ])('the cost %s is kept symbol by symbol (SYNTHETIC cost)', (cost, symbols) => {
    expect(
      readAll(
        `Creatures can't attack you unless their controller pays ${cost} for each creature they control that's attacking you.`,
        'enchantment',
      ).abilities,
    ).toEqual([tax(symbols)]);
    expect(
      readAll(
        `Creatures can't attack you or planeswalkers you control unless their controller pays ${cost} for each of those creatures.`,
        'enchantment',
      ).abilities,
    ).toEqual([tax(symbols, true)]);
  });

  test('a lowercase symbol and a typographic apostrophe read the same (SYNTHETIC spelling)', () => {
    expect(
      readAll(
        'Creatures can’t attack you unless their controller pays {w} for each creature they control that’s attacking you.',
        'enchantment',
      ).abilities,
    ).toEqual([tax(['W'])]);
  });

  test('a creature may have it (Windborn Muse is a creature)', () => {
    expect(readAll(PROPAGANDA, 'creature').abilities).toEqual([tax(['2'])]);
  });
});

describe('static.optional-untap: "You may choose not to untap ~ during your untap step." (CR 502.3; backlog: 44 cards)', () => {
  test.each<FaceType>(['artifact', 'creature', 'land', 'enchantment'])(
    'the real line lowers to optionalUntap on a %s',
    (type) => {
      expect(readAll(OPTIONAL_UNTAP, type).abilities).toEqual([stat({ kind: 'optionalUntap' })]);
    },
  );

  test('beside an activated ability that needs the permanent tapped (SYNTHETIC)', () => {
    const parsed = readAll(`${OPTIONAL_UNTAP}\n{T}: Draw a card.`, 'artifact');
    expect(parsed.abilities.map((a) => a.kind)).toEqual(['static', 'activated']);
  });

  test('"~ doesn\'t untap during your untap step." stays the restriction of static.self', () => {
    expect(readAll("~ doesn't untap during your untap step.", 'creature').abilities).toEqual([
      stat({ kind: 'restriction', subject: { kind: 'this' }, restriction: 'doesntUntap' }),
    ]);
  });
});

describe('what stays unread (never half-executed)', () => {
  test.each([
    // The additional land.
    ['You may play an additional land this turn.', 'an effect of a spell, not this ability'],
    ['You may play an additional land on each of your turns', 'no period'],
    [
      'You may play one additional land on each of your turns.',
      'the singular is "an additional land"',
    ],
    ['You may play an additional lands on each of your turns.', 'number and noun disagree'],
    ['You may play two additional land on each of your turns.', 'number and noun disagree'],
    ['You may play 2 additional lands on each of your turns.', 'a digit, not the number word'],
    ['You may play eleven additional lands on each of your turns.', 'a count above ten'],
    ['You may play an additional land on each of their turns.', '"their" goes with "Each player"'],
    ['Each player may play two additional lands on each of their turns.', 'no real line'],
    ['Each opponent may play an additional land on each of their turns.', 'another subject'],
    [
      'You may play an additional land on each of your turns if you control a Forest.',
      'a condition',
    ],
    [
      'You may play an additional land from your graveyard on each of your turns.',
      'another ability',
    ],
    ['You may play an additional land on each of your turns and draw a card.', 'two things'],
    ['You may cast an additional spell on each of your turns.', 'not a land'],
    // The top card.
    ['You may look at the top card of your library any time', 'no period'],
    ['You may look at the top card of your library.', 'not "any time"'],
    ['You may look at the top card of your library at any time.', 'not the printed wording'],
    ["You may look at the top card of each player's library any time.", 'other libraries'],
    ["You may look at the top card of an opponent's library any time.", 'another library'],
    ['You may look at the top two cards of your library any time.', 'two cards'],
    ['You may look at the bottom card of your library any time.', 'the bottom'],
    ['You may look at the top card of your library any time you could cast a spell.', 'a limit'],
    ['Play with the top card of your library revealed.', 'a different ability: everyone sees it'],
    ['Look at the top card of your library any time.', 'no "You may"'],
    // The attack tax.
    [
      "Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you",
      'no period',
    ],
    [
      "Creatures can't attack you unless their controller pays {X} for each creature they control that's attacking you.",
      'X (nobody announces an X when attacking)',
    ],
    [
      "Creatures can't attack you unless their controller pays {0} for each creature they control that's attacking you.",
      'a cost of nothing',
    ],
    [
      "Creatures can't attack you unless their controller pays {S} for each creature they control that's attacking you.",
      'a snow symbol',
    ],
    [
      "Creatures can't attack you unless their controller pays {2}{X} for each creature they control that's attacking you.",
      'X beside a number',
    ],
    [
      "Creatures can't attack you unless their controller pays {R/R} for each creature they control that's attacking you.",
      'a hybrid of one color',
    ],
    [
      "Creatures can't attack you unless their controller pays 2 life for each creature they control that's attacking you.",
      'a cost that is not mana',
    ],
    ["Creatures can't attack you unless their controller pays {2}.", 'no "for each"'],
    [
      "Creatures can't attack you unless their controller pays {2} for each of those creatures.",
      'the planeswalker wording needs the planeswalkers',
    ],
    [
      "Creatures can't attack you or planeswalkers you control unless their controller pays {2} for each creature they control that's attacking you.",
      'the planeswalker wording ends "of those creatures"',
    ],
    [
      "Creatures can't attack you unless their controller pays {2} for each creature that's attacking you.",
      'not "they control"',
    ],
    [
      "Creatures can't attack planeswalkers you control unless their controller pays {2} for each of those creatures.",
      'planeswalkers only',
    ],
    [
      "Creatures can't attack you or battles you protect unless their controller pays {2} for each of those creatures.",
      'battles',
    ],
    [
      "Creatures can't attack you unless you pay {2} for each creature they control that's attacking you.",
      'not their controller',
    ],
    [
      "Creatures your opponents control can't attack you unless their controller pays {2} for each creature they control that's attacking you.",
      'another subject',
    ],
    [
      "Creatures can't block you unless their controller pays {2} for each creature they control that's blocking you.",
      'a cost to block',
    ],
    [
      "Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you. Draw a card.",
      'text after the line',
    ],
    // The optional untap.
    ['You may choose not to untap ~ during your untap step', 'no period'],
    ['You may choose not to untap ~ during each of your untap steps.', 'another wording'],
    ["You may choose not to untap ~ during its controller's untap step.", "another player's step"],
    ['You may choose not to untap target creature during your untap step.', 'another permanent'],
    ['You may choose not to untap enchanted creature during your untap step.', 'another permanent'],
    ['You may choose not to untap equipped creature during your untap step.', 'another permanent'],
    ['You may choose not to untap creatures you control during your untap step.', 'a group'],
    ['You may choose not to untap it during your untap step.', 'a pronoun with nothing before it'],
    ['You may choose not to untap ~ during your untap step if you control a Swamp.', 'a condition'],
    ['You may choose not to untap ~ during your untap step and draw a card.', 'two things'],
    ['You may untap ~ during your untap step.', 'another ability'],
    [
      "Untap target land during each other player's untap step.",
      'another permanent (the permanent itself is read since D-983)',
    ],
  ])('"%s" is not read (%s)', (text) => {
    expect(dropped(text, 'enchantment')).toMatchObject({ reason: 'unrecognised' });
  });

  test('Sphere of Safety (the real shape, not read): the cost counts something (D-125)', () => {
    expect(dropped(SPHERE_OF_SAFETY, 'enchantment')).toMatchObject({ reason: 'unrecognised' });
    expect(read(SPHERE_OF_SAFETY, 'enchantment').abilities).toEqual([]);
  });

  test('the lines are read on a permanent only: an instant has no such static (SYNTHETIC)', () => {
    for (const text of [ADDITIONAL_LAND, LOOK_AT_TOP, PROPAGANDA, NORNS_ANNEX, OPTIONAL_UNTAP]) {
      expect(dropped(text, 'instant'), text).toMatchObject({ reason: 'unrecognised' });
    }
  });

  test('a line that is not read leaves the face with no ability (never half-executed)', () => {
    const parsed = read(`${ADDITIONAL_LAND}\n${SPHERE_OF_SAFETY}`, 'enchantment');
    expect(parsed.abilities).toEqual([stat({ kind: 'additionalLandDrops', count: 1 })]);
    expect(parsed.unparsed).toHaveLength(1);
  });
});

describe('the support of a card with these lines (validateCard is the last gate, D-007)', () => {
  const card = (typeLine: string, oracleText: string, extra: object = {}) =>
    parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Play Rule',
        typeLine,
        oracleText,
        manaCost: '{2}{W}',
        ...extra,
      }),
    );

  test.each([
    ['Enchantment', ADDITIONAL_LAND],
    ['Enchantment', TWO_LANDS],
    ['Enchantment', EACH_PLAYER_LAND],
    ['Enchantment', LOOK_AT_TOP],
    ['Enchantment', PROPAGANDA],
    ['Artifact', NORNS_ANNEX],
    ['Artifact', OPTIONAL_UNTAP],
  ])('a SYNTHETIC %s with "%s" is supported', (typeLine, text) => {
    const imported = card(typeLine, text);
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.reasons).toEqual([]);
    expect(imported.support.status).toBe('supported');
  });

  test('Sphere of Safety (the real line) is unsupported: that line is the reason', () => {
    const imported = card('Enchantment', SPHERE_OF_SAFETY);
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.unparsed.map((u) => u.text)).toEqual([SPHERE_OF_SAFETY]);
  });

  test('a card with one of the lines and one that is not read is unsupported, naming the unread one', () => {
    // Bolas's Citadel-shaped: the look is read, the rest of the card is not (SYNTHETIC second line).
    const imported = card(
      'Artifact',
      `${LOOK_AT_TOP}\nYou may play lands from the top of your library.`,
    );
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.unparsed.map((u) => u.text)).toEqual([
      'You may play lands from the top of your library.',
    ]);
  });

  test('"Play with the top card revealed" beside the look is not read (a different ability)', () => {
    const imported = card(
      'Enchantment',
      `${LOOK_AT_TOP}\nPlay with the top card of your library revealed.`,
    );
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.unparsed.map((u) => u.text)).toEqual([
      'Play with the top card of your library revealed.',
    ]);
  });

  test('an instant with a play rule line stays unsupported (SYNTHETIC)', () => {
    const imported = card('Instant', ADDITIONAL_LAND);
    expect(imported.support.status).toBe('unsupported');
  });
});
