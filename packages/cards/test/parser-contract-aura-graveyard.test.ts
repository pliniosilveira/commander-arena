// Issue 89 (Silverquill Influence), Animate Dead: "Enchant creature card in a graveyard", the sentences that swap the enchant ability, return the card and attach the Aura, and the leaves
// ability that has the creature sacrificed (CR 702.5a, 303.4a, 613.1f, 400.7, 701.21a), read through the whole pipeline: how the lines are split, SYNTHETIC variants and the near misses the
// grammar and the engine's structure check must not read. The engine runs what is lowered in convert-grammar-engine-animate-dead.test.ts.
import { describe, expect, test } from 'vitest';
import { normalizeOracleText, splitAbilities } from '../src/convert/parser/index';
import { parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';
import { dropped, OPTS, readAll } from './parser-p5-helpers';

const ENTERS =
  'When ~ enters, if it\'s on the battlefield, it loses "enchant creature card in a graveyard" and gains "enchant creature put onto the battlefield with ~." Return enchanted creature card to the battlefield under your control and attach ~ to it.';
const LEAVES = "When ~ leaves the battlefield, that creature's controller sacrifices it.";
const aura = (text: string) => readAll(text, 'enchantment', ['Aura']).abilities;
const droppedAura = (text: string) => dropped(text, 'enchantment', ['Aura']);

/** The import of a SYNTHETIC Aura card: the status and the reasons the engine's structure check gives. */
const imported = (oracleText: string) =>
  parseOnly(
    syntheticCard({
      name: 'SYNTHETIC Grave Aura',
      typeLine: 'Enchantment — Aura',
      oracleText,
      manaCost: '{1}{B}',
      colors: ['B'],
    }),
  );

describe('the lines of the Oracle text (CR 603.1)', () => {
  const split = (text: string) => splitAbilities(normalizeOracleText(text, OPTS));

  test('an ability printed in the same paragraph as the one before it is a line of its own: "When ~ leaves the battlefield, ..." after a sentence\'s period', () => {
    expect(split(`${ENTERS} ${LEAVES}`)).toEqual([ENTERS, LEAVES]);
  });

  test('not inside quotes, and not for another event', () => {
    const quoted = 'It gains "Draw a card. When ~ leaves the battlefield, you gain 1 life."';
    expect(split(quoted)).toEqual([quoted]);
    const other = 'Draw a card. When ~ dies, you gain 1 life.';
    expect(split(other)).toEqual([other]);
  });
});

describe('"Enchant creature card in a graveyard" (CR 702.5a, 303.4a)', () => {
  test('lowers to an enchant ability of a creature card in a graveyard', () => {
    expect(aura('Enchant creature card in a graveyard')[0]).toEqual({
      kind: 'keyword',
      keyword: { kind: 'enchant', filter: { zone: 'graveyard', types: ['creature'] } },
    });
  });

  test('another type of card', () => {
    expect(aura('Enchant land card in a graveyard')[0]).toMatchObject({
      keyword: { kind: 'enchant', filter: { zone: 'graveyard', types: ['land'] } },
    });
  });

  test.each([
    ['Enchant creature card in your graveyard'],
    ['Enchant creature cards in a graveyard'],
    ['Enchant target creature card in a graveyard'],
    ['Enchant creature card in a graveyard you control'],
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(droppedAura(text).stoppedAt).toBeDefined();
  });
});

describe('the enters ability and the leaves ability (CR 603.4, 613.1f, 400.7, 701.21a)', () => {
  test('the sentences of the Oracle text lower to the swap, the return and the attach', () => {
    const [swap, move, attach] = (aura(ENTERS)[0] as unknown as { effect: { effects: unknown[] } })
      .effect.effects;
    expect(swap).toMatchObject({ kind: 'replaceEnchant', objects: { kind: 'this' } });
    expect(move).toMatchObject({ kind: 'moveToZone', to: 'battlefield', putWithSource: true });
    expect(attach).toEqual({ kind: 'attach', object: { kind: 'this' }, to: { kind: 'moved' } });
  });

  test.each([
    // The swap names another subject, another ability, or does not end the quote with a period.
    [
      'When ~ enters, if it\'s on the battlefield, enchanted creature loses "enchant creature card in a graveyard" and gains "enchant creature put onto the battlefield with ~."',
    ],
    [
      'When ~ enters, if it\'s on the battlefield, it loses "enchant creature card in a graveyard" and gains "flying."',
    ],
    [
      'When ~ enters, if it\'s on the battlefield, it loses "enchant creature card in a graveyard" and gains "enchant creature."',
    ],
    // Returned under its owner's control, or not attached: another effect.
    [
      "When ~ enters, return enchanted creature card to the battlefield under its owner's control and attach ~ to it.",
    ],
    ['When ~ enters, return enchanted creature card to the battlefield under your control.'],
    // The creature's owner, another subject.
    ["When ~ leaves the battlefield, that creature's owner sacrifices it."],
    [
      "When ~ leaves the battlefield, that creature's controller sacrifices it and you draw a card.",
    ],
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(droppedAura(`Enchant creature card in a graveyard\n${text}`).stoppedAt).toBeDefined();
  });

  test('"if it\'s on the battlefield" is read for the Aura itself, not for another permanent\'s event', () => {
    const other = imported(
      "Enchant creature card in a graveyard\nWhenever a creature enters, if it's on the battlefield, you gain 1 life.",
    );
    expect(other.support.status).toBe('unsupported');
  });
});

describe('the engine refuses what the text does not link (CR 607.2, 400.7)', () => {
  const returns = `Enchant creature card in a graveyard\n${ENTERS}\n${LEAVES}`;

  test('the Aura that returns the card and has the creature sacrificed is supported', () => {
    expect(imported(returns).support.status).toBe('supported');
  });

  test('"that creature\'s controller sacrifices it" with no ability that put a creature onto the battlefield is not', () => {
    const lone = imported(`Enchant creature card in a graveyard\n${LEAVES}`);
    expect(lone.support.status).toBe('unsupported');
    expect(lone.support.reasons.join(' ')).toContain('putWithSource');
  });
});
