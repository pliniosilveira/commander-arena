/**
 * The words of group 4 of the Gisa deck (D-459 to D-462) as pure models: the reanimation with a delayed exile and the replacement (Whip of Erebos), the reduction of the
 * abilities of the creature cards in your graveyard (Embalmer's Tools), the ability that works from the hand with a reveal cost (Tetzimoc) and the linked exile that comes back as
 * Spirits (Ghost Vacuum). Read from the engine's SYNTHETIC cards, so a wording that drifts from the AST fails here. No DOM.
 */
import { type Ability, syntheticCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { describeEvents } from '../src/game/describe';
import { lordWordings } from '../src/game/static-text';
import { activationLabel, triggerGist } from '../src/ui/decisions/ability-label';

const abilitiesOf = (name: string): readonly Ability[] => {
  const face = syntheticCard(name).faces[0];
  if (face === undefined) throw new Error(`no face for ${name}`);
  return face.abilities;
};

const activated = (name: string, index: number) => {
  const ability = abilitiesOf(name)[index];
  if (ability?.kind !== 'activated') throw new Error(`no activated ability ${index} of ${name}`);
  return ability;
};

describe('the reanimation of the Whip', () => {
  test('the label says the haste, the delayed exile and the replacement, at sorcery speed', () => {
    expect(
      activationLabel(undefined, {
        abilityIndex: 1,
        ability: activated('SYNTHETIC Grave Whip', 1),
      }),
    ).toBe(
      '{2}{B}{B}, {T}: Return target creature card from your graveyard to the battlefield. It gains haste. At the beginning of the next end step, exile it. If it would leave the battlefield, exile it instead of putting it anywhere else (sorcery speed)',
    );
  });

  test('the gist of the ability on the stack leaves nothing out', () => {
    expect(triggerGist(activated('SYNTHETIC Grave Whip', 1) as never, undefined)).toBe(
      'Return target creature card from your graveyard to the battlefield. It gains haste. At the beginning of the next end step, exile it. If it would leave the battlefield, exile it instead of putting it anywhere else',
    );
  });
});

describe("Embalmer's Tools", () => {
  test('the static ability is said as the card says it', () => {
    expect(
      lordWordings(abilitiesOf('SYNTHETIC Grave Tools'), { noun: 'artifact', subtypes: [] }),
    ).toEqual([
      'Activated abilities of creature cards in your graveyard cost {1} less to activate.',
    ]);
  });

  test('a reduction of another zone or of the abilities of the opponent is not said (never guessed)', () => {
    const wording = (objects: object) =>
      lordWordings(
        [
          {
            kind: 'static',
            static: { kind: 'abilityCostReduction', abilities: 'ofObjects', objects, amount: 1 },
          } as Ability,
        ],
        { noun: 'artifact', subtypes: [] },
      );
    expect(wording({ zone: 'graveyard', types: ['creature'], controller: 'you' })).toHaveLength(1);
    expect(wording({ zone: 'graveyard', types: ['creature'], controller: 'opponent' })).toEqual([]);
    expect(
      wording({
        zone: 'graveyard',
        types: ['creature'],
        controller: 'you',
        power: { op: 'gte', value: 3 },
      }),
    ).toEqual([]);
  });
});

describe('Tetzimoc: the ability that works from the hand', () => {
  test('the label has the reveal cost and the restriction of the turn', () => {
    expect(
      activationLabel(undefined, {
        abilityIndex: 1,
        ability: activated('SYNTHETIC Prey Hunter', 1),
      }),
    ).toBe(
      "{B}, Reveal this card from your hand: Put a prey counter on target creature. Activate only if it's your turn.",
    );
  });

  test('the log says who revealed the card', () => {
    const g = scenario()
      .seat(0)
      .library('Plains', 'Plains', 'Plains')
      .hand('SYNTHETIC Prey Hunter')
      .battlefield('Swamp')
      .battlefield('Grizzly Bears', { label: 'mine' })
      .seat(1)
      .library('Plains', 'Plains', 'Plains')
      .at('precombatMain', { active: 0 })
      .build();
    const before = g.state;
    const mark = g.mark();
    g.act(0).activate('SYNTHETIC Prey Hunter', { targets: ['mine'], pay: true });
    const described = describeEvents(g.eventsSince(mark), before, g.state, 0);
    expect(described.some((d) => d.text === 'You reveal SYNTHETIC Prey Hunter.')).toBe(true);
    expect(described.find((d) => d.text.includes('reveal'))?.rule).toBe('CR 701.20');
  });
});

describe('Ghost Vacuum: the cards exiled with it', () => {
  test('the exile of a card of any kind is "target card from a graveyard", and is linked', () => {
    expect(
      activationLabel(undefined, {
        abilityIndex: 0,
        ability: activated('SYNTHETIC Soul Vacuum', 0),
      }),
    ).toBe("{T}: Exile target card from a graveyard. It's exiled with this permanent");
  });

  test('the second ability puts each creature card exiled with it onto the battlefield, with the counter, and says what they are', () => {
    expect(
      activationLabel(undefined, {
        abilityIndex: 1,
        ability: activated('SYNTHETIC Soul Vacuum', 1),
      }),
    ).toBe(
      '{6}, {T}, Sacrifice this: Put each creature card exiled with this permanent onto the battlefield under your control with a flying counter on it. It is a 1/1 Spirit creature in addition to its other types (sorcery speed)',
    );
  });
});
