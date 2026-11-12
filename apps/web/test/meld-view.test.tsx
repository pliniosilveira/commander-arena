/**
 * A melded permanent in the web app (D-991, D-992, D-996; CR 701.42a, 712.4a, 712.8g, 712.21, 903.9c): one object with the combined face, drawn as that card, with a flag, an accessible name
 * and a preview row that say what it is made of; the log says that two cards melded and that one permanent died as two cards; the words of the ability, the condition and the static ability
 * of the pair are written from the engine's data. Cards are SYNTHETIC (the engine's fixtures `SYNTHETIC Dusk Squire`, `SYNTHETIC Dawn Squire` and their combined face).
 */
import type { GameState, ObjectView } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { gameConditionWords } from '../src/game/condition-text';
import { describeEvents } from '../src/game/describe';
import { lordWording } from '../src/game/static-text';
import { artOf } from '../src/ui/board/art';
import { MeldList } from '../src/ui/board/PreviewPanel';
import { commanderZoneDetail } from '../src/ui/decisions/commander-zone';
import { faceFacts, isMelded, meldedFrom } from '../src/ui/decisions/layouts';

const DUSK = 'SYNTHETIC Dusk Squire';
const DAWN = 'SYNTHETIC Dawn Squire';
const TITAN = 'SYNTHETIC Twilight Titan';

const build = () =>
  scenario()
    .seat(0)
    .battlefield(DUSK, { label: 'dusk', meldedWith: 'dawn' })
    .battlefield(DAWN, { label: 'dawn' })
    .battlefield('Swamp', 'Swamp', 'Swamp', 'Plains')
    .hand('Murder')
    .library('Island', { count: 8 })
    .seat(1)
    .library('Island', { count: 8 })
    .build();

const meldedView = (): ObjectView => {
  const g = build();
  const view = g.view(0).battlefield.find((o) => o.meld !== undefined);
  if (view === undefined) throw new Error('no melded permanent in the view');
  return view;
};

describe('the object', () => {
  test('is one object with the combined face, named by it, with what it is made of', () => {
    const o = meldedView();
    expect(o.name).toBe(TITAN);
    expect(isMelded(o)).toBe(true);
    expect(meldedFrom(o)).toBe(`${DUSK} and ${DAWN}`);
    // The pair is not shown as a card with two faces (CR 712.4b): it has one face, the combined one.
    expect(o.faces).toBeUndefined();
    expect(o.layout).toBeUndefined();
  });

  test('is drawn as the combined face, a card of its own, never as a front half (D-991)', () => {
    expect(artOf(meldedView())).toEqual({ name: TITAN, back: false });
  });

  test('says in the preview that it is two cards and one permanent, with the mana value of the front faces together (CR 202.3c)', () => {
    const facts = faceFacts(meldedView());
    expect(facts).toContain(`Two cards, one permanent (melded from ${DUSK} and ${DAWN})`);
    expect(facts).toContain('Mana value 5, the front faces together');
  });

  test('the preview lists the two cards, each with its cost, type line and text', () => {
    const html = renderToStaticMarkup(<MeldList object={meldedView()} />);
    expect(html).toContain('aria-label="Melded from"');
    expect(html.indexOf(DUSK)).toBeLessThan(html.indexOf(DAWN));
    expect(html).toContain('{2}{W} · Creature — Human Knight');
    expect(html).toContain('{1}{B} · Creature — Human Cleric');
    expect(html).toContain('Vigilance');
  });

  test('an object that is not melded has none of it', () => {
    const g = build();
    const land = g.view(0).battlefield.find((o) => o.name === 'Swamp');
    expect(land && isMelded(land)).toBe(false);
    expect(land && faceFacts(land)).toEqual([]);
    expect(renderToStaticMarkup(<MeldList object={land as ObjectView} />)).toBe('');
  });

  test('a meld card in the hand is its front face, one card (CR 712.4b)', () => {
    const g = scenario()
      .seat(0)
      .hand(DUSK)
      .library('Island', { count: 8 })
      .seat(1)
      .library('Island', { count: 8 })
      .build();
    const card = g.view(0).seats[0]?.hand?.find((o) => o.name === DUSK);
    expect(card && artOf(card)).toEqual({ name: DUSK, back: false });
    expect(card?.faces).toBeUndefined();
    expect(card && isMelded(card)).toBe(false);
  });
});

describe('the log', () => {
  /** The lines the human reads for the events a step of the scenario produced. */
  function lines(
    before: GameState,
    after: GameState,
    events: Parameters<typeof describeEvents>[0],
  ) {
    return describeEvents(events, before, after, 0, { kind: 'pass' } as never).map((l) => l.text);
  }

  test('two cards meld into one permanent: one line says it, and the entry is not logged once for each card', () => {
    const g = scenario()
      .seat(0)
      .battlefield(DUSK)
      .battlefield(DAWN)
      .library('Island', { count: 8 })
      .seat(1)
      .library('Island', { count: 8 })
      .build();
    const before = g.state;
    const mark = g.mark();
    g.advanceTo('end');
    g.passAll();
    const text = lines(before, g.state, g.eventsSince(mark));
    expect(text.filter((t) => t.includes('meld into'))).toEqual([
      `${DUSK} and ${DAWN} meld into ${TITAN}.`,
    ]);
    expect(text.filter((t) => t.includes('exile to battlefield'))).toEqual([]);
  });

  test('the melded permanent dies once and two cards go to the graveyard', () => {
    const g = build();
    const before = g.state;
    const mark = g.mark();
    g.act(0).cast('Murder', { targets: ['dusk'], pay: true });
    g.passAll();
    const text = lines(before, g.state, g.eventsSince(mark));
    expect(text.filter((t) => t === `${TITAN} dies.`)).toHaveLength(1);
    expect(text.filter((t) => t === `${DUSK} goes to the graveyard.`)).toHaveLength(1);
    expect(text.filter((t) => t === `${DAWN} goes to the graveyard.`)).toHaveLength(1);
  });
});

describe('the words of the pair', () => {
  test('the condition: the card and a creature of that name, both owned and controlled', () => {
    expect(
      gameConditionWords({
        kind: 'ownsAndControlsNamed',
        name: 'Bruna, the Fading Light',
        type: 'creature',
      }),
    ).toBe('you both own and control this permanent and a creature named Bruna, the Fading Light');
  });

  test('the static ability of the combined face', () => {
    expect(
      lordWording(
        {
          kind: 'opponentsCantCastSpells',
          spells: { manaValue: { cmp: 'atMost', value: 3 } },
        },
        {} as never,
      ),
    ).toBe("Your opponents can't cast spells with mana value 3 or less");
  });
});

describe('the commander question (CR 903.9b, 903.9c)', () => {
  const meld = {
    components: [{ name: 'Bruna, the Fading Light' }, { name: 'Gisela, the Broken Blade' }],
    manaValue: 11,
  } as unknown as ObjectView['meld'];

  test('says that only the commander card goes to the command zone and the other card goes where the permanent would have gone', () => {
    const text = commanderZoneDetail('Brisela, Voice of Nightmares', 'hand', 'battlefield', meld);
    expect(text).toContain('would be put into your hand');
    expect(text).toContain(
      'It is a melded permanent: if you do, only Bruna, the Fading Light goes there, and Gisela, the Broken Blade goes into your hand (CR 903.9c).',
    );
  });

  test('says nothing of the sort for a card already in the graveyard (CR 903.9a: the cards are two objects there)', () => {
    expect(
      commanderZoneDetail('Bruna, the Fading Light', 'graveyard', 'graveyard', meld),
    ).not.toContain('melded permanent');
  });
});
