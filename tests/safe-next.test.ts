import { test, expect } from 'vitest';
import { safeNext } from '@/lib/safe-next';

test.each([['/', '/'], ['/?edit=1', '/?edit=1'], ['//evil.test', '/'], ['/\\evil.test', '/'], ['https://evil.test', '/'], [null, '/'], ['', '/']])(
  'safeNext(%s) is %s', (input, out) => expect(safeNext(input)).toBe(out));
