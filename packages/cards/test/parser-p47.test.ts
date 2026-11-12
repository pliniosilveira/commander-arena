// Stage P47 (D-200 and D-200): the planeswalker lines. The cards are the real planeswalkers and the real cards of the Vraska deck of the owner's golden
// corpus (`fixtures/corpus/golden.jsonl`, real Oracle text, extracted with `pnpm corpus:extract`): the lessons of the Korvold program (Lobelia read at
// SYNTHETIC text and failed at the real one) are why the grammar is driven from these lines. The near misses are SYNTHETIC.
import { readFileSync } from 'node:fs';
import type { Ability, Cost } from '@commander-arena/engine';
import { validateCard } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const CORPUS = new URL('./fixtures/corpus/golden.jsonl', import.meta.url);
const cards: readonly GoldenCard[] = parseGolden(readFileSync(CORPUS, 'utf8'));

/** A real card of the corpus, through the grammar only. */
function real(name: string) {
  const card = cards.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  return importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
}

const loyaltyOf = (a: Ability): number | 'x' | null => {
  if (a.kind !== 'activated') return null;
  const c = a.cost.find((x): x is Extract<Cost, { kind: 'loyalty' }> => x.kind === 'loyalty');
  return c === undefined ? null : c.change;
};

describe('the real planeswalkers that read completely', () => {
  test.each([
    ['Garruk Wildspeaker', [1, -1, -4]],
    ['Jace Beleren', [2, -1, -10]],
    ["Elspeth, Sun's Champion", [1, -3, -7]],
    ['Gideon, Ally of Zendikar', [1, 0, -4]],
    ['Vraska, Relic Seeker', [2, -3, -10]],
  ])('%s is supported, with the loyalty symbols of its lines', (name, symbols) => {
    const imported = real(name);
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.reasons).toEqual([]);
    expect(imported.support.status).toBe('supported');
    expect(validateCard(imported.definition)).toEqual([]);
    const abilities = imported.definition.faces[0]?.abilities ?? [];
    expect(abilities.map(loyaltyOf).filter((c) => c !== null)).toEqual(symbols);
  });

  test('the loyalty abilities carry no timing and no once-per-turn of their own: the engine derives both from the symbol (CR 606.3)', () => {
    const abilities = real('Garruk Wildspeaker').definition.faces[0]?.abilities ?? [];
    for (const a of abilities) {
      if (a.kind === 'activated') {
        expect(a.timing).toBeUndefined();
        expect(a.oncePerTurn).toBeUndefined();
      }
    }
  });
});

describe('the cards of the Vraska deck that need planeswalkers', () => {
  test("Protege's Awakening: Empower Jace 6, then draw a card", () => {
    const imported = real("Protege's Awakening");
    expect(imported.support.status).toBe('supported');
    expect(imported.definition.faces[0]?.spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'empowerJace', amount: 6 },
        { kind: 'draw', player: { kind: 'you' }, count: 1 },
      ],
    });
  });

  test('Keeper of the Quiet Hour: "When this creature enters, empower Jace 2."', () => {
    const imported = real('Keeper of the Quiet Hour');
    expect(imported.support.status).toBe('supported');
    expect(imported.definition.faces[0]?.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: { kind: 'empowerJace', amount: 2 },
      },
    ]);
  });

  test("Theorist's Sanctum and Forge of Heroes are read in groups 3 and 4 of the Vraska deck, each on the line that needed more than planeswalkers", () => {
    expect(real("Theorist's Sanctum").support.status).toBe('supported');
    expect(real('Forge of Heroes').support.status).toBe('supported');
  });
});

describe("Elspeth, Sun's Champion: the emblem of her ultimate", () => {
  test('"You get an emblem with ..." is the engine\'s createEmblem, with the static abilities of the quotes and the text', () => {
    const ultimate = real("Elspeth, Sun's Champion").definition.faces[0]?.abilities[2];
    expect(ultimate?.kind === 'activated' && ultimate.effect).toMatchObject({
      kind: 'createEmblem',
      text: 'Creatures you control get +2/+2 and have flying.',
    });
    const effect = ultimate?.kind === 'activated' ? ultimate.effect : null;
    if (effect?.kind !== 'createEmblem') throw new Error('expected createEmblem');
    expect(effect.abilities.map((a) => a.kind)).toEqual(['static', 'static']);
  });
});

describe('Gideon, Ally of Zendikar: a planeswalker that becomes a creature that is still a planeswalker', () => {
  test('"Until end of turn, ~ becomes a 5/5 Human Soldier Ally creature with indestructible that\'s still a planeswalker. Prevent all damage that would be dealt to him this turn."', () => {
    const plus = real('Gideon, Ally of Zendikar').definition.faces[0]?.abilities[0];
    if (plus?.kind !== 'activated' || plus.effect.kind !== 'sequence')
      throw new Error('expected a sequence');
    const kinds = plus.effect.effects.map((e) => e.kind);
    expect(kinds).toEqual(['setTypes', 'setPt', 'grantKeyword', 'preventDamage']);
    expect(plus.effect.effects[0]).toMatchObject({
      kind: 'setTypes',
      types: ['creature'],
      subtypes: ['Human', 'Soldier', 'Ally'],
      additive: true,
      duration: 'untilEndOfTurn',
    });
    expect(plus.effect.effects[1]).toMatchObject({ kind: 'setPt', power: 5, toughness: 5 });
    expect(plus.effect.effects[3]).toMatchObject({
      kind: 'preventDamage',
      scope: 'all',
      to: { kind: 'this' },
    });
  });
});

describe('Vraska, Relic Seeker: "Target player\'s life total becomes 1."', () => {
  test("is the engine's setLifeTotal on the target", () => {
    const ultimate = real('Vraska, Relic Seeker').definition.faces[0]?.abilities[2];
    expect(ultimate?.kind === 'activated' && ultimate.effect).toEqual({
      kind: 'setLifeTotal',
      player: { kind: 'target', id: 't1' },
      amount: 1,
    });
  });
});

describe('Lavalanche: "target player or planeswalker" is a real target now (D-200)', () => {
  test("the target is a player or a planeswalker, and the creatures hit are those of the player or of the planeswalker's controller", () => {
    const spell = real('Lavalanche').definition.faces[0]?.spell;
    expect(spell?.targets).toEqual([
      {
        id: 't1',
        what: { kind: 'playerOrObject', player: 'any', filter: { types: ['planeswalker'] } },
      },
    ]);
  });
});

describe('what the real planeswalkers still stop at (no card is half read)', () => {
  const stops: readonly [string, RegExp][] = [
    ['Chandra, Torch of Defiance', /You may cast that card/],
    // Vraska, Golgari Queen stopped at "that player loses the game" until D-269 taught the engine that effect (CR 104.3e); it is supported now and
    // `convert-grammar-engine-p92-destiny.test.ts` plays its emblem.
    ['Ugin, the Spirit Dragon', /Exile each permanent/],
    ['Liliana of the Veil', /two piles/],
    ['Jace, the Mind Sculptor', /bottom of that player/],
    ['Nissa, Who Shakes the World', /noncreature land/],
    ['Gideon Jura', /attack ~ if able/],
    ['Tamiyo, Compleated Sage', /Compleated/],
    ['Narset, Parter of Veils', /can't draw more than one card/],
  ];
  test.each(stops)(
    '%s is unsupported at a line that needs more than a planeswalker',
    (name, stoppedAt) => {
      const imported = real(name);
      expect(imported.support.status).toBe('unsupported');
      expect(imported.support.unparsed.map((u) => u.text).join('\n')).toMatch(stoppedAt);
    },
  );
});

describe('the loyalty line', () => {
  const walker = (text: string, typeLine = 'Legendary Planeswalker — Test') =>
    parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Parsed Walker',
        typeLine,
        manaCost: '{2}{U}',
        oracleText: text,
        loyalty: '4',
        ...(typeLine.includes('Creature') ? { power: '2', toughness: '2' } : {}),
      }),
    );

  test('reads the signs Oracle text and the rules text write: U+2212, a hyphen, an en dash, square brackets', () => {
    for (const sign of ['−', '-', '–']) {
      const imported = walker(`+1: Draw a card.\n${sign}2: Draw two cards.\n0: Draw three cards.`);
      expect(imported.support.status, sign).toBe('supported');
      expect((imported.definition.faces[0]?.abilities ?? []).map(loyaltyOf), sign).toEqual([
        1, -2, 0,
      ]);
    }
    const bracketed = walker('[+1]: Draw a card.\n[−2]: Draw two cards.\n[0]: Draw three cards.');
    expect(bracketed.support.status).toBe('supported');
    expect((bracketed.definition.faces[0]?.abilities ?? []).map(loyaltyOf)).toEqual([1, -2, 0]);
  });

  test('"−X" is a loyalty cost with an X the effect may read', () => {
    const imported = walker('−X: ~ deals X damage to any target.');
    expect(imported.support.status).toBe('supported');
    expect(imported.definition.faces[0]?.abilities.map(loyaltyOf)).toEqual(['x']);
  });

  test('a loyalty line on a face that is not a planeswalker is read and not run', () => {
    const imported = walker('+1: Draw a card.', 'Creature — Wizard');
    expect(imported.support.status).toBe('unsupported');
  });

  test('a loyalty ability with a restriction of its own, or a second cost, is not run', () => {
    expect(walker('+1: Draw a card. Activate only once each turn.').support.status).toBe(
      'unsupported',
    );
    expect(walker('+1, {T}: Draw a card.').support.status).toBe('unsupported');
  });

  test('a mana ability of a loyalty line uses the stack: "+1: Add {R}{R}." is an activated ability, never a mana ability (CR 606.2, 605.1a)', () => {
    const imported = walker('+1: Add {R}{R}.');
    expect(imported.support.status).toBe('supported');
    const [ability] = imported.definition.faces[0]?.abilities ?? [];
    expect(ability?.kind).toBe('activated');
  });

  test('the effects read with the choices of a triggered ability: "You may sacrifice another permanent. If you do, ..."', () => {
    const imported = walker(
      '+2: You may sacrifice another permanent. If you do, you gain 1 life and draw a card.',
    );
    expect(imported.support.status).toBe('supported');
  });

  test('a loyalty line is checked before the replacement test: "... would be put into your graveyard, exile it instead" stays an activated ability line', () => {
    const imported = walker(
      '−3: You may cast target instant or sorcery card from your graveyard this turn. If that spell would be put into your graveyard, exile it instead.',
    );
    // The effect is not one the grammar reads (the line stops there), but it is read as a loyalty ability, not as a replacement effect.
    expect(imported.support.unparsed[0]?.closestRule).not.toMatch(/^replacement\./);
  });
});

describe('"~ can be your commander."', () => {
  test('is a keyword with no effect in the game, on the cards that say it', () => {
    for (const name of ['Lord Windgrace', 'Nahiri, the Lithomancer', 'Teferi, Temporal Archmage']) {
      const faces = real(name).definition.faces[0]?.abilities ?? [];
      expect(
        faces.some((a) => a.kind === 'keyword' && a.keyword.kind === 'canBeCommander'),
        name,
      ).toBe(true);
    }
  });

  test('only the card itself, in the words of the rule', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Parsed Walker',
        typeLine: 'Legendary Planeswalker — Test',
        manaCost: '{2}{U}',
        oracleText: 'SYNTHETIC Parsed Walker can be your commander.',
        loyalty: '4',
      }),
    );
    expect(imported.support.status).toBe('supported');
    const other = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Parsed Walker',
        typeLine: 'Legendary Planeswalker — Test',
        manaCost: '{2}{U}',
        oracleText: 'Your commander can be your commander.',
        loyalty: '4',
      }),
    );
    expect(other.support.status).toBe('unsupported');
  });
});

describe('emblems and Empower Jace: the near misses', () => {
  const sorcery = (text: string) =>
    parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Parsed Rite',
        typeLine: 'Sorcery',
        manaCost: '{2}{U}',
        oracleText: text,
      }),
    );

  test('an emblem with an ability that is not static or triggered, or with text that is not an ability, is not read', () => {
    expect(sorcery('You get an emblem with "Draw a card."').support.status).toBe('unsupported');
    expect(sorcery('You get an emblem with "{T}: Draw a card."').support.status).toBe(
      'unsupported',
    );
    expect(
      sorcery('Target player gets an emblem with "Creatures you control get +1/+1."').support
        .status,
    ).toBe('unsupported');
  });

  test('a "this emblem" in the emblem is the emblem', () => {
    const imported = sorcery(
      'You get an emblem with "Whenever you cast a spell, this emblem deals 5 damage to any target."',
    );
    expect(imported.support.status).toBe('supported');
    const effect = imported.definition.faces[0]?.spell?.effect;
    if (effect?.kind !== 'createEmblem') throw new Error('expected createEmblem');
    const [trigger] = effect.abilities;
    // The damage is dealt by the emblem (the source of its own ability) to the "any target" the trigger chose.
    expect(trigger?.kind === 'triggered' && trigger.effect).toMatchObject({
      kind: 'dealDamage',
      amount: 5,
      to: { kind: 'target', id: 't1' },
    });
    expect(trigger?.kind === 'triggered' && trigger.targets).toEqual([
      { id: 't1', what: { kind: 'anyTarget' } },
    ]);
  });

  test('Empower Jace takes a number: not X, not 0, not another name', () => {
    expect(sorcery('Empower Jace 3.').support.status).toBe('supported');
    expect(sorcery('Empower Jace X.').support.status).toBe('unsupported');
    expect(sorcery('Empower Jace 0.').support.status).toBe('unsupported');
    expect(sorcery('Empower Gideon 3.').support.status).toBe('unsupported');
  });
});
