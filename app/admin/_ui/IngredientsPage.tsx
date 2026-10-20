"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Batch, Ingredient, IngredientUnit, Recipe } from "@/lib/types";
import { rupee } from "@/lib/money";
import { useAdmin } from "./Store";
import { Badge, Btn, Card, Empty, Field, Icon, Kpi, Modal, Page, PageHead, SearchBox, cx, inputCls } from "./kit";

/* ============================================================
   RAW-INGREDIENT INVENTORY
   The shop's wet / dry stores — sugar in grams, milk in millilitres —
   plus the batch log that pulls from them and the waste meter that
   watches what gets thrown out. Everything flows into one ledger
   the admin can filter and download as Excel-friendly CSV.
   ============================================================ */

const UNIT_LABEL: Record<IngredientUnit, string> = { g: "g", ml: "ml" };

const num3 = (n: number) => Math.round(n * 1000) / 1000;
const fmtQty = (n: number, unit: IngredientUnit) => `${num3(n).toLocaleString("en-IN", { maximumFractionDigits: 3 })}${unit}`;
const perUnitRupee = (n: number) => `₹${(Math.round(n * 10000) / 10000).toLocaleString("en-IN", { maximumFractionDigits: 4 })}`;

const th = "px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-500 whitespace-nowrap";
const td = "px-4 py-3 text-[13px]";

/* ---------------- add / edit ingredient ---------------- */
type IngForm = { id?: string; name: string; unit: IngredientUnit; lowAt: string };
const EMPTY_ING: IngForm = { name: "", unit: "g", lowAt: "0" };

function IngredientModal({ initial, onClose }: { initial: IngForm; onClose: () => void }) {
  const { act, toast } = useAdmin();
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!f.name.trim()) return toast({ kind: "err", title: "Name is required." });
    setBusy(true);
    const r = await act("ingredient.save", { id: f.id, name: f.name, unit: f.unit, lowAt: Number(f.lowAt) || 0 });
    setBusy(false);
    if (r.ok) { toast({ kind: "ok", title: f.id ? "Ingredient updated." : "Ingredient added." }); onClose(); }
  };
  return (
    <Modal open onClose={onClose} title={f.id ? "Edit ingredient" : "New ingredient"} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="dark" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Btn></>}>
      <div className="space-y-4">
        <Field label="Name"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Sugar, Milk, Flour…" autoFocus /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Measured in">
            <div className="flex rounded-xl bg-slate-100 p-1">
              {(["g", "ml"] as const).map((u) => (
                <button key={u} type="button" onClick={() => setF({ ...f, unit: u })} className={cx("h-10 flex-1 rounded-lg text-[13px] font-bold uppercase tracking-wide transition", f.unit === u ? "bg-white text-slate-900 shadow" : "text-slate-500")}>
                  {u === "g" ? "Grams (g)" : "Millilitres (ml)"}
                </button>
              ))}
            </div>
          </Field>
          <Field label={`Low-stock warning (${f.unit})`} hint="Flagged in the list when stock falls to or below this.">
            <input className={inputCls} inputMode="decimal" value={f.lowAt} onChange={(e) => setF({ ...f, lowAt: e.target.value.replace(/[^\d.]/g, "") })} placeholder="e.g. 500" />
          </Field>
        </div>
        {!f.id && <p className="rounded-xl bg-slate-50 px-4 py-3 text-[12.5px] text-slate-500">After saving, use <b>Add stock</b> to record a purchase — the system works out the per-{f.unit} price from the quantity and total cost.</p>}
      </div>
    </Modal>
  );
}

/* ---------------- add stock (purchase) / waste / adjust modal ---------------- */
type MoveKind = "purchase" | "waste" | "adjust";
function MoveModal({ ing, kind, onClose }: { ing: Ingredient; kind: MoveKind; onClose: () => void }) {
  const { act, toast } = useAdmin();
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [stock, setStock] = useState(String(ing.stock));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const title = kind === "purchase" ? "Add stock" : kind === "waste" ? "Log waste" : "Correct stock";
  const label = kind === "purchase" ? `Quantity bought (${ing.unit})` : kind === "waste" ? `Quantity wasted (${ing.unit})` : `Actual stock on hand (${ing.unit})`;
  const perUnit = kind === "purchase" && Number(qty) > 0 && Number(cost) >= 0 ? perUnitRupee(Number(cost) / Number(qty)) : "";
  const submit = async () => {
    setBusy(true);
    const op = kind === "purchase" ? "ingredient.purchase" : kind === "waste" ? "ingredient.waste" : "ingredient.adjust";
    const payload: Record<string, unknown> = { id: ing.id, note };
    if (kind === "purchase") { payload.qty = Number(qty); payload.cost = Number(cost); }
    else if (kind === "waste") payload.qty = Number(qty);
    else payload.stock = Number(stock);
    const r = await act(op, payload);
    setBusy(false);
    if (r.ok) {
      toast({ kind: "ok", title: kind === "purchase" ? `Added ${qty}${ing.unit} of ${ing.name}.` : kind === "waste" ? `Logged ${qty}${ing.unit} wasted.` : `${ing.name} stock set to ${stock}${ing.unit}.` });
      onClose();
    }
  };
  const ok = kind === "adjust" ? Number(stock) >= 0 : Number(qty) > 0 && (kind !== "purchase" || Number(cost) >= 0);
  return (
    <Modal open onClose={onClose} title={`${title} · ${ing.name}`} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind={kind === "waste" ? "red" : "dark"} onClick={submit} disabled={!ok || busy}>{busy ? "Saving…" : title}</Btn></>}>
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-50 px-4 py-3 text-[12.5px] text-slate-500">
          On hand now: <b className="adm-num text-slate-900">{fmtQty(ing.stock, ing.unit)}</b> · running cost {perUnitRupee(ing.costPerUnit)}/{ing.unit}
        </div>
        {kind !== "adjust" ? (
          <Field label={label}><input className={inputCls} inputMode="decimal" autoFocus value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ""))} placeholder="e.g. 1000" /></Field>
        ) : (
          <Field label={label}><input className={inputCls} inputMode="decimal" autoFocus value={stock} onChange={(e) => setStock(e.target.value.replace(/[^\d.]/g, ""))} /></Field>
        )}
        {kind === "purchase" && (
          <>
            <Field label="Total cost (₹)"><input className={inputCls} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ""))} placeholder="e.g. 85" /></Field>
            {perUnit && <p className="rounded-xl bg-emerald-50 px-4 py-2.5 text-[12.5px] font-semibold text-emerald-700">That works out to {perUnit}/{ing.unit}. Weighted into the running cost.</p>}
          </>
        )}
        <Field label="Note (optional)"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === "waste" ? "Spilled, expired, trimmed off…" : kind === "purchase" ? "Invoice #, supplier, batch…" : "Why the correction?"} maxLength={200} /></Field>
      </div>
    </Modal>
  );
}

/* ---------------- the "log a batch" quick form ---------------- */
type Row = { key: number; ingredientId: string; qty: string; note: string };
let rowSeq = 0;
const blankRow = (): Row => ({ key: ++rowSeq, ingredientId: "", qty: "", note: "" });

function BatchModal({ ingredients: ings, recipes, onClose }: { ingredients: Ingredient[]; recipes: Recipe[]; onClose: () => void }) {
  const { act, confirm, toast } = useAdmin();
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const [busy, setBusy] = useState(false);
  const [recipeId, setRecipeId] = useState("");
  const [saveRecipe, setSaveRecipe] = useState(false);
  const byId = useMemo(() => new Map(ings.map((i) => [i.id, i])), [ings]);
  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);

  const setRow = (k: number, patch: Partial<Row>) => setRows((r) => r.map((x) => (x.key === k ? { ...x, ...patch } : x)));
  const add = () => setRows((r) => [...r, blankRow()]);
  const del = (k: number) => setRows((r) => (r.length > 1 ? r.filter((x) => x.key !== k) : [blankRow()]));

  const loadRecipe = (rid: string) => {
    setRecipeId(rid);
    if (!rid) return;
    const r = recipeById.get(rid);
    if (!r) return;
    /* Only ingredients that still exist get filled; a removed one is dropped
       quietly rather than showing an unresolvable row. */
    const filled: Row[] = r.items
      .filter((it) => byId.has(it.ingredientId))
      .map((it) => ({ key: ++rowSeq, ingredientId: it.ingredientId, qty: String(it.qty), note: it.note }));
    setRows(filled.length ? filled : [blankRow()]);
    if (!name.trim()) setName(r.name);
    if (!note.trim() && r.note) setNote(r.note);
  };

  const removeRecipe = async () => {
    const r = recipeById.get(recipeId);
    if (!r) return;
    const ok = await confirm({ title: `Remove recipe "${r.name}"?`, body: "The recipe disappears from the picker. Past batches logged with it stay in the ledger.", ok: "Remove", danger: true });
    if (!ok) return;
    const res = await act("recipe.delete", { id: r.id });
    if (res.ok) {
      toast({ kind: "ok", title: `Recipe "${r.name}" removed.` });
      setRecipeId("");
    }
  };

  const uses = rows.map((r) => ({ r, ing: byId.get(r.ingredientId), qty: Number(r.qty) || 0 })).filter((u) => u.ing && u.qty > 0);
  const total = uses.reduce((s, u) => s + (u.ing ? u.qty * u.ing.costPerUnit : 0), 0);
  const problems = uses.filter((u) => u.ing && u.qty > u.ing.stock);

  const save = async () => {
    if (!name.trim()) return toast({ kind: "err", title: "Give the batch a name." });
    if (!uses.length) return toast({ kind: "err", title: "Add at least one ingredient." });
    if (problems.length) return toast({ kind: "err", title: `Not enough ${problems[0].ing!.name} on hand.` });
    setBusy(true);
    const r = await act<Batch>("batch.save", { name, note, uses: uses.map((u) => ({ ingredientId: u.ing!.id, qty: u.qty, note: u.r.note })) });
    if (!r.ok) { setBusy(false); return; }
    if (saveRecipe) {
      /* The user asked us to remember these rows for next time. If a recipe
         with this name already exists, recipe.save overwrites it, which is
         what they want when they tweaked the quantities. */
      const items = uses.map((u) => ({ ingredientId: u.ing!.id, qty: u.qty, note: u.r.note }));
      await act("recipe.save", { name, note, items });
    }
    setBusy(false);
    toast({ kind: "ok", title: `Batch "${r.result.name}" logged — ${rupee(r.result.totalCost)} in ingredients.`, body: saveRecipe ? "Saved as a recipe for next time." : undefined });
    onClose();
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={<span className="flex items-center gap-2.5"><Icon name="orders" size={18} className="text-red-600" /> Log a batch</span>}
      footer={
        <div className="flex flex-1 flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold text-slate-600">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300 accent-slate-900" checked={saveRecipe} onChange={(e) => setSaveRecipe(e.target.checked)} />
            Save as a recipe for next time
          </label>
          <div className="flex items-center gap-2">
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn kind="dark" onClick={save} disabled={busy || !uses.length}>{busy ? "Logging…" : `Log batch · ${rupee(total)}`}</Btn>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {recipes.length > 0 && (
          <Field label="Repeat a saved recipe" hint="Picking one fills the rows below — still editable before you log the batch.">
            <div className="flex gap-2">
              <select className="h-10 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-[14px] font-semibold text-slate-800 outline-none focus:border-slate-400" value={recipeId} onChange={(e) => loadRecipe(e.target.value)} aria-label="Pick a recipe">
                <option value="">Pick a recipe…</option>
                {recipes.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.items.length} ingredient{r.items.length === 1 ? "" : "s"})</option>)}
              </select>
              {recipeId && <Btn size="md" kind="red" onClick={removeRecipe} title="Remove this recipe">×</Btn>}
            </div>
          </Field>
        )}
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
          <Field label="Batch name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Chocolate cake × 2" maxLength={120} autoFocus /></Field>
          <Field label="Note (optional)"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Any details to remember" maxLength={300} /></Field>
        </div>
        <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
          {rows.map((r) => {
            const ing = byId.get(r.ingredientId);
            const q = Number(r.qty) || 0;
            const over = ing && q > ing.stock;
            const cost = ing && q > 0 ? q * ing.costPerUnit : 0;
            return (
              <div key={r.key} className="flex flex-wrap items-center gap-2 border-b border-slate-200/70 pb-2 last:border-0 last:pb-0">
                <select className="h-10 min-w-[180px] flex-1 rounded-xl border border-slate-300 bg-white px-3 text-[14px] outline-none focus:border-slate-400" value={r.ingredientId} onChange={(e) => setRow(r.key, { ingredientId: e.target.value })} aria-label="Ingredient">
                  <option value="">Pick an ingredient…</option>
                  {ings.map((i) => (
                    <option key={i.id} value={i.id}>{i.name} ({fmtQty(i.stock, i.unit)} left)</option>
                  ))}
                </select>
                <div className="relative">
                  <input type="number" min={0} step="0.001" inputMode="decimal" className={cx("h-10 w-28 rounded-xl border bg-white pl-3 pr-9 text-[14px] outline-none", over ? "border-red-400 focus:border-red-500" : "border-slate-300 focus:border-slate-400")} placeholder="Qty" value={r.qty} onChange={(e) => setRow(r.key, { qty: e.target.value })} aria-label="Quantity" />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-bold text-slate-400">{ing?.unit ?? ""}</span>
                </div>
                <input className="h-10 min-w-[140px] flex-1 rounded-xl border border-slate-300 bg-white px-3 text-[13px] outline-none placeholder:text-slate-400 focus:border-slate-400" placeholder="Note (optional)" value={r.note} onChange={(e) => setRow(r.key, { note: e.target.value })} aria-label="Line note" maxLength={160} />
                <span className="adm-num w-[88px] shrink-0 text-right text-[13px] font-bold">{cost > 0 ? rupee(cost) : "—"}</span>
                <button type="button" onClick={() => del(r.key)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900" aria-label="Remove row"><Icon name="trash" size={16} /></button>
              </div>
            );
          })}
        </div>
        <Btn size="sm" kind="soft" onClick={add}>+ Add ingredient</Btn>
        <p className="rounded-xl bg-slate-50 px-4 py-2.5 text-[12px] text-slate-500">
          Logging the batch takes the quantities out of stock and files one line per ingredient in the ledger. Costed at the current ₹/unit.
        </p>
      </div>
    </Modal>
  );
}

/* ---------------- the main page ---------------- */
export default function IngredientsPage() {
  const { s, act, confirm, toast } = useAdmin();
  const [edit, setEdit] = useState<IngForm | null>(null);
  const [move, setMove] = useState<{ ing: Ingredient; kind: MoveKind } | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [q, setQ] = useState("");

  const ings = s.ingredients ?? [];
  const active = ings.filter((i) => i.active);
  const low = active.filter((i) => i.lowAt > 0 && i.stock <= i.lowAt);
  const stockValue = active.reduce((sum, i) => sum + i.stock * i.costPerUnit, 0);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return active;
    return active.filter((i) => i.name.toLowerCase().includes(t));
  }, [active, q]);

  const removeIng = async (ing: Ingredient) => {
    const ok = await confirm({ title: `Remove ${ing.name}?`, body: "Past movements stay in the ledger. You can always re-add the ingredient with the same name.", ok: "Remove", danger: true });
    if (!ok) return;
    const r = await act("ingredient.delete", { id: ing.id });
    if (r.ok) toast({ kind: "ok", title: `${ing.name} removed.` });
  };

  return (
    <Page>
      <PageHead
        title="Ingredients & waste"
        sub="Raw stores (sugar, milk, flour…) by weight or volume. Log purchases, record batches, flag waste."
        right={
          <>
            <Link href="/admin/inventory/ingredient-moves" className="inline-flex h-9 items-center gap-2 rounded-xl bg-slate-100 px-3.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-200">
              <Icon name="list" size={16} /> Movements log
            </Link>
            <Btn kind="soft" icon="plus" onClick={() => setEdit(EMPTY_ING)}>New ingredient</Btn>
            <Btn kind="dark" icon="orders" onClick={() => setBatchOpen(true)} disabled={active.length === 0} title={active.length === 0 ? "Add an ingredient first" : "Log a batch"}>Log a batch</Btn>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Active ingredients" value={active.length} icon="box" tone="emerald" />
        <Kpi label="Low on stock" value={low.length} icon="alert" tone={low.length ? "amber" : "slate"} />
        <Kpi label="Stock value" value={rupee(stockValue)} icon="rupee" tone="sky" />
      </div>

      <div className="mt-5">
        {/* ---------- ingredients catalog ---------- */}
        <Card title={<span className="flex items-center gap-2.5"><Icon name="box" size={18} className="text-red-600" /> Ingredients</span>} right={<SearchBox value={q} onChange={setQ} placeholder="Find an ingredient…" className="w-full max-w-[220px]" />}>
          {filtered.length === 0 ? (
            <Empty icon="box" title={ings.length ? "No matches." : "No ingredients yet."}>Add sugar, milk, flour and the rest the kitchen measures.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-[13px]">
                <thead className="bg-slate-50/60">
                  <tr>
                    <th className={th}>Ingredient</th>
                    <th className={cx(th, "text-right")}>On hand</th>
                    <th className={cx(th, "text-right")}>Cost / unit</th>
                    <th className={cx(th, "text-right")}>Stock value</th>
                    <th className={cx(th, "text-right")}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((i) => {
                    const lowFlag = i.lowAt > 0 && i.stock <= i.lowAt;
                    return (
                      <tr key={i.id} className="border-t border-slate-100">
                        <td className={td}>
                          <b className="block text-[13.5px] text-slate-900">{i.name}</b>
                          <span className="text-[11.5px] text-slate-500">Measured in {UNIT_LABEL[i.unit]}{i.lowAt > 0 ? ` · warn at ${fmtQty(i.lowAt, i.unit)}` : ""}</span>
                        </td>
                        <td className={cx(td, "text-right")}>
                          <span className={cx("adm-num font-bold", i.stock <= 0 ? "text-red-600" : lowFlag ? "text-amber-600" : "text-slate-900")}>{fmtQty(i.stock, i.unit)}</span>
                          {lowFlag && <Badge tone="amber" className="ml-2">Low</Badge>}
                        </td>
                        <td className={cx(td, "text-right adm-num")}>{i.costPerUnit > 0 ? `${perUnitRupee(i.costPerUnit)} / ${i.unit}` : <span className="text-slate-400">—</span>}</td>
                        <td className={cx(td, "text-right adm-num font-semibold")}>{rupee(i.stock * i.costPerUnit)}</td>
                        <td className={cx(td, "text-right whitespace-nowrap")}>
                          <Btn size="sm" kind="soft" onClick={() => setMove({ ing: i, kind: "purchase" })}>+ Stock</Btn>{" "}
                          <Btn size="sm" kind="soft" onClick={() => setMove({ ing: i, kind: "waste" })}>Waste</Btn>{" "}
                          <Btn size="sm" onClick={() => setMove({ ing: i, kind: "adjust" })}>Adjust</Btn>{" "}
                          <Btn size="sm" onClick={() => setEdit({ id: i.id, name: i.name, unit: i.unit, lowAt: String(i.lowAt) })}>Edit</Btn>{" "}
                          <Btn size="sm" kind="red" onClick={() => removeIng(i)}>×</Btn>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {low.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-900">
              <b>Low on:</b> {low.map((i) => `${i.name} (${fmtQty(i.stock, i.unit)})`).join(" · ")}
            </div>
          )}
        </Card>

      </div>

      {edit && <IngredientModal initial={edit} onClose={() => setEdit(null)} />}
      {move && <MoveModal ing={move.ing} kind={move.kind} onClose={() => setMove(null)} />}
      {batchOpen && <BatchModal ingredients={active} recipes={s.recipes ?? []} onClose={() => setBatchOpen(false)} />}
    </Page>
  );
}
