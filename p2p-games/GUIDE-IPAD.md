# Utiliser Table ronde sur iPad / iPhone

L'appli est un simple site : il suffit de le mettre en ligne UNE fois (gratuitement), puis chacun l'ouvre depuis son navigateur.
Le site ne contient aucune donnée de jeu : les parties passent toujours directement entre les joueurs.

## 1. Mettre le site en ligne (une seule personne, sur un PC)
1. Dézipper le projet : tu dois avoir un dossier `p2p-games` qui contient `index.html`.
2. Ouvrir https://app.netlify.com/drop dans Chrome ou Edge et glisser-déposer le dossier `p2p-games`.
3. Netlify donne une adresse du type `https://nom-au-hasard.netlify.app`.
4. Créer un compte gratuit pour garder le site (sans compte, il disparaît après environ 1 heure).
Alternative : Cloudflare Pages (envoi direct d'un dossier, gratuit).

Pour une mise à jour : glisser à nouveau le dossier sur la page « Deploys » du site (même adresse).

## 2. Sur l'iPad (Safari)
1. Ouvrir l'adresse du site.
2. Bouton Partager, puis « Sur l'écran d'accueil », puis Ajouter.
3. Lancer l'appli depuis l'icône : elle s'ouvre en plein écran et ses données sont mieux conservées.
4. Créer son pseudo, comme sur PC.

## À savoir
- **Une adresse = une identité.** Le profil et les amis sont rattachés à l'adresse du site. Si ton ami utilise `http://localhost:8080` sur PC et toi l'adresse Netlify, ce sont deux identités différentes : il faut vous ajouter comme amis, même si vous avez le même pseudo.
  Pour un cercle d'amis, le plus simple est que TOUT LE MONDE utilise la même adresse en ligne.
- **Ne pas effacer les données du site** dans Safari (Réglages > Safari > Effacer historique), sinon l'identité est perdue.
- **Mettre l'appli en arrière-plan** (changer d'appli, verrouiller l'écran) coupe la connexion. Elle revient toute seule au retour, et la partie reprend.
- Le site est public (n'importe qui qui connaît l'adresse peut l'ouvrir), mais il n'héberge aucune partie ni aucune donnée.
