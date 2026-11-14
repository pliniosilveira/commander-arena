// Parsed text is only worth something if the engine runs it as written (stage P30). These tests import SYNTHETIC cards through the grammar
// (never through a fixture), define them in an engine scenario and play them through applyAction: the recursion slice of D-135
// (ENGINE_VERSION 30). Returning a creature card with a follow-up that reads its creature type, "you may ... if you do", a reflexive
// trigger, sacrificing any number of permanents and drawing that many cards, a library move "third from the top" after a death or an
// exile, Gift on a permanent and on an instant, a permission to cast a card from the graveyard, an ability of the card that works from
// the graveyard with a cheaper cost, a land whose trigger fires only if it entered untapped, and life paid equal to a count. Every card
// name starts with "SYNTHETIC"; the wording of each text is that of the real cards of the golden corpus (names replaced by ~) or a
// SYNTHETIC variant that changes the creature type only. No real card's text is claimed; the creatures that are not defined here are
// the engine's own test cards.
import type { CardDefinition } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const ZOMBIE = 'SYNTHETIC Plain Zombie'; // 2/2 Zombie, {1}{B}
const GOBLIN = 'SYNTHETIC Pitch Reunion'; // 1/1 Goblin
const ANGEL = 'SYNTHETIC Costly Angel'; // 4/4 Angel
const GIANT = 'SYNTHETIC Echo Giant'; // 4/4
const BEARS = 'Grizzly Bears'; // 2/2
const RING = 'Sol Ring';
const MURDER = 'Murder';
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

function main(mine: (b: Builder) => Builder, theirs: (b: Builder) => Builder = (b) => b) {
  const a = mine(
    scenario()
      .seat(0)
      .life(20)
      .library(...FILLER),
  );
  return theirs(
    a
      .seat(1)
      .life(20)
      .library(...FILLER),
  )
    .at('precombatMain')
    .build();
}

const resolveTop = (g: ScenarioGame): void => {
  g.pass();
  g.pass();
};

function cardName(g: ScenarioGame, id: string): string {
  const obj = g.state.objects[id as keyof typeof g.state.objects];
  if (obj?.card == null) return '?';
  const card = g.state.cards[obj.card];
  return card === undefined ? '?' : (g.state.definitions[card.definition]?.name ?? '?');
}
const handNames = (g: ScenarioGame, seat: 0 | 1 = 0) =>
  g.state.seats[seat]?.hand.map((id) => cardName(g, id)) ?? [];
const libraryNames = (g: ScenarioGame, seat: 0 | 1 = 0) =>
  g.state.seats[seat]?.library.map((id) => cardName(g, id)) ?? [];

const TYPES = [
  { type: 'Zombie', card: ZOMBIE, other: BEARS },
  { type: 'Goblin', card: GOBLIN, other: BEARS },
  { type: 'Angel', card: ANGEL, other: ZOMBIE },
] as const;

// ---- "Return target creature card from your graveyard to your hand. If it's a Zombie card, draw a card." for every creature type

describe('a condition on the card that was returned: the same parsed text over three creature types (CR 608.2c, 113.7a)', () => {
  const recalls = TYPES.map(({ type }) =>
    parsed(
      `SYNTHETIC Parsed Recall ${type}`,
      'Sorcery',
      `Return target creature card from your graveyard to your hand. If it's ${/^[AEIOU]/.test(type) ? 'an' : 'a'} ${type} card, draw a card.`,
      { manaCost: '{1}{B}', colors: ['B'] },
    ),
  );

  for (const [i, { type, card, other }] of TYPES.entries()) {
    const recall = recalls[i] as CardDefinition;

    test(`${type}: ${type} card returns and a card is drawn`, () => {
      const g = main((b) =>
        b.define(recall).hand(recall.name).graveyard(card).battlefield('Swamp', { count: 2 }),
      );
      g.act(0).cast(recall.name, { targets: [card], pay: true });
      g.passAll();
      expect(handNames(g)).toContain(card);
      g.expect.handSize(0, 2);
      g.expect.invariants();
    });

    test(`${type}: a creature card of another type returns and draws nothing`, () => {
      const g = main((b) =>
        b.define(recall).hand(recall.name).graveyard(other).battlefield('Swamp', { count: 2 }),
      );
      g.act(0).cast(recall.name, { targets: [other], pay: true });
      g.passAll();
      expect(handNames(g)).toEqual([other]);
    });
  }

  test('a card that is not a creature card cannot be targeted', () => {
    const recall = recalls[0] as CardDefinition;
    const g = main((b) =>
      b
        .define(recall)
        .hand(recall.name)
        .graveyard('Lightning Bolt')
        .battlefield('Swamp', { count: 2 }),
    );
    expect(() => g.act(0).cast(recall.name, { targets: ['Lightning Bolt'], pay: true })).toThrow();
  });
});

describe('"Return target creature card from your graveyard to the battlefield. If it\'s an Angel, put two +1/+1 counters on it."', () => {
  const raise = (type: string) =>
    parsed(
      `SYNTHETIC Parsed Raise ${type}`,
      'Sorcery',
      `Return target creature card from your graveyard to the battlefield. If it's ${/^[AEIOU]/.test(type) ? 'an' : 'a'} ${type}, put two +1/+1 counters on it.`,
      { manaCost: '{2}{B}', colors: ['B'] },
    );

  for (const { type, card, other } of TYPES) {
    test(`${type}: it enters with two counters, another type with none`, () => {
      const spell = raise(type);
      const g = main((b) =>
        b.define(spell).hand(spell.name).graveyard(card).battlefield('Swamp', { count: 3 }),
      );
      g.act(0).cast(spell.name, { targets: [card], pay: true });
      g.passAll();
      g.expect.zone(card, 'battlefield', { seat: 0 });
      g.expect.counters(card, { '+1/+1': 2 });

      const none = main((b) =>
        b.define(spell).hand(spell.name).graveyard(other).battlefield('Swamp', { count: 3 }),
      );
      none.act(0).cast(spell.name, { targets: [other], pay: true });
      none.passAll();
      none.expect.zone(other, 'battlefield', { seat: 0 });
      none.expect.counters(other, {});
    });
  }
});

// ---- "you may discard a card. If you do, draw a card"

describe('"you may discard a card. If you do, draw two cards" (Bitter Reunion) and the cast trigger of Hazoret\'s Monument', () => {
  const reunion = parsed(
    'SYNTHETIC Parsed Reunion',
    'Creature — Goblin',
    'When ~ enters, you may discard a card. If you do, draw two cards.',
    { manaCost: '{1}{R}', power: '1', toughness: '1', colors: ['R'] },
  );
  const monument = parsed(
    'SYNTHETIC Parsed Monument',
    'Artifact',
    'Whenever you cast a creature spell, you may discard a card. If you do, draw a card.',
    { manaCost: '{2}' },
  );

  test('discard, then draw: the discard is chosen, the draw follows', () => {
    const g = main((b) =>
      b
        .define(reunion)
        .hand(reunion.name, BEARS, 'Llanowar Elves')
        .battlefield('Mountain', { count: 2 }),
    );
    g.act(0).cast(reunion.name, { pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.act(0).chooseCards(BEARS);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.handSize(0, 3);
    g.expect.invariants();
  });

  test('declining: nothing is discarded and nothing is drawn', () => {
    const g = main((b) =>
      b.define(reunion).hand(reunion.name, BEARS).battlefield('Mountain', { count: 2 }),
    );
    g.act(0).cast(reunion.name, { pay: true });
    g.passAll();
    g.act(0).decline();
    g.expect.handSize(0, 1);
  });

  test('an empty hand: yes was said, nothing was discarded, so nothing is drawn', () => {
    const g = main((b) =>
      b.define(reunion).hand(reunion.name).battlefield('Mountain', { count: 2 }),
    );
    g.act(0).cast(reunion.name, { pay: true });
    g.passAll();
    g.act(0).accept();
    g.expect.handSize(0, 0);
  });

  test('a trigger of a cast spell', () => {
    const g = main((b) =>
      b
        .define(monument)
        .battlefield(monument.name)
        .hand(BEARS, 'Llanowar Elves', 'Island')
        .battlefield('Forest', { count: 3 }),
    );
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.act(0).accept();
    g.act(0).chooseCards('Llanowar Elves');
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 0 });
    g.expect.handSize(0, 2);
  });
});

// ---- Undead Butler: "you may exile it. When you do, return target creature card from your graveyard to your hand."

describe('"When ~ dies, you may exile it. When you do, return target creature card from your graveyard to your hand."', () => {
  for (const type of ['Zombie', 'Goblin']) {
    const butler = parsed(
      `SYNTHETIC Parsed Butler ${type}`,
      `Creature — ${type}`,
      'When ~ dies, you may exile it. When you do, return target creature card from your graveyard to your hand.',
      { manaCost: '{1}{B}', power: '1', toughness: '2', colors: ['B'] },
    );
    const dies = (extra: (b: Builder) => Builder = (b) => b) =>
      main((b) =>
        extra(
          b.define(butler).battlefield(butler.name).hand(MURDER).battlefield('Swamp', { count: 3 }),
        ),
      );

    test(`${type}: it dies, is exiled, and the reflexive ability returns a creature card`, () => {
      const g = dies((b) => b.graveyard(BEARS));
      g.act(0).cast(MURDER, { targets: [butler.name], pay: true });
      g.passAll();
      g.act(0).accept();
      g.expect.zone(butler.name, 'exile', { seat: 0 });
      g.expect.stack([`${butler.name} (ability)`]);
      resolveTop(g);
      g.expect.zone(BEARS, 'hand', { seat: 0 });
      g.expect.invariants();
    });

    test(`${type}: declining exiles nothing and creates no ability`, () => {
      const g = dies((b) => b.graveyard(BEARS));
      g.act(0).cast(MURDER, { targets: [butler.name], pay: true });
      g.passAll();
      g.act(0).decline();
      g.expect.stack([]);
      g.expect.zone(butler.name, 'graveyard', { seat: 0 });
    });
  }

  test('the exiled creature is not in the graveyard to be returned: with no other creature card the ability is removed', () => {
    const butler = parsed(
      'SYNTHETIC Parsed Butler Alone',
      'Creature — Zombie',
      'When ~ dies, you may exile it. When you do, return target creature card from your graveyard to your hand.',
      { manaCost: '{1}{B}', power: '1', toughness: '2', colors: ['B'] },
    );
    const g = main((b) =>
      b.define(butler).battlefield(butler.name).hand(MURDER).battlefield('Swamp', { count: 3 }),
    );
    g.act(0).cast(MURDER, { targets: [butler.name], pay: true });
    g.passAll();
    g.act(0).accept();
    g.expect.stack([]);
    expect(handNames(g)).toEqual([]);
  });
});

// ---- God-Eternal Bontu

describe('"sacrifice any number of other permanents, then draw that many cards" and "put her into her owner\'s library third from the top"', () => {
  const god = parsed(
    'SYNTHETIC Parsed God',
    'Legendary Creature — Zombie God',
    "Menace\nWhen ~ enters, sacrifice any number of other permanents, then draw that many cards.\nWhen ~ dies or is put into exile from the battlefield, you may put her into her owner's library third from the top.",
    { manaCost: '{3}{B}{B}', power: '5', toughness: '6', colors: ['B'] },
  );

  test('the player chooses which and how many; the draw counts them', () => {
    const g = main((b) =>
      b
        .define(god)
        .hand(god.name)
        .battlefield('Swamp', { count: 5 })
        .battlefield(BEARS)
        .battlefield('Llanowar Elves'),
    );
    g.act(0).cast(god.name, { pay: true });
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents(BEARS, 'Llanowar Elves', 'Swamp[0]');
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.handSize(0, 3);
    g.expect.zone(god.name, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('none is a legal choice, and draws nothing', () => {
    const g = main((b) =>
      b.define(god).hand(god.name).battlefield('Swamp', { count: 5 }).battlefield(BEARS),
    );
    g.act(0).cast(god.name, { pay: true });
    g.passAll();
    g.act(0).choosePermanents();
    g.expect.handSize(0, 0);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  const dies = (library: readonly string[] = ['Island', 'Forest', 'Plains', 'Swamp']) => {
    const b = scenario()
      .seat(0)
      .life(20)
      .define(god)
      .battlefield(god.name)
      .hand(MURDER)
      .battlefield('Swamp', { count: 3 })
      .library(...library);
    return b
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
  };

  test("it dies and may be put third from the top of its owner's library", () => {
    const g = dies();
    g.act(0).cast(MURDER, { targets: [god.name], pay: true });
    g.passAll();
    g.act(0).accept();
    expect(libraryNames(g)).toEqual(['Island', 'Forest', god.name, 'Plains', 'Swamp']);
    g.expect.noObject(god.name, { zone: 'graveyard' });
    g.expect.invariants();
  });

  test('declining leaves it in the graveyard', () => {
    const g = dies();
    g.act(0).cast(MURDER, { targets: [god.name], pay: true });
    g.passAll();
    g.act(0).decline();
    g.expect.zone(god.name, 'graveyard', { seat: 0 });
    expect(libraryNames(g)).toEqual(['Island', 'Forest', 'Plains', 'Swamp']);
  });

  test('a library of fewer than three cards: it goes on the bottom (CR 401.7)', () => {
    const g = dies(['Island']);
    g.act(0).cast(MURDER, { targets: [god.name], pay: true });
    g.passAll();
    g.act(0).accept();
    expect(libraryNames(g)).toEqual(['Island', god.name]);
  });
});

// ---- Gift

describe('Gift a card on a permanent and on an instant (CR 702.174)', () => {
  const ranger = parsed(
    'SYNTHETIC Parsed Ranger',
    'Creature — Dinosaur Archer',
    'Gift a card\nReach\nWhen ~ enters, if the gift was promised, destroy target artifact or enchantment an opponent controls.',
    { manaCost: '{1}{G}{G}', power: '4', toughness: '4', colors: ['G'] },
  );
  const edict = parsed(
    'SYNTHETIC Parsed Edict',
    'Instant',
    'Gift a card\nTarget opponent sacrifices a creature with the greatest power among creatures they control. If the gift was promised, return target creature card from your graveyard to your hand.',
    { manaCost: '{1}{B}{B}', colors: ['B'] },
  );

  test('promised: the opponent draws as it enters and the artifact is destroyed', () => {
    const g = main(
      (b) => b.define(ranger).hand(ranger.name).battlefield('Forest', { count: 3 }),
      (b) => b.battlefield(RING),
    );
    g.act(0).cast(ranger.name, { gift: true, pay: true });
    g.passAll();
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    g.expect.handSize(1, 1);
    g.expect.zone(RING, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('not promised: nothing is given and the destroy trigger never exists', () => {
    const g = main(
      (b) => b.define(ranger).hand(ranger.name).battlefield('Forest', { count: 3 }),
      (b) => b.battlefield(RING),
    );
    g.act(0).cast(ranger.name, { gift: false, pay: true });
    g.passAll();
    g.expect.stack([]);
    g.expect.handSize(1, 0);
    g.expect.zone(RING, 'battlefield', { seat: 1 });
  });

  test('an instant: the opponent draws first, then sacrifices the creature with the greatest power, and the card returns', () => {
    const g = main(
      (b) => b.define(edict).hand(edict.name).graveyard(ZOMBIE).battlefield('Swamp', { count: 3 }),
      (b) => b.battlefield(BEARS).battlefield(ANGEL),
    );
    const mark = g.mark();
    g.act(0).cast(edict.name, { gift: true, targets: [{ player: 1 }, ZOMBIE], pay: true });
    g.passAll();
    g.expect.zone(ANGEL, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.zone(ZOMBIE, 'hand', { seat: 0 });
    g.expect.handSize(1, 1);
    const order = g
      .eventsSince(mark)
      .flatMap((e) =>
        e.kind === 'cardDrawn' ? ['draw'] : e.kind === 'sacrificed' ? ['sacrifice'] : [],
      );
    expect(order).toEqual(['draw', 'sacrifice']);
  });

  test('an instant, not promised: only the opponent is targeted and the card stays in the graveyard', () => {
    const g = main(
      (b) => b.define(edict).hand(edict.name).graveyard(ZOMBIE).battlefield('Swamp', { count: 3 }),
      (b) => b.battlefield(ANGEL),
    );
    g.act(0).cast(edict.name, { gift: false, targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.zone(ANGEL, 'graveyard', { seat: 1 });
    g.expect.zone(ZOMBIE, 'graveyard', { seat: 0 });
    g.expect.handSize(1, 0);
  });

  test('tied for the greatest power: the opponent chooses among the tied creatures only', () => {
    const g = main(
      (b) => b.define(edict).hand(edict.name).battlefield('Swamp', { count: 3 }),
      (b) => b.battlefield(BEARS).battlefield(ANGEL).battlefield(GIANT),
    );
    g.act(0).cast(edict.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.pending('choosePermanent', 1);
    g.act(1).choosePermanents(GIANT);
    g.expect.zone(GIANT, 'graveyard', { seat: 1 });
    g.expect.zone(ANGEL, 'battlefield', { seat: 1 });
  });
});

// ---- Zul Ashur: a permission to cast from the graveyard

describe('"{T}: You may cast target <type> creature card from your graveyard this turn."', () => {
  for (const { type, card, other } of TYPES) {
    const chanter = parsed(
      `SYNTHETIC Parsed Chanter ${type}`,
      'Creature — Warlock',
      `{T}: You may cast target ${type} creature card from your graveyard this turn.`,
      { manaCost: '{1}{B}', power: '2', toughness: '2', colors: ['B'] },
    );

    test(`${type}: after the ability resolves the card can be cast from the graveyard and enters`, () => {
      const g = main((b) =>
        b
          .define(chanter)
          .battlefield(chanter.name)
          .graveyard(card)
          .graveyard(other)
          .battlefield('Swamp', { count: 3 })
          .battlefield('Mountain', { count: 2 })
          .battlefield('Plains', { count: 2 }),
      );
      g.act(0).activate(chanter.name, { targets: [card] });
      g.passAll();
      g.expect.tapped(chanter.name);
      g.act(0).cast(card, { pay: true });
      g.passAll();
      g.expect.zone(card, 'battlefield', { seat: 0 });
      g.expect.noObject(card, { zone: 'graveyard' });
      g.expect.invariants();
    });
  }

  test('a card of another type cannot even be targeted', () => {
    const chanter = parsed(
      'SYNTHETIC Parsed Chanter Narrow',
      'Creature — Warlock',
      '{T}: You may cast target Zombie creature card from your graveyard this turn.',
      { manaCost: '{1}{B}', power: '2', toughness: '2', colors: ['B'] },
    );
    const g = main((b) =>
      b.define(chanter).battlefield(chanter.name).graveyard(BEARS).battlefield('Swamp'),
    );
    expect(() => g.act(0).activate(chanter.name, { targets: [BEARS] })).toThrow();
  });
});

describe('the same permission as a spell, for an instant or a sorcery card', () => {
  const replay = parsed(
    'SYNTHETIC Parsed Replay',
    'Sorcery',
    'You may cast target instant or sorcery card from your graveyard this turn.',
    { manaCost: '{1}{R}', colors: ['R'] },
  );

  test('the instant is cast from the graveyard once the spell resolved, for its ordinary cost', () => {
    const g = main((b) =>
      b
        .define(replay)
        .hand(replay.name)
        .graveyard('Lightning Bolt')
        .battlefield('Mountain', { count: 3 }),
    );
    g.act(0).cast(replay.name, { targets: ['Lightning Bolt'], pay: true });
    g.passAll();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 17);
    g.expect.invariants();
  });

  test('a creature card cannot be targeted', () => {
    const g = main((b) =>
      b.define(replay).hand(replay.name).graveyard(BEARS).battlefield('Mountain', { count: 3 }),
    );
    expect(() => g.act(0).cast(replay.name, { targets: [BEARS], pay: true })).toThrow();
  });
});

// ---- Razorlash Transmogrant: an ability from the graveyard with a cheaper cost

describe('"{4}{B}{B}: Return this card from your graveyard to the battlefield with a +1/+1 counter on it. This ability costs {4} less ..."', () => {
  for (const type of ['Zombie', 'Dinosaur']) {
    const revenant = parsed(
      `SYNTHETIC Parsed Revenant ${type}`,
      `Artifact Creature — ${type}`,
      "~ can't block.\n{4}{B}{B}: Return this card from your graveyard to the battlefield with a +1/+1 counter on it. This ability costs {4} less to activate if an opponent controls four or more nonbasic lands.",
      { manaCost: '{2}', power: '3', toughness: '1' },
    );

    test(`${type}: paid in full from the graveyard, it returns with a counter`, () => {
      const g = main((b) =>
        b.define(revenant).graveyard(revenant.name).battlefield('Swamp', { count: 6 }),
      );
      g.act(0).activate(revenant.name, { pay: true });
      g.passAll();
      g.expect.zone(revenant.name, 'battlefield', { seat: 0 });
      g.expect.counters(revenant.name, { '+1/+1': 1 });
      g.expect.pt(revenant.name, 4, 2);
      g.expect.invariants();
    });

    test(`${type}: with four nonbasic lands under an opponent's control it costs {B}{B}`, () => {
      const g = main(
        (b) => b.define(revenant).graveyard(revenant.name).battlefield('Swamp', { count: 2 }),
        (b) => b.battlefield('Command Tower', { count: 4 }),
      );
      g.act(0).activate(revenant.name, { pay: true });
      g.passAll();
      g.expect.zone(revenant.name, 'battlefield', { seat: 0 });
      g.expect.counters(revenant.name, { '+1/+1': 1 });
    });

    test(`${type}: with three nonbasic lands it is not reduced: two Swamps are not enough`, () => {
      const g = main(
        (b) => b.define(revenant).graveyard(revenant.name).battlefield('Swamp', { count: 2 }),
        (b) => b.battlefield('Command Tower', { count: 3 }),
      );
      expect(g.legalActions(0).some((a) => a.kind === 'activate')).toBe(false);
    });
  }
});

// ---- Witch's Cottage and War Room

describe('"When ~ enters untapped, you may put target creature card from your graveyard on top of your library."', () => {
  const cottage = parsed(
    'SYNTHETIC Parsed Cottage',
    'Land — Swamp',
    'This land enters tapped unless you control three or more other Swamps.\nWhen ~ enters untapped, you may put target creature card from your graveyard on top of your library.',
  );

  test('three other Swamps: it enters untapped, the trigger fires and puts the creature card on top', () => {
    const g = main((b) =>
      b.define(cottage).hand(cottage.name).graveyard(BEARS).battlefield('Swamp', { count: 3 }),
    );
    g.act(0).playLand(cottage.name);
    g.expect.tapped(cottage.name, false);
    g.expect.stack([`${cottage.name} (ability)`]);
    g.passAll();
    g.act(0).accept();
    expect(libraryNames(g)[0]).toBe(BEARS);
    g.expect.noObject(BEARS, { zone: 'graveyard' });
  });

  test('fewer than three: it enters tapped and the trigger never fires', () => {
    const g = main((b) =>
      b.define(cottage).hand(cottage.name).graveyard(BEARS).battlefield('Swamp', { count: 2 }),
    );
    g.act(0).playLand(cottage.name);
    g.expect.tapped(cottage.name, true);
    g.expect.stack([]);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });
});

describe('"{3}, {T}, Pay life equal to the number of colors in your commanders\' color identity: Draw a card."', () => {
  const room = parsed(
    'SYNTHETIC Parsed War Room',
    'Land',
    "{T}: Add {C}.\n{3}, {T}, Pay life equal to the number of colors in your commanders' color identity: Draw a card.",
  );

  test('a commander of two colors: two life, a card', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .define(room)
      .commander('SYNTHETIC Czar of Two Colors')
      .battlefield(room.name)
      .battlefield('Plains', { count: 3 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).activate(room.name, { pay: true });
    g.passAll();
    g.expect.life(0, 18);
    g.expect.handSize(0, 1);
    g.expect.tapped(room.name);
  });

  test('no commander: no life is paid and the ability still works', () => {
    const g = main((b) =>
      b.define(room).battlefield(room.name).battlefield('Plains', { count: 3 }),
    );
    g.act(0).activate(room.name, { pay: true });
    g.passAll();
    g.expect.life(0, 20);
    g.expect.handSize(0, 1);
  });
});
