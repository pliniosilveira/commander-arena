// "Target creature you control gains protection from the color of your choice until end of turn." and "Target creature gains protection from red until end of turn."
// (the Feather deck, issue 27, group 1: D-1301 the color chosen as the effect resolves, D-1302 an effect that gives protection).
// Pins: CR 702.16a-b (a creature with protection from a color can't be targeted by spells or abilities of that color), CR 702.16e (damage from sources of the color is
// prevented), CR 608.2d (the choice an effect gives is made as the effect is applied, not when the spell is cast), CR 608.2b (a spell whose targets are all illegal does not
// resolve, so asks nothing), CR 611.2a, 611.2c (a continuous effect of a resolving spell lasts until end of turn and affects what the group named when it began), CR 613.1f
// (the grant is a layer 6 ability), CR 702.16j (protection from different qualities are separate abilities).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-feather-g1.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import type { ObjectId } from '../src/ids';
import {
  applyAction,
  type ChooseOptionDecision,
  type PendingDecision,
  syntheticCard,
  validateCard,
} from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const WARD = 'SYNTHETIC Feather Ward'; // {W} instant: target creature you control gains protection from the color of your choice until end of turn
const RALLY = 'SYNTHETIC Feather Rally'; // {1}{W} instant: creatures you control gain protection from the color of your choice until end of turn
const VEIL = 'SYNTHETIC Feather Veil'; // {W} instant: target creature gains protection from red until end of turn
const BOLT = 'Lightning Bolt'; // {R} instant: 3 damage to any target
const BEARS = 'Grizzly Bears'; // 2/2 green
const SPIDER = 'Giant Spider'; // 2/4 green, reach
const GOBLIN = 'Raging Goblin'; // 1/1 red, haste
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const question = (g: ScenarioGame): ChooseOptionDecision => {
  const d = g.state.pending;
  if (d?.kind !== 'chooseOption') throw new Error(`expected chooseOption, got ${d?.kind}`);
  return d;
};

/** Seat 0 holds the Ward and a creature; seat 1 holds a Bolt and a red creature. Seat 0 is the active player in its first main phase. */
function board(extra: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario> = (b) => b) {
  return extra(
    scenario()
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .hand(WARD)
      .battlefield('Plains', 'Plains', 'Plains')
      .battlefield(BEARS, { label: 'mine' }),
  )
    .seat(1)
    .life(20)
    .library(...LIBRARY)
    .hand(BOLT)
    .battlefield('Mountain', 'Mountain')
    .battlefield(GOBLIN, { label: 'goblin' })
    .at('precombatMain', { active: 0, priority: 0 })
    .build();
}

/** The objects the engine offers as targets of the first slot of `card`, cast by `seat`. */
function legalTargetsOf(g: ScenarioGame, seat: 0 | 1, card: string): ObjectId[] {
  g.act(seat).cast(card);
  const d: PendingDecision | null = g.state.pending;
  if (d?.kind !== 'targets') return [];
  return (d.specs[0]?.legal ?? []).flatMap((t) => (t.kind === 'object' ? [t.id] : []));
}

describe('the cards are valid', () => {
  test.each([WARD, RALLY, VEIL])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  /** The card with the keyword of its grant replaced. */
  const withKeyword = (name: string, keyword: unknown) => {
    const card = syntheticCard(name);
    const face = card.faces[0];
    const spell = face?.spell;
    if (face === undefined || spell === null || spell === undefined) throw new Error('no spell');
    const effect = { ...(spell.effect as object), keyword };
    return { ...card, faces: [{ ...face, spell: { ...spell, effect } }] } as never;
  };

  test('an effect may give protection from named colors or card types, and from the color of the controller’s choice', () => {
    expect(
      validateCard(withKeyword(VEIL, { kind: 'protection', from: 'color', colors: ['R', 'U'] })),
    ).toEqual([]);
    expect(
      validateCard(
        withKeyword(VEIL, { kind: 'protection', from: 'cardType', types: ['artifact'] }),
      ),
    ).toEqual([]);
    expect(validateCard(withKeyword(VEIL, { kind: 'protection', from: 'colorOfChoice' }))).toEqual(
      [],
    );
  });

  test('protection from no color, an unknown color or an unknown type is refused', () => {
    expect(
      validateCard(withKeyword(VEIL, { kind: 'protection', from: 'color', colors: [] })).length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(withKeyword(VEIL, { kind: 'protection', from: 'color', colors: ['X'] })).length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(withKeyword(VEIL, { kind: 'protection', from: 'cardType', types: [] })).length,
    ).toBeGreaterThan(0);
  });

  test('the qualities that read a choice made as a permanent entered or a commander need a static ability, not an effect', () => {
    for (const from of ['chosenCardType', 'colorsNotInCommanderIdentity']) {
      expect(
        validateCard(withKeyword(VEIL, { kind: 'protection', from })).map((i) => i.message),
      ).toContainEqual(expect.stringContaining('only a static ability can'));
    }
  });

  test('the color of your choice is refused as a printed keyword and in a static ability: nothing there asks', () => {
    const ability = (a: unknown) => {
      const card = syntheticCard('SYNTHETIC Vanilla 3/3');
      const face = card.faces[0];
      if (face === undefined) throw new Error('no face');
      return { ...card, faces: [{ ...face, abilities: [a] }] } as never;
    };
    const printed = validateCard(
      ability({ kind: 'keyword', keyword: { kind: 'protection', from: 'colorOfChoice' } }),
    );
    expect(printed.length).toBeGreaterThan(0);
    const granted = validateCard(
      ability({
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'this' },
          keyword: { kind: 'protection', from: 'colorOfChoice' },
        },
      }),
    );
    expect(granted.map((i) => i.message).join(' ')).toContain('only a grantKeyword effect');
  });
});

describe('protection from the color of your choice (CR 702.16, 608.2d)', () => {
  test('nothing is asked as the spell is cast: it goes on the stack with the target and no color (a player cannot respond knowing it)', () => {
    const g = board();
    g.act(0).cast(WARD, { targets: ['mine'], pay: true });
    g.expect.stack([WARD]);
    g.expect.pending('priority', 0);
  });

  test('as it resolves the controller is asked for one of the five colors, and the question names what is protected', () => {
    const g = board();
    g.act(0).cast(WARD, { targets: ['mine'], pay: true });
    g.passAll();
    const d = question(g);
    expect(d).toMatchObject({
      seat: 0,
      purpose: 'protectionColor',
      options: ['W', 'U', 'B', 'R', 'G'],
      sourceName: WARD,
      protects: [g.id('mine')],
    });
    expect(
      g
        .legalActions(0)
        .filter((a) => a.kind === 'chooseOption')
        .map((a) => (a.kind === 'chooseOption' ? a.option : '')),
    ).toEqual(['W', 'U', 'B', 'R', 'G']);
    expect(g.legalActions(1)).toEqual([]);
  });

  test('the answer gives protection from that color until end of turn, and the log says what was chosen', () => {
    const g = board();
    g.act(0).cast(WARD, { targets: ['mine'], pay: true });
    g.passAll();
    g.act(0).chooseOption('R');
    g.expect.derived('mine', { keywords: ['protection'] });
    g.expect.pending('priority', 0);
    g.expect.eventLog([{ kind: 'optionChosen', purpose: 'protectionColor', option: 'R', seat: 0 }]);
    g.expect.invariants();
  });

  test('protection from red: a red spell cannot target the creature any more, a green creature’s ability still could', () => {
    const g = board();
    g.act(0).cast(WARD, { targets: ['mine'], pay: true });
    g.passAll();
    g.act(0).chooseOption('R');
    g.act(0).pass();
    expect(legalTargetsOf(g, 1, BOLT)).not.toContain(g.id('mine'));
  });

  test('protection from green does not stop the red Bolt (the creature is a legal target)', () => {
    const g = board();
    g.act(0).cast(WARD, { targets: ['mine'], pay: true });
    g.passAll();
    g.act(0).chooseOption('G');
    g.act(0).pass();
    expect(legalTargetsOf(g, 1, BOLT)).toContain(g.id('mine'));
  });

  test('cast in response to a Bolt aimed at the creature: choosing red makes the target illegal, the Bolt does not resolve and the creature lives', () => {
    const g = board();
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: ['mine'], pay: true });
    g.act(1).pass();
    g.act(0).cast(WARD, { targets: ['mine'], pay: true });
    g.passAll();
    g.act(0).chooseOption('R');
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.damage('mine', 0);
    g.expect.zone(BOLT, 'graveyard', { seat: 1 });
    g.expect.derived('mine', { keywords: ['protection'] });
    g.expect.invariants();
  });

  test('cast in response to a Bolt, choosing the wrong color (white) saves nothing: the Bolt kills the creature', () => {
    const g = board();
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: ['mine'], pay: true });
    g.act(1).pass();
    g.act(0).cast(WARD, { targets: ['mine'], pay: true });
    g.passAll();
    g.act(0).chooseOption('W');
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });

  test('a creature with protection from red cannot be blocked by a red creature (CR 702.16f); with protection from green it can', () => {
    const attacked = (color: string) => {
      const g = board();
      g.act(0).cast(WARD, { targets: ['mine'], pay: true });
      g.passAll();
      g.act(0).chooseOption(color);
      g.passAll();
      g.advanceTo('declareAttackers', { attack: false });
      g.act(0).attack('mine');
      g.passAll();
      return g;
    };
    // The only creature that could block is red: with protection from red there is no legal block, so the blockers are not even asked.
    expect(attacked('R').state.pending?.kind).toBe('priority');
    const g = attacked('G');
    expect(g.state.pending?.kind).toBe('declareBlockers');
    expect(g.act(1).try.declareBlockers([{ blocker: 'goblin', attacker: 'mine' }]).ok).toBe(true);
  });

  test('the protection ends with the turn', () => {
    const g = board();
    g.act(0).cast(WARD, { targets: ['mine'], pay: true });
    g.passAll();
    g.act(0).chooseOption('R');
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.derived('mine', { keywords: [] });
  });

  test('an answer that is not one of the five colors is refused and the question stays', () => {
    const g = board();
    g.act(0).cast(WARD, { targets: ['mine'], pay: true });
    g.passAll();
    const before = g.state;
    const out = applyAction(before, 0, { kind: 'chooseOption', option: 'colorless' });
    expect(out.ok).toBe(false);
    expect(g.state.pending?.kind).toBe('chooseOption');
  });

  test('if the target is gone as the spell resolves the spell does not resolve and nothing is asked (CR 608.2b)', () => {
    const g = board();
    g.act(0).cast(WARD, { targets: ['mine'], pay: true });
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: ['mine'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(WARD, 'graveyard', { seat: 0 });
    g.expect.pending('priority', 0);
  });

  test('two spells with different colors give two protections: the creature has both (CR 702.16j)', () => {
    const g = board((b) => b.hand(WARD).battlefield('Plains'));
    g.act(0).cast(`${WARD}[1]`, { targets: ['mine'], pay: true });
    g.passAll();
    g.act(0).chooseOption('R');
    g.act(0).cast(WARD, { targets: ['mine'], pay: true });
    g.passAll();
    g.act(0).chooseOption('G');
    g.expect.derived('mine', { keywords: ['protection', 'protection'] });
    g.act(0).pass();
    expect(legalTargetsOf(g, 1, BOLT)).not.toContain(g.id('mine'));
  });
});

describe('"Creatures you control gain protection from the color of your choice until end of turn" (one choice for the group)', () => {
  test('one question, and every creature the player controls when the spell resolves gains the protection; the opponent’s creature does not', () => {
    const g = board((b) => b.hand(RALLY).battlefield(SPIDER, { label: 'spider' }));
    g.act(0).cast(RALLY, { pay: true });
    g.passAll();
    expect(question(g).protects).toEqual([g.id('mine'), g.id('spider')]);
    g.act(0).chooseOption('R');
    g.expect.derived('mine', { keywords: ['protection'] });
    g.expect.derived('spider', { keywords: ['protection', 'reach'] });
    g.expect.derived('goblin', { keywords: ['haste'] });
    g.expect.pending('priority', 0);
  });

  test('with no creature to protect nothing is asked', () => {
    const g = scenario()
      .seat(0)
      .hand(RALLY)
      .battlefield('Plains', 'Plains')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, priority: 0 })
      .build();
    g.act(0).cast(RALLY, { pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
  });
});

describe('"Target creature gains protection from red until end of turn" (an effect that names the color)', () => {
  test('nothing is asked: the creature has protection from red, so a red spell cannot target it', () => {
    const g = board((b) => b.hand(VEIL));
    g.act(0).cast(VEIL, { targets: ['mine'], pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
    g.expect.derived('mine', { keywords: ['protection'] });
    g.act(0).pass();
    expect(legalTargetsOf(g, 1, BOLT)).not.toContain(g.id('mine'));
  });

  test('it protects any creature, an opponent’s included', () => {
    const g = board((b) => b.hand(VEIL));
    g.act(0).cast(VEIL, { targets: ['goblin'], pay: true });
    g.passAll();
    g.expect.derived('goblin', { keywords: ['protection', 'haste'] });
  });
});
