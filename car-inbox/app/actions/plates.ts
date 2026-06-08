"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { normalizePlate, isValidPlate } from "@/lib/plate";

export async function addPlate(formData: FormData) {
  const user = currentUser();
  if (!user) return;

  const plate = normalizePlate(String(formData.get("plate") ?? ""));
  if (!isValidPlate(plate)) return;

  const photo_url = String(formData.get("photo_url") ?? "").trim() || null;
  const notify_push = formData.get("notify_push") ? 1 : 0;
  const notify_email = formData.get("notify_email") ? 1 : 0;
  const notify_sms = formData.get("notify_sms") ? 1 : 0;
  const startGroupRaw = String(formData.get("start_group_id") ?? "");
  const start_group_id = startGroupRaw ? Number(startGroupRaw) : null;

  db.prepare(
    `INSERT OR IGNORE INTO plates
       (plate, user_id, photo_url, notify_push, notify_email, notify_sms, start_group_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    plate,
    user.id,
    photo_url,
    notify_push,
    notify_email,
    notify_sms,
    start_group_id
  );

  revalidatePath("/app/plates");
}

export async function removePlate(formData: FormData) {
  const user = currentUser();
  if (!user) return;
  const id = Number(formData.get("id"));
  db.prepare("DELETE FROM plates WHERE id = ? AND user_id = ?").run(id, user.id);
  revalidatePath("/app/plates");
}
