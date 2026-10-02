import { encryptPassword } from '@/lib/crypto';
import { toPublicApp, type AppRow, type PublicApp } from '@/lib/apps';

export const stored = (over: Partial<AppRow> = {}): AppRow => ({
  id: "a1", name: "Axiom ARC", group_name: "Axiom", description: null, icon: null,
  url: "https://demo.axiomerp.co/arc/", requires_login: true, username: "demo@axiom.test",
  password_encrypted: encryptPassword("old"), redirect_delay_ms: 1500, sort_order: 100, is_active: true,
  last_check_ok: null, last_check_at: null, created_at: "", updated_at: "", ...over,
});

export const pub = (over: Partial<PublicApp> = {}): PublicApp => ({ ...toPublicApp(stored()), ...over });
