import type { TokenDefinition } from '@commander-arena/engine';

/** Search printed token characteristics, never a permanent's counters or continuous effects. */
export function tokenSearchQuery(token: TokenDefinition): string | null {
  if (token.name === '' || token.name.startsWith('SYNTHETIC') || token.manaCost !== null) {
    return null;
  }
  const quote = JSON.stringify;
  const types = [...token.supertypes, ...token.types, ...token.subtypes];
  const colors = ['W', 'U', 'B', 'R', 'G'].filter((c) => token.colors.some((v) => v === c));
  const words = token.abilities.flatMap((a) =>
    a.kind === 'keyword' ? [a.keyword.kind.replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`)] : [],
  );
  // Distinguishes the otherwise identical flying Dragons made by different effects.
  if (
    token.oracleText.includes('+1/+0') ||
    token.abilities.some(
      (a) =>
        a.kind === 'activated' &&
        a.effect.kind === 'modifyPt' &&
        a.effect.objects.kind === 'this' &&
        a.effect.power === 1 &&
        a.effect.toughness === 0,
    )
  ) {
    words.push('+1/+0');
  }
  return [
    `!${quote(token.name)}`,
    't:token',
    // Double-faced token cards count as separate matches even with unique:cards.
    // Prefer a standalone token whose image_uris belong to this exact token.
    'layout:token',
    ...types.map((t) => `t:${quote(t)}`),
    `c=${colors.join('').toLowerCase() || 'c'}`,
    ...(token.power === null ? [] : [`pow=${token.power === '*' ? quote('*') : token.power}`]),
    ...(token.toughness === null
      ? []
      : [`tou=${token.toughness === '*' ? quote('*') : token.toughness}`]),
    ...[...new Set(words)].map((w) => `o:${quote(w)}`),
    'game:paper unique:cards prefer:best',
  ].join(' ');
}
