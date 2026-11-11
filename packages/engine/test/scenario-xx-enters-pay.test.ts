// "As this land enters, you may pay 2 life. If you don't, it enters tapped." (a shock land)
// Pins: CR 614.1c ("As [this permanent] enters" is a replacement effect), CR 614.12 (it is applied
// as the permanent enters: the question is asked before the permanent is on the battlefield, so
// nothing sees it there yet), CR 119.4 (life can be paid only if the life total is at least the
// amount), CR 305.1 (playing a land is a special action and uses no stack), CR 608.3 and 608.2
// (a permanent spell becomes a permanent as it resolves; a resolving ability can stop for a
// decision and go on), CR 704.5a (0 life loses).
// All cards are SYNTHETIC (src/cards/fixtures/synthetic-mana.ts or this file) or the real
// fixtures named.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { getView, validateAbility, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { confirmOptionalDecision } from './pending-helpers';

const SHOCK = 'SYNTHETIC Shock Land';
const ROCK = 'SYNTHETIC Shock Rock';
const RECALL = 'SYNTHETIC Land Recall';

describe('a shock land played from the hand (CR 614.12)', () => {
  test('the question comes before the land enters, and says what it costs', () => {
    const g = scenario().seat(0).hand(SHOCK).seat(1).build();
    const inHand = g.id(SHOCK);
    g.act(0).playLand(SHOCK);
    const d = confirmOptionalDecision(g);
    expect(d.seat).toBe(0);
    expect(d.source).toBe(inHand);
    expect(d.sourceName).toBe(SHOCK);
    expect(d.sourceOracleText).toContain('you may pay 2 life');
    expect(d.cost).toEqual([{ kind: 'payLife', amount: 2 }]);
    // Still a card in the hand: nothing is on the battlefield, no land drop used, no life paid.
    g.expect.zone(SHOCK, 'hand', { seat: 0 });
    g.expect.noObject(SHOCK, { zone: 'battlefield' });
    expect(g.state.seats[0]?.landsPlayedThisTurn).toBe(0);
    g.expect.life(0, 40);
    g.expect.invariants();
  });

  test('accepting pays the life and the land enters untapped', () => {
    const g = scenario().seat(0).hand(SHOCK).seat(1).build();
    g.act(0).playLand(SHOCK);
    const before = g.mark();
    g.act(0).accept();
    g.expect.life(0, 38);
    g.expect.zone(SHOCK, 'battlefield', { seat: 0 });
    g.expect.tapped(SHOCK, false);
    expect(g.state.seats[0]?.landsPlayedThisTurn).toBe(1);
    g.expect.pending('priority', 0);
    g.expect.eventLog(
      [
        { kind: 'optionalAnswered', seat: 0, accepted: true },
        { kind: 'lifeChanged', seat: 0, from: 40, to: 38 },
        { kind: 'zoneChanged', fromZone: 'hand', toZone: 'battlefield' },
        { kind: 'landPlayed', seat: 0 },
      ],
      { since: before },
    );
    g.act(0).tapForMana(SHOCK, { color: 'R' });
    g.expect.pool(0, 'R');
  });

  test('declining keeps the life and the land enters tapped ("If you don\'t, it enters tapped")', () => {
    const g = scenario().seat(0).hand(SHOCK).seat(1).build();
    g.act(0).playLand(SHOCK);
    g.act(0).decline();
    g.expect.life(0, 40);
    g.expect.zone(SHOCK, 'battlefield', { seat: 0 });
    g.expect.tapped(SHOCK, true);
    expect(g.state.seats[0]?.landsPlayedThisTurn).toBe(1);
    g.expect.pending('priority', 0);
    g.expect.noEvent({ kind: 'lifeChanged' });
  });

  test('with less life than the cost nothing is asked: it enters tapped (CR 119.4)', () => {
    const g = scenario().seat(0).life(1).hand(SHOCK).seat(1).build();
    g.act(0).playLand(SHOCK);
    g.expect.pending('priority', 0);
    g.expect.tapped(SHOCK, true);
    g.expect.life(0, 1);
  });

  test('with exactly the cost it is asked; paying takes the player to 0 and they lose (CR 704.5a)', () => {
    const g = scenario().seat(0).life(2).hand(SHOCK).seat(1).build();
    g.act(0).playLand(SHOCK);
    confirmOptionalDecision(g);
    g.act(0).accept();
    g.expect.life(0, 0);
    g.expect.hasLost(0);
  });

  test('only accept, decline and concede answer it; a pass or a repeated land is refused', () => {
    const g = scenario().seat(0).hand(SHOCK, 'Forest').seat(1).build();
    g.act(0).playLand(SHOCK);
    const kinds = g.legalActions(0).map((a) => a.kind);
    expect(kinds.sort()).toEqual(['acceptOptional', 'concede', 'declineOptional']);
    expect(g.act(0).try.pass().ok).toBe(false);
    expect(g.act(0).try.playLand('Forest').ok).toBe(false);
    expect(g.legalActions(1)).toEqual([]);
    expect(g.act(1).try.action({ kind: 'acceptOptional' }).ok).toBe(false);
    g.expect.pending('confirmOptional', 0);
  });

  test('the opponent sees the question only as the deciding seat; the owner gets it in the view', () => {
    const g = scenario().seat(0).hand(SHOCK).seat(1).build();
    g.act(0).playLand(SHOCK);
    expect(getView(g.state, 0).pending?.kind).toBe('confirmOptional');
    expect(getView(g.state, 1).pending).toBeNull();
    expect(getView(g.state, 1).decidingSeat).toBe(0);
  });

  test('conceding while the question is open ends the game', () => {
    const g = scenario().seat(0).hand(SHOCK).seat(1).build();
    g.act(0).playLand(SHOCK);
    g.act(0).concede();
    g.expect.gameOver({ win: 1 });
  });

  test('landfall sees the land only after the answer (it was not on the battlefield before)', () => {
    const g = scenario()
      .seat(0)
      .hand(SHOCK)
      .battlefield('SYNTHETIC Landfall Tokenmaker')
      .seat(1)
      .build();
    g.act(0).playLand(SHOCK);
    g.expect.stack([]);
    g.act(0).accept();
    g.expect.stack(['SYNTHETIC Landfall Tokenmaker (ability)']);
  });

  test("it is asked of the land's controller: seat 1 on its own turn", () => {
    const g = scenario().seat(1).hand(SHOCK).at('precombatMain', { active: 1, turn: 4 }).build();
    g.act(1).playLand(SHOCK);
    expect(confirmOptionalDecision(g).seat).toBe(1);
    g.act(1).accept();
    g.expect.life(1, 38);
  });

  test('replaying the same actions gives the same state (determinism)', () => {
    const run = () => {
      const g = scenario().seat(0).hand(SHOCK).seat(1).build();
      g.act(0).playLand(SHOCK);
      g.act(0).accept();
      return g.hash();
    };
    expect(run()).toBe(run());
  });
});

describe('a permanent spell with the replacement: asked as it resolves (CR 608.3, 614.12)', () => {
  const resolving = () => {
    const g = scenario().seat(0).hand(ROCK).pool('C').seat(1).build();
    g.act(0).cast(ROCK, { pay: true });
    g.pass();
    g.pass();
    return g;
  };

  test('the spell waits on the stack while the controller is asked', () => {
    const g = resolving();
    const d = confirmOptionalDecision(g);
    expect(d.sourceName).toBe(ROCK);
    expect(d.cost).toEqual([{ kind: 'payLife', amount: 3 }]);
    g.expect.stack([ROCK]);
    expect(d.source).toBe(g.id({ name: ROCK, zone: 'stack' }));
    g.expect.noObject(ROCK, { zone: 'battlefield' });
  });

  test('accepting: the artifact enters untapped, the life is paid, the spell resolved', () => {
    const g = resolving();
    const before = g.mark();
    g.act(0).accept();
    g.expect.zone(ROCK, 'battlefield', { seat: 0 });
    g.expect.tapped(ROCK, false);
    g.expect.life(0, 37);
    g.expect.stack([]);
    g.expect.pending('priority', 0);
    g.expect.eventLog(
      [{ kind: 'lifeChanged', from: 40, to: 37 }, { kind: 'zoneChanged' }, { kind: 'resolved' }],
      {
        since: before,
      },
    );
    g.act(0).tapForMana(ROCK);
    g.expect.pool(0, 'CC');
  });

  test('declining: it enters tapped and the life is kept', () => {
    const g = resolving();
    g.act(0).decline();
    g.expect.tapped(ROCK, true);
    g.expect.life(0, 40);
    g.expect.stack([]);
  });

  test('with less life than the cost it enters tapped without a question', () => {
    const g = scenario().seat(0).life(2).hand(ROCK).pool('C').seat(1).build();
    g.act(0).cast(ROCK, { pay: true });
    g.pass();
    g.pass();
    g.expect.pending('priority', 0);
    g.expect.tapped(ROCK, true);
    g.expect.life(0, 2);
  });
});

describe('a land put onto the battlefield by a spell asks too (the move is part of the resolution)', () => {
  const recall = () => {
    const g = scenario().seat(0).hand(RECALL).pool('C').graveyard(SHOCK).seat(1).build();
    g.act(0).cast(RECALL, { targets: [SHOCK], pay: true });
    g.pass();
    g.pass();
    return g;
  };

  test('the question comes mid-resolution, before the land is on the battlefield', () => {
    const g = recall();
    const d = confirmOptionalDecision(g);
    expect(d.sourceName).toBe(SHOCK);
    g.expect.zone(SHOCK, 'graveyard', { seat: 0 });
    g.expect.stack([RECALL]);
  });

  test('accepting: untapped, 2 life paid, and the sorcery finishes (graveyard)', () => {
    const g = recall();
    g.act(0).accept();
    g.expect.tapped(SHOCK, false);
    g.expect.life(0, 38);
    g.expect.zone(RECALL, 'graveyard', { seat: 0 });
    g.expect.stack([]);
    g.expect.pending('priority', 0);
  });

  test('declining: tapped, no life paid, the sorcery still finishes', () => {
    const g = recall();
    g.act(0).decline();
    g.expect.tapped(SHOCK, true);
    g.expect.life(0, 40);
    g.expect.zone(RECALL, 'graveyard', { seat: 0 });
  });

  test('when the effect says "tapped", nothing is asked and nothing is paid', () => {
    const tappedRecall = singleFace({
      name: 'SYNTHETIC Tapped Recall',
      manaCost: null,
      types: ['sorcery'],
      colors: [],
      colorIdentity: [],
      oracleText:
        'SYNTHETIC Return target land card from your graveyard to the battlefield tapped.',
      spell: {
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'graveyard', types: ['land'], controller: 'you' },
            },
          },
        ],
        effect: {
          kind: 'moveToZone',
          objects: { kind: 'target', id: 't1' },
          to: 'battlefield',
          tapped: true,
          controller: 'you',
        },
      },
    });
    const g = scenario()
      .define(tappedRecall)
      .seat(0)
      .hand('SYNTHETIC Tapped Recall')
      .graveyard(SHOCK)
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Tapped Recall', { targets: [SHOCK] });
    g.passAll();
    g.expect.tapped(SHOCK, true);
    g.expect.life(0, 40);
    g.expect.pending('priority', 0);
  });
});

describe('it is not asked when the permanent enters tapped anyway', () => {
  test('an unconditional "enters tapped" on the same card makes the payment pointless', () => {
    const card = singleFace({
      name: 'SYNTHETIC Stubborn Land',
      manaCost: null,
      types: ['land'],
      colors: [],
      colorIdentity: [],
      oracleText: 'SYNTHETIC enters tapped. As it enters, you may pay 2 life.',
      abilities: [
        { kind: 'replacement', replacement: { kind: 'entersTapped' } },
        {
          kind: 'replacement',
          replacement: { kind: 'entersTappedUnlessPays', cost: [{ kind: 'payLife', amount: 2 }] },
        },
      ],
    });
    const g = scenario().define(card).seat(0).hand('SYNTHETIC Stubborn Land').seat(1).build();
    g.act(0).playLand('SYNTHETIC Stubborn Land');
    g.expect.pending('priority', 0);
    g.expect.tapped('SYNTHETIC Stubborn Land', true);
    g.expect.life(0, 40);
  });

  test('a condition that does not save it from entering tapped makes it skip the question too', () => {
    const card = singleFace({
      name: 'SYNTHETIC Crowded Shock',
      manaCost: null,
      types: ['land'],
      colors: [],
      colorIdentity: [],
      oracleText: 'SYNTHETIC',
      abilities: [
        {
          kind: 'replacement',
          replacement: { kind: 'entersTapped', unless: { kind: 'opponentsAtLeast', count: 2 } },
        },
        {
          kind: 'replacement',
          replacement: { kind: 'entersTappedUnlessPays', cost: [{ kind: 'payLife', amount: 2 }] },
        },
      ],
    });
    const g = scenario().define(card).seat(0).hand('SYNTHETIC Crowded Shock').seat(1).build();
    g.act(0).playLand('SYNTHETIC Crowded Shock');
    g.expect.pending('priority', 0);
    g.expect.tapped('SYNTHETIC Crowded Shock', true);
  });
});

describe('validation', () => {
  const ability = (cost: unknown) =>
    ({ kind: 'replacement', replacement: { kind: 'entersTappedUnlessPays', cost } }) as never;
  const paths = (cost: unknown) => validateAbility(ability(cost)).map((i) => i.path);

  test('payLife is accepted; the fixtures are valid supported cards', () => {
    expect(paths([{ kind: 'payLife', amount: 2 }])).toEqual([]);
    for (const name of [SHOCK, ROCK, RECALL]) {
      const def = scenario()
        .seat(0)
        .hand(name)
        .build()
        .state.definitions.find((d) => d.name === name);
      expect(def && validateCard(def), name).toEqual([]);
    }
  });

  test('any other cost, no cost, or no life is rejected', () => {
    expect(paths([{ kind: 'tap' }])).toEqual(['ability.replacement.cost[0]']);
    expect(paths([{ kind: 'discard', count: 1 }])).toEqual(['ability.replacement.cost[0]']);
    expect(paths([])).toEqual(['ability.replacement.cost']);
    expect(paths([{ kind: 'payLife', amount: 0 }])).toEqual(['ability.replacement.cost[0].amount']);
  });

  test('a token that asks as it enters is refused as unsupported (token creation cannot ask)', () => {
    const maker = singleFace({
      name: 'SYNTHETIC Shock Token Maker',
      manaCost: null,
      types: ['sorcery'],
      colors: [],
      colorIdentity: [],
      oracleText: 'SYNTHETIC',
      spell: {
        effect: {
          kind: 'createToken',
          count: 1,
          token: {
            kind: 'custom',
            definition: {
              name: 'Shock Token',
              manaCost: null,
              supertypes: [],
              types: ['artifact'],
              subtypes: [],
              colors: [],
              power: null,
              toughness: null,
              loyalty: null,
              defense: null,
              oracleText: '',
              abilities: [ability([{ kind: 'payLife', amount: 2 }])],
            },
          },
        },
      },
    });
    const messages = validateCard(maker).map((i) => i.message);
    expect(messages.join()).toContain('token that asks to pay');
  });
});
