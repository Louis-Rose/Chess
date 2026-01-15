// Legal Notices, Terms of Use & Privacy Policy page

import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

export function CGUPage() {
  const { language } = useLanguage();
  const fr = language === 'fr';

  return (
    <div className="min-h-screen bg-slate-800 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <Link
          to="/investing"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-200 mb-8 transition-colors"
        >
          <ArrowLeft size={20} />
          {fr ? 'Retour à l\'accueil' : 'Back to home'}
        </Link>

        <h1 className="text-3xl font-bold text-slate-100 mb-8">
          {fr ? 'Mentions Légales, CGUs & Confidentialité' : 'Legal Notices, Terms of Use & Privacy Policy'}
        </h1>

        <div className="text-slate-300 space-y-10">
          {/* Section 1: Legal Notices */}
          <section>
            <h2 className="text-2xl font-bold text-slate-100 mb-4">
              {fr ? '1. Mentions Légales' : '1. Legal Notices'}
            </h2>
            <p className="text-slate-400 mb-4">
              {fr ? '(L\'identité de l\'entreprise)' : '(Company identity)'}
            </p>
            <p className="mb-6">
              {fr
                ? 'Conformément aux dispositions des articles 6-III et 19 de la Loi pour la Confiance dans l\'économie numérique, il est précisé aux utilisateurs l\'identité des intervenants :'
                : 'In accordance with articles 6-III and 19 of the French Law for Confidence in the Digital Economy, users are informed of the following:'}
            </p>

            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-200 mb-2">
                  {fr ? '1.1 Éditeur du Site' : '1.1 Website Publisher'}
                </h3>
                <p className="mb-2">{fr ? 'Le site est édité par :' : 'The website is published by:'}</p>
                <ul className="list-none space-y-1 ml-2">
                  <li><strong className="text-slate-200">Louis Rose EI</strong></li>
                  <li>{fr ? 'Statut : Entrepreneur Individuel (Auto-entrepreneur)' : 'Status: Sole Proprietor (Auto-entrepreneur)'}</li>
                  <li>SIREN: 983 468 828</li>
                  <li>{fr ? 'Siège social : 6 rue de Vaugirard, 75006 Paris, France' : 'Headquarters: 6 rue de Vaugirard, 75006 Paris, France'}</li>
                  <li>
                    {fr ? 'Email de contact : ' : 'Contact email: '}
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
                <h3 className="text-lg font-semibold text-slate-200 mb-2">
                  {fr ? '1.2 Hébergeur' : '1.2 Hosting Provider'}
                </h3>
                <p className="mb-2">
                  {fr
                    ? 'Les données sont hébergées dans l\'Union Européenne (Région West Europe - Pays-Bas) par :'
                    : 'Data is hosted in the European Union (West Europe Region - Netherlands) by:'}
                </p>
                <ul className="list-none space-y-1 ml-2">
                  <li><strong className="text-slate-200">Microsoft Ireland Operations Limited</strong></li>
                  <li>
                    {fr ? 'Adresse : ' : 'Address: '}
                    One Microsoft Place, South County Business Park, Leopardstown, Dublin 18, Ireland
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 2: Terms of Use */}
          <section>
            <h2 className="text-2xl font-bold text-slate-100 mb-4">
              {fr ? '2. Conditions Générales d\'Utilisation' : '2. Terms of Use'}
            </h2>

            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-200 mb-2">
                  {fr ? '2.1 Objet et Acceptation' : '2.1 Purpose and Acceptance'}
                </h3>
                <p>
                  {fr
                    ? 'L\'utilisation de la plateforme Lumna implique l\'acceptation pleine et entière des présentes conditions. Ces conditions sont susceptibles d\'être modifiées à tout moment.'
                    : 'Use of the Lumna platform implies full acceptance of these terms. These terms may be modified at any time.'}
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-200 mb-2">
                  {fr ? '2.2 Avertissement : Absence de Conseil Financier' : '2.2 Disclaimer: No Financial Advice'}
                </h3>
                <ul className="list-disc list-inside space-y-2 ml-2">
                  <li>
                    {fr
                      ? 'Lumna est un outil technique de visualisation de portefeuille.'
                      : 'Lumna is a technical portfolio visualization tool.'}
                  </li>
                  <li>
                    {fr
                      ? 'Louis Rose EI ne fournit aucun conseil en investissement au sens du Code monétaire et financier.'
                      : 'Louis Rose EI does not provide any investment advice as defined by financial regulations.'}
                  </li>
                  <li>
                    {fr
                      ? 'Les performances passées, graphiques et indicateurs sont fournis à titre informatif.'
                      : 'Past performance, charts, and indicators are provided for informational purposes only.'}
                  </li>
                  <li>
                    {fr
                      ? 'L\'utilisateur est seul responsable de ses décisions d\'achat ou de vente. L\'éditeur décline toute responsabilité en cas de perte financière subie par l\'utilisateur.'
                      : 'The user is solely responsible for their buy or sell decisions. The publisher disclaims any liability for financial losses incurred by the user.'}
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-200 mb-2">
                  {fr ? '2.3 Responsabilité technique' : '2.3 Technical Liability'}
                </h3>
                <p>
                  {fr
                    ? 'L\'éditeur s\'engage à une obligation de moyens pour rendre le service accessible. Il ne saurait être tenu responsable en cas d\'indisponibilité du service (panne Azure, maintenance) ou de perte de données accidentelle.'
                    : 'The publisher commits to a best-effort obligation to make the service accessible. It cannot be held responsible for service unavailability (Azure outage, maintenance) or accidental data loss.'}
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-200 mb-2">
                  {fr ? '2.4 Propriété Intellectuelle' : '2.4 Intellectual Property'}
                </h3>
                <p>
                  {fr
                    ? 'La structure du site et le code sont la propriété exclusive de Louis Rose EI. Toute reproduction est interdite.'
                    : 'The website structure and code are the exclusive property of Louis Rose EI. Any reproduction is prohibited.'}
                </p>
              </div>
            </div>
          </section>

          {/* Section 3: Privacy Policy */}
          <section>
            <h2 className="text-2xl font-bold text-slate-100 mb-4">
              {fr ? '3. Politique de Confidentialité' : '3. Privacy Policy'}
            </h2>

            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-200 mb-2">
                  {fr ? '3.1 Données collectées' : '3.1 Data Collected'}
                </h3>
                <ul className="list-disc list-inside space-y-2 ml-2">
                  <li>
                    <strong className="text-slate-200">{fr ? 'Identification :' : 'Identification:'}</strong>{' '}
                    {fr ? 'Email (gestion du compte).' : 'Email (account management).'}
                  </li>
                  <li>
                    <strong className="text-slate-200">{fr ? 'Financières :' : 'Financial:'}</strong>{' '}
                    {fr
                      ? 'Données de portefeuille (Titres, PRU, quantités) saisies volontairement.'
                      : 'Portfolio data (Securities, cost basis, quantities) entered voluntarily.'}
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-200 mb-2">
                  {fr ? '3.2 Finalités' : '3.2 Purposes'}
                </h3>
                <p>
                  {fr
                    ? 'Calcul des performances du portefeuille et maintenance technique. Aucune donnée n\'est revendue à des tiers.'
                    : 'Portfolio performance calculation and technical maintenance. No data is sold to third parties.'}
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-200 mb-2">
                  {fr ? '3.3 Sécurité et Hébergement' : '3.3 Security and Hosting'}
                </h3>
                <p>
                  {fr
                    ? 'Les données sont stockées sur Microsoft Azure (Pays-Bas). Des mesures de sécurité (chiffrement, accès restreint) sont mises en place pour protéger ces données.'
                    : 'Data is stored on Microsoft Azure (Netherlands). Security measures (encryption, restricted access) are in place to protect this data.'}
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-200 mb-2">
                  {fr ? '3.4 Droits de l\'utilisateur (RGPD)' : '3.4 User Rights (GDPR)'}
                </h3>
                <p>
                  {fr
                    ? 'Vous disposez d\'un droit d\'accès, de rectification et de suppression de vos données. Pour l\'exercer, contactez : '
                    : 'You have the right to access, rectify, and delete your data. To exercise this right, contact: '}
                  <a
                    href="mailto:rose.louis.mail@gmail.com"
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    rose.louis.mail@gmail.com
                  </a>
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-200 mb-2">
                  {fr ? '3.5 Cookies et Traceurs' : '3.5 Cookies and Trackers'}
                </h3>
                <p className="mb-3">
                  {fr
                    ? 'La Plateforme utilise deux types de cookies :'
                    : 'The Platform uses two types of cookies:'}
                </p>
                <ul className="list-disc list-inside space-y-2 ml-2 mb-3">
                  <li>
                    <strong className="text-slate-200">
                      {fr ? 'Cookies techniques (Essentiels) :' : 'Technical Cookies (Essential):'}
                    </strong>{' '}
                    {fr
                      ? 'Nécessaires au maintien de votre connexion sécurisée. Ils ne requièrent pas de consentement.'
                      : 'Required to maintain your secure session. They do not require consent.'}
                  </li>
                  <li>
                    <strong className="text-slate-200">
                      {fr ? 'Cookies d\'analyse (PostHog) :' : 'Analytics Cookies (PostHog):'}
                    </strong>{' '}
                    {fr
                      ? 'Nous permettent de comprendre comment la Plateforme est utilisée (pages visitées, erreurs rencontrées) afin d\'améliorer l\'expérience utilisateur.'
                      : 'Help us understand how the Platform is used (pages visited, errors encountered) to improve user experience.'}
                  </li>
                </ul>
                <p>
                  {fr
                    ? 'Ces données sont hébergées dans l\'Union Européenne (PostHog EU). Vous pouvez à tout moment accepter ou refuser ces cookies d\'analyse via le panneau de configuration des cookies disponible en bas de page, ou en configurant votre navigateur. En cas de refus, votre navigation ne sera pas suivie, mais l\'expérience utilisateur reste identique.'
                    : 'This data is hosted in the European Union (PostHog EU). You can accept or refuse these analytics cookies at any time via the cookie settings panel at the bottom of the page, or by configuring your browser. If refused, your browsing will not be tracked, but the user experience remains the same.'}
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
