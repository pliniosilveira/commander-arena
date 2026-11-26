// Grand Larceny deck (issue 119), group B: the cards in which a player other than the controller exiles cards from their library, or has cards of their hand looked at, and the controller
// casts or plays them for free (or for life): Extract Brain, Villainous Wealth, Stolen Goods, Silent-Blade Oni, Mind's Dilation, Fallen Shinobi, Oblivion Sower and Nashi, Moon Sage's
// Scion. The REAL cards of the golden corpus (real Oracle text), imported through the grammar only and played through applyAction, in games of three players: nothing here assumes one
// opponent ("target opponent" is either of two, a trigger names the player it is about).
// Pins (the CR text was not available here: the numbers are those the repository's own comments cite): CR 608.2g and 118.9 (casting as an effect resolves, without paying the mana cost),
// CR 601.2 and 305.1 (casting a card from exile, playing a land), CR 402.3 (a hand is hidden; looking at it), CR 608.2d (a player chooses as the effect says), CR 108.3 (a card's owner),
// CR 110.2a (what enters under the controller of the effect), CR 119.4 and 118.9 (paying life rather than mana), CR 603.2c and 510.3a (combat damage triggers), CR 601.2i (the number of
// spells a player has cast this turn), CR 400.7 (a card that changes zone is a new object).
import { type CardDefinition, getView, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';
import { parsed } from './convert-grammar-helpers';

const BRAIN = real('Extract Brain');
const WEALTH = real('Villainous Wealth');
const GOODS = real('Stolen Goods');
const ONI = real('Silent-Blade Oni');
const DILATION = real("Mind's Dilation");
const SHINOBI = real('Fallen Shinobi');
const SOWER = real('Oblivion Sower');
const NASHI = real("Nashi, Moon Sage's Scion");

const BEAR = parsed('SYNTHETIC Green Bear', 'Creature — Bear', '', {
  manaCost: '{1}{G}',
  power: '2',
  toughness: '2',
  colors: ['G'],
});
const OGRE = parsed('SYNTHETIC Red Ogre', 'Creature — Ogre', '', {
  manaCost: '{3}{R}',
  power: '4',
  toughness: '4',
  colors: ['R'],
});
const GIANT = parsed('SYNTHETIC Blue Giant', 'Creature — Giant', '', {
  manaCost: '{4}{U}',
  power: '5',
  toughness: '5',
  colors: ['U'],
});
const BOLT = parsed('SYNTHETIC Red Burn', 'Instant', '~ deals 2 damage to any target.', {
  manaCost: '{R}',
  colors: ['R'],
});
const FILLER = Array.from({ length: 12 }, () => 'Forest');
const exiledOf = (name: string, seat: 0 | 1 | 2) => ({ name, zone: 'exile' as const, seat });
const onBattlefield = (g: Game, name: string, seat: 0 | 1 | 2) =>
  g.find({ name, zone: 'battlefield', seat });

type Game = ReturnType<ReturnType<typeof scenario>['build']>;

describe('every card is valid', () => {
  test.each([
    BRAIN,
    WEALTH,
    GOODS,
    ONI,
    DILATION,
    SHINOBI,
    SOWER,
    NASHI,
  ] as readonly CardDefinition[])('$name', (card) => {
    expect(validateCard(card)).toEqual([]);
  });
});

describe('the parsed abilities', () => {
  test('Extract Brain: the opponent chooses X cards of their hand, the controller casts one of them from there', () => {
    expect(BRAIN.faces[0]?.spell?.effect).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'handCards', player: { kind: 'target' }, count: { kind: 'x' } },
        { kind: 'castFree', objects: { kind: 'moved' }, fromHand: true },
      ],
    });
  });

  test('Villainous Wealth: the top X cards exiled by the opponent, any number of spells of mana value X or less cast from them', () => {
    expect(WEALTH.faces[0]?.spell?.effect).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'exileTop', count: { kind: 'x' }, from: { kind: 'target' } },
        {
          kind: 'castFree',
          objects: { kind: 'moved' },
          max: 'any',
          filter: { manaValueAtMost: { kind: 'x' } },
        },
      ],
    });
  });

  test('Stolen Goods: exile until a nonland card, then a permission to cast it for free until end of turn', () => {
    expect(GOODS.faces[0]?.spell?.effect).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'exileUntilFound', players: { kind: 'target' }, filter: { notTypes: ['land'] } },
        {
          kind: 'mayPlay',
          objects: { kind: 'moved' },
          lasts: 'endOfTurn',
          castOnly: true,
          free: true,
        },
      ],
    });
  });

  test("Mind's Dilation: the first spell of each opponent, the card exiled from that player's library is cast if it is not a land", () => {
    expect(DILATION.faces[0]?.abilities[0]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'castSpell', by: 'opponent', nth: 1 },
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'exileTop',
            count: 1,
            from: { kind: 'controllerOf', of: { kind: 'triggerSubject' } },
          },
          {
            kind: 'conditional',
            condition: {
              kind: 'objectMatches',
              of: { kind: 'moved' },
              filter: { notTypes: ['land'] },
            },
            effect: { kind: 'castFree', objects: { kind: 'moved' } },
          },
        ],
      },
    });
  });

  test('Fallen Shinobi: two cards exiled by the damaged player, played for free until end of turn', () => {
    expect(SHINOBI.faces[0]?.abilities.find((a) => a.kind === 'triggered')).toMatchObject({
      trigger: { kind: 'dealsCombatDamage', to: 'player' },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'exileTop', count: 2, from: { kind: 'triggerPlayer' } },
          { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'endOfTurn', free: true },
        ],
      },
    });
  });

  test('Oblivion Sower: a cast trigger, the opponent exiles four, any number of the lands that player owns in exile enter under your control', () => {
    expect(SOWER.faces[0]?.abilities[0]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'castSpell', self: true },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'exileTop', count: 4, from: { kind: 'target' } },
          {
            kind: 'moveToZone',
            to: 'battlefield',
            controller: 'you',
            objects: {
              kind: 'choose',
              anyNumber: true,
              fromExileOf: { kind: 'target' },
              filter: { zone: 'exile', types: ['land'] },
            },
          },
        ],
      },
    });
  });

  test('Nashi: one card of those exiled from every library, a spell cast with it paid for with life', () => {
    expect(NASHI.faces[0]?.abilities.find((a) => a.kind === 'triggered')).toMatchObject({
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'exileTop', count: 1, from: { kind: 'eachPlayer' } },
          {
            kind: 'mayPlay',
            objects: { kind: 'moved' },
            lasts: 'endOfTurn',
            oneOf: true,
            lifeForMana: true,
          },
        ],
      },
    });
  });
});

describe('Extract Brain (CR 608.2d, 608.2g, 402.3, 118.9)', () => {
  /** Seat 0 casts it with X = `x` at `target`; seat 2 holds the Bear, the Red Burn, an Island and the Ogre, seat 1 a Giant. */
  const cast = (x: number, target: 1 | 2 = 2) => {
    const g = scenario({ seats: 3 })
      .define(BRAIN)
      .define(BEAR)
      .define(OGRE)
      .define(GIANT)
      .define(BOLT)
      .seat(0)
      .hand(BRAIN.name)
      .battlefield('Island', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp')
      .library(...FILLER)
      .seat(1)
      .hand(GIANT.name)
      .library(...FILLER)
      .seat(2)
      .hand(BEAR.name, BOLT.name, 'Island', OGRE.name)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(BRAIN.name, { x, targets: [{ player: target }], pay: true });
    g.passAll();
    return g;
  };

  test('the opponent chooses the X cards, the controller looks at them and casts one without paying (it enters under the controller)', () => {
    const g = cast(2);
    // The targeted opponent chooses, not the controller.
    expect(g.state.pending?.kind).toBe('chooseCards');
    expect(g.state.pending?.seat).toBe(2);
    if (g.state.pending?.kind === 'chooseCards') {
      expect(g.state.pending.purpose).toBe('handChoice');
      expect(g.state.pending.legal).toHaveLength(4);
      expect(g.state.pending.min).toBe(2);
      expect(g.state.pending.max).toBe(2);
    }
    g.act(2).chooseCards(BEAR.name, 'Island');
    // Now the controller is asked, among the spells of the chosen cards only; the land and the cards not chosen are not offered.
    expect(g.state.pending?.kind).toBe('chooseCards');
    expect(g.state.pending?.seat).toBe(0);
    if (g.state.pending?.kind === 'chooseCards') {
      expect(g.state.pending.purpose).toBe('cast');
      expect(g.state.pending.legal).toHaveLength(1);
      // CR 402.3: the controller looks at both cards chosen, the land too.
      expect(g.state.pending.looked).toHaveLength(2);
    }
    g.act(0).chooseCards({ name: BEAR.name, zone: 'hand', seat: 2 });
    g.passAll();
    // CR 110.2a: it enters under the controller's control; its owner is still seat 2.
    expect(onBattlefield(g, BEAR.name, 0)).toHaveLength(1);
    expect(onBattlefield(g, BEAR.name, 0)[0]?.owner).toBe(2);
    // The other cards stay in the hand.
    g.expect.zone(BOLT.name, 'hand', { seat: 2 });
    g.expect.zone('Island', 'hand', { seat: 2 });
    g.expect.zone(OGRE.name, 'hand', { seat: 2 });
    g.expect.zone(GIANT.name, 'hand', { seat: 1 });
    g.expect.invariants();
  });

  test('the controller may cast none of them, and then every card stays in the hand', () => {
    const g = cast(2);
    g.act(2).chooseCards(BEAR.name, OGRE.name);
    g.act(0).chooseCards();
    g.passAll();
    g.expect.zone(BEAR.name, 'hand', { seat: 2 });
    g.expect.zone(OGRE.name, 'hand', { seat: 2 });
    expect(onBattlefield(g, BEAR.name, 0)).toHaveLength(0);
  });

  test('with X at least the size of the hand, the whole hand is looked at and nobody chooses', () => {
    const g = cast(5);
    expect(g.state.pending?.kind).toBe('chooseCards');
    expect(g.state.pending?.seat).toBe(0);
    if (g.state.pending?.kind === 'chooseCards') {
      expect(g.state.pending.purpose).toBe('cast');
      // Three spells in the hand (the Bear, the Burn, the Ogre); the Island is no spell.
      expect(g.state.pending.legal).toHaveLength(3);
    }
  });

  test('either opponent can be the target: the other one is untouched', () => {
    const g = cast(1, 1);
    // A hand of one card: nothing to choose for the opponent, the Giant is looked at at once and can be cast by the controller.
    expect(g.state.pending?.seat).toBe(0);
    expect(g.state.pending?.kind === 'chooseCards' && g.state.pending.purpose).toBe('cast');
    g.act(0).chooseCards({ name: GIANT.name, zone: 'hand', seat: 1 });
    g.passAll();
    expect(onBattlefield(g, GIANT.name, 0)).toHaveLength(1);
    g.expect.zone(BEAR.name, 'hand', { seat: 2 });
  });

  test('the opponent who is not the one asked does not see the cards the controller looks at, and the chooser sees their own hand only', () => {
    const g = cast(2);
    g.act(2).chooseCards(BEAR.name, 'Island');
    const view = getView(g.state, 1);
    expect(view.pendingCards).toBeUndefined();
  });

  test('X of 0 looks at nothing', () => {
    const g = cast(0);
    expect(g.state.pending?.kind).toBe('priority');
    g.passAll();
    g.expect.zone(BEAR.name, 'hand', { seat: 2 });
  });
});

describe('Villainous Wealth (CR 608.2g, 118.9, 107.3a, 202.3)', () => {
  const cast = (x: number, target: 1 | 2 = 1) => {
    const g = scenario({ seats: 3 })
      .define(WEALTH)
      .define(BEAR)
      .define(OGRE)
      .define(GIANT)
      .define(BOLT)
      .seat(0)
      .hand(WEALTH.name)
      .battlefield('Island', 'Swamp', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .library(...FILLER)
      .seat(1)
      .library(BEAR.name, 'Mountain', BOLT.name, GIANT.name, OGRE.name, ...FILLER)
      .seat(2)
      .library(OGRE.name, ...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(WEALTH.name, { x, targets: [{ player: target }], pay: true });
    g.passAll();
    return g;
  };

  test('the opponent exiles the top X cards; any number of spells of mana value X or less are cast without paying, the rest stay exiled', () => {
    const g = cast(3);
    g.expect.zone('Mountain', 'exile', { seat: 1 });
    expect(g.state.pending?.kind).toBe('chooseCards');
    expect(g.state.pending?.seat).toBe(0);
    // The Bear (mana value 2) and the Burn (1) fit under 3; the land is no spell.
    if (g.state.pending?.kind === 'chooseCards') {
      expect(g.state.pending.purpose).toBe('cast');
      expect(g.state.pending.legal).toHaveLength(2);
    }
    g.act(0).chooseCards({ name: BEAR.name, zone: 'exile', seat: 1 });
    // Asked again, as many spells as the controller wants: the Burn too (it needs a target).
    expect(g.state.pending?.kind).toBe('chooseCards');
    g.act(0).chooseCards();
    g.passAll();
    expect(onBattlefield(g, BEAR.name, 0)).toHaveLength(1);
    g.expect.zone(BOLT.name, 'exile', { seat: 1 });
    // The cards below the first three were not exiled: the top X only.
    expect(g.find({ name: GIANT.name, zone: 'library', seat: 1 })).toHaveLength(1);
    expect(g.find({ name: OGRE.name, zone: 'library', seat: 1 })).toHaveLength(1);
    g.expect.invariants();
  });

  test('a spell with a mana value above X is never offered, however many are exiled', () => {
    const g = cast(4);
    // The Bear (2) and the Burn (1) are offered; the Giant (5) is exiled with them and stays there.
    g.expect.zone(GIANT.name, 'exile', { seat: 1 });
    expect(g.state.pending?.kind).toBe('chooseCards');
    if (g.state.pending?.kind === 'chooseCards') expect(g.state.pending.legal).toHaveLength(2);
    g.act(0).chooseCards();
    g.passAll();
    g.expect.zone(GIANT.name, 'exile', { seat: 1 });
  });

  test('two spells can be cast in one resolution', () => {
    const g = cast(3);
    g.act(0).chooseCards({ name: BEAR.name, zone: 'exile', seat: 1 });
    g.act(0).chooseCards({ name: BOLT.name, zone: 'exile', seat: 1 });
    // The Burn asks for its target as it is cast; both spells are on the stack, the Burn on top (CR 608.2g).
    g.act(0).chooseTargets({ player: 2 });
    g.expect.stack([BOLT.name, BEAR.name]);
    g.passAll();
    expect(onBattlefield(g, BEAR.name, 0)).toHaveLength(1);
    expect(g.state.seats[2]?.life).toBe(38);
  });

  test('another opponent can be the target; the first one is untouched', () => {
    const g = cast(1, 2);
    g.expect.zone(OGRE.name, 'exile', { seat: 2 });
    expect(g.find({ name: BEAR.name, zone: 'library', seat: 1 })).toHaveLength(1);
  });
});

describe('Stolen Goods (CR 701.13, 608.2g, 601.2, 118.9)', () => {
  const resolve = (target: 1 | 2 = 1) => {
    const g = scenario({ seats: 3 })
      .define(GOODS)
      .define(BEAR)
      .define(OGRE)
      .seat(0)
      .hand(GOODS.name)
      .battlefield('Island', 'Island', 'Island', 'Island')
      .library(...FILLER)
      .seat(1)
      .library('Island', 'Mountain', OGRE.name, BEAR.name, ...FILLER)
      .seat(2)
      .library(BEAR.name, ...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(GOODS.name, { targets: [{ player: target }], pay: true });
    g.passAll();
    return g;
  };

  test('the opponent exiles cards until a nonland card; until end of turn the controller may cast that card without paying', () => {
    const g = resolve();
    g.expect.zone('Island', 'exile', { seat: 1 });
    g.expect.zone('Mountain', 'exile', { seat: 1 });
    g.expect.zone(OGRE.name, 'exile', { seat: 1 });
    // The cards after the first nonland card were not exiled.
    expect(g.find({ name: BEAR.name, zone: 'library', seat: 1 })).toHaveLength(1);
    g.act(0).cast(exiledOf(OGRE.name, 1), { alternative: 'free' });
    g.passAll();
    expect(onBattlefield(g, OGRE.name, 0)).toHaveLength(1);
    g.expect.invariants();
  });

  test('a land exiled on the way is not castable or playable by the permission (CR 305.1)', () => {
    const g = resolve();
    g.expect.illegal(0, { cast: exiledOf('Island', 1), alternative: 'free' });
    g.expect.illegal(0, { playLand: exiledOf('Mountain', 1) });
  });

  test('the permission is the controller’s alone: the other players cannot cast the card', () => {
    const g = resolve();
    g.expect.illegal(1, { cast: exiledOf(OGRE.name, 1), alternative: 'free' });
    g.expect.illegal(2, { cast: exiledOf(OGRE.name, 1), alternative: 'free' });
  });

  test('the permission ends with the turn (CR 611.2a)', () => {
    const g = resolve();
    g.advanceTo('precombatMain', { turn: g.state.turn.number + 3 });
    g.expect.zone(OGRE.name, 'exile', { seat: 1 });
    g.expect.illegal(0, { cast: exiledOf(OGRE.name, 1), alternative: 'free' });
  });

  test('the card cannot be cast by paying its mana cost: the permission is to cast it for free only', () => {
    const g = resolve();
    g.expect.illegal(0, { cast: exiledOf(OGRE.name, 1) });
  });

  test('with three players the other opponent can be the target', () => {
    const g = resolve(2);
    g.expect.zone(BEAR.name, 'exile', { seat: 2 });
    expect(g.find({ name: OGRE.name, zone: 'library', seat: 1 })).toHaveLength(1);
  });
});

describe('Silent-Blade Oni (CR 510.3a, 402.3, 608.2g, 118.9)', () => {
  const hit = (target: 1 | 2 = 1) => {
    const g = scenario({ seats: 3 })
      .define(ONI)
      .define(BEAR)
      .define(OGRE)
      .define(BOLT)
      .seat(0)
      .battlefield(ONI.name)
      .library(...FILLER)
      .seat(1)
      .hand(BOLT.name, BEAR.name, 'Island')
      .library(...FILLER)
      .seat(2)
      .hand(OGRE.name)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({
      attack: [{ attacker: ONI.name, target: { player: target } }],
      until: 'combatDamage',
    });
    g.passAll();
    return g;
  };

  test('look at the hand of the damaged player and cast a spell from it without paying: it enters under the controller', () => {
    const g = hit();
    expect(g.state.pending?.kind).toBe('chooseCards');
    expect(g.state.pending?.seat).toBe(0);
    if (g.state.pending?.kind === 'chooseCards') {
      expect(g.state.pending.purpose).toBe('cast');
      // The two spells; the land is no spell, but it is looked at.
      expect(g.state.pending.legal).toHaveLength(2);
      expect(g.state.pending.looked).toHaveLength(3);
    }
    g.act(0).chooseCards({ name: BEAR.name, zone: 'hand', seat: 1 });
    g.passAll();
    expect(onBattlefield(g, BEAR.name, 0)).toHaveLength(1);
    g.expect.zone(BOLT.name, 'hand', { seat: 1 });
    g.expect.zone(OGRE.name, 'hand', { seat: 2 });
    g.expect.invariants();
  });

  test('the player damaged is the one whose hand is looked at, whichever opponent it is', () => {
    const g = hit(2);
    expect(g.state.pending?.kind).toBe('chooseCards');
    if (g.state.pending?.kind === 'chooseCards') expect(g.state.pending.legal).toHaveLength(1);
    g.act(0).chooseCards({ name: OGRE.name, zone: 'hand', seat: 2 });
    g.passAll();
    expect(onBattlefield(g, OGRE.name, 0)).toHaveLength(1);
    g.expect.zone(BEAR.name, 'hand', { seat: 1 });
  });

  test('the controller may cast nothing', () => {
    const g = hit();
    g.act(0).chooseCards();
    g.passAll();
    g.expect.zone(BEAR.name, 'hand', { seat: 1 });
    g.expect.zone(BOLT.name, 'hand', { seat: 1 });
  });

  test('a hand with no spell asks nothing', () => {
    const g = scenario({ seats: 3 })
      .define(ONI)
      .seat(0)
      .battlefield(ONI.name)
      .library(...FILLER)
      .seat(1)
      .hand('Island')
      .library(...FILLER)
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({
      attack: [{ attacker: ONI.name, target: { player: 1 } }],
      until: 'combatDamage',
    });
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
  });
});

describe("Mind's Dilation (CR 601.2i, 603.2, 608.2g, 118.9)", () => {
  /** Seat 0 has the enchantment; seat 1 is the active player with two Red Burns in hand, and seat 2 a Burn too; each library has a different top card. */
  const table = (top1: string, top2 = BEAR.name) =>
    scenario({ seats: 3 })
      .define(DILATION)
      .define(BEAR)
      .define(OGRE)
      .define(BOLT)
      .seat(0)
      .battlefield(DILATION.name)
      .library(...FILLER)
      .seat(1)
      .hand(BOLT.name, BOLT.name)
      .battlefield('Mountain', 'Mountain')
      .library(top1, OGRE.name, ...FILLER)
      .seat(2)
      .hand(BOLT.name)
      .battlefield('Mountain')
      .library(top2, ...FILLER)
      .at('precombatMain', { active: 1 })
      .build();

  test('the first spell an opponent casts in a turn exiles the top card of their library, and the controller may cast it for free', () => {
    const g = table(BEAR.name);
    g.act(1).cast(
      { name: BOLT.name, zone: 'hand', seat: 1, nth: 0 },
      { targets: [{ player: 2 }], pay: true },
    );
    g.expect.stack([`${DILATION.name} (ability)`, BOLT.name]);
    g.passAll();
    // The Bear is exiled from seat 1's library; the controller of the enchantment is asked.
    expect(g.state.pending?.kind).toBe('chooseCards');
    expect(g.state.pending?.seat).toBe(0);
    g.act(0).chooseCards({ name: BEAR.name, zone: 'exile', seat: 1 });
    g.passAll();
    expect(onBattlefield(g, BEAR.name, 0)).toHaveLength(1);
    g.expect.invariants();
  });

  test('a land is exiled and nothing is asked (it is no spell to cast)', () => {
    const g = table('Mountain');
    g.act(1).cast(
      { name: BOLT.name, zone: 'hand', seat: 1, nth: 0 },
      { targets: [{ player: 2 }], pay: true },
    );
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.zone('Mountain', 'exile', { seat: 1 });
  });

  test('the second spell of the same player in the turn does not trigger it', () => {
    const g = table(BEAR.name);
    g.act(1).cast(
      { name: BOLT.name, zone: 'hand', seat: 1, nth: 0 },
      { targets: [{ player: 2 }], pay: true },
    );
    g.passAll();
    g.act(0).chooseCards();
    g.passAll();
    g.act(1).cast(
      { name: BOLT.name, zone: 'hand', seat: 1, nth: 0 },
      { targets: [{ player: 2 }], pay: true },
    );
    g.expect.stack([BOLT.name]);
  });

  test('each opponent’s first spell triggers it, and it is their own library that is exiled from', () => {
    const g = table(BEAR.name, OGRE.name);
    g.act(1).cast(
      { name: BOLT.name, zone: 'hand', seat: 1, nth: 0 },
      { targets: [{ player: 0 }], pay: true },
    );
    g.passAll();
    g.act(0).chooseCards();
    g.passAll();
    // Seat 1 passes with an empty stack, and seat 2 casts its first spell of the turn: the trigger exiles the top card of seat 2's library.
    g.act(1).pass();
    g.act(2).cast(
      { name: BOLT.name, zone: 'hand', seat: 2 },
      { targets: [{ player: 0 }], pay: true },
    );
    g.passAll();
    g.expect.zone(OGRE.name, 'exile', { seat: 2 });
    expect(g.find({ name: BEAR.name, zone: 'library', seat: 1 })).toHaveLength(0);
  });

  test('the controller’s own spells do not trigger it', () => {
    const g = scenario({ seats: 3 })
      .define(DILATION)
      .define(BOLT)
      .seat(0)
      .hand(BOLT.name)
      .battlefield(DILATION.name, 'Mountain')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(BOLT.name, { targets: [{ player: 1 }], pay: true });
    g.expect.stack([BOLT.name]);
  });
});

describe('Fallen Shinobi (CR 510.3a, 601.2, 305.1, 118.9)', () => {
  const hit = (target: 1 | 2 = 1) => {
    const g = scenario({ seats: 3 })
      .define(SHINOBI)
      .define(BEAR)
      .seat(0)
      .battlefield(SHINOBI.name)
      .library(...FILLER)
      .seat(1)
      .library('Island', BEAR.name, 'Mountain', ...FILLER)
      .seat(2)
      .library(OGRE.name, 'Swamp', ...FILLER)
      .at('precombatMain', { active: 0 })
      .define(OGRE)
      .build();
    g.playCombat({
      attack: [{ attacker: SHINOBI.name, target: { player: target } }],
      until: 'combatDamage',
    });
    g.passAll();
    return g;
  };

  test('the damaged player exiles the top two cards; until end of turn the controller plays them, the land for the land drop and the spell without paying', () => {
    const g = hit();
    g.expect.zone('Island', 'exile', { seat: 1 });
    g.expect.zone(BEAR.name, 'exile', { seat: 1 });
    g.expect.zone('Mountain', 'library', { seat: 1 });
    g.advanceTo('postcombatMain');
    g.act(0).playLand(exiledOf('Island', 1));
    g.expect.zone('Island', 'battlefield', { seat: 0 });
    g.act(0).cast(exiledOf(BEAR.name, 1), { alternative: 'free' });
    g.passAll();
    expect(onBattlefield(g, BEAR.name, 0)).toHaveLength(1);
    g.expect.invariants();
  });

  test('with another opponent damaged, that player’s cards are the ones exiled', () => {
    const g = hit(2);
    g.expect.zone(OGRE.name, 'exile', { seat: 2 });
    g.expect.zone('Swamp', 'exile', { seat: 2 });
    expect(g.find({ name: BEAR.name, zone: 'library', seat: 1 })).toHaveLength(1);
  });

  test('the permission lasts until end of turn only', () => {
    const g = hit();
    g.advanceTo('precombatMain', { turn: g.state.turn.number + 3 });
    g.expect.illegal(0, { cast: exiledOf(BEAR.name, 1), alternative: 'free' });
  });
});

describe('Oblivion Sower (CR 603.2, 608.2d, 108.3, 110.2a)', () => {
  const cast = (target: 1 | 2 = 1) => {
    const g = scenario({ seats: 3 })
      .define(SOWER)
      .define(BEAR)
      .seat(0)
      .hand(SOWER.name)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .library(...FILLER)
      .seat(1)
      .library('Island', BEAR.name, 'Swamp', 'Mountain', 'Plains', ...FILLER)
      .seat(2)
      .library('Plains', 'Plains', 'Plains', 'Plains', ...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(SOWER.name, { pay: true });
    g.act(0).chooseTargets({ player: target });
    return g;
  };

  test('when it is cast the opponent exiles four cards; any number of the lands that player owns in exile enter under the controller’s control', () => {
    const g = cast();
    // The trigger waits for its target.
    g.expect.stack([`${SOWER.name} (ability)`, SOWER.name]);
    g.passAll();
    expect(g.state.pending?.kind).toBe('chooseCards');
    expect(g.state.pending?.seat).toBe(0);
    if (g.state.pending?.kind === 'chooseCards') {
      // Three lands among the four cards exiled: the Island, the Swamp and the Mountain (the Bear is no land).
      expect(g.state.pending.legal).toHaveLength(3);
    }
    g.act(0).chooseCards(
      { name: 'Island', zone: 'exile', seat: 1 },
      { name: 'Swamp', zone: 'exile', seat: 1 },
    );
    g.passAll();
    expect(onBattlefield(g, 'Island', 0)).toHaveLength(1);
    expect(onBattlefield(g, 'Swamp', 0)).toHaveLength(1);
    // CR 108.3: the owner is the opponent.
    expect(onBattlefield(g, 'Island', 0)[0]?.owner).toBe(1);
    g.expect.zone('Mountain', 'exile', { seat: 1 });
    g.expect.zone(BEAR.name, 'exile', { seat: 1 });
    g.expect.zone(SOWER.name, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('the lands the player owns in exile from before are candidates too, and the other opponent’s lands never are', () => {
    const g = scenario({ seats: 3 })
      .define(SOWER)
      .define(BEAR)
      .seat(0)
      .hand(SOWER.name)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .library(...FILLER)
      .seat(1)
      .exile('Swamp')
      .library(BEAR.name, BEAR.name, BEAR.name, BEAR.name, ...FILLER)
      .seat(2)
      .exile('Plains')
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(SOWER.name, { pay: true });
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    expect(g.state.pending?.kind).toBe('chooseCards');
    if (g.state.pending?.kind === 'chooseCards') expect(g.state.pending.legal).toHaveLength(1);
    g.act(0).chooseCards({ name: 'Swamp', zone: 'exile', seat: 1 });
    g.passAll();
    expect(onBattlefield(g, 'Swamp', 0)).toHaveLength(1);
    g.expect.zone('Plains', 'exile', { seat: 2 });
  });

  test('the controller may put none', () => {
    const g = cast();
    g.passAll();
    g.act(0).chooseCards();
    g.passAll();
    g.expect.zone('Island', 'exile', { seat: 1 });
  });

  test('with no land among the cards exiled nothing is asked', () => {
    const g = scenario({ seats: 3 })
      .define(SOWER)
      .define(BEAR)
      .seat(0)
      .hand(SOWER.name)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .library(...FILLER)
      .seat(1)
      .library(BEAR.name, BEAR.name, BEAR.name, BEAR.name, ...FILLER)
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(SOWER.name, { pay: true });
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
  });
});

describe('Nashi, Moon Sage’s Scion (CR 118.9, 119.4, 601.2, 305.1, 611.2a)', () => {
  const hit = () => {
    const g = scenario({ seats: 3 })
      .define(NASHI)
      .define(BEAR)
      .define(OGRE)
      .seat(0)
      .battlefield(NASHI.name, 'Swamp', 'Swamp')
      .library(OGRE.name, ...FILLER)
      .seat(1)
      .library(BEAR.name, ...FILLER)
      .seat(2)
      .library('Island', ...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({
      attack: [{ attacker: NASHI.name, target: { player: 1 } }],
      until: 'combatDamage',
    });
    g.passAll();
    return g;
  };

  test('the top card of every library, the controller’s own too, is exiled', () => {
    const g = hit();
    g.expect.zone(OGRE.name, 'exile', { seat: 0 });
    g.expect.zone(BEAR.name, 'exile', { seat: 1 });
    g.expect.zone('Island', 'exile', { seat: 2 });
  });

  test('a spell cast with the permission is paid for with life equal to its mana value, with no mana', () => {
    const g = hit();
    g.advanceTo('postcombatMain');
    const life = g.state.seats[0]?.life ?? 0;
    g.act(0).cast(exiledOf(OGRE.name, 0), { alternative: 'lifeForMana', pay: true });
    g.passAll();
    expect(onBattlefield(g, OGRE.name, 0)).toHaveLength(1);
    expect(g.state.seats[0]?.life).toBe(life - 4);
    // The two Swamps were not tapped.
    expect(
      g
        .find({ name: 'Swamp', zone: 'battlefield', seat: 0 })
        .every((swamp) => swamp.tapped !== true),
    ).toBe(true);
    g.expect.invariants();
  });

  test('the spell cannot be cast by paying its mana cost: “rather than” is not an option', () => {
    const g = scenario({ seats: 3 })
      .define(NASHI)
      .define(BEAR)
      .seat(0)
      .battlefield(NASHI.name, 'Forest', 'Forest')
      .library(...FILLER)
      .seat(1)
      .library(BEAR.name, ...FILLER)
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({
      attack: [{ attacker: NASHI.name, target: { player: 1 } }],
      until: 'combatDamage',
    });
    g.passAll();
    g.advanceTo('postcombatMain');
    g.expect.illegal(0, { cast: exiledOf(BEAR.name, 1) });
  });

  test('only one of the cards may be played: casting a spell ends the permission for the others', () => {
    const g = hit();
    g.advanceTo('postcombatMain');
    g.act(0).cast(exiledOf(BEAR.name, 1), { alternative: 'lifeForMana', pay: true });
    g.passAll();
    g.expect.illegal(0, { cast: exiledOf(OGRE.name, 0), alternative: 'lifeForMana' });
    g.expect.illegal(0, { playLand: exiledOf('Island', 2) });
  });

  test('a land played from exile uses the permission too (and costs no life): the spells can no longer be cast', () => {
    const g = hit();
    g.advanceTo('postcombatMain');
    const life = g.state.seats[0]?.life ?? 0;
    g.act(0).playLand(exiledOf('Island', 2));
    g.expect.zone('Island', 'battlefield', { seat: 0 });
    expect(g.state.seats[0]?.life).toBe(life);
    g.expect.illegal(0, { cast: exiledOf(OGRE.name, 0), alternative: 'lifeForMana' });
    g.expect.illegal(0, { cast: exiledOf(BEAR.name, 1), alternative: 'lifeForMana' });
  });

  test('the permission is the controller’s alone and ends with the turn', () => {
    const g = hit();
    g.expect.illegal(1, { cast: exiledOf(BEAR.name, 1), alternative: 'lifeForMana' });
    g.advanceTo('precombatMain', { turn: g.state.turn.number + 3 });
    g.expect.illegal(0, { cast: exiledOf(BEAR.name, 1), alternative: 'lifeForMana' });
  });
});
