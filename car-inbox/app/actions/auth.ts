"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { setSession, clearSession } from "@/lib/session";

function detectType(contact: string): "email" | "phone" {
  return contact.includes("@") ? "email" : "phone";
}

function genCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Stap 1: account aanmaken (of hervinden) en een verificatiecode klaarzetten.
// In een echte app gaat de code per e-mail/SMS; in deze MVP tonen we 'm op het
// verifieerscherm zodat de flow zonder externe diensten te demonstreren is.
export async function requestCode(formData: FormData) {
  const contactRaw = String(formData.get("contact") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim() || null;
  if (!contactRaw) redirect("/login?error=leeg");

  const contact = contactRaw.toLowerCase();
  const contact_type = detectType(contact);

  let user = db.prepare("SELECT id FROM users WHERE contact = ?").get(contact) as
    | { id: number }
    | undefined;

  if (!user) {
    const info = db
      .prepare(
        "INSERT INTO users (contact, contact_type, name) VALUES (?, ?, ?)"
      )
      .run(contact, contact_type, name);
    user = { id: Number(info.lastInsertRowid) };
  } else if (name) {
    db.prepare("UPDATE users SET name = ? WHERE id = ?").run(name, user.id);
  }

  // Oude codes opruimen, nieuwe code 10 minuten geldig.
  db.prepare("DELETE FROM codes WHERE user_id = ?").run(user.id);
  db.prepare(
    "INSERT INTO codes (user_id, code, expires_at) VALUES (?, ?, datetime('now', '+10 minutes'))"
  ).run(user.id, genCode());

  redirect(`/verify?contact=${encodeURIComponent(contact)}`);
}

// Stap 2: code controleren, account markeren als geverifieerd en sessie zetten.
export async function verifyCode(formData: FormData) {
  const contact = String(formData.get("contact") ?? "")
    .trim()
    .toLowerCase();
  const code = String(formData.get("code") ?? "").trim();

  const user = db
    .prepare("SELECT id FROM users WHERE contact = ?")
    .get(contact) as { id: number } | undefined;
  if (!user) redirect(`/verify?contact=${encodeURIComponent(contact)}&error=1`);

  const match = db
    .prepare(
      "SELECT id FROM codes WHERE user_id = ? AND code = ? AND expires_at > datetime('now')"
    )
    .get(user!.id, code) as { id: number } | undefined;

  if (!match) {
    redirect(`/verify?contact=${encodeURIComponent(contact)}&error=1`);
  }

  db.prepare("UPDATE users SET verified = 1 WHERE id = ?").run(user!.id);
  db.prepare("DELETE FROM codes WHERE user_id = ?").run(user!.id);
  setSession(user!.id);
  redirect("/app/inbox");
}

export async function logout() {
  clearSession();
  redirect("/");
}
