"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { CURRENCIES, PAYMENT_PROVIDERS } from "@/lib/constants";
import { parseTaxPercent } from "@/lib/money";
import { isValidEmail, optStr, str } from "@/lib/utils";

export async function saveBusinessSettings(fd: FormData) {
  const { workspace } = await requireSession();
  const currency = str(fd.get("currency"));
  const taxBps = parseTaxPercent(fd.get("defaultTax"));
  if (Number.isNaN(taxBps)) throw new Error("Default tax must be between 0 and 100");
  const terms = Number(str(fd.get("paymentTerms")) || "14");
  if (!Number.isInteger(terms) || terms < 0 || terms > 365) throw new Error("Payment terms must be 0-365 days");
  const prefix = str(fd.get("invoicePrefix"));
  if (prefix && !/^[A-Za-z0-9\-_/#.]{1,20}$/.test(prefix)) {
    throw new Error("Invoice prefix: up to 20 letters, digits or - _ / # .");
  }
  const businessEmail = optStr(fd.get("businessEmail"));
  if (businessEmail && !isValidEmail(businessEmail)) throw new Error("Enter a valid billing email");
  const cap = (v: string | null, n: number) => v?.slice(0, n) ?? null;
  await db.workspace.update({
    where: { id: workspace.id },
    data: {
      name: str(fd.get("name")).slice(0, 200) || workspace.name,
      businessEmail,
      address: cap(optStr(fd.get("address")), 1000),
      taxId: cap(optStr(fd.get("taxId")), 100),
      currency: (CURRENCIES as readonly string[]).includes(currency) ? currency : workspace.currency,
      invoicePrefix: prefix || workspace.invoicePrefix,
      defaultTaxBps: taxBps,
      paymentTerms: terms,
      invoiceFooter: cap(optStr(fd.get("invoiceFooter")), 5000),
    },
  });
  revalidatePath("/settings");
}

/**
 * Secret fields are write-only: a blank input keeps the stored value, and the
 * "clear_*" checkboxes remove it.
 */
export async function savePaymentSettings(fd: FormData) {
  const { workspace } = await requireSession();
  const provider = str(fd.get("paymentProvider"));

  const secret = (field: string, current: string | null) => {
    if (fd.get(`clear_${field}`) === "on") return null;
    const v = str(fd.get(field));
    return v ? encrypt(v) : current;
  };

  const stripeSecret = str(fd.get("stripeSecretKey"));
  if (stripeSecret && !/^(sk|rk)_(test|live)_/.test(stripeSecret)) {
    throw new Error("Stripe secret key should start with sk_test_, sk_live_, rk_test_ or rk_live_");
  }
  const rzpKeyId = str(fd.get("razorpayKeyId"));
  if (rzpKeyId && !/^rzp_(test|live)_/.test(rzpKeyId)) {
    throw new Error("Razorpay key ID should start with rzp_test_ or rzp_live_");
  }

  await db.workspace.update({
    where: { id: workspace.id },
    data: {
      paymentProvider: (PAYMENT_PROVIDERS as readonly string[]).includes(provider) ? provider : "none",
      stripeSecretKeyEnc: secret("stripeSecretKey", workspace.stripeSecretKeyEnc),
      stripeWebhookSecretEnc: secret("stripeWebhookSecret", workspace.stripeWebhookSecretEnc),
      razorpayKeyId: fd.get("clear_razorpayKeyId") === "on" ? null : rzpKeyId || workspace.razorpayKeyId,
      razorpayKeySecretEnc: secret("razorpayKeySecret", workspace.razorpayKeySecretEnc),
      razorpayWebhookSecretEnc: secret("razorpayWebhookSecret", workspace.razorpayWebhookSecretEnc),
    },
  });
  revalidatePath("/settings");
}
