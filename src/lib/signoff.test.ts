import { describe, expect, it, vi } from 'vitest';
import { submitSignoff, type SignoffDeps } from './signoff';

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
const png = new Blob([PNG_BYTES], { type: 'image/png' });

function deps(uploadResults: Array<{ error: { message: string; statusCode?: string } | null }>, over: Partial<SignoffDeps> = {}) {
  const upload = vi.fn(async () => uploadResults.shift() ?? { error: null });
  const rpc = vi.fn(async () => ({ data: { status: 'signed', signed_at: 't' }, error: null }));
  return {
    upload,
    rpc,
    sleep: vi.fn(async () => {}),
    now: () => 1_700_000_000_000,
    ...over,
  } as SignoffDeps & { upload: typeof upload; rpc: typeof rpc };
}

const input = { eventId: 'ev', researcherId: 'rs', png, strokes: [[{ x: 1, y: 2 }]], device: 'iPad' };

describe('submitSignoff', () => {
  it('retries upload then calls RPC once', async () => {
    const pngTries = [{ error: { message: 'network' } }, { error: { message: 'network' } }, { error: null }];
    const d = deps([], {
      upload: vi.fn(async (path: string) => (path.endsWith('.png') ? pngTries.shift()! : { error: null })),
    });
    const res = await submitSignoff(d, input);
    expect(res.status).toBe('signed');
    expect(d.upload).toHaveBeenCalledTimes(4); // png 3 tries + strokes once
    expect(d.rpc).toHaveBeenCalledTimes(1);
  });

  // Owner, 21 Nov: "make the researchers sign in faster". The two files go up together, not one after the other.
  it('uploads the signature and the strokes at the same time', async () => {
    const started: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const d = deps([], {
      upload: vi.fn(async (path: string) => {
        started.push(path);
        await gate;
        return { error: null };
      }),
    });
    const done = submitSignoff(d, input);
    await vi.waitFor(() => expect(started).toHaveLength(2));
    expect(d.rpc).not.toHaveBeenCalled(); // the sign-off is recorded only once both files are stored
    release();
    await done;
    expect(d.rpc).toHaveBeenCalledTimes(1);
  });

  it('a stalled upload is given up after a time limit and tried again', async () => {
    let first = true;
    const d = deps([], {
      timeoutMs: 20,
      upload: vi.fn(async (path: string) => {
        if (path.endsWith('.png') && first) {
          first = false;
          return new Promise<never>(() => {}); // the hall wifi swallowed it
        }
        return { error: null };
      }),
    });
    const res = await submitSignoff(d, input);
    expect(res.status).toBe('signed');
    expect(d.upload).toHaveBeenCalledTimes(3);
  });

  it('upload failing 4 times surfaces error and does not call RPC', async () => {
    const fail = { error: { message: 'network' } };
    const d = deps([], { upload: vi.fn(async (path: string) => (path.endsWith('.png') ? fail : { error: null })) });
    await expect(submitSignoff(d, input)).rejects.toThrow();
    expect(d.upload).toHaveBeenCalledTimes(5); // png 4 tries + strokes
    expect(d.rpc).not.toHaveBeenCalled();
  });

  it('an object that already exists counts as uploaded', async () => {
    const d = deps([], {
      upload: vi.fn(async (path: string) =>
        path.endsWith('.png') ? { error: { message: 'The resource already exists', statusCode: '409' } } : { error: null },
      ),
    });
    await submitSignoff(d, input);
    expect(d.upload).toHaveBeenCalledTimes(2);
    expect(d.rpc).toHaveBeenCalledTimes(1);
  });

  it('paths are under signatures/<event>/<researcher>/ with a timestamp', async () => {
    const d = deps([]);
    await submitSignoff(d, input);
    const paths = d.upload.mock.calls.map((c) => (c as unknown[])[0]).sort();
    expect(paths).toEqual(['ev/rs/1700000000000.json', 'ev/rs/1700000000000.png']);
    const args = (d.rpc.mock.calls[0] as unknown[])[1] as Record<string, string>;
    expect(args.p_signature_path).toBe('signatures/ev/rs/1700000000000.png');
    expect(args.p_strokes_path).toBe('signatures/ev/rs/1700000000000.json');
  });

  it('sha256 matches uploaded bytes', async () => {
    const d = deps([]);
    await submitSignoff(d, input);
    const digest = await crypto.subtle.digest('SHA-256', PNG_BYTES);
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    const args = (d.rpc.mock.calls[0] as unknown[])[1] as Record<string, string>;
    expect(args.p_sig_sha256).toBe(hex);
  });

  it('RPC error is thrown', async () => {
    const d = deps([], { rpc: vi.fn(async () => ({ data: null, error: { message: 'denied' } })) });
    await expect(submitSignoff(d, input)).rejects.toThrow('denied');
  });
});
