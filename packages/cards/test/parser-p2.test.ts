// Stage P2 (D-063, D-075): the phrase rules that reach the engine's activated abilities, library
// search, discard, Cycling and "until end of turn" effects from Oracle text. Each describe block is
// one family of rules, read through the whole pipeline and compared with the AST the engine's
// SYNTHETIC fixtures spell out by hand (synthetic-abilities.ts, synthetic-search.ts) or with
// a node written out here. Lines come from the backlog (reports/backlog.md, numbers as printed) or
// say SYNTHETIC. Nothing here is a real card.
import {
  type Ability,
  type Effect,
  syntheticCard as engineSynthetic,
  SUPPORTED_FEATURES,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import {
  ALL_RULES,
  bind,
  buildRuleSet,
  compileLine,
  DEFAULT_RULES,
  DEFAULT_SPELL_RULES,
  parseFaceText,
  readLine,
} from '../src/convert/parser/index';
import { anaphor, clause, spell as irSpell, noun } from './parser-ir-helpers';

const OPTS = { name: 'SYNTHETIC Card', legendary: false };
const SET = buildRuleSet(ALL_RULES);

function abilitiesOf(text: string): readonly Ability[] {
  const parsed = parseFaceText(text, OPTS, 0);
  if (parsed.unparsed.length > 0) throw new Error(`"${text}": ${JSON.stringify(parsed.unparsed)}`);
  return parsed.abilities;
}

function spellEffect(text: string): Effect | undefined {
  const parsed = parseFaceText(text, OPTS, 0, DEFAULT_RULES, DEFAULT_SPELL_RULES);
  if (parsed.unparsed.length > 0) throw new Error(`"${text}": ${JSON.stringify(parsed.unparsed)}`);
  return parsed.spell?.effect;
}

const fixtureAbilities = (name: string) => engineSynthetic(name).faces[0]?.abilities;
const fixtureEffect = (name: string) => engineSynthetic(name).faces[0]?.spell?.effect;

const THIS = { kind: 'this' } as const;
const YOU = { kind: 'you' } as const;
const tap = { kind: 'tap' } as const;
const mana = (...symbols: string[]) => ({ kind: 'mana', symbols }) as const;
const BASIC_LAND = { types: ['land'], supertypes: ['basic'] };

describe('activated abilities equal the engine fixtures', () => {
  test.each([
    ['SYNTHETIC Pump Bear', '{1}: ~ gets +1/+1 until end of turn.'],
    ['SYNTHETIC Firebreather', '{R}: ~ gets +1/+0 until end of turn.'],
    ['SYNTHETIC Coach', '{T}: Target creature gets +2/+2 until end of turn.'],
    ['SYNTHETIC Altar', 'Sacrifice a creature: You gain 2 life.'],
    ['SYNTHETIC Snack', '{2}, {T}, Sacrifice ~: You gain 3 life.'],
    ['SYNTHETIC Life Tap', '{T}, Pay 2 life: Draw a card.'],
    ['SYNTHETIC Slow Scholar', '{1}: Draw a card. Activate only as a sorcery.'],
  ])('%s', (name, text) => {
    expect(abilitiesOf(text)).toEqual(fixtureAbilities(name));
  });

  test('a counter cost: "Remove a charge counter from ~: You gain 1 life."', () => {
    expect(abilitiesOf('Remove a charge counter from ~: You gain 1 life.')).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'removeCounters', counter: 'charge', count: 1 }],
        effect: { kind: 'gainLife', player: YOU, amount: 1 },
      },
    ]);
  });

  test('costs keep the order of the text, and the body is the same sentence grammar as a trigger', () => {
    expect(abilitiesOf('{1}, {T}, Sacrifice ~: Draw a card, then discard a card.')).toEqual([
      {
        kind: 'activated',
        cost: [mana('1'), tap, { kind: 'sacrifice', what: THIS }],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'draw', player: YOU, count: 1 },
            { kind: 'discard', player: YOU, count: 1 },
          ],
        },
      },
    ]);
  });

  test('"Sacrifice another creature" keeps the other-than-this restriction in the cost filter', () => {
    expect(abilitiesOf('Sacrifice another creature: Draw a card.')).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'sacrifice', what: { types: ['creature'], other: true } }],
        effect: { kind: 'draw', player: YOU, count: 1 },
      },
    ]);
  });

  test('"Activate only as a sorcery." is timing, and no other restriction is read', () => {
    expect(abilitiesOf('{1}: Draw a card. Activate only as a sorcery.')[0]).toMatchObject({
      timing: 'sorcery',
    });
    const refused = parseFaceText('{1}: Draw a card. Activate only during your turn.', OPTS, 0);
    expect(refused.abilities).toEqual([]);
    expect(refused.unparsed[0]).toMatchObject({ slot: 'restriction' });
  });

  test('a mana ability that sacrifices itself stays a mana ability (CR 605.1a)', () => {
    expect(abilitiesOf('{T}, Sacrifice ~: Add one mana of any color.')).toEqual([
      {
        kind: 'mana',
        cost: [tap, { kind: 'sacrifice', what: THIS }],
        production: { kind: 'anyColor' },
      },
    ]);
  });

  test('a mana ability paid by the sacrifice of itself alone has no {T}', () => {
    expect(abilitiesOf('Sacrifice ~: Add {R}{R}.')).toEqual([
      {
        kind: 'mana',
        cost: [{ kind: 'sacrifice', what: THIS }],
        production: { kind: 'fixed', mana: ['R', 'R'] },
      },
    ]);
  });

  test('costs the grammar cannot read, and costs the engine cannot pay, are reported apart', () => {
    const result = compileLine('{T}, Exile a card from your hand: Draw a card.', {
      rules: SET,
      face: 'permanent',
    });
    // The cost is not read at all, which is a grammar gap, not an engine one (a discard is read
    // since stage P13).
    expect(result).toMatchObject({ ok: false, failure: { reason: 'unrecognised', slot: 'cost' } });
    // Two permanents sacrificed is a cost of an ordinary activated ability since D-133 (stage P29); not of a mana ability.
    const sacrificeTwo = compileLine('{T}, Sacrifice two creatures: Add {C}{C}.', {
      rules: SET,
      face: 'permanent',
    });
    expect(sacrificeTwo).toMatchObject({
      ok: false,
      failure: { reason: 'notRunnable', closestRule: 'cost.sacrifice' },
    });
  });
});

describe('mana abilities the engine cannot represent are never built as activations', () => {
  const failure = (text: string) => {
    const r = compileLine(text, { rules: SET, face: 'permanent' });
    if (r.ok) throw new Error(`"${text}" lowered`);
    return r.failure;
  };

  test('an extra effect names the `manaAlso:` feature that is missing (CR 605.1a)', () => {
    expect(failure('{T}: Add {G}. Draw a card.')).toMatchObject({
      reason: 'notRunnable',
      needs: ['manaAlso:draw'],
    });
    expect(failure('{T}: Add {G}. You may draw a card.')).toMatchObject({ reason: 'unrecognised' });
  });

  test('a cost the engine does not pay for mana names the `manaCost:` feature', () => {
    // "Pay N life" was this test's example until the engine learned to pay life for a mana ability
    // (D-099, `manaCost:payLife`; it is a mana ability now, see parser-p14.test.ts). Removing a counter
    // is still a cost the engine pays only for an ordinary activation.
    expect(failure('Remove a charge counter from ~: Add {G}.')).toMatchObject({
      reason: 'notRunnable',
      needs: ['manaCost:removeCounters'],
    });
  });

  test('a target after the mana makes it an ordinary activation (not a mana ability)', () => {
    // With a fixed colour the engine can run it; the colour choice of "{U} or {B}" it cannot.
    const ok = compileLine('{T}: Add {G}. ~ deals 1 damage to target creature.', {
      rules: SET,
      face: 'permanent',
    });
    expect(ok).toMatchObject({ ok: true, kind: 'abilities' });
    if (ok.ok && ok.kind === 'abilities') expect(ok.abilities[0]?.kind).toBe('activated');
    expect(failure('{T}: Add {U} or {B}. ~ deals 1 damage to target creature.')).toMatchObject({
      reason: 'notRunnable',
      needs: ['selector:colorChoice'],
    });
  });

  test('no ability that adds mana with no target is ever an `activated` ability', () => {
    for (const text of [
      '{T}: Add {G}. Draw a card.',
      '{T}: Add {G}. Activate only as a sorcery.',
      '{1}: Add {G}.',
      '{T}, {T}: Add {G}.',
    ]) {
      const r = compileLine(text, { rules: SET, face: 'permanent' });
      expect(r.ok, text).toBe(false);
    }
  });
});

describe('durations and "gets +N/+N until end of turn"', () => {
  test('the pump is a modifyPt with the one duration the engine runs', () => {
    expect(spellEffect('Target creature gets -2/-2 until end of turn.')).toEqual({
      kind: 'modifyPt',
      objects: { kind: 'target', id: 't1' },
      power: -2,
      toughness: -2,
      duration: 'untilEndOfTurn',
    });
    expect(abilitiesOf('{1}{U}: ~ gets +1/-1 until end of turn.')).toEqual([
      {
        kind: 'activated',
        cost: [mana('1', 'U')],
        effect: {
          kind: 'modifyPt',
          objects: THIS,
          power: 1,
          toughness: -1,
          duration: 'untilEndOfTurn',
        },
      },
    ]);
  });

  test('"creatures you control" is every matching creature as the effect resolves (CR 611.2c)', () => {
    expect(spellEffect('Creatures you control get +1/+1 until end of turn.')).toEqual({
      kind: 'modifyPt',
      objects: {
        kind: 'each',
        filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
      },
      power: 1,
      toughness: 1,
      duration: 'untilEndOfTurn',
    });
  });

  test('a duration on a verb that does not take one is not lowered', () => {
    const r = compileLine('Tap target creature until end of turn.', { rules: SET, face: 'spell' });
    expect(r.ok).toBe(false);
  });

  test('the engine features named are the ones it declares', () => {
    expect(SUPPORTED_FEATURES.durationKinds).toContain('untilEndOfTurn');
    expect(SUPPORTED_FEATURES.effectKinds).toContain('modifyPt');
  });
});

describe('library search equals the engine fixtures and reads the words of the text', () => {
  test.each([
    [
      'SYNTHETIC Land Fetch',
      'Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.',
    ],
    [
      'SYNTHETIC Forest Fetch',
      'Search your library for a Forest card, put that card onto the battlefield, then shuffle.',
    ],
    [
      'SYNTHETIC Creature Tutor',
      'Search your library for a creature card, reveal it, put it into your hand, then shuffle.',
    ],
  ])('%s', (name, text) => {
    expect(spellEffect(text)).toEqual(fixtureEffect(name));
  });

  test('Cultivate: up to two, revealed, one tapped onto the battlefield and the other into the hand', () => {
    expect(
      spellEffect(
        'Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.',
      ),
    ).toEqual({
      kind: 'search',
      player: YOU,
      filter: BASIC_LAND,
      max: 2,
      destinations: [
        { zone: 'battlefield', tapped: true, count: 1 },
        { zone: 'hand', count: 1 },
      ],
      reveal: true,
      shuffle: true,
    });
  });

  test('Farseek: a choice of land types is anyOf over subtypes, with no basic supertype', () => {
    expect(
      spellEffect(
        'Search your library for a Plains, Island, Swamp, or Mountain card, put it onto the battlefield tapped, then shuffle.',
      ),
    ).toEqual({
      kind: 'search',
      player: YOU,
      filter: {
        anyOf: [
          { subtypes: ['Plains'] },
          { subtypes: ['Island'] },
          { subtypes: ['Swamp'] },
          { subtypes: ['Mountain'] },
        ],
      },
      max: 1,
      destinations: [{ zone: 'battlefield', tapped: true, count: 1 }],
      reveal: false,
      shuffle: true,
    });
  });

  test('"a card" is an empty filter, and a plural puts every card at one place', () => {
    expect(
      spellEffect('Search your library for a card, put that card into your hand, then shuffle.'),
    ).toEqual({
      kind: 'search',
      player: YOU,
      filter: {},
      max: 1,
      destinations: [{ zone: 'hand', count: 1 }],
      reveal: false,
      shuffle: true,
    });
    expect(
      spellEffect(
        'Search your library for up to three Forest cards, put them into your graveyard, then shuffle.',
      ),
    ).toMatchObject({
      max: 3,
      filter: { subtypes: ['Forest'] },
      destinations: [{ zone: 'graveyard', count: 3 }],
    });
  });

  test('the pronouns agree with the noun, and anything else is not read', () => {
    for (const text of [
      'Search your library for a card, put them into your hand, then shuffle.',
      'Search your library for up to two basic land cards, put it onto the battlefield, then shuffle.',
      'Search your library for a card, reveal those cards, put it into your hand, then shuffle.',
      'Search your library for up to three basic land cards, put one onto the battlefield and the other into your hand, then shuffle.',
      'Search their library for a card, put it into your hand, then shuffle.',
      'Search your library for a card, put it on top of your library, then shuffle.',
    ]) {
      expect(
        parseFaceText(text, OPTS, 0, DEFAULT_RULES, DEFAULT_SPELL_RULES).unparsed,
        text,
      ).toHaveLength(1);
    }
  });

  test('the zone of the IR filter is the library, and the engine filter leaves it out', () => {
    const ir = readLine(
      'Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.',
      'spell',
      SET,
    );
    if (!ir.ok) throw new Error('not read');
    const [ability] = ir.abilities;
    if (ability?.kind !== 'spell') throw new Error('not a spell');
    const cards = ability.body.sentences[0]?.clauses[0]?.args.cards;
    expect(cards).toMatchObject({
      kind: 'noun',
      det: 'a',
      filter: { zone: 'library', card: true, types: ['land'], supertypes: ['basic'] },
    });
  });
});

describe('discard, Cycling and a choice of types', () => {
  test("discard in the engine fixtures' shapes", () => {
    expect(spellEffect('Draw a card, then discard a card.')).toEqual(
      fixtureEffect('SYNTHETIC Loot'),
    );
    expect(spellEffect('Each player discards a card.')).toEqual(
      fixtureEffect('SYNTHETIC Each Player Discards'),
    );
    expect(spellEffect('Discard two cards.')).toEqual({ kind: 'discard', player: YOU, count: 2 });
    expect(spellEffect('Target opponent discards a card.')).toEqual({
      kind: 'discard',
      player: { kind: 'target', id: 't1' },
      count: 1,
    });
  });

  test('Cycling {2} and Cycling—Pay 2 life', () => {
    expect(abilitiesOf('Cycling {2}')).toEqual(fixtureAbilities('SYNTHETIC Cycling Bear'));
    expect(abilitiesOf('Cycling—Pay 2 life')).toEqual(fixtureAbilities('SYNTHETIC Life Cycler'));
    expect(abilitiesOf('Cycling {1}{U}')).toEqual([
      { kind: 'keyword', keyword: { kind: 'cycling', cost: [mana('1', 'U')] } },
    ]);
  });

  test('a land with a mana ability and Cycling on its own line', () => {
    expect(abilitiesOf('{T}: Add {G}.\nCycling {1}')).toEqual(
      fixtureAbilities('SYNTHETIC Cycling Land'),
    );
  });

  test('"artifact or enchantment" is anyOf on the outer filter, which keeps the zone', () => {
    expect(spellEffect('Destroy target artifact or enchantment.')).toEqual({
      kind: 'destroy',
      objects: { kind: 'target', id: 't1' },
    });
    const parsed = parseFaceText(
      'Destroy target artifact or enchantment.',
      OPTS,
      0,
      DEFAULT_RULES,
      DEFAULT_SPELL_RULES,
    );
    expect(parsed.spell?.targets).toEqual([
      {
        id: 't1',
        what: {
          kind: 'object',
          filter: {
            zone: 'battlefield',
            anyOf: [{ types: ['artifact'] }, { types: ['enchantment'] }],
          },
        },
      },
    ]);
  });

  test('"creature or planeswalker" keeps planeswalker as a type, with the controller on the outer filter', () => {
    const parsed = parseFaceText(
      '~ deals 3 damage to target creature or planeswalker you don’t control.',
      OPTS,
      0,
      DEFAULT_RULES,
      DEFAULT_SPELL_RULES,
    );
    expect(parsed.spell?.targets?.[0]?.what).toEqual({
      kind: 'object',
      filter: {
        zone: 'battlefield',
        controller: 'opponent',
        anyOf: [{ types: ['creature'] }, { types: ['planeswalker'] }],
      },
    });
  });

  test('a list of four types reads as one choice', () => {
    const parsed = parseFaceText(
      'Exile target artifact, creature, enchantment, or land.',
      OPTS,
      0,
      DEFAULT_RULES,
      DEFAULT_SPELL_RULES,
    );
    expect(parsed.spell?.targets?.[0]?.what).toMatchObject({
      filter: {
        anyOf: [
          { types: ['artifact'] },
          { types: ['creature'] },
          { types: ['enchantment'] },
          { types: ['land'] },
        ],
      },
    });
  });
});

describe('the binding pass and a choice of types', () => {
  test('"that creature" cannot mean a target that is an artifact or an enchantment', () => {
    const choice = noun('target', 'target artifact or enchantment', {
      zone: 'battlefield',
      anyOf: [
        { types: ['artifact'], raw: 'artifact' },
        { types: ['enchantment'], raw: 'enchantment' },
      ],
    });
    const unbound = bind(
      irSpell(
        [clause('destroy', { objects: choice })],
        [clause('tap', { objects: anaphor('that creature') })],
      ),
    );
    expect(unbound).toMatchObject({ ok: false, reason: 'unboundReference' });
    const bound = bind(
      irSpell(
        [clause('destroy', { objects: choice })],
        [clause('tap', { objects: anaphor('it') })],
      ),
    );
    expect(bound.ok).toBe(true);
  });
});
