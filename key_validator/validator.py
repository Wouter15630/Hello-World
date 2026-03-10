"""
Productlicenties.nl — Batch License Key Validator
--------------------------------------------------
Valideert Windows/Office licentiesleutels vóór verzending.

Gebruik:
    python validator.py --input keys.csv --product "Windows 11 Pro"
    python validator.py --input keys.csv --report
    python validator.py --stats
"""

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
    conn.commit()


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    init_db(conn)
    return conn


# ---------------------------------------------------------------------------
# Key validation
# ---------------------------------------------------------------------------
def validate_format(key: str) -> bool:
    """Controleert of de key het juiste formaat heeft."""
    return bool(KEY_PATTERN.match(key.strip().upper()))


def validate_with_slmgr(key: str) -> tuple[bool, str]:
    """
    Valideert een Windows key via slmgr.vbs (alleen op Windows).
    Installeert de key tijdelijk en verwijdert hem daarna direct.
    Geeft (is_valid, message) terug.
    """
    if sys.platform != "win32":
        return False, "slmgr alleen beschikbaar op Windows"

    try:
        # Installeer key tijdelijk
        result = subprocess.run(
            ["cscript", "//nologo", r"C:\Windows\System32\slmgr.vbs", "/ipk", key],
            capture_output=True, text=True, timeout=30
        )
        output = result.stdout + result.stderr

        if "successfully" in output.lower():
            # Verwijder key direct na validatie
            subprocess.run(
                ["cscript", "//nologo", r"C:\Windows\System32\slmgr.vbs", "/upk"],
                capture_output=True, timeout=30
            )
            return True, "Geldig (slmgr)"
        else:
            return False, output.strip() or "Ongeldig (slmgr)"

    except subprocess.TimeoutExpired:
        return False, "Timeout bij slmgr validatie"
    except Exception as e:
        return False, f"Fout: {e}"


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
        "notes": "",
        "validated_at": datetime.now().isoformat(),
    }

    # Stap 1: formaat
    if not validate_format(key):
        result["notes"] = "Ongeldig formaat"
        return result

    # Stap 2: slmgr (Windows only)
    if use_slmgr and sys.platform == "win32":
        is_valid, msg = validate_with_slmgr(key)
        result["status"] = "valid" if is_valid else "invalid"
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
            INSERT INTO license_keys (key, product, status, batch_id, validated_at, notes)
            VALUES (:key, :product, :status, :batch_id, :validated_at, :notes)
        """, result)

        if result["status"] in ("valid", "format_ok"):
            summary["valid"] += 1
            log.info(f"GELDIG   {key} — {result['notes']}")
        else:
            summary["invalid"] += 1
            log.warning(f"ONGELDIG {key} — {result['notes']}")

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
        print(f"\nSleutel : {result['key']}")
        print(f"Status  : {status_label}")
        print(f"Details : {result['notes']}")

    elif args.command == "sell":
        success = mark_as_sold(args.key, args.order)
        print("Gemarkeerd als verkocht." if success else "Niet gevonden of al verkocht.")

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
