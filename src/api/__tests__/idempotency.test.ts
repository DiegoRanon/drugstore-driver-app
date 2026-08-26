/**
 * Keys have exactly two jobs: be unique, and fit.
 *
 * Unique, because two writes sharing one key is the failure this whole
 * mechanism exists to prevent — the second would replay the first's stored
 * response and the driver's second delivery would silently never happen.
 * Under 255 characters, because the server answers `VALIDATION_FAILED` above
 * that and `httpFetch` refuses to send it.
 */
import { newIdempotencyKey } from '../idempotency';

describe('newIdempotencyKey', () => {
  it('never repeats, even generated in a tight loop within one millisecond', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 10_000; i += 1) keys.add(newIdempotencyKey('pickup'));

    expect(keys.size).toBe(10_000);
  });

  it('stays inside the server ceiling', () => {
    for (const scope of ['pickup', 'handover-batch', 'notif-read']) {
      expect(newIdempotencyKey(scope).length).toBeLessThanOrEqual(255);
    }
  });

  it('keeps the scope in front, so a server log says what the write was', () => {
    expect(newIdempotencyKey('complete').startsWith('complete-')).toBe(true);
  });

  /*
    A deliberate second attempt after a failure must get a fresh key: the first
    may have a 4xx cached against it for 24 hours, and reusing it would replay
    the refusal instead of retrying the work.
  */
  it('gives a fresh key to a retry rather than reusing the last one', () => {
    expect(newIdempotencyKey('return')).not.toBe(newIdempotencyKey('return'));
  });
});
