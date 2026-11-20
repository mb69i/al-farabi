/** Saves a researcher's handwritten signature, then records the sign-off exactly once. */

export type SignoffResult = { status: 'signed' | 'already_signed' | 'certificates_paused'; signed_at?: string };

export type SignoffDeps = {
  /** Upload into the private `signatures` bucket at `path` (relative to the bucket). */
  upload: (path: string, body: Blob, contentType: string) => Promise<{ error: { message: string; statusCode?: string } | null }>;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** One upload try that takes longer than this is given up and tried again (hall wifi can stall a request). */
  timeoutMs?: number;
};

export type SignoffInput = {
  eventId: string;
  researcherId: string;
  png: Blob;
  strokes: unknown;
  device: string;
};

const ATTEMPTS = 4;
const TIMEOUT_MS = 12_000;

function readBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(blob);
  });
}

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await readBytes(blob));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function alreadyExists(err: { message: string; statusCode?: string }): boolean {
  return err.statusCode === '409' || /already exists|duplicate/i.test(err.message);
}

async function uploadWithRetry(deps: SignoffDeps, path: string, body: Blob, type: string): Promise<void> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const limit = deps.timeoutMs ?? TIMEOUT_MS;
  let last = 'upload failed';
  for (let i = 0; i < ATTEMPTS; i++) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stalled = new Promise<{ error: { message: string } }>((r) => {
      timer = setTimeout(() => r({ error: { message: 'upload timed out' } }), limit);
    });
    // A stalled try that lands later is harmless: the retry then finds the file already there (409 = stored).
    const { error } = await Promise.race([deps.upload(path, body, type), stalled]).finally(() => clearTimeout(timer));
    if (!error || alreadyExists(error)) return;
    last = error.message;
    if (i < ATTEMPTS - 1) await sleep(500 * 2 ** i);
  }
  throw new Error(last);
}

export async function submitSignoff(deps: SignoffDeps, input: SignoffInput): Promise<SignoffResult> {
  const stamp = (deps.now ?? Date.now)();
  const base = `${input.eventId}/${input.researcherId}/${stamp}`;
  const hash = await sha256Hex(input.png);
  const strokes = new Blob([JSON.stringify(input.strokes)], { type: 'application/json' });

  // Both files at once (owner, 21 Nov: faster sign-in); the sign-off is recorded only once both are stored.
  await Promise.all([
    uploadWithRetry(deps, `${base}.png`, input.png, 'image/png'),
    uploadWithRetry(deps, `${base}.json`, strokes, 'application/json'),
  ]);

  const { data, error } = await deps.rpc('sign_off_researcher', {
    p_researcher_id: input.researcherId,
    p_signature_path: `signatures/${base}.png`,
    p_strokes_path: `signatures/${base}.json`,
    p_sig_sha256: hash,
    p_device: input.device.slice(0, 200),
  });
  if (error) throw new Error(error.message);
  return data as SignoffResult;
}
