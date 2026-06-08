import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { formatPlate } from "@/lib/plate";
import { addPlate, removePlate } from "@/app/actions/plates";

type PlateRow = {
  id: number;
  plate: string;
  photo_url: string | null;
  notify_push: number;
  notify_email: number;
  notify_sms: number;
  group_name: string | null;
};

export default function PlatesPage() {
  const user = currentUser()!;

  const plates = db
    .prepare(
      `SELECT p.id, p.plate, p.photo_url, p.notify_push, p.notify_email,
              p.notify_sms, g.name AS group_name
       FROM plates p
       LEFT JOIN start_groups g ON g.id = p.start_group_id
       WHERE p.user_id = ?
       ORDER BY p.created_at DESC`
    )
    .all(user.id) as PlateRow[];

  const groups = db
    .prepare("SELECT id, name, type FROM start_groups ORDER BY name")
    .all() as { id: number; name: string; type: string }[];

  return (
    <div className="container">
      <h1>Mijn kentekens</h1>
      <p className="muted">
        Registreer je kenteken zodat anderen jóu kunnen waarschuwen als er iets
        met je auto is.
      </p>

      <div className="card">
        <h2>Kenteken toevoegen</h2>
        <p className="sub">
          Een eventuele foto is een trust-boost, geen eigendomsbewijs.
        </p>
        <form action={addPlate}>
          <div className="row">
            <label htmlFor="plate">Kenteken</label>
            <input id="plate" name="plate" type="text" placeholder="AB-123-C" required />
          </div>
          <div className="row">
            <label htmlFor="start_group_id">Startgroep (optioneel)</label>
            <select id="start_group_id" name="start_group_id" defaultValue="">
              <option value="">Geen — los kenteken</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.type})
                </option>
              ))}
            </select>
          </div>
          <div className="row">
            <label htmlFor="photo_url">Foto-URL (optioneel)</label>
            <input
              id="photo_url"
              name="photo_url"
              type="text"
              placeholder="https://…"
            />
          </div>
          <div className="row">
            <label>Hoe wil je meldingen ontvangen?</label>
            <div className="inline">
              <input id="np" type="checkbox" name="notify_push" defaultChecked />
              <label htmlFor="np">Push</label>
            </div>
            <div className="inline">
              <input id="ne" type="checkbox" name="notify_email" defaultChecked />
              <label htmlFor="ne">E-mail</label>
            </div>
            <div className="inline">
              <input id="ns" type="checkbox" name="notify_sms" />
              <label htmlFor="ns">SMS</label>
            </div>
          </div>
          <button className="btn" type="submit">
            Toevoegen
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Geregistreerd ({plates.length})</h2>
        {plates.length === 0 ? (
          <div className="empty">Nog geen kentekens geregistreerd.</div>
        ) : (
          <ul className="clean">
            {plates.map((p) => (
              <li key={p.id} className="msg">
                <div className="meta">
                  <span className="plate">{formatPlate(p.plate)}</span>
                  {p.group_name ? (
                    <span className="pill green">{p.group_name}</span>
                  ) : (
                    <span className="pill muted">los kenteken</span>
                  )}
                </div>
                <div className="body muted" style={{ fontSize: 13 }}>
                  Meldingen via{" "}
                  {[
                    p.notify_push ? "push" : null,
                    p.notify_email ? "e-mail" : null,
                    p.notify_sms ? "SMS" : null,
                  ]
                    .filter(Boolean)
                    .join(", ") || "niets ingesteld"}
                  {p.photo_url ? " · foto toegevoegd" : ""}
                </div>
                <div className="actions">
                  <form action={removePlate}>
                    <input type="hidden" name="id" value={p.id} />
                    <button className="btn danger" type="submit">
                      Verwijderen
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
