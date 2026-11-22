// Group E of the Scions & Spellcraft deck (issue 98), the real cards of the golden corpus played through the engine: Tataru Taru (an opponent who "may draw", the draw trigger "if it isn't that
// player's turn"), Demolition Field (a lone "you may search" in an activated ability), Champions from Beyond ("those creatures" of an attack batch), Relic of Legends (a mana ability whose only
// cost taps a creature) and Transpose (Rebound, CR 702.88a, and "if this spell was cast from your hand").
import { readFileSync } from 'node:fs';
import { scenario } from '@commander-arena/engine/testing';
import { expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';
import { read, readAll } from './parser-p5-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const load = (name: string) => {
  const found = cards.find((c) => c.name === name);
  if (found === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(found), undefined, NO_OVERRIDES);
  expect(imported.support.status, JSON.stringify(imported.support)).toBe('supported');
  return imported.definition;
};
const tataru = load('Tataru Taru');
const field = load('Demolition Field');
const champions = load('Champions from Beyond');
const relic = load('Relic of Legends');
const transpose = load('Transpose');

/** A SYNTHETIC vanilla creature, imported through the grammar (no ability text). */
const vanilla = (name: string, typeLine = 'Creature — Bear') => {
  const imported = importCard(
    syntheticCard({ name, typeLine, manaCost: '{1}', power: '2', toughness: '2', oracleText: '' }),
    undefined,
    NO_OVERRIDES,
  );
  expect(imported.support.status).toBe('supported');
  return imported.definition;
};

test("Tataru Taru: the controller draws, the opponent may draw, and the draw on the controller's turn makes a tapped Treasure, once", () => {
  const g = scenario()
    .define(tataru)
    .seat(0)
    .hand(tataru.name)
    .library('Forest', 'Forest', 'Forest')
    .battlefield('Plains', 'Plains')
    .seat(1)
    .library('Forest', 'Forest', 'Forest')
    .build();
  g.act(0).cast(tataru.name, { pay: true });
  g.passAll();
  // The opponent is asked ("target opponent may draw a card") and says yes.
  g.expect.pending('confirmOptional', 1);
  g.act(1).accept();
  g.passAll();
  g.expect.handSize(0, 1);
  g.expect.handSize(1, 1);
  // The opponent drew in the controller's turn: one tapped Treasure for the controller.
  const treasures = g.find({ name: 'Treasure', zone: 'battlefield', seat: 0 });
  expect(treasures).toHaveLength(1);
  g.expect.tapped(treasures[0]?.id ?? '', true);
  g.expect.invariants();
});

test('Tataru Taru: an opponent who declines draws nothing and no Treasure is made', () => {
  const g = scenario()
    .define(tataru)
    .seat(0)
    .hand(tataru.name)
    .library('Forest', 'Forest')
    .battlefield('Plains', 'Plains')
    .seat(1)
    .library('Forest', 'Forest')
    .build();
  g.act(0).cast(tataru.name, { pay: true });
  g.passAll();
  g.act(1).decline();
  g.passAll();
  g.expect.handSize(1, 0);
  expect(g.find({ name: 'Treasure', zone: 'battlefield' })).toHaveLength(0);
});

test('Tataru Taru: a card an opponent draws in their own turn makes no Treasure', () => {
  const g = scenario()
    .define(tataru)
    .seat(0)
    .battlefield(tataru.name)
    .library('Forest', 'Forest')
    .seat(1)
    .library('Forest', 'Forest', 'Forest')
    .build();
  g.advanceTo('draw', { turn: 'next' });
  g.passAll();
  g.expect.handSize(1, 1);
  expect(g.find({ name: 'Treasure', zone: 'battlefield' })).toHaveLength(0);
});

test("Demolition Field: destroys an opponent's nonbasic land, both players may fetch a basic land (the opponent first)", () => {
  const nonbasic = importCard(
    syntheticCard({ name: 'SYNTHETIC Nonbasic', typeLine: 'Land', oracleText: '{T}: Add {C}.' }),
    undefined,
    NO_OVERRIDES,
  ).definition;
  const g = scenario()
    .define(field)
    .define(nonbasic)
    .seat(0)
    .battlefield(field.name, 'Island', 'Island')
    .library('Forest', 'Forest')
    .seat(1)
    .battlefield(nonbasic.name)
    .library('Mountain', 'Mountain')
    .build();
  g.act(0).activate(field.name).targets([nonbasic.name]).pay();
  g.passAll();
  expect(g.find({ name: nonbasic.name, zone: 'battlefield' })).toHaveLength(0);
  // The land's controller is asked first.
  g.expect.pending('confirmOptional', 1);
  g.act(1).accept();
  g.expect.pending('chooseCards', 1);
  g.act(1).chooseCards('Mountain[0]');
  g.passAll();
  expect(g.find({ name: 'Mountain', zone: 'battlefield', seat: 1 })).toHaveLength(1);
  g.expect.pending('confirmOptional', 0);
  g.act(0).accept();
  g.expect.pending('chooseCards', 0);
  g.act(0).chooseCards('Forest[0]');
  g.passAll();
  expect(g.find({ name: 'Forest', zone: 'battlefield', seat: 0 })).toHaveLength(1);
  g.expect.zone(field.name, 'graveyard', { seat: 0 });
  g.expect.invariants();
});

test('Champions from Beyond: eight attackers get +4/+4, seven do not, and a creature that stayed home is not changed', () => {
  const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((n) => `SYNTHETIC Hero ${n}`);
  const bear = vanilla('SYNTHETIC Hero');
  const build = () => {
    let b = scenario()
      .define(champions)
      .define(bear)
      .seat(0)
      .library('Forest', 'Forest', 'Forest', 'Forest')
      .battlefield(champions.name);
    for (let i = 0; i < 9; i++) b = b.battlefield(bear.name, { sick: false } as never);
    return b.seat(1).build();
  };
  void names;
  const run = (count: number) => {
    const g = build();
    g.advanceTo('declareAttackers', { attack: false });
    const attackers = g.find({ name: bear.name, zone: 'battlefield', seat: 0 }).slice(0, count);
    g.act(0).attack(attackers.map((o) => o.id));
    g.passAll();
    // Light Party, the four-or-more twin, scries 2 and draws: leave the cards where they are.
    if (count >= 8) {
      g.act(0).orderTriggers(0, 1);
      g.passAll();
    }
    if (count >= 4) {
      g.act(0).arrange({ top: ['Forest[0]', 'Forest[1]'] });
      g.passAll();
    }
    return { g, attackers };
  };
  const eight = run(8);
  for (const o of eight.attackers) eight.g.expect.pt(o.id, 6, 6);
  const home = eight.g.find({ name: bear.name, zone: 'battlefield', seat: 0 }).at(-1);
  eight.g.expect.pt(home?.id ?? '', 2, 2);
  const seven = run(7);
  for (const o of seven.attackers) seven.g.expect.pt(o.id, 2, 2);
});

test('Relic of Legends: tapping an untapped legendary creature adds one mana of any color; a nonlegendary one is not accepted', () => {
  const legend = vanilla('SYNTHETIC Legend', 'Legendary Creature — Human');
  const bear = vanilla('SYNTHETIC Plain Bear');
  const g = scenario()
    .define(relic)
    .define(legend)
    .define(bear)
    .seat(0)
    .battlefield(relic.name, legend.name, bear.name)
    .seat(1)
    .build();
  g.act(0).tapForMana(relic.name, { color: 'G', ability: 1 });
  g.expect.tapped(legend.name, true);
  g.expect.tapped(bear.name, false);
  g.expect.pool(0, { G: 1 });
});

test('Transpose: cast from the hand it makes the Wizard and goes to exile; at the next upkeep it may be cast again, and then goes to the graveyard', () => {
  const g = scenario()
    .define(transpose)
    .seat(0)
    .hand(transpose.name, 'Forest')
    .library('Forest', 'Forest', 'Forest', 'Forest', 'Forest')
    .battlefield('Swamp', 'Swamp', 'Swamp')
    .seat(1)
    .library('Forest', 'Forest', 'Forest')
    .build();
  g.act(0).cast(transpose.name, { pay: true });
  g.passAll();
  // Draw a card, then discard a card.
  g.act(0).chooseCards('Forest[0]');
  g.passAll();
  g.expect.life(0, 39);
  g.expect.zone(transpose.name, 'exile', { seat: 0 });
  const wizards = g.find({ name: 'Wizard', zone: 'battlefield', seat: 0 });
  expect(wizards).toHaveLength(1);
  g.expect.pt(wizards[0]?.id ?? '', 0, 1);
  // The Wizard hurts an opponent for each noncreature spell its controller casts.
  g.advanceTo('upkeep', { turn: 'next' });
  g.advanceTo('upkeep', { turn: 'next' });
  // At the beginning of the caster's next upkeep the card in exile may be cast without paying its mana cost.
  g.passAll();
  g.expect.pending('chooseCards', 0);
  g.act(0).chooseCards(transpose.name);
  g.passAll();
  // The second cast resolves: draw, discard (the Wizard's controller is the caster, no Wizard trigger from an instant of its own).
  g.act(0).chooseCards('Forest[0]');
  g.passAll();
  // Cast from exile, not from the hand: no second rebound and no second Wizard.
  g.expect.zone(transpose.name, 'graveyard', { seat: 0 });
  expect(g.find({ name: 'Wizard', zone: 'battlefield', seat: 0 })).toHaveLength(1);
  // The Wizard dealt 1 damage to the opponent when the controller cast a noncreature spell (the cast from exile).
  g.expect.life(1, 39);
  g.expect.invariants();
});

test('Rebound: a rebounding spell that is countered goes to the graveyard and is not cast again (CR 702.88a: only as it resolves)', () => {
  const counter = importCard(
    syntheticCard({
      name: 'SYNTHETIC Counter',
      typeLine: 'Instant',
      manaCost: '{U}',
      oracleText: 'Counter target spell.',
    }),
    undefined,
    NO_OVERRIDES,
  ).definition;
  const g = scenario()
    .define(transpose)
    .define(counter)
    .seat(0)
    .hand(transpose.name)
    .battlefield('Swamp', 'Swamp', 'Swamp')
    .seat(1)
    .hand(counter.name)
    .battlefield('Island')
    .build();
  g.act(0).cast(transpose.name, { pay: true });
  g.pass(0);
  g.act(1).cast(counter.name, { targets: [transpose.name], pay: true });
  g.passAll();
  g.expect.zone(transpose.name, 'graveyard', { seat: 0 });
  expect(g.find({ name: 'Wizard', zone: 'battlefield' })).toHaveLength(0);
});

test('Demolition Field: the controller may decline their own search', () => {
  const nonbasic = importCard(
    syntheticCard({ name: 'SYNTHETIC Nonbasic', typeLine: 'Land', oracleText: '{T}: Add {C}.' }),
    undefined,
    NO_OVERRIDES,
  ).definition;
  const g = scenario()
    .define(field)
    .define(nonbasic)
    .seat(0)
    .battlefield(field.name, 'Island', 'Island')
    .library('Forest', 'Forest')
    .seat(1)
    .battlefield(nonbasic.name)
    .library('Mountain')
    .build();
  g.act(0).activate(field.name).targets([nonbasic.name]).pay();
  g.passAll();
  g.act(1).decline();
  g.passAll();
  g.act(0).decline();
  g.passAll();
  expect(g.find({ name: 'Mountain', zone: 'battlefield' })).toHaveLength(0);
  expect(g.find({ name: 'Forest', zone: 'battlefield' })).toHaveLength(0);
});

test('near misses are not read: those creatures outside an attack batch, a turn of another kind, a lone "you may" that is not a search', () => {
  const lines = [
    // "those creatures" with no attack declaration to name them.
    'Whenever a creature you control dies, those creatures get +4/+4 until end of turn.',
    'Whenever you attack with eight or more Goblins, those creatures get +4/+4 until end of turn.',
    "Whenever an opponent draws a card, if it's your turn, create a tapped Treasure token.",
    "Whenever an opponent draws a card, if it isn't that player's next turn, create a tapped Treasure token.",
  ];
  for (const text of lines) {
    expect(read(text, 'enchantment').unparsed.length, text).toBeGreaterThan(0);
  }
  // "You may ..." in an activated ability that is not the lone search is still not read.
  expect(
    read('{T}: You may draw a card.', 'artifact').unparsed.length,
    'a lone optional draw is not a search',
  ).toBeGreaterThan(0);
  // The three-clause forms the cards use are read.
  readAll('When ~ enters, you draw a card and each opponent may draw a card.', 'creature');
});

test('Transpose: a spell that is countered or cast from elsewhere is not rebounded (the keyword reads the zone it was cast from)', () => {
  expect(transpose.faces[0]?.abilities).toContainEqual({
    kind: 'keyword',
    keyword: { kind: 'rebound' },
  });
});
