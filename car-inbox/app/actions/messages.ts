"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { normalizePlate, isValidPlate } from "@/lib/plate";
import { presetLabel } from "@/lib/presets";

// Versturen: een geverifieerd account stuurt een bericht naar een kenteken.
// Anoniem geldt alleen richting ontvanger — sender_id wordt altijd vastgelegd.
export async function sendMessage(formData: FormData) {
  const user = currentUser();
  if (!user) redirect("/login");

  const plate = normalizePlate(String(formData.get("plate") ?? ""));
  const type = String(formData.get("type") ?? "vrij");
  const custom = String(formData.get("body") ?? "").trim();
  const anonymous = formData.get("anonymous") ? 1 : 0;

  if (!isValidPlate(plate)) {
    redirect("/app/send?error=plate");
  }

  const body = type === "vrij" ? custom : presetLabel(type);
  if (!body) redirect("/app/send?error=leeg");

  // Blokkades respecteren: ontvangers die deze afzender blokkeerden, krijgen
  // het bericht niet. (Blokkade is per ontvanger op het kenteken.)
  const owners = db
    .prepare("SELECT DISTINCT user_id FROM plates WHERE plate = ?")
    .all(plate) as { user_id: number }[];
  const blockedBy = new Set(
    (
      db
        .prepare("SELECT blocker_id FROM blocks WHERE blocked_id = ?")
        .all(user.id) as { blocker_id: number }[]
    ).map((r) => r.blocker_id)
  );
  const reachable = owners.filter((o) => !blockedBy.has(o.user_id));

  db.prepare(
    `INSERT INTO messages (plate, sender_id, type, body, anonymous)
     VALUES (?, ?, ?, ?, ?)`
  ).run(plate, user.id, type, body, anonymous);

  revalidatePath("/app/inbox");

  const known = owners.length > 0;
  const delivered = reachable.length > 0;
  redirect(
    `/app/send?sent=1&known=${known ? 1 : 0}&delivered=${delivered ? 1 : 0}`
  );
}

export async function reportMessage(formData: FormData) {
  const user = currentUser();
  if (!user) return;
  const id = Number(formData.get("id"));
  const reason = String(formData.get("reason") ?? "").trim() || null;

  // Alleen melden wat aan een eigen kenteken gericht was.
  const allowed = db
    .prepare(
      `SELECT m.id FROM messages m
       JOIN plates p ON p.plate = m.plate
       WHERE m.id = ? AND p.user_id = ?`
    )
    .get(id, user.id);
  if (!allowed) return;

  db.prepare(
    "INSERT INTO reports (message_id, reporter_id, reason) VALUES (?, ?, ?)"
  ).run(id, user.id, reason);
  revalidatePath("/app/inbox");
}

// Blokkeren werkt ook bij anonieme berichten: het systeem kent de afzender.
export async function blockSender(formData: FormData) {
  const user = currentUser();
  if (!user) return;
  const messageId = Number(formData.get("message_id"));

  const msg = db
    .prepare(
      `SELECT m.sender_id FROM messages m
       JOIN plates p ON p.plate = m.plate
       WHERE m.id = ? AND p.user_id = ?`
    )
    .get(messageId, user.id) as { sender_id: number } | undefined;
  if (!msg || msg.sender_id === user.id) return;

  db.prepare(
    "INSERT OR IGNORE INTO blocks (blocker_id, blocked_id) VALUES (?, ?)"
  ).run(user.id, msg.sender_id);
  revalidatePath("/app/inbox");
}

export async function markRead(formData: FormData) {
  const user = currentUser();
  if (!user) return;
  const id = Number(formData.get("id"));
  db.prepare(
    `UPDATE messages SET read_at = datetime('now')
     WHERE id = ? AND read_at IS NULL
       AND plate IN (SELECT plate FROM plates WHERE user_id = ?)`
  ).run(id, user.id);
  revalidatePath("/app/inbox");
}
