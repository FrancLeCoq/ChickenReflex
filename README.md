# 🐓 Chicken Reflex — Le Coq Francis

Mini-jeu de **réflexes de 30 secondes** aux couleurs de **Le Coq Francis**, jouable dans le navigateur et lançable comme **Mini App Telegram**.

- 🌐 **En ligne :** https://franclecoq.github.io/ChickenReflex
- 🏆 **Classements généraux** hébergés sur Supabase, un par niveau

---

## 🎮 Le jeu en bref

Une cible apparaît au centre. **Tape le plus vite possible** — sauf si c'est un renard.

| Cible | Points |
|-------|:------:|
| 🥚 🌽 🐛 💰 objets de la ferme | **+1** |
| 🐓 **Francis** | **+2** |
| 🃏 **Valet** | **+3** |
| 👑 **Reine** | **+4** |
| 👑 **Roi** | **+5** |
| 🦊 **Renard** — *ne pas taper !* | **−2** |
| 🥚💣 **Œuf piégé** — *ne pas taper !* | **−2** |

Deux règles de plus, sans lesquelles il suffirait de marteler l'écran :

- **Taper dans le vide → −1.** Une seule pénalité par cible, pas de spam rentable.
- **Taper en moins de 90 ms → −1.** En dessous du plancher du réflexe humain, c'est de l'anticipation : le point ne compte pas.

Laisser passer un renard ne rapporte rien mais ne coûte rien : c'est le bon réflexe. Laisser passer une bonne cible compte comme un raté.

Le **temps de réaction est mesuré en millisecondes**, à partir de la frame réellement peinte (`requestAnimationFrame`), pas de l'appel JavaScript — le chiffre affiché est honnête.

### Les 3 niveaux

| Niveau | Affichage | Temps mort | Renards | Accès |
|--------|:---------:|:----------:|:-------:|-------|
| ⭐ **Facile** | 1,10 s | 430 ms | rares | **Tous** |
| ⭐⭐ **Moyen** | 0,82 s | 310 ms | fréquents | **Hodlers $FRANC** |
| ⭐⭐⭐ **Difficile** | 0,62 s | 215 ms | fréquents + œufs piégés | **Hodlers $FRANC** |

Dans chaque partie, le rythme **s'accélère progressivement** (jusqu'à −22 % sur les 30 s) et les **6 dernières secondes** doublent la fréquence des renards. Chaque niveau a son propre classement général.

> Pas de PvP : le duel entre deux joueurs se joue en différé, via les classements.

### Déblocage $FRANC

Comme dans **Mastermind**, les niveaux verrouillés s'ouvrent en connectant un wallet détenant des **$FRANC** (Solana ◎ / TON 💎, ou déblocage via Telegram Stars ⭐). La vérification passe par la fonction Edge `check-franc`, avec l'`initData` Telegram — le déverrouillage n'est donc pas falsifiable côté client.

---

## 🏆 Classements généraux

**Trois classements généraux**, un par niveau, calculés sur **tout l'historique** (pas de remise à zéro). Chacun retient le **meilleur score par joueur**, départagé au **meilleur temps de réaction** — à score égal, le plus rapide passe devant.

Sous chaque niveau, et en tête du classement, s'affichent **le champion avec sa médaille d'or** puis **le meilleur score du joueur avec son rang** :

```
🥇 Benoit 87     Toi #4 — 51
```

Chaque partie est **archivée** avec sa date (colonne `day`, en heure de Paris) : le jour où le jeu tourne bien, un classement quotidien se rebranche sans aucune migration de données.

Trois fonctions Postgres, appelées directement en RPC (aucun SDK à embarquer) :

- `submit_reflex_score(...)` — enregistre une partie et renvoie `{rank, best, best_ms, players}`
- `reflex_leaderboard(mode, limit, player_id)` — le TOP 10 du niveau, avec un `is_me` pour se surligner
- `reflex_summary(mode, player_id)` — le champion + le meilleur du joueur et son rang

La table `reflex_scores` est **fermée par RLS** et `REVOKE` : le rôle `anon` ne peut pas la lire ni y écrire en direct. Tout passe par ces deux fonctions `SECURITY DEFINER`, qui valident les entrées :

- score plafonné à `hits × 5` (la cible la plus riche vaut 5)
- compteurs bornés, temps de réaction contraints entre 90 et 5000 ms
- une seule soumission toutes les 15 s par joueur

> ⚠️ Le score reste calculé par le client : ces garde-fous rendent la triche pénible et bornée, ils ne la rendent pas impossible. Pour un verrouillage complet il faudrait rejouer la partie côté serveur.

Migration SQL : [`supabase/migrations/`](supabase/migrations/) (également versionnée dans le dépôt `supabase`).

---

## 🗂️ Structure

```
index.html                  tout le jeu (menu, moteur, classement)
assets/                     les coqs, repris de ChickenFight
supabase/migrations/        table + RPC du classement
```

Le menu, les cadenas SVG, la palette et le système d'écrans sont repris de **Mastermind** pour que les jeux Francis restent cohérents.

## 🚀 Lancer en local

```bash
python3 -m http.server 8000
# puis http://localhost:8000
```

Un simple serveur statique suffit : pas de build, pas de dépendance.
