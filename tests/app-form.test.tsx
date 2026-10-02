// @vitest-environment jsdom
import { afterEach, beforeAll, test, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppForm } from '@/components/AppForm';
import { pub } from './fixtures';

beforeAll(() => { process.env.CREDENTIALS_KEY = Buffer.alloc(32, 7).toString('base64'); });
afterEach(cleanup);

test('turning Needs login off hides username and password', async () => {
  render(<AppForm app={null} onSave={vi.fn()} onClose={vi.fn()} />);
  await userEvent.click(screen.getByLabelText('Needs login'));
  expect(screen.queryByLabelText('Username')).toBeNull();
  expect(screen.queryByLabelText('Password')).toBeNull();
});
test('editing without typing a password sends no password', async () => {
  const onSave = vi.fn().mockResolvedValue({});
  render(<AppForm app={pub()} onSave={onSave} onClose={vi.fn()} />);
  expect(screen.getByLabelText('Password')).toHaveAttribute('placeholder', 'Leave blank to keep');
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(onSave.mock.calls[0][0]).not.toHaveProperty('password');
});
test('a typed password is sent, with numbers as numbers', async () => {
  const onSave = vi.fn().mockResolvedValue({});
  render(<AppForm app={pub()} onSave={onSave} onClose={vi.fn()} />);
  await userEvent.type(screen.getByLabelText('Password'), 'n3w&pw');
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(onSave.mock.calls[0][0]).toMatchObject({ password: 'n3w&pw', redirect_delay_ms: 1500, sort_order: 100, requires_login: true, is_active: true });
});
test('server errors show beside their fields', async () => {
  render(<AppForm app={null} onSave={vi.fn().mockResolvedValue({ errors: { url: 'Must start with https://' } })} onClose={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('Must start with https://')).toBeVisible();
});
test('Test login shows the result, and only for saved apps', async () => {
  const onTest = vi.fn().mockResolvedValue({ ok: false, status: 401, message: 'Invalid Login. Try again.' });
  const { rerender } = render(<AppForm app={null} onSave={vi.fn()} onClose={vi.fn()} />);
  expect(screen.queryByRole('button', { name: 'Test login' })).toBeNull();
  rerender(<AppForm app={pub()} onSave={vi.fn()} onTest={onTest} onClose={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Test login' }));
  expect(await screen.findByText('Login failed: Invalid Login. Try again.')).toBeVisible();
});
test('successful save closes the form', async () => {
  const onClose = vi.fn();
  render(<AppForm app={pub()} onSave={vi.fn().mockResolvedValue({})} onClose={onClose} />);
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(onClose).toHaveBeenCalled();
});
