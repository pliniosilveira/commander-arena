// The Prismari deck (issue 87), group 2: Renegade Bull, "Whenever ~ attacks, exile up to one target instant or sorcery card from your graveyard and copy it. You may cast the copy without
// paying its mana cost." (SYNTHETIC Charging Ox, src/cards/fixtures/synthetic-prismari-g2.ts). Pins: CR 707.12 (casting a copy of a card: the copy is created in the zone the card is
// in and cast while the ability resolves, following CR 601.2a-h), CR 608.2g (no player receives priority after it is cast; the ability goes on resolving), CR 707.2 (the copy has the
// copiable values of the card), CR 704.5e and 707.10a (a copy of a card in a zone other than the stack or the battlefield ceases to exist; a copy of a spell that leaves the stack
// ceases to exist), CR 601.2i (a copy that is cast is a spell cast: it triggers "whenever you cast"), CR 107.3b (X is 0 for a spell cast without paying its mana cost), CR 601.2c
// (targets are chosen as it is cast), CR 118.9 (without paying its mana cost), CR 733 (a cast can be taken back), CR 608.2b (an ability whose target is gone does nothing).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';
import { chooseCardsDecision } from './pending-helpers';

const OX = 'SYNTHETIC Charging Ox'; // 4/4 trample
const BOLT = 'Lightning Bolt'; // {R} instant, 3 damage to any target
const DIVINATION = 'Divination'; // {2}{U} sorcery, draw two
const BIG = 'SYNTHETIC Prismari Big Study'; // {4}{U}{U} sorcery, draw a card
const XSPELL = 'SYNTHETIC Prismari X Spell'; // {X}{R} instant, gain X life
const BEARS = 'Grizzly Bears';
const COUNTERSPELL = 'Counterspell';
const LIBRARY = Array.from({ length: 12 }, () => 'Island');

type Builder = ReturnType<typeof scenario>;

function build(graveyard: readonly string[], extra: (b: Builder) => void = () => {}) {
  const b = scenario()
    .seat(0)
    .library(...LIBRARY)
    .battlefield(OX, { label: 'ox' });
  for (const card of graveyard) b.graveyard(card);
  extra(b);
  return b
    .seat(1)
    .library(...LIBRARY)
    .battlefield(BEARS, { label: 'bears' })
    .at('precombatMain', { active: 0 })
    .build();
}

/** Attacks with the Ox and aims the trigger at `card` in seat 0's graveyard; the trigger is on the stack afterwards. */
function attackAt(g: ScenarioGame, card: string) {
  g.advanceTo('declareAttackers');
  g.act(0).attack('ox');
  if (g.state.pending?.kind === 'targets') {
    g.act(0).chooseTargets({ name: card, zone: 'graveyard', seat: 0 });
  }
}

const exiled = (g: ScenarioGame, name: string) =>
  g.find({ name, zone: 'exile', seat: 0 }).filter((o) => o.card !== null);
const graveyard = (g: ScenarioGame, name: string) => g.find({ name, zone: 'graveyard', seat: 0 });
/** Everything in the game that is a copy of a card (it is no card itself). */
const copies = (g: ScenarioGame) =>
  Object.values(g.state.objects).filter((o) => o.copyOf !== undefined && o.card === null);

describe('the card is valid', () => {
  test(OX, () => {
    expect(validateCard(syntheticCard(OX))).toEqual([]);
  });
});

describe('exile the card, copy it, cast the copy (CR 707.12)', () => {
  test('a Bolt: exiled, a copy is cast for free with a target, 3 damage; the original stays exiled, nothing is left in the graveyard', () => {
    const g = build([BOLT]);
    attackAt(g, BOLT);
    g.passAll();
    // The trigger resolved: the Bolt was exiled and the copy is offered.
    expect(exiled(g, BOLT)).toHaveLength(1);
    const d = chooseCardsDecision(g);
    expect(d.purpose).toBe('cast');
    expect(d.zone).toBe('exile');
    expect(d.legal).toHaveLength(1);
    expect(g.state.objects[d.legal[0] as `o${number}`]?.cardCopy).toBe(true);
    g.act(0).chooseCards(d.legal[0] as string);
    g.act(0).chooseTargets({ player: 1 });
    g.expect.stack([`${OX} (ability)`, BOLT]);
    g.passAll();
    g.expect.life(1, 37);
    // The copy ceased to exist when it left the stack; the card itself is still in exile and not in the graveyard.
    expect(exiled(g, BOLT)).toHaveLength(1);
    expect(graveyard(g, BOLT)).toHaveLength(0);
    expect(copies(g)).toHaveLength(0);
    g.expect.invariants();
  });

  test('the copy is cast without paying: no land was tapped for it', () => {
    const g = build([DIVINATION], (b) => b.battlefield('Island', { count: 3 }));
    attackAt(g, DIVINATION);
    g.passAll();
    g.act(0).chooseCards(chooseCardsDecision(g).legal[0] as string);
    g.passAll();
    expect(g.find({ name: 'Island', zone: 'battlefield', seat: 0 }).some((o) => o.tapped)).toBe(
      false,
    );
    expect(g.state.seats[0]?.hand).toHaveLength(2);
  });

  test('declining: the copy ceases to exist (CR 704.5e) and the card stays exiled', () => {
    const g = build([BOLT]);
    attackAt(g, BOLT);
    g.passAll();
    g.act(0).chooseCards();
    expect(exiled(g, BOLT)).toHaveLength(1);
    expect(graveyard(g, BOLT)).toHaveLength(0);
    // The state-based actions have run as the player got priority: no copy is left anywhere.
    expect(copies(g)).toHaveLength(0);
    g.expect.life(1, 40);
    g.expect.invariants();
  });

  test('"up to one": with no target chosen nothing is exiled and nothing is copied', () => {
    const g = build([BOLT]);
    g.advanceTo('declareAttackers');
    g.act(0).attack('ox');
    if (g.state.pending?.kind === 'targets') g.act(0).chooseTargets();
    g.passAll();
    expect(graveyard(g, BOLT)).toHaveLength(1);
    expect(copies(g)).toHaveLength(0);
    g.expect.pending('priority', 0);
  });

  test('a creature card is not a legal target; neither is a card in the opponent’s graveyard', () => {
    const g = build([BEARS], (b) => b.seat(1).graveyard(BOLT));
    g.advanceTo('declareAttackers');
    g.act(0).attack('ox');
    // No legal target: the trigger asks nothing and does nothing.
    g.passAll();
    expect(graveyard(g, BEARS)).toHaveLength(1);
    expect(g.find({ name: BOLT, zone: 'graveyard', seat: 1 })).toHaveLength(1);
    expect(copies(g)).toHaveLength(0);
  });

  test('X is 0 for a copy cast without paying its mana cost (CR 107.3b)', () => {
    const g = build([XSPELL]);
    attackAt(g, XSPELL);
    g.passAll();
    g.act(0).chooseCards(chooseCardsDecision(g).legal[0] as string);
    g.passAll();
    g.expect.life(0, 40);
    expect(copies(g)).toHaveLength(0);
  });

  test('the copy of a spell of mana value 6 is a spell cast: it triggers the Ox’s own "whenever you cast" for +6/+0 (CR 601.2i)', () => {
    const g = build([BIG]);
    attackAt(g, BIG);
    g.passAll();
    g.expect.pt('ox', 4, 4);
    g.act(0).chooseCards(chooseCardsDecision(g).legal[0] as string);
    // Cast: the cast trigger is on the stack above the copy.
    g.passAll();
    g.expect.pt('ox', 10, 4);
    g.expect.invariants();
  });

  test('a countered copy ceases to exist; the card stays exiled', () => {
    const g = build([BOLT], (b) =>
      b.seat(1).hand(COUNTERSPELL).battlefield('Island', { count: 2 }),
    );
    attackAt(g, BOLT);
    g.passAll();
    g.act(0).chooseCards(chooseCardsDecision(g).legal[0] as string);
    g.act(0).chooseTargets({ player: 1 });
    g.act(0).pass();
    g.act(1).cast(COUNTERSPELL, { pay: true, targets: [{ name: BOLT, zone: 'stack', seat: 0 }] });
    g.passAll();
    g.expect.life(1, 40);
    expect(exiled(g, BOLT)).toHaveLength(1);
    expect(graveyard(g, BOLT)).toHaveLength(0);
    expect(copies(g)).toHaveLength(0);
  });

  test('the cast can be taken back at its first question: the question is asked again (CR 733), the copy still there', () => {
    const g = build([BOLT]);
    attackAt(g, BOLT);
    g.passAll();
    const copy = chooseCardsDecision(g).legal[0] as string;
    g.act(0).chooseCards(copy);
    g.act(0).cancel();
    expect(chooseCardsDecision(g).legal).toEqual([copy]);
    g.act(0).chooseCards();
    expect(copies(g)).toHaveLength(0);
  });

  test('two cards in the graveyard: only the one aimed at is exiled and copied', () => {
    const g = build([BOLT, DIVINATION]);
    attackAt(g, DIVINATION);
    g.passAll();
    expect(exiled(g, DIVINATION)).toHaveLength(1);
    expect(graveyard(g, BOLT)).toHaveLength(1);
    expect(copies(g)).toHaveLength(1);
    expect(g.state.objects[copies(g)[0]?.id as `o${number}`]?.copyOf).toBe(
      exiled(g, DIVINATION)[0]?.card,
    );
  });
});
