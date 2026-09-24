"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Btn, Field, inputCls } from "../_ui/kit";

export default function LoginForm({ setup }: { setup: boolean }) {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (setup && pw !== pw2) return setErr("The two passwords don't match.");
    setBusy(true);
    try {
      const r = await fetch("/api/admin/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setErr(d.error ?? "Couldn't sign in.");
      router.replace("/admin");
      router.refresh();
    } catch {
      setErr("Network problem — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center p-4">
      <form onSubmit={submit} className="adm-in w-full max-w-[400px] rounded-[28px] bg-white p-8 shadow-[0_1px_3px_rgba(15,23,42,.06),0_20px_50px_-20px_rgba(15,23,42,.25)]">
        <svg width="44" height="44" viewBox="0 0 32 32" aria-hidden="true">
          <path d="M17 3c-1 6-4 10-8 14M17 3c2 5 5 9 8 11" stroke="#6b8f3a" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M17 3c3-1 6 0 8 2-3 1-6 0-8-2z" fill="#8fae55" />
          <circle cx="9" cy="22" r="6.5" fill="#d7263d" />
          <circle cx="23" cy="20" r="6.5" fill="#b81d33" />
        </svg>
        <h1 className="adm-title mt-4 text-[32px] leading-none text-slate-900">{setup ? "Set up admin" : "Admin sign in"}</h1>
        <p className="mt-1 text-[14px] text-slate-500">
          {setup ? "First time here — choose the password your staff will use for this console." : "Chef Loving Cakes · tables, orders & billing"}
        </p>
        <div className="mt-6 space-y-4">
          <Field label={setup ? "New password" : "Password"}>
            <input type="password" className={inputCls} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={setup ? "new-password" : "current-password"} autoFocus required minLength={setup ? 6 : 1} />
          </Field>
          {setup && (
            <Field label="Repeat password">
              <input type="password" className={inputCls} value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" required />
            </Field>
          )}
        </div>
        {err && (
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700" role="alert">
            {err}
          </p>
        )}
        <Btn type="submit" kind="red" size="lg" className="mt-6 w-full uppercase tracking-wide" disabled={busy || !pw}>
          {busy ? "Please wait…" : setup ? "Create password & continue" : "Sign in"}
        </Btn>
      </form>
    </main>
  );
}
