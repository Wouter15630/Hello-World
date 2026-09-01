import Link from "next/link";
import { requestCode } from "@/app/actions/auth";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <div className="container">
      <p>
        <Link href="/">← terug</Link>
      </p>
      <div className="card">
        <h2>Inloggen of account aanmaken</h2>
        <p className="sub">
          Vul je e-mailadres óf telefoonnummer in. Je bevestigt het met een code,
          zodat berichten afgeleverd kunnen worden en er een aanspreekpunt is.
        </p>
        {searchParams.error && (
          <div className="notice warn">Vul een geldig contact in.</div>
        )}
        <form action={requestCode}>
          <div className="row">
            <label htmlFor="contact">E-mail of telefoonnummer</label>
            <input
              id="contact"
              name="contact"
              type="text"
              placeholder="jij@voorbeeld.nl of 0612345678"
              required
            />
          </div>
          <div className="row">
            <label htmlFor="name">Je naam (optioneel)</label>
            <input
              id="name"
              name="name"
              type="text"
              placeholder="Wordt alleen getoond bij niet-anonieme berichten"
            />
          </div>
          <button className="btn" type="submit">
            Stuur verificatiecode
          </button>
        </form>
      </div>
    </div>
  );
}
