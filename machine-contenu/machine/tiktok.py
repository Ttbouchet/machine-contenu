"""Lecture des statistiques TikTok (API TikTok for Business, Accounts API) — lecture seule, aucune publication.

Le jeton d'acces est garde par le script Google (proprietes du script) : la machine lui demande un jeton valable,
puis appelle TikTok directement. Doc : business-api.tiktok.com/portal/docs > Accounts API > Get post data.
En SIMULATION, SIMU_TIKTOK = fichier JSON (liste de videos au format TikTok) joue le role de l'API."""
import json
import os
import time

import requests

from . import drive
from .base import SIMULATION

API = "https://business-api.tiktok.com/open_api/v1.3/business/video/list/"
CHAMPS = ["item_id", "create_time", "caption", "thumbnail_url", "share_url", "video_duration", "video_views", "reach",
          "likes", "comments", "shares", "favorites", "full_video_watched_rate", "average_time_watched",
          "total_time_watched", "new_followers", "profile_views", "audience_countries", "impression_sources",
          "audience_types", "video_view_retention", "is_ai_generated"]


class PasConnecte(RuntimeError):
    pass


def jeton():
    """(access_token, open_id) fournis par le script Google, qui renouvelle le jeton si besoin."""
    if SIMULATION:
        if not os.environ.get("SIMU_TIKTOK"):
            raise PasConnecte("TikTok non connecté (simulation sans SIMU_TIKTOK)")
        return "simu", "simu"
    b = drive._appel("tiktok_jeton")
    if not b.get("access_token"):
        raise PasConnecte(b.get("erreur") or "TikTok non connecté")
    return b["access_token"], b["open_id"]


def videos(max_pages=15):
    """Toutes les publications publiques du compte avec leurs statistiques (20 par page)."""
    acces, open_id = jeton()
    if SIMULATION:
        return json.load(open(os.environ["SIMU_TIKTOK"], encoding="utf-8"))
    res, curseur = [], None
    for _ in range(max_pages):
        params = {"business_id": open_id, "fields": json.dumps(CHAMPS), "max_count": 20}
        if curseur:
            params["cursor"] = curseur
        r = requests.get(API, headers={"Access-Token": acces}, params=params, timeout=60)
        b = r.json()
        if b.get("code") != 0:
            raise RuntimeError(f"TikTok : {b.get('message') or r.text[:200]} (code {b.get('code')})")
        d = b.get("data") or {}
        res += d.get("videos") or []
        if not d.get("has_more") or not d.get("cursor"):
            break
        curseur = d["cursor"]
        time.sleep(1.6)  # limite : 40 requetes / minute
    return res
