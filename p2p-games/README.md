# Table ronde — jeux P2P entre amis (Phase 5 : échecs)

## Lancer (Windows)
1. Installer Node.js LTS : https://nodejs.org
2. Double-cliquer sur `start.bat` : le navigateur s'ouvre sur http://localhost:8080.
(Alternative : héberger ce dossier tel quel sur GitHub Pages, aucune installation côté amis.)

## Déjà en place
- Création du profil (pseudo seul). Clé ECDSA P-256 générée dans le navigateur, privée non extractible, stockée en IndexedDB.
- Identité réelle = empreinte de la clé ; pastille couleur + 3 caractères pour distinguer deux pseudos identiques.
- Changement de pseudo, réglages ICE (STUN par défaut, TURN optionnel), lien d'invitation avec la clé publique.
- Navigation : Accueil, Amis, Jeux, Réglages.

## Phase 3
- Page **Réseau** : deux ordinateurs entrent le même code de salon, se trouvent via les trackers publics (signalisation seulement), puis WebRTC direct.
- Poignée de main signée (preuve de possession de la clé), messages signés + numérotés (anti-rejeu), statut instable et reconnexion automatique.
- Tests du protocole : `node tests/protocol.test.mjs`
- Bibliothèque embarquée : Trystero (MIT) dans `vendor/` ; rencontre via BitTorrent ET Nostr en parallèle (redondance), diagnostic des relais affiché sur la page Réseau.
- Tests : `node tests/channel.test.mjs`, `tests/windows.test.mjs`, `tests/protocol.test.mjs`
- Page Réseau : codes de salon mémorisés (clic pour revenir), messages affichés à côté des joueurs.

## Phase 4 : amis
- Ajout par **pseudo** (la personne doit être en ligne) ou par **lien d'invitation** (clé incluse : la bonne personne, même en cas de pseudos identiques).
- Demandes envoyées / reçues, accepter, refuser, annuler, retirer, alias local. Les demandes non livrées sont **conservées sur disque** et ré-essayées jusqu'à accusé de réception.
- Statuts : en ligne, instable, hors ligne, en partie. Invitations à jouer avec accepter / refuser, puis salle de jeu (connexion vérifiée, pseudos, quitter). Le plateau d'échecs arrive en phase 5.
- Principe réseau : un salon privé par paire d'amis (n'accepte que la clé de l'ami) + une « boîte aux lettres » par pseudo pour recevoir les demandes.
- Un seul accès par salon et par page (limite de WebRTC) : boîte aux lettres, recherche et envois partagent le même.
- Tests : `node tests/logic.test.mjs` (règles des amis). Des tests d'intégration à deux utilisateurs complets ont aussi été exécutés pendant le développement.

## Limites connues
- Le lien d'invitation contient ton pseudo actuel : régénère-le (page Amis) si tu le changes.
- Quiconque connaît ton pseudo peut voir que tu es en ligne et t'envoyer une demande (limitée à 50 en attente). Tes amis, eux, ne sont jamais visibles.

## Phase 5 : échecs
- Plateau complet (tactile et clavier), coups légaux surlignés, dernier coup, roi en échec, promotion au choix, plateau retourné pour les noirs.
- **Les deux joueurs appliquent les règles** (chess.js) : un coup illégal reçu du réseau est ignoré et la position est resynchronisée. L'hôte (celui qui invite) tranche en cas de désaccord.
- Échec et mat, pat, triple répétition, matériel insuffisant, règle des 50 coups, nulle par accord, abandon, revanche (couleurs inversées), historique des coups.
- **Reprise** : la partie est sauvegardée après chaque coup. Si vous quittez, elle apparaît dans « Parties en cours » (Accueil) ; « Reprendre » invite l'ami à la continuer. Historique des parties terminées dans la page Jeux.
- Inviter : depuis la page Jeux (amis connectés) ou la page Amis.
- Tests : `node tests/board.test.mjs` (plateau et clics).

## iPad / iPhone
Voir `GUIDE-IPAD.md` (mise en ligne gratuite + installation sur l'écran d'accueil).

## Ajouter un jeu
Un jeu = un dossier dans `js/games/<nom>/` + une entrée dans `js/games/registry.js`. Il réutilise les invitations, la connexion vérifiée et l'envoi de messages `pairChannel(fp).send('game', {gid, kind, ...})`. Voir `js/games/chess/session.js` pour l'exemple.

## Pas encore là
Intégration finale et tests multi-ordinateurs (phases 6-7).
