# Friends English Arena - Phone / PWA Deployment

## Best Option: Static PWA

For iPhone "Add to Home Screen", publish this folder as a static HTTPS site.

Good hosts:
- GitHub Pages
- Netlify
- Cloudflare Pages
- Vercel static hosting

Upload/deploy the whole `friends-study-app` folder.

Then open the site on iPhone Safari:
1. Open the HTTPS URL.
2. Tap Share.
3. Tap "Add to Home Screen".
4. Open it like a normal app.

## Data From GitHub

Default behavior:
- The app loads `data/friends-data.json` when hosted on HTTPS.
- It can also use `data/friends-data.js` as fallback.

If the app is hosted somewhere else and data should come from GitHub raw, edit `data-config.js`:

```js
window.FRIENDS_DATA_URL = "https://raw.githubusercontent.com/USERNAME/REPO/main/outputs/friends-study-app/data/friends-data.json";
```

You can also pass a data URL directly:

```text
https://your-site.example.com/?data=https://raw.githubusercontent.com/USERNAME/REPO/main/outputs/friends-study-app/data/friends-data.json
```

## Duel / Room API

Static hosts can run the learning app and local progress, but they cannot run room state for live duel by themselves.

For live duel you need one of these:
- Run `server.js` locally on the same Wi-Fi.
- Deploy `server.js` as a small Node backend.
- Use another backend and set:

```js
window.FRIENDS_API_BASE = "https://your-api.example.com";
```

For different cities, use the remote backend guide:

```text
REMOTE_DUEL_DEPLOYMENT.md
```

The current local option:
- Double-click `start-web-server.cmd`.
- Open the phone URL shown in `WEB_USAGE.txt`.

## Streamlit

`streamlit_app.py` embeds the app for preview and study flows. It is not the best PWA host because Streamlit renders custom HTML in an iframe. For the clean iPhone home-screen experience, use a static HTTPS host.

If you still want Streamlit:

```bash
streamlit run streamlit_app.py
```

## Files To Keep

Required for static/PWA:
- `index.html`
- `styles.css`
- `app.js`
- `manifest.webmanifest`
- `sw.js`
- `data-config.js`
- `data/friends-data.json`
- `data/friends-data.js`
- `assets/`

Optional but useful:
- `server.js`
- `start-web-server.cmd`
- `WEB_USAGE.txt`
- `streamlit_app.py`
