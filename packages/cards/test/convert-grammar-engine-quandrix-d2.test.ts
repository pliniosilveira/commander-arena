// Other instructions that read an X (the Quandrix Unlimited deck, group D2), read by the grammar and run by the engine: Entrancing Melody ("target creature with mana value X"),
// Hydroid Krasis and The Goose Mother ("half X, rounded down/up"), Lifeblood Hydra ("gain life and draw cards equal to its power"), Commander's Insight ("X cards plus ... for each
// time they've cast a commander"), Open the Way ("X can't be greater than the number of players", "until you reveal X land cards"), Animist's Awakening ("reveal the top X cards ...
// put all land cards ... untap those lands"), Kinetic Ooze ("mana value X or less", "If X is 5 or more", "any number of other target creatures") and Altered Ego ("enters as a copy
// ... with X additional +1/+1 counters"). The first block parses the REAL Oracle text of each card from the golden corpus, whole; the rest are SYNTHETIC cards whose abilities are the
// real lines (names replaced by ~), run through `applyAction` with the scenario DSL, plus the near misses the grammar must not read. Every synthetic name starts with "SYNTHETIC".
import { readFileSync } from 'node:fs';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { withHalfRounding } from '../src/convert/parser/normalize';
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

const LIB = Array.from({ length: 14 }, () => 'Plains');
const base = () =>
  scenario()
    .seat(0)
    .library(...LIB)
    .seat(1)
    .library(...LIB)
    .seat(0);

describe('the real cards, whole', () => {
  test.each([
    'Entrancing Melody',
    'Hydroid Krasis',
    'The Goose Mother',
    'Lifeblood Hydra',
    "Commander's Insight",
    'Open the Way',
    "Animist's Awakening",
    'Kinetic Ooze',
    'Altered Ego',
  ])('%s is supported', (name) => {
    const imported = real(name);
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('supported');
  });

  test('Entrancing Melody: the target is a creature whose mana value is the X announced, and the spell announces an X', () => {
    const spell = real('Entrancing Melody').definition.faces[0]?.spell;
    expect(spell?.x).toBe(true);
    expect(spell?.targets?.[0]?.what).toMatchObject({
      kind: 'object',
      filter: { types: ['creature'], manaValueX: true },
    });
  });

  test('Hydroid Krasis: half X rounded down, twice, in the cast trigger', () => {
    const half = { kind: 'half', of: { kind: 'x' }, round: 'down' };
    expect(real('Hydroid Krasis').definition.faces[0]?.abilities[0]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'castSpell', self: true },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'gainLife', amount: half },
          { kind: 'draw', count: half },
        ],
      },
    });
  });

  test('The Goose Mother: half X rounded up, the X the spell had when it entered', () => {
    expect(JSON.stringify(real('The Goose Mother').definition.faces[0]?.abilities)).toContain(
      '"count":{"kind":"half","of":{"kind":"enteredX"},"round":"up"}',
    );
  });

  test("Commander's Insight: X plus the times the target player cast a commander", () => {
    expect(real("Commander's Insight").definition.faces[0]?.spell?.effect).toMatchObject({
      kind: 'draw',
      count: {
        kind: 'sum',
        of: [{ kind: 'x' }, { kind: 'commanderCasts', player: { kind: 'target' } }],
      },
    });
  });

  test('Open the Way: X is at most the opponents plus you', () => {
    const spell = real('Open the Way').definition.faces[0]?.spell;
    expect(spell?.xAtMost).toEqual({ kind: 'sum', of: [{ kind: 'opponentCount' }, 1] });
    expect(spell?.effect).toMatchObject({
      kind: 'revealUntil',
      filter: { types: ['land'] },
      count: { kind: 'x' },
      put: 'battlefield',
      tapped: true,
    });
  });

  test("Animist's Awakening: reveal the top X, all lands onto the battlefield tapped, untap them with spell mastery", () => {
    const text = JSON.stringify(real("Animist's Awakening").definition.faces[0]?.spell?.effect);
    expect(text).toContain('"kind":"lookAtTop"');
    expect(text).toContain('"all":true');
    expect(text).toContain('"untap"');
  });

  test('Kinetic Ooze: the target reads the X the spell had; the doubling takes any number of other targets', () => {
    const ooze = real('Kinetic Ooze').definition.faces[0]?.abilities[1];
    expect(ooze).toMatchObject({
      kind: 'triggered',
      targets: [
        {
          what: { kind: 'object', filter: { manaValueAtMost: { kind: 'enteredX' } } },
          min: 0,
          max: 1,
        },
        { anyNumber: true },
      ],
    });
  });

  test('Altered Ego: the copy replacement carries the X counters', () => {
    expect(real('Altered Ego').definition.faces[0]?.abilities[1]).toMatchObject({
      kind: 'replacement',
      replacement: { kind: 'entersAsCopy', withX: { counter: '+1/+1' }, optional: true },
    });
  });
});

describe('the rounding of "half X" is written next to the X', () => {
  test.each([
    [
      'When you cast ~, you gain half X life and draw half X cards. Round down each time.',
      'When you cast ~, you gain half X, rounded down life and draw half X, rounded down cards.',
    ],
    [
      'When ~ enters, create half X Food tokens, rounded up.',
      'When ~ enters, create half X, rounded up Food tokens.',
    ],
    ['You gain half X life, rounded up.', 'You gain half X, rounded up life.'],
    // nothing to move: another amount, or no rounding said
    [
      'You gain half your life total, rounded down.',
      'You gain half your life total, rounded down.',
    ],
    ['You gain half X life.', 'You gain half X life.'],
    ['Draw X cards. Round down each time.', 'Draw X cards. Round down each time.'],
  ])('%s', (line, expected) => {
    expect(withHalfRounding(line)).toBe(expected);
  });
});

describe('lines that are not read', () => {
  const spell = (text: string, manaCost = '{X}{G}{U}') =>
    parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Parsed Refused',
        typeLine: 'Sorcery',
        manaCost,
        oracleText: text,
      }),
    ).support.status;
  const creature = (text: string) =>
    parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Parsed Refused',
        typeLine: 'Creature — Hydra',
        manaCost: '{X}{G}',
        power: '0',
        toughness: '0',
        oracleText: text.replaceAll('~', 'SYNTHETIC Parsed Refused'),
      }),
    ).support.status;

  test('the same shapes with the real words are supported (the near misses below change one thing each)', () => {
    expect(spell('Gain control of target creature with mana value X.')).toBe('supported');
    expect(
      spell(
        "X can't be greater than the number of players in the game.\nTarget player draws X cards.",
      ),
    ).toBe('supported');
    expect(
      creature(
        'When ~ enters, create half X Food tokens, rounded up.\n~ enters with X +1/+1 counters on it.',
      ),
    ).toBe('supported');
  });

  test.each([
    // the target is read against an X that is not announced
    'Gain control of target creature with mana value X or less.',
  ])('is not supported: %s', (text) => {
    expect(spell(text)).not.toBe('supported');
  });

  test('a limit on X with no X to limit is not read', () => {
    expect(
      parseOnly(
        syntheticCard({
          name: 'SYNTHETIC Parsed No X',
          typeLine: 'Sorcery',
          manaCost: '{2}{G}',
          oracleText: "X can't be greater than the number of players in the game.\nDraw a card.",
        }),
      ).support.status,
    ).not.toBe('supported');
  });

  test.each([
    // the rounding is said for a "half" of something that is not X
    'When ~ enters, you gain half your life total, rounded up.',
    // a rounding that moves the count of tokens to a place it does not read
    'When ~ enters, create half X Food tokens, rounded sideways.',
    // another amount for the same cards
    'When ~ enters, draw half X cards.',
  ])('is not supported: %s', (text) => {
    expect(creature(`${text}\n~ enters with X +1/+1 counters on it.`)).not.toBe('supported');
  });

  test.each([
    // the copy is of any permanent of the kind, and the counters are X of them
    'You may have ~ enter as a copy of any creature on the battlefield, except it enters with two additional +1/+1 counters on it.',
    'You may have ~ enter as a copy of any creature you control, except it enters with X additional +1/+1 counters on it.',
  ])('is not supported: %s', (text) => {
    expect(creature(text)).not.toBe('supported');
  });
});

describe('the engine runs what the grammar lowered', () => {
  const MELODY = parsed(
    'SYNTHETIC Parsed Melody',
    'Sorcery',
    'Gain control of target creature with mana value X.',
    { manaCost: '{X}{U}{U}', colors: ['U'] },
  );

  test('Entrancing Melody: X = 2 steals the mana value 2 creature and not another', () => {
    const g = base()
      .define(MELODY)
      .hand(MELODY.name)
      .battlefield('Island', 'Island', 'Island', 'Island')
      .seat(1)
      .battlefield('Grizzly Bears', { label: 'two' })
      .battlefield('Sol Ring', { label: 'ring' })
      .seat(0)
      .at('precombatMain')
      .build();
    g.act(0).cast(MELODY.name, { x: 2, targets: ['two'], pay: true });
    g.passAll();
    expect(g.view(0).battlefield.find((o) => o.name === 'Grizzly Bears')?.controller).toBe(0);
  });

  test('Entrancing Melody: the X offered are the mana values of the creatures there are', () => {
    const g = base()
      .define(MELODY)
      .hand(MELODY.name)
      .battlefield('Island', 'Island', 'Island', 'Island', 'Island')
      .seat(1)
      .battlefield('Grizzly Bears')
      .seat(0)
      .at('precombatMain')
      .build();
    g.expect.legal(0, { cast: MELODY.name });
    g.act(0).cast(MELODY.name);
    const xs = g.legalActions(0).flatMap((a) => (a.kind === 'chooseX' ? [a.value] : []));
    expect(xs).toEqual([2]);
    // an X with no creature of that mana value is refused
    expect(g.act(0).try.action({ kind: 'chooseX', value: 1 }).ok).toBe(false);
  });

  test('Entrancing Melody: with no creature at all it cannot be cast', () => {
    const g = base()
      .define(MELODY)
      .hand(MELODY.name)
      .battlefield('Island', 'Island', 'Island', 'Island')
      .at('precombatMain')
      .build();
    g.expect.illegal(0, { cast: MELODY.name });
  });

  const KRASIS = parsed(
    'SYNTHETIC Parsed Krasis',
    'Creature — Jellyfish Hydra Beast',
    'When you cast this spell, you gain half X life and draw half X cards. Round down each time.\nFlying, trample\nThis creature enters with X +1/+1 counters on it.',
    { manaCost: '{X}{G}{U}', power: '0', toughness: '0', colors: ['G', 'U'] },
  );

  test('Krasis: X = 5 gains 2 and draws 2 as it is cast, and enters with 5 counters', () => {
    const g = base()
      .define(KRASIS)
      .hand(KRASIS.name)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Island')
      .at('precombatMain')
      .build();
    g.act(0).cast(KRASIS.name, { x: 5, pay: true });
    // the trigger is above the spell on the stack: nothing has happened yet
    g.expect.life(0, 40);
    g.expect.zone(KRASIS.name, 'stack');
    g.passAll();
    g.expect.life(0, 42);
    g.expect.handSize(0, 2);
    g.expect.counters(KRASIS.name, { '+1/+1': 5 });
  });

  test('Krasis: X = 1 rounds down to nothing', () => {
    const g = base()
      .define(KRASIS)
      .hand(KRASIS.name)
      .battlefield('Forest', 'Forest', 'Island')
      .at('precombatMain')
      .build();
    g.act(0).cast(KRASIS.name, { x: 1, pay: true });
    g.passAll();
    g.expect.life(0, 40);
    g.expect.handSize(0, 0);
  });

  const GOOSE = parsed(
    'SYNTHETIC Parsed Goose',
    'Legendary Creature — Bird Hydra',
    'Flying\n~ enters with X +1/+1 counters on it.\nWhen ~ enters, create half X Food tokens, rounded up.',
    { manaCost: '{X}{G}{U}', power: '2', toughness: '2', colors: ['G', 'U'] },
  );

  test.each([
    [3, 2],
    [2, 1],
    [0, 0],
  ])('Goose: X = %i makes %i Food tokens', (x, food) => {
    const g = base()
      .define(GOOSE)
      .hand(GOOSE.name)
      .battlefield('Forest', 'Forest', 'Forest', 'Island', 'Island')
      .at('precombatMain')
      .build();
    g.act(0).cast(GOOSE.name, { x, pay: true });
    g.passAll();
    g.passAll();
    expect(g.find({ name: 'Food' })).toHaveLength(food);
  });

  const HYDRA = parsed(
    'SYNTHETIC Parsed Lifeblood',
    'Creature — Hydra',
    'Trample\nThis creature enters with X +1/+1 counters on it.\nWhen this creature dies, you gain life and draw cards equal to its power.',
    { manaCost: '{X}{G}{G}{G}', power: '0', toughness: '0', colors: ['G'] },
  );

  test('Lifeblood Hydra: when it dies you gain its last-known power in life and draw that many', () => {
    const g = base()
      .define(HYDRA)
      .battlefield(HYDRA.name, { label: 'hydra', counters: { '+1/+1': 3 } })
      .seat(1)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .seat(0)
      .at('precombatMain')
      .build();
    g.pass();
    g.act(1).cast('Lightning Bolt', { targets: ['hydra'], pay: true });
    g.passAll();
    g.expect.zone(HYDRA.name, 'graveyard');
    g.expect.life(0, 43);
    g.expect.handSize(0, 3);
  });

  const INSIGHT = parsed(
    'SYNTHETIC Parsed Insight',
    'Instant',
    "Target player draws X cards plus an additional card for each time they've cast a commander from the command zone this game.",
    { manaCost: '{X}{U}{U}{U}', colors: ['U'] },
  );

  test("Commander's Insight: the target player's casts, not the controller's", () => {
    const g = base()
      .define(INSIGHT)
      .hand(INSIGHT.name)
      .battlefield('Island', 'Island', 'Island', 'Island')
      .commander('Isamaru, Hound of Konda', { casts: 3 })
      .seat(1)
      .commander('Yargle, Glutton of Urborg', { casts: 1 })
      .seat(0)
      .at('precombatMain')
      .build();
    g.act(0).cast(INSIGHT.name, { x: 1, targets: [{ player: 1 }], pay: true });
    g.passAll();
    // seat 1: X = 1 and one cast of their commander (the controller cast hers three times: it is not hers that counts)
    g.expect.handSize(1, 2);
    g.expect.handSize(0, 0);
  });

  test("Commander's Insight: targeting yourself counts your own casts", () => {
    const g = base()
      .define(INSIGHT)
      .hand(INSIGHT.name)
      .battlefield('Island', 'Island', 'Island', 'Island')
      .commander('Isamaru, Hound of Konda', { casts: 3 })
      .at('precombatMain')
      .build();
    g.act(0).cast(INSIGHT.name, { x: 1, targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.handSize(0, 4);
  });

  const WAY = parsed(
    'SYNTHETIC Parsed Way',
    'Sorcery',
    "X can't be greater than the number of players in the game.\nReveal cards from the top of your library until you reveal X land cards. Put those land cards onto the battlefield tapped and the rest on the bottom of your library in a random order.",
    { manaCost: '{X}{G}{G}', colors: ['G'] },
  );

  test('Open the Way: X is at most the players in the game (2 here), and that many lands arrive tapped', () => {
    const library = ['Mountain', 'Grizzly Bears', 'Swamp', 'Island', 'Island', 'Island'];
    const g = scenario()
      .seat(0)
      .library(...library)
      .hand(WAY.name)
      .define(WAY)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .seat(1)
      .library(...LIB)
      .seat(0)
      .at('precombatMain')
      .build();
    const cast = g.act(0).cast(WAY.name);
    const xs = g.legalActions(0).flatMap((a) => (a.kind === 'chooseX' ? [a.value] : []));
    // five lands could pay for an X of 3, but there are two players in the game
    expect(xs).toEqual([0, 1, 2]);
    cast.x(2).pay();
    g.passAll();
    // Island, the Bear and Plains were revealed: the two lands arrive tapped, the Bear goes to the bottom
    g.expect.zone('Mountain', 'battlefield');
    g.expect.tapped('Mountain');
    g.expect.zone('Swamp', 'battlefield');
    g.expect.tapped('Swamp');
    g.expect.zone('Grizzly Bears', 'library');
    g.expect.librarySize(0, 4);
  });

  const AWAKENING = parsed(
    'SYNTHETIC Parsed Awakening',
    'Sorcery',
    'Reveal the top X cards of your library. Put all land cards from among them onto the battlefield tapped and the rest on the bottom of your library in a random order.\nSpell mastery — If there are two or more instant and/or sorcery cards in your graveyard, untap those lands.',
    { manaCost: '{X}{G}', colors: ['G'] },
  );

  test('Animist’s Awakening: the lands among the top X enter tapped, the rest go to the bottom', () => {
    const library = ['Mountain', 'Grizzly Bears', 'Swamp', 'Island', 'Island', 'Island'];
    const g = scenario()
      .seat(0)
      .library(...library)
      .hand(AWAKENING.name)
      .define(AWAKENING)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest')
      .seat(1)
      .library(...LIB)
      .seat(0)
      .at('precombatMain')
      .build();
    g.act(0).cast(AWAKENING.name, { x: 3, pay: true });
    g.passAll();
    // the top three are an Island, a Bear and a Plains: the two lands arrive tapped, the Bear goes under the library; the Swamps were not revealed
    g.expect.zone('Mountain', 'battlefield');
    g.expect.tapped('Mountain');
    g.expect.zone('Swamp', 'battlefield');
    g.expect.tapped('Swamp');
    g.expect.zone('Grizzly Bears', 'library');
    g.expect.librarySize(0, 4);
  });

  test('Animist’s Awakening: with two instants or sorceries in the graveyard the lands untap', () => {
    const library = ['Mountain', 'Grizzly Bears', 'Swamp', 'Island', 'Island', 'Island'];
    const build = (graveyard: readonly string[]) =>
      scenario()
        .seat(0)
        .library(...library)
        .hand(AWAKENING.name)
        .define(AWAKENING)
        .battlefield('Forest', 'Forest', 'Forest', 'Forest')
        .graveyard(...graveyard)
        .seat(1)
        .library(...LIB)
        .seat(0)
        .at('precombatMain')
        .build();
    const mastered = build(['Lightning Bolt', 'Lightning Bolt']);
    mastered.act(0).cast(AWAKENING.name, { x: 3, pay: true });
    mastered.passAll();
    mastered.expect.tapped('Mountain', false);
    mastered.expect.tapped('Swamp', false);
    // one instant is not two, and a creature card is neither
    const short = build(['Lightning Bolt', 'Grizzly Bears']);
    short.act(0).cast(AWAKENING.name, { x: 3, pay: true });
    short.passAll();
    short.expect.tapped('Mountain');
    short.expect.tapped('Swamp');
  });

  test('Animist’s Awakening: with fewer cards in the library than X, all of them are revealed', () => {
    const g = scenario()
      .seat(0)
      .library('Mountain', 'Grizzly Bears')
      .hand(AWAKENING.name)
      .define(AWAKENING)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest')
      .seat(1)
      .library(...LIB)
      .seat(0)
      .at('precombatMain')
      .build();
    g.act(0).cast(AWAKENING.name, { x: 3, pay: true });
    g.passAll();
    g.expect.zone('Mountain', 'battlefield');
    g.expect.librarySize(0, 1);
  });

  const OOZE = parsed(
    'SYNTHETIC Parsed Ooze',
    'Creature — Ooze',
    'This creature enters with X +1/+1 counters on it.\nWhen this creature enters, destroy up to one target artifact or enchantment with mana value X or less. If X is 5 or more, you draw a card. If X is 10 or more, double the number of +1/+1 counters on any number of other target creatures.',
    { manaCost: '{X}{G}', power: '0', toughness: '0', colors: ['G'] },
  );

  test('Kinetic Ooze: it destroys an artifact of mana value X or less and not a bigger one', () => {
    const g = base()
      .define(OOZE)
      .hand(OOZE.name)
      .battlefield('Forest', 'Forest', 'Forest')
      .seat(1)
      .battlefield('Sol Ring', { label: 'ring' })
      .seat(0)
      .at('precombatMain')
      .build();
    g.act(0).cast(OOZE.name, { x: 1, pay: true });
    g.passAll();
    // Sol Ring has mana value 1: "mana value X or less" with X = 1 offers it
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets('ring');
    g.passAll();
    g.expect.zone('Sol Ring', 'graveyard');
    g.expect.counters(OOZE.name, { '+1/+1': 1 });
  });

  test('Kinetic Ooze: with X = 0 the mana value 1 artifact is too big, and nothing is asked', () => {
    const g = base()
      .define(OOZE)
      .hand(OOZE.name)
      .battlefield('Forest')
      .seat(1)
      .battlefield('Sol Ring')
      .seat(0)
      .at('precombatMain')
      .build();
    g.act(0).cast(OOZE.name, { x: 0, pay: true });
    g.passAll();
    g.expect.zone('Sol Ring', 'battlefield');
  });

  test('Kinetic Ooze: X = 10 doubles the +1/+1 counters of any number of other creatures, not its own', () => {
    const g = base()
      .define(OOZE)
      .hand(OOZE.name)
      .battlefield(...Array.from({ length: 11 }, () => 'Forest'))
      .battlefield('Grizzly Bears', { label: 'a', counters: { '+1/+1': 1 } })
      .battlefield('Grizzly Bears', { label: 'b', counters: { '+1/+1': 3 } })
      .battlefield('Grizzly Bears', { label: 'c', counters: { '+1/+1': 2 } })
      .at('precombatMain')
      .build();
    g.act(0).cast(OOZE.name, { x: 10, pay: true });
    g.passAll();
    // two slots: "up to one target artifact or enchantment" (none to choose) and the creatures
    const asked = g.state.pending;
    if (asked?.kind !== 'targets') throw new Error('the trigger asks for targets');
    const creatures = asked.specs[1]?.specId;
    if (creatures === undefined) throw new Error('the creatures are the second slot');
    g.act(0).choose({
      kind: 'chooseTargets',
      targets: ['a', 'b'].map((label) => ({
        kind: 'object' as const,
        id: g.id(label),
        specId: creatures,
      })),
    });
    g.passAll();
    g.expect.counters('a', { '+1/+1': 2 });
    g.expect.counters('b', { '+1/+1': 6 });
    g.expect.counters('c', { '+1/+1': 2 });
    g.expect.counters(OOZE.name, { '+1/+1': 10 });
  });

  test('Kinetic Ooze: X = 5 also draws a card, X = 4 does not', () => {
    const run = (x: number) => {
      const g = base()
        .define(OOZE)
        .hand(OOZE.name)
        .battlefield(...Array.from({ length: x + 1 }, () => 'Forest'))
        .at('precombatMain')
        .build();
      g.act(0).cast(OOZE.name, { x, pay: true });
      g.passAll();
      return g;
    };
    run(5).expect.handSize(0, 1);
    run(4).expect.handSize(0, 0);
  });

  const EGO = parsed(
    'SYNTHETIC Parsed Ego',
    'Creature — Shapeshifter',
    "This spell can't be countered.\nYou may have ~ enter as a copy of any creature on the battlefield, except it enters with X additional +1/+1 counters on it.",
    { manaCost: '{X}{2}{G}{U}', power: '0', toughness: '0', colors: ['G', 'U'] },
  );

  test('Altered Ego: it enters as a copy of the creature chosen, with X more +1/+1 counters', () => {
    const g = base()
      .define(EGO)
      .hand(EGO.name)
      .battlefield('Forest', 'Forest', 'Forest', 'Island', 'Island')
      .battlefield('Grizzly Bears', { label: 'bears' })
      .at('precombatMain')
      .build();
    g.act(0).cast(EGO.name, { x: 1, pay: true });
    g.passAll();
    g.act(0).choosePermanents('Grizzly Bears');
    g.expect.counters(EGO.name, { '+1/+1': 1 });
    g.expect.pt(EGO.name, 3, 3);
  });

  test('Altered Ego: declining the copy leaves a 0/0 with no counters, which dies', () => {
    const g = base()
      .define(EGO)
      .hand(EGO.name)
      .battlefield('Forest', 'Forest', 'Forest', 'Island', 'Island')
      .battlefield('Grizzly Bears')
      .at('precombatMain')
      .build();
    g.act(0).cast(EGO.name, { x: 0, pay: true });
    g.passAll();
    g.act(0).choosePermanents();
    g.expect.zone(EGO.name, 'graveyard');
  });
});
