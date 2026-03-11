"""
Productlicenties.nl — Batch License Key Validator
--------------------------------------------------
Valideert Windows/Office licentiesleutels vóór verzending.

Gebruik:
    python validator.py --input keys.csv --product "Windows 11 Pro"
    python validator.py --input keys.csv --report
    python validator.py --stats
"""

__version__ = "1.6.0"

import argparse
import csv
import json
import logging
import os
import re
import smtplib
import sqlite3
import subprocess
import sys
from datetime import datetime
from email.mime.text import MIMEText
from pathlib import Path

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
DB_PATH = "licenses.db"
LOG_PATH = "validator.log"
ALERT_THRESHOLD = 0.05          # Alert als >5% van batch invalid is
SMTP_CONFIG = {
    "host": os.getenv("SMTP_HOST", "smtp.gmail.com"),
    "port": int(os.getenv("SMTP_PORT", 587)),
    "user": os.getenv("SMTP_USER", ""),
    "password": os.getenv("SMTP_PASSWORD", ""),
    "to": os.getenv("ALERT_EMAIL", "inkoop@productlicenties.nl"),
}

# Regex: XXXXX-XXXXX-XXXXX-XXXXX-XXXXX (Windows/Office formaat)
KEY_PATTERN = re.compile(
    r"^[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$"
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_PATH),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
def init_db(conn: sqlite3.Connection) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS license_keys (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            key          TEXT    UNIQUE NOT NULL,
            product      TEXT,
            status       TEXT    DEFAULT 'pending',
            key_type     TEXT,
            edition      TEXT,
            partial_key  TEXT,
            expiry       TEXT,
            batch_id     TEXT,
            validated_at TEXT,
            sold_at      TEXT,
            order_id     TEXT,
            notes        TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS batches (
            id          TEXT PRIMARY KEY,
            product     TEXT,
            total       INTEGER,
            valid       INTEGER,
            invalid     INTEGER,
            created_at  TEXT
        )
    """)
    # Migratie: voeg ontbrekende kolommen toe aan bestaande databases
    existing = {row[1] for row in conn.execute("PRAGMA table_info(license_keys)")}
    for col, definition in [
        ("key_type",    "TEXT"),
        ("edition",     "TEXT"),
        ("partial_key", "TEXT"),
        ("expiry",      "TEXT"),
    ]:
        if col not in existing:
            conn.execute(f"ALTER TABLE license_keys ADD COLUMN {col} {definition}")
    conn.commit()


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    init_db(conn)
    return conn


# Kanaal-patronen zoals teruggegeven door slmgr /dlv (in productnaam)
# Volgorde is belangrijk: specifieker eerst
KEY_CHANNELS = [
    (r"VOLUME_KMSCLIENT|VOLUME_KMS\b",          "Volume (KMS)"),
    (r"VOLUME_MAK",                              "Volume (MAK)"),
    (r"OEM_SLP|OEM_DM|OEM\b",                   "OEM"),
    (r"EVALUATION",                              "Evaluatie"),
    (r"MSDN",                                    "MSDN/Developer"),
    (r"RETAIL",                                  "Retail"),
]


def _parse_dlv_details(dlv_output: str) -> dict:
    """
    Haal gedetailleerde informatie op uit slmgr /dlv output.
    Geeft een dict terug met: key_type, edition, description,
    partial_key, license_status, product_name.
    """
    info = {
        "key_type": "Onbekend",
        "edition": "",
        "description": "",
        "partial_key": "",
        "license_status": "",
        "product_name": "",
    }

    # Productnaam (bevat kanaalinfo voor key_type detectie)
    m = re.search(r'(?:Name|Naam)\s*:\s*(.+)', dlv_output, re.IGNORECASE)
    if m:
        info["product_name"] = m.group(1).strip()

    # Beschrijving — bevat editienaam, bv. "Windows Operating System - Windows(R) Professional"
    m = re.search(r'(?:Description|Beschrijving)\s*:\s*(.+)', dlv_output, re.IGNORECASE)
    if m:
        info["description"] = m.group(1).strip()
        # Extraheer editienaam uit beschrijving
        edition_m = re.search(r'Windows\(R\)\s+([\w\s]+?)(?:\s*$|\s*-|\s*\[)', m.group(1))
        if edition_m:
            info["edition"] = edition_m.group(1).strip()

    # Gedeeltelijke productsleutel (laatste 5 tekens — verificatie)
    m = re.search(
        r'(?:Partial Product Key|Gedeeltelijke productsleutel)\s*:\s*([A-Z0-9]+)',
        dlv_output, re.IGNORECASE
    )
    if m:
        info["partial_key"] = m.group(1).strip()

    # Licentiestatus
    m = re.search(r'(?:License Status|Licentiestatus)\s*:\s*(.+)', dlv_output, re.IGNORECASE)
    if m:
        info["license_status"] = m.group(1).strip()

    # Kanaal / type (op basis van productnaam + volledige output)
    text_upper = dlv_output.upper()
    for pattern, label in KEY_CHANNELS:
        if re.search(pattern, text_upper):
            info["key_type"] = label
            break

    return info


# Bekende Microsoft activerings-foutcodes
ACTIVATION_ERRORS = {
    "0xC004C060": "Sleutel is geblokkeerd door Microsoft (zwarte lijst).",
    "0xC004C008": "Sleutel heeft het maximaal aantal activeringen bereikt.",
    "0xC004F050": "Sleutel is ongeldig voor activering.",
    "0xC004F034": "Geen overeenkomstige licentie gevonden voor deze sleutel.",
    "0xC004B100": "Activering mislukt (algemene Microsoft-fout).",
    "0x8007007B": "Netwerkfout bij activering (DNS-probleem).",
    "0x800705B4": "Timeout: kon Microsoft-activeringsserver niet bereiken.",
}


# ---------------------------------------------------------------------------
# Key validation
# ---------------------------------------------------------------------------
def validate_format(key: str) -> bool:
    """Controleert of de key het juiste formaat heeft."""
    return bool(KEY_PATTERN.match(key.strip().upper()))


def _slmgr(args: list, timeout: int = 60) -> str:
    """Voer slmgr.vbs uit en geef output terug als string (cp850 gedecodeerd)."""
    r = subprocess.run(
        ["cscript", "//nologo", r"C:\Windows\System32\slmgr.vbs"] + args,
        capture_output=True, timeout=timeout
    )
    return r.stdout.decode("cp850", errors="replace") + r.stderr.decode("cp850", errors="replace")


def _parse_expiry(xpr_output: str) -> str:
    """Haal de activeringsdeadline op uit slmgr /xpr output."""
    if re.search(r'permanent|unbegrenzt|onbeperkt|permanently', xpr_output, re.IGNORECASE):
        return "Permanent"
    m = re.search(r'(\d{1,2}[-/. ]\w+[-/. ]\d{4}|\d{4}-\d{2}-\d{2})', xpr_output)
    return m.group(1) if m else xpr_output.strip()


def validate_with_slmgr(key: str) -> tuple[bool, str, dict]:
    """
    Valideert een Windows key via slmgr.vbs (alleen op Windows).
    Stap 1: /ipk  — registreer de sleutel
    Stap 2: /dlv  — editie, type, gedeeltelijke sleutel, licentiestatus
    Stap 3: /ato  — probeer te activeren via Microsoft
    Stap 4: /xpr  — activeringsdeadline (alleen bij succes)
    Stap 5: /upk  — verwijder de sleutel altijd achteraf
    Geeft (is_valid, message, info_dict) terug.
    """
    empty: dict = {
        "key_type": "", "edition": "", "description": "",
        "partial_key": "", "license_status": "", "product_name": "",
        "expiry": "",
    }

    if sys.platform != "win32":
        return False, "slmgr alleen beschikbaar op Windows", empty

    try:
        # Stap 1: registreer sleutel
        out_ipk = _slmgr(["/ipk", key], timeout=30)
        if not ("successfully" in out_ipk.lower() or re.search(r'ge.?nstalleerd', out_ipk, re.IGNORECASE)):
            return False, out_ipk.strip() or "Sleutel geweigerd door Windows (slmgr /ipk).", empty

        # Stap 2: haal alle details op
        out_dlv = _slmgr(["/dlv"], timeout=15)
        info = _parse_dlv_details(out_dlv)
        info["expiry"] = ""

        # Stap 3: probeer activering via Microsoft
        try:
            out_ato = _slmgr(["/ato"], timeout=60)
        except subprocess.TimeoutExpired:
            _slmgr(["/upk"], timeout=15)
            return False, "Timeout: Microsoft-activeringsserver niet bereikbaar.", info

        # Stap 4: activeringsdeadline (alleen bij geslaagde activering)
        activated = (
            "successfully activated" in out_ato.lower()
            or re.search(r'geactiveerd', out_ato, re.IGNORECASE)
        )
        if activated:
            out_xpr = _slmgr(["/xpr"], timeout=15)
            info["expiry"] = _parse_expiry(out_xpr)

        # Stap 5: verwijder sleutel altijd
        _slmgr(["/upk"], timeout=15)

        if activated:
            return True, "Sleutel geregistreerd én geactiveerd via Microsoft.", info

        # Zoek bekende foutcode in output
        for code, uitleg in ACTIVATION_ERRORS.items():
            if code.lower() in out_ato.lower():
                return False, f"Activering mislukt ({code}): {uitleg}", info

        # Onbekende foutcode
        match = re.search(r'0x[0-9A-Fa-f]{8}', out_ato)
        code_str = match.group(0) if match else "onbekend"
        return False, f"Activering mislukt ({code_str}): {out_ato.strip()}", info

    except subprocess.TimeoutExpired:
        return False, "Timeout bij slmgr validatie", empty
    except Exception as e:
        return False, f"Fout: {e}", empty


def validate_key(key: str, use_slmgr: bool = True) -> dict:
    """
    Volledige validatie van één sleutel.
    Stap 1: formaat check
    Stap 2: slmgr check (optioneel, alleen Windows)
    """
    key = key.strip().upper()
    result = {
        "key": key,
        "status": "invalid",
        "key_type": "",
        "edition": "",
        "description": "",
        "partial_key": "",
        "license_status": "",
        "product_name": "",
        "expiry": "",
        "notes": "",
        "validated_at": datetime.now().isoformat(),
    }

    # Stap 1: formaat
    if not validate_format(key):
        result["notes"] = "Ongeldig formaat"
        return result

    # Stap 2: slmgr (Windows only)
    if use_slmgr and sys.platform == "win32":
        is_valid, msg, info = validate_with_slmgr(key)
        result["status"] = "valid" if is_valid else "invalid"
        result.update(info)
        result["notes"] = msg
    else:
        # Op niet-Windows: formaat is voldoende basischeck
        result["status"] = "format_ok"
        result["notes"] = "Formaat OK (slmgr niet beschikbaar op dit platform)"

    return result


# ---------------------------------------------------------------------------
# Batch processing
# ---------------------------------------------------------------------------
def load_keys_from_csv(path: str) -> list[dict]:
    """Laad keys uit CSV. Verwacht minimaal kolom 'key', optioneel 'product'."""
    keys = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            key = row.get("key", "").strip().upper()
            if key:
                keys.append({
                    "key": key,
                    "product": row.get("product", "").strip(),
                })
    return keys


def process_batch(
    keys: list[dict],
    product: str = "",
    use_slmgr: bool = True,
    batch_id: str = None,
) -> dict:
    """
    Verwerk een volledige batch sleutels.
    Sla resultaten op in de database.
    Geeft samenvatting terug.
    """
    if not batch_id:
        batch_id = datetime.now().strftime("%Y%m%d_%H%M%S")

    conn = get_conn()
    summary = {"batch_id": batch_id, "total": 0, "valid": 0, "invalid": 0, "skipped": 0}
    results = []

    log.info(f"Start batch {batch_id} — {len(keys)} sleutels")

    for item in keys:
        key = item["key"]
        prod = item.get("product") or product
        summary["total"] += 1

        # Controleer of key al in DB zit
        existing = conn.execute(
            "SELECT status FROM license_keys WHERE key = ?", (key,)
        ).fetchone()

        if existing:
            log.warning(f"Dubbel: {key} (status: {existing['status']}) — overgeslagen")
            summary["skipped"] += 1
            continue

        # Valideer
        result = validate_key(key, use_slmgr=use_slmgr)
        result["product"] = prod
        result["batch_id"] = batch_id

        # Sla op in DB
        conn.execute("""
            INSERT INTO license_keys
                (key, product, status, key_type, edition, partial_key, expiry, batch_id, validated_at, notes)
            VALUES
                (:key, :product, :status, :key_type, :edition, :partial_key, :expiry, :batch_id, :validated_at, :notes)
        """, result)

        type_tag = f" [{result['key_type']}]" if result.get("key_type") else ""
        edition_tag = f" {result['edition']}" if result.get("edition") else ""
        if result["status"] in ("valid", "format_ok"):
            summary["valid"] += 1
            log.info(f"GELDIG   {key}{type_tag}{edition_tag} — {result['notes']}")
        else:
            summary["invalid"] += 1
            log.warning(f"ONGELDIG {key}{type_tag} — {result['notes']}")

        results.append(result)

    # Sla batch stats op
    conn.execute("""
        INSERT OR REPLACE INTO batches (id, product, total, valid, invalid, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        batch_id, product,
        summary["total"], summary["valid"], summary["invalid"],
        datetime.now().isoformat()
    ))
    conn.commit()
    conn.close()

    summary["results"] = results
    log.info(
        f"Batch {batch_id} klaar — "
        f"Geldig: {summary['valid']}, Ongeldig: {summary['invalid']}, "
        f"Overgeslagen: {summary['skipped']}"
    )

    # Alert als te veel ongeldig
    if summary["total"] > 0:
        invalid_rate = summary["invalid"] / summary["total"]
        if invalid_rate >= ALERT_THRESHOLD:
            send_alert(batch_id, summary, invalid_rate)

    return summary


# ---------------------------------------------------------------------------
# Alerts
# ---------------------------------------------------------------------------
def send_alert(batch_id: str, summary: dict, invalid_rate: float) -> None:
    """Stuur e-mail alert bij te hoge invalid rate."""
    pct = round(invalid_rate * 100, 1)
    subject = f"[ALERT] Batch {batch_id}: {pct}% ongeldige sleutels!"
    body = (
        f"Batch ID   : {batch_id}\n"
        f"Product    : {summary.get('product', 'onbekend')}\n"
        f"Totaal     : {summary['total']}\n"
        f"Geldig     : {summary['valid']}\n"
        f"Ongeldig   : {summary['invalid']} ({pct}%)\n\n"
        f"Actie vereist: controleer de leverancier voor deze batch."
    )
    log.warning(f"ALERT: {pct}% ongeldig in batch {batch_id}")

    if not SMTP_CONFIG["user"]:
        log.warning("SMTP niet geconfigureerd — alert alleen gelogd")
        return

    try:
        msg = MIMEText(body)
        msg["Subject"] = subject
        msg["From"] = SMTP_CONFIG["user"]
        msg["To"] = SMTP_CONFIG["to"]

        with smtplib.SMTP(SMTP_CONFIG["host"], SMTP_CONFIG["port"]) as server:
            server.starttls()
            server.login(SMTP_CONFIG["user"], SMTP_CONFIG["password"])
            server.send_message(msg)
        log.info(f"Alert verstuurd naar {SMTP_CONFIG['to']}")
    except Exception as e:
        log.error(f"Alert versturen mislukt: {e}")


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------
def print_stats() -> None:
    """Toon statistieken van alle batches."""
    conn = get_conn()
    batches = conn.execute(
        "SELECT * FROM batches ORDER BY created_at DESC LIMIT 20"
    ).fetchall()
    conn.close()

    if not batches:
        print("Geen batches gevonden.")
        return

    print(f"\n{'Batch ID':<22} {'Product':<25} {'Totaal':>7} {'Geldig':>7} {'Ongeldig':>9} {'%OK':>6}")
    print("-" * 80)
    for b in batches:
        pct = round(b["valid"] / b["total"] * 100, 1) if b["total"] else 0
        print(
            f"{b['id']:<22} {(b['product'] or '-'):<25} "
            f"{b['total']:>7} {b['valid']:>7} {b['invalid']:>9} {pct:>5.1f}%"
        )


def export_valid_keys(output_path: str, product: str = None) -> int:
    """Exporteer alle geldige, onverkochte sleutels naar CSV."""
    conn = get_conn()
    query = "SELECT key, product, batch_id, validated_at FROM license_keys WHERE status IN ('valid','format_ok') AND sold_at IS NULL"
    params = []
    if product:
        query += " AND product = ?"
        params.append(product)

    rows = conn.execute(query, params).fetchall()
    conn.close()

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["key", "product", "batch_id", "validated_at"])
        writer.writeheader()
        writer.writerows([dict(r) for r in rows])

    log.info(f"{len(rows)} geldige sleutels geëxporteerd naar {output_path}")
    return len(rows)


def mark_as_sold(key: str, order_id: str) -> bool:
    """Markeer sleutel als verkocht (bij koppeling met WooCommerce order)."""
    conn = get_conn()
    cursor = conn.execute(
        "UPDATE license_keys SET status='used', sold_at=?, order_id=? WHERE key=? AND status IN ('valid','format_ok')",
        (datetime.now().isoformat(), order_id, key.strip().upper())
    )
    conn.commit()
    updated = cursor.rowcount > 0
    conn.close()
    if updated:
        log.info(f"Sleutel {key} gemarkeerd als verkocht (order: {order_id})")
    else:
        log.warning(f"Sleutel {key} niet gevonden of al verkocht")
    return updated


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main():
    if "--version" in sys.argv:
        print(f"validator {__version__}")
        sys.exit(0)

    parser = argparse.ArgumentParser(description="Productlicenties.nl Key Validator")
    subparsers = parser.add_subparsers(dest="command")

    # validate commando
    val = subparsers.add_parser("validate", help="Valideer een batch keys uit CSV")
    val.add_argument("--input", required=True, help="Pad naar CSV bestand met keys")
    val.add_argument("--product", default="", help="Productnaam (bv. 'Windows 11 Pro')")
    val.add_argument("--no-slmgr", action="store_true", help="Sla slmgr validatie over")

    # stats commando
    subparsers.add_parser("stats", help="Toon batch statistieken")

    # export commando
    exp = subparsers.add_parser("export", help="Exporteer geldige sleutels naar CSV")
    exp.add_argument("--output", default="valid_keys_export.csv")
    exp.add_argument("--product", default=None)

    # check commando (losse key)
    chk = subparsers.add_parser("check", help="Controleer één losse licentiesleutel")
    chk.add_argument("key", help="De licentiesleutel (bv. XXXXX-XXXXX-XXXXX-XXXXX-XXXXX)")
    chk.add_argument("--no-slmgr", action="store_true", help="Sla slmgr validatie over")

    # sell commando
    sell = subparsers.add_parser("sell", help="Markeer sleutel als verkocht")
    sell.add_argument("--key", required=True)
    sell.add_argument("--order", required=True)

    args = parser.parse_args()

    if args.command == "validate":
        keys = load_keys_from_csv(args.input)
        if not keys:
            print("Geen keys gevonden in CSV.")
            sys.exit(1)
        summary = process_batch(
            keys,
            product=args.product,
            use_slmgr=not args.no_slmgr,
        )
        print(f"\nResultaat: {summary['valid']} geldig / {summary['invalid']} ongeldig / {summary['skipped']} overgeslagen")

    elif args.command == "stats":
        print_stats()

    elif args.command == "export":
        count = export_valid_keys(args.output, product=args.product)
        print(f"{count} sleutels geëxporteerd naar {args.output}")

    elif args.command == "check":
        result = validate_key(args.key, use_slmgr=not args.no_slmgr)
        status_label = {"valid": "GELDIG", "format_ok": "FORMAAT OK", "invalid": "ONGELDIG"}.get(result["status"], result["status"])

        def _row(label: str, value: str) -> None:
            if value:
                print(f"{label:<10}: {value}")

        print()
        _row("Sleutel", result["key"])
        _row("Status", status_label)
        _row("Type", result.get("key_type", ""))
        _row("Editie", result.get("edition", ""))
        _row("Product", result.get("product_name", ""))
        _row("Omschr.", result.get("description", ""))
        # Gedeeltelijke sleutel: toon als *****-*****-*****-*****-XXXXX
        if result.get("partial_key"):
            masked = f"*****-*****-*****-*****-{result['partial_key']}"
            _row("Verificatie", masked)
        _row("Lic.status", result.get("license_status", ""))
        _row("Geldig t/m", result.get("expiry", ""))
        _row("Details", result.get("notes", ""))

        if result["status"] == "valid":
            print("\nLet op    : Sleutel is geactiveerd via Microsoft — klaar voor gebruik.")
        elif result["status"] == "invalid":
            print("\nLet op    : Sleutel is geweigerd. Zie Details voor de foutcode en reden.")

    elif args.command == "sell":
        success = mark_as_sold(args.key, args.order)
        print("Gemarkeerd als verkocht." if success else "Niet gevonden of al verkocht.")

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
