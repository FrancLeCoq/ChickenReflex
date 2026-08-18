-- ══════════════════════════════════════════════════════════════
--  Chicken Reflex — fermeture des RPC au public
--
--  Avant : submit_reflex_score et reflex_board etaient executables
--  par PUBLIC / `anon` / `authenticated` via /rest/v1/rpc/*. Comme ce sont des fonctions SECURITY DEFINER et
--  que le client envoyait lui-meme son player_id et son player_name,
--  n'importe qui muni de la cle publishable (publique par nature)
--  pouvait ecrire le score de son choix sous l'identite de son choix.
--
--  Apres : seul le service_role peut les appeler, c'est-a-dire
--  uniquement l'Edge Function `chickenreflex-scores`, qui derive
--  l'identite des initData Telegram verifiees par HMAC-SHA256.
--
--  reflex_home n'est pas visee : elle a ete supprimee par le refactor
--  "zero appel au demarrage".
--
--  ⚠️ ORDRE DE DEPLOIEMENT — cette migration CASSE le jeu en ligne
--  tant que l'index.html qui passe par l'Edge Function n'est pas
--  publie sur GitHub Pages. A appliquer donc APRES la mise en ligne
--  du client, jamais avant.
-- ══════════════════════════════════════════════════════════════

revoke all on function public.submit_reflex_score(text, text, integer, integer, integer, integer, integer, text)
  from public, anon, authenticated;
revoke all on function public.reflex_board(text, integer, text)
  from public, anon, authenticated;
grant execute on function public.submit_reflex_score(text, text, integer, integer, integer, integer, integer, text)
  to service_role;
grant execute on function public.reflex_board(text, integer, text)
  to service_role;
