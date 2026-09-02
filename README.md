# Matter Logic

Un mod Sandustry qui ajoute deux structures logiques : un **capteur qui compte les
éléments par type**, et un **combinateur à conditions** façon Factorio qui traduit
ces comptes en un signal 0/1 exploitable par tout le réseau de signaux du jeu. Les
deux se câblent avec le Relieur de signaux natif.

## Ce que le mod ajoute

### Analyseur de matière (`matterScanner`)

- Compte **chaque type d'élément** présent dans sa zone de 4 × 4 (les capteurs
  natifs ne savent dire que « pleine » ou « non vide »).
- Se relie à un combinateur avec le **Relieur de signaux** natif, comme n'importe
  quel émetteur du jeu.
- Émet aussi un signal classique tant que sa zone contient quelque chose, ce qui
  permet de l'utiliser seul comme capteur de présence.
- Clic d'interaction : ouvre un panneau montrant ses relevés en direct.

### Combinateur de conditions (`conditionCombinator`)

- Additionne les relevés de **tous les analyseurs qui lui sont reliés** — plusieurs
  câbles entrants s'additionnent, comme les fils d'un réseau Factorio.
- Liste jusqu'à **8 conditions** de la forme `élément × opérateur × valeur`, avec
  les opérateurs `=`, `≠`, `>`, `≥`, `<`, `≤`.
- Combine ces conditions en **TOUTES** (ET) ou **AU MOINS UNE** (OU).
- Sort un **signal booléen** sur le réseau natif : reliez-le vers un sas, une
  diode, une porte AND, ce que vous voulez.
- Clic d'interaction : ouvre le panneau d'édition, modifiable à tout moment après
  la pose. Chaque ligne affiche la valeur courante à côté de sa condition, et
  l'en-tête indique combien d'analyseurs sont reliés.

L'exemple qui a motivé le mod — « si sable rouge = 4 **et** pétale = 4 » — se pose
ainsi : deux analyseurs (l'un sur le tas de sable rouge, l'autre sur les pétales),
chacun relié au combinateur avec le Relieur de signaux, puis le combinateur en mode
TOUTES avec `sandium · ≥ · 4` et `petalium · ≥ · 4`.

Le câblage se fait dans le sens habituel du jeu : **cliquez l'analyseur d'abord**
(l'émetteur), **puis le combinateur** (le récepteur).

Les deux structures se débloquent avec la techno **Portes logiques**
(`Tech.LogicGates`), aux côtés des portes natives.

## Comment les comptes circulent

Le fil du jeu ne transporte qu'un booléen : il ne peut pas porter les comptes
eux-mêmes. Le combinateur lit donc directement la table de liens du module de
signaux (`api.storage.ensure("signals").links`, la même que le Relieur écrit et
que les capteurs natifs relisent au chargement d'une partie) pour savoir quels
analyseurs le nourrissent, puis va lire leurs relevés. Le câble sert de
déclaration de branchement ; les valeurs, elles, ne transitent pas dessus.

Conséquence pratique : rien n'est à maintenir de notre côté. Déplacer, détruire
ou recâbler un analyseur est pris en compte immédiatement, y compris après un
rechargement de sauvegarde.

## Installation

Depuis la **0.5.5**, Sandustry charge les mods Sandkit nativement : plus besoin de
Fluxloader. Tout sous-dossier du dossier de mods contenant un `modinfo.json`
valide est découvert au démarrage.

1. Lancez le jeu une fois (via Steam) pour qu'il crée son dossier de données.
2. Copiez ce dossier dans le dossier de mods :

   ```bash
   mkdir -p ~/.config/sandustry/mods/matter-logic
   cd ~/sandustry-mods/sensor
   cp -r main.js modinfo.json preview.png README.md assets \
     ~/.config/sandustry/mods/matter-logic/
   ```

   Le dossier `test/` reste volontairement hors du dossier de mods : la
   publication Workshop envoie le dossier entier.

   Depuis le jeu, le menu des mods propose aussi un bouton qui ouvre directement
   ce dossier (« Local developer mods »).

3. Relancez le jeu. Les deux structures apparaissent dans la catégorie **Logique**
   du menu de construction, une fois la techno **Portes logiques** recherchée.

> **Copiez, ne faites pas de lien symbolique.** Le chargeur résout les chemins
> réels et rejette tout dossier qui pointe hors du dossier de mods
> (`local_mod_folder_outside_root`).

Si `~/.config/sandustry` n'existe pas après un lancement, cherchez le dossier
réellement utilisé :

```bash
ls -d ~/.config/*andustry*
```

## Publication sur le Workshop

Le jeu publie lui-même les mods locaux, il n'y a pas d'outil externe à installer.

1. Lance Sandustry **depuis Steam** (Steam doit être disponible pour l'envoi).
2. Menu **Mods** → section **Mods locaux chargés** → bouton **Publier** en face de
   *Matter Logic*.
3. À la première publication, Steam crée l'article et le jeu écrit un
   `workshop.json` dans le dossier du mod. **Ne le supprime pas et ne le modifie
   pas** : c'est lui qui relie le dossier à l'article, et sans lui une nouvelle
   publication créerait un doublon.
4. Le premier envoi est **non répertorié** (*unlisted*). Pour le rendre public,
   ouvre l'article sur Steam (bouton **Ouvrir l'article du Workshop**), accepte
   les mentions légales du Workshop si demandé, puis passe la visibilité sur
   *Public*.

Ce que Steam affiche vient du manifeste : le titre reprend `name`, la description
reprend `description`, et la note de version reprend `version`. `preview.png` sert
de vignette — elle est **obligatoire**, la publication échoue sans elle.

### Publier une mise à jour

Incrémente `version` dans `modinfo.json`, resynchronise le dossier (commande
ci-dessus — elle laisse `workshop.json` en place), relance le jeu, puis
**Publier** à nouveau. Ne change jamais `id` après la première publication.

Limites appliquées par le validateur : 64 Ko par manifeste, 1 Mo par fichier `.js`,
16 Mo par texture.

## Configuration

`modinfo.json` expose deux réglages dans le menu des mods :

| Réglage | Défaut | Effet |
| --- | --- | --- |
| `scanIntervalMs` | 250 | Fréquence de recomptage et de réévaluation. Pris en compte au redémarrage. |
| `showZoneOverlay` | activé | Rafraîchissement en direct des relevés dans le panneau. |

## Tests

La logique de comptage, d'agrégation par canal et d'évaluation des conditions est
couverte par un harnais qui exécute `main.js` contre une API Sandkit simulée :

```bash
cd "$HOME/.local/share/Steam/steamapps/common/Sandustry"
ELECTRON_RUN_AS_NODE=1 ./sandustry ~/sandustry-mods/sensor/test/logic.test.js
```

(Le binaire du jeu embarque Node 20 ; `node test/logic.test.js` fonctionne aussi
si vous avez Node installé.)

Le harnais ne couvre pas le panneau React ni le rendu des sprites — cela demande
un lancement réel du jeu.

## Notes d'implémentation

- Le comptage tourne dans `api.structures.processing.register`, une passe par
  structure toutes les 250 ms : 16 lectures de cellule par analyseur.
- La source de vérité sur le câblage est toujours la table de liens du module de
  signaux, jamais un registre interne : un relevé laissé par un analyseur détruit
  ne peut donc pas polluer un total.
- Un combinateur évalué avant que ses analyseurs n'aient rescanné lit les valeurs
  du cycle précédent, soit un retard maximal de `scanIntervalMs`.
- Sans condition, un combinateur reste éteint plutôt que de valoir « vrai ».
