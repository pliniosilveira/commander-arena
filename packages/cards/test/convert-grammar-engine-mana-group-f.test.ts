// Mana abilities with a restriction, a count or a limit, and the permission to cast spells as though they had flash (the Quandrix Unlimited deck, group F), read by the grammar
// and run by the engine: Troyan, Gutsy Explorer, Kami of Whispered Hopes, Astral Cornucopia, Mana Bloom and Alchemist's Refuge (and Opal Palace, whose rider an earlier group
// built). The first block parses the REAL Oracle text of each card from the golden corpus, whole, and says what it lowers to; the rest are SYNTHETIC cards whose only abilities
// are the real lines (names replaced by ~), run through `applyAction` with the scenario DSL, plus the near misses the grammar must not read. Every synthetic name starts with "SYNTHETIC".
import { readFileSync } from 'node:fs';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const CORPUS = new URL('./fixtures/corpus/golden.jsonl', import.meta.url);
const GOLDEN: readonly GoldenCard[] = parseGolden(readFileSync(CORPUS, 'utf8'));

const real = (name: string) => {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  return importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
};

const LIB = Array.from({ length: 12 }, () => 'Plains');
const base = () =>
  scenario()
    .seat(0)
    .library(...LIB)
    .seat(1)
    .library(...LIB)
    .seat(0);

const THIS = { kind: 'this' } as const;

describe('the real cards, whole', () => {
  test.each([
    'Troyan, Gutsy Explorer',
    'Opal Palace',
    'Kami of Whispered Hopes',
    'Astral Cornucopia',
    'Mana Bloom',
    "Alchemist's Refuge",
  ])('%s is supported', (name) => {
    const imported = real(name);
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('supported');
  });

  test('Troyan: the mana is G and U, restricted by mana value 5 or {X}', () => {
    expect(real('Troyan, Gutsy Explorer').definition.faces[0]?.abilities[0]).toEqual({
      kind: 'mana',
      cost: [{ kind: 'tap' }],
      production: { kind: 'fixed', mana: ['G', 'U'] },
      spendOnly: { qualities: [{ kind: 'manaValueAtLeast', value: 5 }, { kind: 'hasX' }] },
    });
  });

  test('Kami and Astral Cornucopia: X mana of one color, X the power or the charge counters', () => {
    const kami = real('Kami of Whispered Hopes').definition.faces[0]?.abilities;
    expect(kami?.[1]).toEqual({
      kind: 'mana',
      cost: [{ kind: 'tap' }],
      production: { kind: 'anyColorAmount', amount: { kind: 'powerOf', of: THIS } },
    });
    const horn = real('Astral Cornucopia').definition.faces[0]?.abilities;
    expect(horn?.[1]).toEqual({
      kind: 'mana',
      cost: [{ kind: 'tap' }],
      production: {
        kind: 'anyColorAmount',
        amount: { kind: 'countersOn', of: THIS, counter: 'charge' },
      },
    });
  });

  test('Mana Bloom: a mana ability with a counter cost and a limit, and the upkeep return', () => {
    const abilities = real('Mana Bloom').definition.faces[0]?.abilities;
    expect(abilities?.[1]).toEqual({
      kind: 'mana',
      cost: [{ kind: 'removeCounters', counter: 'charge', count: 1 }],
      production: { kind: 'anyColor' },
      oncePerTurn: true,
    });
    expect(abilities?.[2]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'upkeep', whose: 'you' },
      effect: { kind: 'moveToZone', objects: THIS, to: 'hand' },
      interveningIf: {
        kind: 'amountIs',
        amount: { kind: 'countersOn', of: THIS, counter: 'charge' },
        compare: { cmp: 'equal', value: 0 },
      },
    });
  });

  test("Alchemist's Refuge: the activated ability grants the permission until end of turn", () => {
    expect(real("Alchemist's Refuge").definition.faces[0]?.abilities[1]).toEqual({
      kind: 'activated',
      cost: [{ kind: 'mana', symbols: ['G', 'U'] }, { kind: 'tap' }],
      effect: {
        kind: 'grantCastAsThoughFlash',
        player: { kind: 'you' },
        duration: 'untilEndOfTurn',
      },
    });
  });
});

describe('lines that are not read', () => {
  const artifact = (text: string) =>
    parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Parsed Refused',
        typeLine: 'Land',
        oracleText: text.replaceAll('~', 'SYNTHETIC Parsed Refused'),
      }),
    ).support.status;

  test('the same shape with the real words is supported (the near misses below change one thing each)', () => {
    expect(
      artifact(
        '{T}: Add {G}{U}. Spend this mana only to cast spells with mana value 5 or greater.',
      ),
    ).toBe('supported');
    expect(artifact('{G}{U}, {T}: You may cast spells this turn as though they had flash.')).toBe(
      'supported',
    );
  });

  test.each([
    // the quality of the spell is not a mana value "or greater"
    '{T}: Add {G}{U}. Spend this mana only to cast spells with mana value 5 or less.',
    '{T}: Add {G}{U}. Spend this mana only to cast spells with flying.',
    // X mana with nothing that says what X is, or a count that is not one color
    '{T}: Add X mana of any one color.',
    "{T}: Add X mana of any color, where X is ~'s power.",
    // a color chosen by nothing before it
    '{T}: Add one mana of that color for each charge counter on ~.',
    '{T}: Add one mana of that color.',
    // a permission that says more than the engine reads
    '{G}{U}, {T}: You may cast creature spells this turn as though they had flash.',
    '{G}{U}, {T}: You may cast spells this turn as though they had flash and draw a card.',
  ])('is not supported: %s', (text) => {
    expect(artifact(text)).not.toBe('supported');
  });
});

describe('the engine runs what the grammar lowered', () => {
  const TROYAN_LINE =
    '{T}: Add {G}{U}. Spend this mana only to cast spells with mana value 5 or greater or spells with {X} in their mana costs.';

  test('Troyan: its mana pays a mana value 5 spell and an {X} spell, and not a cheap one', () => {
    const rock = parsed('SYNTHETIC Parsed Troyan', 'Artifact', TROYAN_LINE, { manaCost: '{2}' });
    const big = base()
      .define(rock)
      .hand('SYNTHETIC Big Sorcery')
      .battlefield(rock.name, 'Forest', 'Forest', 'Forest')
      .at('precombatMain')
      .build();
    big.expect.legal(0, { cast: 'SYNTHETIC Big Sorcery' });
    big.act(0).cast('SYNTHETIC Big Sorcery', { pay: true });
    big.passAll();
    big.expect.life(0, 45);

    const cheap = base()
      .define(rock)
      .hand('SYNTHETIC Small Sorcery')
      .battlefield(rock.name)
      .at('precombatMain')
      .build();
    cheap.expect.illegal(0, { cast: 'SYNTHETIC Small Sorcery' });

    const x = base()
      .define(rock)
      .hand('SYNTHETIC X Sorcery')
      .battlefield(rock.name)
      .battlefield('Forest')
      .at('precombatMain')
      .build();
    x.act(0).cast('SYNTHETIC X Sorcery').x(0).payManual([rock.name, 'Forest']);
    x.passAll();
    x.expect.tapped(rock.name);
  });

  test('Kami: X mana of the color named, X the power now', () => {
    const kami = parsed(
      'SYNTHETIC Parsed Kami',
      'Creature — Spirit',
      "{T}: Add X mana of any one color, where X is ~'s power.",
      { manaCost: '{2}{G}', power: '1', toughness: '1', colors: ['G'] },
    );
    const g = base()
      .define(kami)
      .battlefield(kami.name, { counters: { '+1/+1': 2 } })
      .at('precombatMain')
      .build();
    g.act(0).tapForMana(kami.name, { color: 'W' });
    g.expect.pool(0, 'WWW');
  });

  test('Astral Cornucopia: enters with X charge counters, taps for that many mana of a color', () => {
    const horn = parsed(
      'SYNTHETIC Parsed Cornucopia',
      'Artifact',
      'This artifact enters with X charge counters on it.\n{T}: Choose a color. Add one mana of that color for each charge counter on this artifact.',
      { manaCost: '{X}{X}{X}' },
    );
    const g = base()
      .define(horn)
      .hand(horn.name)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .at('precombatMain')
      .build();
    g.act(0).cast(horn.name).x(2).pay();
    g.passAll();
    g.expect.counters(horn.name, { charge: 2 });
    g.act(0).tapForMana(horn.name, { color: 'U' });
    g.expect.pool(0, 'UU');
  });

  test('Mana Bloom: X counters, one mana each turn for a counter, back to the hand when empty', () => {
    const bloom = parsed(
      'SYNTHETIC Parsed Bloom',
      'Enchantment',
      "This enchantment enters with X charge counters on it.\nRemove a charge counter from this enchantment: Add one mana of any color. Activate only once each turn.\nAt the beginning of your upkeep, if this enchantment has no charge counters on it, return it to its owner's hand.",
      { manaCost: '{X}{G}', colors: ['G'] },
    );
    const g = base()
      .define(bloom)
      .hand(bloom.name)
      .battlefield('Forest', 'Forest', 'Forest')
      .at('precombatMain')
      .build();
    g.act(0).cast(bloom.name).x(2).pay();
    g.passAll();
    g.expect.counters(bloom.name, { charge: 2 });
    g.act(0).tapForMana(bloom.name, { color: 'R' });
    g.expect.counters(bloom.name, { charge: 1 });
    expect(g.act(0).try.tapForMana(bloom.name, { color: 'R' }).ok).toBe(false);
    // The turn after next (its controller's): one more counter goes, and the card has none left.
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.zone(bloom.name, 'battlefield');
    g.passAll();
    g.act(0).tapForMana(bloom.name, { color: 'G' });
    g.expect.counters(bloom.name, { charge: 0 });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    g.expect.zone(bloom.name, 'hand');
  });

  test("Alchemist's Refuge: after the ability a sorcery can be cast in the end step", () => {
    const land = parsed(
      'SYNTHETIC Parsed Refuge',
      'Land',
      '{T}: Add {C}.\n{G}{U}, {T}: You may cast spells this turn as though they had flash.',
    );
    const g = base()
      .define(land)
      .hand('SYNTHETIC Small Sorcery')
      .battlefield(land.name)
      .battlefield('Forest', { label: 'f1' })
      .battlefield('Island', { label: 'i1' })
      .battlefield('Forest', { label: 'f2' })
      .battlefield('Forest', { label: 'f3' })
      .at('precombatMain')
      .build();
    g.act(0).activate(land.name, { ability: 1 }).payManual(['f1', 'i1']);
    g.passAll();
    g.advanceTo('end');
    g.expect.legal(0, { cast: 'SYNTHETIC Small Sorcery' });
    g.act(0).cast('SYNTHETIC Small Sorcery', { pay: true });
    g.passAll();
    g.expect.life(0, 42);
  });
});
