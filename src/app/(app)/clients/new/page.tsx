import { createClient } from "@/server/clients";
import { Card, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { ClientFields } from "../ClientFields";

export const metadata = { title: "New client" };

export default function NewClientPage() {
  return (
    <>
      <PageHeader title="New client" back={{ href: "/clients", label: "Clients" }} />
      <Card className="max-w-2xl">
        <form action={createClient} className="space-y-5">
          <ClientFields />
          <SubmitButton>Create client</SubmitButton>
        </form>
      </Card>
    </>
  );
}
