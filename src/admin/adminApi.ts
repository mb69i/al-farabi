import type { SupabaseClient } from '@supabase/supabase-js';
import type { ResearcherImportRow } from './importResearchers';
import type { SwitchState } from './Switches';

export type Guest = {
  id: string; serial: string; full_name: string; phone: string; email: string; gender: 'male' | 'female';
  guest_type: 'visitor' | 'student' | 'other' | null; workplace: string; specialization: string; lang: 'ar' | 'en';
  is_vip: boolean; created_at: string;
};
export type AdminResearcher = {
  id: string; name_ar: string; name_en: string | null; email: string; phone: string | null; gender: string | null;
  institution: string | null; research_title: string; is_vip: boolean; signed_at: string | null;
  doctor_name: string | null; signature_path: string | null;
};
export type Delivery = {
  id: string; kind: 'card' | 'certificate'; to_email: string; status: string; attempts: number;
  last_error: string | null; created_at: string; sent_at: string | null; name: string | null;
};
export type Overview = {
  total: number; present_today: number; male: number; female: number; vip: number;
  researchers_signed: number; researchers_total: number;
  switches: SwitchState;
  theme?: 'auto' | 'day' | 'night';
  deliveries: Array<{ kind: string; status: string; count: number }>;
};
export type Page<T> = { rows: T[]; total: number };
export type StaffMember = { user_id: string; email: string; role: 'owner' | 'admin' | 'doctor'; display_name: string | null; active: boolean };
export type AuditEntry = { id: number; at: string; actor_email: string | null; action: string; target: string | null; details: unknown };
/** A laptop/PC that keeps a backup copy (scripts/backup.py). Owner only. */
export type BackupDevice = {
  id: string; label: string; enabled: boolean; paired: boolean;
  pair_expires_at: string | null; last_seen_at: string | null; created_at: string;
};
/** One-time pairing code for a device (shown once; valid 30 minutes). */
export type BackupCode = { id: string; label: string; code: string; expires_at: string };
export type AdminExport = {
  guests: Guest[];
  researchers: AdminResearcher[];
  checkins: Array<{ serial: string; full_name: string; day: string; at: string }>;
};

const CHUNK = 200;

export function createAdminApi(client: SupabaseClient, slug: string) {
  async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw new Error(error.message);
    return data as T;
  }

  async function authed(path: string, body: unknown): Promise<Response> {
    const { data } = await client.auth.getSession();
    return fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
      body: JSON.stringify(body),
    });
  }

  return {
    overview: () => rpc<Overview>('admin_overview', { p_slug: slug }),
    listBackupDevices: () => rpc<BackupDevice[]>('admin_list_backup_devices'),
    addBackupDevice: (label: string) => rpc<BackupCode>('admin_add_backup_device', { p_label: label }),
    newBackupCode: (id: string) => rpc<BackupCode>('admin_new_backup_code', { p_id: id }),
    setBackupDevice: (id: string, enabled: boolean) => rpc<void>('admin_set_backup_device', { p_id: id, p_enabled: enabled }),
    deleteBackupDevice: (id: string) => rpc<void>('admin_delete_backup_device', { p_id: id }),
    listGuests: (search: string, limit: number, offset: number) =>
      rpc<Page<Guest>>('admin_list_guests', { p_slug: slug, p_search: search, p_limit: limit, p_offset: offset }),
    updateGuest: (id: string, patch: Partial<Guest>) => rpc<Guest>('admin_update_guest', { p_id: id, p_patch: patch }),
    deleteGuest: (id: string) => rpc<void>('admin_delete_guest', { p_id: id }),
    listResearchers: (search: string, limit: number, offset: number) =>
      rpc<Page<AdminResearcher>>('admin_list_researchers', { p_slug: slug, p_search: search, p_limit: limit, p_offset: offset }),
    async importResearchers(rows: ResearcherImportRow[]) {
      const total = { inserted: 0, updated: 0, errors: [] as Array<{ row: number; message: string }> };
      for (let i = 0; i < rows.length; i += CHUNK) {
        const r = await rpc<typeof total>('admin_import_researchers', { p_slug: slug, p_rows: rows.slice(i, i + CHUNK) });
        total.inserted += r.inserted;
        total.updated += r.updated;
        total.errors.push(...r.errors.map((e) => ({ ...e, row: e.row + i })));
      }
      return total;
    },
    setVip: (kind: 'guest' | 'researcher', id: string, value: boolean) =>
      rpc<void>('admin_set_vip', { p_kind: kind, p_id: id, p_value: value }),
    setDisplayTheme: (theme: 'auto' | 'day' | 'night') => rpc<string>('admin_set_display_theme', { p_theme: theme }),
    setSwitches: (s: SwitchState) =>
      rpc<SwitchState>('admin_set_switches', {
        p_slug: slug, p_registration_open: s.registration_open, p_cards_enabled: s.cards_enabled,
        p_certificates_enabled: s.certificates_enabled,
      }),
    listDeliveries: (status: string, limit: number, offset: number) =>
      rpc<Page<Delivery>>('admin_list_deliveries', { p_slug: slug, p_status: status, p_limit: limit, p_offset: offset }),
    retryDelivery: (id: string) => rpc<void>('admin_retry_delivery', { p_id: id }),
    async signatureUrl(path: string): Promise<string> {
      const rel = path.replace(/^signatures\//, '');
      const { data, error } = await client.storage.from('signatures').createSignedUrl(rel, 60);
      if (error || !data) throw new Error(error?.message ?? 'no url');
      return data.signedUrl;
    },
    exportAll: () => rpc<AdminExport>('admin_export', { p_slug: slug }),
    async uploadTemplateFile(kind: 'card' | 'certificate', file: File) {
      const path = `uploads/${kind}-${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`;
      const { error } = await client.storage.from('templates').upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw new Error(error.message);
      const res = await authed('/api/template', { kind, upload_path: path, content_type: file.type });
      if (!res.ok) throw new Error(`template ${res.status}`);
      return (await res.json()) as { forma_path: string; width: number; height: number };
    },
    async formaUrl(formaPath: string): Promise<string> {
      const { data, error } = await client.storage.from('templates').createSignedUrl(formaPath, 600);
      if (error || !data) throw new Error(error?.message ?? 'no url');
      return data.signedUrl;
    },
    async preview(kind: 'card' | 'certificate', layout: unknown, formaPath: string, sample: Record<string, string>) {
      const res = await authed('/api/preview', { kind, layout, forma_path: formaPath, sample_values: sample });
      if (!res.ok) throw new Error(`preview ${res.status}`);
      return URL.createObjectURL(await res.blob());
    },
    getTemplate: (kind: 'card' | 'certificate') =>
      rpc<{ forma_path: string; width: number; height: number; layout: unknown } | null>('admin_get_template', { p_slug: slug, p_kind: kind }),
    saveTemplate: (kind: 'card' | 'certificate', formaPath: string, width: number, height: number, layout: unknown) =>
      rpc<void>('admin_save_template', { p_slug: slug, p_kind: kind, p_forma_path: formaPath, p_width: width, p_height: height, p_layout: layout }),
    getContact: () => rpc<{ phone: string; email: string; location_ar: string; location_en: string } | null>('get_site_contact'),
    setContact: (c: { phone: string; email: string; location_ar: string; location_en: string }) =>
      rpc<unknown>('admin_set_contact', { p_phone: c.phone, p_email: c.email, p_location_ar: c.location_ar, p_location_en: c.location_en }),
    listStaff: () => rpc<StaffMember[]>('owner_list_staff'),
    setStaff: (userId: string, role: StaffMember['role'], active: boolean) =>
      rpc<void>('owner_set_staff', { p_user_id: userId, p_role: role, p_active: active }),
    async inviteStaff(email: string, role: 'admin' | 'doctor', displayName: string) {
      const res = await authed('/api/staff', { email, role, display_name: displayName });
      if (!res.ok) throw new Error(`invite ${res.status}`);
    },
    grantStaff: (email: string, role: 'admin' | 'doctor', displayName: string) =>
      rpc<{ status: 'ok' | 'no_account'; user_id?: string }>('owner_grant_staff_by_email', {
        p_email: email, p_role: role, p_display_name: displayName,
      }),
    audit: (limit: number, offset: number) => rpc<Page<AuditEntry>>('owner_audit', { p_limit: limit, p_offset: offset }),
  };
}

export type AdminApi = ReturnType<typeof createAdminApi>;
