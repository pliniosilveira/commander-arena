/**
 * Split, Adventure, modal double-faced and transforming cards as pure models, from views made up
 * for the test: one option per face and the chooser that asks, the labels from `faces`, the action
 * a click sends, the exile click path and its badge, drag and drop, the stop policy, the art
 * request and the shock question of a back-face land. No DOM.
 */
import type {
  Action,
  ConfirmOptionalDecision,
  FaceView,
  GameView,
  ObjectId,
  ObjectView,
  PendingDecision,
  PriorityDecision,
  PriorityOption,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { DEFAULT_STOPS, hasRelevantAction, shouldStop } from '../src/policy/should-stop';
import { artOf, imageUrl } from '../src/ui/board/art';
import { menuItems } from '../src/ui/decisions/abilities';
import { castAction } from '../src/ui/decisions/flashback';
import {
  exileCastObjects,
  faceFacts,
  faceLabel,
  faceRole,
  isBackFaceUp,
} from '../src/ui/decisions/layouts';
import { objectIndex } from '../src/ui/decisions/lookup';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import { optionalSource } from '../src/ui/decisions/optional';
import { clickOutcome, playableObjects } from '../src/ui/decisions/priority';
import { initialUi } from '../src/ui/decisions/ui-state';
import { dragSpec, labelFor, resolveDrop } from '../src/ui/dnd/model';
import { lookupIndexFor } from './decisions-helpers';

const face = (name: string, patch: Partial<FaceView> = {}): FaceView => ({
  name,
  manaCost: null,
  colors: [],
  supertypes: [],
  types: ['creature'],
  subtypes: [],
  power: null,
  toughness: null,
  loyalty: null,
  defense: null,
  oracleText: '',
  ...patch,
});

const obj = (n: number, name: string, patch: Partial<ObjectView> = {}): ObjectView =>
  ({
    id: `o${n}`,
    name,
    controller: 0,
    owner: 0,
    zone: 'hand',
    types: ['instant'],
    subtypes: [],
    supertypes: [],
    colors: [],
    keywords: [],
    oracleText: '',
    manaCost: null,
    tapped: false,
    ...patch,
  }) as ObjectView;

// Study // Zap: a split card (a sorcery half and an instant half).
const study = face('Study', { manaCost: ['1', 'U'], types: ['sorcery'], colors: ['U'] });
const zap = face('Zap', { manaCost: ['R'], types: ['instant'], colors: ['R'] });
const split = obj(1, 'Study // Zap', {
  types: ['sorcery', 'instant'],
  layout: 'split',
  face: 0,
  faces: [study, zap],
});
// Wise Owl // Peek: an Adventure card.
const owl = face('Wise Owl', { manaCost: ['2', 'U'], subtypes: ['Bird'], colors: ['U'] });
const peek = face('Peek', {
  manaCost: ['U'],
  types: ['sorcery'],
  subtypes: ['Adventure'],
  colors: ['U'],
});
const adventure = obj(2, 'Wise Owl', {
  types: ['creature'],
  layout: 'adventure',
  face: 0,
  faces: [owl, peek],
});
const inExile = obj(3, 'Wise Owl', {
  zone: 'exile',
  types: ['creature'],
  layout: 'adventure',
  face: 0,
  faces: [owl, peek],
  onAdventure: true,
});
// Ridge Drake // Ridge Pass and Zeal Charm // Shock Pass: modal double-faced cards.
const drake = face('Ridge Drake', { manaCost: ['2', 'R'], subtypes: ['Dragon'] });
const pass = face('Ridge Pass', { types: ['land'], oracleText: '{T}: Add {R}.' });
const modal = obj(4, 'Ridge Drake', {
  types: ['creature'],
  layout: 'modal_dfc',
  face: 0,
  faces: [drake, pass],
});
const charm = face('Zeal Charm', { manaCost: ['1', 'B'], types: ['sorcery'] });
const shock = face('Shock Pass', {
  types: ['land'],
  oracleText: "As this land enters, you may pay 2 life. If you don't, it enters tapped.",
});
const shocker = obj(5, 'Zeal Charm', {
  types: ['sorcery'],
  layout: 'modal_dfc',
  face: 0,
  faces: [charm, shock],
});
// Moon Cub // Moon Beast: a transforming card.
const cub = face('Moon Cub', { manaCost: ['1', 'G'] });
const beast = face('Moon Beast', { subtypes: ['Wolf', 'Werewolf'] });
const turned = obj(6, 'Moon Beast', {
  zone: 'battlefield',
  types: ['creature'],
  layout: 'transform',
  face: 1,
  faces: [cub, beast],
});
const plain = obj(7, 'Bolt', { zone: 'hand' });
const all = [split, adventure, inExile, modal, shocker, turned, plain];
const index = lookupIndexFor(all);

const priority = (...options: PriorityOption[]): PriorityDecision => ({
  id: 'd1',
  seat: 0,
  kind: 'priority',
  options: [{ kind: 'pass' }, ...options],
});
const cast = (n: number, faceIndex?: number): PriorityOption => ({
  kind: 'castSpell',
  object: `o${n}`,
  ...(faceIndex === undefined ? {} : { face: faceIndex }),
});
const play = (n: number, faceIndex: number): PriorityOption => ({
  kind: 'playLand',
  object: `o${n}`,
  face: faceIndex,
});

const items = (d: PriorityDecision, n: number) => {
  const outcome = clickOutcome(d, `o${n}`, index);
  if (outcome.kind !== 'menu') throw new Error(`expected a menu, got ${outcome.kind}`);
  return outcome.items;
};

describe('a card with several faces to cast or play asks which', () => {
  test('a split card: one item per half, "Cast <half>", with its cost and type line', () => {
    const d = priority(cast(1, 0), cast(1, 1));
    expect(items(d, 1).map((i) => [i.label, i.detail])).toEqual([
      ['Cast Study', '{1}{U} · Sorcery'],
      ['Cast Zap', '{R} · Instant'],
    ]);
    expect(items(d, 1).map((i) => i.action)).toEqual([
      { kind: 'castSpell', object: 'o1', face: 0 },
      { kind: 'castSpell', object: 'o1', face: 1 },
    ]);
    expect(new Set(items(d, 1).map((i) => i.key)).size).toBe(2);
  });

  test('an Adventure card: the Adventure reads "Cast <name> (Adventure)"', () => {
    const d = priority(cast(2, 0), cast(2, 1));
    expect(items(d, 2).map((i) => [i.label, i.detail])).toEqual([
      ['Cast Wise Owl', '{2}{U} · Creature — Bird'],
      ['Cast Peek (Adventure)', '{U} · Sorcery — Adventure'],
    ]);
  });

  test('a modal card: a land face is "Play <land>", a spell face "Cast <name>", in the engine order', () => {
    const d = priority(play(4, 1), cast(4, 0));
    expect(items(d, 4).map((i) => [i.label, i.detail])).toEqual([
      ['Play Ridge Pass', 'Land'],
      ['Cast Ridge Drake', '{2}{R} · Creature — Dragon'],
    ]);
    expect(items(d, 4).map((i) => i.action)).toEqual([
      { kind: 'playLand', object: 'o4', face: 1 },
      { kind: 'castSpell', object: 'o4', face: 0 },
    ]);
  });

  test('with one option the click acts at once, and the action still carries the face', () => {
    expect(clickOutcome(priority(cast(1, 1)), 'o1', index)).toEqual({
      kind: 'act',
      action: { kind: 'castSpell', object: 'o1', face: 1 },
    });
    expect(clickOutcome(priority(play(4, 1)), 'o4', index)).toEqual({
      kind: 'act',
      action: { kind: 'playLand', object: 'o4', face: 1 },
    });
    // Face 0 of an Adventure card carries `face: 0`; a transforming card and an ordinary card
    // have no face in their option and none in the action.
    expect(clickOutcome(priority(cast(2, 0)), 'o2', index)).toEqual({
      kind: 'act',
      action: { kind: 'castSpell', object: 'o2', face: 0 },
    });
    expect(clickOutcome(priority(cast(7)), 'o7', index)).toEqual({
      kind: 'act',
      action: { kind: 'castSpell', object: 'o7' },
    });
  });

  test('castAction keeps the face next to an alternative; a missing face stays missing', () => {
    expect(castAction({ kind: 'castSpell', object: 'o1', face: 1 })).toEqual({
      kind: 'castSpell',
      object: 'o1',
      face: 1,
    });
    expect(castAction({ kind: 'castSpell', object: 'o1' })).toEqual({
      kind: 'castSpell',
      object: 'o1',
    });
    expect(Object.keys(castAction({ kind: 'castSpell', object: 'o1' }))).toEqual([
      'kind',
      'object',
    ]);
  });

  test('without the card in the index the items fall back to the generic words and keep the face', () => {
    const d = priority(cast(1, 0), cast(1, 1));
    const list = menuItems(d, 'o1');
    expect(list.map((i) => i.label)).toEqual(['Cast it', 'Cast it']);
    expect(list.map((i) => i.action)).toEqual([
      { kind: 'castSpell', object: 'o1', face: 0 },
      { kind: 'castSpell', object: 'o1', face: 1 },
    ]);
  });

  test('a card with an activated ability too lists its faces first, then the ability', () => {
    const d = priority(cast(1, 0), cast(1, 1), { kind: 'activate', object: 'o1', abilityIndex: 0 });
    expect(items(d, 1).map((i) => i.key)).toEqual(['cast-face-0', 'cast-face-1', 'activate-0']);
  });

  test('the model opens the chooser for several faces and sends the cast for one', () => {
    const run = (d: PriorityDecision, id: ObjectId) => {
      const acts: Action[] = [];
      const chooser: ObjectId[] = [];
      const ctl: Controller = {
        act: (a) => acts.push(a),
        update: () => {},
        openChooser: (o) => chooser.push(o),
      };
      const view = {
        viewer: 0,
        battlefield: [],
        stack: [],
        exile: [inExile],
        seats: [
          { id: 0, hand: [split, adventure, modal, shocker, plain], graveyard: [], command: [] },
          { id: 1, hand: null, graveyard: [], command: [] },
        ],
        pending: d,
      } as unknown as GameView;
      const model = buildModel(view, d, initialUi(d), ctl);
      model.interaction.onObject(id);
      return { acts, chooser, model };
    };
    const several = run(priority(cast(1, 0), cast(1, 1)), 'o1');
    expect(several.acts).toEqual([]);
    expect(several.chooser).toEqual(['o1']);
    const one = run(priority(cast(1, 1)), 'o1');
    expect(one.acts).toEqual([{ kind: 'castSpell', object: 'o1', face: 1 }]);
    expect(one.chooser).toEqual([]);
  });
});

describe('casting from exile (an Adventure card, CR 715.3d)', () => {
  const d = priority(cast(3, 0));

  test('the card in exile is playable and its click sends the cast with the face', () => {
    expect(playableObjects(d)).toEqual(new Set(['o3']));
    expect(clickOutcome(d, 'o3', index)).toEqual({
      kind: 'act',
      action: { kind: 'castSpell', object: 'o3', face: 0 },
    });
  });

  test('exileCastObjects lists only castable cards in exile; the chooser says "from exile"', () => {
    expect(exileCastObjects(priority(cast(3, 0), cast(2, 0)), index)).toEqual(new Set(['o3']));
    expect(exileCastObjects(priority(), index)).toEqual(new Set());
    const withAbility = priority(cast(3, 0), { kind: 'activate', object: 'o3', abilityIndex: 0 });
    expect(items(withAbility, 3)[0]?.label).toBe('Cast Wise Owl (from exile)');
  });

  test('the model badges a castable card in exile "Cast from exile", and nothing else', () => {
    const view = {
      viewer: 0,
      battlefield: [],
      stack: [],
      exile: [inExile],
      seats: [
        { id: 0, hand: [adventure], graveyard: [], command: [] },
        { id: 1, hand: null, graveyard: [], command: [] },
      ],
    } as unknown as GameView;
    const decision = priority(cast(3, 0), cast(2, 0));
    const ctl: Controller = { act: () => {}, update: () => {}, openChooser: () => {} };
    const model = buildModel({ ...view, pending: decision }, decision, initialUi(decision), ctl);
    expect(model.interaction.badge('o3')).toBe('Cast from exile');
    expect(model.interaction.badge('o2')).toBeNull();
    const noOption = priority(cast(2, 0));
    const other = buildModel({ ...view, pending: noOption }, noOption, initialUi(noOption), ctl);
    expect(other.interaction.badge('o3')).toBeNull();
  });
});

describe('what the view says about the face that is up', () => {
  test('faceLabel needs the face in the view; faceFacts and isBackFaceUp read the face', () => {
    expect(faceLabel({ kind: 'castSpell', object: 'o1', face: 1 }, split)?.label).toBe('Cast Zap');
    expect(faceLabel({ kind: 'castSpell', object: 'o1', face: 1 }, plain)).toBeNull();
    expect(faceLabel({ kind: 'castSpell', object: 'o1' }, split)).toBeNull();
    expect(isBackFaceUp(turned)).toBe(true);
    expect(isBackFaceUp({ ...turned, face: 0 })).toBe(false);
    expect(isBackFaceUp({ ...turned, zone: 'graveyard' })).toBe(false);
    expect(isBackFaceUp({ ...adventure, face: 1, zone: 'stack' })).toBe(false);
    expect(faceFacts(turned)).toEqual(['Back face up']);
    expect(faceFacts(inExile)).toEqual(['On an Adventure: it may be cast from exile']);
    expect(faceFacts({ ...adventure, face: 1, zone: 'stack' })).toEqual(['Cast as an Adventure']);
    expect(faceFacts({ ...split, face: 1, zone: 'stack' })).toEqual(['Cast as Zap']);
    expect(faceFacts(split)).toEqual([]);
    expect(faceFacts(plain)).toEqual([]);
  });

  test('the role of a face in its card', () => {
    expect(faceRole('split', 0)).toBe('Split, left half');
    expect(faceRole('split', 1)).toBe('Split, right half');
    expect(faceRole('adventure', 1)).toBe('Adventure');
    expect(faceRole('transform', 1)).toBe('Back face');
    expect(faceRole('modal_dfc', 0)).toBe('Front face');
  });
});

describe('drag and drop of a card with several faces', () => {
  const ui = initialUi(null);
  const view = {
    viewer: 0,
    battlefield: [],
    stack: [],
    exile: [],
    seats: [
      { id: 0, hand: [split, adventure], graveyard: [], command: [] },
      { id: 1, hand: null, graveyard: [], command: [] },
    ],
  } as unknown as GameView;
  const idx = objectIndex(view);
  const both: PendingDecision = priority(cast(1, 0), cast(1, 1));
  const one: PendingDecision = priority(cast(2, 1));

  test('both zones are offered and the drop asks the chooser (the click)', () => {
    const spec = dragSpec(both, ui, idx, 0, 'o1', 'card');
    expect(spec?.zones.map((z) => z.target.kind)).toEqual(['battlefield', 'stack']);
    expect(labelFor(spec, { kind: 'battlefield' })).toBe('Cast Study // Zap');
    expect(resolveDrop(both, ui, idx, 0, 'o1', 'card', { kind: 'stack' })).toEqual({
      kind: 'click',
    });
  });

  test('with one option the drop is the click too, and the click carries the face', () => {
    expect(resolveDrop(one, ui, idx, 0, 'o2', 'card', { kind: 'battlefield' })).toEqual({
      kind: 'click',
    });
    expect(clickOutcome(one as PriorityDecision, 'o2', idx)).toEqual({
      kind: 'act',
      action: { kind: 'castSpell', object: 'o2', face: 1 },
    });
  });

  test('a land face and a spell face listed together: the zone says "Cast"', () => {
    const mixed = priority(play(4, 1), cast(4, 0));
    const spec = dragSpec(
      mixed,
      ui,
      objectIndex({ ...view, battlefield: [modal] }),
      0,
      'o4',
      'card',
    );
    expect(labelFor(spec, { kind: 'stack' })).toBe('Cast Ridge Drake');
  });
});

describe('the stop policy and a split card', () => {
  // Without the stop for any opponent spell (issue 105), which would hide what these tests look at.
  const NO_STOPS = {
    ...DEFAULT_STOPS,
    myTurnStops: [],
    opponentTurnStops: [],
    stopForOpponentSpells: false,
  };
  const theirs = { ...obj(40, 'Their spell', { controller: 1, zone: 'stack', targets: [] }) };
  const viewWith = (hand: ObjectView[], options: PriorityOption[], extra = {}): GameView =>
    ({
      viewer: 0,
      turn: 3,
      activeSeat: 1,
      phase: 'ending',
      step: 'end',
      prioritySeat: 0,
      seats: [
        { id: 0, hand, graveyard: [], command: [] },
        { id: 1, hand: null, graveyard: [], command: [] },
      ],
      battlefield: [],
      exile: [],
      stack: [theirs],
      combat: null,
      pending: { kind: 'priority', id: 'd1', seat: 0, options: [{ kind: 'pass' }, ...options] },
      result: null,
      ...extra,
    }) as unknown as GameView;

  test('an instant half in the hand is a relevant action: the autopilot stops to respond', () => {
    const v = viewWith([split], [cast(1, 1)]);
    expect(hasRelevantAction(v, v.pending as PriorityDecision)).toBe(true);
    expect(shouldStop(v, NO_STOPS)).toBe(true);
  });

  test('the sorcery half is not: judged by the face the option names, not the combined types', () => {
    // The card has both types in the view, but only the sorcery half is listed.
    const v = viewWith([split], [cast(1, 0)]);
    expect(hasRelevantAction(v, v.pending as PriorityDecision)).toBe(false);
    expect(shouldStop(v, NO_STOPS)).toBe(false);
  });

  test('an Adventure that is an instant counts; a sorcery Adventure and the creature do not', () => {
    const bolt = face('Chop', { types: ['instant'], subtypes: ['Adventure'] });
    const quick = obj(8, 'Quick Cat', {
      types: ['creature'],
      layout: 'adventure',
      face: 0,
      faces: [owl, bolt],
    });
    const hand = [quick, adventure];
    const instantFace = viewWith(hand, [cast(8, 1)]);
    expect(hasRelevantAction(instantFace, instantFace.pending as PriorityDecision)).toBe(true);
    const creatureFace = viewWith(hand, [cast(8, 0), cast(2, 0), cast(2, 1)]);
    expect(hasRelevantAction(creatureFace, creatureFace.pending as PriorityDecision)).toBe(false);
  });

  test('a flash face is read from its own text; an owner-only Adventure card in exile counts', () => {
    const flashing = face('Flash Wall', { oracleText: 'Flash\nDefender' });
    const dfc = obj(9, 'Front', {
      types: ['creature'],
      layout: 'modal_dfc',
      faces: [owl, flashing],
      face: 0,
    });
    const v = viewWith([dfc], [cast(9, 1)]);
    expect(hasRelevantAction(v, v.pending as PriorityDecision)).toBe(true);
    const flashOwl = { ...inExile, keywords: ['flash'] };
    const e = viewWith([], [cast(3, 0)], { exile: [flashOwl] });
    expect(hasRelevantAction(e, e.pending as PriorityDecision)).toBe(true);
    const theirOwl = { ...flashOwl, owner: 1 };
    const t = viewWith([], [cast(3, 0)], { exile: [theirOwl] });
    expect(hasRelevantAction(t, t.pending as PriorityDecision)).toBe(false);
    // The usual case: a plain creature from exile is a sorcery-speed cast.
    const plainOwl = viewWith([], [cast(3, 0)], { exile: [inExile] });
    expect(hasRelevantAction(plainOwl, plainOwl.pending as PriorityDecision)).toBe(false);
  });
});

describe('the art request follows the face', () => {
  test('a card asks by its front face name; the back face of a double-faced card asks for face=back', () => {
    expect(artOf(plain)).toEqual({ name: 'Bolt', back: false });
    expect(artOf(split)).toEqual({ name: 'Study', back: false });
    expect(artOf({ ...split, name: 'Zap', face: 1, zone: 'stack' })).toEqual({
      name: 'Study',
      back: false,
    });
    expect(artOf({ ...adventure, name: 'Peek', face: 1, zone: 'stack' })).toEqual({
      name: 'Wise Owl',
      back: false,
    });
    expect(artOf(turned)).toEqual({ name: 'Moon Cub', back: true });
    expect(artOf({ ...modal, face: 1, name: 'Ridge Pass', zone: 'battlefield' })).toEqual({
      name: 'Ridge Drake',
      back: true,
    });
  });

  test('imageUrl adds face=back only when asked, and skips tokens and invented cards', () => {
    expect(imageUrl('Delver of Secrets', false, 'normal')).toBe(
      'https://api.scryfall.com/cards/named?exact=Delver%20of%20Secrets&format=image&version=normal',
    );
    expect(imageUrl('Delver of Secrets', false, 'art_crop', true)).toBe(
      'https://api.scryfall.com/cards/named?exact=Delver%20of%20Secrets&format=image&version=art_crop&face=back',
    );
    expect(imageUrl('Fire // Ice', false, 'normal')).toContain('exact=Fire&');
    expect(imageUrl('Elf', true, 'normal')).toBeNull();
    expect(imageUrl('SYNTHETIC Blade', false, 'normal')).toBeNull();
    // The faces of an invented multi-face card are named without the prefix.
    expect(imageUrl('Brawler Bear', false, 'normal')).toBeNull();
    expect(imageUrl('Moon Beast', false, 'normal', true)).toBeNull();
  });
});

describe('the shock question of a back-face land', () => {
  const ask = (patch: Partial<ConfirmOptionalDecision> = {}): ConfirmOptionalDecision => ({
    id: 'd2',
    seat: 0,
    kind: 'confirmOptional',
    source: 'o5',
    // The engine reads the card in the hand, which is the front face.
    sourceName: 'Zeal Charm',
    sourceOracleText: 'You gain 3 life.',
    cost: [{ kind: 'payLife', amount: 2 }],
    face: 1,
    ...patch,
  });

  test('the dialog names the face being played, not the front face in the hand', () => {
    expect(optionalSource(ask(), index)).toEqual({ name: 'Shock Pass', text: shock.oracleText });
    // Face 0, or a source the view does not have: the decision's own words.
    const { face: _face, ...faceless } = ask();
    expect(optionalSource(faceless, index)).toEqual({
      name: 'Zeal Charm',
      text: 'You gain 3 life.',
    });
    expect(optionalSource(ask({ source: 'o99' }), index).name).toBe('Zeal Charm');
  });

  test('the answers are the same two actions: the engine keeps the face', () => {
    const d = ask();
    const sent: Action[] = [];
    const ctl: Controller = { act: (a) => sent.push(a), update: () => {}, openChooser: () => {} };
    const view = { viewer: 0, battlefield: [], stack: [], exile: [], seats: [], pending: d };
    const model = buildModel(view as unknown as GameView, d, initialUi(d), ctl);
    for (const b of model.bar.buttons) b.run();
    expect(sent).toEqual([{ kind: 'acceptOptional' }, { kind: 'declineOptional' }]);
    expect(model.bar.prompt).toBe('Pay 2 life?');
  });
});
