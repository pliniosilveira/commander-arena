// Group 3 of the Feather deck (issue 27, D-1320 to D-1325 provisional): what the real cards Phalanx Leader, Tenth District Legionnaire, Danitha Sword of Hope, Feather the Redeemed,
// Zada Hedron Grinder and Mirrorwing Dragon ask of the engine, as the SYNTHETIC cards of `src/cards/fixtures/synthetic-feather-g3.ts` (the cards package checks that the grammar lowers the
// real text to the same nodes). Pins: CR 601.2i and 603.2 (a trigger on the cast of a spell), CR 115.1, 115.9b and 115.9c (a spell "that targets" and "that targets only" something), CR 603.4
// and 603.2 (a trigger that triggers once each turn), CR 614.1a and 608.2n (an instant or sorcery that resolves goes to its owner's graveyard unless a replacement effect exiles it),
// CR 603.7 and 603.7c (a delayed trigger of the card exiled), CR 707.10, 707.10e and 115.3 (a copy of a spell, put onto the stack with a new target, which must be legal for each instance of
// the word "target"), CR 702.18a (shroud), CR 702.11b (hexproof).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { arrangeDecision, handNames } from './scry-helpers';

const CAPTAIN = 'SYNTHETIC Heroic Captain'; // {W}{W} 1/1: a spell you cast that targets it: a +1/+1 counter on each creature you control
const SCOUT = 'SYNTHETIC Heroic Scout'; // {R}{W} 2/2 haste: a spell you cast that targets it: a counter on it, then scry 1
const KNIGHT = 'SYNTHETIC Cast Draw Knight'; // {2}{W} 2/2: an Equipment spell or a spell that targets a creature you control: draw, once each turn
const RECYCLER = 'SYNTHETIC Spell Recycler'; // {R}{W}{W} 3/4 flying: exile the instant or sorcery that targets a creature you control as it resolves, back to the hand at the end step
const GRINDER = 'SYNTHETIC Echo Grinder'; // {3}{R} 3/3: an instant or sorcery that targets only it: a copy for each other creature you control that it could target
const WYRM = 'SYNTHETIC Mirror Wyrm'; // {3}{R}{R} 4/5 flying: the same for a spell any player casts, the copies belong to that player
const PAIRED = 'SYNTHETIC Paired Boost'; // {1}{R} instant: target creature you control +1/+0, target creature with flying +0/+1
const BLADE = 'SYNTHETIC Blade'; // {1} Equipment
const CLOAK = 'Sol Ring'; // {1} artifact, no Equipment
const BEARS = 'Grizzly Bears'; // 2/2
const ANGEL = 'Serra Angel'; // 4/4 flying
const SPIDER = 'Giant Spider'; // 2/4
const VANILLA = 'SYNTHETIC Vanilla 3/3';
const SHROUD_BEAR = 'SYNTHETIC Shroud Bear'; // shroud
const HEXPROOF_BEAR = 'SYNTHETIC Hexproof Bear'; // hexproof
const BOLT = 'Lightning Bolt'; // {R} instant: 3 damage to any target
const UNSUMMON = 'Unsummon'; // {U} instant: return target creature to its owner's hand
const COUNTERSPELL = 'Counterspell';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('the cards are valid', () => {
  test.each([CAPTAIN, SCOUT, KNIGHT, RECYCLER, GRINDER, WYRM])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

/** The spells on the stack, bottom first: the name of the card (or of the card a copy copies), whose it is, whether it is a copy and what it targets. */
function stackOf(g: ScenarioGame) {
  return g.state.stack.map((id) => {
    const obj = g.state.objects[id];
    if (obj === undefined) throw new Error(`no object ${id}`);
    const cardId = obj.card ?? obj.copyOf;
    const card = cardId == null ? undefined : g.state.cards[cardId];
    const name = card === undefined ? '?' : (g.state.definitions[card.definition]?.name ?? '?');
    return {
      name,
      controller: obj.controller,
      copy: obj.copyOf !== undefined && obj.copyOf !== null,
      kind: obj.stack?.kind,
      targets: (obj.stack?.chosenTargets ?? []).map((t) => {
        if (t.kind !== 'object') return `player ${t.seat}`;
        const target = g.state.objects[t.id];
        const targetCard = target?.card == null ? undefined : g.state.cards[target.card];
        return targetCard === undefined
          ? '?'
          : (g.state.definitions[targetCard.definition]?.name ?? '?');
      }),
    };
  });
}

const spellsOnStack = (g: ScenarioGame) => stackOf(g).filter((s) => s.kind === 'spell');
const abilitiesOnStack = (g: ScenarioGame) => stackOf(g).filter((s) => s.kind === 'ability');

describe('Phalanx Leader: whenever you cast a spell that targets this creature, a +1/+1 counter on each creature you control', () => {
  const game = (opponent: readonly string[] = []) =>
    scenario()
      .seat(0)
      .hand(UNSUMMON, BOLT)
      .battlefield(CAPTAIN, BEARS, SPIDER, 'Island', 'Mountain')
      .library(...LIBRARY)
      .seat(1)
      .hand(UNSUMMON)
      .battlefield('Island', ...opponent)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('a spell you cast that targets it triggers: every creature you control gets a counter, before the spell resolves', () => {
    const g = game();
    g.act(0).cast(UNSUMMON, { targets: [CAPTAIN], pay: true });
    expect(abilitiesOnStack(g)).toHaveLength(1);
    g.passAll();
    g.expect.pt(BEARS, 3, 3);
    g.expect.pt(SPIDER, 3, 5);
    g.expect.zone(CAPTAIN, 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test('the counters include the creature itself', () => {
    const g = game();
    g.act(0).cast(UNSUMMON, { targets: [CAPTAIN], pay: true });
    g.pass();
    g.pass();
    g.expect.pt(CAPTAIN, 2, 2);
  });

  test('a spell that targets another creature you control does not trigger it', () => {
    const g = game();
    g.act(0).cast(UNSUMMON, { targets: [BEARS], pay: true });
    expect(abilitiesOnStack(g)).toHaveLength(0);
    g.passAll();
    g.expect.pt(CAPTAIN, 1, 1);
    g.expect.pt(SPIDER, 2, 4);
  });

  test('a spell that targets a player does not trigger it', () => {
    const g = game();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    expect(abilitiesOnStack(g)).toHaveLength(0);
  });

  test('a spell an opponent casts that targets it does not trigger it (it triggers on the spells you cast)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(CAPTAIN, BEARS)
      .library(...LIBRARY)
      .seat(1)
      .hand(UNSUMMON)
      .battlefield('Island')
      .library(...LIBRARY)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.act(1).cast(UNSUMMON, { targets: [CAPTAIN], pay: true });
    expect(abilitiesOnStack(g)).toHaveLength(0);
    g.passAll();
    g.expect.pt(BEARS, 2, 2);
  });
});

describe('Tenth District Legionnaire: whenever you cast a spell that targets this creature, a +1/+1 counter on it, then scry 1', () => {
  const game = () =>
    scenario()
      .seat(0)
      .hand(UNSUMMON)
      .battlefield(SCOUT, BEARS, 'Island')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('a counter on it only, then the scry', () => {
    const g = game();
    g.act(0).cast(UNSUMMON, { targets: [SCOUT], pay: true });
    g.passAll();
    expect(arrangeDecision(g).purpose).toBe('scry');
    g.expect.pt(BEARS, 2, 2);
  });

  test('a spell that targets another creature does not trigger it', () => {
    const g = game();
    g.act(0).cast(UNSUMMON, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
    g.expect.pt(SCOUT, 2, 2);
  });
});

describe('Danitha Sword of Hope: whenever you cast an Equipment spell or a spell that targets a creature you control, draw a card (once each turn)', () => {
  const game = (hand: readonly string[], opponent: readonly string[] = []) =>
    scenario()
      .seat(0)
      .hand(...hand)
      .battlefield(KNIGHT, BEARS, 'Island', 'Island', 'Mountain', 'Mountain')
      .library(...LIBRARY)
      .seat(1)
      .battlefield(...opponent)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('an Equipment spell draws a card', () => {
    const g = game([BLADE]);
    g.act(0).cast(BLADE, { pay: true });
    g.passAll();
    expect(handNames(g)).toEqual(['Plains']);
  });

  test('a spell that targets a creature you control draws a card', () => {
    const g = game([UNSUMMON]);
    g.act(0).cast(UNSUMMON, { targets: [BEARS], pay: true });
    g.passAll();
    expect(handNames(g)).toEqual(['Plains', BEARS]);
  });

  test('an artifact spell that is no Equipment and targets nothing does not', () => {
    const g = game([CLOAK]);
    g.act(0).cast(CLOAK, { pay: true });
    g.passAll();
    expect(handNames(g)).toEqual([]);
  });

  test('a spell that targets a creature an opponent controls does not', () => {
    const g = game([UNSUMMON], [VANILLA]);
    g.act(0).cast(UNSUMMON, { targets: [VANILLA], pay: true });
    g.passAll();
    expect(handNames(g)).toEqual([]);
  });

  test('it triggers only once each turn: the second spell of the turn that qualifies draws nothing (CR 603.2)', () => {
    const g = game([BLADE, UNSUMMON]);
    g.act(0).cast(BLADE, { pay: true });
    g.passAll();
    expect(handNames(g)).toEqual([UNSUMMON, 'Plains']);
    g.act(0).cast(UNSUMMON, { targets: [BEARS], pay: true });
    expect(abilitiesOnStack(g)).toHaveLength(0);
    g.passAll();
    expect(handNames(g)).toEqual(['Plains', BEARS]);
  });

  test('a spell that is an Equipment and targets a creature you control draws one card, not two', () => {
    const g = game([BLADE]);
    g.act(0).cast(BLADE, { pay: true });
    expect(abilitiesOnStack(g)).toHaveLength(1);
  });

  test('the limit is of the turn: the next turn it triggers again', () => {
    const g = game([BLADE, UNSUMMON]);
    g.act(0).cast(BLADE, { pay: true });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 5 });
    g.act(0).cast(UNSUMMON, { targets: [BEARS], pay: true });
    expect(abilitiesOnStack(g)).toHaveLength(1);
  });
});

describe('Feather the Redeemed: an instant or sorcery you cast that targets a creature you control is exiled as it resolves, and returns to your hand at the next end step', () => {
  const game = (
    hand: readonly string[],
    opponent: readonly string[] = [],
    opponentHand: readonly string[] = [],
  ) =>
    scenario()
      .seat(0)
      .hand(...hand)
      .battlefield(RECYCLER, BEARS, 'Island', 'Island', 'Mountain')
      .library(...LIBRARY)
      .seat(1)
      .hand(...opponentHand)
      .battlefield('Island', 'Island', ...opponent)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('it resolves, goes to exile instead of the graveyard, and is back in the hand at the beginning of the next end step', () => {
    const g = game([UNSUMMON]);
    g.act(0).cast(UNSUMMON, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(UNSUMMON, 'exile');
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    expect(g.state.seats[0]?.graveyard).toEqual([]);
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(UNSUMMON, 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test('a spell that targets a creature an opponent controls goes to the graveyard', () => {
    const g = game([UNSUMMON], [VANILLA]);
    g.act(0).cast(UNSUMMON, { targets: [VANILLA], pay: true });
    g.passAll();
    g.expect.zone(UNSUMMON, 'graveyard', { seat: 0 });
  });

  test('a spell that is countered goes to the graveyard and does not come back (the exile replaces the resolution only)', () => {
    const g = game([UNSUMMON], [], [COUNTERSPELL]);
    g.act(0).cast(UNSUMMON, { targets: [BEARS], pay: true });
    g.pass();
    g.act(1).cast(COUNTERSPELL, { targets: [UNSUMMON], pay: true });
    g.passAll();
    g.expect.zone(UNSUMMON, 'graveyard', { seat: 0 });
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(UNSUMMON, 'graveyard', { seat: 0 });
  });

  test('a spell whose only target is gone fizzles: it goes to the graveyard (CR 608.2b)', () => {
    const g = game([UNSUMMON], [], [UNSUMMON]);
    g.act(0).cast(UNSUMMON, { targets: [BEARS], pay: true });
    g.pass();
    g.act(1).cast(UNSUMMON, { targets: [BEARS], pay: true });
    g.passAll();
    expect(g.state.seats[0]?.graveyard).toHaveLength(1);
    expect(g.state.seats[1]?.graveyard).toHaveLength(1);
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.advanceTo('end');
    g.passAll();
    expect(handNames(g)).toEqual([BEARS]);
  });

  test('an opponent’s spell is not exiled (the trigger is for the spells you cast)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(RECYCLER, BEARS)
      .library(...LIBRARY)
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain')
      .library(...LIBRARY)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.act(1).cast(BOLT, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BOLT, 'graveyard', { seat: 1 });
  });

  test('two instants cast in a turn each come back', () => {
    const g = scenario()
      .seat(0)
      .hand(UNSUMMON, BOLT)
      .battlefield(RECYCLER, SPIDER, VANILLA, 'Island', 'Mountain')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(UNSUMMON, { targets: [VANILLA], pay: true });
    g.passAll();
    g.act(0).cast(BOLT, { targets: [SPIDER], pay: true });
    g.passAll();
    g.expect.zone(UNSUMMON, 'exile');
    g.expect.zone(BOLT, 'exile');
    g.advanceTo('end');
    // Two delayed triggers of the same source wait, each for its own card: their controller orders them (CR 603.3b).
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    expect(handNames(g).sort()).toEqual([BOLT, UNSUMMON, VANILLA].sort());
  });
});

describe('Zada Hedron Grinder: an instant or sorcery you cast that targets only this creature is copied for each other creature you control that it could target', () => {
  const game = (field: readonly string[], opponent: readonly string[] = []) =>
    scenario()
      .seat(0)
      .hand(BOLT, UNSUMMON)
      .battlefield(GRINDER, ...field, 'Island', 'Mountain')
      .library(...LIBRARY)
      .seat(1)
      .battlefield(...opponent)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('each copy has one other creature as its target, a different one each, and belongs to you', () => {
    const g = game([BEARS, SPIDER]);
    g.act(0).cast(UNSUMMON, { targets: [GRINDER], pay: true });
    g.pass();
    g.pass();
    expect(spellsOnStack(g)).toEqual([
      { name: UNSUMMON, controller: 0, copy: false, kind: 'spell', targets: [GRINDER] },
      { name: UNSUMMON, controller: 0, copy: true, kind: 'spell', targets: [BEARS] },
      { name: UNSUMMON, controller: 0, copy: true, kind: 'spell', targets: [SPIDER] },
    ]);
    g.passAll();
    g.expect.zone(GRINDER, 'hand', { seat: 0 });
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.zone(SPIDER, 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test('a copy is not cast: it triggers no cast trigger, and it does not give the Equipment spell of the original a second draw', () => {
    const g = scenario()
      .seat(0)
      .hand(UNSUMMON)
      .battlefield(GRINDER, KNIGHT, BEARS, 'Island')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(UNSUMMON, { targets: [GRINDER], pay: true });
    // The Knight's trigger is for the cast spell that targets a creature you control; Zada's is for the one that targets only Zada.
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(GRINDER, KNIGHT);
    expect(abilitiesOnStack(g)).toHaveLength(2);
    g.pass();
    g.pass();
    g.pass();
    g.pass();
    // After both resolved the copies (for the Knight and the Bears) are on the stack; no further trigger was put there for them.
    expect(spellsOnStack(g).filter((s) => s.copy)).toHaveLength(2);
    expect(abilitiesOnStack(g)).toHaveLength(0);
  });

  test('a spell that targets Zada and another creature is not copied (it does not target only Zada)', () => {
    const g = game([BEARS]);
    // Lightning Bolt has one target: aim it at another creature instead of at Zada.
    g.act(0).cast(BOLT, { targets: [BEARS], pay: true });
    expect(abilitiesOnStack(g)).toHaveLength(0);
  });

  test('a spell that targets a player is not copied', () => {
    const g = game([BEARS]);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    expect(abilitiesOnStack(g)).toHaveLength(0);
  });

  test('a creature the spell cannot target gets no copy: shroud (CR 702.18a, 707.10e)', () => {
    const g = game([BEARS, SHROUD_BEAR]);
    g.act(0).cast(UNSUMMON, { targets: [GRINDER], pay: true });
    g.pass();
    g.pass();
    expect(spellsOnStack(g).map((s) => s.targets)).toEqual([[GRINDER], [BEARS]]);
  });

  test('a creature with hexproof that you control can be the target of your copy', () => {
    const g = game([HEXPROOF_BEAR]);
    g.act(0).cast(UNSUMMON, { targets: [GRINDER], pay: true });
    g.pass();
    g.pass();
    expect(spellsOnStack(g).map((s) => s.targets)).toEqual([[GRINDER], [HEXPROOF_BEAR]]);
  });

  test('creatures the opponent controls get no copy', () => {
    const g = game([BEARS], [VANILLA]);
    g.act(0).cast(UNSUMMON, { targets: [GRINDER], pay: true });
    g.pass();
    g.pass();
    expect(spellsOnStack(g).map((s) => s.targets)).toEqual([[GRINDER], [BEARS]]);
  });

  test('a spell with two instances of the word "target" is copied only for a creature that is legal for each (CR 707.10e): the copy has it as both targets', () => {
    const g = scenario()
      .seat(0)
      .hand(PAIRED)
      .battlefield(WYRM, BEARS, ANGEL, 'Mountain', 'Mountain')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    // The Wyrm is the creature you control and the creature with flying: the spell targets only it, twice. The Bears do not fly, so they get no copy; the Angel does.
    g.act(0).cast(PAIRED, { targets: [WYRM, WYRM], pay: true });
    g.pass();
    g.pass();
    expect(spellsOnStack(g).map((s) => [s.copy, s.targets])).toEqual([
      [false, [WYRM, WYRM]],
      [true, [ANGEL, ANGEL]],
    ]);
    g.passAll();
    g.expect.pt(ANGEL, 5, 5);
    g.expect.pt(WYRM, 5, 6);
    g.expect.invariants();
  });

  test('with no other creature there is no copy', () => {
    const g = game([]);
    g.act(0).cast(UNSUMMON, { targets: [GRINDER], pay: true });
    g.pass();
    g.pass();
    expect(spellsOnStack(g)).toHaveLength(1);
  });

  test('a copy that targets a creature with a cast trigger of its own does not trigger it: the copy is not cast (CR 707.10)', () => {
    const g = game([CAPTAIN]);
    g.act(0).cast(UNSUMMON, { targets: [GRINDER], pay: true });
    g.pass();
    g.pass();
    expect(abilitiesOnStack(g)).toHaveLength(0);
  });
});

describe('Mirrorwing Dragon: a spell any player casts that targets only this creature is copied by that player for each other creature they control', () => {
  const game = (ownField: readonly string[], opponentField: readonly string[]) =>
    scenario()
      .seat(0)
      .hand(UNSUMMON)
      .battlefield(WYRM, ...ownField, 'Island')
      .library(...LIBRARY)
      .seat(1)
      .hand(BOLT, UNSUMMON)
      .battlefield(...opponentField, 'Mountain', 'Island')
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the controller casts it: the copies are theirs and aim at their other creatures', () => {
    const g = game([BEARS, SPIDER], [VANILLA]);
    g.act(0).cast(UNSUMMON, { targets: [WYRM], pay: true });
    g.pass();
    g.pass();
    expect(spellsOnStack(g)).toEqual([
      { name: UNSUMMON, controller: 0, copy: false, kind: 'spell', targets: [WYRM] },
      { name: UNSUMMON, controller: 0, copy: true, kind: 'spell', targets: [BEARS] },
      { name: UNSUMMON, controller: 0, copy: true, kind: 'spell', targets: [SPIDER] },
    ]);
  });

  test('an opponent casts it: they copy it for each other creature they control, and the copies are theirs', () => {
    const g = game([BEARS], [VANILLA, HEXPROOF_BEAR, SHROUD_BEAR]);
    g.act(0).pass();
    g.act(1).cast(UNSUMMON, { targets: [WYRM], pay: true });
    g.pass();
    g.pass();
    const spells = spellsOnStack(g);
    expect(spells).toEqual([
      { name: UNSUMMON, controller: 1, copy: false, kind: 'spell', targets: [WYRM] },
      { name: UNSUMMON, controller: 1, copy: true, kind: 'spell', targets: [VANILLA] },
      { name: UNSUMMON, controller: 1, copy: true, kind: 'spell', targets: [HEXPROOF_BEAR] },
    ]);
  });

  test('a spell that targets the dragon and another creature does not target only the dragon: it is not copied (CR 115.9c)', () => {
    const g = scenario()
      .seat(0)
      .hand(PAIRED)
      .battlefield(WYRM, ANGEL, BEARS, 'Mountain', 'Mountain')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    // The Wyrm is the creature you control, the Angel the creature with flying: two different objects.
    g.act(0).cast(PAIRED, { targets: [WYRM, ANGEL], pay: true });
    expect(abilitiesOnStack(g)).toHaveLength(0);
  });

  test('a spell that targets only the dragon, twice, is copied: one object chosen for two instances still is one (CR 115.9c)', () => {
    const g = scenario()
      .seat(0)
      .hand(PAIRED)
      .battlefield(WYRM, ANGEL, 'Mountain', 'Mountain')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(PAIRED, { targets: [WYRM, WYRM], pay: true });
    expect(abilitiesOnStack(g)).toHaveLength(1);
  });

  test('a spell that targets something besides the dragon is not copied', () => {
    const g = game([BEARS], [VANILLA]);
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [BEARS], pay: true });
    expect(abilitiesOnStack(g)).toHaveLength(0);
  });
});
