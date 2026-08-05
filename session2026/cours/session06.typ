#import "@preview/theorion:0.4.1": *
#import cosmos.rainbow: *
#show: show-theorion

// ===================== SESSION 06 =====================

#heading(level: 1)[Session 6 : L’impulsion, les collisions]

#heading(level: 2)[Objectifs de la session]
- Comprendre l'impulsion comme changement de quantité de mouvement.
- Apprendre la loi de restitution et la vitesse relative.
- Calculer l'impulsion d'une collision entre deux objets.
- Implémenter un laboratoire de chocs 1D.

#heading(level: 3)[1. La Quantité de Mouvement]

#definition-box(title: "Quantité de mouvement (p)")[
  La quantité de mouvement est le produit de la masse par la vitesse d'un objet :
  $ arrow(p) = m dot arrow(v) $

  - C'est une grandeur *vectorielle* : elle a la même direction que la vitesse.
  - Unité SI : $"kg" dot "m/s"$.
  - Elle mesure "combien de mouvement" porte un objet — un camion lent et une balle rapide peuvent avoir la même quantité de mouvement.
]

#tip-box(title: "Conservation de la quantité de mouvement")[
  Dans un système isolé (sans forces externes), la quantité de mouvement *totale* est conservée :
  $ arrow(p)_"totale" = arrow(p)_A + arrow(p)_B = "constante" $

  C'est la loi fondamentale qui gouverne les collisions : ce qui est perdu par un objet est gagné par l'autre.
]

#heading(level: 3)[2. D'où vient l'Impulsion ?]

#definition-box(title: "Théorème de l'Impulsion")[
  La force est liée à la variation de la vitesse (si la masse est constante) :
  $ arrow(F) = m dot (d arrow(v)) / (d t) $

  Comme $arrow(p) = m dot arrow(v)$, cela s'écrit aussi :
  $ arrow(F) = (d arrow(p)) / (d t) $

  En intégrant sur un choc instantané ($Delta t approx 0$) :
  $ arrow(J) = Delta arrow(p) = m dot Delta arrow(v) $
]

#definition-box(title: "Comment un choc bref change-t-il la vitesse si vite ?")[
  D'après $arrow(F) = m dot (d arrow(v)) / (d t)$, on isole la variation de vitesse :
  $ Delta arrow(v) = (arrow(F) dot Delta t) / m $

  Si $Delta t$ est très petit (un choc quasi instantané), il faut une force *énorme* pour produire un $Delta arrow(v)$ significatif. Mais le produit $arrow(F) dot Delta t$ reste fini — c'est l'impulsion $arrow(J)$.

  - *Exemple :* Une balle de tennis frappée par une raquette. Le contact dure $approx 5$ ms, mais la force atteint $approx 1000$ N. L'impulsion vaut $arrow(J) = 1000 dot 0.005 = 5$ $"kg" dot "m/s"$ — assez pour faire passer la balle de $0$ à $50$ m/s.
  - L'accélération est bel et bien gigantesque ($a = F/m approx 20 000$ m/s²), mais elle ne dure qu'un instant. Ce qui compte, c'est le *produit* $F dot Delta t$, pas la force seule.
]

#tip-box(title: "Intuition clé")[
  Ce n'est pas la force seule qui change la vitesse, ni le temps seul. C'est leur *produit* — l'impulsion. Une petite force appliquée longtemps peut produire le même changement de vitesse qu'une force énorme appliquée très brièvement.
]

#important-box(title: "Pourquoi on n'utilise pas Euler pour les collisions")[
  La méthode d'Euler (Session 5) calcule $Delta arrow(v) = arrow(a) dot Delta t$ à chaque pas de temps. Mais lors d'un choc, la force (et donc l'accélération) est énorme et dure un temps négligeable. Avec $Delta t approx 0.016$ s, soit on rate complètement le choc (l'objet traverse), soit on surestime grossièrement la force. Au lieu de simuler la force frame par frame, on *saute directement au résultat* : on applique l'impulsion $arrow(J)$ qui change la vitesse instantanément.
]

#heading(level: 3)[3. La Loi de Restitution]

#definition-box(title: "Coefficient de restitution (e)")[
  La vitesse à laquelle deux objets s'éloignent après un choc est proportionnelle à la vitesse à laquelle ils se rapprochaient avant le choc.
  $ v_"rel" ("après") = -e dot v_"rel" ("avant") $
]

- $e = 1$ : choc élastique (billes de billard).
- $e = 0$ : choc mou (pâte à modeler).

#heading(level: 3)[4. Vitesse Relative et Normale]

#important-box(title: "Point de départ : le test de collision")[
  Tout choc commence par un test de collision : détecter que deux objets se chevauchent. Une fois le contact trouvé, seule la vitesse *projetée sur la normale de collision* $arrow(n)$ compte. C'est elle qui détermine si les objets se rapprochent, s'éloignent ou glissent l'un contre l'autre.
]

#figure(
  image("images/impulsion.svg", width: 70%),
  caption: [Vue schématique d'une collision : normale de contact, vitesses avant et impulsion appliquée.]
)

#definition-box(title: "Vitesse relative scalaire")[
  La vitesse de rapprochement projetée sur la normale de collision :
  $ v_"rel" = (arrow(v)_A - arrow(v)_B) dot arrow(n) $
  
  - $v_"rel" < 0$ : les objets se rapprochent.
  - $v_"rel" > 0$ : les objets s'éloignent.
  - $v_"rel" = 0$ : ils glissent l'un contre l'autre.
]

#heading(level: 3)[5. Calcul de l'Impulsion]

#important-box(title: "Formule de l'impulsion")[
  $ j = underbrace(-(1+e) v_"rel", "Vitesse à changer") dot underbrace(((m_A m_B) / (m_A + m_B)), "Masse réduite") $
]

*Application aux vitesses :*
$ v'_A = v_A + (j / m_A) dot arrow(n) $
$ v'_B = v_B - (j / m_B) dot arrow(n) $

#tip-box(title: "Vitesse tangentielle inchangée")[
  L'impulsion $arrow(J)$ est appliquée le long de la normale $arrow(n)$. Seule la composante *normale* de la vitesse est modifiée. La composante *tangentielle* (perpendiculaire à $arrow(n)$) reste inchangée : $arrow(v)_"tangentielle"' = arrow(v)_"tangentielle"$.
]

#heading(level: 3)[6. TP : Laboratoire de Chocs 1D]

#tip-box(title: "Objectifs du TP")[
  Implémenter la réponse physique d'une collision entre deux boules de masses différentes dans un espace 1D sans gravité ni friction.
]

#definition-box(title: "Missions")[
  1. Créer deux boules : A ($m=5$) lancée vers B ($m=1$).
  2. Calculer la normale $arrow(n)$.
  3. Calculer la vitesse relative $v_"rel"$.
  4. Si $v_"rel" > 0$, sortir (les objets s'éloignent).
  5. Calculer l'impulsion $j$ avec la masse réduite.
  6. Appliquer le changement de vitesse aux deux boules.
]

#definition-box(title: "Scénarios à observer")[
  - *Pendule de Newton* : masses égales, $e=1$ — A s'arrête, B repart.
  - *Le Mur* : $m_A = 1$, $m_B = 100$ — A rebondit, B bouge à peine.
  - *Bulldozer* : $m_A = 100$, $m_B = 1$ — A continue, B repart à environ $2 v_A$.
  - *Pâte à modeler* : $e=0$ — les boules se collent.
]
