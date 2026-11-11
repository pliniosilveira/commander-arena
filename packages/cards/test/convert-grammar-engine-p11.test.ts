// Parsed text is only worth something if the engine runs it as written (stage P11). These tests
// import SYNTHETIC cards through the grammar (never through a fixture), define them in an engine
// scenario and play them through applyAction: the power of a target after it was exiled, the search
// and the token of "its controller", "exile target player's graveyard" as a spell and as an enters
// trigger, "counter ... unless its controller pays", a bounce land's trigger and a reanimation that
// costs life equal to the mana value. Every card name starts with "SYNTHETIC"; the Oracle text is
// template text from the corpus (reports/template-replay.md, the real line of the shape) or marked
// SYNTHETIC where no real line has the shape. No real card's text is claimed, and the real cards
// used as targets and graveyard fodder (Grizzly Bears, Giant Spider, Lightning Bolt) are the
// engine's own fixtures.
import type { CardDefinition } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const instant = (name: string, text: string, manaCost: string, color: 'W' | 'U' | 'G' | 'B') =>
  parsed(name, 'Instant', text, { manaCost, colors: [color] });
const sorcery = (name: string, text: string, manaCost: string, color: 'W' | 'U' | 'G' | 'B') =>
  parsed(name, 'Sorcery', text, { manaCost, colors: [color] });

const BEARS = 'Grizzly Bears'; // 2/2, {1}{G}
const SPIDER = 'Giant Spider'; // 2/4, {3}{G}
const BOLT = 'Lightning Bolt';

describe('"Exile target creature. Its controller gains life equal to its power." (CR 608.2h)', () => {
  const SWORDS = instant(
    'SYNTHETIC Parsed Swords',
    'Exile target creature. Its controller gains life equal to its power.',
    '{W}',
    'W',
  );

  test('the parsed spell is the exile, then a gain for the controller of the target', () => {
    expect(SWORDS.faces[0]?.spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'exile', objects: { kind: 'target', id: 't1' } },
        {
          kind: 'gainLife',
          player: { kind: 'controllerOf', of: { kind: 'target', id: 't1' } },
          amount: { kind: 'powerOf', of: { kind: 'target', id: 't1' } },
        },
      ],
    });
  });

  const build = (counters: Record<string, number> = {}) =>
    scenario()
      .define(SWORDS)
      .seat(0)
      .hand(SWORDS.name)
      .battlefield('Plains')
      .seat(1)
      .battlefield(BEARS, { counters })
      .build();

  test("the creature's controller gains the power it had, counters included", () => {
    const plain = build();
    plain.act(0).cast(SWORDS.name, { targets: [BEARS], pay: true });
    plain.passAll();
    plain.expect.zone(BEARS, 'exile', { seat: 1 });
    plain.expect.life(1, 42);
    plain.expect.life(0, 40);
    plain.expect.invariants();

    const grown = build({ '+1/+1': 2 });
    grown.act(0).cast(SWORDS.name, { targets: [BEARS], pay: true });
    grown.passAll();
    grown.expect.life(1, 44);
  });

  test('a creature its opponent stole: the life goes to the player who controlled it', () => {
    const g = scenario()
      .define(SWORDS)
      .seat(0)
      .hand(SWORDS.name)
      .battlefield('Plains')
      .seat(1)
      .battlefield(BEARS, { controller: 0 })
      .build();
    g.act(0).cast(SWORDS.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.life(0, 42);
    g.expect.life(1, 40);
  });
});

describe('"Destroy target creature. You gain life equal to that creature\'s power." (SYNTHETIC)', () => {
  const LEECH = sorcery(
    'SYNTHETIC Parsed Leech',
    "Destroy target creature. You gain life equal to that creature's power.",
    '{1}{B}',
    'B',
  );

  test('the caster gains the power the destroyed creature had', () => {
    const g = scenario()
      .define(LEECH)
      .seat(0)
      .hand(LEECH.name)
      .battlefield('Swamp', 'Swamp')
      .seat(1)
      .battlefield(SPIDER, { counters: { '+1/+1': 1 } })
      .build();
    g.act(0).cast(LEECH.name, { targets: [SPIDER], pay: true });
    g.passAll();
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
    g.expect.life(0, 43);
    g.expect.life(1, 40);
    g.expect.invariants();
  });
});

describe('"Exile target creature. Its controller may search their library ..." (CR 701.23a, 608.2d)', () => {
  const PATH = instant(
    'SYNTHETIC Parsed Path',
    'Exile target creature. Its controller may search their library for a basic land card, put that card onto the battlefield tapped, then shuffle.',
    '{W}',
    'W',
  );

  const build = () =>
    scenario()
      .seed(3)
      .define(PATH)
      .seat(0)
      .hand(PATH.name)
      .battlefield('Plains')
      .library('Forest', { label: 'myForest' })
      .seat(1)
      .battlefield(BEARS, { label: 'bear' })
      .library('Swamp', { label: 'lib0' })
      .library('Forest', { label: 'lib1' })
      .library(BEARS, { label: 'lib2' })
      .library('Island', { label: 'lib3' })
      .build();

  const cast = (g: ScenarioGame) => {
    g.act(0).cast(PATH.name, { targets: ['bear'], pay: true });
    g.passAll();
    return g;
  };

  test('the parsed search names the controller of the target and is optional', () => {
    expect(PATH.faces[0]?.spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'exile', objects: { kind: 'target', id: 't1' } },
        {
          kind: 'search',
          player: { kind: 'controllerOf', of: { kind: 'target', id: 't1' } },
          optional: true,
          filter: { types: ['land'], supertypes: ['basic'] },
          max: 1,
          destinations: [{ zone: 'battlefield', tapped: true, count: 1 }],
          reveal: false,
          shuffle: true,
        },
      ],
    });
  });

  test('the opponent is asked, finds a basic land, and it enters tapped under their control', () => {
    const g = cast(build());
    expect(g.object('bear').zone).toBe('exile');
    g.expect.pending('confirmOptional', 1);
    g.act(1).accept();
    g.expect.pending('chooseCards', 1);
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error('expected chooseCards');
    // Only the opponent's basic lands (Forest, Island, Swamp), never the caster's library.
    expect(d.legal).toEqual([g.id('lib1'), g.id('lib3'), g.id('lib0')]);
    g.act(1).chooseCards('lib1');
    const land = g.object('lib1');
    expect(land.zone).toBe('battlefield');
    expect(land.controller).toBe(1);
    expect(land.tapped).toBe(true);
    g.expect.librarySize(0, 1);
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('declining does nothing more: no search and no shuffle', () => {
    const g = cast(build());
    const before = g.state.seats[1]?.library;
    g.act(1).decline();
    g.expect.noEvent({ kind: 'librarySearched' });
    g.expect.noEvent({ kind: 'libraryShuffled' });
    expect(g.state.seats[1]?.library).toEqual(before);
    expect(g.object('bear').zone).toBe('exile');
  });
});

describe('"Destroy target permanent. Its controller creates a 3/3 green Beast creature token."', () => {
  const WILD = instant(
    'SYNTHETIC Parsed Wild',
    'Destroy target permanent. Its controller creates a 3/3 green Beast creature token.',
    '{2}{G}',
    'G',
  );

  test('the token is created under the control of the destroyed permanent’s controller', () => {
    const g = scenario()
      .define(WILD)
      .seat(0)
      .hand(WILD.name)
      .battlefield('Forest', 'Forest', 'Forest')
      .seat(1)
      .battlefield(BEARS)
      .build();
    g.act(0).cast(WILD.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    const beasts = g.find({ name: 'Beast', zone: 'battlefield' });
    expect(beasts).toHaveLength(1);
    expect(beasts[0]?.controller).toBe(1);
    expect(beasts[0]?.owner).toBe(1);
    g.expect.pt('Beast', 3, 3);
    g.expect.invariants();
  });

  test('a stolen permanent: the token goes to whoever controlled it', () => {
    const g = scenario()
      .define(WILD)
      .seat(0)
      .hand(WILD.name)
      .battlefield('Forest', 'Forest', 'Forest')
      .seat(1)
      .battlefield(BEARS, { controller: 0 })
      .build();
    g.act(0).cast(WILD.name, { targets: [BEARS], pay: true });
    g.passAll();
    expect(g.find({ name: 'Beast', zone: 'battlefield' })[0]?.controller).toBe(0);
  });
});

describe('"Counter target noncreature spell. Its controller creates two Treasure tokens."', () => {
  const NEGATE = instant(
    'SYNTHETIC Parsed Gold Negate',
    'Counter target noncreature spell. Its controller creates two Treasure tokens.',
    '{1}{U}',
    'U',
  );

  test('the spell’s controller, not the caster of the counter, gets the Treasures', () => {
    const g = scenario()
      .define(NEGATE)
      .seat(0)
      .hand(BOLT)
      .battlefield('Mountain')
      .seat(1)
      .hand(NEGATE.name)
      .battlefield('Island', 'Island')
      .build();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.act(0).pass();
    g.act(1).cast(NEGATE.name, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    g.passAll();
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    g.expect.life(1, 40);
    const treasures = g.find({ name: 'Treasure', zone: 'battlefield' });
    expect(treasures).toHaveLength(2);
    for (const t of treasures) {
      expect(t.controller).toBe(0);
      expect(t.owner).toBe(0);
    }
    g.expect.invariants();
  });
});

describe('"Exile target player\'s graveyard." (CR 108.3, 404.1)', () => {
  const WIPE = sorcery('SYNTHETIC Parsed Wipe', "Exile target player's graveyard.", '{B}', 'B');
  const BOG = parsed(
    'SYNTHETIC Parsed Bog',
    'Land',
    '~ enters tapped.\nWhen ~ enters, exile target player’s graveyard.\n{T}: Add {B}.',
  );

  const bothYards = (hand: string, definition: CardDefinition) =>
    scenario()
      .define(definition)
      .seat(0)
      .hand(hand)
      .battlefield('Swamp')
      .graveyard(BEARS, { label: 'mine' })
      .seat(1)
      .graveyard(SPIDER, { label: 'theirs1' })
      .graveyard('Island', { label: 'theirs2' })
      .build();

  test('as a spell: every card of the chosen player’s graveyard, and only theirs', () => {
    const g = bothYards(WIPE.name, WIPE);
    g.act(0).cast(WIPE.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    expect(g.object('theirs1').zone).toBe('exile');
    expect(g.object('theirs2').zone).toBe('exile');
    expect(g.object('mine').zone).toBe('graveyard');
    g.expect.invariants();
  });

  test('as an enters trigger of a land: the target is chosen as the trigger goes on the stack', () => {
    const g = bothYards(BOG.name, BOG);
    g.act(0).playLand(BOG.name);
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 1 });
    g.expect.stack([`${BOG.name} (ability)`]);
    g.passAll();
    expect(g.object('theirs1').zone).toBe('exile');
    expect(g.object('theirs2').zone).toBe('exile');
    expect(g.object('mine').zone).toBe('graveyard');
    expect(g.object(BOG.name).tapped).toBe(true);
    g.expect.invariants();
  });
});

describe('"Counter target spell unless its controller pays {3}." (CR 701.6, 118.12a, 608.2d)', () => {
  const LEAK = instant(
    'SYNTHETIC Parsed Leak',
    'Counter target spell unless its controller pays {3}.',
    '{1}{U}',
    'U',
  );
  const SPIKE = instant(
    'SYNTHETIC Parsed Spike',
    'Counter target noncreature spell unless its controller pays {2}.',
    '{U}',
    'U',
  );

  /** Seat 0 casts `spell` with `forests` Forests (the spell's cost is paid first); seat 1 counters. */
  function stack(
    counter: CardDefinition,
    spell: string,
    lands: readonly string[],
    targets: readonly { player: 0 | 1 }[] = [],
  ) {
    const g = scenario()
      .define(counter)
      .seat(0)
      .hand(spell)
      .battlefield(...lands)
      .seat(1)
      .hand(counter.name)
      .battlefield('Island', 'Island')
      .build();
    g.act(0).cast(spell, { pay: true, ...(targets.length > 0 ? { targets } : {}) });
    g.act(0).pass();
    g.act(1).cast(counter.name, { targets: [{ name: spell, zone: 'stack' }], pay: true });
    return g;
  }

  test('the parsed counter is the engine node on a target spell', () => {
    expect(LEAK.faces[0]?.spell).toEqual({
      targets: [
        { id: 't1', what: { kind: 'object', filter: { zone: 'stack', stackKind: 'spell' } } },
      ],
      effect: {
        kind: 'counterUnlessPays',
        objects: { kind: 'target', id: 't1' },
        cost: [{ kind: 'mana', symbols: ['3'] }],
      },
    });
  });

  test('the controller of the target is asked, pays {3} and the spell resolves', () => {
    const g = stack(LEAK, BEARS, ['Forest', 'Forest', 'Forest', 'Forest', 'Forest']);
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    const d = g.state.pending;
    if (d?.kind !== 'confirmOptional') throw new Error('expected confirmOptional');
    expect(d.purpose).toBe('counterUnlessPays');
    expect(d.cost).toEqual([{ kind: 'mana', symbols: ['3'] }]);
    g.act(0).accept();
    g.act(0).payAuto();
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(LEAK.name, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('declining, or a controller who cannot pay: the spell is countered', () => {
    const declined = stack(LEAK, BEARS, ['Forest', 'Forest', 'Forest', 'Forest', 'Forest']);
    declined.passAll();
    declined.act(0).decline();
    declined.expect.zone(BEARS, 'graveyard', { seat: 0 });

    // Two Forests pay for the Bears, so nothing is left for {3}: nobody is asked (CR 118.3).
    const broke = stack(LEAK, BEARS, ['Forest', 'Forest']);
    broke.passAll();
    broke.expect.zone(BEARS, 'graveyard', { seat: 0 });
    broke.expect.pending('priority', 0);
  });

  test('the noncreature variant counters a Lightning Bolt unless {2} is paid, and takes no creature', () => {
    const g = stack(SPIKE, BOLT, ['Mountain', 'Mountain', 'Mountain'], [{ player: 1 }]);
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.act(0).payAuto();
    g.passAll();
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    g.expect.noEvent({ kind: 'countered' });
    g.expect.invariants();
  });
});

describe('"When ~ enters, return a land you control to its owner\'s hand." (CR 608.2d, 400.3)', () => {
  const KAROO = parsed(
    'SYNTHETIC Parsed Karoo',
    'Land',
    '~ enters tapped.\nWhen ~ enters, return a land you control to its owner’s hand.\n{T}: Add {W}{U}.',
  );

  test('the only land is itself: it returns to the hand without a question', () => {
    const g = scenario().define(KAROO).seat(0).hand(KAROO.name).seat(1).build();
    g.act(0).playLand(KAROO.name);
    g.expect.stack([`${KAROO.name} (ability)`]);
    g.passAll();
    g.expect.zone(KAROO.name, 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test('with another land the controller chooses, and the opponent’s lands are never offered', () => {
    const g = scenario()
      .define(KAROO)
      .seat(0)
      .hand(KAROO.name)
      .battlefield('Forest', { label: 'myForest' })
      .seat(1)
      .battlefield('Island', { label: 'theirIsland' })
      .build();
    g.act(0).playLand(KAROO.name);
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected choosePermanent');
    expect(d.legal).toContain(g.id('myForest'));
    expect(d.legal).toContain(g.id(KAROO.name));
    expect(d.legal).not.toContain(g.id('theirIsland'));
    g.act(0).choosePermanents('myForest');
    g.expect.zone('Forest', 'hand', { seat: 0 });
    g.expect.zone(KAROO.name, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });
});

describe('a reanimation that costs life equal to the mana value (CR 202.3, 400.7, 608.2h)', () => {
  const REANIMATE = sorcery(
    'SYNTHETIC Parsed Reanimate',
    'Put target creature card from a graveyard onto the battlefield under your control. You lose life equal to that card’s mana value.',
    '{1}{B}',
    'B',
  );

  test('the parsed spell moves the card, then loses life by the mana value of the same target', () => {
    expect(REANIMATE.faces[0]?.spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        {
          kind: 'moveToZone',
          objects: { kind: 'target', id: 't1' },
          to: 'battlefield',
          controller: 'you',
        },
        {
          kind: 'loseLife',
          player: { kind: 'you' },
          amount: { kind: 'manaValueOf', of: { kind: 'target', id: 't1' } },
        },
      ],
    });
  });

  test("the card of the opponent's graveyard enters under your control and you lose its mana value", () => {
    const g = scenario()
      .define(REANIMATE)
      .seat(0)
      .hand(REANIMATE.name)
      .battlefield('Swamp', 'Swamp')
      .seat(1)
      .graveyard(SPIDER, { label: 'spider' })
      .build();
    g.act(0).cast(REANIMATE.name, { targets: [{ name: SPIDER, zone: 'graveyard' }], pay: true });
    g.passAll();
    expect(g.object('spider').zone).toBe('battlefield');
    expect(g.object('spider').controller).toBe(0);
    // {3}{G}: four.
    g.expect.life(0, 36);
    g.expect.life(1, 40);
    g.expect.invariants();
  });

  test('a card of your own graveyard works the same way', () => {
    const g = scenario()
      .define(REANIMATE)
      .seat(0)
      .hand(REANIMATE.name)
      .battlefield('Swamp', 'Swamp')
      .graveyard(BEARS, { label: 'mine' })
      .build();
    g.act(0).cast(REANIMATE.name, { targets: [{ name: BEARS, zone: 'graveyard' }], pay: true });
    g.passAll();
    expect(g.object('mine').zone).toBe('battlefield');
    g.expect.life(0, 38);
  });
});

describe('"Destroy target creature or enchantment an opponent controls. You lose life equal to ..."', () => {
  const PRICE = sorcery(
    'SYNTHETIC Parsed Price',
    'Destroy target creature or enchantment an opponent controls. You lose life equal to that permanent’s mana value.',
    '{1}{B}',
    'B',
  );

  test('you lose the mana value of the permanent that was destroyed', () => {
    const g = scenario()
      .define(PRICE)
      .seat(0)
      .hand(PRICE.name)
      .battlefield('Swamp', 'Swamp')
      .seat(1)
      .battlefield(SPIDER)
      .build();
    g.act(0).cast(PRICE.name, { targets: [SPIDER], pay: true });
    g.passAll();
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
    g.expect.life(0, 36);
    g.expect.life(1, 40);
    g.expect.invariants();
  });
});
