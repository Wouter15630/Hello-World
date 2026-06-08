import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { formatPlate } from "@/lib/plate";
import {
  reportMessage,
  blockSender,
  markRead,
} from "@/app/actions/messages";

type InboxRow = {
  id: number;
  plate: string;
  type: string;
  body: string;
  anonymous: number;
  created_at: string;
  read_at: string | null;
  sender_name: string | null;
  reported: number;
};

export default function InboxPage() {
  const user = currentUser()!;

  const hasPlates =
    (
      db
        .prepare("SELECT COUNT(*) AS n FROM plates WHERE user_id = ?")
        .get(user.id) as { n: number }
    ).n > 0;

  // Berichten aan eigen kentekens, afzenders die ik geblokkeerd heb eruit.
  const messages = db
    .prepare(
      `SELECT m.id, m.plate, m.type, m.body, m.anonymous, m.created_at, m.read_at,
              u.name AS sender_name,
              EXISTS (SELECT 1 FROM reports r WHERE r.message_id = m.id AND r.reporter_id = ?) AS reported
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.plate IN (SELECT plate FROM plates WHERE user_id = ?)
         AND m.sender_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?)
         AND m.sender_id <> ?
       ORDER BY m.created_at DESC, m.id DESC`
    )
    .all(user.id, user.id, user.id, user.id) as InboxRow[];

  return (
    <div className="container">
      <h1>Inbox</h1>
      <p className="muted">Meldingen die aan jouw kenteken(s) gericht zijn.</p>

      {!hasPlates && (
        <div className="notice info">
          Je hebt nog geen kenteken geregistreerd. Voeg er één toe bij{" "}
          <a href="/app/plates">Mijn kentekens</a> zodat anderen je kunnen
          waarschuwen.
        </div>
      )}

      {messages.length === 0 ? (
        <div className="card">
          <div className="empty">Nog geen berichten.</div>
        </div>
      ) : (
        <ul className="clean">
          {messages.map((m) => (
            <li key={m.id} className="msg">
              <div className="meta">
                <span className="plate">{formatPlate(m.plate)}</span>
                {m.anonymous ? (
                  <span className="pill muted">Anoniem · geverifieerd</span>
                ) : (
                  <span className="pill green">
                    {m.sender_name || "Geverifieerd account"}
                  </span>
                )}
                {!m.read_at && <span className="pill amber">nieuw</span>}
                <span style={{ marginLeft: "auto" }}>{m.created_at}</span>
              </div>
              <div className="body">{m.body}</div>
              <div className="actions">
                {!m.read_at && (
                  <form action={markRead}>
                    <input type="hidden" name="id" value={m.id} />
                    <button className="btn small secondary" type="submit">
                      Markeer als gelezen
                    </button>
                  </form>
                )}
                <form action={blockSender}>
                  <input type="hidden" name="message_id" value={m.id} />
                  <button className="btn danger" type="submit">
                    Blokkeer afzender
                  </button>
                </form>
                {m.reported ? (
                  <span className="pill muted">gemeld</span>
                ) : (
                  <form action={reportMessage}>
                    <input type="hidden" name="id" value={m.id} />
                    <button className="btn danger" type="submit">
                      Meld misbruik
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
