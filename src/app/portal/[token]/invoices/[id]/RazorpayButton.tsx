"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { confirmRazorpayPayment, startRazorpayPayment } from "@/server/portal";

type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayInstance = { open(): void; on(event: string, cb: (r: { error: { description: string } }) => void): void };
declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => RazorpayInstance;
  }
}

function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load Razorpay"));
    document.body.appendChild(s);
  });
}

export function RazorpayButton({ token, invoiceId }: { token: string; invoiceId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      await loadCheckout();
      const order = await startRazorpayPayment(token, invoiceId);
      const rzp = new window.Razorpay!({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: order.name,
        description: order.description,
        prefill: order.prefill,
        theme: { color: "#3b55e6" },
        modal: { ondismiss: () => setBusy(false) },
        handler: async (resp: RazorpayResponse) => {
          try {
            await confirmRazorpayPayment(token, invoiceId, resp);
            router.refresh();
          } catch {
            setError("Payment received but verification failed. It will update shortly via webhook.");
          } finally {
            setBusy(false);
          }
        },
      });
      rzp.on("payment.failed", (r) => {
        setError(r.error.description);
        setBusy(false);
      });
      rzp.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start payment");
      setBusy(false);
    }
  }

  return (
    <div className="text-right">
      <button onClick={pay} disabled={busy} className="btn-success px-6 py-3 text-base">
        {busy ? "Processing…" : "Pay now (UPI / Card / Netbanking)"}
      </button>
      {error && <p className="mt-2 max-w-xs text-sm text-red-600">{error}</p>}
    </div>
  );
}
