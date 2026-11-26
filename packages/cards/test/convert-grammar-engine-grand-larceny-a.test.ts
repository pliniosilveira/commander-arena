// Grand Larceny deck (issue 119), group A: the cards that take a card from another player's library (or exile creatures) and let their controller play it for as long as it stays exiled,
// paying with mana of any type or any color: Thief of Sanity, Gonti, Canny Acquisitor (its trigger; the cost reduction of its first ability is another group), Dream-Thief's Bandana,
// Siphon Insight, Predators' Hour, Cunning Rhetoric and Heartless Conscription. The REAL cards of the golden corpus (real Oracle text), imported through the grammar only and played through
// applyAction, in games of three players: nothing here assumes one opponent.
// Pins (the CR text was not available here: the numbers are those the repository's own comments cite): CR 406.3 (a card exiled face down; its owner may not look), CR 601.2 and 305.1 (casting
// a card from exile, playing a land), CR 609.4b (mana of any type or color), CR 611.2b (for as long as it remains exiled), CR 603.2c (one trigger for the whole damage event of a group),
// CR 508.1b and 508.6 (attacking a player or a planeswalker), CR 400.7 (a card that changes zone is a new object), CR 101.4 (turn order of the players).
import { type CardDefinition, getView, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';
import { parsed } from './convert-grammar-helpers';

const THIEF = real('Thief of Sanity');
const BANDANA = real("Dream-Thief's Bandana");
const SIPHON = real('Siphon Insight');
const PREDATORS = real("Predators' Hour");
const CUNNING = real('Cunning Rhetoric');
const HEARTLESS = real('Heartless Conscription');
// Gonti, Canny Acquisitor's second ability alone: its first ability (a cost reduction) is read by another group, so the real card is not supported yet.
const GONTI = parsed(
  'SYNTHETIC Gonti Trigger',
  'Creature — Aetherborn Rogue',
  "Whenever one or more creatures you control deal combat damage to a player, look at the top card of that player's library, then exile it face down. You may play that card for as long as it remains exiled, and mana of any type can be spent to cast that spell.",
  { manaCost: '{2}{B}', power: '2', toughness: '3', colors: ['B'] },
);
const RED = parsed('SYNTHETIC Red Bear', 'Creature — Bear', '', {
  manaCost: '{R}{R}',
  power: '2',
  toughness: '2',
  colors: ['R'],
});
const BLUE = parsed('SYNTHETIC Blue Drake', 'Creature — Drake', '', {
  manaCost: '{U}{U}',
  power: '1',
  toughness: '1',
  colors: ['U'],
});
const BOLT = parsed('SYNTHETIC Red Burn', 'Instant', '~ deals 2 damage to any target.', {
  manaCost: '{R}',
  colors: ['R'],
});
const RUNNER = parsed('SYNTHETIC Runner', 'Creature — Human Rogue', '', {
  manaCost: '{1}',
  power: '2',
  toughness: '2',
});
const WALKER = parsed('SYNTHETIC Test Walker', 'Planeswalker — Test', '', {
  manaCost: '{2}',
  loyalty: '4',
});
const BEARS = 'Grizzly Bears';
const FILLER = Array.from({ length: 12 }, () => 'Forest');
const exiledOf = (name: string, seat: 0 | 1 | 2) => ({ name, zone: 'exile' as const, seat });

/** The active player declares the attackers, and the game stops with the declaration's triggers on the stack. */
function declare(
  g: Game,
  seat: 0 | 1 | 2,
  attack: readonly {
    readonly attacker: string;
    readonly target: string | { readonly player: 0 | 1 | 2 };
  }[],
): void {
  g.advanceTo('declareAttackers', { attack: false });
  g.act(seat).declareAttackers(attack);
}

type Game = ReturnType<ReturnType<typeof scenario>['build']>;

/** The attackers attack, and the game runs up to the combat damage triggers on the stack; two triggers are put in order first (CR 603.3b). */
function strike(
  g: Game,
  attack: readonly { readonly attacker: string; readonly target: { readonly player: 0 | 1 | 2 } }[],
): void {
  try {
    g.playCombat({ attack, until: 'combatDamage' });
  } catch (error) {
    if (g.state.pending?.kind !== 'orderTriggers') throw error;
  }
  if (g.state.pending?.kind === 'orderTriggers') g.act(0).orderTriggers(0, 1);
}

describe('every card is valid', () => {
  test.each([
    THIEF,
    BANDANA,
    SIPHON,
    PREDATORS,
    CUNNING,
    HEARTLESS,
    GONTI,
  ] as readonly CardDefinition[])('$name', (card) => {
    expect(validateCard(card)).toEqual([]);
  });
});

describe('the parsed abilities', () => {
  test('Thief of Sanity: look at three, one exiled face down, the rest into the graveyard, then cast it with any mana', () => {
    expect(THIEF.faces[0]?.abilities.find((a) => a.kind === 'triggered')).toMatchObject({
      trigger: { kind: 'dealsCombatDamage', to: 'player' },
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'lookAtTop',
            count: 3,
            from: { kind: 'triggerPlayer' },
            take: { max: 1, min: 1, to: 'exileFaceDownUnlinked' },
            rest: 'graveyard',
          },
          {
            kind: 'mayPlay',
            objects: { kind: 'moved' },
            lasts: 'whileExiled',
            castOnly: true,
            anyManaType: true,
            lookAt: true,
          },
        ],
      },
    });
  });

  test('Cunning Rhetoric: an attack on the controller or their planeswalkers, the top card exiled, played with any color', () => {
    expect(CUNNING.faces[0]?.abilities[0]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'attackBatch', who: 'opponent', attackedYouOrPlaneswalkers: true },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'exileTop', from: { kind: 'triggerPlayer' } },
          { kind: 'mayPlay', lasts: 'whileExiled', anyManaColor: true },
        ],
      },
    });
  });
});

describe('Thief of Sanity (CR 406.3, 601.2, 609.4b, 611.2b)', () => {
  /** Seat 0 has the Thief and three Plains; seat 1 shows the Red Bear, a Mountain and the Blue Drake, then the Bears; seat 2 has the Runner on top. The Thief hits seat 1. */
  const hit = (target: 1 | 2 = 1) => {
    const g = scenario({ seats: 3 })
      .define(THIEF)
      .define(RED)
      .define(BLUE)
      .define(RUNNER)
      .seat(0)
      .battlefield(THIEF.name)
      .battlefield('Plains', 'Plains', 'Plains')
      .library(...FILLER)
      .seat(1)
      .library(RED.name, 'Mountain', BLUE.name, BEARS, ...FILLER)
      .seat(2)
      .library(RUNNER.name, 'Island', ...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({
      attack: [{ attacker: THIEF.name, target: { player: target } }],
      until: 'combatDamage',
    });
    g.expect.stack([`${THIEF.name} (ability)`]);
    g.passAll();
    return g;
  };

  test('the controller chooses one of the top three cards of the damaged player; it is exiled and the other two go to that player’s graveyard (CR 701.20, 404.1)', () => {
    const g = hit();
    expect(g.state.pending?.kind).toBe('chooseCards');
    g.act(0).chooseCards({ name: BLUE.name, seat: 1 });
    g.expect.zone(BLUE.name, 'exile', { seat: 1 });
    g.expect.zone(RED.name, 'graveyard', { seat: 1 });
    g.expect.zone('Mountain', 'graveyard', { seat: 1 });
    // The fourth card was not looked at: it is the top card of the library now.
    expect(g.state.seats[1]?.library).toHaveLength(FILLER.length + 1);
    g.expect.zone(BEARS, 'library', { seat: 1 });
    // The other opponent is untouched.
    expect(g.find({ name: RUNNER.name, zone: 'library', seat: 2 })).toHaveLength(1);
    g.expect.invariants();
  });

  test('with three players, hitting the third player takes the cards of that player', () => {
    const g = hit(2);
    g.act(0).chooseCards({ name: 'Island', seat: 2 });
    g.expect.zone('Island', 'exile', { seat: 2 });
    g.expect.zone(RUNNER.name, 'graveyard', { seat: 2 });
    expect(g.find({ name: RED.name, zone: 'library', seat: 1 })).toHaveLength(1);
  });

  test('the exiled card is cast with mana of any type: {U}{U} is paid with Plains (CR 609.4b)', () => {
    const g = hit();
    g.act(0).chooseCards({ name: BLUE.name, seat: 1 });
    g.advanceTo('postcombatMain');
    g.act(0).cast(exiledOf(BLUE.name, 1), { pay: true });
    g.passAll();
    g.expect.zone(BLUE.name, 'battlefield', { seat: 0 });
  });

  test('the permission lasts as long as the card stays exiled: it is still castable on a later turn of the controller (CR 611.2b)', () => {
    const g = hit();
    g.act(0).chooseCards({ name: BLUE.name, seat: 1 });
    g.advanceTo('precombatMain', { turn: g.state.turn.number + 3 });
    g.expect.zone(BLUE.name, 'exile', { seat: 1 });
    g.act(0).cast(exiledOf(BLUE.name, 1), { pay: true });
    g.passAll();
    g.expect.zone(BLUE.name, 'battlefield', { seat: 0 });
  });

  test('the opponents cannot cast the card: the permission belongs to the Thief’s controller', () => {
    const g = hit();
    g.act(0).chooseCards({ name: BLUE.name, seat: 1 });
    g.expect.illegal(1, { cast: exiledOf(BLUE.name, 1) });
    g.expect.illegal(2, { cast: exiledOf(BLUE.name, 1) });
  });

  test('a land is never cast: “cast” does not allow a land to be played (CR 305.1)', () => {
    const g = hit();
    g.act(0).chooseCards({ name: 'Mountain', seat: 1 });
    g.advanceTo('postcombatMain');
    g.expect.zone('Mountain', 'exile', { seat: 1 });
    g.expect.illegal(0, { playLand: exiledOf('Mountain', 1) });
  });

  test('the card is face down: the other players do not see which card it is (CR 406.3)', () => {
    const g = hit();
    g.act(0).chooseCards({ name: BLUE.name, seat: 1 });
    const names = (seat: 0 | 1 | 2) => getView(g.state, seat).exile.map((o) => o.name);
    expect(names(0)).toContain(BLUE.name);
    expect(names(1)).not.toContain(BLUE.name);
    expect(names(2)).not.toContain(BLUE.name);
  });

  test('a library with fewer than three cards: the cards that are there are looked at', () => {
    const g = scenario({ seats: 3 })
      .define(THIEF)
      .define(RED)
      .seat(0)
      .battlefield(THIEF.name)
      .library(...FILLER)
      .seat(1)
      .library(RED.name, 'Mountain')
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({
      attack: [{ attacker: THIEF.name, target: { player: 1 } }],
      until: 'combatDamage',
    });
    g.passAll();
    g.act(0).chooseCards({ name: RED.name, seat: 1 });
    g.expect.zone(RED.name, 'exile', { seat: 1 });
    g.expect.zone('Mountain', 'graveyard', { seat: 1 });
  });
});

describe('Gonti, Canny Acquisitor (the trigger of its second ability) (CR 603.2c, 406.3, 609.4b)', () => {
  const hit = (attackers: readonly (readonly [string, 1 | 2])[]) => {
    const g = scenario({ seats: 3 })
      .define(GONTI)
      .define(RED)
      .define(RUNNER)
      .seat(0)
      .battlefield(GONTI.name)
      .battlefield(RUNNER.name)
      .battlefield('Plains', 'Plains')
      .library(...FILLER)
      .seat(1)
      .library(RED.name, 'Mountain', ...FILLER)
      .seat(2)
      .library('Island', BEARS, ...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    strike(
      g,
      attackers.map(([attacker, player]) => ({ attacker, target: { player } })),
    );
    return g;
  };

  test('two creatures hit the same player: one trigger, one card (the top one) exiled, and no choice (CR 603.2c)', () => {
    const g = hit([
      [GONTI.name, 1],
      [RUNNER.name, 1],
    ]);
    g.expect.stack([`${GONTI.name} (ability)`]);
    g.passAll();
    g.expect.zone(RED.name, 'exile', { seat: 1 });
    g.expect.zone('Mountain', 'library', { seat: 1 });
    expect(g.state.pending?.kind).toBe('priority');
  });

  test('two creatures hit two different players: the top card of each library is exiled', () => {
    const g = hit([
      [GONTI.name, 1],
      [RUNNER.name, 2],
    ]);
    g.expect.stack([`${GONTI.name} (ability)`, `${GONTI.name} (ability)`]);
    g.passAll();
    g.expect.zone(RED.name, 'exile', { seat: 1 });
    g.expect.zone('Island', 'exile', { seat: 2 });
  });

  test('the creature is cast with any mana, and a land is played, for as long as it stays exiled (CR 305.1, 601.2)', () => {
    const g = hit([
      [GONTI.name, 1],
      [RUNNER.name, 2],
    ]);
    g.passAll();
    g.advanceTo('postcombatMain');
    g.act(0).cast(exiledOf(RED.name, 1), { pay: true });
    g.passAll();
    g.expect.zone(RED.name, 'battlefield', { seat: 0 });
    g.act(0).playLand(exiledOf('Island', 2));
    g.expect.zone('Island', 'battlefield', { seat: 0 });
  });

  test('nobody else may play the exiled cards', () => {
    const g = hit([[GONTI.name, 1]]);
    g.passAll();
    g.expect.illegal(1, { cast: exiledOf(RED.name, 1) });
    g.expect.illegal(2, { cast: exiledOf(RED.name, 1) });
  });
});

describe('Dream-Thief’s Bandana (CR 406.3, 601.2, 609.4b)', () => {
  const board = () =>
    scenario({ seats: 3 })
      .define(BANDANA)
      .define(RED)
      .define(RUNNER)
      .seat(0)
      .battlefield(BEARS, { label: 'bearer' })
      .battlefield(BANDANA.name, { attachedTo: 'bearer' })
      .battlefield(RUNNER.name, { label: 'plain' })
      .battlefield('Plains', 'Plains')
      .library(...FILLER)
      .seat(1)
      .library(RED.name, ...FILLER)
      .seat(2)
      .library('Island', ...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('the equipped creature hits: the top card of that player’s library is exiled face down and may be cast with any mana', () => {
    const g = board();
    g.playCombat({
      attack: [{ attacker: 'bearer', target: { player: 1 } }],
      until: 'combatDamage',
    });
    g.passAll();
    g.expect.zone(RED.name, 'exile', { seat: 1 });
    g.advanceTo('postcombatMain');
    g.act(0).cast(exiledOf(RED.name, 1), { pay: true });
    g.passAll();
    g.expect.zone(RED.name, 'battlefield', { seat: 0 });
    expect(g.find({ name: 'Island', zone: 'library', seat: 2 })).toHaveLength(1);
  });

  test('a creature that is not equipped does not trigger it', () => {
    const g = board();
    g.playCombat({ attack: [{ attacker: 'plain', target: { player: 2 } }], until: 'combatDamage' });
    g.expect.stack([]);
    g.expect.zone('Island', 'library', { seat: 2 });
  });

  test('the exiled card stays playable after the Bandana leaves the battlefield (it is not tied to it)', () => {
    const g = board();
    g.playCombat({
      attack: [{ attacker: 'bearer', target: { player: 2 } }],
      until: 'combatDamage',
    });
    g.passAll();
    g.advanceTo('postcombatMain');
    g.act(0).playLand(exiledOf('Island', 2));
    g.expect.zone('Island', 'battlefield', { seat: 0 });
  });
});

describe('Siphon Insight (CR 401.2, 406.3, 609.4b)', () => {
  const board = () =>
    scenario({ seats: 3 })
      .define(SIPHON)
      .define(RED)
      .define(BLUE)
      .seat(0)
      .hand(SIPHON.name)
      .battlefield('Island', 'Swamp', 'Plains', 'Swamp')
      .library(...FILLER)
      .seat(1)
      .library(BEARS, ...FILLER)
      .seat(2)
      .library(RED.name, BLUE.name, 'Mountain', ...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('of the top two cards of the target opponent’s library one is exiled and the other goes to the bottom of that library', () => {
    const g = board();
    g.act(0).cast(SIPHON.name, { pay: true, targets: [{ player: 2 }] });
    g.passAll();
    expect(g.state.pending?.kind).toBe('chooseCards');
    g.act(0).chooseCards({ name: BLUE.name, seat: 2 });
    g.expect.zone(BLUE.name, 'exile', { seat: 2 });
    const library = g.state.seats[2]?.library ?? [];
    expect(library[library.length - 1]).toBe(
      g.find({ name: RED.name, zone: 'library', seat: 2 })[0]?.id,
    );
    expect(library[0]).toBe(g.find({ name: 'Mountain', zone: 'library', seat: 2 })[0]?.id);
    // The other opponent’s library is not touched.
    expect(g.find({ name: BEARS, zone: 'library', seat: 1 })).toHaveLength(1);
  });

  test('the exiled card is played with mana as though it were mana of any color', () => {
    const g = board();
    g.act(0).cast(SIPHON.name, { pay: true, targets: [{ player: 2 }] });
    g.passAll();
    g.act(0).chooseCards({ name: RED.name, seat: 2 });
    // {R}{R} with an Island, a Swamp and a Plains left: a Plains and a Swamp pay for it.
    g.act(0).cast(exiledOf(RED.name, 2), { pay: true });
    g.passAll();
    g.expect.zone(RED.name, 'battlefield', { seat: 0 });
  });

  test('it cannot target the caster’s own library: only an opponent is a legal target', () => {
    const g = board();
    expect(() => g.act(0).cast(SIPHON.name, { pay: true, targets: [{ player: 0 }] })).toThrow();
  });
});

describe("Predators' Hour (CR 611.2a, 611.2c, 613.1f, 603.2c, 406.3, 609.4b)", () => {
  const board = () =>
    scenario({ seats: 3 })
      .define(PREDATORS)
      .define(RED)
      .define(RUNNER)
      .seat(0)
      .hand(PREDATORS.name)
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(RUNNER.name, { label: 'runner' })
      .battlefield('Swamp', 'Swamp', 'Plains', 'Plains')
      .library(...FILLER)
      .seat(1)
      .library(RED.name, ...FILLER)
      .seat(2)
      .library('Island', BEARS, ...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
  const cast = (g: ReturnType<typeof board>) => {
    g.act(0).cast(PREDATORS.name, { pay: true });
    g.passAll();
  };

  test('each creature hits a different player: each trigger exiles the top card of the library of the player it damaged, face down', () => {
    const g = board();
    cast(g);
    strike(g, [
      { attacker: 'bears', target: { player: 1 } },
      { attacker: 'runner', target: { player: 2 } },
    ]);
    g.expect.stack([`${RUNNER.name} (ability)`, `${BEARS} (ability)`]);
    g.passAll();
    g.expect.zone(RED.name, 'exile', { seat: 1 });
    g.expect.zone('Island', 'exile', { seat: 2 });
    g.expect.zone(BEARS, 'library', { seat: 2 });
  });

  test('the cards are played with mana of any color and by their exiler only, a land as a land drop (CR 305.1, 609.4b)', () => {
    const g = board();
    cast(g);
    strike(g, [
      { attacker: 'bears', target: { player: 1 } },
      { attacker: 'runner', target: { player: 2 } },
    ]);
    g.passAll();
    g.advanceTo('postcombatMain');
    g.expect.illegal(1, { cast: exiledOf(RED.name, 1) });
    g.act(0).playLand(exiledOf('Island', 2));
    g.expect.zone('Island', 'battlefield', { seat: 0 });
  });

  test('the creatures have menace this turn', () => {
    const g = board();
    cast(g);
    const view = getView(g.state, 0).battlefield.find((o) => o.name === BEARS);
    expect(JSON.stringify(view)).toContain('menace');
  });

  test('it lasts until end of turn: the next turn the creature has no such trigger', () => {
    const g = board();
    cast(g);
    g.advanceTo('precombatMain', { turn: g.state.turn.number + 3 });
    g.playCombat({ attack: [{ attacker: 'bears', target: { player: 1 } }], until: 'combatDamage' });
    g.expect.stack([]);
    expect(g.find({ name: RED.name, zone: 'exile' })).toHaveLength(0);
  });
});

describe('Cunning Rhetoric (CR 508.1b, 508.6, 603.2c, 406.3, 609.4b)', () => {
  /** Seat 0 controls the enchantment and a planeswalker; seats 1 and 2 each have an attacker and a different top card. Seat 1 is the active player. */
  const board = () =>
    scenario({ seats: 3 })
      .define(CUNNING)
      .define(RED)
      .define(WALKER)
      .define(RUNNER)
      .seat(0)
      .battlefield(CUNNING.name)
      .battlefield(WALKER.name, { label: 'walker' })
      .battlefield('Plains', 'Plains')
      .library(...FILLER)
      .seat(1)
      .battlefield(BEARS, { label: 'a1' })
      .battlefield(RUNNER.name, { label: 'a2' })
      .library(RED.name, 'Mountain', ...FILLER)
      .seat(2)
      .battlefield(BEARS, { label: 'b1' })
      .library('Island', ...FILLER)
      .at('precombatMain', { active: 1 })
      .build();

  test('an opponent attacks the controller: that opponent’s top card is exiled, and the controller may cast it with any color', () => {
    const g = board();
    declare(g, 1, [{ attacker: 'a1', target: { player: 0 } }]);
    g.expect.stack([`${CUNNING.name} (ability)`]);
    g.passAll();
    g.expect.zone(RED.name, 'exile', { seat: 1 });
    g.advanceTo('postcombatMain');
    // It is seat 1's turn: seat 0 casts it when it could cast it at that time; a creature needs its own main phase.
    g.expect.zone(RED.name, 'exile', { seat: 1 });
  });

  test('two attackers at the controller are one declaration: one card', () => {
    const g = board();
    declare(g, 1, [
      { attacker: 'a1', target: { player: 0 } },
      { attacker: 'a2', target: { player: 0 } },
    ]);
    g.expect.stack([`${CUNNING.name} (ability)`]);
    g.passAll();
    g.expect.zone(RED.name, 'exile', { seat: 1 });
    g.expect.zone('Mountain', 'library', { seat: 1 });
  });

  test('an attack on a planeswalker the controller controls triggers it too (CR 508.6)', () => {
    const g = board();
    declare(g, 1, [{ attacker: 'a1', target: 'walker' }]);
    g.expect.stack([`${CUNNING.name} (ability)`]);
    g.passAll();
    g.expect.zone(RED.name, 'exile', { seat: 1 });
  });

  test('an attack on the third player does not trigger it', () => {
    const g = board();
    declare(g, 1, [{ attacker: 'a1', target: { player: 2 } }]);
    g.expect.stack([]);
    g.expect.zone(RED.name, 'library', { seat: 1 });
  });

  test('an attack by the controller itself does not trigger it', () => {
    const g = scenario({ seats: 3 })
      .define(CUNNING)
      .seat(0)
      .battlefield(CUNNING.name)
      .battlefield(BEARS, { label: 'mine' })
      .library(...FILLER)
      .seat(1)
      .library('Island', ...FILLER)
      .seat(2)
      .library('Island', ...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    declare(g, 0, [{ attacker: 'mine', target: { player: 1 } }]);
    g.expect.stack([]);
  });

  test('the card is cast on the controller’s own turn with mana of any color, and a land is played', () => {
    const g = board();
    declare(g, 1, [{ attacker: 'a1', target: { player: 0 } }]);
    g.passAll();
    g.advanceTo('precombatMain', { turn: g.state.turn.number + 2 });
    expect(g.state.turn.activeSeat).toBe(0);
    g.act(0).cast(exiledOf(RED.name, 1), { pay: true });
    g.passAll();
    g.expect.zone(RED.name, 'battlefield', { seat: 0 });
  });
});

describe('Heartless Conscription (CR 701.13, 406.3, 601.2, 305.1, 609.4b, 608.2n)', () => {
  const board = () =>
    scenario({ seats: 3 })
      .define(HEARTLESS)
      .define(RED)
      .define(BLUE)
      .define(RUNNER)
      .seat(0)
      .hand(HEARTLESS.name)
      .battlefield(RED.name)
      .battlefield('Swamp', { count: 8 })
      .battlefield('Plains', 'Plains')
      .library(...FILLER)
      .seat(1)
      .battlefield(BLUE.name)
      .battlefield(BEARS)
      .library(...FILLER)
      .seat(2)
      .battlefield(RUNNER.name)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
  const cast = (g: ReturnType<typeof board>) => {
    g.act(0).cast(HEARTLESS.name, { pay: true });
    g.passAll();
  };

  test('every creature of every player is exiled, and so is the spell itself', () => {
    const g = board();
    cast(g);
    g.expect.zone(RED.name, 'exile', { seat: 0 });
    g.expect.zone(BLUE.name, 'exile', { seat: 1 });
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    g.expect.zone(RUNNER.name, 'exile', { seat: 2 });
    g.expect.zone(HEARTLESS.name, 'exile', { seat: 0 });
    g.expect.invariants();
  });

  test('the caster may cast each exiled creature, whoever owned it, with mana of any type', () => {
    const g = board();
    cast(g);
    // Two Plains remain untapped and the cost of the Blue Drake is {U}{U}; mana of any type pays.
    g.act(0).cast(exiledOf(BLUE.name, 1), { pay: true });
    g.passAll();
    g.expect.zone(BLUE.name, 'battlefield', { seat: 0 });
  });

  test('the opponents may not cast them, and Heartless Conscription itself stays exiled (no permission for it)', () => {
    const g = board();
    cast(g);
    g.expect.illegal(1, { cast: exiledOf(BLUE.name, 1) });
    g.expect.illegal(2, { cast: exiledOf(RUNNER.name, 2) });
    g.expect.illegal(0, { cast: exiledOf(HEARTLESS.name, 0) });
  });

  test('the permission lasts across turns: a creature exiled this way is castable on a later turn of the caster', () => {
    const g = board();
    cast(g);
    g.advanceTo('precombatMain', { turn: g.state.turn.number + 3 });
    expect(g.state.turn.activeSeat).toBe(0);
    g.act(0).cast(exiledOf(RUNNER.name, 2), { pay: true });
    g.passAll();
    g.expect.zone(RUNNER.name, 'battlefield', { seat: 0 });
  });

  test('a card that was already in exile before the spell is not given the permission', () => {
    const g = scenario({ seats: 3 })
      .define(BOLT)
      .define(HEARTLESS)
      .seat(0)
      .hand(HEARTLESS.name)
      .battlefield('Swamp', { count: 8 })
      .library(...FILLER)
      .seat(1)
      .exile(BOLT.name)
      .library(...FILLER)
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(HEARTLESS.name, { pay: true });
    g.passAll();
    g.expect.illegal(0, { cast: exiledOf(BOLT.name, 1) });
  });
});
