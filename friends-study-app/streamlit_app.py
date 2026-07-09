import base64
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components


APP_DIR = Path(__file__).parent

st.set_page_config(
    page_title="Friends English Arena",
    page_icon=str(APP_DIR / "assets" / "icon-192.png"),
    layout="wide",
)

st.markdown(
    """
    <style>
      .block-container { padding: 0; max-width: 100%; }
      header, footer { visibility: hidden; }
      iframe { display: block; }
    </style>
    """,
    unsafe_allow_html=True,
)

html = (APP_DIR / "index.html").read_text(encoding="utf-8")
css = (APP_DIR / "styles.css").read_text(encoding="utf-8")
config = (APP_DIR / "data-config.js").read_text(encoding="utf-8")
data = (APP_DIR / "data" / "friends-data.js").read_text(encoding="utf-8")
app = (APP_DIR / "app.js").read_text(encoding="utf-8")
image = base64.b64encode((APP_DIR / "assets" / "study-table.png").read_bytes()).decode("ascii")

html = html.replace('<link rel="stylesheet" href="styles.css" />', f"<style>{css}</style>")
html = html.replace('src="assets/study-table.png"', f'src="data:image/png;base64,{image}"')
html = html.replace('<script src="data-config.js"></script>', f"<script>{config}</script>")
html = html.replace('<script src="data/friends-data.js"></script>', f"<script>{data}</script>")
html = html.replace('<script src="app.js"></script>', f"<script>{app}</script>")

# Streamlit renders this as an iframe. It is good for previewing and normal
# study flows, but iPhone "Add to Home Screen" works best from a static HTTPS
# host such as GitHub Pages, Netlify, or Cloudflare Pages.
components.html(html, height=920, scrolling=True)
