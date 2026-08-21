# CORELINE auf Ubuntu 24.04 – ohne Domain

Dieser Stack veröffentlicht ausschließlich das vorhandene CORELINE-Backend.
Er verändert weder das freigegebene Frontend noch dessen Dark-Webtoon-Design.

Enthalten:

- FastAPI für Konten, Freunde, Guilds, Sync, Raids, OCR und Push
- PostgreSQL mit persistentem Volume
- Nginx vor dem nur lokal gebundenen API-Port
- öffentlich vertrauenswürdiges HTTPS direkt auf der IPv4-Adresse
- automatische Prüfung des sechstägigen Let's-Encrypt-Zertifikats
- Push-Worker im Fünf-Minuten-Takt
- tägliches Datenbank-Backup mit 14 Tagen Aufbewahrung

## Installation vom Handy

Öffne im aitch.systems-Panel die Web-Konsole des Servers. Das Root-Passwort
oder einen privaten SSH-Key niemals in Chat, GitHub oder Screenshots einfügen.

Die öffentliche IPv4 steht im Server-Panel. Sie wird nur als Argument des
Installers auf dem Server verwendet:

```bash
apt-get update && apt-get install -y git
git clone --branch codex/domainless-vps-deployment --single-branch https://github.com/weeeedddd/Supplement-Tracker.git
cd Supplement-Tracker
sudo bash deploy/setup-ip.sh DEINE_OEFFENTLICHE_IPV4
```

Der Installer erzeugt Datenbankpasswort, Cron-Secret und VAPID-Schlüssel lokal
in `deploy/.env` mit Dateirechten `0600`. Er gibt sie nicht aus. Kostenpflichtige
OpenAI- und Google-Integrationen bleiben bewusst deaktiviert.

Danach in CORELINE:

1. **Einstellungen → Integrationen & erweitertes Backend** öffnen.
2. `https://DEINE_OEFFENTLICHE_IPV4` eintragen.
3. **Speichern & prüfen** tippen.
4. Im Guild-Bereich ein Konto registrieren.
5. Unter Benachrichtigungen den geschlossenen-App-Push aktivieren.

## Status prüfen

```bash
cd ~/Supplement-Tracker
sudo deploy/doctor.sh
```

Der Check zeigt Container, lokale API, öffentliches HTTPS, Zertifikatslaufzeit
und die beiden Timer – aber keine Secrets.

## Backup sofort ausführen

```bash
sudo systemctl start coreline-backup.service
sudo ls -lh /var/backups/coreline
```

Die Backups liegen ausschließlich auf demselben Server. Vor echten Nutzerdaten
sollte zusätzlich ein verschlüsseltes externes Backup eingerichtet werden.

## Aktualisieren

Erst nach einem freigegebenen Release:

```bash
cd ~/Supplement-Tracker
git pull --ff-only
sudo docker compose --project-directory deploy --env-file deploy/.env up -d --build --remove-orphans
sudo deploy/doctor.sh
```

## Wichtige Grenzen

- IP-Zertifikate von Let's Encrypt sind nur rund sechs Tage gültig. Der
  `coreline-cert-renew.timer` prüft deshalb zweimal täglich auf Erneuerung.
- Ports 80 und 443 müssen im Provider-Firewallprofil offen sein.
- Docker veröffentlicht PostgreSQL überhaupt nicht und FastAPI nur auf
  `127.0.0.1:8000`; öffentlich erreichbar ist ausschließlich Nginx.
- Der Server macht Accounts und Synchronisation möglich. Nutzer müssen sich
  trotzdem bewusst registrieren und Push ausdrücklich erlauben.
