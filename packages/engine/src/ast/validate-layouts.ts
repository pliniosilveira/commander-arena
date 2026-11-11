/**
 * Checks of the layouts (CR 709 split, 712 double-faced, 715 adventure, 714 Saga), kept apart
 * from the per-node checks. `layoutStructureIssues` says whether the faces fit the layout, for any
 * card; `layoutSupportIssues` says what of a supported layout the engine does not run yet, for a card
 * marked `supported`. Every issue names the layout, so a player is told why the card is flagged.
 */
import type { CardDefinition, CardFace } from '../cards/definition';
import { isPermanentType } from '../characteristics';
import type { AstIssue } from './validate-parts';

const isSpellFace = (face: CardFace): boolean =>
  face.types.includes('instant') || face.types.includes('sorcery');

/** Whether the face's rules text starts a line with the keyword (Fuse, Aftermath). */
function hasKeywordLine(face: CardFace, keyword: string): boolean {
  return face.oracleText.split('\n').some((line) => new RegExp(`^${keyword}\\b`, 'i').test(line));
}

/** The chapter abilities of a face: the trigger's range and where the ability is. */
function chapterAbilities(face: CardFace): { from: number; to: number; index: number }[] {
  return face.abilities.flatMap((a, index) =>
    a.kind === 'triggered' && a.trigger.kind === 'chapter'
      ? [{ from: a.trigger.from, to: a.trigger.to, index }]
      : [],
  );
}

/** CR 714.1: a Saga is an enchantment with the subtype Saga; only it has chapter abilities. */
function sagaStructureIssues(def: CardDefinition, out: AstIssue[]): void {
  def.faces.forEach((face, i) => {
    const isSagaFace = def.layout === 'saga' && face.subtypes.includes('Saga');
    if (def.layout === 'saga' && i === 0 && !isSagaFace) {
      out.push({
        path: `faces[${i}].subtypes`,
        message: 'layout saga needs a face with the subtype Saga (CR 714.1)',
      });
    }
    if (isSagaFace && !face.types.includes('enchantment')) {
      out.push({
        path: `faces[${i}].types`,
        message: 'a Saga is an enchantment (CR 714.1)',
      });
    }
    if (!isSagaFace) {
      for (const { index } of chapterAbilities(face)) {
        out.push({
          path: `faces[${i}].abilities[${index}].trigger`,
          message: 'only a Saga (layout saga, subtype Saga) has chapter abilities (CR 714.2)',
        });
      }
    }
  });
}

/**
 * What the engine needs of a supported Saga (CR 714.2): the face states its final chapter number,
 * which is the greatest chapter number of its chapter abilities (CR 714.2d), and every chapter from
 * I up to it has exactly one chapter ability, since a card that skipped a chapter or gave one two
 * abilities is not a Saga the engine can run honestly (CR 714.2b, 714.2c).
 */
function sagaSupportIssues(def: CardDefinition, out: AstIssue[]): void {
  if (def.layout !== 'saga') return;
  def.faces.forEach((face, i) => {
    if (!face.subtypes.includes('Saga')) return;
    const path = `faces[${i}]`;
    const chapters = chapterAbilities(face);
    const final = face.finalChapter;
    if (final === undefined || !Number.isSafeInteger(final) || final < 1) {
      out.push({
        path: `${path}.finalChapter`,
        message: 'a Saga needs its final chapter number, a positive integer (CR 714.2d)',
      });
      return;
    }
    const covered = new Map<number, number>();
    for (const { from, to, index } of chapters) {
      for (let n = from; n <= to; n += 1) {
        if (covered.has(n)) {
          out.push({
            path: `${path}.abilities[${index}].trigger`,
            message: `chapter ${n} has more than one chapter ability`,
          });
        }
        covered.set(n, index);
      }
    }
    for (let n = 1; n <= final; n += 1) {
      if (!covered.has(n)) {
        out.push({
          path: `${path}.abilities`,
          message: `chapter ${n} has no chapter ability, but the final chapter is ${final} (CR 714.2d)`,
        });
      }
    }
    const greatest = Math.max(0, ...chapters.map((c) => c.to));
    if (greatest > final) {
      out.push({
        path: `${path}.finalChapter`,
        message: `finalChapter is ${final} but a chapter ability reaches chapter ${greatest} (CR 714.2d)`,
      });
    }
  });
}

/**
 * CR 716.1, 716.2 (D-235): a Class is an enchantment with the subtype Class, one face; only it has class level bars (the `level` abilities and the effect `gainLevel`), and its
 * bars go 2, 3, ... each with the level bar that gains it before the abilities it adds.
 */
function classStructureIssues(def: CardDefinition, out: AstIssue[]): void {
  def.faces.forEach((face, i) => {
    const isClass = def.layout === 'class';
    if (isClass && i === 0 && !face.subtypes.includes('Class')) {
      out.push({
        path: `faces[${i}].subtypes`,
        message: 'layout class needs a face with the subtype Class (CR 716.1)',
      });
    }
    if (isClass && i === 0 && !face.types.includes('enchantment')) {
      out.push({ path: `faces[${i}].types`, message: 'a Class is an enchantment (CR 716.1)' });
    }
    const hasLevels = face.abilities.some(
      (a) => a.kind === 'level' || (a.kind === 'activated' && a.effect.kind === 'gainLevel'),
    );
    if (hasLevels && !isClass) {
      out.push({
        path: `faces[${i}].abilities`,
        message: 'only a Class (layout class) has class level bars (CR 716.2)',
      });
    }
    // The bars: each activated `gainLevel` for level N comes after the one for N-1 and before the `level` ability of N.
    let expected = 2;
    for (const [index, a] of face.abilities.entries()) {
      if (a.kind === 'activated' && a.effect.kind === 'gainLevel') {
        if (a.effect.level !== expected) {
          out.push({
            path: `faces[${i}].abilities[${index}].effect.level`,
            message: `the class level bars go in order: level ${expected} comes next (CR 716.2)`,
          });
        }
        expected = a.effect.level + 1;
      } else if (a.kind === 'level' && a.level !== expected - 1) {
        out.push({
          path: `faces[${i}].abilities[${index}].level`,
          message: `the abilities of a class level bar follow the bar of their level (CR 716.2a)`,
        });
      }
    }
  });
}

/** Structural rules of a layout that depend on what the faces are. */
export function layoutStructureIssues(def: CardDefinition): AstIssue[] {
  const out: AstIssue[] = [];
  sagaStructureIssues(def, out);
  classStructureIssues(def, out);
  // CR 715.2: the Adventure is an instant or sorcery card face; it resolves to exile, never onto
  // the battlefield (CR 715.3d).
  if (def.layout === 'adventure') {
    const adventure = def.faces[1];
    if (adventure !== undefined && !isSpellFace(adventure)) {
      out.push({
        path: 'faces[1].types',
        message: 'layout adventure needs faces[1] to be an instant or sorcery (CR 715.2)',
      });
    }
  }
  // CR 722.2 (D-214): the prepare spell is an instant or sorcery face, and "enters prepared" stands on the card face of a card that has one.
  if (def.layout === 'prepare') {
    const spell = def.faces[1];
    if (def.faces.length !== 2 || spell === undefined || !isSpellFace(spell)) {
      out.push({
        path: 'faces[1].types',
        message:
          'layout prepare needs faces[1] to be an instant or sorcery, its prepare spell (CR 722.2)',
      });
    }
    if (def.faces[0] !== undefined && !def.faces[0].types.includes('creature')) {
      out.push({
        path: 'faces[0].types',
        message: 'a preparation card is a creature in this engine (CR 722)',
      });
    }
  }
  for (const [i, face] of def.faces.entries()) {
    if (
      face.abilities.some(
        (a) => a.kind === 'replacement' && a.replacement.kind === 'entersPrepared',
      ) &&
      (def.layout !== 'prepare' || i !== 0)
    ) {
      out.push({
        path: `faces[${i}].abilities`,
        message:
          '"enters prepared" is an ability of the first face of a card of the layout prepare (CR 722.3a)',
      });
    }
  }
  return out;
}

/** What the engine does not run of the layouts it supports. */
export function layoutSupportIssues(def: CardDefinition): AstIssue[] {
  const out: AstIssue[] = [];
  sagaSupportIssues(def, out);
  if (def.layout === 'split') {
    // CR 709.5: a split card that is a permanent (a Room) has a shared type line and unlocked
    // designations on the battlefield.
    def.faces.forEach((face, i) => {
      if (face.types.some((t) => isPermanentType(t))) {
        out.push({
          path: `faces[${i}].types`,
          message:
            'layout split with a permanent half (a Room, CR 709.5) is not implemented by the engine yet',
        });
      }
    });
    // CR 702.102 (Fuse) casts both halves at once; CR 702.127 (Aftermath) casts one half from the
    // graveyard. Neither is run.
    for (const [keyword, rule] of [
      ['Fuse', '702.102'],
      ['Aftermath', '702.127'],
    ] as const) {
      if (def.faces.some((face) => hasKeywordLine(face, keyword))) {
        out.push({
          path: 'layout',
          message: `layout split with ${keyword} (CR ${rule}) is not implemented by the engine yet`,
        });
      }
    }
  }
  if (def.layout === 'transform') {
    // CR 306.5b, 310.4b: a planeswalker or battle gets its loyalty or defense counters as it
    // enters, not as it transforms.
    def.faces.forEach((face, i) => {
      if (i > 0 && (face.types.includes('planeswalker') || face.types.includes('battle'))) {
        out.push({
          path: `faces[${i}].types`,
          message:
            'layout transform with a planeswalker or battle back face is not implemented by the engine yet',
        });
      }
    });
  }
  // The flashback cost is read from the front face of a card that is not split (rules/legality.ts).
  def.faces.forEach((face, i) => {
    const flashback = face.abilities.some(
      (a) => a.kind === 'keyword' && a.keyword.kind === 'flashback',
    );
    if (flashback && (i > 0 || def.layout === 'split')) {
      out.push({
        path: `faces[${i}].abilities`,
        message: `flashback on this face of layout ${def.layout} is not implemented by the engine yet`,
      });
    }
  });
  return out;
}
