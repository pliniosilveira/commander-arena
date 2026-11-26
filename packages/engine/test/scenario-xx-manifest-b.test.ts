// What the manifest cards of the Jump Scare! deck ask of the engine besides manifest itself (group B). Pins: CR 614.1c, 614.12 and 122.6 (a replacement effect of a permanent gives
// the colorless creatures that enter after it counters, not itself and not what entered with it; a face-down permanent is colorless), CR 603.4 (the intervening "if you control no
// face-down permanents" is read when the ability triggers and when it resolves), CR 701.40a ("Manifest a card from your hand"), CR 608.2c and 400.7j ("that creature" is what manifest
// dread made), CR 611.2c and 613.1f (an ability given to the creatures there are as the effect resolves, until end of turn), CR 701.40g and 708.8 (turning a permanent face up by an effect).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-manifest-b.ts, synthetic-manifest.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import type { GameObject } from '../src/index';
import { isFeatureSupported, syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { chooseCardsDecision, chooseOptionDecision } from './pending-helpers';
import { graveyardNames } from './scry-helpers';

const BOON = 'SYNTHETIC Colorless Boon';
const GLITCH = 'SYNTHETIC Glitch Reader';
const SCROLL = 'SYNTHETIC Hand Scroll';
const SACRIFICER = 'SYNTHETIC Dread Sacrificer';
const BRUTE = 'SYNTHETIC Dread Brute';
const HALL = 'SYNTHETIC Unmasking Hall';
const SELF = 'SYNTHETIC Manifest Self'; // sorcery: manifest the top card of your library
const MAKER = 'SYNTHETIC Manifest Maker'; // creature, green: manifests when it enters
const VANILLA = 'SYNTHETIC Manifest Brute'; // {3}{G} 4/4, a creature card
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

const faceDownObjects = (g: ScenarioGame): GameObject[] =>
  Object.values(g.state.objects).flatMap((o) =>
    o !== undefined && o.zone === 'battlefield' && o.faceDown !== undefined ? [o] : [],
  );

describe('the cards and the new pieces are known to the engine', () => {
  test.each([BOON, GLITCH, SCROLL, SACRIFICER, BRUTE, HALL])('%s is valid', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('the features are listed as supported', () => {
    expect(isFeatureSupported('selector:faceDown')).toBe(true);
    expect(isFeatureSupported('ability:manifestFromHand')).toBe(true);
    expect(isFeatureSupported('effect:turnFaceUp')).toBe(true);
  });

  test('a face-down filter on a card in a zone other than the battlefield is refused', () => {
    const card = syntheticCard(GLITCH);
    const bad = {
      ...card,
      faces: card.faces.map((f) => ({
        ...f,
        abilities: [
          {
            kind: 'triggered' as const,
            trigger: { kind: 'entersBattlefield' as const, what: { kind: 'this' as const } },
            effect: {
              kind: 'draw' as const,
              player: { kind: 'you' as const },
              count: 1,
            },
            interveningIf: {
              kind: 'controlsAtLeast' as const,
              filter: { zone: 'graveyard' as const, facing: 'down' as const },
              count: 1,
            },
          },
        ],
      })),
    };
    expect(validateCard(bad).length).toBeGreaterThan(0);
  });
});

describe('colorless creatures enter with additional counters (CR 614.1c, 122.6)', () => {
  const game = (hand: string, library: readonly string[] = FILLER): ScenarioGame =>
    scenario()
      .seat(0)
      .hand(hand)
      .pool('GGGGGG')
      .battlefield(BOON)
      .library(...library)
      .seat(1)
      .library('Plains')
      .build();

  test('a manifested creature is colorless: it enters with two +1/+1 counters and is a 4/4', () => {
    const g = game(SELF);
    g.act(0).cast(SELF, { pay: true });
    g.passAll();
    const [down] = faceDownObjects(g);
    expect(down?.counters).toEqual({ '+1/+1': 2 });
    g.expect.invariants();
  });

  test('a colored creature enters with none', () => {
    const g = game(MAKER);
    g.act(0).cast(MAKER, { pay: true });
    g.passAll();
    g.expect.counters(MAKER, {});
  });

  test('the creature with the ability does not give itself counters', () => {
    const g = scenario()
      .seat(0)
      .hand(BOON)
      .pool('GGGGGG')
      .library(...FILLER)
      .seat(1)
      .build();
    g.act(0).cast(BOON, { pay: true });
    g.passAll();
    g.expect.counters(BOON, {});
  });

  test('without it a manifested creature has no counters', () => {
    const g = scenario()
      .seat(0)
      .hand(SELF)
      .pool('GGG')
      .library(...FILLER)
      .seat(1)
      .build();
    g.act(0).cast(SELF, { pay: true });
    g.passAll();
    const [down] = faceDownObjects(g);
    expect(down?.counters ?? {}).toEqual({});
  });
});

describe('"if you control no face-down permanents" (CR 603.4)', () => {
  const game = (extra: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>) =>
    extra(
      scenario()
        .seat(0)
        .hand(GLITCH)
        .pool('UUU')
        .library('Island', { label: 'a' })
        .library('Forest', { label: 'b' })
        .library(...FILLER),
    )
      .seat(1)
      .library('Plains')
      .build();

  test('with none: it goes back to the hand and its controller manifests dread', () => {
    const g = game((b) => b);
    g.act(0).cast(GLITCH, { pay: true });
    g.passAll();
    g.expect.zone(GLITCH, 'hand', { seat: 0 });
    expect(chooseCardsDecision(g).purpose).toBe('lookTake');
    g.act(0).chooseCards('b');
    expect(faceDownObjects(g)).toHaveLength(1);
    expect(graveyardNames(g, 0)).toEqual(['Island']);
  });

  test('with one: the ability does not trigger at all', () => {
    const g = game((b) => b.battlefield(VANILLA, { faceDown: true }));
    g.act(0).cast(GLITCH, { pay: true });
    g.passAll();
    g.expect.zone(GLITCH, 'battlefield', { seat: 0 });
    g.expect.pending('priority', 0);
    expect(faceDownObjects(g)).toHaveLength(1);
  });

  test("a face-down permanent of another player doesn't matter", () => {
    const g = scenario()
      .seat(0)
      .hand(GLITCH)
      .pool('UUU')
      .library('Island', { label: 'a' })
      .library('Forest', { label: 'b' })
      .library(...FILLER)
      .seat(1)
      .battlefield(VANILLA, { faceDown: true })
      .library('Plains')
      .build();
    g.act(0).cast(GLITCH, { pay: true });
    g.passAll();
    g.expect.zone(GLITCH, 'hand', { seat: 0 });
  });
});

describe('"Manifest a card from your hand" (CR 701.40a)', () => {
  const game = (hand: readonly string[]): ScenarioGame => {
    let b = scenario()
      .seat(0)
      .battlefield(SCROLL)
      .library(...FILLER);
    for (const name of hand) b = b.hand(name);
    return b.seat(1).library('Plains').build();
  };

  test('the player chooses the card; it enters face down as a 2/2 creature they control', () => {
    const g = game([VANILLA, 'Island']);
    g.act(0).activate(SCROLL);
    g.passAll();
    const d = chooseCardsDecision(g);
    expect(d.zone).toBe('hand');
    expect(d.min).toBe(1);
    expect(d.max).toBe(1);
    g.act(0).chooseCards(VANILLA);
    const [down] = faceDownObjects(g);
    expect(down?.controller).toBe(0);
    expect(down?.faceDown?.by).toBe('manifest');
    g.expect.pt(VANILLA, 2, 2);
    g.expect.zone('Island', 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test('with one card in hand nobody is asked', () => {
    const g = game([VANILLA]);
    g.act(0).activate(SCROLL);
    g.passAll();
    g.expect.pending('priority', 0);
    expect(faceDownObjects(g)).toHaveLength(1);
  });

  test('with no card in hand nothing happens', () => {
    const g = game([]);
    g.act(0).activate(SCROLL);
    g.passAll();
    expect(faceDownObjects(g)).toHaveLength(0);
  });

  test('a manifested creature card can be turned face up for its mana cost (CR 701.40b)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(SCROLL)
      .hand(VANILLA)
      .pool('GGGG')
      .library(...FILLER)
      .seat(1)
      .library('Plains')
      .build();
    g.act(0).activate(SCROLL);
    g.passAll();
    g.expect.legal(0, { turnFaceUp: VANILLA });
  });
});

describe('"face-up nontoken creatures you control gain ... until end of turn" (CR 611.2c, 613.1f)', () => {
  const game = (
    extra: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario> = (b) => b,
  ) =>
    extra(
      scenario()
        .seat(0)
        .battlefield(SACRIFICER)
        .battlefield('Grizzly Bears')
        .battlefield(VANILLA, { faceDown: true, label: 'down' })
        .hand('Lightning Bolt')
        .pool('RR')
        .library(...FILLER),
    )
      .seat(1)
      .library('Plains')
      .build();

  test('a face-up nontoken creature that dies manifests the top card of its controller library', () => {
    const g = game();
    g.act(0).activate(SACRIFICER);
    g.passAll();
    expect(faceDownObjects(g)).toHaveLength(1);
    g.act(0).cast('Lightning Bolt', { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    // The trigger manifested a card: the one face-down creature there was and the new one.
    expect(faceDownObjects(g)).toHaveLength(2);
    g.expect.librarySize(0, FILLER.length - 1);
    g.expect.invariants();
  });

  test('a face-down creature did not gain it: it dies and nothing is manifested', () => {
    const g = game();
    g.act(0).activate(SACRIFICER);
    g.passAll();
    g.act(0).cast('Lightning Bolt', { targets: ['down'], pay: true });
    g.passAll();
    expect(faceDownObjects(g)).toHaveLength(0);
    g.expect.librarySize(0, FILLER.length);
  });

  test('the creature with the ability is sacrificed to pay for it and gets nothing', () => {
    const g = game();
    g.act(0).activate(SACRIFICER);
    g.expect.zone(SACRIFICER, 'graveyard', { seat: 0 });
  });

  test('without the activation a dying creature manifests nothing', () => {
    const g = game();
    g.act(0).cast('Lightning Bolt', { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    expect(faceDownObjects(g)).toHaveLength(1);
  });
});

describe('manifest dread, then counters on "that creature" (CR 608.2c, 400.7j)', () => {
  test('the manifested creature gets the counters; the card put into the graveyard does not', () => {
    const g = scenario()
      .seat(0)
      .hand(BRUTE)
      .pool('GGGGG')
      .library('Island', { label: 'a' })
      .library('Forest', { label: 'b' })
      .library(...FILLER)
      .seat(1)
      .library('Plains')
      .build();
    g.act(0).cast(BRUTE, { pay: true });
    g.passAll();
    g.act(0).chooseCards('b');
    const [down] = faceDownObjects(g);
    expect(down?.counters).toEqual({ '+1/+1': 2, trample: 1 });
    g.expect.invariants();
  });
});

describe('"turn that creature face up or put a +1/+1 counter on it" (CR 701.40g, 708.8)', () => {
  const attack = (chosen: 'up' | 'counter'): ScenarioGame => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(HALL)
      .battlefield(VANILLA, { faceDown: true, label: 'down' })
      .library(...FILLER)
      .seat(1)
      .life(20)
      .library('Plains')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(['down']);
    g.advanceTo('combatDamage');
    expect(g.state.stack.length).toBe(1);
    g.pass();
    g.pass();
    expect(chooseOptionDecision(g).options).toEqual([
      'turn that creature face up',
      'put a +1/+1 counter on that creature',
    ]);
    g.act(0).chooseOption(
      chosen === 'up' ? 'turn that creature face up' : 'put a +1/+1 counter on that creature',
    );
    g.passAll();
    return g;
  };

  test('turn it face up: the same object with the characteristics of its card, no cost paid', () => {
    const g = attack('up');
    expect(faceDownObjects(g)).toHaveLength(0);
    g.expect.pt(VANILLA, 4, 4);
    g.expect.life(1, 18);
    g.expect.invariants();
  });

  test('or put a +1/+1 counter on it: it stays face down', () => {
    const g = attack('counter');
    const [down] = faceDownObjects(g);
    expect(down?.counters).toEqual({ '+1/+1': 1 });
  });
});
