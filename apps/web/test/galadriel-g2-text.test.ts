/**
 * The words of group 2 of the Galadriel deck (D-1610 to D-1618) as pure models, read from the engine's SYNTHETIC cards so a wording that drifts from the AST fails here: the gists of
 * the triggered abilities of the creature with the token and the land from two places, the words of "up to two land cards from among them" and of "a land card from your hand or graveyard",
 * the static "are Forest lands in addition to their other types", and the cards the picker lists for a choice from the hand and the graveyard. No DOM.
 */
import { type Ability, getView, type StackAbility, syntheticCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { chosenCardMoveText } from '../src/game/artifacts-text';
import { lordWording } from '../src/game/static-text';
import { triggerGist } from '../src/ui/decisions/ability-label';
import { pickerCards } from '../src/ui/decisions/cards-picker';

const GIANT = 'SYNTHETIC Land Giant';

const abilitiesOf = (name: string): readonly Ability[] =>
  syntheticCard(name).faces[0]?.abilities ?? [];

const triggered = (name: string): readonly StackAbility[] =>
  abilitiesOf(name).flatMap((a) => (a.kind === 'triggered' ? [a as unknown as StackAbility] : []));

describe('the gists of the triggered abilities of the Land Giant', () => {
  test('the token of the enters trigger has a star for power and toughness and its name', () => {
    const [enters] = triggered(GIANT);
    if (enters === undefined) throw new Error('no ability');
    expect(triggerGist(enters, undefined)).toBe(
      'Create a */* blue Ox creature token named SYNTHETIC Ox Token',
    );
  });

  test('the attack trigger draws and then offers a land of the hand or the graveyard', () => {
    const attack = triggered(GIANT)[1];
    if (attack === undefined) throw new Error('no ability');
    expect(triggerGist(attack, undefined)).toBe(
      'You draw a card. You may put a land card from your hand or graveyard onto the battlefield',
    );
  });
});

describe('the words of a card chosen among the cards of an earlier effect or of two zones', () => {
  const moves = (name: string, face = 0) => {
    const spell = syntheticCard(name).faces[face]?.spell?.effect;
    const found: Parameters<typeof chosenCardMoveText>[0][] = [];
    const walk = (e: unknown): void => {
      const effect = e as { kind: string; effects?: unknown[] };
      if (effect.kind === 'moveToZone') found.push(effect as never);
      for (const inner of effect.effects ?? []) walk(inner);
    };
    walk(spell);
    return found;
  };

  test('"Put up to two land cards from among them into your hand"', () => {
    const [take] = moves('SYNTHETIC Mill Four Take Two');
    if (take === undefined) throw new Error('no move');
    expect(chosenCardMoveText(take)).toBe(
      'Put up to two land cards from among them into your hand',
    );
  });

  test('a single card is still worded as before: "You may put a land card from among them into your hand"', () => {
    const [enters] = abilitiesOf('SYNTHETIC Mill Three Scout');
    if (enters?.kind !== 'triggered' || enters.effect.kind !== 'sequence') {
      throw new Error('no enters trigger');
    }
    const take = enters.effect.effects[1];
    if (take?.kind !== 'moveToZone') throw new Error('no move');
    expect(chosenCardMoveText(take)).toBe('You may put a land card from among them into your hand');
  });

  test('"You may put a land card from your hand or graveyard onto the battlefield"', () => {
    const attack = abilitiesOf(GIANT)[2];
    if (attack?.kind !== 'triggered' || attack.effect.kind !== 'sequence') {
      throw new Error('no attack trigger');
    }
    const move = attack.effect.effects[1];
    if (move?.kind !== 'moveToZone') throw new Error('no move');
    expect(chosenCardMoveText(move)).toBe(
      'You may put a land card from your hand or graveyard onto the battlefield',
    );
  });
});

describe('static abilities', () => {
  test('"Nontoken creatures you control are Forest lands in addition to their other types"', () => {
    const ctx = { self: 'This creature', subtypes: [] } as never;
    const words = abilitiesOf('SYNTHETIC Forest Heart').flatMap((a) =>
      a.kind === 'static' ? [lordWording(a.static, ctx)] : [],
    );
    expect(words).toContain(
      'Nontoken creatures you control are Forest lands in addition to their other types',
    );
  });
});

describe('the picker lists the cards of both places', () => {
  test('a choice from the hand or the graveyard shows the legal cards of the hand and then those of the graveyard', () => {
    const g = scenario()
      .seat(0)
      .library('Plains', 'Plains', 'Plains')
      .battlefield(GIANT)
      .hand('Mountain')
      .graveyard('Island')
      .graveyard('Grizzly Bears')
      .seat(1)
      .library('Plains', 'Plains')
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([GIANT]);
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error('expected the choice of a card');
    const view = getView(g.state, 0);
    const shown = pickerCards(view, d);
    expect(shown.map((o) => o.id)).toEqual(
      // The hand first (Mountain and the card drawn), then the graveyard (Island).
      d.legal
        .slice()
        .sort((a, b) => zoneRank(g.state.objects[a]?.zone) - zoneRank(g.state.objects[b]?.zone)),
    );
    expect(shown.map((o) => o.zone)).toEqual(['hand', 'hand', 'graveyard']);
  });
});

const zoneRank = (zone: string | undefined): number => (zone === 'hand' ? 0 : 1);
