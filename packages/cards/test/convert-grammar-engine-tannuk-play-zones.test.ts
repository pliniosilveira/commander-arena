// Playing cards from other zones (the Tannuk deck, group "play zones"): Rydia, Summoner of Mist ("Return target Saga card with mana value X from your graveyard to the battlefield with a
// finality counter on it. It gains haste until end of turn."), Oracle of Mul Daya ("Play with the top card of your library revealed." and "You may play lands from the top of your
// library.") and Conduit of Worlds ("... you may cast that card. If you do, you can't cast additional spells this turn."). The first block parses the REAL Oracle text of each card from
// the golden corpus, whole; the rest run the abilities through `applyAction` with the scenario DSL, on SYNTHETIC support cards (every synthetic name starts with "SYNTHETIC").
import { readFileSync } from 'node:fs';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const CORPUS = new URL('./fixtures/corpus/golden.jsonl', import.meta.url);
const GOLDEN: readonly GoldenCard[] = parseGolden(readFileSync(CORPUS, 'utf8'));

const real = (name: string) => {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  return importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
};

const LIB = Array.from({ length: 14 }, () => 'Plains');
const base = () =>
  scenario()
    .seat(0)
    .library(...LIB)
    .seat(1)
    .library(...LIB)
    .seat(0);

describe('the real cards, whole', () => {
  test.each(['Rydia, Summoner of Mist', 'Oracle of Mul Daya', 'Conduit of Worlds'])(
    '%s is supported',
    (name) => {
      const imported = real(name);
      expect(imported.support.unparsed).toEqual([]);
      expect(imported.support.reasons).toEqual([]);
      expect(imported.support.status).toBe('supported');
    },
  );
});

describe('Rydia, Summoner of Mist: Saga card with mana value X from the graveyard', () => {
  const RYDIA = real('Rydia, Summoner of Mist').definition;
  const saga = (name: string, manaCost: string, cmc: number) => {
    const imported = parseOnly(
      syntheticCard(
        {
          name,
          manaCost,
          typeLine: 'Enchantment — Saga',
          oracleText: 'I — You gain 1 life.\nII — You gain 1 life.\nIII — You gain 1 life.',
          colors: ['G'],
        },
        { layout: 'saga', colorIdentity: ['G'], cmc },
      ),
    );
    expect(imported.support.reasons).toEqual([]);
    expect(imported.support.status).toBe('supported');
    return imported.definition;
  };
  const SAGA2 = saga('SYNTHETIC Two Saga', '{1}{G}', 2);
  const SAGA3 = saga('SYNTHETIC Three Saga', '{2}{G}', 3);

  const build = () =>
    base()
      .define(RYDIA)
      .define(SAGA2)
      .define(SAGA3)
      .battlefield(RYDIA.name, { label: 'rydia' })
      .battlefield('Forest', 'Forest', 'Forest', 'Forest')
      .graveyard(SAGA2.name, SAGA3.name)
      .at('precombatMain')
      .build();

  test('X = 2 returns the mana value 2 Saga with a finality counter, and not the other', () => {
    const g = build();
    g.act(0).activate(RYDIA.name, { ability: 1, x: 2, targets: [SAGA2.name], pay: true });
    g.passAll();
    const back = g.view(0).battlefield.find((o) => o.name === SAGA2.name);
    expect(back).toBeDefined();
    expect(back?.counters.finality).toBe(1);
    // "It gains haste until end of turn": the Saga that came back has it.
    expect(back?.keywords).toContain('haste');
    expect(g.view(0).seats[0]?.graveyard.map((o) => o.name)).toEqual([SAGA3.name]);
  });

  test('only a Saga whose mana value is the X announced is a legal target', () => {
    const g = build();
    g.expect.legal(0, { activate: RYDIA.name, ability: 1 });
    g.act(0).activate(RYDIA.name, { ability: 1, x: 1 });
    expect(g.legalActions(0).some((a) => a.kind === 'chooseTargets')).toBe(false);
  });

  test('with no Saga in the graveyard it cannot be activated, and only at sorcery speed', () => {
    const g = base()
      .define(RYDIA)
      .battlefield(RYDIA.name)
      .battlefield('Forest', 'Forest')
      .at('precombatMain')
      .build();
    g.expect.illegal(0, { activate: RYDIA.name, ability: 1 });
  });

  test('the ability is a sorcery: not offered at the beginning of combat', () => {
    const g = base()
      .define(RYDIA)
      .define(SAGA2)
      .battlefield(RYDIA.name)
      .battlefield('Forest', 'Forest')
      .graveyard(SAGA2.name)
      .at('beginningOfCombat')
      .build();
    g.expect.illegal(0, { activate: RYDIA.name, ability: 1 });
  });
});

describe('Oracle of Mul Daya: the top card of the library, revealed and playable as a land', () => {
  const ORACLE = real('Oracle of Mul Daya').definition;
  const withTop = (...top: string[]) =>
    scenario()
      .define(ORACLE)
      .seat(0)
      .library(...top, ...LIB)
      .battlefield(ORACLE.name)
      .seat(1)
      .library(...LIB)
      .seat(0)
      .at('precombatMain');

  test('every player sees the top card of the library: it is in the view of the opponent too', () => {
    const g = withTop('Forest').build();
    expect(g.view(0).seats[0]?.libraryTop?.name).toBe('Forest');
    expect(g.view(1).seats[0]?.libraryTop?.name).toBe('Forest');
    // The opponent has no such permanent: nobody sees the top of their library.
    expect(g.view(0).seats[1]?.libraryTop).toBeUndefined();
    expect(g.view(1).seats[1]?.libraryTop).toBeUndefined();
  });

  test('a library nobody reveals shows no top card', () => {
    const g = scenario()
      .seat(0)
      .library('Forest', ...LIB)
      .seat(1)
      .library(...LIB)
      .seat(0)
      .at('precombatMain')
      .build();
    expect(g.view(0).seats[0]?.libraryTop).toBeUndefined();
    expect(g.view(1).seats[0]?.libraryTop).toBeUndefined();
  });

  test('a land on top may be played; the next card is revealed, and a second land needs the additional land play', () => {
    const g = withTop('Forest', 'Island', 'Mountain').build();
    g.expect.legal(0, { playLand: 'Forest' });
    g.act(0).playLand('Forest');
    expect(g.view(0).battlefield.some((o) => o.name === 'Forest')).toBe(true);
    expect(g.view(0).seats[0]?.libraryTop?.name).toBe('Island');
    // "You may play an additional land on each of your turns": the second land of the turn is the new top card.
    g.expect.legal(0, { playLand: 'Island' });
    g.act(0).playLand('Island');
    expect(g.view(0).seats[0]?.libraryTop?.name).toBe('Mountain');
    // Two lands is all a single Oracle gives (CR 305.2): the third is not offered.
    g.expect.illegal(0, { playLand: 'Mountain' });
  });

  test('a card on top that is not a land cannot be played as one', () => {
    const g = withTop('Grizzly Bears').build();
    g.expect.illegal(0, { playLand: 'Grizzly Bears' });
  });

  test('two Oracles give three land plays (ruling 2009-10-01)', () => {
    const g = scenario()
      .define(ORACLE)
      .seat(0)
      .library('Forest', 'Island', 'Mountain', 'Swamp', ...LIB)
      .battlefield(ORACLE.name)
      .battlefield(ORACLE.name)
      .seat(1)
      .library(...LIB)
      .seat(0)
      .at('precombatMain')
      .build();
    g.act(0).playLand('Forest');
    g.act(0).playLand('Island');
    g.act(0).playLand('Mountain');
    g.expect.illegal(0, { playLand: 'Swamp' });
  });

  test("only in the controller's own main phase, as for any land (CR 305.3, 116.2a)", () => {
    const g = scenario()
      .define(ORACLE)
      .seat(0)
      .library('Forest', ...LIB)
      .battlefield(ORACLE.name)
      .seat(1)
      .library(...LIB)
      .seat(0)
      .at('beginningOfCombat')
      .build();
    g.expect.illegal(0, { playLand: 'Forest' });
  });

  test("the opponent cannot play lands from the top of the Oracle controller's library", () => {
    const g = withTop('Forest').build();
    expect(g.legalActions(1).some((a) => a.kind === 'playLand')).toBe(false);
    // The Oracle's controller has it, with the one land play of the turn still unused.
    expect(g.legalActions(0).some((a) => a.kind === 'playLand')).toBe(true);
  });

  test('the permission is gone without the Oracle', () => {
    const g = scenario()
      .seat(0)
      .library('Forest', ...LIB)
      .seat(1)
      .library(...LIB)
      .seat(0)
      .at('precombatMain')
      .build();
    g.expect.illegal(0, { playLand: 'Forest' });
  });
});

describe('Conduit of Worlds: cast a nonland permanent card from the graveyard, and lands from the graveyard', () => {
  const CONDUIT = real('Conduit of Worlds').definition;
  const BEARS = 'Grizzly Bears'; // {1}{G}: a 2/2 creature
  const BOLT = 'Lightning Bolt';

  const start = (
    graveyard: readonly string[],
    opts: {
      hand?: readonly string[];
      lands?: readonly string[];
      at?: 'precombatMain' | 'beginningOfCombat';
    } = {},
  ) =>
    scenario()
      .define(CONDUIT)
      .seat(0)
      .battlefield(CONDUIT.name)
      .battlefield(...(opts.lands ?? ['Forest', 'Forest', 'Mountain']))
      .hand(...(opts.hand ?? []))
      .graveyard(...graveyard)
      .library(...LIB)
      .seat(1)
      .library(...LIB)
      .at(opts.at ?? 'precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid and its second ability is a sorcery-speed tap ability', () => {
    const ability = CONDUIT.faces[0]?.abilities.find((a) => a.kind === 'activated');
    expect(ability).toMatchObject({ kind: 'activated', timing: 'sorcery' });
  });

  test('a land card and an instant card are no target (only a nonland permanent card is)', () => {
    const g = start(['Forest', BOLT]);
    g.expect.illegal(0, { activate: CONDUIT.name, ability: 1 });
  });

  test('with no spell cast this turn the card may be cast as the ability resolves; then no other spell can be cast', () => {
    const g = start([BEARS], { hand: [BOLT] });
    g.act(0).activate(CONDUIT.name, { ability: 1, targets: [BEARS], pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.act(0).payAuto();
    // CR 608.2g: the creature spell is on the stack, controlled by seat 0.
    g.expect.stack([BEARS]);
    // "You can't cast additional spells this turn": the Bolt in hand is not castable, in any step.
    g.expect.illegal(0, { cast: BOLT });
    g.passAll();
    expect(g.view(0).battlefield.some((o) => o.name === BEARS)).toBe(true);
    g.expect.illegal(0, { cast: BOLT });
  });

  test('declining the cast leaves the card in the graveyard and does not stop other spells', () => {
    const g = start([BEARS], { hand: [BOLT] });
    g.act(0).activate(CONDUIT.name, { ability: 1, targets: [BEARS], pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).decline();
    expect(g.view(0).seats[0]?.graveyard.map((o) => o.name)).toEqual([BEARS]);
    g.expect.legal(0, { cast: BOLT });
  });

  test('a spell already cast this turn: no question is asked, the card stays, and the ability does nothing more (ruling 2023-02-04)', () => {
    const g = start([BEARS], {
      hand: [BOLT, 'Island'],
      lands: ['Forest', 'Forest', 'Mountain', 'Mountain'],
    });
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.act(0).activate(CONDUIT.name, { ability: 1, targets: [BEARS], pay: true });
    g.passAll();
    // The Bolt is in the graveyard beside the Bears: the ability cast nothing and asked nothing.
    expect(g.view(0).seats[0]?.graveyard.map((o) => o.name)).toContain(BEARS);
    expect(g.view(0).battlefield.some((o) => o.name === BEARS)).toBe(false);
    expect(g.state.pending?.kind).toBe('priority');
  });

  test('a card that cannot be paid for is not offered (a creature of a color the lands cannot make)', () => {
    const g = start([BEARS], { lands: ['Mountain', 'Mountain'] });
    g.act(0).activate(CONDUIT.name, { ability: 1, targets: [BEARS], pay: true });
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    expect(g.view(0).seats[0]?.graveyard.map((o) => o.name)).toEqual([BEARS]);
  });

  test('the ability is a sorcery: not at the beginning of combat', () => {
    const g = start([BEARS], { at: 'beginningOfCombat' });
    g.expect.illegal(0, { activate: CONDUIT.name, ability: 1 });
  });

  test('"You may play lands from your graveyard": a land card there is played as the land play of the turn (ruling 2023-02-04)', () => {
    const g = start(['Forest', 'Island']);
    g.expect.legal(0, { playLand: 'Forest' });
    g.act(0).playLand('Forest');
    expect(g.view(0).battlefield.filter((o) => o.name === 'Forest').length).toBe(3);
    // Only one land per turn: the other is not offered.
    expect(g.legalActions(0).some((a) => a.kind === 'playLand')).toBe(false);
  });
});

describe('"You can\'t cast additional spells this turn" lasts to the end of the turn only', () => {
  const CONDUIT = real('Conduit of Worlds').definition;

  test('the restriction is gone in the next turn', () => {
    const g = scenario()
      .define(CONDUIT)
      .seat(0)
      .battlefield(CONDUIT.name)
      .battlefield('Forest', 'Forest', 'Mountain')
      .hand('Lightning Bolt')
      .graveyard('Grizzly Bears')
      .library(...LIB)
      .seat(1)
      .library(...LIB)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(CONDUIT.name, { ability: 1, targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.act(0).accept();
    g.act(0).payAuto();
    g.expect.illegal(0, { cast: 'Lightning Bolt' });
    g.passAll();
    g.expect.illegal(0, { cast: 'Lightning Bolt' });
    // The effect lasts until end of turn only: in seat 0's next main phase the Bolt may be cast again.
    for (
      let i = 0;
      i < 80 &&
      !(
        g.state.turn.number > 3 &&
        g.state.turn.activeSeat === 0 &&
        g.state.turn.step === 'precombatMain'
      );
      i += 1
    ) {
      g.passAll();
    }
    expect(g.state.turn.number).toBeGreaterThan(3);
    expect(g.state.continuousEffects.some((e) => e.change.kind === 'playerCantCastSpells')).toBe(
      false,
    );
    g.expect.legal(0, { cast: 'Lightning Bolt' });
  });
});

describe('what the grammar lowers for the three cards, and the near misses it does not read', () => {
  const artifact = (text: string) =>
    parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Parsed Refused',
        typeLine: 'Artifact',
        manaCost: '{2}',
        oracleText: text,
      }),
    ).support.status;
  const CONDUIT_LINE =
    "{T}: Choose target nonland permanent card in your graveyard. If you haven't cast a spell this turn, you may cast that card. If you do, you can't cast additional spells this turn. Activate only as a sorcery.";

  test('Conduit of Worlds: a test, the question of castCard, and the restriction that follows only if the card was cast', () => {
    const ability = real('Conduit of Worlds').definition.faces[0]?.abilities[1];
    expect(ability).toMatchObject({
      kind: 'activated',
      timing: 'sorcery',
      targets: [
        {
          what: {
            kind: 'object',
            filter: { zone: 'graveyard', controller: 'you' },
          },
        },
      ],
      effect: {
        kind: 'conditional',
        condition: { kind: 'not', term: { kind: 'spellsCastThisTurn', atLeast: 1 } },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'castCard', object: { kind: 'target', id: 't1' } },
            {
              kind: 'conditional',
              condition: { kind: 'didPrevious' },
              effect: {
                kind: 'playerCantCastSpells',
                player: { kind: 'you' },
                duration: 'untilEndOfTurn',
              },
            },
          ],
        },
      },
    });
  });

  test('the same text is supported as a synthetic artifact (the near misses below change one thing each)', () => {
    expect(artifact(CONDUIT_LINE)).toBe('supported');
  });

  test.each([
    // the card is not a card of your graveyard
    "{T}: Untap target creature. If you haven't cast a spell this turn, you may cast that card. If you do, you can't cast additional spells this turn.",
    "{T}: Choose target nonland permanent card in a graveyard. If you haven't cast a spell this turn, you may cast that card. If you do, you can't cast additional spells this turn.",
    // another test, another restriction, a second instruction joined to the offer
    "{T}: Choose target nonland permanent card in your graveyard. If you haven't cast a spell this game, you may cast that card. If you do, you can't cast additional spells this turn.",
    "{T}: Choose target nonland permanent card in your graveyard. If you haven't cast a spell this turn, you may cast that card and draw a card. If you do, you can't cast additional spells this turn.",
    "{T}: Choose target nonland permanent card in your graveyard. If you haven't cast a spell this turn, you may cast that card. If you do, you can't cast spells this turn.",
    "{T}: Choose target nonland permanent card in your graveyard. If you haven't cast a spell this turn, you may cast that card. If you do, your opponents can't cast additional spells this turn.",
    // "if you do" after nothing that was done
    "{T}: Choose target nonland permanent card in your graveyard. If you do, you can't cast additional spells this turn.",
  ])('is not supported: %s', (text) => {
    expect(artifact(text)).not.toBe('supported');
  });

  test('Rydia: the Saga card with mana value X is a target the X announced picks, and the saga returns with a finality counter and haste', () => {
    const ability = real('Rydia, Summoner of Mist').definition.faces[0]?.abilities[1];
    expect(ability).toMatchObject({
      kind: 'activated',
      targets: [
        {
          what: {
            kind: 'object',
            filter: { zone: 'graveyard', subtypes: ['Saga'], controller: 'you', manaValueX: true },
          },
        },
      ],
    });
  });

  const rydiaLike = (text: string) =>
    parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Parsed Refused',
        typeLine: 'Creature — Human Shaman',
        manaCost: '{R}{G}',
        power: '1',
        toughness: '2',
        oracleText: text,
      }),
    ).support.status;

  test('the Rydia shape with the real words is supported; the near misses are not', () => {
    expect(
      rydiaLike(
        '{X}, {T}: Return target Saga card with mana value X from your graveyard to the battlefield with a finality counter on it. It gains haste until end of turn. Activate only as a sorcery.',
      ),
    ).toBe('supported');
    // no X to read in the cost
    expect(
      rydiaLike(
        '{T}: Return target Saga card with mana value X from your graveyard to the battlefield with a finality counter on it.',
      ),
    ).not.toBe('supported');
    // "or less" is another reading
    expect(
      rydiaLike(
        '{X}, {T}: Return target Saga card with mana value X or less from your graveyard to the battlefield.',
      ),
    ).not.toBe('supported');
  });
});
