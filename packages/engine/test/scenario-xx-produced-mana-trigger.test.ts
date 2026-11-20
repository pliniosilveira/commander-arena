// "Whenever you tap a land for mana, add one mana of any type that land produced." (a triggered mana ability, CR 605.1b)
// Pins: CR 106.12a (an ability that triggers whenever a permanent "is tapped for mana" triggers as the mana ability resolves and produces mana), CR 605.4a (it resolves at once into
// the same pool, without the stack, so the mana can pay for the spell being cast), CR 106.1b (colorless is a type of mana), CR 605.3b (a choice is made as the mana ability is
// activated). Cards are SYNTHETIC probes built here (`producedType` is the effect of a `tappedForMana` trigger only).
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { type Ability, type CardDefinition, validateCard } from '../src/index';
import type { scenario } from '../src/testing/index';
import { twoSeatGame } from './two-seat-helpers';

const trigger = (by: 'you' | 'tapper' = 'you'): Ability => ({
  kind: 'triggered',
  trigger: { kind: 'tappedForMana', what: { types: ['land'] }, by },
  effect: { kind: 'addMana', mana: { kind: 'producedType' } },
});

const enchantment = (name: string, abilities: Ability[]): CardDefinition =>
  singleFace({
    name,
    manaCost: ['3', 'G'],
    types: ['enchantment'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Whenever you tap a land for mana, add one mana of any type that land produced.',
    abilities,
  });

const land = (name: string, production: Extract<Ability, { kind: 'mana' }>['production']) =>
  singleFace({
    name,
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: [],
    oracleText: 'SYNTHETIC land',
    abilities: [{ kind: 'mana', cost: [{ kind: 'tap' }], production }],
  });

const WAKE = enchantment('SYNTHETIC Echo Wake', [trigger()]);
const WAKE2 = enchantment('SYNTHETIC Echo Wake Two', [trigger()]);
const DUAL = land('SYNTHETIC Twin Spring', { kind: 'fixed', mana: ['W', 'U'] });
const WASTE = land('SYNTHETIC Twin Waste', { kind: 'fixed', mana: ['C', 'C'] });
const CHOICE = land('SYNTHETIC Prism Spring', { kind: 'oneOf', colors: ['W', 'U'] });
const MONUMENT = 'SYNTHETIC Echo Monument'; // adds {C} when a permanent is tapped for {C}
const BEARS = 'Grizzly Bears'; // {1}{G}

type Builder = ReturnType<typeof scenario>;
const game = (cards: readonly CardDefinition[], stock: (b: Builder) => Builder) =>
  twoSeatGame((b) => stock(cards.reduce((acc, c) => acc.define(c), b)));

const messages = (card: CardDefinition): string =>
  validateCard(card)
    .map((i) => i.message)
    .join(' | ');

describe('validation', () => {
  test('the probe card is valid, with the tapper as well', () => {
    expect(validateCard(WAKE)).toEqual([]);
    expect(validateCard(enchantment('SYNTHETIC Echo Tapper', [trigger('tapper')]))).toEqual([]);
  });

  test('a mana ability cannot make "a type the permanent produced"', () => {
    const bad = land('SYNTHETIC Bad Land', { kind: 'producedType' });
    expect(messages(bad)).toContain('triggered mana ability');
  });

  test('a trigger that is not "tapped for mana" cannot add it', () => {
    const other = enchantment('SYNTHETIC Bad Etb', [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: { kind: 'addMana', mana: { kind: 'producedType' } },
      },
    ]);
    expect(messages(other)).toContain('"tapped for mana" triggered mana ability');
  });

  test('a "may" or an intervening "if" makes it no mana ability: refused', () => {
    const optional = enchantment('SYNTHETIC Bad May', [
      { ...trigger(), optional: true } as Ability,
    ]);
    expect(messages(optional)).toContain('triggered mana ability');
  });
});

describe('behaviour (CR 106.12a, 605.4a)', () => {
  test.each([
    ['Forest', 'GG'],
    ['Plains', 'WW'],
    ['Mountain', 'RR'],
  ])('a %s makes one mana, and the Wake adds one of the same type: %s', (name, pool) => {
    const g = game([WAKE], (b) => b.battlefield(WAKE.name).battlefield(name));
    g.act(0).tapForMana(name);
    g.expect.pool(0, pool);
    g.expect.stack([]);
    g.expect.invariants();
  });

  test('a land that makes {C}{C} adds one {C}, not two: one mana of a type it produced', () => {
    const g = game([WAKE, WASTE], (b) => b.battlefield(WAKE.name).battlefield(WASTE.name));
    g.act(0).tapForMana(WASTE.name);
    g.expect.pool(0, 'CCC');
  });

  test('two Wakes each add one: a Forest makes three {G}', () => {
    const g = game([WAKE, WAKE2], (b) =>
      b.battlefield(WAKE.name, WAKE2.name).battlefield('Forest'),
    );
    g.act(0).tapForMana('Forest');
    g.expect.pool(0, 'GGG');
  });

  test('a permanent that is no land does not match a land trigger', () => {
    const g = game([WAKE], (b) => b.battlefield(WAKE.name).battlefield('Llanowar Elves'));
    g.act(0).tapForMana('Llanowar Elves');
    g.expect.pool(0, 'G');
  });

  test("an opponent's Wake adds nothing for my land", () => {
    const g = twoSeatGame(
      (b) => b.battlefield('Forest'),
      (b) => b.define(WAKE).battlefield(WAKE.name),
    );
    g.act(0).tapForMana('Forest');
    g.expect.pool(0, 'G');
  });

  test('a land that makes two types: the type is named, and it is one of the two', () => {
    const g = game([WAKE, DUAL], (b) => b.battlefield(WAKE.name).battlefield(DUAL.name));
    expect(g.act(0).try.tapForMana(DUAL.name).ok).toBe(false);
    g.expect.pool(0, '');
    expect(g.act(0).try.tapForMana(DUAL.name, { extraColors: ['G'] }).ok).toBe(false);
    g.act(0).tapForMana(DUAL.name, { extraColors: ['U'] });
    g.expect.pool(0, 'WUU');
  });

  test('a land that chooses {W} or {U}: the added mana follows the type it produced', () => {
    const g = game([WAKE, CHOICE], (b) => b.battlefield(WAKE.name).battlefield(CHOICE.name));
    g.act(0).tapForMana(CHOICE.name, { color: 'U' });
    g.expect.pool(0, 'UU');
    const h = game([WAKE, CHOICE], (b) => b.battlefield(WAKE.name).battlefield(CHOICE.name));
    h.act(0).tapForMana(CHOICE.name, { color: 'W' });
    h.expect.pool(0, 'WW');
  });

  test('the Wake and a fixed-mana amplifier each read what the land produced, not each other', () => {
    const g = game([WAKE, WASTE], (b) =>
      b.battlefield(WAKE.name).battlefield(MONUMENT).battlefield(WASTE.name),
    );
    g.act(0).tapForMana(WASTE.name);
    // The land makes {C}{C}; the Monument adds {C}; the Wake adds one {C} of what the land produced: not a second one for the Monument's.
    g.expect.pool(0, 'CCCC');
  });

  test('the added mana pays for the spell as it is cast: one Forest and the Wake cast Grizzly Bears', () => {
    const g = game([WAKE], (b) => b.hand(BEARS).battlefield(WAKE.name).battlefield('Forest'));
    g.act(0).cast(BEARS, { pay: true });
    g.expect.stack([BEARS]);
    g.expect.tapped('Forest', true);
  });

  test('a mana ability without {T} in its cost is not tapping for mana: no added mana', () => {
    const g = game([WAKE], (b) => b.battlefield(WAKE.name).battlefield('SYNTHETIC Pain Stone'));
    g.act(0).tapForMana('SYNTHETIC Pain Stone');
    g.expect.pool(0, 'C');
  });
});
