"""◈ SHADOW BOT — automatisierte Chat-Moderation.

Prüft jede Nachricht VOR dem Broadcast:
  · Scam/Phishing: verdächtige Links, Krypto-/Gratis-Geld-Muster, Invite-Spam
  · Toxizität: mehrsprachiger Schimpfwort-Filter (de/en/es + Varianten)
  · Spam: Raten-Limit + identische Wiederholungen pro Absender

Geblockte Nachrichten werden NICHT gespeichert/verteilt; der Absender
erhält eine mystische Verwarnung (Frontend lokalisiert per reason-Code).
"""
from __future__ import annotations

import re
import time
from collections import defaultdict, deque

# ── Scam / Phishing ──────────────────────────────────────────────────
URL_RE = re.compile(r"(?:https?://|www\.)[^\s]+", re.I)

SUSPICIOUS_TLDS = (".ru", ".tk", ".ml", ".ga", ".cf", ".gq", ".top", ".click", ".loan", ".zip")

SCAM_PATTERNS = [
    re.compile(p, re.I) for p in [
        r"free\s*(crypto|bitcoin|btc|eth|nitro|robux|v-?bucks)",
        r"(gratis|kostenlos).{0,24}(geld|gewinn|iphone|paypal)",
        r"verify\s+your\s+(account|wallet)",
        r"(konto|account).{0,20}(verifizier|bestätig).{0,20}(link|hier)",
        r"(seed\s*phrase|private\s*key|wallet\s*connect)",
        r"t\.me/|discord\.gg/|wa\.me/",
        r"(doppelt|double)\s+(dein|your)\s+(geld|money|crypto)",
        r"(click|klick).{0,16}(here|hier).{0,24}(prize|gewinn|reward)",
        r"(dm|schreib)\s+(me|mir).{0,20}(profit|trading|invest)",
    ]
]

# Nur diese Domains dürfen verlinkt werden — alles andere gilt als riskant
LINK_ALLOWLIST = (
    "openfoodfacts.org", "prices.openfoodfacts.org", "github.com",
    "wikipedia.org", "youtube.com", "youtu.be",
)

# ── Toxizität (mehrsprachig, bewusst moderat gehaltene Liste) ────────
PROFANITY = [
    # Deutsch
    "arschloch", "fick dich", "fick deine", "hurensohn", "hurenkind", "missgeburt",
    "wichser", "fotze", "schlampe", "bastard", "verpiss dich", "spast",
    "behindert du", "du opfer", "drecksau", "scheiss auf dich", "halt die fresse",
    # Englisch
    "fuck you", "fuck off", "motherfucker", "asshole", "bitch", "cunt",
    "dickhead", "son of a bitch", "kys", "kill yourself", "retard", "faggot",
    "whore", "slut", "piece of shit", "stfu",
    # Spanisch
    "hijo de puta", "puta madre", "gilipollas", "cabron", "cabrón", "pendejo",
    "vete a la mierda", "maricon", "maricón",
    # International/Leetspeak-Varianten
    "f u c k", "hur3nsohn", "a55hole", "wixer", "wixxer",
]
PROFANITY_RE = [re.compile(re.escape(w).replace(r"\ ", r"\s*"), re.I) for w in PROFANITY]

# ── Spam-Tracking (in-memory, pro Prozess) ───────────────────────────
_recent: dict[str, deque] = defaultdict(lambda: deque(maxlen=10))

SPAM_WINDOW_S = 10.0
SPAM_MAX_MSGS = 5
SPAM_REPEAT_MAX = 3


def _is_scam(text: str) -> bool:
    for pat in SCAM_PATTERNS:
        if pat.search(text):
            return True
    for m in URL_RE.finditer(text):
        url = m.group(0).lower()
        if any(url.endswith(tld) or (tld + "/") in url for tld in SUSPICIOUS_TLDS):
            return True
        if not any(dom in url for dom in LINK_ALLOWLIST):
            # Unbekannte Domain → als Phishing-Risiko behandeln
            return True
    return False


def _is_toxic(text: str) -> bool:
    return any(p.search(text) for p in PROFANITY_RE)


def _is_spam(sender: str, text: str) -> bool:
    now = time.time()
    q = _recent[sender]
    q.append((now, text.strip().lower()))
    recent = [(ts, tx) for ts, tx in q if now - ts <= SPAM_WINDOW_S]
    if len(recent) > SPAM_MAX_MSGS:
        return True
    same = sum(1 for _, tx in recent if tx and tx == text.strip().lower())
    return same >= SPAM_REPEAT_MAX


def moderate(sender: str, text: str) -> str | None:
    """None = sauber · sonst reason-Code: 'scam' | 'toxic' | 'spam'."""
    t = (text or "").strip()
    if not t:
        return None
    if _is_scam(t):
        return "scam"
    if _is_toxic(t):
        return "toxic"
    if _is_spam(sender, t):
        return "spam"
    return None


# Mystische Verwarnungen (Fallback-Texte; das Frontend lokalisiert selbst)
WARNINGS = {
    "scam": "Die Schatten haben deine Nachricht verschlungen. Verdächtige Links haben in der Void keinen Platz.",
    "toxic": "Deine Worte wurden von der Void absorbiert. Wähle sie weiser — die Schatten hören alles.",
    "spam": "Zu viele Echos in zu kurzer Zeit. Die Void verlangt Geduld.",
}


# ═══════════════════════════════════════════════════════════════════
#  ◈ SHADOW BOT — interaktive Chat-Befehle
#  !profile / !stats  → RPG-Akte des Absenders (aus der DB)
#  !loadout <Name>    → optimiertes Waffen-Setup (Gaming-Community)
#  !help              → Befehls-Übersicht
# ═══════════════════════════════════════════════════════════════════
_cmd_cooldown: dict[str, float] = {}
CMD_COOLDOWN_S = 2.0


def parse_command(text: str) -> tuple[str, str] | None:
    """'!loadout Fennec' → ('loadout', 'Fennec'). None wenn kein Befehl."""
    t = (text or "").strip()
    if not t.startswith("!"):
        return None
    parts = t[1:].split(maxsplit=1)
    if not parts:
        return None
    return parts[0].lower(), (parts[1].strip() if len(parts) > 1 else "")


def command_on_cooldown(sender: str) -> bool:
    """Leichter Anti-Spam-Schutz für Befehle (2 s pro Absender)."""
    now = time.time()
    last = _cmd_cooldown.get(sender, 0)
    if now - last < CMD_COOLDOWN_S:
        return True
    _cmd_cooldown[sender] = now
    return False


def format_profile(stats: dict) -> str:
    """Kompakte, stylische RPG-Akte (Markdown-fähig) aus einem Stats-Dict."""
    name = stats.get("name") or "Vessel"
    uid = stats.get("uid_tag") or "#000"
    attrs = stats.get("attrs") or {}
    order = ["STR", "VIT", "AGI", "INT", "MAG"]
    bars = []
    for k in order:
        v = int(attrs.get(k, 0))
        filled = max(0, min(10, round(v / 10)))
        bars.append(f"▸ **{k}** `{'█' * filled}{'░' * (10 - filled)}` {v}")
    title = stats.get("equipped_title") or "Shadow Novice"
    return "\n".join([
        f"◈ **SHADOW AGENT AKTE** · {name} `{uid}`",
        "━━━━━━━━━━━━━━━━━━",
        f"▸ **Rang:** {stats.get('rank', 'Shadow Novice')}   ▸ **XP:** {int(stats.get('xp', 0))}",
        f"▸ **Titel:** {title}",
        f"▸ **Streak:** 🔥 {int(stats.get('streak', 0))}   ▸ **Erfolge:** 🏆 {int(stats.get('achievements', 0))}",
        "━━━━━━━━━━━━━━━━━━",
        *bars,
    ])
