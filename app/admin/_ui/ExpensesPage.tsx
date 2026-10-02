"use client";

import { useMemo, useState } from "react";
import type { Expense } from "@/lib/types";
import { rupee, shopToday } from "@/lib/money";
import { expenseStats, rangeOf, type Period } from "@/lib/analytics";
import { useAdmin } from "./Store";
import { Badge, Btn, Card, Empty, Field, Kpi, Modal, Page, PageHead, Pills, SearchBox, cx, inputCls } from "./kit";

type Form = { id?: string; title: string; category: string; amount: string; paymentMode: string; notes: string; expenseDate: string };

const MODES = [
  ["cash", "Cash"],
  ["upi", "UPI"],
  ["card", "Card"],
  ["bank", "Bank"],
] as const;
const SUGGESTED = ["Ingredients", "Rent", "Salary", "Utilities", "Maintenance", "Packaging", "Marketing", "Other"];
const th = "px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-500 whitespace-nowrap";
const td = "px-4 py-3 text-[13px]";
const ddmmyyyy = (d: string) => d.split("-").reverse().join("/");

export default function ExpensesPage() {
  const { s, act, confirm, toast } = useAdmin();
  const [period, setPeriod] = useState<Period>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);

  const range = useMemo(() => rangeOf(period, from, to), [period, from, to]);
  const st = useMemo(() => expenseStats(s.expenses, range, cat, q), [s.expenses, range, cat, q]);
  const cats = useMemo(() => Array.from(new Set([...SUGGESTED, ...s.expenses.map((e) => e.category)])), [s.expenses]);
  const used = useMemo(() => Array.from(new Set(s.expenses.map((e) => e.category))), [s.expenses]);
  const max = st.breakdown[0]?.amount || 1;

  const open = (e?: Expense) =>
    setForm(
      e
        ? { id: e.id, title: e.title, category: e.category, amount: String(e.amount), paymentMode: e.paymentMode, notes: e.notes, expenseDate: e.expenseDate }
        : { title: "", category: "Ingredients", amount: "", paymentMode: "cash", notes: "", expenseDate: shopToday() },
    );

  const save = async () => {
    if (!form) return;
    setBusy(true);
    const r = await act<Expense>("expense.save", { ...form });
    setBusy(false);
    if (r.ok) {
      toast({ kind: "ok", title: form.id ? "Expense updated" : `${r.result.title} — ${rupee(r.result.amount)} recorded` });
      setForm(null);
    }
  };

  return (
    <Page>
      <PageHead
        title="Expenses"
        sub="Everything you spend. The total is subtracted from revenue in Analytics."
        right={
          <Btn kind="red" icon="plus" onClick={() => open()}>
            Add expense
          </Btn>
        }
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Pills
          value={period}
          onChange={setPeriod}
          options={[
            { v: "today", t: "Today" },
            { v: "week", t: "Week" },
            { v: "month", t: "Month" },
            { v: "year", t: "Year" },
            { v: "custom", t: "Custom" },
            { v: "all", t: "All" },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          {period === "custom" && (
            <span className="flex items-center gap-2 text-[12px] font-semibold text-slate-500">
              <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-10 rounded-xl border border-slate-200 px-2" aria-label="From" />
              –
              <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-10 rounded-xl border border-slate-200 px-2" aria-label="To" />
            </span>
          )}
          <select className="h-10 rounded-full border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-700 outline-none" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
            <option value="all">All categories</option>
            {used.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <SearchBox value={q} onChange={setQ} placeholder="Search title, category, notes…" className="w-full sm:w-64" />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi label="Total expenses" value={rupee(st.total)} hint="In the filtered range" icon="rupee" tone="rose" />
        <Kpi label="Top category" value={st.top ? st.top.category : "—"} hint={st.top ? rupee(st.top.amount) : "No expenses"} icon="trophy" tone="amber" small />
        <Kpi label="Entries" value={st.count} hint="Matching the filters" icon="list" tone="sky" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card title="Expense log">
          {!st.rows.length ? (
            <Empty icon="bag" title={s.expenses.length ? "No expenses match" : "No expenses yet"}>
              {s.expenses.length ? null : "Add rent, ingredients, salaries… and Analytics will show net earnings."}
            </Empty>
          ) : (
            <div className="overflow-x-auto adm-scroll">
              <table className="w-full min-w-[640px]">
                <thead className="bg-slate-50">
                  <tr>
                    <th className={th}>Date</th>
                    <th className={th}>Title</th>
                    <th className={th}>Category</th>
                    <th className={th}>Paid by</th>
                    <th className={cx(th, "text-right")}>Amount</th>
                    <th className={cx(th, "text-right")}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {st.rows.map((e) => (
                    <tr key={e.id} className="border-b border-slate-100 last:border-0">
                      <td className={cx(td, "whitespace-nowrap text-slate-600")}>{ddmmyyyy(e.expenseDate)}</td>
                      <td className={td}>
                        <b className="text-slate-900">{e.title}</b>
                        {e.notes && <span className="block max-w-[260px] truncate text-[11.5px] text-slate-400">{e.notes}</span>}
                      </td>
                      <td className={td}>
                        <Badge tone="orange">{e.category}</Badge>
                      </td>
                      <td className={cx(td, "uppercase text-slate-500")}>{e.paymentMode}</td>
                      <td className={cx(td, "text-right font-bold text-slate-900")}>{rupee(e.amount)}</td>
                      <td className={cx(td, "text-right")}>
                        <span className="inline-flex gap-3 text-[11px] font-extrabold uppercase">
                          <button type="button" className="text-blue-600 hover:underline" onClick={() => open(e)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="text-red-600 hover:underline"
                            onClick={async () => {
                              if (await confirm({ title: `Delete “${e.title}”?`, body: `${rupee(e.amount)} will no longer count against revenue.`, ok: "Delete", danger: true })) await act("expense.delete", { id: e.id });
                            }}
                          >
                            Del
                          </button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="By category">
          {st.breakdown.length ? (
            <ul className="space-y-3.5">
              {st.breakdown.map((b) => (
                <li key={b.category}>
                  <div className="mb-1 flex justify-between text-[13px]">
                    <b className="text-slate-800">{b.category}</b>
                    <span className="font-semibold text-slate-600">
                      {rupee(b.amount)} · {Math.round((b.amount / (st.total || 1)) * 100)}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="adm-fill h-full rounded-full bg-red-600" style={{ width: `${(b.amount / max) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-slate-400">Nothing to break down yet.</p>
          )}
        </Card>
      </div>

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? "Edit expense" : "Add expense"}
        footer={
          <>
            <Btn onClick={() => setForm(null)}>Cancel</Btn>
            <Btn kind="red" onClick={save} disabled={busy}>
              {form?.id ? "Save changes" : "Add expense"}
            </Btn>
          </>
        }
      >
        {form && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title *" className="sm:col-span-2">
              <input className={inputCls} value={form.title} maxLength={120} placeholder="e.g. Milk & cream — weekly" onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <Field label="Amount (₹) *">
              <input className={inputCls} type="number" min={0} step="0.01" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </Field>
            <Field label="Date">
              <input className={inputCls} type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} />
            </Field>
            <Field label="Category">
              <input className={inputCls} list="exp-cats" value={form.category} maxLength={40} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              <datalist id="exp-cats">
                {cats.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Paid by">
              <select className={inputCls} value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}>
                {MODES.map(([v, t]) => (
                  <option key={v} value={v}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <textarea className={cx(inputCls, "h-20 py-2")} value={form.notes} maxLength={300} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>
    </Page>
  );
}
