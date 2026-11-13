// #44: a triggered ability on the stack that reads "that card" (`triggerSubject`) says which object it is about in its view, so the question
// it asks ("you may pay {2}{U}") can name the card when several of the same trigger wait. Cards are SYNTHETIC (synthetic-hashaton-g5.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { getView } from '../src/index';
import { scenario } from '../src/testing/index';

const SCARAB = 'SYNTHETIC Scarab Fist'; // discard a creature card: may pay {2}{U}, a tapped 4/4 black Zombie copy of that card
const TIDY = 'SYNTHETIC Tidy Discard'; // {B} sorcery: discard a card
const FILLER = Array.from({ length: 14 }, () => 'Plains');

describe('the view of a trigger that reads the object whose event caused it', () => {
  test('names that object while the question of the trigger is open', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .hand(TIDY, 'Grizzly Bears')
      .battlefield(SCARAB, 'Island', 'Island', 'Island', 'Swamp', 'Swamp')
      .library(...FILLER)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(TIDY, { pay: true });
    g.passAll();
    if (g.state.pending?.kind === 'discard' || g.state.pending?.kind === 'chooseCards') {
      g.act(0).chooseCards('Grizzly Bears');
    }
    g.passAll();
    const d = g.state.pending;
    expect(d?.kind).toBe('confirmOptional');
    if (d?.kind !== 'confirmOptional') return;
    const view = getView(g.state, 0);
    const ability = view.stack.find((o) => o.id === d.source);
    expect(ability?.triggerSubject).toBeDefined();
    const card = view.seats[0]?.graveyard.find((o) => o.id === ability?.triggerSubject);
    expect(card?.name).toBe('Grizzly Bears');
  });

  test('a spell and an ability that read nothing have no such field', () => {
    const g = scenario()
      .seat(0)
      .hand(TIDY)
      .battlefield('Swamp')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(TIDY, { pay: true });
    const spell = getView(g.state, 0).stack[0];
    expect(spell?.name).toBe(TIDY);
    expect(spell?.triggerSubject).toBeUndefined();
  });
});
