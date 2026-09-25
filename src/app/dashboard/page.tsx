"use client";

import { useCallback, useEffect, useState } from "react";
import { StatusBadge } from "./status-badge";

interface Notification {
  id: string;
  channel: string;
  recipient: string;
  subject: string | null;
  body: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
  template: { key: string } | null;
}

interface Me {
  id: string;
  name: string;
  email: string;
  apiKey: string;
}

const STATUS_FILTERS = ["ALL", "QUEUED", "PROCESSING", "SENT", "FAILED", "DEAD_LETTER"];

export default function DashboardPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [showKey, setShowKey] = useState(false);
  const [form, setForm] = useState({ channel: "EMAIL", recipient: "", subject: "", body: "" });
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    const query = filter === "ALL" ? "" : `?status=${filter}`;
    const response = await fetch(`/api/notifications${query}`);
    if (response.ok) {
      const data = await response.json();
      setNotifications(data.notifications);
    }
  }, [filter]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => setMe(data.user));
  }, []);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 3000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    setSendError(null);
    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) {
        setSendError(data.error ?? "Gagal mengirim notifikasi");
        return;
      }
      setForm({ channel: form.channel, recipient: "", subject: "", body: "" });
      loadNotifications();
    } finally {
      setSending(false);
    }
  }

  async function handleRetry(id: string) {
    await fetch(`/api/notifications/${id}/retry`, { method: "POST" });
    loadNotifications();
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">API Key</h2>
        <p className="mt-1 text-sm text-slate-600">
          Kirim header <code className="rounded bg-slate-100 px-1 py-0.5">X-Api-Key</code> ke{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5">POST /api/notifications</code>.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <code className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-green-400">
            {showKey ? me?.apiKey : "•".repeat(24)}
          </code>
          <button
            onClick={() => setShowKey((s) => !s)}
            className="text-sm font-medium text-brand-600 hover:underline"
          >
            {showKey ? "Sembunyikan" : "Tampilkan"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Kirim Notifikasi Baru</h2>
        <form onSubmit={handleSend} className="mt-4 grid gap-4 sm:grid-cols-2">
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
          <div>
            <label className="block text-sm font-medium text-slate-700">Penerima</label>
            <input
              required
              placeholder="user@email.com / 628xxxx"
              value={form.recipient}
              onChange={(e) => setForm({ ...form, recipient: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Subjek (opsional)</label>
            <input
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700">Isi Pesan</label>
            <textarea
              required
              rows={3}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          {sendError && <p className="text-sm text-red-600 sm:col-span-2">{sendError}</p>}
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={sending}
              className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {sending ? "Mengirim..." : "Kirim"}
            </button>
          </div>
        </form>
        <p className="mt-2 text-xs text-slate-500">
          Tips: gunakan penerima berawalan <code>fail-</code> untuk mensimulasikan kegagalan pengiriman
          dan menguji retry/dead letter queue.
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Riwayat Notifikasi</h2>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4">Channel</th>
                <th className="py-2 pr-4">Penerima</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Percobaan</th>
                <th className="py-2 pr-4">Error</th>
                <th className="py-2 pr-4">Dibuat</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {notifications.map((n) => (
                <tr key={n.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4">{n.channel}</td>
                  <td className="py-2 pr-4">{n.recipient}</td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={n.status} />
                  </td>
                  <td className="py-2 pr-4">
                    {n.attempts}/{n.maxAttempts}
                  </td>
                  <td className="max-w-xs truncate py-2 pr-4 text-red-600" title={n.lastError ?? ""}>
                    {n.lastError ?? "-"}
                  </td>
                  <td className="py-2 pr-4 text-slate-500">{new Date(n.createdAt).toLocaleString("id-ID")}</td>
                  <td className="py-2 pr-4">
                    {(n.status === "FAILED" || n.status === "DEAD_LETTER") && (
                      <button
                        onClick={() => handleRetry(n.id)}
                        className="rounded-lg border border-brand-600 px-2.5 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50"
                      >
                        Retry
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {notifications.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-400">
                    Belum ada notifikasi.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
