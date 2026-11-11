// Parsed text is only worth something if the engine runs it as written (stage P2). These tests
// import SYNTHETIC cards through the grammar (never through a fixture), define them in an engine
// scenario and play them through applyAction: activated abilities with their costs and timing,
// "until end of turn" pumps, library search, discard, Cycling and a choice of types. Every card
// name starts with "SYNTHETIC"; the Oracle text is real template text from the corpus backlog
// (reports/backlog.md), or marked SYNTHETIC where no real line has the shape.
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const creature = (name: string, oracleText: string, manaCost = '{1}') =>
  parsed(name, 'Creature — Bear', oracleText, { manaCost, power: '2', toughness: '2' });

const LIBRARY = ['Forest', 'Island', 'Plains', 'Swamp', 'Mountain'] as const;

describe('"gets +N/+N until end of turn" as an activated ability', () => {
  test('"{2}: ~ gets +1/+0 until end of turn." pays, goes on the stack, and ends in cleanup', () => {
    const bear = creature('SYNTHETIC Parsed Firebreather', '{2}: ~ gets +1/+0 until end of turn.');
    const g = scenario()
      .define(bear)
      .seat(0)
      .battlefield(bear.name, 'Forest', 'Forest')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).activate(bear.name, { pay: true });
    g.expect.stack([`${bear.name} (ability)`]);
    g.expect.pt(bear.name, 2, 2); // nothing happens until it resolves
    g.passAll();
    g.expect.pt(bear.name, 3, 2);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.pt(bear.name, 2, 2);
  });

  test('"{1}{U}: ~ gets +1/-1 until end of turn." can take toughness away', () => {
    const bear = creature('SYNTHETIC Parsed Shrinker', '{1}{U}: ~ gets +1/-1 until end of turn.');
    const g = scenario()
      .define(bear)
      .seat(0)
      .battlefield(bear.name, 'Island', 'Island')
      .seat(1)
      .build();
    g.act(0).activate(bear.name, { pay: true });
    g.passAll();
    g.expect.pt(bear.name, 3, 1);
  });

  test('"{T}: Target creature gets +2/+2 until end of turn." chooses its target first', () => {
    const coach = creature(
      'SYNTHETIC Parsed Coach',
      '{T}: Target creature gets +2/+2 until end of turn.',
    );
    const g = scenario()
      .define(coach)
      .seat(0)
      .battlefield(coach.name, 'Grizzly Bears')
      .seat(1)
      .build();
    g.act(0).activate(coach.name, { targets: [{ name: 'Grizzly Bears' }] });
    g.expect.tapped(coach.name, true);
    g.passAll();
    g.expect.pt('Grizzly Bears', 4, 4);
    g.expect.pt(coach.name, 2, 2);
  });

  test('"Creatures you control get +1/+1 until end of turn." as a spell covers only your creatures', () => {
    const rally = parsed(
      'SYNTHETIC Parsed Rally',
      'Sorcery',
      'Creatures you control get +1/+1 until end of turn.',
      { manaCost: '{W}' },
    );
    const g = scenario()
      .define(rally)
      .seat(0)
      .hand(rally.name)
      .pool('W')
      .battlefield('Grizzly Bears', 'Isamaru, Hound of Konda')
      .seat(1)
      .battlefield('Yargle, Glutton of Urborg')
      .build();
    g.act(0).cast(rally.name, { pay: true });
    g.passAll();
    g.expect.pt('Grizzly Bears', 3, 3);
    g.expect.pt('Isamaru, Hound of Konda', 3, 3);
    g.expect.pt('Yargle, Glutton of Urborg', 9, 3);
  });

  test('"Target creature gets -2/-2 until end of turn." kills a 2/2 (state-based actions)', () => {
    const curse = parsed(
      'SYNTHETIC Parsed Shrivel',
      'Instant',
      'Target creature gets -2/-2 until end of turn.',
      { manaCost: '{B}' },
    );
    const g = scenario()
      .define(curse)
      .seat(0)
      .hand(curse.name)
      .pool('B')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast(curse.name, { targets: [{ name: 'Grizzly Bears' }], pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
  });
});

describe('costs: sacrifice, life, counters, tap', () => {
  test('"{1}, {T}, Sacrifice ~: Draw a card." sacrifices as a cost, then draws on resolution', () => {
    const rock = parsed(
      'SYNTHETIC Parsed Cantrip Rock',
      'Artifact',
      '{1}, {T}, Sacrifice ~: Draw a card.',
      { manaCost: '{1}' },
    );
    const g = scenario()
      .define(rock)
      .seat(0)
      .battlefield(rock.name, 'Forest')
      .library(...LIBRARY)
      .seat(1)
      .build();
    g.act(0).activate(rock.name, { pay: true });
    g.expect.zone(rock.name, 'graveyard', { seat: 0 });
    g.expect.stack([`${rock.name} (ability)`]);
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('"{T}, Pay 2 life: Draw a card." (CR 119.4) takes the life when it is activated', () => {
    const tap = parsed('SYNTHETIC Parsed Life Tap', 'Artifact', '{T}, Pay 2 life: Draw a card.', {
      manaCost: '{2}',
    });
    const g = scenario()
      .define(tap)
      .seat(0)
      .battlefield(tap.name)
      .library(...LIBRARY)
      .seat(1)
      .build();
    g.act(0).activate(tap.name);
    g.expect.life(0, 38);
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('"Remove a charge counter from ~: You gain 1 life." needs a counter to be offered', () => {
    const battery = parsed(
      'SYNTHETIC Parsed Battery',
      'Artifact',
      'Remove a charge counter from ~: You gain 1 life.',
      { manaCost: '{1}' },
    );
    const g = scenario()
      .define(battery)
      .seat(0)
      .battlefield(battery.name, { counters: { charge: 1 } })
      .seat(1)
      .build();
    g.expect.legal(0, { activate: battery.name });
    g.act(0).activate(battery.name);
    g.expect.counters(battery.name, {});
    g.passAll();
    g.expect.life(0, 41);
    g.expect.illegal(0, { activate: battery.name });
  });

  test('"Sacrifice a creature: You gain 2 life." asks which creature, and never offers the opponent\'s', () => {
    const altar = parsed(
      'SYNTHETIC Parsed Altar',
      'Enchantment',
      'Sacrifice a creature: You gain 2 life.',
      { manaCost: '{2}' },
    );
    const g = scenario()
      .define(altar)
      .seat(0)
      .battlefield(altar.name, 'Grizzly Bears', 'Isamaru, Hound of Konda')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).activate(altar.name);
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents('Isamaru, Hound of Konda');
    g.expect.zone('Isamaru, Hound of Konda', 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.life(0, 42);
  });
});

describe('"Activate only as a sorcery." (CR 602.5d)', () => {
  test("is offered in your main phase with an empty stack, and not on your opponent's turn", () => {
    const scholar = creature(
      'SYNTHETIC Parsed Scholar',
      '{1}: Draw a card. Activate only as a sorcery.',
    );
    const own = scenario()
      .define(scholar)
      .seat(0)
      .battlefield(scholar.name, 'Forest')
      .library(...LIBRARY)
      .seat(1)
      .build();
    own.expect.legal(0, { activate: scholar.name });
    const theirs = scenario()
      .define(scholar)
      .seat(0)
      .battlefield(scholar.name, 'Forest')
      .seat(1)
      .at('precombatMain', { active: 1, priority: 0 })
      .build();
    theirs.expect.illegal(0, { activate: scholar.name });
  });
});

describe('library search', () => {
  const library = (g: ReturnType<typeof scenario>) =>
    g
      .library('Island', { label: 'island' })
      .library('Forest', { label: 'forest' })
      .library('Plains', { label: 'plains' })
      .library('Grizzly Bears', { label: 'bears' });

  test('Rampant Growth: "..., put it onto the battlefield tapped, then shuffle."', () => {
    const growth = parsed(
      'SYNTHETIC Parsed Growth',
      'Sorcery',
      'Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.',
      { manaCost: '{1}{G}' },
    );
    const g = library(scenario().define(growth).seat(0).hand(growth.name).pool('GG'))
      .seat(1)
      .build();
    g.act(0).cast(growth.name, { pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('plains');
    g.expect.zone('Plains', 'battlefield', { seat: 0 });
    g.expect.tapped('Plains', true);
    g.expect.noEvent({ kind: 'cardsRevealed' });
  });

  test('Cultivate: up to two, revealed, one tapped onto the battlefield and the other into your hand', () => {
    const cultivate = parsed(
      'SYNTHETIC Parsed Cultivate',
      'Sorcery',
      'Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.',
      { manaCost: '{2}{G}' },
    );
    const g = library(scenario().define(cultivate).seat(0).hand(cultivate.name).pool('GGG'))
      .seat(1)
      .build();
    g.act(0).cast(cultivate.name, { pay: true });
    g.passAll();
    g.act(0).chooseCards('forest', 'plains');
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    g.expect.tapped('Forest', true);
    g.expect.zone('Plains', 'hand', { seat: 0 });
    g.expect.eventLog([{ kind: 'cardsRevealed' }], { since: 0 });
  });

  test('Farseek: a choice of land types, so a Forest is not offered', () => {
    const farseek = parsed(
      'SYNTHETIC Parsed Farseek',
      'Sorcery',
      'Search your library for a Plains, Island, Swamp, or Mountain card, put it onto the battlefield tapped, then shuffle.',
      { manaCost: '{1}{G}' },
    );
    const g = library(scenario().define(farseek).seat(0).hand(farseek.name).pool('GG'))
      .seat(1)
      .build();
    g.act(0).cast(farseek.name, { pay: true });
    g.passAll();
    const decision = g.state.pending;
    if (decision?.kind !== 'chooseCards') throw new Error('expected chooseCards');
    expect(decision.legal).toEqual([g.id('island'), g.id('plains')]);
    g.act(0).chooseCards('island');
    g.expect.tapped('Island', true);
  });

  test('Nature\'s Lore: "..., put that card onto the battlefield, then shuffle." enters untapped', () => {
    const lore = parsed(
      'SYNTHETIC Parsed Lore',
      'Sorcery',
      'Search your library for a Forest card, put that card onto the battlefield, then shuffle.',
      { manaCost: '{1}{G}' },
    );
    const g = library(scenario().define(lore).seat(0).hand(lore.name).pool('GG')).seat(1).build();
    g.act(0).cast(lore.name, { pay: true });
    g.passAll();
    g.act(0).chooseCards('forest');
    g.expect.tapped('Forest', false);
  });

  test('a tutor: "a creature card, reveal it, put it into your hand" reveals; "a card" does not', () => {
    const creatureTutor = parsed(
      'SYNTHETIC Parsed Creature Tutor',
      'Sorcery',
      'Search your library for a creature card, reveal it, put it into your hand, then shuffle.',
      { manaCost: '{1}{G}' },
    );
    const anyTutor = parsed(
      'SYNTHETIC Parsed Any Tutor',
      'Sorcery',
      'Search your library for a card, put that card into your hand, then shuffle.',
      { manaCost: '{1}{B}' },
    );
    const a = library(scenario().define(creatureTutor).seat(0).hand(creatureTutor.name).pool('GG'))
      .seat(1)
      .build();
    a.act(0).cast(creatureTutor.name, { pay: true });
    a.passAll();
    const d = a.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error('expected chooseCards');
    expect(d.legal).toEqual([a.id('bears')]);
    a.act(0).chooseCards('bears');
    a.expect.zone('Grizzly Bears', 'hand', { seat: 0 });
    a.expect.eventLog([{ kind: 'cardsRevealed' }], { since: 0 });

    const b = library(scenario().define(anyTutor).seat(0).hand(anyTutor.name).pool('BB'))
      .seat(1)
      .build();
    b.act(0).cast(anyTutor.name, { pay: true });
    b.passAll();
    const e = b.state.pending;
    if (e?.kind !== 'chooseCards') throw new Error('expected chooseCards');
    expect(e.legal).toHaveLength(4);
    b.act(0).chooseCards('plains');
    b.expect.zone('Plains', 'hand', { seat: 0 });
    b.expect.noEvent({ kind: 'cardsRevealed' });
  });

  test('what follows a search in the same spell still happens: "..., then shuffle. You lose 3 life."', () => {
    const grim = parsed(
      'SYNTHETIC Parsed Grim Tutor',
      'Sorcery',
      'Search your library for a card, put that card into your hand, then shuffle. You lose 3 life.',
      { manaCost: '{1}{B}{B}' },
    );
    const g = library(scenario().define(grim).seat(0).hand(grim.name).pool('BBB')).seat(1).build();
    g.act(0).cast(grim.name, { pay: true });
    g.passAll();
    g.expect.life(0, 40); // not yet: the search is still being answered
    g.act(0).chooseCards('plains');
    g.expect.zone('Plains', 'hand', { seat: 0 });
    g.expect.life(0, 37);
  });

  test('a fetch land: "{T}, Pay 1 life, Sacrifice ~: Search ... for an Island or Swamp card ..."', () => {
    const delta = parsed(
      'SYNTHETIC Parsed Delta',
      'Land',
      '{T}, Pay 1 life, Sacrifice ~: Search your library for an Island or Swamp card, put it onto the battlefield, then shuffle.',
    );
    const g = scenario()
      .define(delta)
      .seat(0)
      .battlefield(delta.name)
      .library('Swamp', { label: 'swamp' })
      .library('Forest', { label: 'forest' })
      .seat(1)
      .build();
    g.act(0).activate(delta.name);
    g.expect.life(0, 39);
    g.expect.zone(delta.name, 'graveyard', { seat: 0 });
    g.passAll();
    g.act(0).chooseCards('swamp');
    g.expect.zone('Swamp', 'battlefield', { seat: 0 });
  });

  test('Evolving Wilds: "{T}, Sacrifice ~: Search ... a basic land card, put it onto the battlefield tapped, then shuffle."', () => {
    const wilds = parsed(
      'SYNTHETIC Parsed Wilds',
      'Land',
      '{T}, Sacrifice ~: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.',
    );
    const g = library(scenario().define(wilds).seat(0).battlefield(wilds.name)).seat(1).build();
    g.act(0).activate(wilds.name);
    g.expect.stack([`${wilds.name} (ability)`]); // it uses the stack, unlike a mana ability
    g.passAll();
    g.act(0).chooseCards('forest');
    g.expect.tapped('Forest', true);
  });

  test('a trigger can search: "When ~ enters, search ... for a Forest card, put that card onto the battlefield, then shuffle."', () => {
    const scout = creature(
      'SYNTHETIC Parsed Scout',
      'When ~ enters, search your library for a Forest card, put that card onto the battlefield, then shuffle.',
      '{2}',
    );
    const g = library(scenario().define(scout).seat(0).hand(scout.name).pool('CC')).seat(1).build();
    g.act(0).cast(scout.name, { pay: true });
    g.passAll();
    g.passAll();
    g.act(0).chooseCards('forest');
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
  });
});

describe('discard', () => {
  test('"Draw a card, then discard a card." (a loot)', () => {
    const loot = parsed('SYNTHETIC Parsed Loot', 'Sorcery', 'Draw a card, then discard a card.', {
      manaCost: '{U}',
    });
    const g = scenario()
      .define(loot)
      .seat(0)
      .hand(loot.name, 'Plains')
      .pool('U')
      .library('Island', { label: 'drawn' })
      .seat(1)
      .build();
    g.act(0).cast(loot.name, { pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('drawn');
    g.expect.zone('Island', 'graveyard', { seat: 0 });
    g.expect.zone('Plains', 'hand', { seat: 0 });
    g.expect.handSize(0, 1);
  });

  test('"Each player discards a card." asks both players', () => {
    const cruel = parsed('SYNTHETIC Parsed Wheel', 'Sorcery', 'Each player discards a card.', {
      manaCost: '{1}{B}',
    });
    const g = scenario()
      .define(cruel)
      .seat(0)
      .hand(cruel.name, 'Forest', 'Mountain')
      .pool('BB')
      .seat(1)
      .hand('Island', 'Swamp')
      .build();
    g.act(0).cast(cruel.name, { pay: true });
    g.passAll();
    g.act(0).chooseCards('Forest');
    g.expect.pending('chooseCards', 1);
    g.act(1).chooseCards('Island');
    g.expect.zone('Mountain', 'hand', { seat: 0 });
    g.expect.zone('Swamp', 'hand', { seat: 1 });
    g.expect.zone('Forest', 'graveyard', { seat: 0 });
    g.expect.zone('Island', 'graveyard', { seat: 1 });
  });

  test('"Target player discards a card." takes a player target', () => {
    const mind = parsed('SYNTHETIC Parsed Mind Rot', 'Sorcery', 'Target player discards a card.', {
      manaCost: '{B}',
    });
    const g = scenario()
      .define(mind)
      .seat(0)
      .hand(mind.name)
      .pool('B')
      .seat(1)
      .hand('Island', 'Plains')
      .build();
    g.act(0).cast(mind.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 1);
    g.act(1).chooseCards('Plains');
    g.expect.zone('Plains', 'graveyard', { seat: 1 });
    g.expect.handSize(1, 1);
  });
});

describe('Cycling', () => {
  test('"Cycling {2}": from the hand, pay, discard, draw (CR 702.29a)', () => {
    const cycler = creature('SYNTHETIC Parsed Cycler', 'Cycling {2}', '{3}{G}');
    const g = scenario()
      .define(cycler)
      .seat(0)
      .hand(cycler.name)
      .battlefield('Forest', 'Forest')
      .library('Island', 'Plains')
      .seat(1)
      .build();
    g.expect.legal(0, { activate: { name: cycler.name, zone: 'hand' } as never });
    g.act(0).activate(cycler.name, { pay: true });
    g.expect.zone(cycler.name, 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('"Cycling—Pay 2 life" costs life instead of mana', () => {
    const wraith = creature('SYNTHETIC Parsed Wraith', 'Cycling—Pay 2 life', '{3}{B}');
    const g = scenario()
      .define(wraith)
      .seat(0)
      .hand(wraith.name)
      .library('Island', 'Plains')
      .seat(1)
      .build();
    g.act(0).activate(wraith.name);
    g.expect.life(0, 38);
    g.passAll();
    g.expect.handSize(0, 1);
  });
});

describe('a choice of types', () => {
  test('"Destroy target artifact or enchantment." can choose either, and not a creature', () => {
    const disenchant = parsed(
      'SYNTHETIC Parsed Disenchant',
      'Instant',
      'Destroy target artifact or enchantment.',
      { manaCost: '{1}{W}' },
    );
    const aura = parsed('SYNTHETIC Parsed Ward Stone', 'Enchantment', '', { manaCost: '{1}' });
    const cast = (target: string): ScenarioGame => {
      const g = scenario()
        .define(disenchant)
        .define(aura)
        .seat(0)
        .hand(disenchant.name)
        .pool('WW')
        .seat(1)
        .battlefield('Sol Ring', aura.name, 'Grizzly Bears')
        .build();
      g.act(0).cast(disenchant.name, { targets: [{ name: target }], pay: true });
      g.passAll();
      return g;
    };
    cast('Sol Ring').expect.zone('Sol Ring', 'graveyard', { seat: 1 });
    cast(aura.name).expect.zone(aura.name, 'graveyard', { seat: 1 });
    const g = scenario()
      .define(disenchant)
      .seat(0)
      .hand(disenchant.name)
      .pool('WW')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.expect.illegal(0, { cast: disenchant.name });
  });
});

describe('what the grammar reads but the engine cannot run is not lowered as something else', () => {
  test('a mana ability that also draws is reported, never built as an ordinary activation', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Parsed Drawing Rock',
        typeLine: 'Artifact',
        manaCost: '{2}',
        oracleText: '{T}: Add {G}. Draw a card.',
      }),
    );
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.unparsed[0]).toMatchObject({
      reason: 'notRunnable',
      needs: ['manaAlso:draw'],
    });
    expect(imported.definition.faces[0]?.abilities).toEqual([]);
  });

  // This test pinned "{T}, Pay 1 life: Add {W} or {B}." as a cost the engine cannot pay for mana,
  // until the engine learned to (D-099, `manaCost:payLife`); that line is supported now (see
  // convert-grammar-engine-p14.test.ts). Removing a counter is still a cost the engine pays only for
  // an ordinary activation.
  test('"Remove a charge counter from ~: Add {G}." names the cost the engine cannot pay for mana', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Parsed Battery',
        manaCost: '{2}',
        typeLine: 'Artifact',
        oracleText: 'Remove a charge counter from ~: Add {G}.',
      }),
    );
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.unparsed[0]).toMatchObject({
      reason: 'notRunnable',
      needs: ['manaCost:removeCounters'],
    });
  });
});

describe('a mana ability that sacrifices itself (a Treasure-like permanent)', () => {
  test('"Sacrifice ~: Add {R}{R}." needs no {T}: it is a mana ability that costs only itself', () => {
    const petal = parsed('SYNTHETIC Parsed Gold', 'Artifact', 'Sacrifice ~: Add {R}{R}.', {
      manaCost: '{R}',
    });
    const g = scenario().define(petal).seat(0).battlefield(petal.name).seat(1).build();
    g.act(0).tapForMana(petal.name);
    g.expect.pool(0, 'RR');
    g.expect.zone(petal.name, 'graveyard', { seat: 0 });
    g.expect.stack([]);
  });

  test('"{T}, Sacrifice ~: Add one mana of any color." makes the mana and is gone', () => {
    const chest = parsed(
      'SYNTHETIC Parsed Chest',
      'Artifact',
      '{T}, Sacrifice ~: Add one mana of any color.',
      { manaCost: '{1}' },
    );
    const g = scenario().define(chest).seat(0).battlefield(chest.name).seat(1).build();
    g.act(0).tapForMana(chest.name, { color: 'R' });
    g.expect.pool(0, 'R');
    g.expect.zone(chest.name, 'graveyard', { seat: 0 });
    g.expect.stack([]);
  });
});
