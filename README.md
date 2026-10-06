# Cavalia

_Anciennement « Mon espace équin »._

Application web (PWA) de suivi de chevaux : rendez-vous, finances, planning d'activités et fiche.
HTML/CSS/JavaScript purs (modules ES, sans étape de build) + Firebase gratuit (Auth e-mail et Realtime Database).

## Structure

```
index.html              structure de l'application
css/                    tokens, thème (cuir/cognac), base, composants, mise en page, vues
js/core/                utilitaires, dates, validation, schéma des données, store local
js/services/            Firebase (auth + synchronisation fine), stockage local
js/features/            export calendrier .ics (iPhone)
js/ui/                  icônes, toasts, fenêtres, thème, statut, graphiques
js/views/               accueil, finances, planning, fiche
database.rules.json     règles Realtime Database (chaque compte ne voit que ses données)
```

## Données

- Local : `localStorage`, clés `mon_espace_equin_v1_*` (compatibles avec l'ancienne version).
- Cloud : `users/<uid>/app`, écritures clé par clé ; les modifications faites hors ligne sont renvoyées à la reconnexion.
- Mode hors ligne disponible si Firebase est injoignable.

## Hors ligne (PWA)

`sw.js` pré-met en cache l'app-shell (HTML/CSS/JS/icônes) à l'installation : l'app s'ouvre même sans réseau (utile à l'écurie), y compris dès le tout premier lancement hors ligne. Il vérifie aussi à chaque ouverture si les fichiers ont changé sur le serveur, pour afficher la dernière version publiée sans attendre l'expiration du cache.

## Rappels récurrents

Sur un rendez-vous (vétérinaire, vaccination, vermifuge…), le champ « Rappel » permet de fixer une périodicité (1, 3, 6 ou 12 mois). Tant qu'aucun nouveau rendez-vous du même type n'est planifié, l'échéance calculée (date + périodicité) apparaît dans « Rappels à venir » sur l'accueil dès qu'elle tombe dans les 30 prochains jours (ou est dépassée). Un bouton « Planifier » ouvre directement le formulaire pré-rempli.

## Suivi des cures (Fiche)

Section « Cures en cours » de la fiche du cheval : compléments, traitements vétérinaires, vermifuges, phytothérapie…
- Chaque cure : produit, type, début, fin (facultative), posologie, note.
- Seules les cures en cours (et celles qui vont commencer) sont affichées, avec le jour de cure et une barre de progression quand la fin est connue.
- « Terminer aujourd'hui » clôt la cure ; les cures terminées restent consultables dans « Historique des cures » (repliable), et se modifient ou se suppriment d'un appui.
- Données : `horse_<id>_cures`, synchronisées comme le reste.

## Test local

```
python3 -m http.server 8000
```
puis ouvrir http://localhost:8000.

## Déploiement

Un push sur `main` déploie automatiquement sur Firebase Hosting (`.github/workflows/firebase-hosting.yml`).
