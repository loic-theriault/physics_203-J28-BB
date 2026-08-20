#import "@preview/theorion:0.4.1": *
#import cosmos.rainbow: *
#show: show-theorion

// ===================== SESSION 10 =====================

#heading(level: 1)[Session 10 : Introduction à la Physique des Rotations]

#heading(level: 2)[Objectifs de la session]
- Passer de la *particule* (point sans dimension) au *corps rigide* (objet qui pivote).
- Comprendre le *couple*, le *moment d'inertie* et la *vitesse angulaire*.
- Relier les équations linéaires et angulaires — elles sont *analogues*.
- Modéliser la *friction de glissement vs roulement* — le cas de la boule de billard.
- Implémenter un corps rigide qui se déplace *et* tourne, avec intégration par quaternion.

#tip-box(title: "L'objectif du jour")[
  Depuis le début du cours, on traite les objets comme des *points* — une position, une vitesse, une masse. Mais un vrai objet ne fait pas que se déplacer : il *pivote* autour de son centre de masse. Une boule de billard roule, un cube tombe en basculant, un personnage s'effondre en pivotant. Cette session introduit les outils pour modéliser la rotation — et on le fait avec un cas concret : *la boule de billard*.
]

#heading(level: 2)[Partie 1 : Du Point au Corps Rigide]

#definition-box(title: "Particule vs corps rigide")[
  - *Particule* (sessions 1-9) : un point avec une masse $m$, une position $arrow(r)$, une vitesse $arrow(v)$. Pas d'orientation, pas de rotation. Toute la masse est concentrée en un point.
  - *Corps rigide* : un objet avec une *étendue spatiale*. Il a un *centre de masse* (G), une *orientation* (rotation), et une *répartition de masse* qui détermine comment il résiste à la rotation.

  Un corps rigide peut faire *deux choses simultanément* :
  + *Translater* — son centre de masse se déplace (comme une particule).
  + *Pivoter* — il tourne autour de son centre de masse.
]

#important-box(title: "L'hypothèse rigide")[
  On dit *rigide* parce que les points internes de l'objet ne bougent pas les uns par rapport aux autres — la forme ne se déforme pas. C'est une approximation : un vrai objet se déforme légèrement sous les forces. Mais pour une boule de billard, un cube de bois, un personnage en rigid body — c'est excellent.
]

#heading(level: 2)[Partie 2 : Le Dictionnaire Linéaire → Angulaire]

#important-box(title: "Tout ce que vous savez s'applique")[
  La physique de la rotation est *exactement parallèle* à la physique de la translation. Chaque concept linéaire a un équivalent angulaire. Si vous comprenez $arrow(F) = m arrow(a)$, vous comprenez $tau = I alpha$.
]

#figure(
  table(
    columns: (1.2fr, 1.5fr, 1.5fr),
    inset: 8pt,
    align: center + horizon,
    stroke: 0.5pt + gray,
    table.header([*Concept*], [*Linéaire*], [*Angulaire*]),
    [Position], [$arrow(r)$ (m)], [Angle $theta$ (rad) / Quaternion $q$],
    [Vitesse], [$arrow(v) = d dot arrow(r) \/ d t$ (m/s)], [$arrow(omega) = d dot arrow(theta) \/ d t$ (rad/s)],
    [Accélération], [$arrow(a)$ (m/s²)], [$arrow(alpha)$ (rad/s²)],
    [Résistance], [Masse $m$ (kg)], [Moment d'inertie $I$ (kg·m²)],
    [Cause du mouvement], [Force $arrow(F)$ (N)], [Couple $arrow(tau)$ (N·m)],
    [Loi du mouvement], [$arrow(F) = m arrow(a)$], [$arrow(tau) = I arrow(alpha)$],
    [Quantité de mouvement], [$arrow(p) = m arrow(v)$], [Moment angulaire $arrow(L) = I arrow(omega)$],
    [Énergie cinétique], [$1\/2 m v^2$], [$1\/2 I omega^2$],
  ),
  caption: [Analogie entre mouvement linéaire et rotation. Chaque équation linéaire a sa contrepartie angulaire — il suffit de remplacer les variables.]
) <linear-angular>

#tip-box(title: "Mémoriser le tableau")[
  La masse $m$ mesure la *résistance à la translation* — plus $m$ est grand, plus il est difficile d'accélérer. Le moment d'inertie $I$ mesure la *résistance à la rotation* — plus $I$ est grand, plus il est difficile de faire tourner. La force $arrow(F)$ cause la translation, le couple $arrow(tau)$ cause la rotation. *Tout le reste suit.*
]

#heading(level: 2)[Partie 3 : Le Couple (Torque)]

#definition-box(title: "Définition")[
  Le couple est l'équivalent angulaire de la force. Mais contrairement à une force, le couple dépend de *deux* choses :
  + La force appliquée $arrow(F)$.
  + Le *point d'application* — ou plus précisément, le *bras de levier* $arrow(r)$, la distance entre le centre de masse et le point où la force est appliquée.

  En 3D, le couple est un produit vectoriel :
  $ bold(arrow(tau) = arrow(r) times arrow(F)) $

  En 2D, il se simplifie à un scalaire :
  $ tau = r_x F_y - r_y F_x $
]

#important-box(title: "Pourquoi le point d'application compte")[
  Pousser une porte près de la charnière ne produit presque rien. Pousser la même porte avec la même force *au bout de la poignée* la fait pivoter facilement. La force est la même, mais le *bras de levier* est différent — et le couple est proportionnel au bras de levier.
]

#figure(
  image("images/torque_lever.svg", width: 85%),
  caption: [Le couple dépend du bras de levier. En haut : force au bout de la porte ($r$ grand, $tau$ grand). En bas : même force au milieu ($r\/2$, $tau$ divisé par 2). Pousser près du pivot produit peu de rotation.]
) <torque-lever>

#heading(level: 3)[Exemples intuitifs]

#definition-box(title: "Exemple 1 : La porte")[
  Une porte de $0.8$ "m" de large. On pousse avec $10$ "N" :
  - *Au bout* ($r = 0.8$) : $tau = 0.8 times 10 = 8$ "N"·"m". La porte s'ouvre facilement.
  - *Près de la charnière* ($r = 0.1$) : $tau = 0.1 times 10 = 1$ "N"·"m". La porte bouge à peine.
  - *Sur la charnière* ($r = 0$) : $tau = 0$. La porte ne tourne pas, peu importe la force.
]

#definition-box(title: "Exemple 2 : La clé")[
  Serrer un boulon avec une clé de $0.2$ "m" et une force de $50$ "N" perpendiculaire : $tau = 0.2 times 50 = 10$ "N"·"m". Si on ajoute un prolongateur de $0.4$ "m" : $tau = 0.4 times 50 = 20$ "N"·"m" — le double. C'est pourquoi les mécaniciens utilisent des clés longues.
]

#definition-box(title: "Exemple 3 : La boule de billard")[
  On frappe la boule avec une queue. Si on frappe *au centre* ($h = 0$), le bras de levier est nul — pas de couple, la boule glisse sans tourner. Si on frappe *haut* ($h > 0$), on crée un couple — la boule tourne. C'est le *top spin* (rotation vers l'avant). Si on frappe *bas* ($h < 0$), c'est le *back spin* (rotation vers l'arrière).
]

#figure(
  image("images/billiard_offcenter.svg", width: 70%),
  caption: [Coup de queue centré vs décentré sur une boule de billard. La hauteur d'impact $h$ détermine le bras de levier $r$ et donc le couple $tau = r times F$. Un coup centré ($h=0$) ne produit pas de rotation ; un coup haut produit du top spin ; un coup bas produit du back spin.]
) <billiard-offcenter>

#heading(level: 2)[Partie 4 : Le Moment d'Inertie]

#definition-box(title: "Définition")[
  Le moment d'inertie $I$ représente la *résistance d'un objet à la rotation* — exactement comme la masse résiste à la translation. Il dépend de la *répartition de la masse* par rapport à l'axe de rotation :
  $ I = sum_i m_i r_i^2 $
  où $m_i$ est la masse de chaque point et $r_i$ sa distance à l'axe. Plus la masse est *loin* de l'axe, plus $I$ est grand — et plus il est difficile de faire tourner.
]

#important-box(title: "L'intuition du patineur")[
  Un patineur qui tourne sur lui-même rapproche ses bras de son corps → il tourne *plus vite*. Pourquoi ? Parce que rapprocher les bras diminue $r_i$ pour les masses des bras, donc diminue $I$. Or le moment angulaire $L = I omega$ se *conserve* (pas de couple externe). Si $I$ diminue, $omega$ augmente — le patineur accélère. C'est la conservation du moment angulaire, l'équivalent de la conservation de quantité de mouvement.
]

#heading(level: 3)[Formules pour les formes courantes]

#figure(
  image("images/inertia_shapes.svg", width: 95%),
  caption: [Moments d'inertie pour des formes courantes autour de leur centre. Notez comment la masse répartie *loin* de l'axe (anneau) donne un $I$ plus grand que la masse concentrée au centre (disque).]
) <inertia-shapes>

#definition-box(title: "Cas courants (autour du centre de masse)")[
  - *Anneau mince* (masse sur le bord) : $I = m R^2$ — toute la masse est à distance $R$.
  - *Disque plein / cylindre* : $I = 1/2 m R^2$ — la masse est répartie de $0$ à $R$.
  - *Sphère pleine* : $I = 2/5 m R^2$ — la masse est répartie en 3D.
  - *Sphère creuse* : $I = 2/3 m R^2$ — masse concentrée sur la surface.
  - *Rectangle* (autour du centre, dans le plan) : $I = 1/12 m (w^2 + h^2)$.
  - *Tige fine* (autour du centre) : $I = 1/12 m L^2$.
  - *Tige fine* (autour d'une extrémité) : $I = 1/3 m L^2$.
]

#tip-box(title: "La boule de billard")[
  Une boule de billard est une *sphère pleine* de masse $m = 0.2$ "kg" et rayon $R = 0.5$ (unités de la démo) :
  $ I = 2/5 m R^2 = 2/5 times 0.2 times 0.25 = 0.02 "kg"·"m"^2 $
  C'est cette valeur que l'on utilise dans la démo `billiard.html`.
]

#heading(level: 3)[Le théorème des axes parallèles]

#definition-box(title: "Théorème de Huygens-Steiner")[
  Si on connaît $I_"cm"$ autour du centre de masse, on peut calculer $I$ autour de *n'importe quel axe parallèle* à une distance $d$ :
  $ I = I_"cm" + m d^2 $
  Exemple : une tige de masse $m$ et longueur $L$ a $I_"cm" = 1/12 m L^2$ autour de son centre. Autour d'une extrémité ($d = L/2$) :
  $ I = 1/12 m L^2 + m (L/2)^2 = 1/12 m L^2 + 1/4 m L^2 = 1/3 m L^2 $
  On retrouve la formule de la tige autour d'une extrémité. Le théorème *marche*.
]

#heading(level: 2)[Partie 5 : Vitesse d'un Point sur le Corps]

#important-box(title: "Le point crucial")[
  Quand un corps rigide se déplace *et* tourne, la vitesse de *chaque point* sur le corps est différente. Le centre de masse a une vitesse $arrow(v)_G$. Mais un point sur le bord a une vitesse *différente* — il subit la translation *plus* la rotation.
]

#definition-box(title: "Vitesse d'un point P")[
  Si un corps se déplace à $arrow(v)_G$ et tourne à $arrow(omega)$, la vitesse d'un point $P$ à la position $arrow(r)$ (relative au centre de masse) est :
  $ arrow(v)_P = arrow(v)_G + (arrow(omega) times arrow(r)) $

  En 2D, avec $arrow(r) = (r_x, r_y)$ et $arrow(omega) = omega$ (scalaire, perpendiculaire au plan) :
  $ v_(P.x) = v_(G.x) - omega dot r_y $
  $ v_(P.y) = v_(G.y) + omega dot r_x $
]

#figure(
  image("images/ball_contact_velocity.svg", width: 80%),
  caption: [Vitesse du point de contact $P$ sur une boule qui roule. Le centre $G$ se déplace à $arrow(v)_G$ (bleu). La rotation $arrow(omega)$ (vert) crée une vitesse $arrow(omega) times arrow(r)$ au point de contact (vert, vers l'arrière). La vitesse *réelle* du point de contact est $arrow(v)_P = arrow(v)_G + (arrow(omega) times arrow(r))$ (rouge). Si $arrow(v)_P != 0$, la boule *glisse*. Si $arrow(v)_P = 0$, la boule *roule sans glisser*.]
) <ball-contact>

#heading(level: 3)[Exemple : la boule qui glisse vs roule]

#definition-box(title: "Cas 1 : Glissement pur (pas de rotation)")[
  On frappe la boule au centre ($h = 0$) → pas de couple → $omega = 0$. La boule se déplace à $arrow(v)_G$ mais ne tourne pas. Au point de contact :
  $ arrow(v)_P = arrow(v)_G + (0 times arrow(r)) = arrow(v)_G $
  Le point de contact *avance* à la même vitesse que le centre. La boule *glisse* sur le tapis — le tapis frotte.
]

#definition-box(title: "Cas 2 : Roulement pur")[
  La boule tourne *assez vite* pour que le point de contact soit *immobile* par rapport au sol. Condition :
  $ arrow(v)_P = arrow(v)_G + (arrow(omega) times arrow(r)) = 0 $
  $ arrow(v)_G = -(arrow(omega) times arrow(r)) = arrow(omega) times (-arrow(r)) $

  En 2D, avec $arrow(r) = (0, -R)$ (contact en bas) :
  $ v_G = omega R $
  C'est la *condition de roulement sans glissement* : $v_G = omega R$. La boule avance exactement à la vitesse qu'il faut pour que le point de contact soit immobile.
]

#definition-box(title: "Cas 3 : Glissement + rotation (cas général)")[
  La boule a $arrow(v)_G$ *et* $omega$, mais $v_G != omega R$. Le point de contact a une vitesse *non nulle* — c'est la *vitesse de glissement*. La friction va agir pour *réduire* cette vitesse de glissement jusqu'à atteindre le roulement pur. C'est ce qu'on modélise dans la démo.
]

#heading(level: 2)[Partie 6 : Friction — Glissement vs Roulement]

#important-box(title: "Le cœur de la démo billard")[
  Quand la boule glisse (v_P != 0), le tapis exerce une *force de friction cinétique* qui s'oppose au glissement. Cette force fait *deux choses* simultanément :
  + Elle *ralentit* la translation (réduit $v_G$).
  + Elle *accélère* la rotation (augmente $omega$) — car la friction appliquée au point de contact crée un couple.

  La friction *converge* le système vers le roulement pur ($v_G = omega R$). Une fois le roulement atteint, la friction de glissement s'arrête — il ne reste que la *résistance au roulement* (beaucoup plus faible).
]

#figure(
  image("images/ball_slide_roll_phases.svg", width: 95%),
  caption: [Les trois phases d'une boule de billard. Phase 1 : glissement pur, $v_G >> omega R$, friction cinétique forte (ralentit $v_G$, accélère $omega$). Phase 2 : transition, $v_G approx omega R$, la friction de glissement devient nulle. Phase 3 : roulement pur, seule la résistance au roulement (très faible) décélère lentement la boule.]
) <slide-roll-phases>

#heading(level: 3)[La force de friction cinétique]

#definition-box(title: "Friction de glissement")[
  Quand la boule glisse, le tapis exerce une force de friction cinétique :
  $ arrow(F)_"friction" = -mu_"slide" dot m dot g dot hat(arrow(v)_P) $

  où :
  - $mu_"slide"$ : coefficient de friction cinétique (≈ $0.2$ pour un tapis de billard).
  - $m dot g$ : poids de la boule (force normale du sol).
  - $hat(arrow(v)_P)$ : direction de la vitesse de glissement (normalisée).

  La force est *opposée* à la vitesse de glissement — elle tend à *annuler* $arrow(v)_P$.
]

#definition-box(title: "Effet sur la translation")[
  La friction décélère le centre de masse :
  $ arrow(a)_G = arrow(F)_"friction" / m = -mu_"slide" dot g dot hat(arrow(v)_P) $
  L'accélération est *constante* en magnitude ($mu_"slide" dot g$) et opposée au glissement. La vitesse linéaire diminue.
]

#definition-box(title: "Effet sur la rotation")[
  La même force de friction, appliquée au point de contact, crée un *couple* :
  $ arrow(tau) = arrow(r) times arrow(F)_"friction" $
  où $arrow(r) = (0, -R, 0)$ (du centre vers le contact). Ce couple *accélère* la rotation :
  $ arrow(alpha) = arrow(tau) / I $

  Pour une sphère pleine ($I = 2/5 m R^2$) avec friction horizontale $F$ :
  $ alpha = (R dot F) / (2/5 m R^2) = (5 F) / (2 m R) $
  La rotation augmente — la boule se met à tourner *plus vite*.
]

#important-box(title: "La friction fait deux choses opposées")[
  Paradoxalement, la *même* force de friction :
  - *Ralentit* la translation ($v_G$ diminue).
  - *Accélère* la rotation ($omega$ augmente).

  C'est exactement ce qu'il faut pour converger vers $v_G = omega R$ : $v_G$ descend, $omega$ monte, jusqu'à se rencontrer. C'est la beauté de la physique du roulement.
]

#heading(level: 3)[La résistance au roulement]

#definition-box(title: "Friction de roulement")[
  Une fois le roulement pur atteint ($v_P = 0$), il n'y a plus de glissement — la friction cinétique s'annule. Mais la boule finit quand même par s'arrêter. Pourquoi ?

  La *résistance au roulement* est un effet différent : la déformation microscopique du tapis sous la boule crée une force *très faible* qui décélère la boule. On la modélise simplement :
  $ arrow(v) *= (1 - mu_"roll" dot d t dot k) $
  où $mu_"roll"$ est très petit (≈ $0.02$) et $k$ un facteur empirique. C'est un *amortissement* simple, pas une vraie force de friction.
]

#tip-box(title: "Dans la démo billiard.html")[
  Le code distingue les deux modes :
  ```javascript
  if (slideSpeed > 0.05) {
      // Mode glissement : friction cinétique
      // - Ralentit v_G (linéaire)
      // - Accélère omega (couple)
  } else {
      // Mode roulement : résistance simple
      // - Amortit v et omega ensemble
  }
  ```
  Le seuil `0.05` est la tolérance — en dessous, on considère que $v_P approx 0$ et on passe en mode roulement.
]

#heading(level: 2)[Partie 7 : Intégration de la Rotation]

#definition-box(title: "Le problème de l'orientation")[
  En translation, on intègre : $arrow(v) += arrow(a) dot d t$, puis $arrow(r) += arrow(v) dot d t$. Simple.

  En rotation, c'est pareil pour la vitesse angulaire : $arrow(omega) += arrow(alpha) dot d t$. Mais pour l'*orientation* — comment on met à jour l'angle ? En 2D, $theta += omega dot d t$ suffit. En 3D, c'est plus subtil.
]

#heading(level: 3)[2D : angle scalaire]

#definition-box(title: "Rotation 2D")[
  En 2D, la rotation est un simple angle scalaire $theta$ :
  ```javascript
  angularVelocity += (torque / inertia) * dt;
  angle += angularVelocity * dt;
  ```
  On peut utiliser `ctx.rotate(angle)` pour le rendu. Simple et suffisant pour un jeu 2D.
]

#heading(level: 3)[3D : quaternions]

#important-box(title: "Pourquoi pas les angles d'Euler ?")[
  En 3D, on *pourrait* utiliser trois angles (Euler : lacet, tangage, roulis). Mais les angles d'Euler souffrent du *gimbal lock* — une perte d'un degré de liberté quand deux axes s'alignent. De plus, interpoler entre deux orientations Euler donne des rotations *non naturelles* (le chemin le plus court n'est pas pris).

  Les *quaternions* résolvent ces problèmes. Un quaternion $q = (w, x, y, z)$ représente une rotation de $w$ radians autour de l'axe $(x, y, z)$ normalisé. Pas de gimbal lock, interpolation naturelle (slerp).
]

#definition-box(title: "Intégration par quaternion")[
  Pour intégrer la rotation en 3D :
  + Calculer l'axe et l'angle de rotation ce frame : $arrow("axis") = hat(arrow(omega))$, $angle = |arrow(omega)| dot d t$.
  + Créer un quaternion de rotation : $q_"delta" = "setFromAxisAngle"(arrow("axis"), angle)$.
  + Multiplier avec l'orientation actuelle : $q_"new" = q_"delta" dot q_"old"$.

  ```javascript
  const axis = angularVelocity.clone().normalize();
  const angle = angularVelocity.length() * dt;
  if (angle > 1e-6) {
      const dq = new THREE.Quaternion().setFromAxisAngle(axis, angle);
      quaternion.premultiply(dq);  // q_new = dq * q_old
  }
  ```
  Le `premultiply` applique la rotation dans le *repère monde* — si on voulait la rotation dans le repère *local* de l'objet, on utiliserait `multiply`.
]

#tip-box(title: "Euler explicite pour la rotation")[
  Comme pour la translation, on utilise *Euler explicite* pour la rotation :
  $ arrow(omega)_"new" = arrow(omega) + (arrow(tau) / I) dot d t $
  $ q_"new" = "quat"(hat(arrow(omega)) , |arrow(omega)| dot d t) dot q_"old" $

  Les mêmes problèmes de stabilité s'appliquent — Euler dérive en énergie. Mais pour une boule de billard qui s'arrête en quelques secondes (forte dissipation), c'est parfaitement adapté. Pour un satellite en orbite pendant des heures (pas de dissipation), il faudrait un intégrateur symplectique.
]

#heading(level: 2)[Partie 8 : La Démo — Billard (billiard.html)]

#tip-box(title: "La démo")[
  Ouvrir `examples/billiard.html` dans un navigateur. La démo simule une boule de billard sur un tapis, avec :
  - Un coup de queue paramétrable (force + hauteur d'impact).
  - La distinction glissement vs roulement.
  - La friction cinétique qui ralentit $v_G$ et accélère $omega$.
  - La résistance au roulement qui arrête lentement la boule.
  - Des flèches de visualisation : vitesse $arrow(v)_G$ (bleu) et vitesse de glissement $arrow(v)_P$ (rouge).
]

#heading(level: 3)[Anatomie du code]

#definition-box(title: "État physique")[
  ```javascript
  const physicsState = {
      pos: new THREE.Vector3(-4, BALL_RADIUS, 0),   // position du centre de masse
      vel: new THREE.Vector3(0, 0, 0),              // v_G (vitesse linéaire)
      angVel: new THREE.Vector3(0, 0, 0),           // ω (vitesse angulaire)
      quat: new THREE.Quaternion(),                 // orientation (quaternion)
      isSliding: false                              // mode : glissement vs roulement
  };
  ```
  C'est le *corps rigide* — position, vitesse linéaire, vitesse angulaire, orientation. Exactement le dictionnaire de la Partie 2.
]

#definition-box(title: "Le coup de queue (impulsion)")[
  ```javascript
  function shootBall() {
      resetGame();
      syncFromParams();

      // 1. Impulsion linéaire : v_G = F / m
      const direction = new THREE.Vector3(1, 0, 0);
      const linearSpeed = IMPULSE_FORCE / BALL_MASS;
      physicsState.vel.copy(direction.multiplyScalar(linearSpeed));

      // 2. Impulsion angulaire : τ = r × F  →  ω = τ / I
      //    r = (0, h, 0) est le bras de levier (hauteur d'impact)
      const r = new THREE.Vector3(0, IMPACT_HEIGHT, 0);
      const F = new THREE.Vector3(IMPULSE_FORCE, 0, 0);
      const torqueImpulse = new THREE.Vector3().crossVectors(r, F);
      physicsState.angVel.copy(torqueImpulse.divideScalar(INERTIA));
  }
  ```
  Deux choses se passent :
  + La force donne une vitesse linéaire $v = F / m$.
  + Le couple $tau = r times F$ donne une vitesse angulaire $omega = tau / I$.

  Le paramètre `impactHeight` ($h$) contrôle le bras de levier — c'est la *hauteur* où la queue frappe la boule. À $h = 0$ (centre), pas de rotation. À $h > 0$, top spin. À $h < 0$, back spin.
]

#definition-box(title: "Le calcul du glissement")[
  ```javascript
  // Vecteur du centre vers le point de contact : r = (0, -R, 0)
  const rVector = new THREE.Vector3(0, -BALL_RADIUS, 0);

  // Vitesse du point de contact : v_P = v_G + (ω × r)
  const rotationalVelAtPoint = new THREE.Vector3()
      .crossVectors(omega, rVector);
  const slideVel = new THREE.Vector3()
      .addVectors(v, rotationalVelAtPoint);
  slideVel.y = 0;   // on ignore la composante verticale

  const slideSpeed = slideVel.length();
  ```
  C'est *exactement* la formule de la Partie 5 : $arrow(v)_P = arrow(v)_G + (arrow(omega) times arrow(r))$. Si `slideSpeed > SLIDE_THRESHOLD`, la boule glisse. Sinon, elle roule.
]

#definition-box(title: "La friction (mode glissement)")[
  ```javascript
  if (slideSpeed > SLIDE_THRESHOLD) {
      // Force de friction : opposée à la vitesse de glissement
      const frictionDir = slideVel.clone().normalize().negate();
      const frictionMag = MU_SLIDE * BALL_MASS * GRAVITY;
      const frictionForce = frictionDir.multiplyScalar(frictionMag);

      // A. Effet linéaire : ralentit v_G
      const linearAcc = frictionForce.clone().divideScalar(BALL_MASS);
      v.addScaledVector(linearAcc, dt);

      // B. Effet angulaire : τ = r × F  →  accélère ω
      const torque = new THREE.Vector3()
          .crossVectors(rVector, frictionForce);
      const angularAcc = torque.divideScalar(INERTIA);
      omega.addScaledVector(angularAcc, dt);
  }
  ```
  La friction fait *deux choses* :
  + *A.* Décélère $v_G$ (la boule ralentit linéairement).
  + *B.* Crée un couple $tau = r times F$ qui *accélère* $omega$ (la boule tourne plus vite).

  C'est la convergence vers $v_G = omega R$ — la boule passe du glissement au roulement.
]

#definition-box(title: "La résistance (mode roulement)")[
  ```javascript
  } else {
      // Décroissance exponentielle : frame-rate independent
      const dragFactor = Math.exp(-MU_ROLL * dt);
      v.multiplyScalar(dragFactor);

      // Friction statique à basse vitesse : garantit l'arrêt
      // (l'exponentielle seule n'atteint jamais zéro)
      const speed = v.length();
      if (speed > 0) {
          const staticDrag = 0.2 * dt;   // décélération constante (m/s²)
          const newSpeed = Math.max(0, speed - staticDrag);
          v.multiplyScalar(newSpeed / speed);
      }

      // Contraindre ω à la condition de roulement : v_G = ω × r
      // (évite l'oscillation glissement↔roulement)
      omega.set(v.z / BALL_RADIUS, 0, -v.x / BALL_RADIUS);

      // Seuil d'arrêt
      if (v.lengthSq() < 0.02) {
          v.set(0, 0, 0);
          omega.set(0, 0, 0);
      }
  }
  ```
  Trois choses se passent en mode roulement :
  + *Décroissance exponentielle* — la résistance au roulement ralentit $v_G$ de façon continue ($exp(-mu_r dot d t)$). Frame-rate independent.
  + *Friction statique* — une décélération *constante* qui garantit l'arrêt (l'exponentielle seule n'atteint jamais zéro, seulement asymptotiquement).
  + *Contrainte de roulement* — on recalcule $omega$ depuis $v_G$ pour maintenir $v_G = omega R$ *exactement*. Sans cela, les erreurs de virgule flottante font osciller la boule entre glissement et roulement.
]

#definition-box(title: "L'intégration (position + orientation)")[
  ```javascript
  // Position : r += v * dt  (Euler)
  physicsState.pos.addScaledVector(v, dt);

  // Orientation : quaternion (Partie 7)
  const axis = omega.clone().normalize();
  const angle = omega.length() * dt;
  if (angle > 1e-6) {
      const q = new THREE.Quaternion()
          .setFromAxisAngle(axis, angle);
      physicsState.quat.premultiply(q);   // q_new = dq * q_old
  }
  ```
  Translation en Euler, rotation en quaternion. Le seuil `1e-6` évite les calculs inutiles quand $omega approx 0$.
]

#definition-box(title: "Collisions avec les murs")[
  ```javascript
  let hitWall = false;
  if (pos.x > halfX)  { pos.x = halfX;  v.x *= -0.8; hitWall = true; }
  if (pos.x < -halfX) { pos.x = -halfX; v.x *= -0.8; hitWall = true; }
  if (pos.z > halfZ)  { pos.z = halfZ;  v.z *= -0.8; hitWall = true; }
  if (pos.z < -halfZ) { pos.z = -halfZ; v.z *= -0.8; hitWall = true; }

  // Après un rebond, recalculer ω pour maintenir la condition de roulement
  // (sinon v_G et ω sont désynchronisés → re-glissement parasite)
  if (hitWall) {
      omega.set(v.z / BALL_RADIUS, 0, -v.x / BALL_RADIUS);
  }
  ```
  Le rebond inverse la vitesse ($times -0.8$ : 20% de perte d'énergie), mais *sans* mettre à jour $omega$, la condition $v_G = omega R$ est cassée — la boule re-entre en mode glissement au frame suivant. On resynchronise $omega$ immédiatement après le rebond.
]

#heading(level: 3)[Expériences à essayer]

#definition-box(title: "Manipulations")[
  + *Coup centré* ($h = 0$) : la boule glisse sans tourner. Observer la flèche rouge (vitesse de glissement) — elle est égale à $v_G$. La friction met du temps à faire rouler la boule.

  + *Coup haut* ($h = +0.3$) : top spin. La boule tourne vers l'avant. Si $omega R > v_G$, le point de contact va *vers l'arrière* — la friction *accélère* la boule ! (Effet de "rattrapage" du top spin.)

  + *Coup bas* ($h = -0.3$) : back spin. La boule tourne vers l'arrière. Le point de contact va *vers l'avant* — la friction *décélère* la boule plus vite. Observer la boule qui recule après s'être arrêtée (effet de "retour" du back spin).

  + *Force faible* ($F = 2$) vs *force forte* ($F = 15$) : la force change $v_G$ mais pas $omega$ (si $h$ est le même). Observer comment la *durée* du glissement change — plus de glissement = plus de temps avant le roulement.

  + *Friction glissement* ($mu_s = 0$) : la boule glisse indéfiniment sans jamais se mettre à rouler (surface de glace). À $mu_s = 2$, elle se met à rouler presque instantanément.

  + *Friction roulement* ($mu_r = 0$) : une fois en roulement, la boule ne s'arrête jamais (roulement parfait). À $mu_r = 0.5$, elle s'arrête très vite.

  + *Vitesse temps* ($0.1$) : ralentir la simulation pour observer la transition glissement → roulement en détail. La flèche rouge (glissement) rétrécit jusqu'à disparaître, puis la boule roule.
]

#heading(level: 2)[Partie 9 : TP — Corps Rigide 2D]

#tip-box(title: "Objectif du TP")[
  Implémenter un *corps rigide 2D* — un rectangle qui se déplace *et* tourne quand on clique dessus. Le principe est le même que la boule de billard, mais en 2D avec un angle scalaire au lieu d'un quaternion.
]

#heading(level: 3)[Étape 1 : Classe RigidBody]

Ajouter les propriétés angulaires à un objet qui a déjà `position`, `velocity`, `mass` :
```javascript
class RigidBody {
    constructor(width, height, mass) {
        // --- Linéaire (déjà vu) ---
        this.pos = new Vector2(0, 0);
        this.vel = new Vector2(0, 0);
        this.mass = mass;
        this.force = new Vector2(0, 0);  // accumulateur

        // --- Angulaire (nouveau) ---
        this.angle = 0;                  // θ (radians)
        this.angularVelocity = 0;        // ω (rad/s)
        this.torque = 0;                 // τ (accumulateur)
        // Moment d'inertie d'un rectangle : I = (1/12) m (w² + h²)
        this.inertia = (1/12) * mass * (width*width + height*height);
    }
}
```

#heading(level: 3)[Étape 2 : ApplyForce(force, worldPoint)]

#definition-box(title: "La méthode clé")[
  ```javascript
  applyForce(force, worldPoint) {
      // 1. Force linéaire : F_total += F
      this.force.x += force.x;
      this.force.y += force.y;

      // 2. Couple : τ = r_x * F_y - r_y * F_x
      const r = {
          x: worldPoint.x - this.pos.x,
          y: worldPoint.y - this.pos.y
      };
      this.torque += r.x * force.y - r.y * force.x;
  }
  ```
  On accumule les forces et les couples pendant la frame, puis on les applique dans l'intégrateur. Le bras de levier $arrow(r)$ est la distance entre le centre de masse et le point d'application.
]

#heading(level: 3)[Étape 3 : L'intégrateur]

#definition-box(title: "Euler explicite — linéaire + angulaire")[
  ```javascript
  update(dt) {
      // --- Linéaire ---
      const ax = this.force.x / this.mass;
      const ay = this.force.y / this.mass;
      this.vel.x += ax * dt;
      this.vel.y += ay * dt;
      this.pos.x += this.vel.x * dt;
      this.pos.y += this.vel.y * dt;

      // --- Angulaire ---
      const alpha = this.torque / this.inertia;
      this.angularVelocity += alpha * dt;
      this.angle += this.angularVelocity * dt;

      // --- Reset accumulateurs ---
      this.force.x = 0; this.force.y = 0;
      this.torque = 0;
  }
  ```
  Exactement le même schéma qu'Euler en translation — juste *dupliqué* pour la rotation. C'est la beauté de l'analogie linéaire/angulaire.
]

#heading(level: 3)[Étape 4 : Interaction souris]

#definition-box(title: "Cliquer pour pousser")[
  ```javascript
  canvas.addEventListener('click', (e) => {
      const mousePos = getMousePos(e);          // position souris (world)
      const forceDir = {
          x: mousePos.x - body.pos.x,           // direction : vers la souris
          y: mousePos.y - body.pos.y
      };
      const magnitude = 500;                     // force arbitraire
      const len = Math.hypot(forceDir.x, forceDir.y);
      const force = {
          x: (forceDir.x / len) * magnitude,
          y: (forceDir.y / len) * magnitude
      };
      body.applyForce(force, mousePos);          // applique au point cliqué
  });
  ```
  Le point d'application est la *position de la souris* — si on clique loin du centre, on crée un *couple* et le rectangle tourne. Si on clique près du centre, il se déplace sans tourner. C'est l'équivalent du `impactHeight` de la démo billard.
]

#heading(level: 3)[Étape 5 : Rendu]

#definition-box(title: "Dessiner le rectangle pivoté")[
  ```javascript
  function draw() {
      ctx.save();
      ctx.translate(body.pos.x, body.pos.y);   // aller au centre
      ctx.rotate(body.angle);                   // pivoter
      ctx.fillRect(-w/2, -h/2, w, h);           // dessiner centré
      ctx.restore();
  }
  ```
  En Canvas 2D, on utilise `ctx.translate` + `ctx.rotate` pour positionner et orienter le rectangle. L'ordre est important : *d'abord* translater, *ensuite* pivoter.
]

#heading(level: 2)[Partie 10 : Récapitulatif — Le Corps Rigide Complet]

#figure(
  table(
    columns: (1.3fr, 1fr, 1fr, 1fr),
    inset: 7pt,
    stroke: 0.5pt + gray,
    table.header([*Phase*], [*Linéaire*], [*Angulaire*], [*Code*]),
    [Accumuler], [$arrow(F) += arrow(F)_"appliquée"$], [$tau += r times F$], [`applyForce()`],
    [Intégrer], [$arrow(v) += (arrow(F)\/m) dot d t$], [$arrow(omega) += (tau\/I) dot d t$], [`update()`],
    [Déplacer], [$arrow(r) += arrow(v) dot d t$], [$theta += omega dot d t$ / $q$], [`update()`],
    [Reset], [$arrow(F) = 0$], [$tau = 0$], [`update()` fin],
  ),
  caption: [Le cycle complet d'un corps rigide. Chaque frame : accumuler les forces et couples, intégrer (Euler), mettre à jour position et orientation, réinitialiser les accumulateurs.]
)

#important-box(title: "Ce qu'on retient")[
  + Un corps rigide a *deux* dynamiques — linéaire et angulaire — parfaitement *analogues*.
  + Le couple $tau = r times F$ dépend du *point d'application* — pas seulement de la force.
  + Le moment d'inertie $I$ dépend de la *répartition de masse* — pas seulement de la masse totale.
  + La vitesse d'un point $arrow(v)_P = arrow(v)_G + (arrow(omega) times arrow(r))$ est la clé du glissement vs roulement.
  + La friction de glissement *converge* vers le roulement en ralentissant $v_G$ et en accélérant $omega$ simultanément.
  + L'intégration de la rotation utilise des *quaternions* en 3D (pas de gimbal lock) et un *angle scalaire* en 2D.
]
