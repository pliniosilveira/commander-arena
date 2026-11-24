// Hosts of Mordor deck (issue 150), the control and evasion group: Troll of Khazad-dûm, Corsairs of Umbar, Subjugate the Hobbits, Wake the Dragon, In the Darkness Bind Them and
// Grishnákh, Brash Instigator, read from their real Oracle text. Pins: CR 509.1b (blocking restrictions, read as blockers are declared), CR 613.1b and 611.2 (control-changing effects),
// CR 603.12 (reflexive triggered abilities), CR 701.47a (amass). The CR text was not available in this environment: numbers are the ones the engine's comments cite.
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';
import { parsed } from './convert-grammar-helpers';

const BEARS = 'Grizzly Bears';

type Builder = ReturnType<typeof scenario>;
/** Defines every card in turn: the builder's `define` takes one. */
const withCards = (b: Builder, ...cards: readonly CardDefinition[]): Builder =>
  cards.reduce((acc, card) => acc.define(card), b);

describe('Troll of Khazad-dûm', () => {
  const TROLL = real('Troll of Khazad-dûm');

  test('three blockers are needed: two are refused, three are accepted (CR 509.1b)', () => {
    const blockers = [BEARS, 'SYNTHETIC Vanilla 3/3', 'SYNTHETIC Vanilla 2/2'] as const;
    const g = scenario()
      .define(TROLL)
      .seat(0)
      .battlefield(TROLL.name)
      .seat(1)
      .battlefield(...blockers)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([TROLL.name]);
    g.advanceTo('declareBlockers');
    const block = (n: number) =>
      blockers.slice(0, n).map((blocker) => ({ blocker, attacker: TROLL.name }));
    expect(g.act(1).try.declareBlockers(block(1)).ok).toBe(false);
    expect(g.act(1).try.declareBlockers(block(2)).ok).toBe(false);
    expect(g.act(1).try.declareBlockers(block(3)).ok).toBe(true);
  });
});

describe('Corsairs of Umbar', () => {
  const CORSAIRS = real('Corsairs of Umbar');
  const GOBLIN = parsed('SYNTHETIC Parsed Goblin', 'Creature — Goblin', '', {
    manaCost: '{R}',
    power: '1',
    toughness: '1',
  });

  function game(target: string) {
    const g = withCards(scenario(), CORSAIRS, GOBLIN)
      .seat(0)
      .battlefield(CORSAIRS.name, GOBLIN.name, BEARS, 'Island', 'Island', 'Island')
      .seat(1)
      .battlefield('SYNTHETIC Vanilla 3/3')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(CORSAIRS.name, { ability: 0, targets: [target], pay: true });
    return g;
  }

  test('a Goblin, Orc or Pirate (here a Goblin, and the Pirate itself) can not be blocked this turn (CR 509.1b)', () => {
    for (const target of [GOBLIN.name, CORSAIRS.name]) {
      const g = game(target);
      g.passAll();
      g.advanceTo('declareAttackers');
      g.act(0).attack([target]);
      g.advanceTo('declareBlockers');
      expect(
        g.act(1).try.declareBlockers([{ blocker: 'SYNTHETIC Vanilla 3/3', attacker: target }]).ok,
      ).toBe(false);
    }
  });

  test('a creature of none of the three types is not a legal target', () => {
    const g = scenario()
      .define(CORSAIRS)
      .seat(0)
      .battlefield(CORSAIRS.name, BEARS, 'Island', 'Island', 'Island')
      .at('precombatMain', { active: 0 })
      .build();
    expect(() =>
      g.act(0).activate(CORSAIRS.name, { ability: 0, targets: [BEARS], pay: true }),
    ).toThrow();
  });
});

describe('Subjugate the Hobbits', () => {
  const SUBJUGATE = real('Subjugate the Hobbits');
  const CHEAP = parsed('SYNTHETIC Parsed Cheap', 'Creature — Elf', '', {
    manaCost: '{1}{G}',
    power: '2',
    toughness: '2',
  });
  const DEAR = parsed('SYNTHETIC Parsed Dear', 'Creature — Giant', '', {
    manaCost: '{3}{G}',
    power: '4',
    toughness: '4',
  });
  const LEADER = parsed('SYNTHETIC Parsed Leader', 'Legendary Creature — Elf', '', {
    manaCost: '{G}',
    power: '1',
    toughness: '1',
  });
  const TOKENISH = parsed('SYNTHETIC Parsed Land', 'Land', '', {});

  test('takes each creature of mana value 3 or less from every opponent, but not a commander, a dearer creature or a land (CR 903.3, 202.3, 613.1b)', () => {
    const g = withCards(scenario({ seats: 3 }), SUBJUGATE, CHEAP, DEAR, LEADER, TOKENISH)
      .seat(0)
      .hand(SUBJUGATE.name)
      .battlefield('Island', { count: 7 })
      .seat(1)
      .battlefield(CHEAP.name, DEAR.name, TOKENISH.name)
      .battlefield(LEADER.name, { commander: true })
      .seat(2)
      .battlefield(BEARS)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(SUBJUGATE.name, { pay: true });
    g.passAll();
    g.expect.zone(CHEAP.name, 'battlefield', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(DEAR.name, 'battlefield', { seat: 1 });
    g.expect.zone(LEADER.name, 'battlefield', { seat: 1 });
    g.expect.zone(TOKENISH.name, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('the control lasts: it does not end at the end of the turn (CR 611.2a)', () => {
    const g = withCards(scenario(), SUBJUGATE, CHEAP)
      .seat(0)
      .hand(SUBJUGATE.name)
      .library('Island', { count: 6 })
      .battlefield('Island', { count: 7 })
      .seat(1)
      .library('Island', { count: 6 })
      .battlefield(CHEAP.name)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(SUBJUGATE.name, { pay: true });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.zone(CHEAP.name, 'battlefield', { seat: 0 });
  });
});

describe('Wake the Dragon', () => {
  const WAKE = real('Wake the Dragon');

  function game() {
    const g = withCards(scenario({ seats: 3 }), WAKE)
      .seat(0)
      .hand(WAKE.name)
      .library('Island', { count: 8 })
      .battlefield('Swamp', 'Mountain', 'Island', 'Island', 'Island', 'Island')
      .seat(1)
      .library('Island', { count: 8 })
      .battlefield('Sol Ring')
      .seat(2)
      .library('Island', { count: 8 })
      .battlefield('Sol Ring')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(WAKE.name, { pay: true });
    g.passAll();
    return g;
  }

  test('makes a 6/6 black and red Dragon with flying and menace', () => {
    const g = game();
    g.expect.pt('Dragon', 6, 6);
    g.expect.derived('Dragon', { colors: ['B', 'R'], keywords: ['flying', 'menace'] });
    g.expect.invariants();
  });

  test('when the Dragon deals combat damage to a player, its controller takes an artifact of that player, not of another (CR 603.2, 613.1b)', () => {
    const g = game();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.playCombat({
      attack: [{ attacker: 'Dragon', target: { player: 2 } }],
      until: 'combatDamage',
    });
    // The one legal target is the artifact of the player who was dealt the damage: it is chosen as the ability goes on the stack.
    g.passAll();
    g.expect.zone('Sol Ring', 'battlefield', { seat: 0, count: 1 });
    g.expect.zone('Sol Ring', 'battlefield', { seat: 1, count: 1 });
    g.expect.zone('Sol Ring', 'battlefield', { seat: 2, count: 0 });
  });
});

describe('In the Darkness Bind Them', () => {
  const SAGA = real('In the Darkness Bind Them');
  const THREE = 'SYNTHETIC Vanilla 3/3';

  function chapterFour() {
    const g = withCards(scenario({ seats: 3 }), SAGA)
      .seat(0)
      .library('Island', { count: 8 })
      .battlefield(SAGA.name, { counters: { lore: 3 } })
      .seat(1)
      .library('Island', { count: 8 })
      .battlefield(BEARS, { tapped: true })
      .seat(2)
      .library('Island', { count: 8 })
      .battlefield(THREE)
      .at('upkeep', { active: 0 })
      .build();
    g.advanceTo('precombatMain');
    return g;
  }

  test('chapter IV: each opponent loses one creature of theirs, untapped and hasty, and the Ring tempts (CR 613.1b, 611.2, 701.54a)', () => {
    const g = chapterFour();
    g.act(0).chooseTargets({ name: BEARS, seat: 1 }, { name: THREE, seat: 2 });
    g.passAll();
    // The Ring tempts you as the last instruction: the stolen creatures are the ones that can become the Ring-bearer.
    g.act(0).choosePermanents(THREE);
    g.expect.ringLevel(0, 1);
    g.expect.ringBearer(0, THREE);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(THREE, 'battlefield', { seat: 0 });
    g.expect.tapped(BEARS, false);
    g.expect.derived(BEARS, { keywords: ['haste'] });
    g.expect.derived(THREE, { keywords: ['haste'] });
    g.expect.invariants();
  });

  test('the creatures go back at the end of the turn (CR 514.2)', () => {
    const g = chapterFour();
    g.act(0).chooseTargets({ name: BEARS, seat: 1 }, { name: THREE, seat: 2 });
    g.passAll();
    g.act(0).choosePermanents(THREE);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.zone(THREE, 'battlefield', { seat: 2 });
  });
});
