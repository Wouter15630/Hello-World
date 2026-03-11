# License Key Validator — Productlicenties.nl

Automatisch batch-valideren van Windows/Office licentiesleutels vóór verzending.

## Installatie

```bash
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Gebruik

### 1. Valideer een batch
```bash
python validator.py validate --input keys_sample.csv --product "Windows 11 Pro"
```

### 2. Statistieken bekijken
```bash
python validator.py stats
```

### 3. Geldige sleutels exporteren
```bash
python validator.py export --output ready_to_send.csv
python validator.py export --output win11pro.csv --product "Windows 11 Pro"
```

### 4. Sleutel markeren als verkocht (bij WooCommerce order)
```bash
python validator.py sell --key XXXXX-XXXXX-XXXXX-XXXXX-XXXXX --order ORD-12345
```

## CSV formaat

Minimaal vereiste kolommen:
```
key,product
NPPR9-FWDCX-D2C8J-H872K-2YT43,Windows 11 Pro
```

## Configuratie (optioneel — e-mail alerts)

Maak een `.env` bestand:
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=jouw@email.nl
SMTP_PASSWORD=app-wachtwoord
ALERT_EMAIL=inkoop@productlicenties.nl
```

Alert wordt verstuurd wanneer >5% van een batch ongeldig is.

## Validatie logica

| Stap | Wat | Platform |
|------|-----|----------|
| 1 | Formaat check (XXXXX-XXXXX-XXXXX-XXXXX-XXXXX) | Alle platforms |
| 2 | slmgr.vbs activatie check | Alleen Windows |

## Database

Automatisch aangemaakt als `licenses.db` (SQLite).

Sleutel statussen:
- `pending` — nog niet gevalideerd
- `format_ok` — formaat correct (niet-Windows machine)
- `valid` — gevalideerd via slmgr
- `invalid` — ongeldig
- `used` — verkocht aan klant
