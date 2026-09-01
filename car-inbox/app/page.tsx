import Link from "next/link";
import { currentUser } from "@/lib/session";

export default function Home() {
  const user = currentUser();
  return (
    <div className="container">
      <div className="hero">
        <span className="pill green">Functioneel-first</span>
        <h1>Een auto-inbox op kenteken</h1>
        <p className="lead">
          Help of waarschuw de bestuurder van een auto — kapot lampje,
          dubbelparkeren, laadpaal klaar — met geverifieerde accounts en per
          bericht de keuze om je naam te tonen of anoniem te blijven.
        </p>
        <div className="inline">
          {user ? (
            <Link className="btn" href="/app/inbox">
              Naar mijn inbox
            </Link>
          ) : (
            <>
              <Link className="btn" href="/login">
                Aan de slag
              </Link>
              <Link className="btn secondary" href="/login">
                Inloggen
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Hoe het werkt</h2>
        <div className="feature">
          <span className="dot">1.</span>
          <span>
            <strong>Registreer je kenteken</strong> zodat anderen jóu kunnen
            waarschuwen als er iets met je auto is.
          </span>
        </div>
        <div className="feature">
          <span className="dot">2.</span>
          <span>
            <strong>Stuur een melding</strong> naar een kenteken. Kies een
            functionele standaardmelding of schrijf zelf iets.
          </span>
        </div>
        <div className="feature">
          <span className="dot">3.</span>
          <span>
            <strong>Per bericht</strong> bepaal je of je naam zichtbaar is of dat
            je anoniem blijft — anoniem voor de ontvanger, nooit voor het
            systeem.
          </span>
        </div>
      </div>

      <div className="card">
        <h2>Waarom geverifieerd</h2>
        <p className="sub" style={{ margin: 0 }}>
          Achter elk bericht zit een geverifieerd account. Een anoniem bericht is
          alleen anoniem voor de ontvanger — blokkeren, melden en ingrijpen bij
          misbruik blijven gewoon werken.
        </p>
      </div>
    </div>
  );
}
