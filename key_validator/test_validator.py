"""
Tests voor key_validator/validator.py
--------------------------------------
Uitvoeren vanuit de repo-root:
    pytest key_validator/test_validator.py -v

Of vanuit de key_validator-map:
    pytest test_validator.py -v

Dekking per module:
    - validate_format()
    - _parse_expiry()
    - _parse_dlv_details()
    - validate_key()
    - init_db() / get_conn()
    - load_keys_from_csv()
    - process_batch()
    - export_valid_keys()
    - mark_as_sold()
    - send_alert()
"""

import csv
import sqlite3
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Zorg dat de key_validator-map in het importpad zit
sys.path.insert(0, str(Path(__file__).parent))

import validator  # noqa: E402 (import na sys.path aanpassing)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def tmp_db(tmp_path, monkeypatch):
    """Vervang DB_PATH door een tijdelijk bestand voor iedere test."""
    db_file = str(tmp_path / "test_licenses.db")
    monkeypatch.setattr(validator, "DB_PATH", db_file)
    return db_file


# ---------------------------------------------------------------------------
# validate_format
# ---------------------------------------------------------------------------

class TestValidateFormat:
    def test_valid_key(self):
        assert validator.validate_format("NPPR9-FWDCX-D2C8J-H872K-2YT43") is True

    def test_valid_all_digits(self):
        assert validator.validate_format("12345-67890-12345-67890-12345") is True

    def test_valid_all_uppercase_letters(self):
        assert validator.validate_format("ABCDE-FGHIJ-KLMNO-PQRST-UVWXY") is True

    def test_lowercase_input_accepted(self):
        # validate_format roept .upper() aan
        assert validator.validate_format("nppr9-fwdcx-d2c8j-h872k-2yt43") is True

    def test_leading_trailing_whitespace_stripped(self):
        assert validator.validate_format("  NPPR9-FWDCX-D2C8J-H872K-2YT43  ") is True

    def test_too_few_groups(self):
        assert validator.validate_format("NPPR9-FWDCX-D2C8J-H872K") is False

    def test_too_many_groups(self):
        assert validator.validate_format("NPPR9-FWDCX-D2C8J-H872K-2YT43-EXTRA") is False

    def test_underscore_separator_rejected(self):
        assert validator.validate_format("NPPR9_FWDCX_D2C8J_H872K_2YT43") is False

    def test_special_character_rejected(self):
        assert validator.validate_format("NPPR9-FWDCX-D2C8J-H872K-2YT4!") is False

    def test_empty_string(self):
        assert validator.validate_format("") is False

    def test_group_too_long(self):
        assert validator.validate_format("NPPR99-FWDCX-D2C8J-H872K-2YT43") is False

    def test_group_too_short(self):
        assert validator.validate_format("NPPR-FWDCX-D2C8J-H872K-2YT43") is False


# ---------------------------------------------------------------------------
# _parse_expiry
# ---------------------------------------------------------------------------

class TestParseExpiry:
    def test_permanent_english(self):
        assert validator._parse_expiry("The machine is permanently activated.") == "Permanent"

    def test_permanent_dutch_onbeperkt(self):
        assert validator._parse_expiry("De machine is onbeperkt geactiveerd.") == "Permanent"

    def test_iso_date_extracted(self):
        result = validator._parse_expiry("Activation deadline: 2025-12-31")
        assert "2025-12-31" in result

    def test_dutch_date_format(self):
        result = validator._parse_expiry("Activeringsdeadline: 31-12-2025")
        assert "31-12-2025" in result

    def test_no_date_returns_stripped_output(self):
        assert validator._parse_expiry("  Geen datum   ") == "Geen datum"


# ---------------------------------------------------------------------------
# _parse_dlv_details
# ---------------------------------------------------------------------------

class TestParseDlvDetails:

    ENGLISH = (
        "Name: Windows(R) Operating System, RETAIL channel\n"
        "Description: Windows Operating System - Windows(R) Professional\n"
        "Partial Product Key: 2YT43\n"
        "License Status: Licensed\n"
    )

    DUTCH = (
        "Naam: Windows(R) Besturingssysteem, RETAIL-kanaal\n"
        "Beschrijving: Windows Besturingssysteem - Windows(R) Professional\n"
        "Gedeeltelijke productsleutel: 2YT43\n"
        "Licentiestatus: Gelicentieerd\n"
    )

    KMS = (
        "Name: Windows(R) Operating System, VOLUME_KMSCLIENT channel\n"
        "Description: Windows Operating System - Windows(R) Enterprise\n"
        "Partial Product Key: H7B3T\n"
        "License Status: Licensed\n"
    )

    OEM = (
        "Name: Windows(R) Operating System, OEM_SLP channel\n"
        "Partial Product Key: XYZ12\n"
        "License Status: Licensed\n"
    )

    MAK = "Name: Windows(R) Operating System, VOLUME_MAK channel\n"
    EVAL = "Name: Windows(R) Operating System, EVALUATION channel\n"
    MSDN = "Name: Windows(R) Operating System, MSDN channel\n"

    def test_retail_key_type_english(self):
        assert validator._parse_dlv_details(self.ENGLISH)["key_type"] == "Retail"

    def test_retail_key_type_dutch(self):
        assert validator._parse_dlv_details(self.DUTCH)["key_type"] == "Retail"

    def test_kms_key_type(self):
        assert validator._parse_dlv_details(self.KMS)["key_type"] == "Volume (KMS)"

    def test_oem_key_type(self):
        assert validator._parse_dlv_details(self.OEM)["key_type"] == "OEM"

    def test_mak_key_type(self):
        assert validator._parse_dlv_details(self.MAK)["key_type"] == "Volume (MAK)"

    def test_evaluation_key_type(self):
        assert validator._parse_dlv_details(self.EVAL)["key_type"] == "Evaluatie"

    def test_msdn_key_type(self):
        assert validator._parse_dlv_details(self.MSDN)["key_type"] == "MSDN/Developer"

    def test_edition_extracted_english(self):
        assert validator._parse_dlv_details(self.ENGLISH)["edition"] == "Professional"

    def test_edition_extracted_kms(self):
        assert validator._parse_dlv_details(self.KMS)["edition"] == "Enterprise"

    def test_partial_key_english(self):
        assert validator._parse_dlv_details(self.ENGLISH)["partial_key"] == "2YT43"

    def test_partial_key_dutch(self):
        assert validator._parse_dlv_details(self.DUTCH)["partial_key"] == "2YT43"

    def test_license_status_english(self):
        info = validator._parse_dlv_details(self.ENGLISH)
        assert "Licensed" in info["license_status"]

    def test_license_status_dutch(self):
        info = validator._parse_dlv_details(self.DUTCH)
        assert info["license_status"] != ""

    def test_product_name_extracted(self):
        info = validator._parse_dlv_details(self.ENGLISH)
        assert "Windows" in info["product_name"]

    def test_empty_output_defaults(self):
        info = validator._parse_dlv_details("")
        assert info["key_type"] == "Onbekend"
        assert info["partial_key"] == ""
        assert info["edition"] == ""
        assert info["license_status"] == ""

    def test_kms_takes_priority_over_retail(self):
        # VOLUME_KMSCLIENT should match before RETAIL if both appear
        output = "Name: Windows(R), VOLUME_KMSCLIENT RETAIL channel"
        assert validator._parse_dlv_details(output)["key_type"] == "Volume (KMS)"


# ---------------------------------------------------------------------------
# validate_key  (zonder slmgr)
# ---------------------------------------------------------------------------

class TestValidateKey:

    def test_invalid_format_returns_invalid_status(self):
        result = validator.validate_key("INVALID-KEY", use_slmgr=False)
        assert result["status"] == "invalid"

    def test_invalid_format_has_notes(self):
        result = validator.validate_key("INVALID", use_slmgr=False)
        assert result["notes"] != ""

    def test_valid_format_no_slmgr_returns_format_ok(self):
        result = validator.validate_key("NPPR9-FWDCX-D2C8J-H872K-2YT43", use_slmgr=False)
        assert result["status"] == "format_ok"

    def test_key_is_uppercased_in_result(self):
        result = validator.validate_key("nppr9-fwdcx-d2c8j-h872k-2yt43", use_slmgr=False)
        assert result["key"] == "NPPR9-FWDCX-D2C8J-H872K-2YT43"

    def test_result_contains_all_required_fields(self):
        result = validator.validate_key("NPPR9-FWDCX-D2C8J-H872K-2YT43", use_slmgr=False)
        for field in ("key", "status", "key_type", "edition", "notes", "validated_at"):
            assert field in result

    def test_validated_at_is_populated(self):
        result = validator.validate_key("NPPR9-FWDCX-D2C8J-H872K-2YT43", use_slmgr=False)
        assert result["validated_at"] != ""

    def test_slmgr_skipped_on_non_windows(self):
        # Simuleer niet-Windows platform
        with patch.object(sys, "platform", "linux"):
            result = validator.validate_key(
                "NPPR9-FWDCX-D2C8J-H872K-2YT43", use_slmgr=True
            )
        assert result["status"] == "format_ok"


# ---------------------------------------------------------------------------
# Database — init_db / get_conn
# ---------------------------------------------------------------------------

class TestDatabase:

    def test_both_tables_created(self, tmp_db):
        conn = validator.get_conn()
        tables = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        conn.close()
        assert "license_keys" in tables
        assert "batches" in tables

    def test_license_keys_has_required_columns(self, tmp_db):
        conn = validator.get_conn()
        cols = {
            row[1] for row in conn.execute("PRAGMA table_info(license_keys)").fetchall()
        }
        conn.close()
        for col in ("key", "product", "status", "key_type", "edition", "batch_id", "validated_at"):
            assert col in cols

    def test_batches_has_required_columns(self, tmp_db):
        conn = validator.get_conn()
        cols = {
            row[1] for row in conn.execute("PRAGMA table_info(batches)").fetchall()
        }
        conn.close()
        for col in ("id", "product", "total", "valid", "invalid", "created_at"):
            assert col in cols

    def test_init_db_is_idempotent(self, tmp_db):
        """Herhaald aanroepen mag geen fout geven (CREATE TABLE IF NOT EXISTS)."""
        conn = validator.get_conn()
        validator.init_db(conn)
        validator.init_db(conn)
        conn.close()

    def test_license_key_unique_constraint(self, tmp_db):
        conn = validator.get_conn()
        conn.execute(
            "INSERT INTO license_keys (key, status) VALUES ('TESTKEY', 'pending')"
        )
        conn.commit()
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO license_keys (key, status) VALUES ('TESTKEY', 'pending')"
            )
        conn.close()


# ---------------------------------------------------------------------------
# load_keys_from_csv
# ---------------------------------------------------------------------------

class TestLoadKeysFromCsv:

    def test_load_key_and_product(self, tmp_path):
        f = tmp_path / "keys.csv"
        f.write_text("key,product\nNPPR9-FWDCX-D2C8J-H872K-2YT43,Windows 11 Pro\n")
        keys = validator.load_keys_from_csv(str(f))
        assert len(keys) == 1
        assert keys[0]["key"] == "NPPR9-FWDCX-D2C8J-H872K-2YT43"
        assert keys[0]["product"] == "Windows 11 Pro"

    def test_key_is_uppercased(self, tmp_path):
        f = tmp_path / "keys.csv"
        f.write_text("key,product\nnppr9-fwdcx-d2c8j-h872k-2yt43,Windows 11 Pro\n")
        keys = validator.load_keys_from_csv(str(f))
        assert keys[0]["key"] == "NPPR9-FWDCX-D2C8J-H872K-2YT43"

    def test_empty_key_rows_skipped(self, tmp_path):
        f = tmp_path / "keys.csv"
        f.write_text("key,product\n,Windows 11 Pro\nNPPR9-FWDCX-D2C8J-H872K-2YT43,Windows 11 Pro\n")
        keys = validator.load_keys_from_csv(str(f))
        assert len(keys) == 1

    def test_no_product_column(self, tmp_path):
        f = tmp_path / "keys.csv"
        f.write_text("key\nNPPR9-FWDCX-D2C8J-H872K-2YT43\n")
        keys = validator.load_keys_from_csv(str(f))
        assert len(keys) == 1
        assert keys[0]["product"] == ""

    def test_multiple_keys_loaded(self, tmp_path):
        f = tmp_path / "keys.csv"
        f.write_text(
            "key,product\n"
            "NPPR9-FWDCX-D2C8J-H872K-2YT43,Windows 11 Pro\n"
            "VK7JG-NPHTM-C97JM-9MPGT-3V66T,Windows 11 Pro\n"
            "W269N-WFGWX-YVC9B-4J6C9-T83GX,Windows 11 Home\n"
        )
        keys = validator.load_keys_from_csv(str(f))
        assert len(keys) == 3

    def test_empty_csv_returns_empty_list(self, tmp_path):
        f = tmp_path / "keys.csv"
        f.write_text("key,product\n")
        assert validator.load_keys_from_csv(str(f)) == []


# ---------------------------------------------------------------------------
# process_batch
# ---------------------------------------------------------------------------

class TestProcessBatch:

    VALID_KEY = "NPPR9-FWDCX-D2C8J-H872K-2YT43"
    VALID_KEY_2 = "VK7JG-NPHTM-C97JM-9MPGT-3V66T"
    VALID_KEY_3 = "W269N-WFGWX-YVC9B-4J6C9-T83GX"
    INVALID_KEY = "INVALID"

    def test_summary_fields_present(self, tmp_db):
        summary = validator.process_batch(
            [{"key": self.VALID_KEY, "product": ""}],
            use_slmgr=False, batch_id="T001"
        )
        for field in ("batch_id", "total", "valid", "invalid", "skipped"):
            assert field in summary

    def test_valid_format_key_counted_as_valid(self, tmp_db):
        summary = validator.process_batch(
            [{"key": self.VALID_KEY, "product": "Windows 11 Pro"}],
            use_slmgr=False, batch_id="T002"
        )
        assert summary["valid"] == 1
        assert summary["invalid"] == 0

    def test_invalid_format_key_counted_as_invalid(self, tmp_db):
        summary = validator.process_batch(
            [{"key": self.INVALID_KEY, "product": ""}],
            use_slmgr=False, batch_id="T003"
        )
        assert summary["invalid"] == 1
        assert summary["valid"] == 0

    def test_duplicate_key_is_skipped(self, tmp_db):
        keys = [{"key": self.VALID_KEY, "product": ""}]
        validator.process_batch(keys, use_slmgr=False, batch_id="T004A")
        summary = validator.process_batch(keys, use_slmgr=False, batch_id="T004B")
        assert summary["skipped"] == 1
        assert summary["total"] == 1

    def test_batch_record_saved_in_db(self, tmp_db):
        validator.process_batch(
            [{"key": self.VALID_KEY, "product": "Win"}],
            use_slmgr=False, batch_id="T005"
        )
        conn = sqlite3.connect(tmp_db)
        row = conn.execute("SELECT id FROM batches WHERE id = 'T005'").fetchone()
        conn.close()
        assert row is not None

    def test_key_record_saved_in_db(self, tmp_db):
        validator.process_batch(
            [{"key": self.VALID_KEY, "product": "Win"}],
            use_slmgr=False, batch_id="T006"
        )
        conn = sqlite3.connect(tmp_db)
        row = conn.execute(
            "SELECT key FROM license_keys WHERE key = ?", (self.VALID_KEY,)
        ).fetchone()
        conn.close()
        assert row is not None

    def test_alert_triggered_when_invalid_rate_exceeds_threshold(self, tmp_db):
        """100% ongeldige sleutels → send_alert moet worden aangeroepen."""
        with patch.object(validator, "send_alert") as mock_alert:
            validator.process_batch(
                [{"key": self.INVALID_KEY, "product": ""}],
                use_slmgr=False, batch_id="T007"
            )
        mock_alert.assert_called_once()

    def test_alert_not_triggered_when_all_valid(self, tmp_db):
        with patch.object(validator, "send_alert") as mock_alert:
            validator.process_batch(
                [
                    {"key": self.VALID_KEY, "product": ""},
                    {"key": self.VALID_KEY_2, "product": ""},
                    {"key": self.VALID_KEY_3, "product": ""},
                ],
                use_slmgr=False, batch_id="T008"
            )
        mock_alert.assert_not_called()

    def test_results_list_included_in_summary(self, tmp_db):
        summary = validator.process_batch(
            [{"key": self.VALID_KEY, "product": ""}],
            use_slmgr=False, batch_id="T009"
        )
        assert isinstance(summary.get("results"), list)

    def test_auto_batch_id_generated_when_not_provided(self, tmp_db):
        summary = validator.process_batch(
            [{"key": self.VALID_KEY, "product": ""}],
            use_slmgr=False
        )
        assert summary["batch_id"] != ""

    def test_correct_total_count(self, tmp_db):
        keys = [
            {"key": self.VALID_KEY, "product": ""},
            {"key": self.VALID_KEY_2, "product": ""},
            {"key": self.INVALID_KEY, "product": ""},
        ]
        summary = validator.process_batch(keys, use_slmgr=False, batch_id="T010")
        assert summary["total"] == 3


# ---------------------------------------------------------------------------
# export_valid_keys
# ---------------------------------------------------------------------------

class TestExportValidKeys:

    def _insert_key(self, key, product, status, sold_at=None):
        conn = validator.get_conn()
        conn.execute(
            "INSERT INTO license_keys (key, product, status, sold_at, validated_at, batch_id) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (key, product, status, sold_at, "2026-01-01T00:00:00", "BATCH1"),
        )
        conn.commit()
        conn.close()

    def test_exports_valid_key(self, tmp_db, tmp_path):
        self._insert_key("NPPR9-FWDCX-D2C8J-H872K-2YT43", "Windows 11 Pro", "valid")
        out = str(tmp_path / "export.csv")
        count = validator.export_valid_keys(out)
        assert count == 1
        with open(out) as f:
            rows = list(csv.DictReader(f))
        assert rows[0]["key"] == "NPPR9-FWDCX-D2C8J-H872K-2YT43"

    def test_exports_format_ok_key(self, tmp_db, tmp_path):
        self._insert_key("VK7JG-NPHTM-C97JM-9MPGT-3V66T", "Windows 11 Pro", "format_ok")
        out = str(tmp_path / "export.csv")
        assert validator.export_valid_keys(out) == 1

    def test_excludes_sold_keys(self, tmp_db, tmp_path):
        self._insert_key(
            "NPPR9-FWDCX-D2C8J-H872K-2YT43", "Win", "used", sold_at="2026-01-02"
        )
        out = str(tmp_path / "export.csv")
        assert validator.export_valid_keys(out) == 0

    def test_excludes_invalid_keys(self, tmp_db, tmp_path):
        self._insert_key("NPPR9-FWDCX-D2C8J-H872K-2YT43", "Win", "invalid")
        out = str(tmp_path / "export.csv")
        assert validator.export_valid_keys(out) == 0

    def test_filter_by_product(self, tmp_db, tmp_path):
        self._insert_key("NPPR9-FWDCX-D2C8J-H872K-2YT43", "Windows 11 Pro", "valid")
        self._insert_key("VK7JG-NPHTM-C97JM-9MPGT-3V66T", "Windows 10 Home", "valid")
        out = str(tmp_path / "export.csv")
        count = validator.export_valid_keys(out, product="Windows 11 Pro")
        assert count == 1

    def test_csv_has_correct_headers(self, tmp_db, tmp_path):
        self._insert_key("NPPR9-FWDCX-D2C8J-H872K-2YT43", "Win", "valid")
        out = str(tmp_path / "export.csv")
        validator.export_valid_keys(out)
        with open(out) as f:
            fieldnames = csv.DictReader(f).fieldnames
        assert set(fieldnames) == {"key", "product", "batch_id", "validated_at"}

    def test_empty_db_exports_zero_rows(self, tmp_db, tmp_path):
        out = str(tmp_path / "export.csv")
        assert validator.export_valid_keys(out) == 0


# ---------------------------------------------------------------------------
# mark_as_sold
# ---------------------------------------------------------------------------

class TestMarkAsSold:

    KEY = "NPPR9-FWDCX-D2C8J-H872K-2YT43"

    def _insert_valid_key(self, status="valid"):
        conn = validator.get_conn()
        conn.execute(
            "INSERT INTO license_keys (key, product, status, validated_at, batch_id) "
            "VALUES (?, '', ?, '2026-01-01', 'B1')",
            (self.KEY, status),
        )
        conn.commit()
        conn.close()

    def test_valid_key_is_marked_used(self, tmp_db):
        self._insert_valid_key()
        assert validator.mark_as_sold(self.KEY, "ORDER-001") is True
        conn = sqlite3.connect(tmp_db)
        row = conn.execute(
            "SELECT status, order_id FROM license_keys WHERE key = ?", (self.KEY,)
        ).fetchone()
        conn.close()
        assert row[0] == "used"
        assert row[1] == "ORDER-001"

    def test_format_ok_key_can_be_sold(self, tmp_db):
        self._insert_valid_key(status="format_ok")
        assert validator.mark_as_sold(self.KEY, "ORDER-002") is True

    def test_nonexistent_key_returns_false(self, tmp_db):
        assert validator.mark_as_sold("XXXXX-XXXXX-XXXXX-XXXXX-XXXXX", "ORDER-999") is False

    def test_already_sold_key_returns_false(self, tmp_db):
        self._insert_valid_key()
        validator.mark_as_sold(self.KEY, "ORDER-001")
        assert validator.mark_as_sold(self.KEY, "ORDER-002") is False

    def test_lowercase_key_accepted(self, tmp_db):
        self._insert_valid_key()
        assert validator.mark_as_sold(self.KEY.lower(), "ORDER-001") is True

    def test_sold_at_timestamp_set(self, tmp_db):
        self._insert_valid_key()
        validator.mark_as_sold(self.KEY, "ORDER-001")
        conn = sqlite3.connect(tmp_db)
        row = conn.execute(
            "SELECT sold_at FROM license_keys WHERE key = ?", (self.KEY,)
        ).fetchone()
        conn.close()
        assert row[0] is not None


# ---------------------------------------------------------------------------
# send_alert
# ---------------------------------------------------------------------------

class TestSendAlert:

    SUMMARY = {"total": 10, "valid": 4, "invalid": 6, "product": "Windows 11 Pro"}

    def test_no_smtp_user_does_not_raise(self):
        with patch.dict(validator.SMTP_CONFIG, {"user": ""}):
            validator.send_alert("BATCH_X", self.SUMMARY, 0.6)  # must not raise

    def test_smtp_send_message_called_when_configured(self):
        mock_server = MagicMock()
        with patch.dict(
            validator.SMTP_CONFIG,
            {
                "user": "sender@example.com",
                "password": "secret",
                "host": "smtp.example.com",
                "port": 587,
                "to": "admin@example.com",
            },
        ):
            with patch("smtplib.SMTP") as mock_smtp_cls:
                mock_smtp_cls.return_value.__enter__ = lambda s: mock_server
                mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)
                validator.send_alert("BATCH_Y", self.SUMMARY, 0.6)
            mock_smtp_cls.assert_called_once()

    def test_smtp_exception_does_not_propagate(self):
        with patch.dict(
            validator.SMTP_CONFIG,
            {"user": "x@x.com", "password": "p", "host": "h", "port": 587, "to": "t@t.com"},
        ):
            with patch("smtplib.SMTP", side_effect=Exception("Connection refused")):
                validator.send_alert("BATCH_Z", self.SUMMARY, 0.6)  # must not raise
