# Productlicenties.nl — Key Validator

## Project
Python CLI tool dat Windows/Office licentiesleutels valideert vóór verzending.
Validatie verloopt via `slmgr.vbs` (alleen op Windows).

## Bestandsstructuur
- `key_validator/validator.py` — hoofdscript (alles-in-één)
- `licenses.db` — SQLite database (automatisch aangemaakt)
- `validator.log` — logbestand

## Huidige versie: 1.6.0
Changelog:
- v1.4.0 — Activeringscheck via `slmgr /ato` met bekende foutcodes
- v1.5.0 — Sleuteltype detectie (Retail / OEM / Volume KMS / Volume MAK / MSDN / Evaluatie)
- v1.6.0 — Volledige licentie-info: editie, productnaam, partial key, licentiestatus, activeringsdeadline

## Database
- Bestand: `licenses.db` (SQLite)
- Tabel `license_keys`: id, key, product, status, key_type, edition, partial_key, expiry, batch_id, validated_at, sold_at, order_id, notes
- Tabel `batches`: id, product, total, valid, invalid, created_at
- `init_db()` migreert automatisch bestaande databases via `PRAGMA table_info` + `ALTER TABLE`

## Validatiestroom (Windows)
1. `slmgr /ipk` — registreer sleutel
2. `slmgr /dlv` — editie, type, partial key, licentiestatus
3. `slmgr /ato` — activering via Microsoft
4. `slmgr /xpr` — activeringsdeadline (alleen bij succes)
5. `slmgr /upk` — verwijder sleutel altijd achteraf

## CLI-commando's
```
python validator.py validate --input keys.csv [--product "Windows 11 Pro"] [--no-slmgr]
python validator.py check <KEY> [--no-slmgr]
python validator.py stats
python validator.py export [--output file.csv] [--product ...]
python validator.py sell --key <KEY> --order <ORDER_ID>
python validator.py --version
```

## Git
- Repo: Wouter15630/Hello-World
- Werkbranch: `claude/setup-claude-agents-J4NwM`
- Base branch: `master`

## Bekende foutcodes slmgr
| Code | Betekenis |
|---|---|
| 0xC004C060 | Sleutel geblokkeerd (zwarte lijst) |
| 0xC004C008 | Max activeringen bereikt |
| 0xC004F050 | Sleutel ongeldig voor activering |
| 0xC004F034 | Geen overeenkomstige licentie |
| 0xC004B100 | Algemene Microsoft-fout |
| 0x8007007B | Netwerkfout (DNS) |
| 0x800705B4 | Timeout activeringsserver |

## Encoding
slmgr output wordt gedecodeerd met `cp850` (Windows OEM/Nederlands)
