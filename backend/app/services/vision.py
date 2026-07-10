"""◈ Bild-Auswertung für den Materia-Scanner — ECHTE Analyse statt Mock.

Kaskade auf dem hochgeladenen Foto:
  1. Barcode-Dekodierung (zxing-cpp): EAN/UPC direkt vom Verpackungsfoto,
     robust gegen Drehung; probiert Original, Graustufen und 2×-Upscale.
     → Open-Food-Facts-Produkt = exakte Herstellerwerte.
  2. Optionales OCR (pytesseract, nur wenn tesseract installiert ist):
     liest markanten Verpackungstext und schickt ihn in die validierte
     OFF-Volltextsuche.
  3. Kein Treffer → {found: False}. Das Frontend zeigt dann eine ehrliche
     Meldung — es werden KEINE Fantasie-Nährwerte mehr erfunden.
"""
from __future__ import annotations

import io
import re

MAX_IMAGE_BYTES = 8 * 1024 * 1024

try:
    import zxingcpp
    from PIL import Image
    _ZXING = True
except ImportError:          # Barcode-Stack fehlt → Scan meldet ehrlich found:False
    _ZXING = False

try:
    import pytesseract  # optional; braucht das tesseract-Binary auf dem Host
    from PIL import Image as _PilImage  # noqa: F401
    pytesseract.get_tesseract_version()
    _OCR = True
except Exception:
    _OCR = False


def decode_barcode(data: bytes) -> str | None:
    """EAN/UPC aus Foto-Bytes — None, wenn nichts Lesbares gefunden wird."""
    if not _ZXING:
        return None
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception:
        return None

    candidates = [img]
    try:
        candidates.append(img.convert("L"))
        w, h = img.size
        if max(w, h) < 1400:   # kleine Handy-Crops profitieren vom Upscale
            candidates.append(img.convert("L").resize((w * 2, h * 2), Image.LANCZOS))
    except Exception:
        pass

    wanted = {"EAN-13", "EAN-8", "UPC-A", "UPC-E", "Code128"}
    for cand in candidates:
        try:
            for r in zxingcpp.read_barcodes(cand):
                if str(r.format) in wanted and r.text and r.text.isdigit():
                    return r.text
        except Exception:
            continue
    return None


_OCR_CLEAN = re.compile(r"[^A-Za-zÄÖÜäöüß' ]+")


def ocr_text(data: bytes) -> str | None:
    """Markanten Verpackungstext extrahieren (nur wenn tesseract vorhanden)."""
    if not _OCR:
        return None
    try:
        img = Image.open(io.BytesIO(data)).convert("L")
        raw = pytesseract.image_to_string(img, timeout=8) or ""
    except Exception:
        return None
    # Längste plausible Wortzeilen als Suchbegriff verwenden
    words: list[str] = []
    for line in raw.splitlines():
        line = _OCR_CLEAN.sub(" ", line).strip()
        for w in line.split():
            if len(w) >= 4 and w.lower() not in ("zutaten", "ingredients", "nutrition"):
                words.append(w)
        if len(words) >= 4:
            break
    q = " ".join(words[:4]).strip()
    return q if len(q) >= 4 else None


def capabilities() -> dict:
    return {"barcode": _ZXING, "ocr": _OCR}
