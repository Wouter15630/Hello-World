"use client";

import { useState } from "react";
import { PRESETS } from "@/lib/presets";
import { sendMessage } from "@/app/actions/messages";

export default function SendForm({ initialPlate }: { initialPlate?: string }) {
  const [type, setType] = useState(PRESETS[0].key);
  const [anonymous, setAnonymous] = useState(true);

  return (
    <form action={sendMessage}>
      <div className="row">
        <label htmlFor="plate">Kenteken van de ontvanger</label>
        <input
          id="plate"
          name="plate"
          type="text"
          placeholder="AB-123-C"
          defaultValue={initialPlate ?? ""}
          required
        />
      </div>

      <div className="row">
        <label htmlFor="type">Soort melding</label>
        <select
          id="type"
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {type === "vrij" && (
        <div className="row">
          <label htmlFor="body">Je bericht</label>
          <textarea
            id="body"
            name="body"
            placeholder="Schrijf een korte, functionele melding…"
          />
        </div>
      )}

      <div className="row inline">
        <input
          id="anonymous"
          type="checkbox"
          name="anonymous"
          checked={anonymous}
          onChange={(e) => setAnonymous(e.target.checked)}
        />
        <label htmlFor="anonymous">
          Anoniem versturen{" "}
          <span className="muted">
            ({anonymous ? "naam verborgen voor ontvanger" : "naam zichtbaar"})
          </span>
        </label>
      </div>

      <button className="btn" type="submit">
        Versturen
      </button>
    </form>
  );
}
