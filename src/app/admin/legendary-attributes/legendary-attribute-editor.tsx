"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type LegendaryAttributeView = {
  id: string;
  title: string;
  description: string;
  flavorText: string;
  code: string;
  active: boolean;
  linkedAttributeNames: [string, string];
  parameters: Record<string, boolean | number | string>;
};

export default function LegendaryAttributeEditor({
  initialRecords,
}: {
  initialRecords: LegendaryAttributeView[];
}) {
  return (
    <div className="legendary-admin-list">
      {initialRecords.map((record) => (
        <LegendaryAttributeForm key={record.id} record={record} />
      ))}
    </div>
  );
}

function LegendaryAttributeForm({
  record,
}: {
  record: LegendaryAttributeView;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save(formData: FormData) {
    setSaving(true);
    setMessage("");
    let parameters: unknown;
    try {
      parameters = JSON.parse(String(formData.get("parameters")));
    } catch {
      setMessage("Parameters must be valid JSON.");
      setSaving(false);
      return;
    }

    const response = await fetch(
      `/api/admin/legendary-attributes/${record.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.get("title"),
          description: formData.get("description"),
          flavorText: formData.get("flavorText"),
          code: formData.get("code"),
          active: formData.get("active") === "on",
          parameters,
        }),
      },
    );
    const body = (await response.json()) as { error?: string };
    setMessage(response.ok ? "Saved." : body.error ?? "Save failed.");
    setSaving(false);
    if (response.ok) router.refresh();
  }

  return (
    <form action={save} className="legendary-admin-card">
      <div className="legendary-admin-heading">
        <div>
          <strong>
            {record.linkedAttributeNames[0]} +{" "}
            {record.linkedAttributeNames[1]}
          </strong>
          <span>{record.code}</span>
        </div>
        <label>
          <input defaultChecked={record.active} name="active" type="checkbox" />
          Active
        </label>
      </div>
      <label>
        Title
        <input defaultValue={record.title} name="title" required />
      </label>
      <label>
        Behavior code
        <input defaultValue={record.code} name="code" required />
      </label>
      <label>
        Description
        <textarea
          defaultValue={record.description}
          name="description"
          required
          rows={3}
        />
      </label>
      <label>
        Flavor text
        <textarea
          defaultValue={record.flavorText}
          name="flavorText"
          required
          rows={2}
        />
      </label>
      <label>
        Behavior parameters (JSON)
        <textarea
          defaultValue={JSON.stringify(record.parameters, null, 2)}
          name="parameters"
          rows={4}
        />
      </label>
      <div className="legendary-admin-actions">
        <button disabled={saving} type="submit">
          {saving ? "Saving..." : "Save"}
        </button>
        <span aria-live="polite">{message}</span>
      </div>
    </form>
  );
}
