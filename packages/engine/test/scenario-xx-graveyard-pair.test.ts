// "Choose a creature card in an opponent's graveyard, then that player chooses a creature card in your graveyard. You may return those cards to the battlefield under their
// owners' control." (D-272, the effect `returnGraveyardPair`; Dawnbreak Reclaimer of the Bruna deck, issue 5).
// Pins: CR 608.2c (the instructions are followed in the order written), CR 608.2d (a player can't choose an option that is impossible: with no such card nothing is chosen),
// CR 110.2a and 400.3 (the cards enter under their owners' control), CR 603.2 (a trigger of "your end step" triggers on your end step only), CR 404.2 (graveyards are public).
// The Angel, the spell and the cleric are SYNTHETIC (src/cards/fixtures/synthetic-dawnbreak.ts); the other cards are real fixtures.
import { describe, expect, test } from 'vitest';
import { getView, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import {
  chooseCardsDecision,
  chooseOptionDecision,
  confirmOptionalDecision,
} from './pending-helpers';

const RECLAIMER = 'SYNTHETIC Reclaimer Angel';
const RITE = 'SYNTHETIC Reclaimer Rite'; // the same effect for artifact cards, as a sorcery
const CLERIC = 'SYNTHETIC Reclaimed Cleric'; // "When this creature enters, you gain 1 life."
const WARDEN = 'SYNTHETIC Reclaimed Warden'; // "Whenever another creature enters, you gain 1 life."
const BEARS = 'Grizzly Bears'; // 2/2, mana value 2
const ANGEL = 'Serra Angel'; // 4/4, mana value 5
const SPIDER = 'Giant Spider'; // 2/4, mana value 4
const KNIGHT = 'Youthful Knight';
const BOLT = 'Lightning Bolt';
const SOL = 'Sol Ring';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

describe('the cards are valid', () => {
  test.each([RECLAIMER, RITE, CLERIC, WARDEN, 'SYNTHETIC Reclaimed Seer'])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('the card type must be a card type', () => {
    const card = syntheticCard(RITE);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const bad = {
      ...card,
      faces: [{ ...face, spell: { effect: { kind: 'returnGraveyardPair', cardType: 'goblin' } } }],
    };
    expect(JSON.stringify(validateCard(bad as never))).toContain('returnGraveyardPair');
  });

  test.each(['instant', 'sorcery'])(
    '%s cards cannot enter the battlefield (CR 304.4, 307.4)',
    (cardType) => {
      const card = syntheticCard(RITE);
      const face = card.faces[0];
      if (face === undefined) throw new Error('no face');
      const bad = {
        ...card,
        faces: [{ ...face, spell: { effect: { kind: 'returnGraveyardPair', cardType } } }],
      };
      expect(JSON.stringify(validateCard(bad as never))).toContain('instant or a sorcery');
    },
  );
});

/** Seat 0 controls the Angel (and the end step is seat 0's); the graveyards are given. */
const game = (mine: readonly string[], theirs: readonly string[], extra: readonly string[] = []) =>
  scenario()
    .seat(0)
    .battlefield(RECLAIMER, ...extra)
    .graveyard(...mine)
    .library(...LIBRARY)
    .seat(1)
    .graveyard(...theirs)
    .library(...LIBRARY)
    .at('precombatMain', { active: 0, turn: 1 })
    .build();

/** The name of the card an object is. */
const nameOf = (g: ReturnType<typeof game>, id: string): string | undefined =>
  getView(g.state, 0)
    .seats.flatMap((s) => s.graveyard)
    .find((o) => o.id === id)?.name;

/** Walks to seat 0's end step and resolves the trigger as far as its first question. */
const atEndStep = (g: ReturnType<typeof game>) => {
  g.advanceTo('end');
  g.expect.stack([`${RECLAIMER} (ability)`]);
  g.passAll();
  return g;
};

describe('the choices: who chooses, and among which cards', () => {
  test('you choose among the creature cards of the opponent graveyards only; then the owner chooses among yours only', () => {
    const g = atEndStep(game([SPIDER, KNIGHT, SOL], [BEARS, ANGEL, BOLT]));
    const first = chooseCardsDecision(g);
    expect(first.purpose).toBe('pair');
    expect(first.zone).toBe('graveyard');
    expect(first.seat).toBe(0);
    // Only creature cards, only in the opponent's graveyard (not mine, not the Bolt).
    const names = (ids: readonly string[]) => ids.map((id) => nameOf(g, id)).sort();
    expect(names(first.legal)).toEqual([ANGEL, BEARS].sort());
    expect(first.min).toBe(1);
    expect(first.max).toBe(1);
    expect(first.reveal).toBe(true);
    g.act(0).chooseCards({ name: ANGEL, seat: 1 });
    // "That player" (the owner of the card chosen) chooses in YOUR graveyard.
    const second = chooseCardsDecision(g);
    expect(second.seat).toBe(1);
    expect(names(second.legal)).toEqual([KNIGHT, SPIDER].sort());
    g.expect.pending('chooseCards', 1);
    g.act(1).chooseCards({ name: SPIDER, seat: 0 });
    // Then you are asked once, for both.
    const ask = confirmOptionalDecision(g);
    expect(ask.seat).toBe(0);
    expect(ask.purpose).toBe('pairReturn');
    expect(nameOf(g, ask.pair?.theirs ?? '')).toBe(ANGEL);
    expect(nameOf(g, ask.pair?.mine ?? '')).toBe(SPIDER);
  });

  test('accepting returns both under their owners control: the opponent card to the opponent, your card to you', () => {
    const g = atEndStep(game([SPIDER, KNIGHT], [BEARS, ANGEL]));
    g.act(0).chooseCards({ name: ANGEL, seat: 1 });
    g.act(1).chooseCards({ name: SPIDER, seat: 0 });
    g.act(0).accept();
    g.expect.zone(ANGEL, 'battlefield', { seat: 1 });
    g.expect.zone(SPIDER, 'battlefield', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(KNIGHT, 'graveyard', { seat: 0 });
    g.expect.noObject(ANGEL, { zone: 'graveyard' });
    g.expect.noObject(SPIDER, { zone: 'graveyard' });
    g.expect.invariants();
  });

  test('declining returns neither card', () => {
    const g = atEndStep(game([SPIDER, KNIGHT], [BEARS, ANGEL]));
    g.act(0).chooseCards({ name: ANGEL, seat: 1 });
    g.act(1).chooseCards({ name: SPIDER, seat: 0 });
    g.act(0).decline();
    g.expect.zone(ANGEL, 'graveyard', { seat: 1 });
    g.expect.zone(SPIDER, 'graveyard', { seat: 0 });
    g.expect.noObject(ANGEL, { zone: 'battlefield' });
    g.expect.noObject(SPIDER, { zone: 'battlefield' });
    g.expect.pending('priority' as never);
  });

  test('the wrong player, the wrong card and a noncreature card are refused', () => {
    const g = atEndStep(game([SPIDER, KNIGHT, SOL], [BEARS, ANGEL, BOLT]));
    // A card of my own graveyard, a noncreature card of the opponent: not legal for the first choice.
    expect(() => g.act(0).chooseCards({ name: SPIDER, seat: 0 })).toThrow();
    expect(() => g.act(0).chooseCards({ name: BOLT, seat: 1 })).toThrow();
    // The first choice is mine to make, not the opponent's.
    expect(() => g.act(1).chooseCards({ name: BEARS, seat: 1 })).toThrow();
    g.act(0).chooseCards({ name: BEARS, seat: 1 });
    // The second is the opponent's, and only among my creature cards.
    expect(() => g.act(0).chooseCards({ name: SPIDER, seat: 0 })).toThrow();
    g.act(1).chooseCards({ name: SPIDER, seat: 0 });
    g.expect.pending('confirmOptional', 0);
  });

  test('the opponent chooses what comes back for you: it need not be the best card', () => {
    const g = atEndStep(game([SPIDER, KNIGHT], [ANGEL]));
    // One opponent card: no question for the first choice. The opponent then chooses among two of mine.
    g.expect.pending('chooseCards', 1);
    g.act(1).chooseCards({ name: KNIGHT, seat: 0 });
    g.act(0).accept();
    g.expect.zone(KNIGHT, 'battlefield', { seat: 0 });
    g.expect.zone(SPIDER, 'graveyard', { seat: 0 });
    g.expect.zone(ANGEL, 'battlefield', { seat: 1 });
  });
});

describe('a choice with one candidate is made by the engine and says so; a choice with none is not made (CR 608.2d)', () => {
  test('one card on each side: no question but the may, and the choices are logged as automatic', () => {
    const g = atEndStep(game([SPIDER], [ANGEL]));
    g.expect.pending('confirmOptional', 0);
    const chosen = g.events.filter((e) => e.kind === 'permanentsChosen');
    expect(chosen).toHaveLength(2);
    expect(chosen.every((e) => e.automatic)).toBe(true);
    expect(chosen.map((e) => e.seat)).toEqual([0, 1]);
    g.act(0).accept();
    g.expect.zone(ANGEL, 'battlefield', { seat: 1 });
    g.expect.zone(SPIDER, 'battlefield', { seat: 0 });
  });

  test('no creature card in an opponent graveyard: nobody is "that player", nothing is chosen, nothing is asked, nothing returns', () => {
    const g = atEndStep(game([SPIDER, KNIGHT], [BOLT]));
    g.expect.pending('priority' as never);
    g.expect.zone(SPIDER, 'graveyard', { seat: 0 });
    g.expect.zone(KNIGHT, 'graveyard', { seat: 0 });
    expect(g.events.filter((e) => e.kind === 'permanentsChosen')).toEqual([]);
  });

  test('no creature card in your graveyard: the opponent card alone is offered, and returns to its owner', () => {
    const g = atEndStep(game([SOL], [ANGEL]));
    const ask = confirmOptionalDecision(g);
    expect(nameOf(g, ask.pair?.theirs ?? '')).toBe(ANGEL);
    expect(ask.pair?.mine).toBeUndefined();
    g.act(0).accept();
    g.expect.zone(ANGEL, 'battlefield', { seat: 1 });
    g.expect.zone(SOL, 'graveyard', { seat: 0 });
  });

  test('empty graveyards: nothing at all happens', () => {
    const g = atEndStep(game([], []));
    g.expect.pending('priority' as never);
    expect(g.events.filter((e) => e.kind === 'permanentsChosen')).toEqual([]);
  });
});

describe('it triggers on your end step only', () => {
  test('not on the opponent end step', () => {
    const g = scenario()
      .seat(0)
      .battlefield(RECLAIMER)
      .graveyard(SPIDER)
      .library(...LIBRARY)
      .seat(1)
      .graveyard(ANGEL)
      .library(...LIBRARY)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.advanceTo('end');
    g.expect.step('end', { active: 1, turn: 2 });
    g.expect.stack([]);
    g.expect.zone(ANGEL, 'graveyard', { seat: 1 });
    g.expect.zone(SPIDER, 'graveyard', { seat: 0 });
  });

  test('on every end step of yours, not only the first', () => {
    const g = game([SPIDER, KNIGHT], [ANGEL, BEARS]);
    atEndStep(g);
    g.act(0).chooseCards({ name: BEARS, seat: 1, zone: 'graveyard' });
    g.act(1).chooseCards({ name: KNIGHT, seat: 0, zone: 'graveyard' });
    g.act(0).decline();
    // The opponent's end step (turn 2) passes without it; mine (turn 3) triggers it again.
    g.advanceTo('end', { turn: 'next' });
    g.expect.step('end', { active: 1, turn: 2 });
    g.expect.stack([]);
    g.advanceTo('end', { turn: 'next' });
    g.expect.step('end', { active: 0, turn: 3 });
    g.expect.stack([`${RECLAIMER} (ability)`]);
  });
});

describe('the cards that return are new objects that enter under their owners control', () => {
  test('the enters triggers of both cards are controlled by the player they came back under (CR 603.3a)', () => {
    const g = atEndStep(game([CLERIC], [CLERIC]));
    g.act(0).accept();
    // Each cleric entered under its owner: each owner gains 1 life as its trigger resolves.
    g.passAll();
    g.passAll();
    g.expect.life(0, 41);
    g.expect.life(1, 41);
  });

  test('the effect is not tied to a trigger: as a sorcery, artifact cards return under their owners control', () => {
    // The spell version: choose among artifact cards; nothing else can move them between the choice and the answer, so this is the whole-resolution guarantee.
    const g = scenario()
      .seat(0)
      .hand(RITE)
      .battlefield('Plains', 'Plains', 'Plains')
      .graveyard(SOL)
      .library(...LIBRARY)
      .seat(1)
      .graveyard(SOL)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.zone(SOL, 'battlefield', { seat: 0 });
    g.expect.zone(SOL, 'battlefield', { seat: 1 });
    g.expect.zone(RITE, 'graveyard', { seat: 0 });
  });
});

describe('both cards enter in one event, so each sees the other enter (CR 603.6a)', () => {
  test('my Warden sees the opponent card enter, whichever graveyard it comes from', () => {
    // The Warden is in MY graveyard, the Bears in the opponent's: the Warden controller gains 1 life, and nobody else does.
    const g = atEndStep(game([WARDEN], [BEARS]));
    g.act(0).accept();
    g.passAll();
    g.expect.life(0, 41);
    g.expect.life(1, 40);
  });

  test('the opponent Warden sees my card enter just the same', () => {
    const g = atEndStep(game([BEARS], [WARDEN]));
    g.act(0).accept();
    g.passAll();
    g.expect.life(0, 40);
    g.expect.life(1, 41);
  });

  test('two Wardens each see the other (and not themselves)', () => {
    const g = atEndStep(game([WARDEN], [WARDEN]));
    g.act(0).accept();
    g.passAll();
    g.passAll();
    g.expect.life(0, 41);
    g.expect.life(1, 41);
  });
});

/**
 * CR 614.12, 400.7: the two cards enter in one event, and the replacement effects that modify how they enter (as it enters you may have it become a copy, a permanent that
 * makes others enter with counters or untapped, a count of the battlefield) look at the battlefield as it is before they enter. The first card to be moved is the
 * opponent's, the second is mine: the second must not see the first, and a permanent of the pair gives its replacement effect to nothing of the pair.
 */
describe('both cards enter in one event, so their replacement effects do not see each other (CR 614.12)', () => {
  const GLASS = 'SYNTHETIC Cursed Looking Glass'; // "As this artifact enters, you may have it become a copy of any creature on the battlefield"
  const RUIN = 'SYNTHETIC Ruin Angel'; // an artifact creature
  const CLAY = 'SYNTHETIC Clay Golem';
  const BANNER = 'SYNTHETIC Banner Golem'; // "Each other creature enters with an additional +1/+1 counter on it."
  const CROWD = 'SYNTHETIC Crowd Golem'; // "enters with a +1/+1 counter on it for each creature on the battlefield"
  const DAWN = 'SYNTHETIC Dawn Golem'; // "Creatures enter untapped."
  const WEARY = 'SYNTHETIC Weary Golem'; // "This creature enters tapped."

  /** Seat 0 casts the artifact version of the pair: `mine` and `theirs` are the artifact cards of the graveyards, `onBattlefield` stands for seat 1. */
  const rite = (
    mine: readonly string[],
    theirs: readonly string[],
    onBattlefield: readonly string[] = [],
  ) => {
    const g = scenario()
      .seat(0)
      .hand(RITE)
      .battlefield('Plains', 'Plains', 'Plains')
      .graveyard(...mine)
      .library(...LIBRARY)
      .seat(1)
      .battlefield(...onBattlefield)
      .graveyard(...theirs)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    return g;
  };

  /** The names of the permanents `legal` of the pending "become a copy of" question. */
  const copyChoices = (g: ReturnType<typeof rite>): string[] => {
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error(`pending is ${d?.kind}`);
    expect(d.purpose).toBe('entersCopy');
    const battlefield = getView(g.state, 0).battlefield;
    return d.legal.map((id) => battlefield.find((o) => o.id === id)?.name ?? '?');
  };

  test('a permanent that enters as a copy cannot copy the creature that enters with it: with no other creature nothing is asked', () => {
    const g = rite([GLASS], [RUIN]);
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.zone(RUIN, 'battlefield', { seat: 1 });
    expect(g.state.pending?.kind).not.toBe('choosePermanent');
    g.expect.derived(GLASS, { types: ['artifact'], keywords: [] });
    g.expect.invariants();
  });

  test('with a creature on the battlefield already, it is the only one to copy, and the question survives the pause', () => {
    const g = rite([GLASS], [RUIN], [BEARS]);
    g.act(0).accept();
    expect(copyChoices(g)).toEqual([BEARS]);
    g.act(0).choosePermanents({ name: BEARS, seat: 1 });
    g.expect.derived(GLASS, { types: ['creature'], subtypes: ['Bear'] });
    g.expect.zone(RUIN, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('the card that enters first is not asked about the card that enters second either', () => {
    // The Glass is the opponent's card (the first to be moved) and my Ruin Angel the second: only the Bears can be copied.
    const g = rite([RUIN], [GLASS], [BEARS]);
    g.act(0).accept();
    expect(copyChoices(g)).toEqual([BEARS]);
  });

  test('a permanent that makes other creatures enter with a counter gives none to the creature that enters with it', () => {
    // The Banner (the opponent's card, the first to enter) is not on the battlefield yet when my Golem enters.
    const g = rite([CLAY], [BANNER]);
    g.act(0).accept();
    g.expect.zone(BANNER, 'battlefield', { seat: 1 });
    g.expect.counters(CLAY, {});
    g.expect.pt(CLAY, 2, 2);
    g.expect.invariants();
  });

  test('the same permanent still gives its counter to a creature already there that it did not see, and one on the battlefield before the pair counts', () => {
    // A Banner on the battlefield before the pair does apply to both cards that enter.
    const g = rite([CLAY], [CLAY], [BANNER]);
    g.act(0).accept();
    g.expect.counters(`${CLAY}[0]`, { '+1/+1': 1 });
    g.expect.counters(`${CLAY}[1]`, { '+1/+1': 1 });
  });

  test('a count of the battlefield is made without the creature that enters with it', () => {
    // One Bears on the battlefield; my Crowd Golem counts it only, not the opponent card that enters in the same event.
    const g = rite([CROWD], [CLAY], [BEARS]);
    g.act(0).accept();
    g.expect.counters(CROWD, { '+1/+1': 1 });
    g.expect.pt(CROWD, 2, 2);
  });

  test('"creatures enter untapped" does not apply to the creature that enters with it', () => {
    const g = rite([WEARY], [DAWN]);
    g.act(0).accept();
    g.expect.zone(DAWN, 'battlefield', { seat: 1 });
    g.expect.tapped(WEARY, true);
  });

  test('and it does apply to a creature that was on the battlefield before', () => {
    const g = rite([WEARY], [CLAY], [DAWN]);
    g.act(0).accept();
    g.expect.tapped(WEARY, false);
  });
});

describe('a question the card asks as it enters pauses the run, and each card still sees the other enter (CR 603.6a)', () => {
  const MIMIC = 'SYNTHETIC Type Mimic'; // "As this creature enters, choose a creature type." (an artifact creature)

  test('the second card asks: the Warden of the first sees it enter', () => {
    const g = atEndStep(game([MIMIC], [WARDEN]));
    g.act(0).accept();
    g.expect.pending('chooseOption', 0);
    g.act(0).chooseOption(chooseOptionDecision(g).options[0] as string);
    g.passAll();
    g.expect.life(0, 40);
    g.expect.life(1, 41);
  });

  test('the first card asks: the Warden of the second sees it enter', () => {
    const g = atEndStep(game([WARDEN], [MIMIC]));
    g.act(0).accept();
    g.expect.pending('chooseOption', 1);
    g.act(1).chooseOption(chooseOptionDecision(g).options[0] as string);
    g.passAll();
    g.expect.life(0, 41);
    g.expect.life(1, 40);
  });
});

describe('known limit: the second card pauses the run (docs/ROADMAP.md)', () => {
  // CR 603.6a says the Seer sees the Bears enter in the same event; the engine notices the triggers of the Bears' entering when the Seer's question pauses the resolution,
  // before the Seer is on the battlefield. `test.fails` flips to a failure when the gap is closed, which is the time to turn it into a plain test.
  test.fails('the Seer, which asks as it enters, sees the card that entered with it', () => {
    const g = atEndStep(game(['SYNTHETIC Reclaimed Seer'], [BEARS]));
    g.act(0).accept();
    g.act(0).chooseOption(chooseOptionDecision(g).options[0] as string);
    g.passAll();
    g.expect.life(0, 41);
  });
});

describe('declining the pair drops only that instruction', () => {
  test('a sequence of the pair and a draw: declining the pair still draws', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Reclaimer Tide')
      .battlefield('Plains', 'Plains', 'Plains')
      .graveyard(SPIDER)
      .library(...LIBRARY)
      .seat(1)
      .graveyard(ANGEL)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast('SYNTHETIC Reclaimer Tide', { pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).decline();
    g.expect.zone(SPIDER, 'graveyard', { seat: 0 });
    g.expect.zone(ANGEL, 'graveyard', { seat: 1 });
    g.expect.handSize(0, 1);
  });

  test('accepting the pair also draws', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Reclaimer Tide')
      .battlefield('Plains', 'Plains', 'Plains')
      .graveyard(SPIDER)
      .library(...LIBRARY)
      .seat(1)
      .graveyard(ANGEL)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast('SYNTHETIC Reclaimer Tide', { pay: true });
    g.passAll();
    g.act(0).accept();
    g.expect.zone(ANGEL, 'battlefield', { seat: 1 });
    g.expect.handSize(0, 1);
  });
});

describe('determinism', () => {
  test('the same answers give the same game', () => {
    const run = () => {
      const g = atEndStep(game([SPIDER, KNIGHT], [BEARS, ANGEL]));
      g.act(0).chooseCards({ name: BEARS, seat: 1 });
      g.act(1).chooseCards({ name: KNIGHT, seat: 0 });
      g.act(0).accept();
      return JSON.stringify(g.state);
    };
    expect(run()).toBe(run());
  });
});
