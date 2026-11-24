// Counter Intelligence deck, group 3 (copies, phasing, a win by counters, a chosen card type, casting from the graveyard): the REAL Oracle text of Phyrexian Metamorph, The Mycosynth
// Gardens, Emry, Lurker of the Loch, Wake the Past, Cloud Key, Darksteel Reactor, Depthshaker Titan and Ripples of Potential (golden.jsonl, taken from issue 93) goes through the
// grammar as a card with no override, is defined in an engine scenario with three and four seats and is played through applyAction.
// Pins: CR 614.12 and 707.9b (enters as a copy, "except it's an artifact in addition to its other types"), CR 707.2 and 707.3 (a copy effect of an ability: the copiable values, not
// counters or damage), CR 601.2 and 611.2a (casting a card from the graveyard this turn), CR 205.2a and 607.2d (a card type chosen as it enters, and spells "of the chosen type"),
// CR 601.2f (a cost reduction), CR 603.8 (a state trigger), CR 104.2b ("you win the game"), CR 205.1b and 613.1d (becomes an artifact creature), CR 603.7c (a delayed sacrifice of
// the targets), CR 702.121a and 702.121b (melee, granted), CR 701.34a (proliferate), CR 702.26a (phasing out), CR 400.7 and 611.2c.
import { validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';
import { parsed } from './convert-grammar-helpers';

const METAMORPH = real('Phyrexian Metamorph'); // {3}{U/P} artifact creature 0/0
const GARDENS = real('The Mycosynth Gardens'); // land
const EMRY = real('Emry, Lurker of the Loch'); // {2}{U} 1/2
const WAKE = real('Wake the Past'); // {5}{R}{W} sorcery
const KEY = real('Cloud Key'); // {3} artifact
const REACTOR = real('Darksteel Reactor'); // {4} artifact
const TITAN = real('Depthshaker Titan'); // {5}{R}{R} artifact creature 5/5
const RIPPLES = real('Ripples of Potential'); // {1}{U} instant

// SYNTHETIC permanents for the cards to act on.
const TRINKET = parsed('SYNTHETIC Trinket', 'Artifact', '', { manaCost: '{2}' }); // mana value 2
const IDOL = parsed('SYNTHETIC Idol', 'Artifact', '', { manaCost: '{3}' }); // mana value 3
const GOLEM = parsed('SYNTHETIC Golem', 'Artifact Creature — Golem', '', {
  manaCost: '{4}',
  power: '2',
  toughness: '2',
});
const ANGEL = parsed('SYNTHETIC Angel', 'Creature — Angel', 'Flying', {
  manaCost: '{3}{W}',
  power: '3',
  toughness: '3',
});
const BEAR = parsed('SYNTHETIC Bear', 'Creature — Bear', '', {
  manaCost: '{1}{G}',
  power: '2',
  toughness: '2',
});
const GADGET = parsed('SYNTHETIC Gadget', 'Artifact', '', { manaCost: '{2}' });

const LIBRARY = Array.from({ length: 10 }, () => 'Island');
const ALL = [
  METAMORPH,
  GARDENS,
  EMRY,
  WAKE,
  KEY,
  REACTOR,
  TITAN,
  RIPPLES,
  TRINKET,
  IDOL,
  GOLEM,
  ANGEL,
  BEAR,
  GADGET,
];

/** A table of `seats` seats with every card defined, an empty library for each, and seat 0 on its precombat main phase. */
const table = (seats: 2 | 3 | 4, build: (b: ReturnType<typeof scenario>) => void) => {
  const b = scenario({ seats });
  for (const card of ALL) b.define(card);
  for (let seat = 0; seat < seats; seat += 1) b.seat(seat).library(...LIBRARY);
  b.seat(0);
  build(b);
  return b.at('precombatMain', { active: 0, turn: 3 }).build();
};

describe('the eight cards read as supported and are valid', () => {
  test.each([METAMORPH, GARDENS, EMRY, WAKE, KEY, REACTOR, TITAN, RIPPLES])('$name', (card) => {
    expect(validateCard(card)).toEqual([]);
  });
});

describe('Phyrexian Metamorph: enters as a copy of an artifact or creature, and is an artifact too (CR 614.12, 707.9b)', () => {
  test('the lowering is an entersAsCopy of any artifact or creature, with the card type added', () => {
    const ability = METAMORPH.faces[0]?.abilities.find((a) => a.kind === 'replacement');
    expect(ability).toMatchObject({
      kind: 'replacement',
      replacement: {
        kind: 'entersAsCopy',
        optional: true,
        duration: 'permanent',
        addTypes: ['artifact'],
      },
    });
    const what = (ability as { replacement: { what: object } }).replacement.what;
    expect(what).not.toHaveProperty('controller');
  });

  test('a copy of an opponent creature (four seats): a creature that is also an artifact, with its abilities', () => {
    const g = table(4, (b) => {
      b.hand(METAMORPH.name).battlefield('Island', { count: 4 });
      b.seat(2).battlefield(ANGEL.name);
    });
    g.act(0).cast(METAMORPH.name, { pay: true });
    g.passAll();
    const d = g.state.pending;
    expect(d?.kind).toBe('choosePermanent');
    if (d?.kind !== 'choosePermanent') return;
    expect(d.purpose).toBe('entersCopy');
    g.act(0).choosePermanents({ name: ANGEL.name, seat: 2 });
    g.expect.derived(`${ANGEL.name}[1]`, {
      types: ['artifact', 'creature'],
      subtypes: ['Angel'],
      keywords: ['flying'],
    });
    g.expect.pt(`${ANGEL.name}[1]`, 3, 3);
    // The Angel of the opponent is untouched (a copy takes values, not the object).
    g.expect.derived(`${ANGEL.name}[0]`, { types: ['creature'] });
    g.expect.invariants();
  });

  test('a copy of an artifact that is no creature is an artifact (once), and of one of my own too', () => {
    const g = table(3, (b) => {
      b.hand(METAMORPH.name).battlefield('Island', { count: 4 }).battlefield(TRINKET.name);
    });
    g.act(0).cast(METAMORPH.name, { pay: true });
    g.passAll();
    g.act(0).choosePermanents({ name: TRINKET.name, seat: 0 });
    g.expect.derived(`${TRINKET.name}[1]`, { types: ['artifact'] });
  });

  test('"you may": declined, it stays a 0/0 artifact creature and dies', () => {
    const g = table(2, (b) => {
      b.hand(METAMORPH.name).battlefield('Island', { count: 4 }).battlefield(ANGEL.name);
    });
    g.act(0).cast(METAMORPH.name, { pay: true });
    g.passAll();
    g.act(0).choosePermanents();
    g.expect.zone(METAMORPH.name, 'graveyard', { seat: 0 });
  });

  test('only an artifact or a creature may be copied: a land is not offered', () => {
    const g = table(2, (b) => {
      b.hand(METAMORPH.name).battlefield('Island', { count: 4 });
      b.seat(1).battlefield(BEAR.name);
    });
    g.act(0).cast(METAMORPH.name, { pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error(`got ${d?.kind}`);
    expect(d.legal).toHaveLength(1);
  });
});

describe('The Mycosynth Gardens: becomes a copy of a nontoken artifact you control with mana value X (CR 707.2, 707.3)', () => {
  const gardens = (seats: 2 | 3 | 4) =>
    table(seats, (b) => {
      b.battlefield(GARDENS.name, { label: 'gardens' })
        .battlefield(TRINKET.name, { label: 'trinket' })
        .battlefield(IDOL.name, { label: 'idol' })
        .battlefield('Island', { count: 3 });
      if (seats > 2) b.seat(2).battlefield(GADGET.name, { label: 'theirs' });
    });

  test('X = 2: a copy of the Trinket for good, so it is no longer a land', () => {
    const g = gardens(4);
    g.act(0).activate('gardens', { ability: 2, x: 2, targets: ['trinket'], pay: true });
    g.passAll();
    g.expect.derived('gardens', { types: ['artifact'] });
    // It stays on the battlefield as the same object, and what is on it stays (CR 707.3).
    expect(g.state.objects[g.id('gardens')]?.zone).toBe('battlefield');
    expect(g.state.objects[g.id('trinket')]?.zone).toBe('battlefield');
    g.expect.invariants();
  });

  test('the target must have mana value X: with X = 2 the Idol (mana value 3) and another player artifact are not legal', () => {
    const g = gardens(4);
    expect(() =>
      g.act(0).activate('gardens', { ability: 2, x: 2, targets: ['idol'], pay: true }),
    ).toThrow();
    expect(() =>
      g.act(0).activate('gardens', { ability: 2, x: 2, targets: ['theirs'], pay: true }),
    ).toThrow();
  });

  test('X = 3: a copy of the Idol', () => {
    const g = gardens(3);
    g.act(0).activate('gardens', { ability: 2, x: 3, targets: ['idol'], pay: true });
    g.passAll();
    g.expect.derived('gardens', { types: ['artifact'] });
  });
});

describe('Emry, Lurker of the Loch: "You may cast that card this turn" (CR 601.2, 611.2a)', () => {
  const emry = (seats: 2 | 3 | 4) =>
    table(seats, (b) => {
      b.battlefield(EMRY.name, { label: 'emry' })
        .graveyard(TRINKET.name, BEAR.name)
        .battlefield('Island', { count: 2 });
      if (seats > 2) b.seat(2).graveyard(GADGET.name);
    });

  test('the lowering is a mayCast of the target card, until end of turn', () => {
    const ability = EMRY.faces[0]?.abilities.find((a) => a.kind === 'activated');
    expect(JSON.stringify(ability)).toContain('"kind":"mayCast"');
  });

  test('the artifact card of my graveyard may be cast this turn, paying its cost', () => {
    const g = emry(4);
    g.act(0).activate('emry', { targets: [{ name: TRINKET.name, zone: 'graveyard', seat: 0 }] });
    g.passAll();
    g.act(0).cast(TRINKET.name, { pay: true });
    g.passAll();
    g.expect.zone(TRINKET.name, 'battlefield', { seat: 0 });
  });

  test('only an artifact card of my own graveyard may be the target', () => {
    const g = emry(4);
    expect(() =>
      g.act(0).activate('emry', { targets: [{ name: BEAR.name, zone: 'graveyard', seat: 0 }] }),
    ).toThrow();
    expect(() =>
      g.act(0).activate('emry', { targets: [{ name: GADGET.name, zone: 'graveyard', seat: 2 }] }),
    ).toThrow();
  });

  test('a card that was not chosen may not be cast', () => {
    const g = emry(2);
    g.act(0).activate('emry', { targets: [{ name: TRINKET.name, zone: 'graveyard', seat: 0 }] });
    g.passAll();
    expect(() => g.act(0).cast(BEAR.name, { pay: true })).toThrow();
  });
});

describe('Wake the Past: every artifact card of my graveyard returns, with haste until end of turn', () => {
  test('only my artifact cards return; they have haste; the opponent graveyard and the other cards stay (four seats)', () => {
    const g = table(4, (b) => {
      b.hand(WAKE.name)
        .battlefield('Mountain', 'Plains', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest')
        .graveyard(TRINKET.name, GOLEM.name, BEAR.name);
      b.seat(3).graveyard(GADGET.name);
    });
    g.act(0).cast(WAKE.name, { pay: true });
    g.passAll();
    g.expect.zone(TRINKET.name, 'battlefield', { seat: 0 });
    g.expect.zone(GOLEM.name, 'battlefield', { seat: 0 });
    g.expect.zone(BEAR.name, 'graveyard', { seat: 0 });
    g.expect.zone(GADGET.name, 'graveyard', { seat: 3 });
    g.expect.derived(TRINKET.name, { keywords: ['haste'] });
    g.expect.derived(GOLEM.name, { keywords: ['haste'] });
  });

  test('the haste ends with the turn', () => {
    const g = table(2, (b) => {
      b.hand(WAKE.name)
        .battlefield('Mountain', 'Plains', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest')
        .graveyard(GOLEM.name);
    });
    g.act(0).cast(WAKE.name, { pay: true });
    g.passAll();
    g.advanceTo('end');
    g.advanceTo('upkeep', { attack: false });
    g.expect.derived(GOLEM.name, { keywords: [] });
  });
});

describe('Cloud Key: a card type chosen as it enters, and spells of that type cost {1} less (CR 205.2a, 607.2d, 601.2f)', () => {
  test('the question offers the five card types the card lists, not every card type', () => {
    const g = table(2, (b) => {
      b.hand(KEY.name).battlefield('Island', { count: 3 });
    });
    g.act(0).cast(KEY.name, { pay: true });
    g.passAll();
    const d = g.state.pending;
    expect(d?.kind).toBe('chooseOption');
    if (d?.kind !== 'chooseOption') return;
    expect(d.options).toEqual(['artifact', 'creature', 'enchantment', 'instant', 'sorcery']);
  });

  test('a card type that is not on the list cannot be chosen', () => {
    const g = table(2, (b) => {
      b.hand(KEY.name).battlefield('Island', { count: 3 });
    });
    g.act(0).cast(KEY.name, { pay: true });
    g.passAll();
    expect(() => g.act(0).chooseOption('land')).toThrow();
    g.act(0).chooseOption('instant');
    expect(g.state.objects[g.id(KEY.name)]?.chosen).toEqual({ cardType: 'instant' });
  });

  test('the words "of the chosen type" stay the creature type on a card that chooses a creature type', () => {
    const lord = parsed(
      'SYNTHETIC Herald',
      'Artifact',
      'As ~ enters, choose a creature type.\nCreature spells you cast of the chosen type cost {1} less to cast.',
      { manaCost: '{3}' },
    );
    expect(JSON.stringify(lord.faces[0]?.abilities)).toContain('"chosenType":true');
    expect(JSON.stringify(lord.faces[0]?.abilities)).not.toContain('chosenCardType');
  });

  const withKey = (type: 'creature' | 'artifact', seats: 2 | 3 | 4 = 2) =>
    table(seats, (b) => {
      b.battlefield(KEY.name, { chosen: { cardType: type } })
        .hand(BEAR.name, GADGET.name)
        .battlefield('Forest');
      if (seats > 2) b.seat(1).hand(BEAR.name).battlefield('Forest');
    });

  test('after choosing creature: a creature spell costs {1} less (the Bear is {1}{G}, one Forest pays it) (four seats)', () => {
    const g = withKey('creature', 4);
    g.act(0).cast(BEAR.name, { pay: true });
    g.passAll();
    g.expect.zone(BEAR.name, 'battlefield', { seat: 0 });
  });

  test('after choosing creature: an artifact spell is not reduced (the Gadget is {2}, one Forest cannot pay it)', () => {
    const g = withKey('creature');
    expect(() => g.act(0).cast(GADGET.name, { pay: true })).toThrow();
  });

  test('after choosing artifact: the artifact spell is reduced and the creature spell is not', () => {
    const g = withKey('artifact');
    expect(() => g.act(0).cast(BEAR.name, { pay: true })).toThrow();
    g.act(0).cast(GADGET.name, { pay: true });
    g.passAll();
    g.expect.zone(GADGET.name, 'battlefield', { seat: 0 });
  });

  test('"spells you cast": the Bear of an opponent still costs {1}{G} (three seats)', () => {
    const g = withKey('creature', 3);
    g.advanceTo('end');
    g.advanceTo('precombatMain');
    expect(() => g.act(1).cast(BEAR.name, { pay: true })).toThrow();
  });
});

describe('Darksteel Reactor: a state trigger on twenty charge counters wins the game (CR 603.8, 104.2b)', () => {
  test('the lowering is a state trigger of the permanent itself', () => {
    const ability = REACTOR.faces[0]?.abilities.find(
      (a) => a.kind === 'triggered' && a.trigger.kind === 'state',
    );
    expect(ability).toBeDefined();
  });

  test('nineteen counters do nothing, the upkeep counter makes twenty and its controller wins (four seats)', () => {
    const b = scenario({ seats: 4 });
    for (const card of ALL) b.define(card);
    for (let seat = 0; seat < 4; seat += 1) b.seat(seat).library(...LIBRARY);
    b.seat(0).battlefield(REACTOR.name, { label: 'reactor', counters: { charge: 19 } });
    const g = b.at('end', { active: 3, turn: 2 }).build();
    g.advanceTo('upkeep');
    expect(g.state.result).toBeNull();
    g.passAll();
    // The upkeep trigger: "you may put a charge counter".
    g.act(0).accept();
    g.passAll();
    g.expect.counters('reactor', { charge: 20 });
    expect(g.state.result).toMatchObject({ kind: 'win', winner: 0 });
  });

  test('the counter is optional: declined, the Reactor stays at nineteen and nobody wins', () => {
    const b = scenario({ seats: 3 });
    for (const card of ALL) b.define(card);
    for (let seat = 0; seat < 3; seat += 1) b.seat(seat).library(...LIBRARY);
    b.seat(0).battlefield(REACTOR.name, { label: 'reactor', counters: { charge: 19 } });
    const g = b.at('end', { active: 2, turn: 2 }).build();
    g.advanceTo('upkeep');
    g.passAll();
    g.act(0).decline();
    g.passAll();
    g.expect.counters('reactor', { charge: 19 });
    expect(g.state.result).toBeNull();
  });

  test('the Reactor of an opponent makes that opponent the winner', () => {
    const b = scenario({ seats: 3 });
    for (const card of ALL) b.define(card);
    for (let seat = 0; seat < 3; seat += 1) b.seat(seat).library(...LIBRARY);
    b.seat(2).battlefield(REACTOR.name, { counters: { charge: 19 } });
    const g = b.at('end', { active: 1, turn: 2 }).build();
    g.advanceTo('upkeep');
    g.passAll();
    g.act(2).accept();
    g.passAll();
    expect(g.state.result).toMatchObject({ kind: 'win', winner: 2 });
  });
});

describe('Depthshaker Titan: noncreature artifacts become 3/3 artifact creatures until the next end step, and artifact creatures get melee, trample and haste', () => {
  const titan = (seats: 2 | 3 | 4) =>
    table(seats, (b) => {
      b.hand(TITAN.name)
        .battlefield('Mountain', { count: 7 })
        .battlefield(TRINKET.name, { label: 'trinket' })
        .battlefield(IDOL.name, { label: 'idol' })
        .battlefield(GOLEM.name, { label: 'golem' });
      if (seats > 2) b.seat(2).battlefield(GADGET.name, { label: 'theirs' });
    });

  test('the abilities: a trigger that sets types for good and a delayed sacrifice, and a static grant of three keywords', () => {
    const grants = TITAN.faces[0]?.abilities.filter((a) => a.kind === 'static');
    expect(JSON.stringify(grants)).toContain('melee');
    expect(JSON.stringify(TITAN.faces[0]?.abilities)).toContain('"kind":"delayedTrigger"');
  });

  test('any number of noncreature artifacts I control: two become 3/3 artifact creatures with haste, melee and trample; the Golem is not a target', () => {
    const g = titan(4);
    g.act(0).cast(TITAN.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets('trinket', 'idol');
    g.passAll();
    for (const label of ['trinket', 'idol']) {
      g.expect.derived(label, {
        types: ['artifact', 'creature'],
        keywords: ['melee', 'trample', 'haste'],
      });
      g.expect.pt(label, 3, 3);
    }
    // The Titan itself and the Golem are artifact creatures too: they get the keywords but are not changed.
    g.expect.derived(TITAN.name, { keywords: ['melee', 'trample', 'haste'] });
    g.expect.pt('golem', 2, 2);
    g.expect.invariants();
  });

  test('nothing of an opponent is affected, and with no target chosen the ability does nothing and no sacrifice is waiting', () => {
    const g = titan(4);
    g.act(0).cast(TITAN.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets();
    g.passAll();
    g.expect.derived('trinket', { types: ['artifact'] });
    g.expect.derived('theirs', { types: ['artifact'] });
    expect(g.state.delayedTriggers).toHaveLength(0);
  });

  test('they are sacrificed at the beginning of the next end step, and the Golem stays', () => {
    const g = titan(3);
    g.act(0).cast(TITAN.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets('trinket', 'idol');
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(TRINKET.name, 'graveyard', { seat: 0 });
    g.expect.zone(IDOL.name, 'graveyard', { seat: 0 });
    g.expect.zone(GOLEM.name, 'battlefield', { seat: 0 });
    g.expect.zone(TITAN.name, 'battlefield', { seat: 0 });
  });

  test('melee: an animated artifact that attacks one opponent gets +1/+1, two of them attacking two opponents get +2/+2 each (CR 702.121a)', () => {
    const g = titan(4);
    g.act(0).cast(TITAN.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets('trinket', 'idol');
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([
      { attacker: 'trinket', target: { player: 1 } },
      { attacker: 'idol', target: { player: 2 } },
    ]);
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    g.expect.pt('trinket', 5, 5);
    g.expect.pt('idol', 5, 5);
  });
});

describe('Ripples of Potential: proliferate, then any number of my permanents that got a counter phase out (CR 701.34a, 702.26a)', () => {
  const ripples = (seats: 2 | 3 | 4) =>
    table(seats, (b) => {
      b.hand(RIPPLES.name)
        .battlefield('Island', { count: 2 })
        .battlefield(BEAR.name, { label: 'a', counters: { '+1/+1': 1 } })
        .battlefield(ANGEL.name, { label: 'b', counters: { '+1/+1': 1 } })
        .battlefield(TRINKET.name, { label: 'c', counters: { charge: 1 } });
      b.seat(1).battlefield(BEAR.name, { label: 'theirs', counters: { '+1/+1': 1 } });
      if (seats > 2) b.seat(2).battlefield(GADGET.name, { label: 'far', counters: { charge: 1 } });
    });

  test('only the permanents I proliferated and control that got a counter are offered; the ones I choose phase out and the rest stay', () => {
    const g = ripples(4);
    g.act(0).cast(RIPPLES.name, { pay: true });
    g.passAll();
    const first = g.state.pending;
    expect(first?.kind).toBe('choosePermanent');
    if (first?.kind !== 'choosePermanent') return;
    expect(first.purpose).toBe('proliferate');
    // a and c of mine and theirs and far are proliferated; b is not.
    g.choose({
      kind: 'choosePermanents',
      objects: [g.id('a'), g.id('c'), g.id('theirs'), g.id('far')],
      players: [],
    });
    const second = g.state.pending;
    expect(second?.kind).toBe('choosePermanent');
    if (second?.kind !== 'choosePermanent') return;
    expect([...second.legal].sort()).toEqual([g.id('a'), g.id('c')].sort());
    expect(second.min).toBe(0);
    g.act(0).choosePermanents('a');
    g.expect.counters('a', { '+1/+1': 2 });
    g.expect.counters('c', { charge: 2 });
    g.expect.counters('theirs', { '+1/+1': 2 });
    expect(g.view(0).phasedOut?.map((o) => o.id)).toEqual([g.id('a')]);
    // b was never proliferated: it is on the battlefield with its single counter.
    g.expect.counters('b', { '+1/+1': 1 });
    expect(g.state.objects[g.id('theirs')]?.zone).toBe('battlefield');
  });

  test('choosing none phases nothing out', () => {
    const g = ripples(2);
    g.act(0).cast(RIPPLES.name, { pay: true });
    g.passAll();
    g.choose({ kind: 'choosePermanents', objects: [g.id('a')], players: [] });
    g.act(0).choosePermanents();
    expect(g.view(0).phasedOut ?? []).toHaveLength(0);
    g.expect.counters('a', { '+1/+1': 2 });
  });

  test('a permanent of mine that was not proliferated is not offered: when only an opponent permanent got a counter nothing is asked', () => {
    const g = ripples(3);
    g.act(0).cast(RIPPLES.name, { pay: true });
    g.passAll();
    g.choose({ kind: 'choosePermanents', objects: [g.id('theirs')], players: [] });
    expect(g.state.pending?.kind).not.toBe('choosePermanent');
    expect(g.view(0).phasedOut ?? []).toHaveLength(0);
  });
});
