# Projekt-Richtlinien: Update-Prozess

Diese Datei ist eine verbindliche Anweisung für die KI. Bei JEDER Code-Änderung müssen die folgenden Schritte zur Versionierung zwingend durchgeführt werden, um Cache-Probleme (besonders auf Mobilgeräten/iPhone) zu vermeiden.

## 1. Versions-Synchronisierung
Die Versionsnummer muss in allen drei Dateien absolut IDENTISCH sein.

### A. version.js
Ändere die Konstante `APP_VERSION`:
```javascript
const APP_VERSION = "1.0.x";
```

### B. sw.js (Service Worker)
Ändere den Versions-Kommentar in der ALLERERSTEN Zeile. Dies zwingt den Browser, die Datei als "neu" zu erkennen:
```javascript
// Version: 1.0.x
```

### C. index.html (Hard Reset Key)
Suche die Zeile mit `force_reset_` und aktualisiere den Key auf die neue Version. Dies löst die Cache-Löschung beim User aus:
```javascript
if (localStorage.getItem('force_reset_1.0.x') !== 'done') {
    // ...
    localStorage.setItem('force_reset_1.0.x', 'done');
}
```

## 2. Asset Versioning (index.html)
Um auch bei normalen Browsern sicherzugehen, sollten die Query-Parameter der Assets in der `index.html` erhöht werden:
- `style.css?v=x`
- `script.js?v=x`

## 3. Workflow
1. Code-Änderung durchführen.
2. Versionsnummer in `version.js`, `sw.js` und `index.html` (Reset Key) gleichzeitig anheben.
3. Erst danach die Änderungen speichern/hochladen.

---
**Hinweis:** Ohne diese Schritte bemerken installierte PWA-Versionen (Homescreen-Apps) auf dem iPhone keine Änderungen!