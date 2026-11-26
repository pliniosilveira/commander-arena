// The Party Time deck, group "library": the REAL cards of the owner's golden corpus (real Oracle text, `fixtures/corpus/golden.jsonl`), imported through the
// grammar only and played through applyAction. No Scryfall ruling could be fetched here; the rulings quoted come from the deck issue's rulings comment.
import { readFileSync } from 'node:fs';
import { type CardDefinition, getView } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const FILLER = Array.from({ length: 30 }, () => 'Island');
const BEARS = 'Grizzly Bears';

describe("Galepowder Mage (Whenever this creature attacks, exile another target creature. Return that card to the battlefield under its owner's control at the beginning of the next end step.)", () => {
  const MAGE = real('Galepowder Mage');
  const board = () =>
    scenario()
      .define(MAGE)
      .seat(0)
      .battlefield(MAGE.name, { label: 'mage' })
      .library(...FILLER)
      .seat(1)
      .battlefield(BEARS, { label: 'bears' })
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('the creature of another player is exiled when the Mage attacks and returns under its owner at the next end step', () => {
    const g = board();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(['mage']);
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    expect(getView(g.state, 1).battlefield.some((o) => o.name === BEARS)).toBe(true);
  });

  test('"another": alone on the battlefield the Mage has no target and exiles nothing', () => {
    const g = scenario()
      .define(MAGE)
      .seat(0)
      .battlefield(MAGE.name, { label: 'mage' })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(['mage']);
    g.passAll();
    g.expect.zone(MAGE.name, 'battlefield', { seat: 0 });
  });
});

describe('Glorious Protector (When this creature enters, you may exile any number of non-Angel creatures you control until this creature leaves the battlefield.)', () => {
  const PROTECTOR = real('Glorious Protector');
  const SERRA = 'Serra Angel';
  const protector = () =>
    scenario()
      .define(PROTECTOR)
      .seat(0)
      .hand(PROTECTOR.name)
      .battlefield('Plains', { count: 4 })
      .battlefield(BEARS, { label: 'bears' })
      .battlefield('Giant Spider', { label: 'spider' })
      .battlefield(SERRA, { label: 'angel' })
      .library(...FILLER)
      .seat(1)
      .battlefield(BEARS, { label: 'theirs' })
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test("the creatures chosen are exiled; Angels and other players' creatures are not offered (CR 608.2d)", () => {
    const g = protector();
    g.act(0).cast(PROTECTOR.name, { pay: true });
    g.passAll();
    g.act(0).accept();
    const pending = g.state.pending;
    expect(pending?.kind).toBe('choosePermanent');
    if (pending?.kind !== 'choosePermanent') return;
    expect(pending.min).toBe(0);
    expect(pending.max).toBe(2);
    expect(pending.legal).toHaveLength(2);
    g.act(0).choosePermanents('bears', 'spider');
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.zone('Giant Spider', 'exile', { seat: 0 });
    g.expect.zone(SERRA, 'battlefield', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });

  test('"any number" includes none: the creatures stay', () => {
    const g = protector();
    g.act(0).cast(PROTECTOR.name, { pay: true });
    g.passAll();
    g.act(0).accept();
    g.act(0).choosePermanents();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone('Giant Spider', 'battlefield', { seat: 0 });
  });

  const withMurder = () =>
    scenario()
      .define(PROTECTOR)
      .seat(0)
      .hand(PROTECTOR.name)
      .battlefield('Plains', { count: 4 })
      .battlefield(BEARS, { label: 'bears' })
      .library(...FILLER)
      .seat(1)
      .hand('Murder')
      .battlefield('Swamp', { count: 3 })
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('the creatures return, under their owner, when the Protector leaves the battlefield (CR 610.3)', () => {
    const g = withMurder();
    g.act(0).cast(PROTECTOR.name, { pay: true });
    g.passAll();
    g.act(0).accept();
    g.act(0).choosePermanents('bears');
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.act(0).pass();
    g.act(1).cast('Murder', { pay: true, targets: [{ name: PROTECTOR.name }] });
    g.passAll();
    g.expect.zone(PROTECTOR.name, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('a Protector that left before its ability resolves exiles nothing (CR 610.3a)', () => {
    const g = withMurder();
    g.act(0).cast(PROTECTOR.name, { pay: true });
    g.pass();
    g.pass();
    // The enters trigger is on the stack: the opponent kills the Protector in response.
    g.act(0).pass();
    g.act(1).cast('Murder', { pay: true, targets: [{ name: PROTECTOR.name }] });
    g.passAll();
    g.act(0).accept();
    g.expect.zone(PROTECTOR.name, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    expect(g.state.pending?.kind).toBe('priority');
  });
});

describe('Harper Recruiter (Whenever this creature attacks, look at the top four cards of your library. You may reveal a Cleric card, a Rogue card, a Warrior card, and/or a Wizard card from among them and put those cards into your hand. Put the rest on the bottom of your library in a random order.)', () => {
  const HARPER = real('Harper Recruiter');
  // SYNTHETIC stand-ins for the cards of the library: only their types matter.
  const kind = (name: string, line: string) =>
    parsed(`SYNTHETIC ${name}`, line, '', { power: '1', toughness: '1', manaCost: '{1}' });
  const CLERIC = kind('Cleric', 'Creature — Human Cleric');
  const CLERIC2 = kind('Second Cleric', 'Creature — Human Cleric');
  const ROGUE = kind('Rogue', 'Creature — Human Rogue');
  const WIZARD = kind('Wizard', 'Creature — Human Wizard');
  const CLERIC_ROGUE = kind('Cleric Rogue', 'Creature — Human Cleric Rogue');
  const plain = kind('Bear', 'Creature — Bear');
  const board = (...top: CardDefinition[]) => {
    const b = scenario().define(HARPER);
    for (const d of new Set(top)) b.define(d);
    return b
      .seat(0)
      .battlefield(HARPER.name, { label: 'harper' })
      .library(...top.map((d) => d.name), ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
  };
  const attack = (g: ReturnType<typeof board>) => {
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(['harper']);
    g.passAll();
  };

  test('one card of each kind may be taken; the rest go to the bottom (CR 701.20, 401.4)', () => {
    const g = board(CLERIC, CLERIC2, ROGUE, plain);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(['harper']);
    g.passAll();
    // Asked for a Cleric (two candidates), then a Rogue (one), then Warrior and Wizard have none and ask nothing.
    g.act(0).chooseCards(CLERIC2.name);
    g.act(0).chooseCards(ROGUE.name);
    g.expect.zone(CLERIC2.name, 'hand', { seat: 0 });
    g.expect.zone(ROGUE.name, 'hand', { seat: 0 });
    g.expect.zone(CLERIC.name, 'library', { seat: 0 });
    g.expect.zone(plain.name, 'library', { seat: 0 });
    const library = g.state.seats[0]?.library ?? [];
    expect(library).toHaveLength(32);
    // The two cards not taken are the last two of the library (nothing says which is last: a random order).
    const bottom = library.slice(-2);
    expect(bottom).toHaveLength(2);
    expect(bottom.every((id) => g.state.objects[id]?.zone === 'library')).toBe(true);
  });

  test('a card that is two kinds is taken once, then offered no more', () => {
    const g = board(CLERIC_ROGUE, WIZARD, plain, plain);
    attack(g);
    g.act(0).chooseCards(CLERIC_ROGUE.name);
    // Rogue: the only Rogue was taken already, so nothing is asked; Warrior: none; Wizard: one.
    g.act(0).chooseCards(WIZARD.name);
    g.expect.zone(CLERIC_ROGUE.name, 'hand', { seat: 0 });
    g.expect.zone(WIZARD.name, 'hand', { seat: 0 });
  });

  test('"may": nothing is taken when the player chooses none', () => {
    const g = board(CLERIC, ROGUE, plain, plain);
    attack(g);
    g.act(0).chooseCards();
    g.act(0).chooseCards();
    g.expect.zone(CLERIC.name, 'library', { seat: 0 });
    g.expect.zone(ROGUE.name, 'library', { seat: 0 });
  });

  test('only the top four cards are looked at', () => {
    const g = board(plain, plain, plain, plain, WIZARD);
    attack(g);
    g.expect.zone(WIZARD.name, 'library', { seat: 0 });
    expect(g.state.pending?.kind).toBe('priority');
  });
});

describe("Gonti, Lord of Luxury (When Gonti enters, look at the top four cards of target opponent's library, exile one of them face down, then put the rest on the bottom of that library in a random order. You may cast that card for as long as it remains exiled, and mana of any type can be spent to cast that spell.)", () => {
  const GONTI = real('Gonti, Lord of Luxury');
  const card = (name: string, cost: string) =>
    parsed(`SYNTHETIC ${name}`, 'Creature — Bear', '', {
      power: '2',
      toughness: '2',
      manaCost: cost,
    });
  const RED = card('Red Bear', '{R}{R}');
  const TOP2 = card('Second', '{G}');
  const TOP3 = card('Third', '{1}');
  const TOP4 = card('Fourth', '{1}');
  const TOP5 = card('Fifth', '{1}');
  const board = () =>
    scenario()
      .define(GONTI)
      .define(RED)
      .define(TOP2)
      .define(TOP3)
      .define(TOP4)
      .define(TOP5)
      .seat(0)
      .hand(GONTI.name)
      .battlefield('Swamp', { count: 4 })
      .battlefield('Plains', { count: 3 })
      .library(...FILLER)
      .seat(1)
      .library(RED.name, TOP2.name, TOP3.name, TOP4.name, TOP5.name, ...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test("one of the top four cards of the opponent's library is exiled, the rest go to the bottom of that library; the fifth card is not looked at", () => {
    const g = board();
    g.act(0).cast(GONTI.name, { pay: true });
    g.passAll();
    g.act(0).chooseCards({ name: RED.name, seat: 1 });
    g.expect.zone(RED.name, 'exile', { seat: 1 });
    const library = g.state.seats[1]?.library ?? [];
    // 35 cards: one exiled; the fifth card is now the top card, the three others went to the bottom.
    expect(library).toHaveLength(34);
    expect(g.state.objects[library[0] as `o${number}`]?.zone).toBe('library');
    g.expect.zone(TOP5.name, 'library', { seat: 1 });
    expect(g.state.seats[0]?.library).toHaveLength(30);
  });

  test("the exiled card can be cast by Gonti's controller, with mana of any type, even though it is the opponent's card (CR 609.4b)", () => {
    const g = board();
    g.act(0).cast(GONTI.name, { pay: true });
    g.passAll();
    g.act(0).chooseCards({ name: RED.name, seat: 1 });
    // {R}{R} is paid with Swamps and Plains: no red mana is needed.
    g.act(0).cast({ name: RED.name, seat: 1 }, { pay: true });
    g.passAll();
    g.expect.zone(RED.name, 'battlefield', { seat: 0 });
  });

  test('the opponent cannot cast the card', () => {
    const g = board();
    g.act(0).cast(GONTI.name, { pay: true });
    g.passAll();
    g.act(0).chooseCards({ name: RED.name, seat: 1 });
    expect(() => g.act(1).cast(RED.name, { pay: true })).toThrow(/cast|legal|exile/i);
  });
});

describe('Aven Mindcensor (If an opponent would search a library, that player searches the top four cards of that library instead.)', () => {
  const MINDCENSOR = real('Aven Mindcensor');
  const SEEKER = parsed(
    'SYNTHETIC Seeker',
    'Sorcery',
    'Search your library for a Plains card, reveal it, put it into your hand, then shuffle.',
    { manaCost: '{1}' },
  );
  const board = (opponentHasMindcensor: boolean, active: 0 | 1 = 0) => {
    const b = scenario().define(MINDCENSOR).define(SEEKER);
    b.seat(0).battlefield('Island').hand(SEEKER.name);
    if (!opponentHasMindcensor) b.battlefield(MINDCENSOR.name);
    b.library('Island', 'Island', 'Plains', 'Island', 'Island', 'Plains', ...FILLER);
    b.seat(1).hand(SEEKER.name).battlefield('Island');
    if (opponentHasMindcensor) b.battlefield(MINDCENSOR.name);
    b.library('Island', 'Island', 'Plains', 'Island', 'Island', 'Plains', ...FILLER);
    return b.at('precombatMain', { active, turn: 1 }).build();
  };
  const legalOf = (g: ReturnType<typeof board>) => {
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error(`expected a search, got ${d?.kind}`);
    return d.legal;
  };

  test("an opponent of the Mindcensor's controller can find only a card among the top four (CR 701.23, 614.1a)", () => {
    // Seat 0 controls the Mindcensor; seat 1 searches.
    const g = board(false, 1);
    g.act(1).cast(SEEKER.name, { pay: true });
    g.passAll();
    expect(legalOf(g)).toHaveLength(1);
  });

  test('the controller of the Mindcensor searches the whole library', () => {
    const g = board(false);
    g.act(0).cast(SEEKER.name, { pay: true });
    g.passAll();
    expect(legalOf(g)).toHaveLength(2);
  });

  test('with no card of the kind among the top four, nothing can be found', () => {
    const g = scenario()
      .define(MINDCENSOR)
      .define(SEEKER)
      .seat(0)
      .battlefield(MINDCENSOR.name)
      .library(...FILLER)
      .seat(1)
      .hand(SEEKER.name)
      .battlefield('Island')
      .library('Island', 'Island', 'Island', 'Island', 'Plains', ...FILLER)
      .at('precombatMain', { active: 1, turn: 1 })
      .build();
    g.act(1).cast(SEEKER.name, { pay: true });
    g.passAll();
    g.expect.zone('Plains', 'library', { seat: 1 });
    expect(g.state.pending?.kind).toBe('priority');
  });
});

describe('Magus of the Balance ({4}{W}, {T}, Sacrifice this creature: Each player chooses a number of lands they control equal to the number of lands controlled by the player who controls the fewest, then sacrifices the rest. Players discard cards and sacrifice creatures the same way.)', () => {
  const MAGUS = real('Magus of the Balance');
  const six = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'];
  const board = () => {
    const b = scenario().define(MAGUS).seat(0).battlefield(MAGUS.name, { label: 'magus' });
    for (const l of six) b.battlefield('Plains', { label: l });
    b.battlefield(BEARS, { label: 'a1' })
      .battlefield('Giant Spider', { label: 'a2' })
      .hand('Island', 'Island', 'Island', 'Island')
      .library(...FILLER)
      .seat(1)
      .battlefield('Island')
      .battlefield('Island')
      .battlefield(BEARS, { label: 'b1' })
      .hand('Plains')
      .library(...FILLER);
    return b.at('precombatMain', { active: 0, turn: 1 }).build();
  };

  test('lands, cards in hand and creatures are cut down to the smallest number any player has (CR 101.4)', () => {
    const g = board();
    g.act(0).activate(MAGUS.name, { pay: true });
    g.passAll();
    // Lands: seat 0 controls six (the Magus was sacrificed as a cost, so it is no creature), seat 1 two: seat 0 keeps two.
    g.act(0).choosePermanents('l1', 'l2');
    // Cards in hand: seat 0 holds four, seat 1 one: seat 0 discards three.
    g.act(0).chooseCards('Island[1]', 'Island[2]', 'Island[3]');
    // Creatures: seat 0 has two, seat 1 one.
    g.act(0).choosePermanents('a1');
    const mine = g.state.seats[0];
    expect(mine?.hand).toHaveLength(1);
    // Three cards discarded and the Magus, sacrificed as a cost, plus the four lands and the creature sacrificed.
    expect(mine?.graveyard).toHaveLength(3 + 1 + 4 + 1);
    const onField = (seat: number) =>
      g.state.battlefield.filter((id) => g.state.objects[id]?.owner === seat).length;
    expect(onField(0)).toBe(2 + 1);
    expect(onField(1)).toBe(3);
    expect(g.state.seats[1]?.hand).toHaveLength(1);
  });

  test('with three players the smallest of all three is kept, and a player at the minimum chooses nothing', () => {
    const g = scenario({ seats: 3 })
      .define(MAGUS)
      .seat(0)
      .battlefield(MAGUS.name)
      .battlefield('Plains', { label: 'l1' })
      .battlefield('Plains', { label: 'l2' })
      .battlefield('Plains', { label: 'l3' })
      .battlefield('Plains', { label: 'l4' })
      .battlefield('Plains', { label: 'l5' })
      .battlefield('Plains', { label: 'l6' })
      .library(...FILLER)
      .seat(1)
      .battlefield('Island', { label: 'i1' })
      .battlefield('Island', { label: 'i2' })
      .battlefield('Island', { label: 'i3' })
      .library(...FILLER)
      .seat(2)
      .battlefield('Swamp', { label: 's1' })
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).activate(MAGUS.name, { pay: true });
    g.passAll();
    g.act(0).choosePermanents('l1');
    g.act(1).choosePermanents('i1');
    g.expect.zone('Swamp', 'battlefield', { seat: 2 });
    // Seat 0: the Magus and five lands; seat 1: two lands; seat 2 lost nothing.
    expect(g.state.seats[0]?.graveyard).toHaveLength(6);
    expect(g.state.seats[1]?.graveyard).toHaveLength(2);
    expect(g.state.seats[2]?.graveyard).toHaveLength(0);
    expect(g.state.pending?.kind).toBe('priority');
  });
});

describe("Deep Gnome Terramancer (Whenever one or more lands enter under an opponent's control without being played, you may search your library for a Plains card, put it onto the battlefield tapped, then shuffle. Do this only once each turn.)", () => {
  const GNOME = real('Deep Gnome Terramancer');
  const RAMP = parsed(
    'SYNTHETIC Ramp',
    'Sorcery',
    'Put a land card from your hand onto the battlefield.',
    { manaCost: '{1}' },
  );
  const board = () =>
    scenario()
      .define(GNOME)
      .define(RAMP)
      .seat(0)
      .battlefield(GNOME.name)
      .library('Plains', 'Plains', ...FILLER)
      .seat(1)
      .hand(RAMP.name, 'Forest', 'Forest', 'Forest')
      .battlefield('Island', { count: 2 })
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 1 })
      .build();

  test('a land an opponent puts onto the battlefield with an effect triggers the search (CR 305.1, 603.2c)', () => {
    const g = board();
    g.act(1).cast(RAMP.name, { pay: true });
    g.passAll();
    g.act(1).chooseCards('Forest[0]');
    g.passAll();
    g.act(0).accept();
    g.act(0).chooseCards('Plains[0]');
    const plains = g.state.battlefield
      .map((id) => g.state.objects[id])
      .find((o) => o?.owner === 0 && o.card !== null && o.tapped && o.zone === 'battlefield');
    expect(plains).toBeDefined();
    expect(g.state.seats[0]?.library).toHaveLength(FILLER.length + 1);
  });

  test('"Do this only once each turn": a second land put onto the battlefield in the same turn searches no more (CR 603.2h)', () => {
    const g = scenario()
      .define(GNOME)
      .define(RAMP)
      .seat(0)
      .battlefield(GNOME.name)
      .library('Plains', 'Plains', ...FILLER)
      .seat(1)
      .hand(RAMP.name, RAMP.name, 'Forest', 'Forest')
      .battlefield('Island', { count: 2 })
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 1 })
      .build();
    g.act(1).cast(`${RAMP.name}[0]`, { pay: true });
    g.passAll();
    g.act(1).chooseCards('Forest[0]');
    g.passAll();
    g.act(0).accept();
    g.act(0).chooseCards('Plains[0]');
    g.act(1).cast(RAMP.name, { pay: true });
    g.passAll();
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    expect(g.state.seats[0]?.library).toHaveLength(FILLER.length + 1);
  });

  test('a land the opponent plays does not', () => {
    const g = board();
    g.act(1).playLand('Forest[0]');
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.zone('Plains', 'library', { seat: 0 });
  });

  test("your own land put onto the battlefield does not trigger it (the lands are an opponent's)", () => {
    const g = scenario()
      .define(GNOME)
      .define(RAMP)
      .seat(0)
      .battlefield(GNOME.name)
      .battlefield('Island', { count: 2 })
      .hand(RAMP.name, 'Forest')
      .library('Plains', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(RAMP.name, { pay: true });
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.zone('Plains', 'library', { seat: 0 });
  });
});
