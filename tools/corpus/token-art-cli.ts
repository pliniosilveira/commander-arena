import './register.ts';

const { auditTokenArt } = await import('./token-art.ts');
await auditTokenArt(process.argv.includes('--dry-run'));
