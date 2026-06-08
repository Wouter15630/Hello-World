# Auto-inbox op kenteken (MVP)

Een functionele auto-inbox op kenteken: help of waarschuw de bestuurder van een
auto (kapot lampje, dubbelparkeren, laadpaal klaar), met **geverifieerde
accounts** en **per bericht** de keuze om je naam te tonen of anoniem te
blijven.

Dit is de MVP uit de productbrief, gebouwd als zelfstandige Next.js-webapp.

## Wat er werkt

- **Account & verificatie** — inloggen met e-mail óf telefoonnummer, bevestigen
  met een code. Pas na verificatie kun je versturen en ontvangen.
- **Kenteken registreren** — koppel kentekens aan je account, kies je
  meldingskanaal (push/e-mail/SMS), optionele foto als trust-boost, optioneel
  binnen een startgroep.
- **Bericht versturen** — functionele standaardmeldingen of een eigen bericht,
  met per bericht een anoniem-toggle. Je ziet of het kenteken bekend is.
- **Inbox** — meldingen aan je eigen kenteken(s), met markeren-als-gelezen.
- **Veiligheid** — afzender blokkeren (werkt ook bij anonieme berichten, want
  het systeem kent de afzender) en misbruik melden.
- **Cold start** — geseede startgroepen (wagenpark, bedrijventerrein) waarbinnen
  de dekking vanaf dag één hoog is.

### Bewust buiten de MVP

- De sociale laag ("mooie auto, koffie?") — later als optionele toggle.
- Foto als verplichte verificatie — blijft optionele trust-boost, geen
  eigendomsbewijs.

## Lokaal draaien

```bash
cd car-inbox
npm install
npm run dev
```

Open http://localhost:3000.

> **Demo-noot:** verificatiecodes worden niet echt per e-mail/SMS verstuurd; de
> actieve code wordt op het verifieerscherm getoond zodat de flow zonder externe
> diensten te demonstreren is. In productie koppel je hier een e-mail/SMS-dienst
> en zet je `SESSION_SECRET` in de omgeving.

Een SQLite-bestand wordt automatisch aangemaakt in `car-inbox/data/app.db`
(genegeerd door git).

## Techniek

- Next.js 14 (App Router) + React + TypeScript
- Server Actions voor alle mutaties; server components voor reads
- SQLite via `better-sqlite3` — geen externe diensten nodig
- Sessie via een HMAC-ondertekende httpOnly-cookie

## Datamodel

`users` → `plates` (1-op-veel) · `messages` (op kenteken, met `sender_id` en
`anonymous`) · `blocks` (blocker → blocked) · `reports` (op bericht) ·
`start_groups` · `codes` (verificatie).
