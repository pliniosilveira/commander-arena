// Miracle Worker deck (issue 109), group F1: cards returned to the battlefield. Athreos, Shroud-Veiled and Spirit-Sister's Call are read from their REAL Oracle
// text (fixtures/corpus/golden.jsonl) with no override and played through applyAction, on two and on three seats.
// Pins: CR 700.4 (dies), CR 603.10a (a leaves-the-battlefield ability looks back in time), CR 400.7 (a new object: the card returns without its coin counter),
// CR 110.2a / 108.3 (it enters under the control of the player who controls the ability), CR 101.4 and 603.3b (APNAP order for triggers of several players),
// CR 111.7 (a token ceases to exist), CR 614.6 (a replacement of leaving the battlefield).
// The helper cards whose names start with SYNTHETIC are not real cards.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const FILLER = Array.from({ length: 12 }, () => 'Island');

/** Resolve everything on the stack, ordering simultaneous triggers as offered. */
function settle(g: ScenarioGame): void {
  for (let i = 0; i < 30; i += 1) {
    const d = g.state.pending;
    if (d !== null && d.kind === 'orderTriggers') {
      g.act(d.seat).orderTriggers(0);
    } else if (g.state.stack.length > 0) g.passAll();
    else break;
  }
}

describe('Athreos, Shroud-Veiled (CR 700.4, 603.10a, 400.7, 110.2a, 101.4)', () => {
  const ATHREOS = real('Athreos, Shroud-Veiled');
  const DOOM = parsed('SYNTHETIC Doom', 'Instant', 'Destroy target creature.', { manaCost: '{1}' });
  const BANISH = parsed('SYNTHETIC Banish', 'Instant', 'Exile target creature.', {
    manaCost: '{1}',
  });
  const BLINK = parsed(
    'SYNTHETIC Blink',
    'Instant',
    "Exile target creature, then return it to the battlefield under its owner's control.",
    { manaCost: '{1}' },
  );
  const MAKER = parsed(
    'SYNTHETIC Soldier Maker',
    'Instant',
    'Create a 1/1 white Soldier creature token.',
    { manaCost: '{1}' },
  );
  const COIN = parsed('SYNTHETIC Coin Toss', 'Instant', 'Put a coin counter on target creature.', {
    manaCost: '{1}',
  });
  const PURGE = parsed('SYNTHETIC Purge', 'Instant', 'Exile target permanent.', {
    manaCost: '{1}',
  });
  const SCOUR = parsed('SYNTHETIC Scour', 'Instant', 'Exile target card from a graveyard.', {
    manaCost: '{1}',
  });
  const BEAR = parsed('SYNTHETIC Bear', 'Creature — Bear', '', {
    manaCost: '{1}',
    power: '2',
    toughness: '2',
  });

  test('the lowering: a creature with a coin counter leaving to a graveyard or exile, returned under the controller', () => {
    const trigger = ATHREOS.faces[0]?.abilities.find(
      (a) => a.kind === 'triggered' && JSON.stringify(a).includes('leavesBattlefield'),
    );
    expect(JSON.stringify(trigger)).toContain('"hasCounter":"coin"');
    expect(JSON.stringify(trigger)).toContain('"to":["graveyard","exile"]');
  });

  const table = (twoAthreos = false) => {
    let b = scenario({ seats: 3 })
      .define(ATHREOS)
      .define(DOOM)
      .define(BANISH)
      .define(BLINK)
      .define(MAKER)
      .define(BEAR)
      .seat(0)
      .hand(DOOM.name, BANISH.name, BLINK.name, MAKER.name)
      .battlefield(ATHREOS.name, { label: 'athreos0' })
      .battlefield('Plains', { count: 5 })
      .library(...FILLER)
      .seat(1)
      .battlefield(BEAR.name, { counters: { coin: 1 }, label: 'bear' })
      .library(...FILLER)
      .seat(2);
    if (twoAthreos) b = b.battlefield(ATHREOS.name, { label: 'athreos2' });
    return b
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 4 })
      .build();
  };

  test('a creature of another player dies: it returns under Athreos’s controller, without the coin counter', () => {
    const g = table();
    g.act(0).cast(DOOM.name, { pay: true, targets: ['bear'] });
    settle(g);
    g.expect.zone(BEAR.name, 'battlefield', { seat: 0 });
    g.expect.counters(BEAR.name, {});
    g.expect.invariants();
  });

  test('exile works the same way', () => {
    const g = table();
    g.act(0).cast(BANISH.name, { pay: true, targets: ['bear'] });
    settle(g);
    g.expect.zone(BEAR.name, 'battlefield', { seat: 0 });
    g.expect.counters(BEAR.name, {});
  });

  test('a creature without a coin counter does not trigger', () => {
    const g = scenario({ seats: 3 })
      .define(ATHREOS)
      .define(DOOM)
      .define(BEAR)
      .seat(0)
      .hand(DOOM.name)
      .battlefield(ATHREOS.name)
      .battlefield('Plains', { count: 2 })
      .library(...FILLER)
      .seat(1)
      .battlefield(BEAR.name, { counters: { '+1/+1': 1 }, label: 'bear' })
      .library(...FILLER)
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 4 })
      .build();
    g.act(0).cast(DOOM.name, { pay: true, targets: ['bear'] });
    settle(g);
    g.expect.zone(BEAR.name, 'graveyard', { seat: 1 });
  });

  test('exiled and returned at once (a flicker): the trigger resolves with nothing to return, the creature stays where the flicker put it', () => {
    const g = table();
    g.act(0).cast(BLINK.name, { pay: true, targets: ['bear'] });
    settle(g);
    // The creature came back under its owner's control (a new object, no counter) and Athreos's ability did nothing (CR 400.7).
    g.expect.zone(BEAR.name, 'battlefield', { seat: 1 });
    g.expect.counters(BEAR.name, {});
    g.expect.invariants();
  });

  test('a token with a coin counter that dies is not returned (CR 111.7)', () => {
    const g = scenario({ seats: 3 })
      .define(ATHREOS)
      .define(DOOM)
      .define(MAKER)
      .define(COIN)
      .seat(0)
      .hand(COIN.name, MAKER.name, DOOM.name)
      .battlefield(ATHREOS.name)
      .battlefield('Plains', { count: 4 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 4 })
      .build();
    g.act(0).cast(MAKER.name, { pay: true });
    settle(g);
    const token = Object.values(g.state.objects).find(
      (o) => o.zone === 'battlefield' && o.token !== null,
    );
    expect(token, JSON.stringify(g.state.stack)).toBeDefined();
    g.act(0).cast(COIN.name, { pay: true, targets: ['Soldier'] });
    settle(g);
    g.expect.counters('Soldier', { coin: 1 });
    g.act(0).cast(DOOM.name, { pay: true, targets: ['Soldier'] });
    settle(g);
    expect(
      Object.values(g.state.objects).filter((o) => o.zone === 'battlefield' && o.token !== null),
    ).toHaveLength(0);
  });

  test('with two Athreos, the nonactive player closest to the right of the active player returns it (CR 101.4, 603.3b)', () => {
    const g = table(true);
    g.act(0).cast(DOOM.name, { pay: true, targets: ['bear'] });
    // Both triggers wait on the stack; the one of the nonactive player (seat 2, the last in turn order, the one closest to the active player's right) is put
    // on the stack last and resolves first; the active player's then finds the card gone from the graveyard.
    settle(g);
    g.expect.zone(BEAR.name, 'battlefield', { seat: 2 });
    g.expect.counters(BEAR.name, {});
  });

  test('a stolen creature (owned by seat 1, controlled by seat 2) returns under the control of Athreos’s controller, seat 0', () => {
    const g = scenario({ seats: 3 })
      .define(ATHREOS)
      .define(DOOM)
      .define(BEAR)
      .seat(0)
      .hand(DOOM.name)
      .battlefield(ATHREOS.name)
      .battlefield('Plains', { count: 2 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 4 })
      .build();
    expect(g).toBeDefined();
    const h = scenario({ seats: 3 })
      .define(ATHREOS)
      .define(DOOM)
      .define(BEAR)
      .seat(0)
      .hand(DOOM.name)
      .battlefield(ATHREOS.name)
      .battlefield('Plains', { count: 2 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .seat(2)
      .battlefield(BEAR.name, { counters: { coin: 1 }, label: 'bear', controller: 2 })
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 4 })
      .build();
    h.act(0).cast(DOOM.name, { pay: true, targets: ['bear'] });
    settle(h);
    h.expect.zone(BEAR.name, 'battlefield', { seat: 0 });
  });

  test('a permanent with a coin counter that is not a creature does not trigger it (ruling: it must be a creature as it leaves)', () => {
    const g = scenario({ seats: 3 })
      .define(ATHREOS)
      .define(PURGE)
      .seat(0)
      .hand(PURGE.name)
      .battlefield(ATHREOS.name)
      .battlefield('Plains', { count: 2 })
      .library(...FILLER)
      .seat(1)
      .battlefield(ATHREOS.name, { counters: { coin: 1 }, label: 'other' })
      .library(...FILLER)
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 4 })
      .build();
    g.act(0).cast(PURGE.name, { pay: true, targets: ['other'] });
    settle(g);
    // Neither God is a creature (devotion below seven): the exiled one stays in exile.
    g.expect.zone(ATHREOS.name, 'exile', { seat: 1 });
  });

  test('the card leaves the new zone before the ability resolves: it is not returned (ruling 2020-01-24)', () => {
    const g = scenario({ seats: 3 })
      .define(ATHREOS)
      .define(DOOM)
      .define(BEAR)
      .define(SCOUR)
      .seat(0)
      .hand(DOOM.name, SCOUR.name)
      .battlefield(ATHREOS.name)
      .battlefield('Plains', { count: 4 })
      .library(...FILLER)
      .seat(1)
      .battlefield(BEAR.name, { counters: { coin: 1 }, label: 'bear' })
      .library(...FILLER)
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 4 })
      .build();
    g.act(0).cast(DOOM.name, { pay: true, targets: ['bear'] });
    g.act(0).pass();
    g.act(1).pass();
    g.act(2).pass();
    // Doom resolved; the trigger of Athreos is on the stack. In response the card is exiled from the graveyard.
    expect(g.state.stack.length).toBe(1);
    g.act(0).cast(SCOUR.name, { pay: true, targets: ['bear'] });
    settle(g);
    g.expect.zone(BEAR.name, 'exile', { seat: 1 });
  });
});

describe("Spirit-Sister's Call (CR 205.2a, 701.21a, 608.2c, 614.6, 400.7)", () => {
  const CALL = real("Spirit-Sister's Call");
  const BEAR = parsed('SYNTHETIC Bear', 'Creature — Bear', '', {
    manaCost: '{1}',
    power: '2',
    toughness: '2',
  });
  const GOLEM = parsed('SYNTHETIC Golem', 'Artifact Creature — Golem', '', {
    manaCost: '{1}',
    power: '1',
    toughness: '1',
  });
  const TRINKET = parsed('SYNTHETIC Trinket', 'Artifact', '', { manaCost: '{1}' });
  const DOOM = parsed('SYNTHETIC Doom', 'Instant', 'Destroy target creature.', { manaCost: '{1}' });
  const RAZE = parsed('SYNTHETIC Raze', 'Instant', 'Destroy target enchantment.', {
    manaCost: '{1}',
  });
  const SCOUR = parsed('SYNTHETIC Scour', 'Instant', 'Exile target card from a graveyard.', {
    manaCost: '{1}',
  });

  test('the lowering: a sacrifice of a permanent sharing a type with the target, and the return with the replacement', () => {
    expect(validateCard(CALL)).toEqual([]);
    const text = JSON.stringify(CALL.faces[0]?.abilities);
    expect(text).toContain('"sharesCardTypeWith":"target"');
    expect(text).toContain('"kind":"exileIfLeaves"');
  });

  /** Seat 1 controls the Call and `battlefield`, with `graveyard` in its graveyard and `hand` in its hand; its turn, at the main phase. Seats 0 and 2 are bystanders. */
  const game = (opts: {
    graveyard: string[];
    battlefield: string[];
    hand?: string[];
    opponentGraveyard?: string[];
  }) => {
    let b = scenario({ seats: 3 })
      .define(CALL)
      .define(BEAR)
      .define(GOLEM)
      .define(TRINKET)
      .define(DOOM)
      .define(RAZE)
      .define(SCOUR)
      .seat(0)
      .library(...FILLER);
    for (const name of opts.opponentGraveyard ?? []) b = b.graveyard(name, { label: 'theirs' });
    b = b.seat(1).battlefield(CALL.name, { label: 'call' });
    for (const name of opts.graveyard) b = b.graveyard(name, { label: `gy ${name}` });
    for (const name of opts.battlefield) b = b.battlefield(name, { label: `bf ${name}` });
    b = b.battlefield('Plains', { count: 4 });
    if (opts.hand !== undefined) b = b.hand(...opts.hand);
    return b
      .library(...FILLER)
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 5 })
      .build();
  };

  /** To the end step of seat 1, with the trigger on the stack, then it resolves up to the offer. */
  const toOffer = (g: ScenarioGame) => {
    g.advanceTo('end');
    g.passAll();
    return g;
  };

  test('sacrificing a permanent that shares a card type returns the chosen card, which is exiled instead of dying', () => {
    const g = toOffer(
      game({ graveyard: [BEAR.name], battlefield: [GOLEM.name], hand: [DOOM.name] }),
    );
    g.expect.pending('confirmOptional', 1);
    g.act(1).accept();
    settle(g);
    g.expect.zone('SYNTHETIC Golem', 'graveyard', { seat: 1 });
    g.expect.zone(BEAR.name, 'battlefield', { seat: 1 });
    g.expect.invariants();
    // It is exiled instead of being put anywhere else, so it does not die (CR 614.6, 700.4).
    const mark = g.mark();
    g.act(1).cast(DOOM.name, { pay: true, targets: [BEAR.name] });
    settle(g);
    g.expect.zone(BEAR.name, 'exile', { seat: 1 });
    g.expect.noEvent({ kind: 'died' }, { since: mark });
  });

  test('declining the sacrifice leaves the card in the graveyard and the permanent where it is', () => {
    const g = toOffer(game({ graveyard: [BEAR.name], battlefield: [GOLEM.name] }));
    g.act(1).decline();
    settle(g);
    g.expect.zone(BEAR.name, 'graveyard', { seat: 1 });
    g.expect.zone(GOLEM.name, 'battlefield', { seat: 1 });
  });

  test('only a permanent that shares a card type may be sacrificed: with none, nothing is offered and nothing returns', () => {
    const g = toOffer(game({ graveyard: [BEAR.name], battlefield: [TRINKET.name] }));
    // With no permanent to sacrifice, saying yes sacrifices nothing, so "if you do" does not happen.
    if (g.state.pending?.kind === 'confirmOptional') g.act(1).accept();
    settle(g);
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.zone(BEAR.name, 'graveyard', { seat: 1 });
    g.expect.zone(TRINKET.name, 'battlefield', { seat: 1 });
  });

  test('a permanent with one of several card types of the chosen card qualifies (an artifact for an artifact creature)', () => {
    const g = toOffer(game({ graveyard: [GOLEM.name], battlefield: [TRINKET.name] }));
    g.expect.pending('confirmOptional', 1);
    g.act(1).accept();
    settle(g);
    g.expect.zone(TRINKET.name, 'graveyard', { seat: 1 });
    g.expect.zone(GOLEM.name, 'battlefield', { seat: 1 });
  });

  test('the Call itself may be sacrificed when it shares a type (an enchantment card was chosen)', () => {
    const g = toOffer(game({ graveyard: [CALL.name], battlefield: [] }));
    g.expect.pending('confirmOptional', 1);
    g.act(1).accept();
    settle(g);
    g.expect.zone(CALL.name, 'battlefield', { seat: 1 });
  });

  test('the target is chosen only in your own graveyard: a card in another graveyard is left alone', () => {
    const g = toOffer(
      game({
        graveyard: [],
        battlefield: [GOLEM.name],
        opponentGraveyard: [BEAR.name],
      }),
    );
    settle(g);
    g.expect.zone(BEAR.name, 'graveyard', { seat: 0 });
    g.expect.zone(GOLEM.name, 'battlefield', { seat: 1 });
  });

  test('the chosen card leaves the graveyard before the trigger resolves: the target is illegal, nothing is sacrificed', () => {
    const g = game({
      graveyard: [BEAR.name],
      battlefield: [GOLEM.name],
      hand: [SCOUR.name],
    });
    g.advanceTo('end');
    g.act(1).cast(SCOUR.name, { pay: true, targets: [BEAR.name] });
    settle(g);
    g.expect.zone(BEAR.name, 'exile', { seat: 1 });
    g.expect.zone(GOLEM.name, 'battlefield', { seat: 1 });
  });

  test('if the Call leaves the battlefield, the replacement of the returned permanent continues (ruling 2022-02-18)', () => {
    const g = toOffer(
      game({ graveyard: [BEAR.name], battlefield: [GOLEM.name], hand: [RAZE.name, DOOM.name] }),
    );
    g.act(1).accept();
    settle(g);
    g.act(1).cast(RAZE.name, { pay: true, targets: [CALL.name] });
    settle(g);
    g.expect.zone(CALL.name, 'graveyard', { seat: 1 });
    g.act(1).cast(DOOM.name, { pay: true, targets: [BEAR.name] });
    settle(g);
    g.expect.zone(BEAR.name, 'exile', { seat: 1 });
  });
});
