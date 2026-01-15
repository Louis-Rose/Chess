// Mentions Légales, CGUs & Confidentialité page

import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function CGUPage() {
  return (
    <div className="min-h-screen bg-slate-800 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-200 mb-8 transition-colors"
        >
          <ArrowLeft size={20} />
          Retour à l'accueil
        </Link>

        <h1 className="text-3xl font-bold text-slate-100 mb-8">
          Mentions Légales, CGUs & Confidentialité
        </h1>

        <div className="text-slate-300 space-y-10">
          {/* Section 1: Mentions Légales */}
          <section>
            <h2 className="text-2xl font-bold text-slate-100 mb-4">
              1. Mentions Légales
            </h2>
            <p className="text-slate-400 mb-4">(L'identité de l'entreprise)</p>
            <p className="mb-6">
              Conformément aux dispositions des articles 6-III et 19 de la Loi pour la Confiance
              dans l'économie numérique, il est précisé aux utilisateurs l'identité des
              intervenants :
            </p>

            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-200 mb-2">1.1 Éditeur du Site</h3>
                <p className="mb-2">Le site est édité par :</p>
                <ul className="list-none space-y-1 ml-2">
                  <li><strong className="text-slate-200">Louis Rose EI</strong></li>
                  <li>Statut : Entrepreneur Individuel (Auto-entrepreneur)</li>
                  <li>SIREN : 983 468 828</li>
                  <li>Siège social : 6 rue de Vaugirard, 75006 Paris, France</li>
                  <li>
                    Email de contact :{' '}
                    <a
                      href="mailto:rose.louis.mail@gmail.com"
                      className="text-blue-400 hover:text-blue-300 underline"
                    >
                      rose.louis.mail@gmail.com
                    </a>
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-200 mb-2">1.2 Hébergeur</h3>
                <p className="mb-2">
                  Les données sont hébergées dans l'Union Européenne (Région West Europe -
                  Pays-Bas) par :
                </p>
                <ul className="list-none space-y-1 ml-2">
                  <li><strong className="text-slate-200">Microsoft Ireland Operations Limited</strong></li>
                  <li>
                    Adresse : One Microsoft Place, South County Business Park, Leopardstown,
                    Dublin 18, Irlande
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 2: CGU */}
          <section>
            <h2 className="text-2xl font-bold text-slate-100 mb-4">
              2. Conditions Générales d'Utilisation
            </h2>

            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-200 mb-2">
                  2.1 Objet et Acceptation
                </h3>
                <p>
                  L'utilisation de la plateforme Lumna implique l'acceptation pleine et entière des
                  présentes conditions. Ces conditions sont susceptibles d'être modifiées à tout
                  moment.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-200 mb-2">
                  2.2 Avertissement : Absence de Conseil Financier
                </h3>
                <ul className="list-disc list-inside space-y-2 ml-2">
                  <li>Lumna est un outil technique de visualisation de portefeuille.</li>
                  <li>
                    Louis Rose EI ne fournit aucun conseil en investissement au sens du Code
                    monétaire et financier.
                  </li>
                  <li>
                    Les performances passées, graphiques et indicateurs sont fournis à titre
                    informatif.
                  </li>
                  <li>
                    L'utilisateur est seul responsable de ses décisions d'achat ou de vente.
                    L'éditeur décline toute responsabilité en cas de perte financière subie par
                    l'utilisateur.
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-200 mb-2">
                  2.3 Responsabilité technique
                </h3>
                <p>
                  L'éditeur s'engage à une obligation de moyens pour rendre le service accessible.
                  Il ne saurait être tenu responsable en cas d'indisponibilité du service (panne
                  Azure, maintenance) ou de perte de données accidentelle.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-200 mb-2">
                  2.4 Propriété Intellectuelle
                </h3>
                <p>
                  La structure du site et le code sont la propriété exclusive de Louis Rose EI.
                  Toute reproduction est interdite.
                </p>
              </div>
            </div>
          </section>

          {/* Section 3: Politique de Confidentialité */}
          <section>
            <h2 className="text-2xl font-bold text-slate-100 mb-4">
              3. Politique de Confidentialité
            </h2>

            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-200 mb-2">3.1 Données collectées</h3>
                <ul className="list-disc list-inside space-y-2 ml-2">
                  <li>
                    <strong className="text-slate-200">Identification :</strong> Email (gestion du
                    compte).
                  </li>
                  <li>
                    <strong className="text-slate-200">Financières :</strong> Données de portefeuille
                    (Titres, PRU, quantités) saisies volontairement.
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-200 mb-2">3.2 Finalités</h3>
                <p>
                  Calcul des performances du portefeuille et maintenance technique. Aucune donnée
                  n'est revendue à des tiers.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-200 mb-2">
                  3.3 Sécurité et Hébergement
                </h3>
                <p>
                  Les données sont stockées sur Microsoft Azure (Pays-Bas). Des mesures de sécurité
                  (chiffrement, accès restreint) sont mises en place pour protéger ces données.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-200 mb-2">
                  3.4 Droits de l'utilisateur (RGPD)
                </h3>
                <p>
                  Vous disposez d'un droit d'accès, de rectification et de suppression de vos
                  données. Pour l'exercer, contactez :{' '}
                  <a
                    href="mailto:rose.louis.mail@gmail.com"
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    rose.louis.mail@gmail.com
                  </a>
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-200 mb-2">3.5 Cookies</h3>
                <p>
                  Le site utilise uniquement des cookies techniques nécessaires au fonctionnement
                  (session). Aucun traceur publicitaire n'est utilisé.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
