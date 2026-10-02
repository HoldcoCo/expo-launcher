// @vitest-environment jsdom
import { afterEach, beforeAll, test, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppTile } from '@/components/AppTile';
import { pub } from './fixtures';

beforeAll(() => { process.env.CREDENTIALS_KEY = Buffer.alloc(32, 7).toString('base64'); });
afterEach(cleanup);
const noop = { onLaunch: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn() };

test('login tile shows its demo user; no-login tile does not', () => {
  const { rerender } = render(<AppTile app={pub()} editMode={false} {...noop} />);
  expect(screen.getByText('as demo@axiom.test')).toBeVisible();
  rerender(<AppTile app={pub({ requires_login: false, username: null })} editMode={false} {...noop} />);
  expect(screen.queryByText(/^as /)).toBeNull();
});
test('tile shows its domain', () => {
  render(<AppTile app={pub()} editMode={false} {...noop} />);
  expect(screen.getByText('demo.axiomerp.co')).toBeVisible();
});
test('unreadable password disables the tile and says why', () => {
  render(<AppTile app={pub({ passwordReadable: false })} editMode={false} {...noop} />);
  expect(screen.getByRole('button', { name: /Axiom ARC/ })).toBeDisabled();
  expect(screen.getByText('Re-enter password')).toBeVisible();
});
test('login app with no saved password is disabled and says so', () => {
  render(<AppTile app={pub({ hasPassword: false, passwordReadable: false })} editMode={false} {...noop} />);
  expect(screen.getByRole('button', { name: /Axiom ARC/ })).toBeDisabled();
  expect(screen.getByText('No password saved')).toBeVisible();
});
test('tapping the tile launches it', async () => {
  const onLaunch = vi.fn();
  render(<AppTile app={pub()} editMode={false} {...noop} onLaunch={onLaunch} />);
  await userEvent.click(screen.getByRole('button', { name: /Axiom ARC/ }));
  expect(onLaunch).toHaveBeenCalledOnce();
});
test('edit and delete appear only in edit mode', () => {
  const { rerender } = render(<AppTile app={pub()} editMode={false} {...noop} />);
  expect(screen.queryByRole('button', { name: 'Edit Axiom ARC' })).toBeNull();
  rerender(<AppTile app={pub()} editMode {...noop} />);
  expect(screen.getByRole('button', { name: 'Edit Axiom ARC' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Delete Axiom ARC' })).toBeVisible();
});
test('hidden app is labelled Hidden in edit mode', () => {
  render(<AppTile app={pub({ is_active: false })} editMode {...noop} />);
  expect(screen.getByText('Hidden')).toBeVisible();
});
test('check results show as a status line', () => {
  const { rerender } = render(<AppTile app={pub()} editMode check={{ ok: true, status: 200, message: 'Logged In' }} {...noop} />);
  expect(screen.getByText('Login works')).toBeVisible();
  rerender(<AppTile app={pub()} editMode check={{ ok: false, status: 401, message: 'Invalid Login. Try again.' }} {...noop} />);
  expect(screen.getByText('Login failed: Invalid Login. Try again.')).toBeVisible();
  rerender(<AppTile app={pub()} editMode check={{ skipped: true }} {...noop} />);
  expect(screen.getByText('No login needed')).toBeVisible();
});
