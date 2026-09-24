"use client";

import { useMemo, useState } from "react";
import type { PublicUser } from "@/lib/types";
import { useAdmin } from "./Store";
import { Badge, Btn, Empty, Field, Icon, Modal, Page, PageHead, SearchBox, cx, fmtDate, inputCls } from "./kit";

/* ------------------------------------------------------------------
   Users — everyone the shop knows, and who among them can get in.

   There is no sign-up anywhere in this app: guests order from a QR code and
   leave a mobile number, so that number is the identity every row is keyed on.
   A row is therefore built from order history, and "admin" is simply whether a
   login exists for that number — which is what lets a regular at a table be
   handed access without typing their details in again.
   ------------------------------------------------------------------ */

type Row = {
  name: string;
  email: string;
  mobile: string;
  /** first time we saw them — their first order, or the day they were given access */
  joined: number;
  user: PublicUser | null;
};

const th = "px-4 py-3.5 text-left text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-500 whitespace-nowrap";
const td = "px-4 py-4 text-[13.5px] whitespace-nowrap";

export default function UsersPage() {
  const { s, act, confirm, refresh, toast } = useAdmin();
  const [q, setQ] = useState("");
  const [promote, setPromote] = useState<Row | null>(null);

  const rows = useMemo<Row[]>(() => {
    const by = new Map<string, Row>();
    const seen = (mobile: string, name: string, at: number) => {
      if (!mobile) return;
      const cur = by.get(mobile);
      if (!cur) by.set(mobile, { name: name || "Unknown", email: "", mobile, joined: at, user: null });
      else {
        cur.joined = Math.min(cur.joined, at);
        if (name && cur.name === "Unknown") cur.name = name;
      }
    };
    for (const x of s.sessions) seen(x.customerPhone, x.customerName, x.openedAt);
    for (const b of s.bills) seen(b.customerPhone, b.customerName, b.createdAt);

    /* anyone with a login is an admin, whether or not they have ever ordered */
    for (const u of s.users) {
      const cur = by.get(u.mobile);
      if (cur) {
        cur.user = u;
        cur.email = u.email;
        if (u.name) cur.name = u.name;
        cur.joined = Math.min(cur.joined, u.createdAt);
      } else {
        by.set(u.mobile, { name: u.name, email: u.email, mobile: u.mobile, joined: u.createdAt, user: u });
      }
    }
    return [...by.values()].sort((a, b) => b.joined - a.joined);
  }, [s.sessions, s.bills, s.users]);

  const needle = q.trim().toLowerCase();
  const shown = needle ? rows.filter((r) => `${r.name} ${r.email} ${r.mobile}`.toLowerCase().includes(needle)) : rows;
  const admins = rows.filter((r) => r.user).length;

  const demote = async (r: Row) => {
    if (!r.user) return;
    const ok = await confirm({
      title: `Remove ${r.name}'s admin access?`,
      body: "Their password stops working straight away. They stay in this list as a customer, and you can give access back any time.",
      ok: "Remove admin",
      danger: true,
    });
    if (!ok) return;
    const res = await act("user.demote", { id: r.user.id });
    if (res.ok) toast({ kind: "ok", title: `${r.name} no longer has admin access.` });
  };

  return (
    <Page>
      <PageHead
        title="User Management"
        bar
        sub={`Everyone who has ordered, and who among them can sign in. ${admins} ${admins === 1 ? "person has" : "people have"} admin access.`}
        right={
          <Btn icon="refresh" onClick={() => refresh()}>
            Refresh
          </Btn>
        }
      />

      <SearchBox value={q} onChange={setQ} placeholder="Search by name or mobile…" className="mb-5 w-full lg:w-96" />

      {!rows.length ? (
        <Empty icon="users" title="Nobody yet">
          Guests appear here as soon as they place their first order from a table.
        </Empty>
      ) : !shown.length ? (
        <Empty icon="search" title="No one matches">
          Nothing here for “{q}”. Try a name or a mobile number.
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-100 shadow-[0_2px_10px_-2px_rgba(15,23,42,.08)]">
          <div className="adm-scroll overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className={th}>Name</th>
                  <th className={th}>Email</th>
                  <th className={th}>Mobile</th>
                  <th className={th}>Joined</th>
                  <th className={th}>Role</th>
                  <th className={cx(th, "text-right")}>Action</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.mobile} className="border-b border-slate-100 last:border-0 transition-colors hover:bg-slate-50/60">
                    <td className={cx(td, "font-bold text-slate-900")}>{r.name}</td>
                    <td className={cx(td, "text-slate-500")}>{r.email || "—"}</td>
                    <td className={cx(td, "adm-num text-slate-700")}>{r.mobile || "—"}</td>
                    <td className={cx(td, "text-slate-500")}>{fmtDate(r.joined)}</td>
                    <td className={td}>
                      {r.user ? (
                        <Badge tone="green">
                          <Icon name="check" size={12} stroke={2.6} />
                          Admin
                        </Badge>
                      ) : (
                        <Badge tone="slate">
                          <Icon name="users" size={12} stroke={2.4} />
                          Customer
                        </Badge>
                      )}
                    </td>
                    <td className={cx(td, "text-right")}>
                      {r.user ? (
                        <Btn size="sm" kind="warn" icon="x" onClick={() => demote(r)}>
                          Remove Admin
                        </Btn>
                      ) : (
                        <Btn size="sm" kind="ok" icon="check" onClick={() => setPromote(r)}>
                          Make Admin
                        </Btn>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {promote && <PromoteDialog row={promote} onClose={() => setPromote(null)} />}
    </Page>
  );
}

/* Giving someone access means giving them a password of their own — the sign-in
   box takes any staff password as well as the shop's, so nobody shares one. */
function PromoteDialog({ row, onClose }: { row: Row; onClose: () => void }) {
  const { act, toast } = useAdmin();
  const [name, setName] = useState(row.name === "Unknown" ? "" : row.name);
  const [email, setEmail] = useState(row.email);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const res = await act("user.promote", { name, email, mobile: row.mobile, password: pw });
    setBusy(false);
    if (!res.ok) return;
    toast({ kind: "ok", title: `${name || "They"} can now sign in to the admin.`, body: "Pass them the password you just set." });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Give admin access"
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="dark" disabled={pw.length < 6 || busy} onClick={save}>
            {busy ? "Saving…" : "Make admin"}
          </Btn>
        </>
      }
    >
      <div className="space-y-4">
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-[13px] text-slate-600">
          <b className="text-slate-900">{row.mobile}</b> — they sign in with the password you set here. The shop password keeps working as it does now.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Priya" maxLength={60} />
          </Field>
          <Field label="Email (optional)">
            <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="priya@example.com" inputMode="email" maxLength={120} />
          </Field>
        </div>
        <Field label="Their password (6+ characters)" hint="Write it down before you save — it can't be read back, only replaced.">
          <input type="password" className={inputCls} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        </Field>
      </div>
    </Modal>
  );
}
