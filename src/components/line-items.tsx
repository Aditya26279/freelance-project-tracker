"use client";

import { useState } from "react";
import { formatMoney, parseMoney } from "@/lib/money";

let seq = 0;
const key = () => `row-${++seq}`;

// ------------------------------------------------------------ Proposal items

export type ProposalRow = { title: string; description: string; amount: string; days: string };

export function ProposalItemsEditor({ initial, currency }: { initial: ProposalRow[]; currency: string }) {
  const [rows, setRows] = useState(() => initial.map((r) => ({ ...r, key: key() })));
  const update = (k: string, patch: Partial<ProposalRow>) =>
    setRows((rs) => rs.map((r) => (r.key === k ? { ...r, ...patch } : r)));
  const total = rows.reduce((s, r) => s + (parseMoney(r.amount) || 0), 0);

  return (
    <div>
      <div className="hidden grid-cols-[1fr_8rem_6rem_2rem] gap-2 px-1 pb-1 text-xs font-medium uppercase tracking-wide text-slate-500 sm:grid">
        <span>Deliverable / phase</span>
        <span>Amount</span>
        <span title="Due N days after acceptance">Due (days)</span>
        <span />
      </div>
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.key} className="rounded-lg border border-slate-200 p-2">
            <div className="grid gap-2 sm:grid-cols-[1fr_8rem_6rem_2rem]">
              <input
                name="item_title"
                value={r.title}
                onChange={(e) => update(r.key, { title: e.target.value })}
                placeholder="e.g. Homepage design"
                className="input"
              />
              <input
                name="item_amount"
                value={r.amount}
                onChange={(e) => update(r.key, { amount: e.target.value })}
                placeholder="0.00"
                inputMode="decimal"
                className="input"
              />
              <input
                name="item_days"
                value={r.days}
                onChange={(e) => update(r.key, { days: e.target.value })}
                placeholder="14"
                inputMode="numeric"
                className="input"
              />
              <button
                type="button"
                onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                className="btn-ghost px-0 text-slate-400 hover:text-red-600"
                aria-label="Remove item"
              >
                ✕
              </button>
            </div>
            <textarea
              name="item_description"
              value={r.description}
              onChange={(e) => update(r.key, { description: e.target.value })}
              rows={2}
              placeholder="What's included (optional)"
              className="input mt-2 text-sm"
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => setRows((rs) => [...rs, { title: "", description: "", amount: "", days: "", key: key() }])}
        >
          + Add item
        </button>
        <p className="text-sm">
          Total <span className="ml-2 text-lg font-semibold">{formatMoney(total, currency)}</span>
        </p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ Invoice items

export type InvoiceRow = { description: string; quantity: string; unit: string; milestoneId: string };

export function InvoiceItemsEditor({
  initial,
  currency,
  initialTax,
}: {
  initial: InvoiceRow[];
  currency: string;
  initialTax: string;
}) {
  const [rows, setRows] = useState(() => initial.map((r) => ({ ...r, key: key() })));
  const [tax, setTax] = useState(initialTax);
  const update = (k: string, patch: Partial<InvoiceRow>) =>
    setRows((rs) => rs.map((r) => (r.key === k ? { ...r, ...patch } : r)));

  const lineTotal = (r: InvoiceRow) => Math.round((parseFloat(r.quantity) || 0) * (parseMoney(r.unit) || 0));
  const subtotal = rows.reduce((s, r) => s + lineTotal(r), 0);
  const taxAmt = Math.round((subtotal * Math.round((parseFloat(tax) || 0) * 100)) / 10000);

  return (
    <div>
      <div className="hidden grid-cols-[1fr_5rem_8rem_7rem_2rem] gap-2 px-1 pb-1 text-xs font-medium uppercase tracking-wide text-slate-500 sm:grid">
        <span>Description</span>
        <span>Qty</span>
        <span>Unit price</span>
        <span className="text-right">Amount</span>
        <span />
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.key} className="grid items-center gap-2 sm:grid-cols-[1fr_5rem_8rem_7rem_2rem]">
            <input type="hidden" name="item_milestone" value={r.milestoneId} />
            <input
              name="item_description"
              value={r.description}
              onChange={(e) => update(r.key, { description: e.target.value })}
              className="input"
              placeholder="Description"
            />
            <input
              name="item_quantity"
              value={r.quantity}
              onChange={(e) => update(r.key, { quantity: e.target.value })}
              className="input"
              inputMode="decimal"
            />
            <input
              name="item_unit"
              value={r.unit}
              onChange={(e) => update(r.key, { unit: e.target.value })}
              className="input"
              inputMode="decimal"
            />
            <span className="text-right text-sm font-medium">{formatMoney(lineTotal(r), currency)}</span>
            <button
              type="button"
              onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
              className="btn-ghost px-0 text-slate-400 hover:text-red-600"
              aria-label="Remove line"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="btn-secondary btn-sm mt-3"
        onClick={() => setRows((rs) => [...rs, { description: "", quantity: "1", unit: "", milestoneId: "", key: key() }])}
      >
        + Add line
      </button>

      <div className="ml-auto mt-4 w-full max-w-xs space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">Subtotal</span>
          <span>{formatMoney(subtotal, currency)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-slate-500">
            Tax
            <input
              name="taxRate"
              value={tax}
              onChange={(e) => setTax(e.target.value)}
              className="input w-16 px-2 py-1 text-right"
              inputMode="decimal"
            />
            %
          </span>
          <span>{formatMoney(taxAmt, currency)}</span>
        </div>
        <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base font-semibold">
          <span>Total</span>
          <span>{formatMoney(subtotal + taxAmt, currency)}</span>
        </div>
      </div>
    </div>
  );
}
