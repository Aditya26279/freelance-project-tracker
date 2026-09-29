import { requireSession } from "@/lib/auth";
import { CURRENCIES } from "@/lib/constants";
import { maskSecret, safeDecrypt as decrypt } from "@/lib/crypto";
import { appUrl } from "@/lib/utils";
import { saveBusinessSettings, savePaymentSettings } from "@/server/settings";
import { Card, Field, Notice, PageHeader } from "@/components/ui";
import { CopyButton, SubmitButton } from "@/components/client";

export const metadata = { title: "Settings" };

function SecretField({
  name,
  label,
  stored,
  placeholder,
}: {
  name: string;
  label: string;
  stored: string | null;
  placeholder: string;
}) {
  const masked = maskSecret(stored);
  return (
    <Field
      label={label}
      hint={
        masked ? (
          <span className="flex items-center gap-3">
            Saved: <code className="font-mono">{masked}</code>
            <label className="flex items-center gap-1">
              <input type="checkbox" name={`clear_${name}`} /> remove
            </label>
          </span>
        ) : (
          "Not set"
        )
      }
    >
      <input
        name={name}
        type="password"
        autoComplete="off"
        placeholder={masked ? "Leave blank to keep current" : placeholder}
        className="input font-mono"
      />
    </Field>
  );
}

export default async function SettingsPage() {
  const { workspace: ws } = await requireSession();
  const stripeWebhook = appUrl(`/api/webhooks/stripe/${ws.id}`);
  const razorpayWebhook = appUrl(`/api/webhooks/razorpay/${ws.id}`);

  return (
    <>
      <PageHeader title="Settings" />
      <div className="max-w-3xl space-y-6">
        <Card title="Business profile" className="scroll-mt-6">
          <form action={saveBusinessSettings} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Business name">
                <input name="name" defaultValue={ws.name} required className="input" />
              </Field>
              <Field label="Billing email">
                <input name="businessEmail" type="email" defaultValue={ws.businessEmail ?? ""} className="input" />
              </Field>
              <Field label="Address" className="sm:col-span-2">
                <textarea name="address" rows={2} defaultValue={ws.address ?? ""} className="input" />
              </Field>
              <Field label="Tax ID (GSTIN / VAT / EIN)">
                <input name="taxId" defaultValue={ws.taxId ?? ""} className="input" />
              </Field>
              <Field label="Default currency">
                <select name="currency" defaultValue={ws.currency} className="input">
                  {CURRENCIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Invoice prefix" hint={`Next: ${ws.invoicePrefix}${String(ws.nextInvoiceNumber).padStart(4, "0")}`}>
                <input name="invoicePrefix" defaultValue={ws.invoicePrefix} className="input" />
              </Field>
              <Field label="Default tax %">
                <input name="defaultTax" defaultValue={ws.defaultTaxBps / 100} inputMode="decimal" className="input" />
              </Field>
              <Field label="Payment terms (days)">
                <input name="paymentTerms" type="number" min={0} defaultValue={ws.paymentTerms} className="input" />
              </Field>
              <Field label="Default invoice notes" className="sm:col-span-2" hint="Bank details, thank-you note, late fee policy…">
                <textarea name="invoiceFooter" rows={3} defaultValue={ws.invoiceFooter ?? ""} className="input" />
              </Field>
            </div>
            <SubmitButton>Save profile</SubmitButton>
          </form>
        </Card>

        <Card title="Online payments">
          <div id="payments" className="scroll-mt-6" />
          <p className="mb-4 text-sm text-slate-600">
            Payments go directly into <strong>your</strong> Stripe or Razorpay account. Keys are encrypted at rest with your{" "}
            <code>APP_SECRET</code>. Use test keys first.
          </p>
          <form action={savePaymentSettings} className="space-y-6">
            <Field label="Provider shown to clients">
              <select name="paymentProvider" defaultValue={ws.paymentProvider} className="input sm:w-72">
                <option value="none">None (manual payments only)</option>
                <option value="stripe">Stripe: cards, Apple/Google Pay</option>
                <option value="razorpay">Razorpay: UPI, cards, netbanking (India)</option>
              </select>
            </Field>

            <fieldset className="space-y-4 rounded-lg border border-slate-200 p-4">
              <legend className="px-1 text-sm font-semibold">Stripe</legend>
              <SecretField name="stripeSecretKey" label="Secret key" stored={decrypt(ws.stripeSecretKeyEnc)} placeholder="sk_test_…" />
              <SecretField
                name="stripeWebhookSecret"
                label="Webhook signing secret (recommended)"
                stored={decrypt(ws.stripeWebhookSecretEnc)}
                placeholder="whsec_…"
              />
              <div className="text-xs text-slate-500">
                <p>
                  Webhook endpoint (events: <code>checkout.session.completed</code>,{" "}
                  <code>checkout.session.async_payment_succeeded</code>):
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="break-all rounded bg-slate-50 px-2 py-1">{stripeWebhook}</code>
                  <CopyButton text={stripeWebhook} />
                </div>
              </div>
            </fieldset>

            <fieldset className="space-y-4 rounded-lg border border-slate-200 p-4">
              <legend className="px-1 text-sm font-semibold">Razorpay</legend>
              <Field
                label="Key ID"
                hint={
                  ws.razorpayKeyId ? (
                    <label className="flex items-center gap-1">
                      <input type="checkbox" name="clear_razorpayKeyId" /> remove
                    </label>
                  ) : undefined
                }
              >
                <input name="razorpayKeyId" defaultValue={ws.razorpayKeyId ?? ""} placeholder="rzp_test_…" className="input font-mono" />
              </Field>
              <SecretField name="razorpayKeySecret" label="Key secret" stored={decrypt(ws.razorpayKeySecretEnc)} placeholder="Key secret" />
              <SecretField
                name="razorpayWebhookSecret"
                label="Webhook secret (recommended)"
                stored={decrypt(ws.razorpayWebhookSecretEnc)}
                placeholder="The secret you set when creating the webhook"
              />
              <div className="text-xs text-slate-500">
                <p>
                  Webhook endpoint (events: <code>order.paid</code>, <code>payment.captured</code>):
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="break-all rounded bg-slate-50 px-2 py-1">{razorpayWebhook}</code>
                  <CopyButton text={razorpayWebhook} />
                </div>
              </div>
            </fieldset>

            <Notice>
              Webhooks are a safety net. Payments are also confirmed right after checkout, so things work on localhost
              without them.
            </Notice>
            <SubmitButton>Save payment settings</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
