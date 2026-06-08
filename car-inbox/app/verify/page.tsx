import Link from "next/link";
import { db } from "@/lib/db";
import { verifyCode } from "@/app/actions/auth";

export default function VerifyPage({
  searchParams,
}: {
  searchParams: { contact?: string; error?: string };
}) {
  const contact = (searchParams.contact ?? "").toLowerCase();

  // Demo-gemak: toon de actieve code op het scherm. In productie verdwijnt dit
  // en gaat de code per e-mail/SMS.
  const row = db
    .prepare(
      `SELECT c.code AS code FROM codes c
       JOIN users u ON u.id = c.user_id
       WHERE u.contact = ? AND c.expires_at > datetime('now')
       ORDER BY c.id DESC LIMIT 1`
    )
    .get(contact) as { code: string } | undefined;

  return (
    <div className="container">
      <p>
        <Link href="/login">← ander contact</Link>
      </p>
      <div className="card">
        <h2>Bevestig je {contact.includes("@") ? "e-mail" : "telefoonnummer"}</h2>
        <p className="sub">
          We hebben een code gestuurd naar <strong>{contact}</strong>.
        </p>

        {row ? (
          <div className="notice info">
            Demo: je code is <strong>{row.code}</strong> (in productie ontvang je
            deze per {contact.includes("@") ? "e-mail" : "SMS"}).
          </div>
        ) : (
          <div className="notice warn">
            Geen geldige code gevonden — vraag een nieuwe aan via{" "}
            <Link href="/login">inloggen</Link>.
          </div>
        )}

        {searchParams.error && (
          <div className="notice warn">Code klopt niet of is verlopen.</div>
        )}

        <form action={verifyCode}>
          <input type="hidden" name="contact" value={contact} />
          <div className="row">
            <label htmlFor="code">Verificatiecode</label>
            <input
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              placeholder="6 cijfers"
              required
            />
          </div>
          <button className="btn" type="submit">
            Bevestigen
          </button>
        </form>
      </div>
    </div>
  );
}
