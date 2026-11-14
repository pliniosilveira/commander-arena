// The S1 grammar, rule by rule: the enters replacements and the effect clauses of instants and
// sorceries, with the diagnostics of what stays unparsed.
import { type Effect, SUPPORTED_FEATURES } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import {
  DEFAULT_RULES,
  DEFAULT_SPELL_RULES,
  matchAbility,
  NO_RULE,
  parseFaceText,
} from '../src/index';
import { parseOnly, spellCard } from './convert-grammar-helpers';
import { syntheticFace } from './convert-helpers';

const OPTS = { name: 'SYNTHETIC Test Card', legendary: false };

/** Parses text as the lines of an instant or sorcery. */
function spellFace(text: string) {
  return parseFaceText(text, OPTS, 0, DEFAULT_RULES, DEFAULT_SPELL_RULES);
}

const T1 = (filter: object) => ({ id: 't1', what: { kind: 'object', filter } });
const BF = (extra: object = {}) => ({ zone: 'battlefield', ...extra });

describe('rule replacement.enters-tapped', () => {
  test.each(['~ enters tapped.', '~ enters the battlefield tapped.', '~ Enters Tapped.'])(
    'parses %j',
    (text) => {
      expect(matchAbility(text)).toEqual({
        ok: true,
        ruleId: 'replacement.enters-tapped',
        abilities: [{ kind: 'replacement', replacement: { kind: 'entersTapped' } }],
      });
    },
  );

  test.each([
    ['~ enters tapped unless you control a creature with flying or reach.', 'or reach.'],
    ['~ enters tapped and with a +1/+1 counter on it.', 'and with a +1/+1 counter on it.'],
    ['~ enters tapped', ''],
    ['~ enters untapped.', 'untapped.'],
  ])('does not parse %j (stops at %j)', (text, stoppedAt) => {
    const m = matchAbility(text);
    expect(m.ok).toBe(false);
    if (!m.ok) expect(m.stoppedAt).toBe(stoppedAt);
  });

  test('a normalized card name makes the whole card line read', () => {
    const parsed = parseFaceText('SYNTHETIC Test Card enters the battlefield tapped.', OPTS, 0);
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toEqual([
      { kind: 'replacement', replacement: { kind: 'entersTapped' } },
    ]);
  });
});

describe('rule replacement.enters-with-counters', () => {
  test.each([
    ['~ enters with two +1/+1 counters on it.', '+1/+1', 2],
    ['~ enters with 3 +1/+1 counters on it.', '+1/+1', 3],
    ['~ enters with a +1/+1 counter on it.', '+1/+1', 1],
    ['~ enters with an +1/+1 counter on it.', '+1/+1', 1],
    ['~ enters the battlefield with four +1/+1 counters on it.', '+1/+1', 4],
    ['~ enters with ten -1/-1 counters on it.', '-1/-1', 10],
    ['~ enters with three charge counters on it.', 'charge', 3],
  ])('parses %j', (text, counter, count) => {
    expect(matchAbility(text)).toEqual({
      ok: true,
      ruleId: 'replacement.enters-with-counters',
      abilities: [
        { kind: 'replacement', replacement: { kind: 'entersWithCounters', counter, count } },
      ],
    });
  });

  test.each([
    ['~ enters with Y +1/+1 counters on it.', 'Y +1/+1 counters on it.'],
    ['~ enters with zero +1/+1 counters on it.', 'zero +1/+1 counters on it.'],
    ['~ enters with 0 +1/+1 counters on it.', '0 +1/+1 counters on it.'],
    ['~ enters with two +1/+1 counters on it and draw a card.', 'and draw a card.'],
  ])('does not parse %j (stops at %j)', (text, stoppedAt) => {
    const m = matchAbility(text);
    expect(m.ok).toBe(false);
    if (!m.ok) expect(m.stoppedAt).toBe(stoppedAt);
  });
});

describe('spell clauses: damage', () => {
  test.each([
    [
      '~ deals 3 damage to any target.',
      [{ id: 't1', what: { kind: 'anyTarget' } }],
      { kind: 'target', id: 't1' },
    ],
    [
      '~ deals 2 damage to target player.',
      [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
      { kind: 'target', id: 't1' },
    ],
    [
      '~ deals 2 damage to target opponent.',
      [{ id: 't1', what: { kind: 'player', filter: 'opponent' } }],
      { kind: 'target', id: 't1' },
    ],
    ['~ deals 2 damage to each opponent.', undefined, { kind: 'eachOpponent' }],
    ['~ deals 2 damage to each player.', undefined, { kind: 'eachPlayer' }],
    ['~ deals 2 damage to you.', undefined, { kind: 'you' }],
    [
      '~ deals three damage to target creature.',
      [T1(BF({ types: ['creature'] }))],
      { kind: 'target', id: 't1' },
    ],
    [
      '~ deals 1 damage to target creature you don’t control.',
      [T1(BF({ types: ['creature'], controller: 'opponent' }))],
      { kind: 'target', id: 't1' },
    ],
    [
      '~ deals 4 damage to each creature.',
      undefined,
      { kind: 'each', filter: BF({ types: ['creature'] }) },
    ],
    [
      '~ deals 2 damage to each creature your opponents control.',
      undefined,
      { kind: 'each', filter: BF({ types: ['creature'], controller: 'opponent' }) },
    ],
  ])('parses %j', (text, targets, to) => {
    const parsed = spellFace(text);
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.spell).toEqual({
      ...(targets ? { targets } : {}),
      effect: {
        kind: 'dealDamage',
        amount: parsed.spell?.effect?.kind === 'dealDamage' ? parsed.spell.effect.amount : 0,
        to,
      },
    });
  });

  test('amounts are digits or number words, and X is the X amount', () => {
    const amountOf = (text: string) => {
      const effect = spellFace(text).spell?.effect;
      return effect?.kind === 'dealDamage' ? effect.amount : null;
    };
    expect(amountOf('~ deals 3 damage to each opponent.')).toBe(3);
    expect(amountOf('~ deals three damage to each opponent.')).toBe(3);
    expect(amountOf('~ deals 12 damage to each opponent.')).toBe(12);
    expect(amountOf('~ deals ten damage to each opponent.')).toBe(10);
    expect(amountOf('~ deals X damage to each opponent.')).toEqual({ kind: 'x' });
    expect(spellFace('~ deals X damage to each opponent.').spell?.x).toBe(true);
    expect(spellFace('~ deals 3 damage to each opponent.').spell?.x).toBeUndefined();
  });

  test('several recipients are one damage effect each, in order', () => {
    const spell = spellFace('~ deals 2 damage to each creature and each player.').spell;
    expect(spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        {
          kind: 'dealDamage',
          amount: 2,
          to: { kind: 'each', filter: BF({ types: ['creature'] }) },
        },
        { kind: 'dealDamage', amount: 2, to: { kind: 'eachPlayer' } },
      ],
    });
  });
});

describe('spell clauses: destroy, exile, return, counter, tap, untap', () => {
  test.each([
    ['Destroy target creature.', 'destroy', [T1(BF({ types: ['creature'] }))]],
    ['Destroy target artifact.', 'destroy', [T1(BF({ types: ['artifact'] }))]],
    ['Destroy target enchantment.', 'destroy', [T1(BF({ types: ['enchantment'] }))]],
    ['Destroy target land.', 'destroy', [T1(BF({ types: ['land'] }))]],
    ['Destroy target planeswalker.', 'destroy', [T1(BF({ types: ['planeswalker'] }))]],
    ['Destroy target permanent.', 'destroy', [T1(BF())]],
    ['Destroy target nonland permanent.', 'destroy', [T1(BF({ notTypes: ['land'] }))]],
    ['Destroy target noncreature permanent.', 'destroy', [T1(BF({ notTypes: ['creature'] }))]],
    ['Destroy target artifact creature.', 'destroy', [T1(BF({ types: ['artifact', 'creature'] }))]],
    ['Destroy target tapped creature.', 'destroy', [T1(BF({ types: ['creature'], tapped: true }))]],
    [
      'Destroy target untapped creature.',
      'destroy',
      [T1(BF({ types: ['creature'], tapped: false }))],
    ],
    ['Destroy target red creature.', 'destroy', [T1(BF({ types: ['creature'], colors: ['R'] }))]],
    [
      'Destroy target legendary creature.',
      'destroy',
      [T1(BF({ types: ['creature'], supertypes: ['legendary'] }))],
    ],
    [
      'Destroy target nonland permanent an opponent controls.',
      'destroy',
      [T1(BF({ notTypes: ['land'], controller: 'opponent' }))],
    ],
    [
      'Destroy target creature you control.',
      'destroy',
      [T1(BF({ types: ['creature'], controller: 'you' }))],
    ],
    [
      "Destroy target creature you don't control.",
      'destroy',
      [T1(BF({ types: ['creature'], controller: 'opponent' }))],
    ],
    ['Exile target creature.', 'exile', [T1(BF({ types: ['creature'] }))]],
    ['Exile target nonland permanent.', 'exile', [T1(BF({ notTypes: ['land'] }))]],
    ['Exile target card from a graveyard.', 'exile', [T1({ zone: 'graveyard' })]],
    [
      "Exile target creature card from an opponent's graveyard.",
      'exile',
      [T1({ zone: 'graveyard', types: ['creature'], controller: 'opponent' })],
    ],
    ['Tap target creature.', 'tap', [T1(BF({ types: ['creature'] }))]],
    ['Untap target land.', 'untap', [T1(BF({ types: ['land'] }))]],
  ] as const)('parses %j', (text, kind, targets) => {
    const spell = spellFace(text).spell;
    expect(spell).toEqual({
      targets,
      effect: { kind, objects: { kind: 'target', id: 't1' } },
    });
  });

  test.each([
    ['Destroy all creatures.', 'destroy', BF({ types: ['creature'] })],
    ['Destroy each creature.', 'destroy', BF({ types: ['creature'] })],
    ['Destroy all nonland permanents.', 'destroy', BF({ notTypes: ['land'] })],
    ['Destroy all artifacts and all enchantments.', 'destroy', BF({ types: ['artifact'] })],
    ['Exile all creatures you control.', 'exile', BF({ types: ['creature'], controller: 'you' })],
    [
      'Tap all creatures your opponents control.',
      'tap',
      BF({ types: ['creature'], controller: 'opponent' }),
    ],
    ['Untap all lands you control.', 'untap', BF({ types: ['land'], controller: 'you' })],
  ] as const)('mass %j needs no target', (text, kind, filter) => {
    const spell = spellFace(text).spell;
    expect(spell?.targets).toBeUndefined();
    const first = spell?.effect?.kind === 'sequence' ? spell.effect.effects[0] : spell?.effect;
    expect(first).toEqual({ kind, objects: { kind: 'each', filter } });
  });

  test('a count of two or more makes one slot with that many targets', () => {
    expect(spellFace('Destroy two target creatures.').spell).toEqual({
      targets: [{ ...T1(BF({ types: ['creature'] })), min: 2, max: 2 }],
      effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
    });
    expect(spellFace('Exile three target nonland permanents.').spell?.targets?.[0]).toMatchObject({
      min: 3,
      max: 3,
    });
    // "one target creatures" and a plural without a count are not English the grammar accepts.
    expect(spellFace('Destroy one target creature.').unparsed).toHaveLength(1);
    expect(spellFace('Destroy target creatures.').unparsed).toHaveLength(1);
    expect(spellFace('Destroy two target creature.').unparsed).toHaveLength(1);
  });

  test('a list of targets is one slot and one effect each, numbered in text order', () => {
    const spell = spellFace(
      'Destroy target artifact, target creature, target enchantment, and target land.',
    ).spell;
    expect(spell?.targets?.map((t) => t.id)).toEqual(['t1', 't2', 't3', 't4']);
    expect(
      spell?.targets?.map((t) => (t.what.kind === 'object' ? t.what.filter.types : null)),
    ).toEqual([['artifact'], ['creature'], ['enchantment'], ['land']]);
    expect(spell?.effect).toEqual({
      kind: 'sequence',
      effects: ['t1', 't2', 't3', 't4'].map((id) => ({
        kind: 'destroy',
        objects: { kind: 'target', id },
      })),
    });
  });

  test.each([
    ["Return target creature to its owner's hand.", { zone: 'battlefield', types: ['creature'] }],
    ['Return target creature to its owner’s hand.', { zone: 'battlefield', types: ['creature'] }],
    [
      "Return target nonland permanent to its owner's hand.",
      { zone: 'battlefield', notTypes: ['land'] },
    ],
    [
      "Return target creature you control to its owner's hand.",
      { zone: 'battlefield', types: ['creature'], controller: 'you' },
    ],
  ])('return to hand: %j', (text, filter) => {
    expect(spellFace(text).spell).toEqual({
      targets: [T1(filter)],
      effect: { kind: 'moveToZone', objects: { kind: 'target', id: 't1' }, to: 'hand' },
    });
  });

  test('return from your graveyard: to hand, to the battlefield, tapped; only your own', () => {
    const grave = { zone: 'graveyard', types: ['creature'], controller: 'you' };
    expect(
      spellFace('Return target creature card from your graveyard to your hand.').spell,
    ).toEqual({
      targets: [T1(grave)],
      effect: { kind: 'moveToZone', objects: { kind: 'target', id: 't1' }, to: 'hand' },
    });
    expect(
      spellFace('Return target creature card from your graveyard to the battlefield.').spell
        ?.effect,
    ).toEqual({
      kind: 'moveToZone',
      objects: { kind: 'target', id: 't1' },
      to: 'battlefield',
      controller: 'you',
    });
    expect(
      spellFace('Return target creature card from your graveyard to the battlefield tapped.').spell
        ?.effect,
    ).toEqual({
      kind: 'moveToZone',
      objects: { kind: 'target', id: 't1' },
      to: 'battlefield',
      controller: 'you',
      tapped: true,
    });
    // "to your hand" from someone else's graveyard would put it in the wrong hand (CR 400.3).
    expect(
      spellFace("Return target creature card from an opponent's graveyard to your hand.").unparsed,
    ).toHaveLength(1);
    // To the battlefield any graveyard will do: the caster controls it (CR 110.2a, parser-p6.test.ts).
    expect(
      spellFace('Return target creature card from a graveyard to the battlefield.').unparsed,
    ).toEqual([]);
  });

  test("return all: to owners' hands, or back from the graveyard", () => {
    expect(spellFace("Return all creatures to their owners' hands.").spell).toEqual({
      effect: {
        kind: 'moveToZone',
        objects: { kind: 'each', filter: BF({ types: ['creature'] }) },
        to: 'hand',
      },
    });
    expect(
      spellFace('Return all land cards from your graveyard to the battlefield tapped.').spell,
    ).toEqual({
      effect: {
        kind: 'moveToZone',
        objects: {
          kind: 'each',
          filter: { zone: 'graveyard', types: ['land'], controller: 'you' },
        },
        to: 'battlefield',
        controller: 'you',
        tapped: true,
      },
    });
  });

  test('counter target spell', () => {
    expect(spellFace('Counter target spell.').spell).toEqual({
      targets: [T1({ zone: 'stack', stackKind: 'spell' })],
      effect: { kind: 'counter', objects: { kind: 'target', id: 't1' } },
    });
  });
});

describe('spell clauses: players, mana and the library', () => {
  const draw = (player: object, count: unknown): Effect =>
    ({ kind: 'draw', player, count }) as Effect;

  test.each([
    ['Draw a card.', draw({ kind: 'you' }, 1)],
    ['Draw two cards.', draw({ kind: 'you' }, 2)],
    ['Draw 3 cards.', draw({ kind: 'you' }, 3)],
    ['Draw X cards.', draw({ kind: 'you' }, { kind: 'x' })],
    ['You draw a card.', draw({ kind: 'you' }, 1)],
    ['Each player draws two cards.', draw({ kind: 'eachPlayer' }, 2)],
    ['Each opponent draws a card.', draw({ kind: 'eachOpponent' }, 1)],
    ['You gain 4 life.', { kind: 'gainLife', player: { kind: 'you' }, amount: 4 }],
    ['You gain X life.', { kind: 'gainLife', player: { kind: 'you' }, amount: { kind: 'x' } }],
    ['Each player gains 2 life.', { kind: 'gainLife', player: { kind: 'eachPlayer' }, amount: 2 }],
    [
      'Each opponent loses 3 life.',
      { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount: 3 },
    ],
    ['You lose 2 life.', { kind: 'loseLife', player: { kind: 'you' }, amount: 2 }],
    ['Shuffle your library.', { kind: 'shuffle', player: { kind: 'you' } }],
    ['Add {C}{C}.', { kind: 'addMana', mana: { kind: 'fixed', mana: ['C', 'C'] } }],
    ['Add {R}{R}{R}.', { kind: 'addMana', mana: { kind: 'fixed', mana: ['R', 'R', 'R'] } }],
  ] as const)('parses %j', (text, effect) => {
    const spell = spellFace(text).spell;
    expect(spell?.effect).toEqual(effect);
    expect(spell?.targets).toBeUndefined();
  });

  test('target player and target opponent are target slots', () => {
    expect(spellFace('Target player draws two cards.').spell).toEqual({
      targets: [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
      effect: draw({ kind: 'target', id: 't1' }, 2),
    });
    expect(spellFace('Target opponent loses 5 life.').spell).toEqual({
      targets: [{ id: 't1', what: { kind: 'player', filter: 'opponent' } }],
      effect: { kind: 'loseLife', player: { kind: 'target', id: 't1' }, amount: 5 },
    });
    expect(spellFace('Target player shuffles their library.').spell?.effect).toEqual({
      kind: 'shuffle',
      player: { kind: 'target', id: 't1' },
    });
  });

  test('one subject doing several things is one slot', () => {
    const spell = spellFace('Target player draws two cards and loses 2 life.').spell;
    expect(spell?.targets).toHaveLength(1);
    expect(spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        draw({ kind: 'target', id: 't1' }, 2),
        { kind: 'loseLife', player: { kind: 'target', id: 't1' }, amount: 2 },
      ],
    });
    expect(spellFace('You draw two cards, then lose 2 life.').spell?.effect).toMatchObject({
      kind: 'sequence',
    });
  });

  test('"any color" mana is not read: the interpreter offers no color choice', () => {
    expect(spellFace('Add one mana of any color.').unparsed).toHaveLength(1);
    expect(spellFace('Add {G} or {U}.').unparsed).toHaveLength(1);
  });
});

describe('sentences, clauses and target numbering', () => {
  test('sentences run in order and targets are numbered across them', () => {
    const spell = spellFace('Destroy target creature. Tap target land. Draw a card.').spell;
    expect(spell?.targets?.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
        { kind: 'tap', objects: { kind: 'target', id: 't2' } },
        { kind: 'draw', player: { kind: 'you' }, count: 1 },
      ],
    });
  });

  test.each([
    'Destroy target creature, then draw a card.',
    'Destroy target creature and draw a card.',
    'Destroy target creature, and draw a card.',
    'Destroy target creature, and then draw a card.',
    'Destroy target creature and then draw a card.',
    'Destroy target creature then draw a card.',
    'Destroy target creature. Draw a card.',
  ])('%j is destroy, then draw', (text) => {
    expect(spellFace(text).spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
        { kind: 'draw', player: { kind: 'you' }, count: 1 },
      ],
    });
  });

  test('target numbers follow the text even when a clause has no target', () => {
    const spell = spellFace('Draw a card. Exile target creature.').spell;
    expect(spell?.targets?.map((t) => t.id)).toEqual(['t1']);
  });

  test('X anywhere marks the spell', () => {
    expect(spellFace('Destroy target creature. Draw X cards.').spell?.x).toBe(true);
  });

  test('several effect lines of one instant are one text, in order', () => {
    const parsed = spellFace('Destroy target creature.\nDraw a card.');
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
        { kind: 'draw', player: { kind: 'you' }, count: 1 },
      ],
    });
  });

  test('a face with no spell line has no spell text', () => {
    expect(spellFace('Flying').spell).toBeNull();
    expect(spellFace('').spell).toBeNull();
  });
});

describe('diagnostics point at the clause that did not parse', () => {
  test.each([
    [
      '~ deals 2 damage to target tapped creature or planeswalker.',
      'or planeswalker.',
      'noun.target-permanent',
    ],
    [
      '~ deals X damage to target player and each creature they control.',
      'they control.',
      'noun.each-permanent',
    ],
    ['Destroy target creature with flying or reach.', 'or reach.', 'noun.target-permanent'],
    ['Destroy target nonblack creature.', 'nonblack creature.', 'noun.target-permanent'],
    // D-447 read "creature or Dragon"; a choice of three words joined by "or" is still unread.
    ['Destroy target creature or Dragon or Elf.', 'or Elf.', 'noun.target-permanent'],
    ['Destroy target artifact and enchantment.', 'enchantment.', 'spell.effect'],
    ['Exile target creature. Exile target Banana.', 'Banana.', 'noun.target-graveyard-card'],
    ['Counter target spell unless its controller pays {X}.', '{X}.', 'effect.counter-unless'],
    [
      'Exile target creature, then return it to the battlefield.',
      'it to the battlefield.',
      'effect.return',
    ],
    ['Draw a card, then discard your hands.', 'your hands.', 'effect.discard'],
    [
      'Destroy target creature. Its controller loses life equal to its loyalty.',
      'equal to its loyalty.',
      'effect.player.life',
    ],
    [
      'Destroy all creatures. They can’t be regenerated this turn.',
      'this turn.',
      'effect.cant-be-regenerated',
    ],
    [
      'Draw a card. Target creature gets +2/+2 until your next turn.',
      'until your next turn.',
      'effect.pump',
    ],
    [
      'Target player draws two cards and discards their hand.',
      'their hand.',
      'effect.player.discard',
    ],
    ['Target player gains 3 life.', '', 'spell.effect'],
  ])('%j stops at %j in %s', (text, stoppedAt, closestRule) => {
    // The last case is a text that parses: it has no diagnostic at all.
    const parsed = spellFace(text);
    if (text === 'Target player gains 3 life.') {
      expect(parsed.unparsed).toEqual([]);
      return;
    }
    expect(parsed.unparsed).toHaveLength(1);
    expect(parsed.unparsed[0]).toMatchObject({ text, stoppedAt, closestRule });
  });

  test('text no rule starts to read keeps the none rule and the whole text', () => {
    // Entwine puts a cost on the whole spell (D-114): no rule reads the keyword line. (Escalate is read since stage P32, D-147.)
    const parsed = spellFace('Entwine {1}');
    expect(parsed.unparsed[0]).toMatchObject({ stoppedAt: 'Entwine {1}', closestRule: NO_RULE });
  });

  test('a clause that ends the text early reports the empty remainder', () => {
    expect(spellFace('Destroy target creature').unparsed[0]).toMatchObject({
      stoppedAt: '',
      closestRule: 'noun.target-permanent',
    });
  });

  test('the good line of an instant is kept, the bad one reported with its index', () => {
    const parsed = spellFace('Draw a card.\nTarget creature gets +1/+1 until your next turn.');
    expect(parsed.spell?.effect).toEqual({ kind: 'draw', player: { kind: 'you' }, count: 1 });
    expect(parsed.unparsed).toMatchObject([{ ability: 1 }]);
  });
});

describe('out of scope stays unparsed', () => {
  test.each([
    'Entwine {1}',
    'Destroy any number of target creatures.',
    'You may draw a card.',
    'Create a 1/1 white Soldier creature token with changeling.',
    'Search your library for a basic land card and put it onto the battlefield tapped.',
    'Target player discards their hand.',
    'Target creature gets +3/+3 until your next turn.',
    'The next time a source of your choice would deal damage to you this turn, prevent that damage.',
    '~ deals damage to target creature equal to its power.',
    'Destroy target creature. It can’t be regenerated this turn.',
    'Return target creature card from your graveyard to your hand. Draw a card unless you control a land.',
    'Counter target spell with mana value X or less.',
    'Destroy target Banana.',
  ])('%j', (text) => {
    const parsed = spellFace(text);
    expect(parsed.unparsed).toHaveLength(1);
    expect(parsed.spell).toBeNull();
  });

  test('effect text on a permanent is not spell text', () => {
    const creatureFace = syntheticFace({
      name: 'SYNTHETIC Bear',
      oracleText: 'Destroy target creature.',
    });
    const imported = parseOnly({
      ...spellCard('SYNTHETIC Bear', 'Destroy target creature.', { type: 'Instant' }),
      faces: [
        {
          ...creatureFace,
          typeLine: 'Creature — Bear',
          power: '2',
          toughness: '2',
        },
      ],
    });
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.unparsed).toMatchObject([{ closestRule: NO_RULE }]);
    expect(imported.definition.faces[0]?.spell).toBeNull();
  });
});

describe('the grammar cannot outrun the engine (D-007)', () => {
  test('every effect the grammar reads today needs only what the engine runs', () => {
    // Recognised but not runnable is allowed (the diagnostic names what is missing), yet nothing
    // the S1 vocabulary reads may be missing from SUPPORTED_FEATURES: those are the supported
    // cards. A new verb whose engine node does not exist yet will fail this on purpose, and be
    // listed as an engine gap instead.
    for (const verb of ['dealDamage', 'destroy', 'exile', 'return', 'counter', 'tap', 'untap']) {
      const effect = verb === 'return' ? 'moveToZone' : verb;
      expect(SUPPORTED_FEATURES.effectKinds, verb).toContain(effect as Effect['kind']);
    }
  });

  test('the parsed AST of every supported example validates', () => {
    for (const text of [
      '~ deals 3 damage to any target.',
      'Destroy target artifact, target creature, target enchantment, and target land.',
      'Target player draws two cards and loses 2 life.',
      "Return all creatures to their owners' hands.",
      'Exile two target creatures.',
    ]) {
      const imported = parseOnly(spellCard('SYNTHETIC Check', text, { manaCost: '{1}{R}' }));
      expect(imported.support.reasons, text).toEqual([]);
      expect(imported.support.status, text).toBe('supported');
    }
  });
});
