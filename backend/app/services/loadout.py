"""◈ SHADOW BOT — Loadout-Datenbank für die Gaming-Community.

Auf `!loadout <Name>` gibt der Bot ein optimiertes Waffen-Setup aus
(Aufsätze + Fokus), im dekorierten Chat-Stil der App. Rein statische
Community-Daten — kein externer Call.
"""
from __future__ import annotations

# name → { class, attachments{slot:value}, focus, tuning }
LOADOUTS: dict[str, dict] = {
    "WSP-9": {
        "class": "SMG",
        "attachments": {
            "Mündung": "ZEHMN35 Kompensator",
            "Lauf": "Kurzschaft WSP-9",
            "Visier": "Slate Reflektor",
            "Schaft": "Demo Cleanshot",
            "Griff": "Retort 90 Griffband",
        },
        "focus": "Mobilität & TTK auf kurze Distanz",
        "tuning": "AGI ▸ hoch · Rückstoßkontrolle ▸ mittel",
    },
    "Fennec 45": {
        "class": "SMG",
        "attachments": {
            "Mündung": "Sonic Suppressor",
            "Laser": "FSS OLE-V Laser",
            "Schaft": "No Stock",
            "Hinterer Griff": "XRK Edge BW-4",
            "Magazin": "45-Schuss Magazin",
        },
        "focus": "Extreme Feuerrate für Nahkampf-Duelle",
        "tuning": "AGI ▸ max · Streuung ▸ eng",
    },
    "SVA 545": {
        "class": "Sturmgewehr",
        "attachments": {
            "Mündung": "VT-7 Spiritfire Suppressor",
            "Unterlauf": "XTEN Phantom-5 Griff",
            "Lauf": "16.5\" SVA Präzision",
            "Magazin": "40-Schuss Magazin",
            "Optik": "Corio Eyer Pro",
        },
        "focus": "Kontrollierter Burst auf mittlere Distanz",
        "tuning": "INT ▸ hoch · Zielhilfe ▸ stabil",
    },
    "MCW": {
        "class": "Sturmgewehr",
        "attachments": {
            "Mündung": "Casus Bremse",
            "Unterlauf": "FTAC Ripper 56",
            "Lauf": "16.5\" MCW Cyclone",
            "Schaft": "MCW Kernschaft",
            "Optik": "Slate Reflektor",
        },
        "focus": "Allrounder — laser-präzise Feuerkontrolle",
        "tuning": "VIT ▸ hoch · Rückstoß ▸ minimal",
    },
    "Rival-9": {
        "class": "SMG",
        "attachments": {
            "Mündung": "Monolithic Suppressor",
            "Lauf": "Rival Langlauf",
            "Laser": "STOVL DR-6 Laser",
            "Schaft": "Falchion RS",
            "Magazin": "50-Schuss Magazin",
        },
        "focus": "Balance aus Reichweite und Handling",
        "tuning": "AGI ▸ mittel · Präzision ▸ hoch",
    },
    "Holger 556": {
        "class": "Sturmgewehr",
        "attachments": {
            "Mündung": "Shadowstrike Suppressor",
            "Unterlauf": "Bruen Heavy Support Griff",
            "Lauf": "Chorus 22.5\" Königslauf",
            "Magazin": "40-Schuss Magazin",
            "Hinterer Griff": "Bruen Flash Griff",
        },
        "focus": "Langstrecken-Dominanz mit hoher Kugelgeschwindigkeit",
        "tuning": "INT ▸ max · Reichweite ▸ extrem",
    },
    "Superi 46": {
        "class": "SMG",
        "attachments": {
            "Mündung": "T51R Billeret Bremse",
            "Lauf": "Superi Kurzlauf",
            "Unterlauf": "DR-6 Handstop",
            "Schaft": "Folding Stock",
            "Magazin": "48-Schuss Magazin",
        },
        "focus": "Aggressives Rushing mit stabilem Sprint-to-Fire",
        "tuning": "AGI ▸ hoch · ADS ▸ schnell",
    },
    "KATT-AMR": {
        "class": "Scharfschütze",
        "attachments": {
            "Mündung": "Remark KA Suppressor",
            "Lauf": "Long-Shot Königslauf",
            "Laser": "SL Razorhawk Laser",
            "Schaft": "Heavy Precision Schaft",
            "Magazin": "7-Schuss Magazin",
        },
        "focus": "One-Shot-Kill über maximale Distanz",
        "tuning": "INT ▸ max · Ausrichtung ▸ stabil",
    },
}

# Alias → kanonischer Name (tolerant gegenüber Schreibweisen)
ALIASES: dict[str, str] = {
    "wsp9": "WSP-9", "wsp-9": "WSP-9", "wsp": "WSP-9",
    "fennec": "Fennec 45", "fennec45": "Fennec 45",
    "sva": "SVA 545", "sva545": "SVA 545",
    "mcw": "MCW",
    "rival": "Rival-9", "rival9": "Rival-9", "rival-9": "Rival-9",
    "holger": "Holger 556", "holger556": "Holger 556",
    "superi": "Superi 46", "superi46": "Superi 46",
    "katt": "KATT-AMR", "kattamr": "KATT-AMR", "amr": "KATT-AMR",
}


def find_loadout(query: str) -> tuple[str, dict] | None:
    """Kanonischen Loadout-Namen tolerant auflösen."""
    q = query.strip()
    if not q:
        return None
    # 1) exakte (case-insensitive) Übereinstimmung
    for name, data in LOADOUTS.items():
        if name.lower() == q.lower():
            return name, data
    # 2) Alias (nur Buchstaben/Ziffern)
    key = "".join(c for c in q.lower() if c.isalnum())
    if key in ALIASES:
        name = ALIASES[key]
        return name, LOADOUTS[name]
    # 3) Teil-Übereinstimmung
    for name, data in LOADOUTS.items():
        if q.lower() in name.lower():
            return name, data
    return None


def format_loadout(name: str, data: dict) -> str:
    """Dekorierte Chat-Antwort im ◈-Stil (Markdown-fähig)."""
    lines = [f"◈ **LOADOUT · {name}**  `[{data['class']}]`", "━━━━━━━━━━━━━━━━━━"]
    for slot, val in data["attachments"].items():
        lines.append(f"▸ **{slot}:** {val}")
    lines.append("━━━━━━━━━━━━━━━━━━")
    lines.append(f"◈ **Fokus:** {data['focus']}")
    lines.append(f"◈ **Tuning:** {data['tuning']}")
    return "\n".join(lines)


def loadout_names() -> list[str]:
    return list(LOADOUTS.keys())
