"use client";

import { useEffect, useState } from "react";

interface Template {
  id: string;
  key: string;
  channel: string;
  subject: string | null;
  bodyTemplate: string;
  createdAt: string;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [form, setForm] = useState({ key: "", channel: "EMAIL", subject: "", bodyTemplate: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const response = await fetch("/api/templates");
    if (response.ok) {
      const data = await response.json();
      setTemplates(data.templates);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Gagal membuat template");
        return;
      }
      setForm({ key: "", channel: form.channel, subject: "", bodyTemplate: "" });
      load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Buat Template Baru</h2>
        <p className="mt-1 text-sm text-slate-600">
          Gunakan placeholder seperti <code className="rounded bg-slate-100 px-1 py-0.5">{"{{nama}}"}</code>{" "}
          di subjek maupun isi pesan.
        </p>
        <form onSubmit={handleCreate} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700">Key</label>
            <input
              required
              placeholder="welcome-email"
              value={form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Channel</label>
            <select
              value={form.channel}
              onChange={(e) => setForm({ ...form, channel: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="EMAIL">Email</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="PUSH">Push</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700">Subjek (opsional, untuk email)</label>
            <input
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700">Isi Template</label>
            <textarea
              required
              rows={3}
              value={form.bodyTemplate}
              onChange={(e) => setForm({ ...form, bodyTemplate: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {saving ? "Menyimpan..." : "Simpan Template"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Daftar Template</h2>
        <div className="mt-4 flex flex-col gap-3">
          {templates.map((t) => (
            <div key={t.id} className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <code className="font-semibold text-brand-700">{t.key}</code>
                <span className="text-xs font-medium text-slate-500">{t.channel}</span>
              </div>
              {t.subject && <p className="mt-1 text-sm text-slate-700">Subjek: {t.subject}</p>}
              <p className="mt-1 text-sm text-slate-600">{t.bodyTemplate}</p>
            </div>
          ))}
          {templates.length === 0 && <p className="text-sm text-slate-400">Belum ada template.</p>}
        </div>
      </section>
    </div>
  );
}
