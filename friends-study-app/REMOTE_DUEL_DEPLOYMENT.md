# Different Cities / Remote Duel Deployment

Local Wi-Fi is not enough for different cities. For remote duel, the app needs a public HTTPS room API.

The app is split into two parts:

1. Static PWA
   - `index.html`
   - `app.js`
   - `styles.css`
   - `manifest.webmanifest`
   - `sw.js`
   - `assets/`
   - `data/`

2. Room API
   - `server.js`
   - `package.json`
   - `Procfile`
   - `render.yaml`

## Recommended Simple Setup

Use one Render web service for everything:

1. Push this folder/repo to GitHub.
2. Open https://render.com.
3. New > Web Service.
4. Connect the GitHub repo.
5. If your repo root is not this folder, set Root Directory to:

```text
outputs/friends-study-app
```

6. Use:

```text
Build Command: npm install
Start Command: npm start
```

7. Deploy.

Render will give a URL like:

```text
https://friends-english-arena.onrender.com
```

Open that URL on iPhone Safari, then Share > Add to Home Screen.

## If Static App And API Are Separate

Example:

- Static PWA on GitHub Pages:

```text
https://USERNAME.github.io/REPO/
```

- API on Render:

```text
https://friends-english-arena.onrender.com
```

Then edit `data-config.js`:

```js
window.FRIENDS_DATA_URL = "https://raw.githubusercontent.com/USERNAME/REPO/main/outputs/friends-study-app/data/friends-data.json";
window.FRIENDS_API_BASE = "https://friends-english-arena.onrender.com";
```

## Important

- GitHub Pages alone can run study, quiz, profile, corrected translations, and PWA.
- GitHub Pages alone cannot run live duel rooms because it has no backend.
- Remote duel needs `server.js` running on Render/Railway/Fly/another Node host.
- The current room server stores rooms in memory. If the host restarts, active rooms reset. That is fine for casual live duel.

## Test API

After deploy, open:

```text
https://YOUR-API/api/health
```

Expected:

```json
{"ok":true,"rooms":0,"episodes":88}
```
