// The Scions & Spellcraft deck (Final Fantasy Commander), group B: static grants of an Equipment or an Aura. The REAL Oracle text (the corpus's golden.jsonl) goes through the grammar as a
// card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs. Cards:
// Astrologian's Planisphere ("Whenever you cast a noncreature spell and whenever you draw your third card each turn", CR 603.2c: two granted triggered abilities that share the
// effect), Blue Mage's Cane (copy of an exiled card cast for {3} rather than its mana cost, CR 707.12, 118.9, 508.5: defending player's graveyard), Eye of Nidhogg (a black Dragon with
// base power and toughness 4/2, flying, deathtouch and goaded, CR 205.3d, 613, 701.15b) and Observed Stasis ("remove enchanted creature from combat", CR 506.4; loses all abilities and
// can't attack or block) and Dancer's Chakrams (job select; "Equipped creature gets +2/+2, has lifelink and \"Other commanders you control get +2/+2 and have lifelink,\"", CR 604.1, 613.1f,
// 613.8, 903.3: the creature has the quoted static ability as its own, so "you" is its controller and "other" leaves it out).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function importReal(name: string) {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  return importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
}

function real(name: string): CardDefinition {
  const imported = importReal(name);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const planisphere = real("Astrologian's Planisphere");
const cane = real("Blue Mage's Cane");
const eye = real('Eye of Nidhogg');
const stasis = real('Observed Stasis');
const chakrams = real("Dancer's Chakrams");

const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt'; // {R} instant, 3 damage to any target
const DIVINATION = 'Divination'; // {2}{U} sorcery, draw two
const LIBRARY = Array.from({ length: 14 }, () => 'Island');

const pendingKind = (g: ScenarioGame) => g.state.pending?.kind;

describe('the four cards are valid and supported', () => {
  for (const def of [planisphere, cane, eye, stasis, chakrams]) {
    test(def.name, () => {
      expect(validateCard(def)).toEqual([]);
    });
  }
});

describe("Astrologian's Planisphere", () => {
  const board = (hand: readonly string[]) => {
    const b = scenario()
      .define(planisphere)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bear' })
      .battlefield(planisphere.name, { attachedTo: 'bear' })
      .battlefield('Island', { count: 6 })
      .battlefield('Mountain', { count: 2 })
      .battlefield('Forest', { count: 2 });
    for (const card of hand) b.hand(card);
    return b
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
  };

  test('the equipped creature is a Wizard in addition to its other types', () => {
    const g = board([]);
    g.expect.derived('bear', { subtypes: ['Bear', 'Wizard'], types: ['creature'] });
  });

  test('a noncreature spell cast puts a +1/+1 counter on the creature (CR 603.2c)', () => {
    const g = board([BOLT]);
    g.act(0).cast(BOLT, { pay: true, targets: [{ player: 1 }] });
    g.passAll();
    g.expect.counters('bear', { '+1/+1': 1 });
    g.expect.pt('bear', 3, 3);
    g.expect.invariants();
  });

  test('a creature spell does not trigger it', () => {
    const g = board([BEARS]);
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.counters('bear', {});
  });

  test('drawing the third card of the turn triggers it, the first two do not (CR 121.2)', () => {
    // Each Divination is a noncreature spell cast (+1 each) and draws two cards: the cards are the 1st and 2nd, then the 3rd and 4th, so only the 3rd of the turn triggers.
    const g = board([DIVINATION, DIVINATION]);
    g.act(0).cast('Divination[1]', { pay: true });
    g.passAll();
    g.expect.counters('bear', { '+1/+1': 1 });
    g.act(0).cast(DIVINATION, { pay: true });
    g.passAll();
    // The second cast (+1) and the third card drawn this turn (+1).
    g.expect.counters('bear', { '+1/+1': 3 });
    g.expect.invariants();
  });

  test('it goes with the Equipment: unattached, the creature has neither the type nor the triggers', () => {
    const g = board([BOLT]);
    g.expect.attached(planisphere.name, 'bear');
    const loose = scenario()
      .define(planisphere)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bear' })
      .battlefield(planisphere.name)
      .battlefield('Mountain')
      .hand(BOLT)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    loose.expect.derived('bear', { subtypes: ['Bear'] });
    loose.act(0).cast(BOLT, { pay: true, targets: [{ player: 1 }] });
    loose.passAll();
    loose.expect.counters('bear', {});
  });
});

describe("Blue Mage's Cane", () => {
  // Three seats: the trigger reads the graveyard of the player the creature attacks (CR 508.5), not an opponent's in general.
  const board = () =>
    scenario({ seats: 3 })
      .define(cane)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bear' })
      .battlefield(cane.name, { attachedTo: 'bear' })
      .battlefield('Island', { count: 3 })
      .seat(1)
      .library(...LIBRARY)
      .graveyard(BOLT)
      .graveyard(BEARS)
      .seat(2)
      .library(...LIBRARY)
      .graveyard(DIVINATION)
      .at('precombatMain', { active: 0 })
      .build();

  test('the equipped creature gets +0/+2 and is a Wizard', () => {
    const g = board();
    g.expect.pt('bear', 2, 4);
    g.expect.derived('bear', { subtypes: ['Bear', 'Wizard'] });
  });

  test('attacking seat 1: only an instant or sorcery card of seat 1’s graveyard can be the target', () => {
    const g = board();
    g.advanceTo('declareAttackers');
    g.act(0).attack('bear', { player: 1 });
    const decision = g.state.pending;
    if (decision?.kind !== 'targets') throw new Error('expected a targets decision');
    // Only the Bolt of seat 1 is legal: seat 2's Divination is in the graveyard of a player that is not attacked, and the creature card of seat 1 is no instant or sorcery.
    const legal = decision.specs.flatMap((spec) => spec.legal);
    const bolt = g.find({ name: BOLT, zone: 'graveyard', seat: 1 })[0]?.id;
    expect(legal.map((t) => (t.kind === 'object' ? t.id : null))).toEqual([bolt]);
    g.act(0).chooseTargets({ name: BOLT, zone: 'graveyard', seat: 1 });
  });

  test('the card is exiled, its copy is cast for {3} rather than its mana cost, and the original stays exiled', () => {
    const g = board();
    g.advanceTo('declareAttackers');
    g.act(0).attack('bear', { player: 1 });
    g.act(0).chooseTargets({ name: BOLT, zone: 'graveyard', seat: 1 });
    g.passAll();
    // The trigger resolved: the Bolt is exiled and the copy is offered.
    g.expect.zone(BOLT, 'exile', { seat: 1, count: 1 });
    expect(pendingKind(g)).toBe('chooseCards');
    const pending = g.state.pending;
    if (pending?.kind !== 'chooseCards') throw new Error('expected chooseCards');
    expect(pending.purpose).toBe('cast');
    g.act(0).chooseCards(pending.legal[0] as string);
    g.act(0).chooseTargets({ player: 2 });
    expect(pendingKind(g)).toBe('payMana');
    g.act(0).payAuto();
    // {3}: the three Islands are tapped, and the copy is on the stack above the ability's remains.
    const islands = g.find({ name: 'Island', zone: 'battlefield', seat: 0 });
    expect(islands.filter((o) => o.tapped)).toHaveLength(3);
    g.passAll();
    g.expect.life(2, 37);
    g.expect.zone(BOLT, 'exile', { seat: 1, count: 1 });
    g.expect.zone(BOLT, 'graveyard', { seat: 1, count: 0 });
    g.expect.invariants();
  });

  test('a copy that cannot be paid for is not offered (CR 601.2h)', () => {
    const g = scenario()
      .define(cane)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bear' })
      .battlefield(cane.name, { attachedTo: 'bear' })
      .battlefield('Island', { count: 2 })
      .seat(1)
      .library(...LIBRARY)
      .graveyard(BOLT)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('bear', { player: 1 });
    if (pendingKind(g) === 'targets')
      g.act(0).chooseTargets({ name: BOLT, zone: 'graveyard', seat: 1 });
    g.passAll();
    // Exiled, but only two lands: nothing can be cast for {3}, so no question is asked.
    g.expect.zone(BOLT, 'exile', { seat: 1, count: 1 });
    expect(pendingKind(g)).not.toBe('chooseCards');
    expect(pendingKind(g)).not.toBe('payMana');
  });

  test('declining the copy leaves the card exiled and nothing paid', () => {
    const g = board();
    g.advanceTo('declareAttackers');
    g.act(0).attack('bear', { player: 1 });
    g.act(0).chooseTargets({ name: BOLT, zone: 'graveyard', seat: 1 });
    g.passAll();
    g.act(0).chooseCards();
    g.expect.zone(BOLT, 'exile', { seat: 1, count: 1 });
    expect(g.find({ name: 'Island', zone: 'battlefield', seat: 0 }).some((o) => o.tapped)).toBe(
      false,
    );
    g.expect.life(1, 40);
  });
});

describe('Eye of Nidhogg', () => {
  const board = () =>
    scenario()
      .define(eye)
      .seat(0)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain')
      .battlefield('Llanowar Elves', { label: 'victim' })
      .battlefield(eye.name, { attachedTo: 'victim' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bear' })
      .at('precombatMain', { active: 0 })
      .build();

  test('the creature is a black Dragon 4/2 with flying and deathtouch; its creature types are replaced, its card types stay', () => {
    const g = board();
    g.expect.derived('victim', {
      types: ['creature'],
      subtypes: ['Dragon'],
      colors: ['B'],
      keywords: ['flying', 'deathtouch'],
    });
    g.expect.pt('victim', 4, 2);
    g.expect.invariants();
  });

  test('it is goaded by the controller of the Aura (CR 701.15b): it must attack, and not the goader if another player can be', () => {
    const g = scenario({ seats: 3 })
      .define(eye)
      .seat(0)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Llanowar Elves', { label: 'victim' })
      .battlefield(eye.name, { attachedTo: 'victim', controller: 0 })
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    // The goaded creature has to attack: declaring no attackers is not legal.
    g.expect.illegal(1, { declareAttackers: [] });
    // It can't attack the player that goaded it (seat 0) while another player (seat 2) can be attacked.
    g.expect.illegal(1, { declareAttackers: [{ attacker: 'victim', target: { player: 0 } }] });
    g.expect.legal(1, { declareAttackers: [{ attacker: 'victim', target: { player: 2 } }] });
  });

  test('when it is put into a graveyard from the battlefield, it returns to its owner’s hand', () => {
    const g = board();
    g.act(0).cast(BOLT, { pay: true, targets: ['victim'] });
    g.passAll();
    // The Dragon had 2 toughness: it died, the Aura was put into the graveyard and its trigger returned it.
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 0, count: 1 });
    g.expect.zone(eye.name, 'hand', { seat: 0, count: 1 });
  });
});

describe('Observed Stasis', () => {
  const OTHER = 'Llanowar Elves';
  const board = (extra: (b: ReturnType<typeof scenario>) => void = () => {}) => {
    const b = scenario()
      .define(stasis)
      .seat(0)
      .library(...LIBRARY)
      .hand(stasis.name)
      .battlefield('Island', { count: 4 });
    extra(b);
    return b
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'attacker', tapped: true })
      .battlefield(OTHER, { label: 'tapped elves', tapped: true })
      .battlefield(OTHER, { label: 'untapped elves' })
      .at('precombatMain', { active: 0 })
      .build();
  };

  test('enters, flash: the enchanted creature loses all abilities and can’t attack or block', () => {
    const g = board();
    g.act(0).cast(stasis.name, { pay: true, targets: ['untapped elves'] });
    g.passAll();
    g.expect.attached(stasis.name, 'untapped elves');
    g.expect.derived('untapped elves', { keywords: [] });
  });

  test('the enter trigger draws a card for each tapped creature its controller controls, enchanted creature included', () => {
    const g = board();
    g.act(0).cast(stasis.name, { pay: true, targets: ['tapped elves'] });
    // The Aura resolves and its trigger goes on the stack; resolving it draws for the tapped Bears and the tapped Elves (both seat 1's), nothing for the untapped one.
    g.passAll();
    g.expect.handSize(0, 2);
    g.expect.invariants();
  });

  test('the enchanted creature can’t attack (CR 508.1a) and can’t block (CR 509.1a)', () => {
    const g = scenario()
      .define(stasis)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'theirs' })
      .battlefield(stasis.name, { attachedTo: 'mine' })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack('mine', false);
    g.expect.derived('mine', { keywords: [] });
  });

  test('a creature in combat is removed from it (CR 506.4)', () => {
    const g = scenario()
      .define(stasis)
      .seat(0)
      .library(...LIBRARY)
      .hand(stasis.name)
      .battlefield('Island', { count: 4 })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'attacker' })
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(1).attack('attacker', { player: 0 });
    g.expect.combat({ attackers: ['attacker'] });
    g.act(1).pass();
    // Flash: the defending player enchants the attacker before blockers are declared.
    g.act(0).cast(stasis.name, { pay: true, targets: ['attacker'] });
    g.passAll();
    g.expect.combat({ attackers: [] });
    g.expect.invariants();
  });
});

// A shared note for the lead: the pieces above (an attached grant with "is a ... in addition to its other types", a quoted ability and a restriction) are read by `static.attached`
// and `static.attached-becomes`, which a statement such as Reaper's Scythe's "Equipped creature gets +1/+1 for each soul counter on it and is an Assassin in addition to its other types."
// can reuse.

describe("Dancer's Chakrams", () => {
  const COMMANDER = 'Isamaru, Hound of Konda'; // a 2/2 commander
  // Four seats: seat 0 casts the Equipment (the Hero token it makes is equipped), has a commander and a plain creature; seats 1 and 3 have commanders of their own.
  const board = (seats: 3 | 4 = 4) => {
    const b = scenario({ seats })
      .define(chakrams)
      .seat(0)
      .library(...LIBRARY)
      .hand(chakrams.name)
      .battlefield(COMMANDER, { label: 'mine', commander: true })
      .battlefield(BEARS, { label: 'plain' })
      .battlefield('Plains', { count: 4 })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(COMMANDER, { label: 'theirs', commander: true })
      .seat(2)
      .library(...LIBRARY);
    if (seats === 4) {
      b.seat(3)
        .library(...LIBRARY)
        .battlefield(COMMANDER, { label: 'fourth', commander: true });
    }
    return b.at('precombatMain', { active: 0 }).build();
  };

  const cast = (g: ScenarioGame) => {
    g.act(0).cast(chakrams.name, { pay: true });
    g.passAll();
  };

  test('job select equips a Hero: it gets +2/+2 and lifelink, and the commander of its controller too', () => {
    const g = board();
    cast(g);
    g.expect.attached(chakrams.name, 'Hero');
    g.expect.derived('mine', { keywords: ['lifelink'] });
    g.expect.pt('mine', 4, 4);
    g.expect.pt('plain', 2, 2);
    g.expect.invariants();
  });

  test('the other commanders on the table are not affected, in three and four seats', () => {
    for (const seats of [3, 4] as const) {
      const g = board(seats);
      cast(g);
      g.expect.pt('mine', 4, 4);
      g.expect.derived('theirs', { keywords: [] });
      g.expect.pt('theirs', 2, 2);
      if (seats === 4) {
        g.expect.derived('fourth', { keywords: [] });
        g.expect.pt('fourth', 2, 2);
      }
    }
  });

  test('the creature is a Performer in addition to its other types, and 3/3 with lifelink', () => {
    const g = board();
    cast(g);
    g.expect.derived('Hero', { subtypes: ['Hero', 'Performer'], keywords: ['lifelink'] });
    g.expect.pt('Hero', 3, 3);
  });

  test('the commander equipped itself gets the +2/+2 once ("other" leaves it out)', () => {
    const g = scenario()
      .define(chakrams)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(COMMANDER, { label: 'mine', commander: true })
      .battlefield(chakrams.name, { attachedTo: 'mine' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.pt('mine', 4, 4);
    g.expect.derived('mine', { keywords: ['lifelink'] });
  });
});
