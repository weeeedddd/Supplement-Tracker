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
    from PIL import Image
    _PIL = True
except ImportError:
    Image = None  # type: ignore[assignment]
    _PIL = False

try:
    import zxingcpp
    _ZXING = _PIL
except ImportError:          # Barcode-Stack fehlt → Scan meldet ehrlich found:False
    _ZXING = False

try:
    import pytesseract  # optional; braucht das tesseract-Binary auf dem Host
    pytesseract.get_tesseract_version()
    _OCR = _PIL
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


def ocr_full_text(data: bytes) -> str | None:
    """Read a nutrition panel without turning uncertain OCR into food data."""
    if not _OCR:
        return None
    try:
        image = Image.open(io.BytesIO(data)).convert("L")
        # Nutrition panels benefit from a little contrast and upscaling, while
        # keeping the original pixels on the server only for this request.
        width, height = image.size
        if max(width, height) < 1800:
            image = image.resize((width * 2, height * 2), Image.LANCZOS)
        return (pytesseract.image_to_string(image, timeout=10) or "").strip() or None
    except Exception:
        return None


_NUMBER = r"(\d{1,5}(?:[.,]\d{1,2})?)"
_LABEL_PATTERNS: dict[str, tuple[str, ...]] = {
    "fat": (r"^\s*(?:total\s+)?fat\b", r"^\s*fett\b"),
    "saturatedFat": (r"saturat", r"ges[aä]tt"),
    "carb": (r"carbohydrat", r"kohlenhydrat"),
    "sug": (r"(?:of which\s+)?sugars?", r"davon\s+zucker", r"^\s*zucker"),
    "fiber": (r"fib(?:er|re)", r"ballaststoff"),
    "prot": (r"protein", r"eiwei", r"eweiss"),
    "salt": (r"^\s*salt\b", r"^\s*salz\b"),
    "sodium": (r"sodium", r"natrium"),
}


def _line_value(line: str) -> float | None:
    match = re.search(_NUMBER + r"\s*(?:g|mg)\b", line, re.IGNORECASE)
    if not match:
        return None
    try:
        return float(match.group(1).replace(",", "."))
    except ValueError:
        return None


def parse_nutrition_label_text(raw: str) -> dict:
    """Extract only values that appear next to recognizable label names.

    This is deliberately stricter than general OCR: missing fields remain
    missing and the returned score reflects how much of the panel was read.
    """
    lines = [re.sub(r"\s+", " ", line).strip() for line in (raw or "").splitlines()]
    lines = [line for line in lines if line]
    joined = " ".join(lines).lower()
    basis = "per100g" if re.search(r"(?:per|pro|je)\s*100\s*(?:g|ml)\b", joined) else "serving"
    values: dict[str, float | int] = {}
    matched: list[str] = []

    for line in lines:
        lowered = line.lower()
        if ("energy" in lowered or "brennwert" in lowered or "kalorien" in lowered):
            kcal = re.search(_NUMBER + r"\s*kcal\b", lowered)
            if kcal:
                values["kcal"] = round(float(kcal.group(1).replace(",", ".")))
                matched.append(line[:140])
        for field, patterns in _LABEL_PATTERNS.items():
            if field in values or not any(re.search(pattern, lowered) for pattern in patterns):
                continue
            value = _line_value(lowered)
            if value is None:
                continue
            is_mg = bool(re.search(_NUMBER + r"\s*mg\b", lowered, re.IGNORECASE))
            if field == "sodium":
                values["sodiumMg"] = round(value if is_mg else value * 1000)
            elif field == "salt":
                # EU labels usually show salt; sodium is salt / 2.5.
                values["sodiumMg"] = round((value if is_mg else value * 1000) / 2.5)
            else:
                values[field] = round(value, 1)
            matched.append(line[:140])

    core = sum(1 for field in ("kcal", "prot", "carb", "fat", "sug") if field in values)
    score = min(96, 20 + core * 13 + max(0, len(values) - core) * 5)
    found = "kcal" in values and core >= 3
    return {
        "found": found,
        "basis": basis,
        "confidence": score if found else min(score, 49),
        "values": values if found else {},
        "matchedLines": matched[:10] if found else [],
    }


def scan_nutrition_label(data: bytes) -> dict:
    raw = ocr_full_text(data)
    if not raw:
        return {"found": False, "capabilities": capabilities()}
    result = parse_nutrition_label_text(raw)
    result["capabilities"] = capabilities()
    return result


def capabilities() -> dict:
    return {"barcode": _ZXING, "ocr": _OCR}
