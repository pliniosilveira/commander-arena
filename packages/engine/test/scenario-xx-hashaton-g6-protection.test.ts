// "As this creature enters, choose a card type." and "You and creatures you control have protection from the chosen card type." (the Hashaton deck program, group 6:
// D-1170 the choice, D-1171 protection from a card type for a permanent and for a player; provisional numbers).
// Pins: CR 702.16a (protection from a card type applies to sources that are permanents of the type and to sources not on the battlefield that are of the type: a spell,
// an ability's source, last-known information), CR 702.16b (can't be targeted by spells or abilities of the type), CR 702.16c (Auras of the type fall off),
// CR 702.16d (Equipment of the type becomes unattached and stays), CR 702.16e (damage from a source of the type to the permanent or the player is prevented),
// CR 702.16f (can't be blocked by creatures of the type), CR 205.2a (the card types), CR 614.12a (the choice is made as the permanent enters), CR 607.2d (the
// protection reads the choice of the permanent that gives it), CR 604.1 and 611.3a (a static ability applies only while its permanent is there, to whatever its
// text describes at any moment), CR 113.7a (last-known information), CR 400.7 (a new object has made no choice).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-hashaton-g6.ts, synthetic-attachments.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import type { ObjectId } from '../src/ids';
import {
  CARD_TYPES,
  type ChooseOptionDecision,
  type PendingDecision,
  syntheticCard,
  validateCard,
} from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const SERAPH = 'SYNTHETIC Warding Seraph'; // 4/4 flying Angel: you and creatures you control have protection from the chosen card type
const NEEDLE = 'SYNTHETIC Needle Imp'; // creature: {T}: 1 damage to any target
const SPITE = 'SYNTHETIC Spite Imp'; // creature: when it dies, 2 damage to any target
const GOLEM = 'SYNTHETIC Brass Golem'; // artifact creature 3/3
const PINGER = 'SYNTHETIC Brass Pinger'; // artifact: {T}: 1 damage to any target
const BURN = 'SYNTHETIC Slow Burn'; // sorcery: 3 damage to any target
const AURA = 'SYNTHETIC Might Aura'; // enchantment Aura: enchant creature, +2/+2
const BLADE = 'SYNTHETIC Blade'; // artifact Equipment: +2/+0, equip {1}
const VANILLA = 'SYNTHETIC Vanilla 3/3'; // creature (Construct)
const SMALL = 'SYNTHETIC Vanilla 1/1';
const BOLT = 'Lightning Bolt'; // instant
const MURDER = 'Murder'; // instant
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

type CardTypeName = (typeof CARD_TYPES)[number];

const question = (g: ScenarioGame): ChooseOptionDecision => {
  const d = g.state.pending;
  if (d?.kind !== 'chooseOption') throw new Error(`expected chooseOption, got ${d?.kind}`);
  return d;
};

/** Seat 1 is the active player in the first main phase with its mana out: the attacker of these tests. */
const opponentTurn = (b: ReturnType<typeof scenario>) =>
  b.at('precombatMain', { active: 1, turn: 2 });

/** The targets the engine offers for the slot of the spell or ability `how` names, or none when it is not offered at all (no legal target). */
function legalOf(
  g: ScenarioGame,
  seat: 0 | 1,
  how: { readonly cast: string } | { readonly activate: string },
): { players: number[]; objects: ObjectId[] } {
  const none = { players: [], objects: [] };
  try {
    if ('cast' in how) g.act(seat).cast(how.cast);
    else g.act(seat).activate(how.activate, { ability: 0 });
  } catch {
    return none;
  }
  const d: PendingDecision | null = g.state.pending;
  if (d?.kind !== 'targets') return none;
  const legal = d.specs[0]?.legal ?? [];
  return {
    players: legal.flatMap((t) => (t.kind === 'player' ? [t.seat] : [])),
    objects: legal.flatMap((t) => (t.kind === 'object' ? [t.id] : [])),
  };
}

describe('the cards are valid', () => {
  test.each([SERAPH, NEEDLE, SPITE, GOLEM, PINGER, BURN])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  const withAbilities = (abilities: unknown[]) => {
    const card = syntheticCard(SERAPH);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    return { ...card, faces: [{ ...face, abilities }] } as never;
  };
  const choose = { kind: 'replacement', replacement: { kind: 'asEntersChoose', what: 'cardType' } };
  const grant = (keyword: unknown) => ({
    kind: 'static',
    static: {
      kind: 'grantKeyword',
      subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you' } },
      keyword,
    },
  });
  const player = (s: unknown) => ({ kind: 'static', static: s });

  test('a protection from the chosen card type needs the card to choose one (CR 607.2d)', () => {
    const chosen = { kind: 'protection', from: 'chosenCardType' };
    expect(validateCard(withAbilities([choose, grant(chosen)]))).toEqual([]);
    expect(validateCard(withAbilities([grant(chosen)])).length).toBeGreaterThan(0);
    expect(
      validateCard(withAbilities([player({ kind: 'playerProtection', from: 'chosenCardType' })]))
        .length,
    ).toBeGreaterThan(0);
    // a choice of a creature type does not give a card type
    const creatureType = {
      kind: 'replacement',
      replacement: { kind: 'asEntersChoose', what: 'creatureType' },
    };
    expect(validateCard(withAbilities([creatureType, grant(chosen)])).length).toBeGreaterThan(0);
  });

  test('named card types are card types of the engine, at least one', () => {
    const named = (types: unknown) => ({ kind: 'protection', from: 'cardType', types });
    expect(validateCard(withAbilities([grant(named(['artifact', 'enchantment']))]))).toEqual([]);
    expect(validateCard(withAbilities([grant(named([]))])).length).toBeGreaterThan(0);
    expect(validateCard(withAbilities([grant(named(['Elf']))])).length).toBeGreaterThan(0);
    expect(validateCard(withAbilities([grant(named(undefined))])).length).toBeGreaterThan(0);
    expect(
      validateCard(
        withAbilities([
          player({ kind: 'playerProtection', from: 'cardType', types: ['creature'] }),
        ]),
      ),
    ).toEqual([]);
    expect(
      validateCard(
        withAbilities([player({ kind: 'playerProtection', from: 'cardType', types: ['Elf'] })]),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(withAbilities([player({ kind: 'playerProtection', from: 'color' })])).length,
    ).toBeGreaterThan(0);
  });

  test('only a card type is a choice of a card type: a bad kind of choice is refused', () => {
    const bad = { kind: 'replacement', replacement: { kind: 'asEntersChoose', what: 'supertype' } };
    expect(validateCard(withAbilities([bad])).length).toBeGreaterThan(0);
  });
});

describe('"As this creature enters, choose a card type" (CR 614.12a, 205.2a)', () => {
  const cast = () => {
    const g = scenario()
      .seat(0)
      .hand(SERAPH)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .build();
    g.act(0).cast(SERAPH, { pay: true });
    g.passAll();
    return g;
  };

  test('the controller is asked as the spell resolves, with the nine card types', () => {
    const g = cast();
    const d = question(g);
    expect(d.seat).toBe(0);
    expect(d.purpose).toBe('cardType');
    expect(d.sourceName).toBe(SERAPH);
    expect(d.options).toEqual(CARD_TYPES);
    expect(d.options).toContain('kindred');
    g.expect.zone(SERAPH, 'stack');
    g.expect.noObject(SERAPH, { zone: 'battlefield' });
    g.expect.invariants();
  });

  test('the answer is stored on the permanent, which then enters', () => {
    const g = cast();
    const before = g.mark();
    g.act(0).chooseOption('artifact');
    g.expect.zone(SERAPH, 'battlefield', { seat: 0 });
    g.expect.chosen(SERAPH, { cardType: 'artifact' });
    g.expect.eventLog(
      [
        { kind: 'optionChosen', seat: 0, purpose: 'cardType', option: 'artifact' },
        { kind: 'zoneChanged', fromZone: 'stack', toZone: 'battlefield' },
      ],
      { since: before },
    );
    g.expect.invariants();
  });

  test('only a card type is accepted; a creature type, a color and a wrong spelling are refused', () => {
    const g = cast();
    for (const bad of ['Angel', 'W', 'Creature', 'creatures', 'legendary', '', 'dungeon']) {
      expect(g.act(0).try.action({ kind: 'chooseOption', option: bad }).ok, bad).toBe(false);
    }
    expect(g.act(1).try.action({ kind: 'chooseOption', option: 'artifact' }).ok).toBe(false);
    g.expect.pending('chooseOption', 0);
    g.act(0).chooseOption('instant');
    g.expect.chosen(SERAPH, { cardType: 'instant' });
  });

  test('every card type can be chosen', () => {
    for (const type of CARD_TYPES) {
      const g = cast();
      g.act(0).chooseOption(type);
      g.expect.chosen(SERAPH, { cardType: type });
      g.expect.invariants();
    }
  });

  test('the scenario builder takes a chosen card type and refuses a creature type for it', () => {
    const g = scenario()
      .seat(0)
      .battlefield(SERAPH, { chosen: { cardType: 'land' } })
      .seat(1)
      .build();
    g.expect.chosen(SERAPH, { cardType: 'land' });
    expect(() =>
      scenario()
        .seat(0)
        .battlefield(SERAPH, { chosen: { creatureType: 'Elf' } })
        .seat(1)
        .build(),
    ).toThrow(/chooses a cardType/);
  });
});

describe('protection from a card type: it can not be targeted by a spell of that type (CR 702.16b)', () => {
  const game = (chosen: CardTypeName) =>
    opponentTurn(
      scenario()
        .seat(0)
        .library(...LIBRARY)
        .battlefield(SERAPH, { chosen: { cardType: chosen } })
        .battlefield(BEARS)
        .seat(1)
        .library(...LIBRARY)
        .hand(BOLT, BURN)
        .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain'),
    ).build();

  test('chosen instant: an instant can not target me or my creatures; a sorcery can', () => {
    const g = game('instant');
    const bolt = legalOf(g, 1, { cast: BOLT });
    expect(bolt.players).toEqual([1]);
    expect(bolt.objects).toEqual([]);
    const h = game('instant');
    const burn = legalOf(h, 1, { cast: BURN });
    expect(burn.players.sort()).toEqual([0, 1]);
    expect(burn.objects.sort()).toEqual([h.id(SERAPH), h.id(BEARS)].sort());
  });

  test('chosen sorcery: the other way round', () => {
    const g = game('sorcery');
    const burn = legalOf(g, 1, { cast: BURN });
    expect(burn.players).toEqual([1]);
    expect(burn.objects).toEqual([]);
    const h = game('sorcery');
    const bolt = legalOf(h, 1, { cast: BOLT });
    expect(bolt.players.sort()).toEqual([0, 1]);
    expect(bolt.objects.sort()).toEqual([h.id(SERAPH), h.id(BEARS)].sort());
  });

  test('a type the spell does not have changes nothing', () => {
    const g = game('planeswalker');
    const bolt = legalOf(g, 1, { cast: BOLT });
    expect(bolt.players.sort()).toEqual([0, 1]);
    expect(bolt.objects.length).toBe(2);
  });

  test('naming a protected target is refused as the spell is cast (CR 601.2c); a type it does not have is not', () => {
    const g = game('instant');
    expect(() => g.act(1).cast(BOLT, { pay: true, targets: [{ player: 0 }] })).toThrow(
      /rejected seat 1 (castSpell|chooseTarget)/,
    );
    const h = game('instant');
    expect(() => h.act(1).cast(BOLT, { pay: true, targets: [BEARS] })).toThrow(
      /rejected seat 1 (castSpell|chooseTarget)/,
    );
    const i = game('sorcery');
    i.act(1).cast(BOLT, { pay: true, targets: [{ player: 0 }] });
    i.passAll();
    i.expect.life(0, 37);
  });
});

describe('protection from a card type: an ability of a source of that type can not target them (CR 702.16a, 702.16b)', () => {
  const game = (chosen: CardTypeName, extra: readonly string[] = []) =>
    opponentTurn(
      scenario()
        .seat(0)
        .library(...LIBRARY)
        .battlefield(SERAPH, { chosen: { cardType: chosen } })
        .battlefield(BEARS)
        .seat(1)
        .library(...LIBRARY)
        .battlefield(NEEDLE, PINGER, GOLEM, ...extra),
    ).build();

  test('chosen creature: the creature ability can not, the artifact ability can', () => {
    const g = game('creature');
    const needle = legalOf(g, 1, { activate: NEEDLE });
    expect(needle.players).toEqual([1]);
    // any target: a creature, a planeswalker, a battle or a player (CR 115.4), so the Pinger (an artifact that is not a creature) is no target
    expect(needle.objects.sort()).toEqual([g.id(NEEDLE), g.id(GOLEM)].sort());
    const h = game('creature');
    const pinger = legalOf(h, 1, { activate: PINGER });
    expect(pinger.players.sort()).toEqual([0, 1]);
    expect(pinger.objects).toContain(h.id(NEEDLE));
  });

  test('chosen artifact: the artifact ability can not, the creature ability can', () => {
    const g = game('artifact');
    const pinger = legalOf(g, 1, { activate: PINGER });
    expect(pinger.players).toEqual([1]);
    expect(pinger.objects).not.toContain(g.id(SERAPH));
    expect(pinger.objects).not.toContain(g.id(BEARS));
    const h = game('artifact');
    const needle = legalOf(h, 1, { activate: NEEDLE });
    expect(needle.players.sort()).toEqual([0, 1]);
    expect(needle.objects).toContain(h.id(SERAPH));
    expect(needle.objects).toContain(h.id(BEARS));
  });

  test("my own creature's ability is stopped too: the quality is the source's, not its controller's", () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SERAPH, { chosen: { cardType: 'creature' } })
      .battlefield(NEEDLE)
      .seat(1)
      .library(...LIBRARY)
      .build();
    const needle = legalOf(g, 0, { activate: NEEDLE });
    expect(needle.players).toEqual([1]);
    expect(needle.objects).toEqual([]);
  });
});

describe('a source that has left the battlefield is read as it last was (CR 113.7a, 702.16a)', () => {
  /** The Imp is burned by its own controller's Bolt and dies; its trigger then has the targets the source's last-known types allow. */
  const dies = (chosen: CardTypeName) => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SERAPH, { chosen: { cardType: chosen } })
      .seat(1)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield(SPITE, 'Mountain')
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.act(1).cast(BOLT, { pay: true, targets: [SPITE] });
    g.passAll();
    return g;
  };

  /** The targets of the trigger of the dead Imp: the decision when there is a choice, else the one target the engine chose and put on the stack. */
  const triggerTargets = (
    g: ScenarioGame,
  ): { players: number[]; objects: ObjectId[]; chosen: boolean } => {
    const d = g.state.pending;
    if (d?.kind === 'targets') {
      const legal = d.specs[0]?.legal ?? [];
      return {
        players: legal.flatMap((t) => (t.kind === 'player' ? [t.seat] : [])),
        objects: legal.flatMap((t) => (t.kind === 'object' ? [t.id] : [])),
        chosen: false,
      };
    }
    const targets = g.state.stack.flatMap((id) => g.state.objects[id]?.stack?.chosenTargets ?? []);
    return {
      players: targets.flatMap((t) => (t.kind === 'player' ? [t.seat] : [])),
      objects: targets.flatMap((t) => (t.kind === 'object' ? [t.id] : [])),
      chosen: true,
    };
  };

  test('chosen creature: the trigger of the dead creature can not target me or my creature (its only target is its controller)', () => {
    // seat 1 is the only legal target, so the engine chose it and the trigger resolved: it dealt its 2 damage to its own controller
    const g = dies('creature');
    g.expect.life(1, 38);
    g.expect.life(0, 40);
    g.expect.damage(SERAPH, 0);
  });

  test('chosen artifact: the same trigger can target me and my creature', () => {
    const g = dies('artifact');
    const t = triggerTargets(g);
    expect(t.chosen).toBe(false);
    expect(t.players.sort()).toEqual([0, 1]);
    expect(t.objects).toContain(g.id(SERAPH));
  });
});

describe('protection from a card type: damage from a source of that type is prevented (CR 702.16e)', () => {
  const attack = (chosen: CardTypeName, attacker: string, block?: string) => {
    const b = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SERAPH, { chosen: { cardType: chosen } })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(attacker);
    const g = b.at('precombatMain', { active: 1, turn: 2 }).build();
    g.advanceTo('declareAttackers');
    g.act(1).attack(attacker);
    g.advanceTo('declareBlockers');
    if (block === undefined) g.act(0).noBlocks();
    else g.act(0).declareBlockers([{ blocker: SERAPH, attacker }]);
    return g;
  };

  test('chosen creature: a creature deals no combat damage to me', () => {
    const g = attack('creature', VANILLA);
    g.passAll();
    g.expect.life(0, 40);
  });

  test('chosen artifact: a creature that is not an artifact does', () => {
    const g = attack('artifact', VANILLA);
    g.passAll();
    g.expect.life(0, 37);
  });

  test('chosen artifact: an artifact creature does not, the source has two types', () => {
    const g = attack('artifact', GOLEM);
    g.passAll();
    g.expect.life(0, 40);
    const h = attack('creature', GOLEM);
    h.passAll();
    h.expect.life(0, 40);
    const i = attack('enchantment', GOLEM);
    i.passAll();
    i.expect.life(0, 37);
  });

  test('chosen creature: my Seraph blocks and takes no damage from the creature', () => {
    const g = attack('creature', VANILLA, SERAPH);
    g.passAll();
    g.expect.damage(SERAPH, 0);
    g.expect.life(0, 40);
  });

  test('chosen artifact: my Seraph blocks the plain creature and takes its damage', () => {
    const g = attack('artifact', VANILLA, SERAPH);
    g.passAll();
    g.expect.damage(SERAPH, 3);
  });
});

describe('protection from a card type: it can not be blocked by creatures of that type (CR 702.16f)', () => {
  const attackWith = (chosen: CardTypeName, blocker: string, attacker = SERAPH) => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SERAPH, { chosen: { cardType: chosen } })
      .battlefield(VANILLA)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(blocker)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(attacker);
    g.advanceTo('declareBlockers');
    return g;
  };

  // A defender with no creature that may block is not asked: the step goes straight to priority (CR 509.1a), so "can't block" is "no block decision".

  test('chosen creature: a creature can not block my creature, which is protected from creatures too', () => {
    const g = attackWith('creature', SMALL, VANILLA);
    g.expect.pending('priority', 0);
    g.expect.combat({ attackers: [VANILLA], unblocked: [VANILLA] });
  });

  test('chosen artifact: an artifact creature can not block my creature, a plain creature can', () => {
    const g = attackWith('artifact', GOLEM, VANILLA);
    g.expect.pending('priority', 0);
    const h = attackWith('artifact', SMALL, VANILLA);
    h.expect.pending('declareBlockers', 1);
    h.expect.canBlock(SMALL, VANILLA, true);
  });

  test('chosen creature: an artifact creature can not block either, whatever else it is', () => {
    const g = attackWith('creature', GOLEM, VANILLA);
    g.expect.pending('priority', 0);
  });

  test('chosen enchantment: creatures block as always', () => {
    const g = attackWith('enchantment', SMALL, VANILLA);
    g.expect.pending('declareBlockers', 1);
    g.expect.canBlock(SMALL, VANILLA, true);
  });

  test('a creature of mine that was given protection by the Seraph is protected against blockers of that type, the Seraph itself too', () => {
    const g = attackWith('creature', SMALL, SERAPH);
    g.expect.pending('priority', 0);
  });
});

describe('Auras and Equipment of the card type fall off (CR 702.16c, 702.16d)', () => {
  test('chosen enchantment: an Aura on my creature is put into its owner graveyard', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SERAPH, { chosen: { cardType: 'enchantment' } })
      .battlefield(BEARS)
      .battlefield(AURA, { attachedTo: BEARS })
      .seat(1)
      .library(...LIBRARY)
      .build({ settle: true });
    g.expect.zone(AURA, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test("chosen enchantment: an opponent's Aura on my creature falls off to its owner", () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SERAPH, { chosen: { cardType: 'enchantment' } })
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(AURA, { attachedTo: BEARS })
      .build({ settle: true });
    g.expect.zone(AURA, 'graveyard', { seat: 1 });
  });

  test('chosen creature: an Aura stays (it is not a creature)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SERAPH, { chosen: { cardType: 'creature' } })
      .battlefield(BEARS)
      .battlefield(AURA, { attachedTo: BEARS })
      .seat(1)
      .library(...LIBRARY)
      .build({ settle: true });
    g.expect.attached(AURA, BEARS);
  });

  test('chosen artifact: Equipment on my creature becomes unattached and stays on the battlefield', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SERAPH, { chosen: { cardType: 'artifact' } })
      .battlefield(BEARS)
      .battlefield(BLADE, { attachedTo: BEARS })
      .seat(1)
      .library(...LIBRARY)
      .build({ settle: true });
    g.expect.zone(BLADE, 'battlefield', { seat: 0 });
    g.expect.attached(BLADE, null);
    g.expect.invariants();
  });

  test('chosen artifact: Equipment can not be attached to my creature again (equip finds no target)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SERAPH, { chosen: { cardType: 'artifact' } })
      .battlefield(BEARS, BLADE, 'Plains', 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .build();
    const equip = legalOf(g, 0, { activate: BLADE });
    expect(equip.objects).toEqual([]);
  });

  test('an Aura spell of the type can not enchant a protected creature: no legal target', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(AURA)
      .battlefield(SERAPH, { chosen: { cardType: 'enchantment' } })
      .battlefield('Forest', 'Forest')
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.expect.illegal(0, { cast: AURA });
  });

  test('the Aura enters and falls off when the Seraph enters later with that choice (the choice is what the type is)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(SERAPH)
      .battlefield(BEARS, 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .battlefield(AURA, { attachedTo: BEARS })
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.expect.attached(AURA, BEARS);
    g.act(0).cast(SERAPH, { pay: true });
    g.passAll();
    g.act(0).chooseOption('enchantment');
    g.passAll();
    g.expect.zone(AURA, 'graveyard', { seat: 0 });
    g.expect.zone(SERAPH, 'battlefield', { seat: 0 });
  });
});

describe('it applies only while the Seraph is there, and each Seraph has its own choice (CR 604.1, 400.7)', () => {
  test('the Seraph dies: the protection ends, and a new Seraph has made no choice yet', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SERAPH, { chosen: { cardType: 'creature' } })
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .hand(MURDER, BOLT)
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Mountain')
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    // protected: a Bolt (instant) is not a creature, so it could always target; use the creature ability of a Needle Imp to see the protection end
    g.act(1).cast(MURDER, { pay: true, targets: [SERAPH] });
    g.passAll();
    g.expect.zone(SERAPH, 'graveyard', { seat: 0 });
    const bolt = legalOf(g, 1, { cast: BOLT });
    expect(bolt.players.sort()).toEqual([0, 1]);
    expect(bolt.objects).toContain(g.id(BEARS));
  });

  test('after the Seraph is gone a creature ability can target me again', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SERAPH, { chosen: { cardType: 'creature' } })
      .seat(1)
      .library(...LIBRARY)
      .hand(MURDER)
      .battlefield(NEEDLE, 'Swamp', 'Swamp', 'Swamp')
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    expect(legalOf(g, 1, { activate: NEEDLE }).players).toEqual([1]);
    const h = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SERAPH, { chosen: { cardType: 'creature' } })
      .seat(1)
      .library(...LIBRARY)
      .hand(MURDER)
      .battlefield(NEEDLE, 'Swamp', 'Swamp', 'Swamp')
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    h.act(1).cast(MURDER, { pay: true, targets: [SERAPH] });
    h.passAll();
    h.expect.zone(SERAPH, 'graveyard', { seat: 0 });
    expect(legalOf(h, 1, { activate: NEEDLE }).players.sort()).toEqual([0, 1]);
  });

  test('two Seraphs with two choices give a creature both protections: they are two abilities, not one (CR 702.16g, 702.16m)', () => {
    // A granted keyword that is already there is not added twice, which for protection must mean the same quality twice and no more (a soak game found
    // a creature that kept only the first protection it was given and took damage from an artifact).
    const game = () =>
      opponentTurn(
        scenario()
          .seat(0)
          .library(...LIBRARY)
          .battlefield(SERAPH, { chosen: { cardType: 'creature' } })
          .battlefield(SERAPH, { chosen: { cardType: 'artifact' } })
          .battlefield(BEARS)
          .seat(1)
          .library(...LIBRARY)
          .battlefield(NEEDLE, PINGER),
      ).build();
    const needle = legalOf(game(), 1, { activate: NEEDLE });
    expect(needle.objects).not.toContain(game().id(BEARS));
    const pinger = legalOf(game(), 1, { activate: PINGER });
    expect(pinger.objects).not.toContain(game().id(BEARS));
    // the same quality twice is one protection (CR 702.16m): two Seraphs that both chose creature
    const twice = opponentTurn(
      scenario()
        .seat(0)
        .library(...LIBRARY)
        .battlefield(SERAPH, { chosen: { cardType: 'creature' } })
        .battlefield(SERAPH, { chosen: { cardType: 'creature' } })
        .battlefield(BEARS)
        .seat(1)
        .library(...LIBRARY)
        .battlefield(NEEDLE),
    ).build();
    expect(legalOf(twice, 1, { activate: NEEDLE }).objects).toEqual([twice.id(NEEDLE)]);
  });

  test('two Seraphs with two choices: both types are protected from', () => {
    const g = opponentTurn(
      scenario()
        .seat(0)
        .library(...LIBRARY)
        .battlefield(SERAPH, { chosen: { cardType: 'creature' } })
        .battlefield(SERAPH, { chosen: { cardType: 'instant' } })
        .seat(1)
        .library(...LIBRARY)
        .hand(BOLT, BURN)
        .battlefield(NEEDLE, PINGER, 'Mountain', 'Mountain', 'Mountain', 'Mountain'),
    ).build();
    expect(legalOf(g, 1, { activate: NEEDLE }).players).toEqual([1]);
    const h = opponentTurn(
      scenario()
        .seat(0)
        .library(...LIBRARY)
        .battlefield(SERAPH, { chosen: { cardType: 'creature' } })
        .battlefield(SERAPH, { chosen: { cardType: 'instant' } })
        .seat(1)
        .library(...LIBRARY)
        .hand(BOLT, BURN)
        .battlefield(NEEDLE, PINGER, 'Mountain', 'Mountain', 'Mountain', 'Mountain'),
    ).build();
    expect(legalOf(h, 1, { cast: BOLT }).players).toEqual([1]);
    const i = opponentTurn(
      scenario()
        .seat(0)
        .library(...LIBRARY)
        .battlefield(SERAPH, { chosen: { cardType: 'creature' } })
        .battlefield(SERAPH, { chosen: { cardType: 'instant' } })
        .seat(1)
        .library(...LIBRARY)
        .hand(BOLT, BURN)
        .battlefield(NEEDLE, PINGER, 'Mountain', 'Mountain', 'Mountain', 'Mountain'),
    ).build();
    expect(legalOf(i, 1, { cast: BURN }).players.sort()).toEqual([0, 1]);
  });

  test("the opponent's Seraph protects its own controller and creatures, not me", () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(NEEDLE, BEARS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SERAPH, { chosen: { cardType: 'creature' } })
      .build();
    const needle = legalOf(g, 0, { activate: NEEDLE });
    expect(needle.players).toEqual([0]);
    expect(needle.objects).not.toContain(g.id(SERAPH));
    expect(needle.objects).toContain(g.id(BEARS));
  });

  test('a Seraph without a choice protects nobody (never half-run)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SERAPH, BEARS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(NEEDLE)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    const needle = legalOf(g, 1, { activate: NEEDLE });
    expect(needle.players.sort()).toEqual([0, 1]);
    expect(needle.objects).toContain(g.id(BEARS));
  });
});

describe('"protection from the chosen card type" printed on the permanent itself (CR 702.16a, 607.2d)', () => {
  const KNIGHT = 'SYNTHETIC Chosen Ward Knight'; // 2/2: as it enters choose a card type; protection from the chosen card type
  const knight = singleFace({
    name: KNIGHT,
    manaCost: ['1', 'W'],
    types: ['creature'],
    subtypes: ['Knight'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 2,
    toughness: 2,
    oracleText:
      'As this creature enters, choose a card type. Protection from the chosen card type.',
    abilities: [
      { kind: 'replacement', replacement: { kind: 'asEntersChoose', what: 'cardType' } },
      { kind: 'keyword', keyword: { kind: 'protection', from: 'chosenCardType' } },
    ],
  });

  const game = (chosen: CardTypeName) =>
    opponentTurn(
      scenario()
        .define(knight)
        .seat(0)
        .library(...LIBRARY)
        .battlefield(KNIGHT, { chosen: { cardType: chosen } })
        .battlefield(BEARS)
        .seat(1)
        .library(...LIBRARY)
        .battlefield(NEEDLE, PINGER),
    ).build();

  test('the card is valid, and refuses the keyword without the question', () => {
    expect(validateCard(knight)).toEqual([]);
    const face = knight.faces[0];
    if (face === undefined) throw new Error('no face');
    const noQuestion = { ...knight, faces: [{ ...face, abilities: [face.abilities[1]] }] } as never;
    expect(validateCard(noQuestion).length).toBeGreaterThan(0);
  });

  test('only the Knight has it: a creature ability can not target it, but can target my other creature', () => {
    const g = game('creature');
    const needle = legalOf(g, 1, { activate: NEEDLE });
    expect(needle.objects).not.toContain(g.id(KNIGHT));
    expect(needle.objects).toContain(g.id(BEARS));
    // and my player has nothing: this is a keyword of the Knight, not of its controller
    expect(needle.players.sort()).toEqual([0, 1]);
  });

  test('the type it chose is the type it is protected from', () => {
    const g = game('artifact');
    const needle = legalOf(g, 1, { activate: NEEDLE });
    expect(needle.objects).toContain(g.id(KNIGHT));
    const h = game('artifact');
    expect(legalOf(h, 1, { activate: PINGER }).objects).not.toContain(h.id(KNIGHT));
  });
});
