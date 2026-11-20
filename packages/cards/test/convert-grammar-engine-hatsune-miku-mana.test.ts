// Mirari's Wake and Vorinclex, Voice of Hunger (the Hatsune Miku deck, issue 145): the REAL Oracle text of the cards (golden.jsonl, taken from the issue) goes through the grammar
// with no override and is played through applyAction, so the nodes the parser writes are what the engine runs.
// Pins: CR 106.12a (an ability that triggers whenever a permanent "is tapped for mana" triggers as its mana ability resolves and produces mana), CR 605.1b and 605.4a (a triggered
// mana ability resolves at once into the same pool, so the added mana can pay for the spell being cast), CR 603.2 (an ability that uses the stack goes on it at the next priority),
// CR 502.3 and 611.2a ("doesn't untap during its controller's next untap step" lasts until that step has come), CR 613.4c (+1/+1 from a static ability).
import { readFileSync } from 'node:fs';
import { type CardDefinition, getView, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

/** A card of the golden corpus with its text replaced, imported through the grammar. */
function withText(name: string, text: string) {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const [face] = card.faces;
  if (face === undefined) throw new Error(`${name} has no face`);
  return importCard(
    fromGoldenCard({ ...card, faces: [{ ...face, oracleText: text }] }),
    undefined,
    NO_OVERRIDES,
  );
}

const WAKE = real("Mirari's Wake");
const VORINCLEX = real('Vorinclex, Voice of Hunger');
const BEARS = 'Grizzly Bears'; // {1}{G}, 2/2
const SPIDER = 'Giant Spider'; // 2/4
const FILLER = Array.from({ length: 8 }, () => 'Plains');

const board = (
  mine: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>,
  theirs: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario> = (b) => b,
  active: 0 | 1 = 0,
) =>
  theirs(
    mine(
      scenario()
        .define(WAKE)
        .define(VORINCLEX)
        .seat(0)
        .library(...FILLER),
    )
      .seat(1)
      .library(...FILLER),
  )
    .at('precombatMain', { active, turn: active === 0 ? 1 : 2 })
    .build();

describe('Mirari\'s Wake: "Creatures you control get +1/+1. Whenever you tap a land for mana, add one mana of any type that land produced."', () => {
  test('the card is valid and reads two abilities: a static and a triggered mana ability', () => {
    expect(validateCard(WAKE)).toEqual([]);
    const kinds = WAKE.faces[0]?.abilities.map((a) => a.kind);
    expect(kinds).toEqual(['static', 'triggered']);
    const triggered = WAKE.faces[0]?.abilities[1];
    expect(triggered).toMatchObject({
      trigger: { kind: 'tappedForMana', by: 'you' },
      effect: { kind: 'addMana', mana: { kind: 'producedType' } },
    });
  });

  test.each([
    ['Forest', 'GG'],
    ['Plains', 'WW'],
    ['Island', 'UU'],
  ])(
    'a %s makes one mana and the Wake adds one more of that type (%s), at once, with nothing on the stack',
    (land, pool) => {
      const g = board((b) => b.seat(0).battlefield(WAKE.name, land));
      g.act(0).tapForMana(land);
      g.expect.pool(0, pool);
      g.expect.stack([]);
      g.expect.invariants();
    },
  );

  test("creatures you control get +1/+1, the opponent's creatures do not", () => {
    const g = board(
      (b) => b.seat(0).battlefield(WAKE.name, BEARS),
      (b) => b.seat(1).battlefield(SPIDER),
    );
    const view = getView(g.state, 0).battlefield;
    expect(view.find((o) => o.name === BEARS)).toMatchObject({ power: 3, toughness: 3 });
    expect(view.find((o) => o.name === SPIDER)).toMatchObject({ power: 2, toughness: 4 });
  });

  test('one Forest pays all of Grizzly Bears ({1}{G}): the added mana is there as the spell is paid for (CR 605.4a)', () => {
    const g = board((b) => b.seat(0).hand(BEARS).battlefield(WAKE.name, 'Forest'));
    g.act(0).cast(BEARS, { pay: true });
    g.expect.stack([BEARS]);
    g.expect.tapped('Forest', true);
  });

  test('an opponent\'s lands do not make mana for my Wake ("you tap")', () => {
    const g = board(
      (b) => b.seat(0).battlefield(WAKE.name),
      (b) => b.seat(1).battlefield('Forest'),
      1,
    );
    g.act(1).tapForMana('Forest');
    g.expect.pool(1, 'G');
    g.expect.pool(0, '');
  });

  test('a creature tapped for mana is no land: the Wake adds nothing', () => {
    const g = board((b) => b.seat(0).battlefield(WAKE.name, 'Llanowar Elves'));
    g.act(0).tapForMana('Llanowar Elves');
    g.expect.pool(0, 'G');
  });
});

describe('Vorinclex, Voice of Hunger: "Trample. Whenever you tap a land for mana, add one mana of any type that land produced. Whenever an opponent taps a land for mana, that land doesn\'t untap during its controller\'s next untap step."', () => {
  test('the card is valid: trample, a triggered mana ability and a triggered ability that uses the stack', () => {
    expect(validateCard(VORINCLEX)).toEqual([]);
    const face = VORINCLEX.faces[0];
    expect(face?.power).toBe(7);
    expect(
      face?.abilities.filter((a) => a.kind === 'triggered').map((a) => a.trigger.kind),
    ).toEqual(['tappedForMana', 'tapsForMana']);
  });

  test('your lands: one more mana of the type the land made, and no trigger of the second ability', () => {
    const g = board((b) => b.seat(0).battlefield(VORINCLEX.name, 'Forest'));
    g.act(0).tapForMana('Forest');
    g.expect.pool(0, 'GG');
    g.expect.stack([]);
  });

  test('with the Wake as well, a Forest makes three: each ability reads what the land produced (CR 106.12a)', () => {
    const g = board((b) => b.seat(0).battlefield(VORINCLEX.name, WAKE.name, 'Forest'));
    g.act(0).tapForMana('Forest');
    g.expect.pool(0, 'GGG');
  });

  test('an opponent taps a land for mana: the trigger uses the stack, the land stays tapped through its next untap step, and untaps in the one after', () => {
    const g = board(
      (b) => b.seat(0).battlefield(VORINCLEX.name),
      (b) => b.seat(1).battlefield('Forest', 'Island'),
      1,
    );
    g.act(1).tapForMana('Forest');
    g.expect.pool(1, 'G');
    g.expect.stack([`${VORINCLEX.name} (ability)`]);
    g.passAll();
    g.expect.stack([]);
    g.expect.tapped('Forest', true);
    // Seat 0's turn 3, then seat 1's turn 4: its untap step does not untap the Forest.
    g.advanceTo('upkeep', { turn: 4 });
    g.expect.tapped('Forest', true);
    // The restriction is over: the untap step of turn 6 untaps it.
    g.advanceTo('upkeep', { turn: 6 });
    g.expect.tapped('Forest', false);
  });

  test("a land that was not tapped for mana untaps as usual, and the opponent's other lands are unaffected", () => {
    const g = board(
      (b) => b.seat(0).battlefield(VORINCLEX.name),
      (b) => b.seat(1).battlefield('Forest', 'Island'),
      1,
    );
    g.act(1).tapForMana('Forest');
    g.passAll();
    g.advanceTo('upkeep', { turn: 4 });
    g.expect.tapped('Island', false);
  });

  test("the opponent's creature tapped for mana is no land: no trigger", () => {
    const g = board(
      (b) => b.seat(0).battlefield(VORINCLEX.name),
      (b) => b.seat(1).battlefield('Llanowar Elves'),
      1,
    );
    g.act(1).tapForMana('Llanowar Elves');
    g.expect.stack([]);
  });

  test('two lands tapped for mana trigger twice, one for each land', () => {
    const g = board(
      (b) => b.seat(0).battlefield(VORINCLEX.name),
      (b) => b.seat(1).battlefield('Forest', 'Island'),
      1,
    );
    g.act(1).tapForMana('Forest');
    g.act(1).tapForMana('Island');
    g.expect.stack([`${VORINCLEX.name} (ability)`, `${VORINCLEX.name} (ability)`]);
    g.passAll();
    g.advanceTo('upkeep', { turn: 4 });
    g.expect.tapped('Forest', true);
    g.expect.tapped('Island', true);
  });
});

describe('what this mechanism does not read stays unsupported', () => {
  test.each([
    // not one mana
    'Whenever you tap a land for mana, add two mana of any type that land produced.',
    // another kind of choice
    'Whenever you tap a land for mana, add one mana of any color that land produced.',
    // a player who is not you taps it, and the mana would be theirs
    'Whenever an opponent taps a land for mana, add one mana of any type that land produced.',
    'Whenever a player taps a land for mana, add one mana of any type that land produced.',
    // a "may" and an extra instruction
    'Whenever you tap a land for mana, you may add one mana of any type that land produced.',
    'Whenever you tap a land for mana, add one mana of any type that land produced and draw a card.',
    // the word of the permanent contradicts the trigger
    'Whenever you tap a creature for mana, add one mana of any type that land produced.',
    // outside a triggered mana ability
    '{T}: Add one mana of any type that land produced.',
    'Add one mana of any type that land produced.',
    // "could produce" is another primitive (CR 106.7)
    'Whenever you tap a land for mana, add one mana of any type that land could produce.',
    // the second ability's near misses
    "Whenever an opponent taps a land for mana, that land doesn't untap during your next untap step.",
    "Whenever an opponent taps a land for mana, that land doesn't untap.",
  ])('%s', (text) => {
    const imported = withText("Mirari's Wake", text);
    expect(imported.support.status).not.toBe('supported');
  });
});
