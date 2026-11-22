// Urianger Augurelt: "Whenever you play a land from exile or cast a spell from exile, you gain 2 life.", "Draw Arcanum — {T}: Look at the top card of your library. You may exile it
// face down." and "Play Arcanum — {T}: Until end of turn, you may play cards exiled with ~. Spells you cast this way cost {2} less to cast." (CR 607.2a, 406.3, 601.2f, 118.7, 305.1,
// 603.2). The wording is the real one under a SYNTHETIC name.
import { validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Island', 'Plains', 'Swamp', 'Island'] as const;

const URIANGER = parsed(
  'SYNTHETIC Urianger',
  'Legendary Creature — Elf Advisor',
  'Whenever you play a land from exile or cast a spell from exile, you gain 2 life.\nDraw Arcanum — {T}: Look at the top card of your library. You may exile it face down.\nPlay Arcanum — {T}: Until end of turn, you may play cards exiled with ~. Spells you cast this way cost {2} less to cast.',
  { manaCost: '{W}{U}', power: '1', toughness: '3', colors: ['W', 'U'] },
);
const DRAW = { ability: 1 } as const;
const PLAY = { ability: 2 } as const;

const ready = (top: string) =>
  scenario()
    .define(URIANGER)
    .seat(0)
    .life(20)
    .hand('Grizzly Bears', 'Forest')
    .battlefield(URIANGER.name, 'Forest', 'Forest')
    .library(top, ...FILLER)
    .seat(1)
    .life(20)
    .library(...FILLER)
    .at('precombatMain', { active: 0 })
    .build();

/** Draw Arcanum with `top` as the top card, then on to the next turn of seat 0 (Urianger untaps). */
const exiled = (top: string) => {
  const g = ready(top);
  g.act(0).activate(URIANGER.name, DRAW);
  g.passAll();
  g.act(0).chooseCards(top);
  g.advanceTo('precombatMain', { turn: 'next' });
  g.advanceTo('precombatMain', { turn: 'next' });
  return g;
};

describe('Draw Arcanum: look at the top card of your library, you may exile it face down (CR 607.2a, 406.3)', () => {
  test('the card is exiled face down and only its controller can look at it', () => {
    const g = ready('Grizzly Bears');
    g.act(0).activate(URIANGER.name, DRAW);
    g.passAll();
    g.act(0).chooseCards('Grizzly Bears');
    const urianger = g.object(URIANGER.name);
    const bears = Object.values(g.state.objects).filter((o) => o.zone === 'exile');
    expect(bears).toHaveLength(1);
    // CR 607.2a: the permanent remembers the card it exiled, and CR 406.3: it is face down.
    expect(urianger.linkedExile).toEqual([bears[0]?.id]);
    expect(bears[0]?.hideaway).toBe(urianger.id);
    expect(g.state.seats[0]?.library.length).toBe(FILLER.length);
    g.expect.invariants();
  });

  test('declining leaves the card on top of the library', () => {
    const g = ready('Grizzly Bears');
    g.act(0).activate(URIANGER.name, DRAW);
    g.passAll();
    g.act(0).chooseCards();
    expect(g.state.seats[0]?.library.length).toBe(FILLER.length + 1);
    g.expect.noObject('Grizzly Bears', { zone: 'exile' });
  });
});

describe('Play Arcanum: play the cards exiled with it; spells cast this way cost {2} less (CR 601.2f, 118.7, 305.1)', () => {
  test('a spell is cast from exile for {2} less: {G} instead of {1}{G}', () => {
    const g = exiled('Grizzly Bears');
    g.act(0).activate(URIANGER.name, PLAY);
    g.passAll();
    g.act(0).cast({ name: 'Grizzly Bears', zone: 'exile' }, { pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    // {1}{G} less {2} is {G}: one Forest pays, the other stays untapped.
    expect(
      g.find({ name: 'Forest', zone: 'battlefield', seat: 0 }).filter((f) => !f.tapped),
    ).toHaveLength(1);
    g.expect.invariants();
  });

  test('there is no permission before the ability resolves', () => {
    const g = exiled('Grizzly Bears');
    expect(g.act(0).try.cast({ name: 'Grizzly Bears', zone: 'exile' }).ok).toBe(false);
  });

  test('a land is played from exile as the land drop', () => {
    const g = exiled('Forest');
    g.act(0).activate(URIANGER.name, PLAY);
    g.passAll();
    g.act(0).playLand({ name: 'Forest', zone: 'exile' });
    g.expect.zone('Forest', 'battlefield', { seat: 0, count: 3 });
  });
});

describe('"Whenever you play a land from exile or cast a spell from exile, you gain 2 life." (CR 603.2, 601.2, 305.1)', () => {
  test('casting a spell from exile gains 2 life', () => {
    const g = exiled('Grizzly Bears');
    g.act(0).activate(URIANGER.name, PLAY);
    g.passAll();
    g.act(0).cast({ name: 'Grizzly Bears', zone: 'exile' }, { pay: true });
    g.passAll();
    g.expect.life(0, 22);
  });

  test('playing a land from exile gains 2 life', () => {
    const g = exiled('Forest');
    g.act(0).activate(URIANGER.name, PLAY);
    g.passAll();
    g.act(0).playLand({ name: 'Forest', zone: 'exile' });
    g.passAll();
    g.expect.life(0, 22);
  });

  test('casting from the hand or playing a land from the hand gains nothing', () => {
    const g = ready('Island');
    g.act(0).playLand('Forest');
    g.act(0).cast('Grizzly Bears', { pay: true });
    g.passAll();
    g.expect.life(0, 20);
  });
});

describe('the validator reads the new fields', () => {
  const face = URIANGER.faces[0];
  if (face === undefined) throw new Error('no face');
  const messages = (patch: (json: string) => string) =>
    validateCard({
      ...URIANGER,
      faces: [{ ...face, abilities: JSON.parse(patch(JSON.stringify(face.abilities))) }],
    }).map((i) => i.message);

  test('the parsed card is valid', () => {
    expect(validateCard(URIANGER)).toEqual([]);
  });

  test('lessGeneric is a positive whole number', () => {
    expect(messages((j) => j.replace('"lessGeneric":2', '"lessGeneric":0'))).toContain(
      'lessGeneric must be a positive whole number',
    );
  });

  test('a free play has no cost to reduce', () => {
    expect(messages((j) => j.replace('"lessGeneric":2', '"lessGeneric":2,"free":true'))).toContain(
      'a free play has no cost to reduce',
    );
  });

  test('fromExile is true when present', () => {
    expect(messages((j) => j.replace('"fromExile":true', '"fromExile":false'))).toContain(
      'fromExile must be true when present',
    );
  });
});
