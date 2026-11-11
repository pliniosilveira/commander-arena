// Parsed text is only worth something if the engine runs it as written (stage P13). These tests
// import SYNTHETIC cards through the grammar (never through a fixture), define them in an engine
// scenario and play them through applyAction: the additional costs to cast a spell (sacrifice, discard,
// life), the cost reductions of a spell and of a permanent, the free cast with a commander, the discard
// cost of Ward and of an activated ability, and the counted amounts ("for each creature you control",
// "equal to the number of lands you control"). Every card name starts with "SYNTHETIC"; the Oracle text
// is the real line of the shape in reports/template-replay.md or marked SYNTHETIC where no real line has
// the shape. No real card's text is claimed; the real cards used as attackers, targets and spells to
// cast (Grizzly Bears, Giant Spider, Lightning Bolt, Sol Ring, the basic lands) are the engine's own
// fixtures. What is checked is what the lowering produces against what the rules say (CR 118.7, 118.8,
// 118.9, 601.2f-h, 608.2c, 702.21a, 903.3d), through the same path as a real game: the legal-action
// list, the payment, the decisions and the resolution.
import {
  type ChooseCardsDecision,
  type ChoosePermanentDecision,
  getView,
} from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import type { StoredFace } from '../src/index';
import { parsed } from './convert-grammar-helpers';

const spell = (
  name: string,
  kind: 'Instant' | 'Sorcery',
  manaCost: string,
  colors: StoredFace['colors'],
  text: string,
) => parsed(name, kind, text, { manaCost, colors });

const creature = (name: string, text: string, subtype = 'Bear') =>
  parsed(name, `Creature — ${subtype}`, text, {
    manaCost: '{1}{G}',
    power: '2',
    toughness: '2',
    colors: ['G'],
  });

const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const BOLT = 'Lightning Bolt';
const MURDER = 'Murder'; // instant, {1}{B}{B}
const DIVINATION = 'Divination'; // sorcery, {2}{U}
const ISAMARU = 'Isamaru, Hound of Konda';

const permanentChoice = (g: ScenarioGame): ChoosePermanentDecision => {
  const d = g.state.pending;
  if (d?.kind !== 'choosePermanent') throw new Error(`expected choosePermanent, got ${d?.kind}`);
  return d;
};
const cardsChoice = (g: ScenarioGame): ChooseCardsDecision => {
  const d = g.state.pending;
  if (d?.kind !== 'chooseCards') throw new Error(`expected chooseCards, got ${d?.kind}`);
  return d;
};

/** What the view says a card in `seat`'s hand costs to cast now. */
function costOf(g: ScenarioGame, name: string, seat: 0 | 1 = 0): readonly string[] | undefined {
  const hand = getView(g.state, seat).seats[seat]?.hand ?? [];
  return hand.find((o) => o.name === name)?.castCost;
}

describe('"As an additional cost to cast this spell, sacrifice a creature." (CR 118.8, 701.21)', () => {
  const card = () =>
    spell(
      'SYNTHETIC Parsed Sacrifice Draw',
      'Sorcery',
      '{B}',
      ['B'],
      'As an additional cost to cast this spell, sacrifice a creature.\nDraw two cards.',
    );

  test('the mana is paid, then the caster chooses the creature; the spell draws when it resolves', () => {
    const def = card();
    const g = scenario()
      .define(def)
      .seat(0)
      .hand(def.name)
      .battlefield('Swamp', BEARS, 'Llanowar Elves')
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .build();
    g.act(0).cast(def.name, { pay: true });
    expect(permanentChoice(g)).toMatchObject({ purpose: 'sacrifice', forCost: true });
    g.act(0).choosePermanents('Llanowar Elves');
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.passAll();
    g.expect.handSize(0, 2);
    g.expect.invariants();
  });

  test('with no creature to sacrifice the spell is not castable', () => {
    const def = card();
    const g = scenario().define(def).seat(0).hand(def.name).battlefield('Swamp').seat(1).build();
    g.expect.illegal(0, { cast: def.name });
  });

  test('cancelling rewinds the mana and the creature (CR 733)', () => {
    const def = card();
    const g = scenario()
      .define(def)
      .seat(0)
      .hand(def.name)
      .battlefield('Swamp', BEARS, 'Llanowar Elves')
      .seat(1)
      .build();
    const before = g.positionHash();
    g.act(0).cast(def.name, { pay: true }).cancel();
    g.expect.position(before);
  });
});

describe('"As an additional cost to cast this spell, sacrifice an artifact or creature."', () => {
  test('the choice spans both kinds, and a land is not offered', () => {
    const def = spell(
      'SYNTHETIC Parsed Offering Bolt',
      'Instant',
      '{1}{R}',
      ['R'],
      'As an additional cost to cast this spell, sacrifice an artifact or creature.\nThis spell deals 4 damage to any target.',
    );
    const g = scenario()
      .define(def)
      .seat(0)
      .hand(def.name)
      .battlefield('Mountain', { count: 2 })
      .battlefield('Sol Ring', BEARS)
      .seat(1)
      .build();
    g.act(0).cast(def.name, { targets: [{ player: 1 }], pay: true });
    const d = permanentChoice(g);
    expect(d.legal).toHaveLength(2);
    g.act(0).choosePermanents('Sol Ring');
    g.expect.zone('Sol Ring', 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.life(1, 36);
    g.expect.invariants();
  });
});

describe('"As an additional cost to cast this spell, sacrifice a land."', () => {
  test('a land is sacrificed after the mana, and the spell resolves', () => {
    const def = spell(
      'SYNTHETIC Parsed Land Offering',
      'Sorcery',
      '{2}{G}',
      ['G'],
      'As an additional cost to cast this spell, sacrifice a land.\nYou gain 6 life.',
    );
    const g = scenario()
      .define(def)
      .seat(0)
      .hand(def.name)
      .battlefield('Forest', { count: 4 })
      .seat(1)
      .build();
    g.act(0).cast(def.name, { pay: true });
    expect(permanentChoice(g).legal).toHaveLength(4);
    g.act(0).choosePermanents('Forest[1]');
    expect(g.find({ name: 'Forest', zone: 'battlefield' })).toHaveLength(3);
    g.passAll();
    g.expect.life(0, 46);
  });

  test('a card with no land is not castable', () => {
    const def = spell(
      'SYNTHETIC Parsed Land Offering',
      'Sorcery',
      '{G}',
      ['G'],
      'As an additional cost to cast this spell, sacrifice a land.\nYou gain 6 life.',
    );
    const g = scenario().define(def).seat(0).hand(def.name).battlefield(BEARS).seat(1).build();
    g.expect.illegal(0, { cast: def.name });
  });
});

describe('"As an additional cost to cast this spell, discard a card."', () => {
  const card = () =>
    spell(
      'SYNTHETIC Parsed Discard Burn',
      'Instant',
      '{R}',
      ['R'],
      'As an additional cost to cast this spell, discard a card.\nThis spell deals 3 damage to any target.',
    );

  test('the caster chooses the card to discard after the mana; the spell is never a candidate', () => {
    const def = card();
    const g = scenario()
      .define(def)
      .seat(0)
      .hand(def.name, 'Forest', 'Island')
      .battlefield('Mountain')
      .seat(1)
      .build();
    g.act(0).cast(def.name, { targets: [{ player: 1 }], pay: true });
    const d = cardsChoice(g);
    expect(d).toMatchObject({ purpose: 'discard', forCost: true, min: 1, max: 1 });
    expect(d.legal).toHaveLength(2);
    g.act(0).chooseCards('Island');
    g.expect.zone('Island', 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.life(1, 37);
    g.expect.invariants();
  });

  test('with no other card in hand the spell is not castable', () => {
    const def = card();
    const g = scenario().define(def).seat(0).hand(def.name).battlefield('Mountain').seat(1).build();
    g.expect.illegal(0, { cast: def.name });
  });
});

describe('"As an additional cost to cast this spell, pay 3 life." (SYNTHETIC wording of the life cost)', () => {
  test('the life is paid as the spell is cast', () => {
    const def = spell(
      'SYNTHETIC Parsed Blood Price',
      'Sorcery',
      '{B}',
      ['B'],
      'As an additional cost to cast this spell, pay 3 life.\nDraw two cards.',
    );
    const g = scenario()
      .define(def)
      .seat(0)
      .hand(def.name)
      .battlefield('Swamp')
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .build();
    g.act(0).cast(def.name, { pay: true });
    g.expect.life(0, 37);
    g.passAll();
    g.expect.handSize(0, 2);
  });
});

describe('"This spell costs {1} less to cast for each creature on the battlefield." (CR 113.6d, 118.7a)', () => {
  const card = () =>
    spell(
      'SYNTHETIC Parsed Wrath of Many',
      'Sorcery',
      '{8}{R}',
      ['R'],
      'This spell costs {1} less to cast for each creature on the battlefield.\nThis spell deals 13 damage to each creature.',
    );

  test('the creatures of both players reduce the generic mana, the colored mana stays', () => {
    const def = card();
    const g = scenario()
      .define(def)
      .seat(0)
      .hand(def.name)
      .battlefield('Mountain', { count: 5 })
      .battlefield(BEARS, ISAMARU)
      .seat(1)
      .battlefield(SPIDER, 'Serra Angel')
      .build();
    expect(costOf(g, def.name)).toEqual(['4', 'R']);
    g.expect.legal(0, { cast: def.name });
    g.act(0).cast(def.name, { pay: true });
    g.passAll();
    for (const name of [BEARS, ISAMARU]) g.expect.zone(name, 'graveyard', { seat: 0 });
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('one land short of the reduced cost: not castable', () => {
    const def = card();
    const g = scenario()
      .define(def)
      .seat(0)
      .hand(def.name)
      .battlefield('Mountain', { count: 4 })
      .battlefield(BEARS, ISAMARU)
      .seat(1)
      .battlefield(SPIDER, 'Serra Angel')
      .build();
    g.expect.illegal(0, { cast: def.name });
  });

  test('no creature at all: the full cost', () => {
    const def = card();
    const g = scenario().define(def).seat(0).hand(def.name).battlefield('Mountain').seat(1).build();
    expect(costOf(g, def.name)).toEqual(['8', 'R']);
  });
});

describe('"Artifact spells you cast cost {1} less to cast." (CR 118.7a, 601.2f, 604.2)', () => {
  const bench = () =>
    parsed(
      'SYNTHETIC Parsed Tinker Bench',
      'Enchantment',
      'Artifact spells you cast cost {1} less to cast.',
      { manaCost: '{2}', colors: [] },
    );

  test('an artifact costs {1} less, a creature costs what it did, and it is castable with no mana', () => {
    const def = bench();
    const g = scenario()
      .define(def)
      .seat(0)
      .hand('Sol Ring', BEARS)
      .battlefield(def.name)
      .seat(1)
      .hand('Sol Ring')
      .build();
    expect(costOf(g, 'Sol Ring')).toEqual([]);
    expect(costOf(g, BEARS)).toEqual(['1', 'G']);
    g.expect.legal(0, { cast: 'Sol Ring' });
    // The opponent's artifact is not "you cast".
    expect(costOf(g, 'Sol Ring', 1)).toEqual(['1']);
    g.act(0).cast('Sol Ring');
    g.expect.stack(['Sol Ring']);
  });

  test('without the permanent on the battlefield nothing is reduced', () => {
    const def = bench();
    const g = scenario().define(def).seat(0).hand('Sol Ring').seat(1).build();
    expect(costOf(g, 'Sol Ring')).toEqual(['1']);
  });
});

describe('"Instant and sorcery spells you cast cost {1} less to cast." (CR 118.7a)', () => {
  test('an instant and a sorcery are reduced in their generic mana, a creature is not', () => {
    const def = parsed(
      'SYNTHETIC Parsed Spell Chant',
      'Enchantment',
      'Instant and sorcery spells you cast cost {1} less to cast.',
      { manaCost: '{2}', colors: [] },
    );
    const g = scenario()
      .define(def)
      .seat(0)
      .hand(MURDER, DIVINATION, BOLT, BEARS)
      .battlefield(def.name)
      .seat(1)
      .build();
    // Only the generic mana is reduced (CR 118.7a): {1}{B}{B} is {B}{B}, {2}{U} is {1}{U}, and
    // {R} has none to lose.
    expect(costOf(g, MURDER)).toEqual(['B', 'B']);
    expect(costOf(g, DIVINATION)).toEqual(['1', 'U']);
    expect(costOf(g, BOLT)).toEqual(['R']);
    expect(costOf(g, BEARS)).toEqual(['1', 'G']);
  });
});

describe('"Noncreature spells you cast cost {1} less to cast." and a color or a subtype', () => {
  test('noncreature: an artifact and an instant are reduced, a creature is not', () => {
    const def = parsed(
      'SYNTHETIC Parsed Noncreature Chant',
      'Enchantment',
      'Noncreature spells you cast cost {1} less to cast.',
      { manaCost: '{2}', colors: [] },
    );
    const g = scenario()
      .define(def)
      .seat(0)
      .hand(MURDER, 'Sol Ring', BEARS)
      .battlefield(def.name)
      .seat(1)
      .build();
    expect(costOf(g, MURDER)).toEqual(['B', 'B']);
    expect(costOf(g, 'Sol Ring')).toEqual([]);
    expect(costOf(g, BEARS)).toEqual(['1', 'G']);
  });

  test('red: a red spell is reduced, a green creature is not', () => {
    const def = parsed(
      'SYNTHETIC Parsed Red Chant',
      'Enchantment',
      'Red spells you cast cost {1} less to cast.',
      { manaCost: '{2}', colors: [] },
    );
    const red = spell('SYNTHETIC Parsed Red Draw', 'Sorcery', '{2}{R}', ['R'], 'Draw a card.');
    const g = scenario()
      .define(def)
      .define(red)
      .seat(0)
      .hand(red.name, BEARS)
      .battlefield(def.name)
      .seat(1)
      .build();
    expect(costOf(g, red.name)).toEqual(['1', 'R']);
    expect(costOf(g, BEARS)).toEqual(['1', 'G']);
  });

  test('a creature type: a Dragon costs {2} less, a Bear does not', () => {
    const def = parsed(
      'SYNTHETIC Parsed Dragon Chant',
      'Enchantment',
      'Dragon spells you cast cost {2} less to cast.',
      { manaCost: '{2}', colors: [] },
    );
    const dragon = parsed('SYNTHETIC Parsed Wyrm', 'Creature — Dragon', '', {
      manaCost: '{4}{R}',
      power: '4',
      toughness: '4',
      colors: ['R'],
    });
    const g = scenario()
      .define(def)
      .define(dragon)
      .seat(0)
      .hand(dragon.name, BEARS)
      .battlefield(def.name)
      .seat(1)
      .build();
    expect(costOf(g, dragon.name)).toEqual(['2', 'R']);
    expect(costOf(g, BEARS)).toEqual(['1', 'G']);
  });

  test('counted: {1} less for each creature you control (SYNTHETIC wording)', () => {
    const def = parsed(
      'SYNTHETIC Parsed Crowd Chant',
      'Enchantment',
      'Creature spells you cast cost {1} less to cast for each creature you control.',
      { manaCost: '{2}', colors: [] },
    );
    const dragon = parsed('SYNTHETIC Parsed Big Wyrm', 'Creature — Dragon', '', {
      manaCost: '{5}{R}',
      power: '5',
      toughness: '5',
      colors: ['R'],
    });
    const g = scenario()
      .define(def)
      .define(dragon)
      .seat(0)
      .hand(dragon.name)
      .battlefield(BEARS, ISAMARU)
      .battlefield(def.name)
      .seat(1)
      .battlefield(SPIDER)
      .build();
    // Two creatures of mine (the enchantment is not one, the opponent's is not mine): {5}{R} is {3}{R}.
    expect(costOf(g, dragon.name)).toEqual(['3', 'R']);
  });
});

describe('"If you control a commander, you may cast this spell without paying its mana cost." (CR 118.9, 903.3d)', () => {
  const card = () =>
    spell(
      'SYNTHETIC Parsed Free Exile',
      'Sorcery',
      '{3}{B}',
      ['B'],
      'If you control a commander, you may cast this spell without paying its mana cost.\nExile target creature.',
    );

  test('with a commander on the battlefield and no lands the free cast is offered and works', () => {
    const def = card();
    const g = scenario()
      .define(def)
      .seat(0)
      .hand(def.name)
      .battlefield(BEARS, { commander: true })
      .seat(1)
      .battlefield(SPIDER)
      .build();
    g.expect.legal(0, { cast: def.name, alternative: 'free' });
    g.expect.illegal(0, { cast: def.name });
    g.act(0).cast(def.name, { alternative: 'free', targets: [SPIDER] });
    g.expect.pool(0, '');
    g.passAll();
    g.expect.zone(SPIDER, 'exile');
    g.expect.invariants();
  });

  test('without a commander the free cast is not offered', () => {
    const def = card();
    const g = scenario()
      .define(def)
      .seat(0)
      .hand(def.name)
      .battlefield(BEARS)
      .seat(1)
      .battlefield(SPIDER)
      .build();
    g.expect.illegal(0, { cast: def.name, alternative: 'free' });
  });

  test('a commander still in the command zone is not controlled', () => {
    const def = card();
    const g = scenario()
      .define(def)
      .seat(0)
      .hand(def.name)
      .commander('Isamaru, Hound of Konda')
      .seat(1)
      .battlefield(SPIDER)
      .build();
    g.expect.illegal(0, { cast: def.name, alternative: 'free' });
  });

  test('without the condition (SYNTHETIC wording) the free cast is always offered', () => {
    const def = spell(
      'SYNTHETIC Parsed Always Free',
      'Sorcery',
      '{5}',
      [],
      'You may cast this spell without paying its mana cost.\nExile target creature.',
    );
    const g = scenario().define(def).seat(0).hand(def.name).seat(1).battlefield(SPIDER).build();
    g.expect.legal(0, { cast: def.name, alternative: 'free' });
  });

  test('a free cast pays the additional cost of the same card', () => {
    const def = spell(
      'SYNTHETIC Parsed Free Offering',
      'Sorcery',
      '{4}{B}',
      ['B'],
      'As an additional cost to cast this spell, sacrifice a creature.\nIf you control a commander, you may cast this spell without paying its mana cost.\nExile target creature.',
    );
    const g = scenario()
      .define(def)
      .seat(0)
      .hand(def.name)
      .battlefield(BEARS, { commander: true })
      .battlefield(ISAMARU)
      .seat(1)
      .battlefield(SPIDER)
      .build();
    g.act(0).cast(def.name, { alternative: 'free', targets: [SPIDER] });
    // The cost still asks for a creature: the caster chooses one after the (nonexistent) mana.
    expect(permanentChoice(g)).toMatchObject({ purpose: 'sacrifice', forCost: true });
    g.act(0).choosePermanents(ISAMARU);
    g.expect.zone(ISAMARU, 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.zone(SPIDER, 'exile');
  });
});

describe('"Ward—Discard a card." (CR 702.21a)', () => {
  test('a spell that targets the creature is countered unless its controller discards a card', () => {
    const guard = creature('SYNTHETIC Parsed Tithe Guard', 'Ward—Discard a card.');
    const g = scenario()
      .define(guard)
      .seat(0)
      .hand(BOLT, 'Forest', 'Island')
      .battlefield('Mountain')
      .seat(1)
      .battlefield(guard.name)
      .build();
    g.act(0).cast(BOLT, { targets: [guard.name], pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    expect(cardsChoice(g)).toMatchObject({ purpose: 'discard', min: 1, max: 1 });
    g.act(0).chooseCards('Island');
    g.expect.zone('Island', 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.zone(guard.name, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('declining counters the spell and keeps the cards', () => {
    const guard = creature('SYNTHETIC Parsed Tithe Guard', 'Ward—Discard a card.');
    const g = scenario()
      .define(guard)
      .seat(0)
      .hand(BOLT, 'Forest', 'Island')
      .battlefield('Mountain')
      .seat(1)
      .battlefield(guard.name)
      .build();
    g.act(0).cast(BOLT, { targets: [guard.name], pay: true });
    g.passAll();
    g.act(0).decline();
    g.expect.zone(guard.name, 'battlefield', { seat: 1 });
    g.expect.handSize(0, 2);
  });
});

describe('"Discard a card: ~ gets +1/+1 until end of turn." (CR 602.2b, 701.9)', () => {
  test('the controller chooses the card as the cost is paid, and the creature grows', () => {
    const def = creature(
      'SYNTHETIC Parsed Scavenger',
      'Discard a card: ~ gets +1/+1 until end of turn.',
    );
    const g = scenario()
      .define(def)
      .seat(0)
      .hand('Forest', 'Island')
      .battlefield(def.name)
      .seat(1)
      .build();
    g.act(0).activate(def.name);
    expect(cardsChoice(g)).toMatchObject({ purpose: 'discard', forCost: true, min: 1, max: 1 });
    g.act(0).chooseCards('Forest');
    g.expect.zone('Forest', 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.pt(def.name, 3, 3);
    g.expect.invariants();
  });

  test('with an empty hand the ability is not offered', () => {
    const def = creature(
      'SYNTHETIC Parsed Scavenger',
      'Discard a card: ~ gets +1/+1 until end of turn.',
    );
    const g = scenario().define(def).seat(0).battlefield(def.name).seat(1).build();
    expect(g.act(0).try.activate(def.name).ok).toBe(false);
  });
});

describe('counted amounts (CR 608.2c, D-095)', () => {
  test('"Draw a card for each creature you control." counts when the spell resolves', () => {
    const def = spell(
      'SYNTHETIC Parsed Rally Draw',
      'Sorcery',
      '{1}{U}',
      ['U'],
      'Draw a card for each creature you control.',
    );
    const g = scenario()
      .define(def)
      .seat(0)
      .hand(def.name)
      .battlefield('Island', { count: 2 })
      .battlefield(BEARS, 'Llanowar Elves')
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .battlefield(SPIDER)
      .build();
    g.act(0).cast(def.name, { pay: true });
    g.passAll();
    g.expect.handSize(0, 2);
  });

  test('"You gain life equal to the number of lands you control."', () => {
    const def = spell(
      'SYNTHETIC Parsed Land Tithe',
      'Sorcery',
      '{G}',
      ['G'],
      'You gain life equal to the number of lands you control.',
    );
    const g = scenario()
      .define(def)
      .seat(0)
      .hand(def.name)
      .battlefield('Forest', { count: 3 })
      .seat(1)
      .battlefield('Mountain', { count: 5 })
      .build();
    g.act(0).cast(def.name, { pay: true });
    g.passAll();
    g.expect.life(0, 43);
  });

  test('"~ deals damage to target player equal to the number of creatures on the battlefield."', () => {
    const def = spell(
      'SYNTHETIC Parsed Crowd Burn',
      'Sorcery',
      '{2}{R}',
      ['R'],
      '~ deals damage to target player equal to the number of creatures on the battlefield.',
    );
    const g = scenario()
      .define(def)
      .seat(0)
      .hand(def.name)
      .battlefield('Mountain', { count: 3 })
      .battlefield(BEARS)
      .seat(1)
      .battlefield(SPIDER, 'Llanowar Elves')
      .build();
    g.act(0).cast(def.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 37);
  });

  test('"Draw a card, then you lose life equal to the number of cards in your hand." counts the card drawn', () => {
    const def = parsed(
      'SYNTHETIC Parsed Arena',
      'Artifact',
      '{1}{B}{B}, {T}: Draw a card, then you lose life equal to the number of cards in your hand.',
      { manaCost: '{2}', colors: [] },
    );
    const g = scenario()
      .define(def)
      .seat(0)
      .hand('Forest', 'Island')
      .battlefield(def.name, 'Swamp', 'Swamp', 'Swamp')
      .library('Plains', 'Plains')
      .seat(1)
      .build();
    g.act(0).activate(def.name, { pay: true });
    g.passAll();
    // Two cards in hand and the one drawn: three.
    g.expect.handSize(0, 3);
    g.expect.life(0, 37);
  });
});
