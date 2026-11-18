// Batch 1 of the unsupported cards among the 1,000 most popular Commander cards (issue 279), run as written. Each group imports SYNTHETIC cards through the grammar (never through a
// fixture), defines them in an engine scenario and plays them through applyAction. Every card name starts with "SYNTHETIC"; the wording of each text is that of the real card, taken
// from the card data of the issue's comment. No real card's text is claimed beyond that.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

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
    .at('precombatMain', { active: 0 })
    .build();
}

// ---- Oran-Rief, the Vastwood: "Put a +1/+1 counter on each green creature that entered this turn." (CR 400.7, 122.1).

const ORAN = parsed(
  'SYNTHETIC Parsed Oran',
  'Land',
  'This land enters tapped.\n{T}: Add {G}.\n{T}: Put a +1/+1 counter on each green creature that entered this turn.',
);
const GREEN_BEAR = parsed('SYNTHETIC Parsed Green Bear', 'Creature — Bear', '', {
  manaCost: '{G}',
  colors: ['G'],
  power: '2',
  toughness: '2',
});
const RED_BEAR = parsed('SYNTHETIC Parsed Red Bear', 'Creature — Bear', '', {
  manaCost: '{R}',
  colors: ['R'],
  power: '2',
  toughness: '2',
});
const OLD_GREEN = parsed('SYNTHETIC Parsed Old Green', 'Creature — Bear', '', {
  manaCost: '{G}',
  colors: ['G'],
  power: '2',
  toughness: '2',
});

describe('"Put a +1/+1 counter on each green creature that entered this turn." (CR 400.7)', () => {
  const start = () =>
    main((b) =>
      b
        .define(ORAN)
        .define(GREEN_BEAR)
        .define(RED_BEAR)
        .define(OLD_GREEN)
        .hand(GREEN_BEAR.name, RED_BEAR.name)
        .battlefield(ORAN.name, { tapped: false })
        .battlefield(OLD_GREEN.name, 'Forest', 'Mountain'),
    );

  test('only the green creatures that entered this turn get a counter', () => {
    const g = start();
    // The two spells are paid from the basic lands: the land with the ability must stay untapped.
    g.act(0).tapForMana('Forest');
    g.act(0).cast(GREEN_BEAR.name, { pay: true });
    g.passAll();
    g.act(0).tapForMana('Mountain');
    g.act(0).cast(RED_BEAR.name, { pay: true });
    g.passAll();
    g.act(0).activate(ORAN.name);
    g.passAll();
    g.expect.pt(GREEN_BEAR.name, 3, 3);
    g.expect.pt(RED_BEAR.name, 2, 2);
    g.expect.pt(OLD_GREEN.name, 2, 2);
    g.expect.invariants();
  });
});

// ---- Windbrisk Heights: "{W}, {T}: You may play the exiled card without paying its mana cost if you attacked with three or more creatures this turn." (CR 508.1, 702.75a).

const WINDBRISK = parsed(
  'SYNTHETIC Parsed Windbrisk',
  'Land',
  'Hideaway 4 (When this land enters, look at the top four cards of your library, exile one face down, then put the rest on the bottom in a random order.)\nThis land enters tapped.\n{T}: Add {W}.\n{W}, {T}: You may play the exiled card without paying its mana cost if you attacked with three or more creatures this turn.',
);

describe('"... if you attacked with three or more creatures this turn" (CR 508.1)', () => {
  // The land enters tapped: it is played, then used in the controller's next turn, after a combat in which some creatures attack.
  const start = () => {
    const g = scenario()
      .seat(0)
      .hand(WINDBRISK.name)
      .battlefield('Plains', 'Grizzly Bears', 'Grizzly Bears', 'Grizzly Bears')
      .library('Giant Spider', 'Serra Angel', 'Swamp', 'Plains', 'Island')
      .seat(1)
      .library('Island', 'Island', 'Island', 'Island')
      .at('precombatMain', { active: 0 })
      .define(WINDBRISK)
      .build();
    g.act(0).playLand(WINDBRISK.name);
    g.passAll();
    g.act(0).chooseCards('Giant Spider');
    g.advanceTo('precombatMain', { turn: 'next' }).advanceTo('precombatMain', { turn: 'next' });
    return g;
  };

  test('with three attackers the hidden card is played', () => {
    const g = start();
    g.advanceTo('declareAttackers');
    g.act(0).attack(['Grizzly Bears[0]', 'Grizzly Bears[1]', 'Grizzly Bears[2]']);
    g.advanceTo('postcombatMain');
    g.act(0).activate(WINDBRISK.name, { pay: true });
    g.passAll();
    g.act(0).chooseCards('Giant Spider');
    g.passAll();
    g.expect.zone('Giant Spider', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('with two attackers the card stays hidden', () => {
    const g = start();
    g.advanceTo('declareAttackers');
    g.act(0).attack(['Grizzly Bears[0]', 'Grizzly Bears[1]']);
    g.advanceTo('postcombatMain');
    g.act(0).activate(WINDBRISK.name, { pay: true });
    g.passAll();
    // The condition is false: the effect does nothing, so no card is offered to be played.
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.zone('Giant Spider', 'exile', { seat: 0 });
    g.expect.invariants();
  });

  test('with no attack the card stays hidden', () => {
    const g = start();
    g.act(0).activate(WINDBRISK.name, { pay: true });
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.zone('Giant Spider', 'exile', { seat: 0 });
  });
});

// ---- Inspiring Call: "Draw a card for each creature you control with a +1/+1 counter on it. Those creatures gain indestructible until end of turn." (CR 608.2c, 611.2c, 702.12).

const CALL = parsed(
  'SYNTHETIC Parsed Call',
  'Instant',
  'Draw a card for each creature you control with a +1/+1 counter on it. Those creatures gain indestructible until end of turn. (Damage and effects that say "destroy" don\'t destroy them.)',
  { manaCost: '{2}{G}', colors: ['G'] },
);

describe('"Those creatures gain indestructible" after a count of creatures (CR 608.2c)', () => {
  test('a card for each creature with a counter, and only those creatures are indestructible', () => {
    const g = main((b) =>
      b
        .define(CALL)
        .hand(CALL.name)
        .battlefield('Forest', 'Forest', 'Forest')
        .battlefield('Grizzly Bears', { counters: { '+1/+1': 1 } })
        .battlefield('Giant Spider', { counters: { '+1/+1': 2 } })
        .battlefield('Serra Angel'),
    );
    const before = g.view(0).seats[0]?.handCount ?? 0;
    g.act(0).cast(CALL.name, { pay: true });
    g.passAll();
    // The spell left the hand and two cards were drawn.
    expect(g.view(0).seats[0]?.handCount).toBe(before - 1 + 2);
    g.expect.derived('Grizzly Bears', { keywords: ['indestructible'] });
    g.expect.derived('Giant Spider', { keywords: ['reach', 'indestructible'] });
    g.expect.derived('Serra Angel', { keywords: ['flying', 'vigilance'] });
    g.expect.invariants();
  });

  test('with no creature that has a counter nothing is drawn and nothing is granted', () => {
    const g = main((b) =>
      b
        .define(CALL)
        .hand(CALL.name)
        .battlefield('Forest', 'Forest', 'Forest')
        .battlefield('Grizzly Bears'),
    );
    g.act(0).cast(CALL.name, { pay: true });
    g.passAll();
    expect(g.view(0).seats[0]?.handCount).toBe(0);
    g.expect.derived('Grizzly Bears', { keywords: [] });
  });
});

// ---- Windfall: "Each player discards their hand, then draws cards equal to the greatest number of cards a player discarded this way." (CR 701.9a, 608.2c).

const WINDFALL = parsed(
  'SYNTHETIC Parsed Windfall',
  'Sorcery',
  'Each player discards their hand, then draws cards equal to the greatest number of cards a player discarded this way.',
  { manaCost: '{2}{U}', colors: ['U'] },
);

describe('"draws cards equal to the greatest number of cards a player discarded this way" (CR 608.2c)', () => {
  const start = (mine: number, theirs: number) => {
    const cards = (n: number) => Array.from({ length: n }, () => 'Plains');
    return main(
      (b) =>
        b
          .define(WINDFALL)
          .hand(WINDFALL.name, ...cards(mine))
          .battlefield('Island', 'Island', 'Island')
          .library(...Array.from({ length: 10 }, () => 'Forest')),
      (b) => b.hand(...cards(theirs)).library(...Array.from({ length: 10 }, () => 'Forest')),
    );
  };

  test('every player draws as many as the most any one of them discarded', () => {
    // The caster has 3 other cards, the opponent 5: the greatest number discarded is 5, and both draw 5.
    const g = start(3, 5);
    g.act(0).cast(WINDFALL.name, { pay: true });
    g.passAll();
    expect(g.view(0).seats[0]?.handCount).toBe(5);
    expect(g.view(1).seats[1]?.handCount).toBe(5);
    g.expect.invariants();
  });

  test('the number is the most one player discarded, not the total', () => {
    const g = start(4, 2);
    g.act(0).cast(WINDFALL.name, { pay: true });
    g.passAll();
    expect(g.view(0).seats[0]?.handCount).toBe(4);
    expect(g.view(1).seats[1]?.handCount).toBe(4);
  });

  test('when nobody has a card to discard nobody draws', () => {
    const g = start(0, 0);
    g.act(0).cast(WINDFALL.name, { pay: true });
    g.passAll();
    expect(g.view(0).seats[0]?.handCount).toBe(0);
    expect(g.view(1).seats[1]?.handCount).toBe(0);
  });
});

// ---- Rakdos Charm: "Each creature deals 1 damage to its controller." (CR 120.3, 109.4, 608.2h).

const CHARM_B = parsed(
  'SYNTHETIC Parsed Rakdos Charm',
  'Instant',
  "Choose one \u2014\n\u2022 Exile target player's graveyard.\n\u2022 Destroy target artifact.\n\u2022 Each creature deals 1 damage to its controller.",
  { manaCost: '{B}{R}', colors: ['B', 'R'] },
);

describe('"Each creature deals 1 damage to its controller." (CR 120.3)', () => {
  const start = () =>
    main(
      (b) =>
        b
          .define(CHARM_B)
          .hand(CHARM_B.name)
          .battlefield('Swamp', 'Mountain')
          .battlefield('Grizzly Bears', 'Giant Spider'),
      (b) => b.battlefield('Serra Angel'),
    );

  test('each creature damages the player who controls it, one point each', () => {
    const g = start();
    g.act(0).cast(CHARM_B.name, { modes: [2], pay: true });
    g.passAll();
    // Two creatures of the caster, one of the opponent.
    g.expect.life(0, 18);
    g.expect.life(1, 19);
    g.expect.invariants();
  });

  test('the creatures themselves are not damaged', () => {
    const g = start();
    g.act(0).cast(CHARM_B.name, { modes: [2], pay: true });
    g.passAll();
    g.expect.damage('Grizzly Bears', 0);
    g.expect.damage('Serra Angel', 0);
  });

  test('with no creature nobody is damaged', () => {
    const g = main((b) => b.define(CHARM_B).hand(CHARM_B.name).battlefield('Swamp', 'Mountain'));
    g.act(0).cast(CHARM_B.name, { modes: [2], pay: true });
    g.passAll();
    g.expect.life(0, 20);
    g.expect.life(1, 20);
  });
});

// ---- Etali, Primal Storm: "Whenever ~ attacks, exile the top card of each player's library, then you may cast any number of spells from among those cards without paying their mana costs." (CR 701.13, 608.2g, 118.9).

const ETALI = parsed(
  'SYNTHETIC Parsed Etali',
  'Legendary Creature \u2014 Elder Dinosaur',
  "Whenever ~ attacks, exile the top card of each player's library, then you may cast any number of spells from among those cards without paying their mana costs.",
  { manaCost: '{4}{R}{R}', colors: ['R'], power: '6', toughness: '6' },
);

describe('"exile the top card of each player\'s library, then you may cast any number of spells from among those cards" (CR 701.13, 608.2g)', () => {
  const start = () => {
    const g = scenario()
      .seat(0)
      .define(ETALI)
      .battlefield(ETALI.name)
      .library('Grizzly Bears', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .library('Giant Spider', 'Island', 'Island', 'Island')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(ETALI.name);
    return g;
  };

  test('the top card of each library is exiled, and any number of the spells are cast', () => {
    const g = start();
    g.passAll();
    // Both cards are in exile and the controller may cast both.
    g.expect.zone('Grizzly Bears', 'exile', { seat: 0 });
    g.expect.zone('Giant Spider', 'exile', { seat: 1 });
    // The question is asked again after each cast, one card at a time.
    g.act(0).chooseCards('Grizzly Bears');
    g.act(0).chooseCards({ name: 'Giant Spider', seat: 1 });
    g.passAll();
    // The spells are cast by seat 0 and enter under its control, whoever owns them.
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    g.expect.zone('Giant Spider', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('casting none leaves every card in exile', () => {
    const g = start();
    g.passAll();
    g.act(0).chooseCards();
    g.passAll();
    g.expect.zone('Grizzly Bears', 'exile', { seat: 0 });
    g.expect.zone('Giant Spider', 'exile', { seat: 1 });
  });

  test('a land among them is not cast', () => {
    const g = scenario()
      .seat(0)
      .define(ETALI)
      .battlefield(ETALI.name)
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .library('Giant Spider', 'Island', 'Island')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(ETALI.name);
    g.passAll();
    g.expect.zone('Plains', 'exile', { seat: 0 });
    g.act(0).chooseCards({ name: 'Giant Spider', seat: 1 });
    g.passAll();
    g.expect.zone('Plains', 'exile', { seat: 0 });
    g.expect.zone('Giant Spider', 'battlefield', { seat: 0 });
  });
});
