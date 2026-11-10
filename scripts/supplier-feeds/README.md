# Sincronización de feeds FTP de distribuidores

Oxygen (donde corre la tienda) no puede hablar FTP — solo HTTP. Este script sí puede, porque corre en GitHub Actions (Node normal), no en Oxygen. Cada noche descarga el catálogo de cada distribuidor y lo deja troceado en Firestore (colección `distributor_feed_chunks` + `distributor_feed_meta`), que es de donde lee el panel en `/admin-interno/distribuidores`.

## Secretos que hay que añadir en GitHub (Settings → Secrets and variables → Actions)

No los pongo yo por ti — añádelos tú directamente ahí:

- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` — los mismos valores que ya tienes en el `.env` de la web (la misma cuenta de servicio, mismo permiso de Firestore).
- `ZENTRALMEDIA_FTP_USER`, `ZENTRALMEDIA_FTP_PASSWORD`
- `MIDWICH_FTP_USER`, `MIDWICH_FTP_PASSWORD`

Audio-Technica queda fuera de momento: su servidor rechaza cualquier conexión que no venga de una IP ya autorizada por ellos, y los runners de GitHub Actions no tienen IP fija.

## Ejecutar a mano

```
cd scripts/supplier-feeds
npm install
FIREBASE_PROJECT_ID=... FIREBASE_CLIENT_EMAIL=... FIREBASE_PRIVATE_KEY=... \
ZENTRALMEDIA_FTP_USER=... ZENTRALMEDIA_FTP_PASSWORD=... \
MIDWICH_FTP_USER=... MIDWICH_FTP_PASSWORD=... \
node sync-ftp-feeds.mjs
```

El workflow `.github/workflows/sync-supplier-feeds.yml` lo lanza solo cada noche; también se puede disparar a mano desde la pestaña Actions de GitHub ("Run workflow").
