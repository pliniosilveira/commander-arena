// "Commander creatures you own have "Whenever this creature becomes tapped, it and other creatures you control that share a creature type with it each get +2/+0 and gain undying
// until end of turn."" (Haunted One): the REAL Oracle text (the corpus's golden.jsonl) goes through the grammar with no override, is defined in an engine scenario and is played
// through applyAction, with 2, 3 and 4 seats.
// Pins (numbers as the code and docs already cite them; the CR text was not available here, so they are unchecked against it): CR 603.2e (a permanent becomes tapped), CR 613.1f (a
// static ability gives an ability, layer 6), CR 702.93a (undying), CR 205.3m (creature types), CR 611.2a and 611.2c (an effect of a resolving ability and its group), CR 613.4c
// (+2/+0, layer 7c), CR 903.3 (a commander), CR 108.3 (the owner of a card).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const FILLER = Array.from({ length: 12 }, () => 'Plains');
const BOLT = 'Lightning Bolt';
const COMMANDER = 'SYNTHETIC Haunt Commander'; // Elf Warrior 2/2
const ELF = 'SYNTHETIC Haunt Elf'; // Elf 1/1
const GOBLIN = 'SYNTHETIC Haunt Goblin'; // Goblin 1/1
const WARRIOR = 'SYNTHETIC Haunt Warrior'; // Human Warrior 3/3
const FOE = 'SYNTHETIC Haunt Foe'; // another player's Elf 1/1
const STOLEN = 'SYNTHETIC Haunt Rival'; // another player's commander, Elf 2/2

describe('Haunted One', () => {
  const haunted = real('Haunted One');
  const NAME = haunted.name;
  const commander = parsed(COMMANDER, 'Legendary Creature — Elf Warrior', '', {
    power: '2',
    toughness: '2',
  });
  const elf = parsed(ELF, 'Creature — Elf', '', { power: '1', toughness: '1' });
  const goblin = parsed(GOBLIN, 'Creature — Goblin', '', { power: '1', toughness: '1' });
  const warrior = parsed(WARRIOR, 'Creature — Human Warrior', '', { power: '3', toughness: '3' });
  const foe = parsed(FOE, 'Creature — Elf', '', { power: '1', toughness: '1' });
  const rival = parsed(STOLEN, 'Legendary Creature — Elf', '', { power: '2', toughness: '2' });

  const table = (seats: 2 | 3 | 4) =>
    scenario({ seats })
      .define(haunted)
      .define(commander)
      .define(elf)
      .define(goblin)
      .define(warrior)
      .define(rival)
      .define(foe);

  /** Seat 0 attacks seat 1 with the named creature, and the trigger of its becoming tapped is on the stack. */
  const attack = (g: ReturnType<ReturnType<typeof table>['build']>, attacker: string) => {
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker, target: { player: 1 } }]);
  };

  const base = (seats: 2 | 3 | 4) => {
    const b = table(seats).at('precombatMain', { active: 0, turn: 5 });
    b.seat(0)
      .battlefield(NAME)
      .battlefield(COMMANDER, { commander: true })
      .battlefield(ELF, GOBLIN, WARRIOR)
      .hand(BOLT)
      .battlefield('Mountain')
      .library(...FILLER);
    for (let s = 1; s < seats; s += 1)
      b.seat(s as 1 | 2 | 3)
        .battlefield(FOE)
        .library(...FILLER);
    return b;
  };

  test('the card is valid and says what the engine runs', () => {
    expect(validateCard(haunted)).toEqual([]);
    expect(haunted.faces[0]?.abilities).toMatchObject([
      {
        kind: 'static',
        static: {
          kind: 'grantAbility',
          subject: { kind: 'filter', filter: { types: ['creature'], commander: 'yours' } },
          ability: {
            kind: 'triggered',
            trigger: { kind: 'becomesTapped', what: { kind: 'this' } },
            effect: { kind: 'sequence' },
          },
        },
      },
    ]);
  });

  test('a commander creature you own that becomes tapped: it and the creatures you control that share a type with it get +2/+0 and undying', () => {
    const g = base(2).build();
    attack(g, COMMANDER);
    g.passAll();
    // The commander is an Elf Warrior: the Elf shares Elf, the Human Warrior shares Warrior, the Goblin shares nothing.
    g.expect.pt(COMMANDER, 4, 2);
    g.expect.pt(ELF, 3, 1);
    g.expect.pt(WARRIOR, 5, 3);
    g.expect.pt(GOBLIN, 1, 1);
    g.expect.derived(COMMANDER, { keywords: ['undying'] });
    g.expect.derived(ELF, { keywords: ['undying'] });
    g.expect.derived(WARRIOR, { keywords: ['undying'] });
    g.expect.derived(GOBLIN, { keywords: [] });
    g.expect.invariants();
  });

  test('the creature of another player that shares a type is not affected, whatever the number of seats', () => {
    for (const seats of [2, 3, 4] as const) {
      const g = base(seats).build();
      attack(g, COMMANDER);
      g.passAll();
      for (let s = 1; s < seats; s += 1) {
        g.expect.pt({ name: FOE, seat: s as 1 | 2 | 3 }, 1, 1);
        g.expect.derived({ name: FOE, seat: s as 1 | 2 | 3 }, { keywords: [] });
      }
      g.expect.pt(ELF, 3, 1);
    }
  });

  test('the undying it gave works: a creature that dies without a +1/+1 counter comes back with one (CR 702.93a)', () => {
    const g = base(2).build();
    attack(g, COMMANDER);
    g.passAll();
    g.act(0).cast(BOLT, { targets: [{ name: ELF, seat: 0 }], pay: true });
    g.passAll();
    // The Elf died and returned as a new object with a +1/+1 counter; the effect of the turn does not follow it (CR 400.7).
    g.expect.zone(ELF, 'battlefield', { seat: 0 });
    g.expect.counters(ELF, { '+1/+1': 1 });
    g.expect.pt(ELF, 2, 2);
    g.expect.derived(ELF, { keywords: [] });
  });

  test('a creature that is not a commander, and a commander of another player, have no such ability', () => {
    // An Elf that is not a commander attacks: nothing triggers.
    const plain = base(2).build();
    attack(plain, ELF);
    plain.passAll();
    plain.expect.pt(ELF, 1, 1);
    plain.expect.pt(COMMANDER, 2, 2);
    // A commander another player owns, under seat 0's control, is not "a commander creature you own".
    const b = table(2).at('precombatMain', { active: 0, turn: 5 });
    b.seat(0)
      .battlefield(NAME)
      .battlefield(ELF)
      .library(...FILLER);
    b.seat(1)
      .battlefield(STOLEN, { commander: true, controller: 0 })
      .library(...FILLER);
    const g = b.build();
    attack(g, STOLEN);
    g.passAll();
    g.expect.pt(STOLEN, 2, 2);
    g.expect.pt(ELF, 1, 1);
  });

  test('without Haunted One the commander has no such ability, and it works from the moment it enters', () => {
    const b = table(2).at('precombatMain', { active: 0, turn: 5 });
    b.seat(0)
      .battlefield(COMMANDER, { commander: true })
      .battlefield(ELF)
      .library(...FILLER);
    b.seat(1).library(...FILLER);
    const g = b.build();
    attack(g, COMMANDER);
    g.passAll();
    g.expect.pt(COMMANDER, 2, 2);
    g.expect.pt(ELF, 1, 1);
  });

  test('the pump and the undying last until end of turn', () => {
    const g = base(2).build();
    attack(g, COMMANDER);
    g.passAll();
    g.expect.pt(ELF, 3, 1);
    g.advanceTo('end');
    g.passAll();
    g.expect.pt(ELF, 1, 1);
    g.expect.derived(ELF, { keywords: [] });
  });
});
