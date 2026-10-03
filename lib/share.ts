import type { Env } from './env.ts';
import type { Brain } from './loop.ts';

// Brain ⇄ gzipped base64url, for a URL hash. No backend: the link is the brain.
const toB64url = (bytes: Uint8Array) => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (text: string) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const pipe = async (bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream) =>
  new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

export async function encodeBrain(brain: Brain): Promise<string> {
  return toB64url(await pipe(new TextEncoder().encode(JSON.stringify(brain)), new CompressionStream('gzip')));
}

// WARNING: a share link is untrusted input. Validate the shape here; the loop's restore() validates env and policy.
export async function decodeBrain(text: string): Promise<Brain> {
  let b: Partial<Brain>;
  try {
    b = JSON.parse(new TextDecoder().decode(await pipe(fromB64url(text), new DecompressionStream('gzip'))));
  } catch (err) {
    throw new Error(`the link is damaged or cut off (${err instanceof Error ? err.message : String(err)})`);
  }
  const ok = b.version === 1 && Number.isInteger(b.generation) && typeof b.q === 'object' && b.q !== null && typeof b.envId === 'string' &&
    typeof b.policy === 'string' && Array.isArray(b.fitnessHistory) && b.fitnessHistory.every(Number.isFinite) && Array.isArray(b.ledger) &&
    Array.isArray(b.lineage) && b.lineage.length > 0 && b.lineage.every((l) => /^v\d+$/.test(l?.id));
  if (!ok) throw new Error('it is not a version 1 brain with a lineage of v<number> ids');
  return b as Brain;
}

// The same file `cli export` writes: frontmatter, the champion's text, then the fenced brain block.
export function toSkillMd(env: Pick<Env<unknown>, 'id' | 'title'>, brain: Brain): string {
  const rows = brain.ledger.map((row) => `    ${JSON.stringify(row)}`).join(',\n');
  const json = JSON.stringify({ ...brain, ledger: '@ledger' }, null, 2).replace('"@ledger"', `[\n${rows}\n  ]`);
  return `---\nname: ${env.id}\ndescription: ${env.title}, learned in the Learnabolic Lab.\n---\n${brain.policy.trimEnd()}\n\n\`\`\`learnabolic\n${json}\n\`\`\`\n`;
}
