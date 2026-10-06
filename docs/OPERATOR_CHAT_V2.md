# Assistant Syncoria — Operator Chat V2

La navigation et la topbar du cockpit utilisent **Assistant Syncoria**. Ce libellé
ne change ni le runtime, ni les routes, ni la mémoire, ni le streaming.

Le workspace utilise exclusivement l’API Operator Chat existante et le runtime Codex App Server. La sidebar regroupe les conversations par date, permet le renommage et l’archivage. Les archives restent consultables en lecture seule ; seule une restauration explicite les réactive.

Les événements SSE `assistant_delta` contiennent uniquement le texte assistant visible. Le texte final persisté remplace le brouillon. En cas d’erreur, Stop ou déconnexion, le brouillon disparaît ; l’historique du serveur reste la source de vérité. Les événements de tools sont validés avant leur affichage sous forme d’activité compacte.

Le panneau Diagnostic consulte les snapshots immuables par tour et n’affiche que les champs explicitement autorisés. Le profil des capacités est global, affiché selon les capacités réellement détectées côté backend. Shell, workspace et Python sont liés par la politique de sandbox ; le multi-agent est celui du harness natif. Les protections déterministes et la frontière PRIVATE sont imposées côté serveur.

La mémoire durable permet d’enregistrer explicitement un résumé, une décision, une prochaine action, un incident, une cause ou une résolution. La recherche est tenant-scopée et inclut les conversations archivées, sans les restaurer. Codex peut également composer une recherche pertinente via le MCP natif `syncoria_chat_memory_search`, sous la même frontière tenant. Le composer et les résultats restent indépendants de la stratégie choisie par le harness.

Le contrat `GET /admin/operator-chat/attachments/contract` annonce une ingestion indisponible, une limite de 10 Mio, les types texte/PDF, une durée de vie limitée au tour et une interdiction explicite des chemins hôte. Les futures pièces jointes utilisent des références opaques `attachment_id`, jamais un chemin du filesystem Syncoria. L’upload n’est pas activé dans cette livraison : son ingestion contrôlée, quotas et durée de vie doivent être ajoutés avant d’activer le composer fichier.

L’UI ne contient ni boucle agentique ni logique métier de sécurité. Les capacités et la mémoire restent des contrats backend composables, compatibles avec une exposition ultérieure MCP ou Apps SDK.
