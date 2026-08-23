/**
 * Every user-facing string, in both languages.
 *
 * French is the default and is written first, because it is the longer of the
 * two — a layout that survives French survives English, and the reverse is not
 * true (PRD §5.11).
 *
 * Deliberately a plain typed object rather than i18next for now. Feature 4
 * swaps the backing store for i18next + expo-localization and seeds the locale
 * from `/v1/auth/me` → `organization.locale`; because every call site already
 * goes through `useStrings()`, that swap does not touch a single screen.
 *
 * Error strings are keyed by the server's error *code*, never by its prose.
 * The `message` field is English-only and changes without notice; the code is
 * the contract.
 */

export type Locale = 'fr' | 'en';

/**
 * A wait, in whole minutes, rounded up.
 *
 * "Try again later" generates support calls, so throttling always renders a
 * real number (PRD §5.1). Seconds are rounded up because telling a driver to
 * wait "0 minutes" when 20 seconds remain is worse than telling them 1.
 */
function minutes(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60));
}

const fr = {
  tabs: { ready: 'À livrer', on_the_way: 'En route', done: 'Terminé' },
  pharmacy: 'Succursale centrale',
  settings: 'Réglages',
  nextStop: 'Prochain arrêt',
  upcoming: 'Séquence à venir',
  selected: (n: number) => `${n} sélectionnée${n > 1 ? 's' : ''}`,
  takeCharge: 'Prendre en charge',
  collect: 'À percevoir :',
  cooler: 'Sac réfrigérant',
  contact: 'Appeler',
  navigate: 'Naviguer',
  callClient: 'Appeler le client',
  callPharmacy: 'Pharmacie',
  client: 'Client :',
  window: 'Fenêtre de livraison',
  amountDue: 'Montant dû :',
  paymentAtDoor: 'Paiement requis à la livraison',
  statusOnTheWay: 'Livraison en cours',
  delivered: 'Livré',
  returnOrder: 'Retourner la commande',
  accessibilityPrefix: 'Livraison pour',
  completed: 'Livré',
  returned: 'Retourné',
  cancelled: 'Annulé',
  coolerPending: 'Vérification du sac réfrigérant en attente',
  returnToPharmacy: 'À rapporter à la pharmacie',
  degraded: 'Route non optimisée — ordre précédent conservé',
  pendingSync: '2 mises à jour en attente de synchronisation',
  offline: 'Hors ligne — les livraisons continuent de fonctionner',
  emptyTitle: 'Rien à livrer',
  emptyBody: "Aucune commande ne vous est assignée pour l'instant. Tirez pour actualiser.",
  signIn: 'Connexion',
  inviteCode: "Code d'invitation",
  tagline: 'Réseau logistique médical sécurisé.',
  driverId: 'Identifiant / Courriel',
  password: 'Mot de passe',
  emailPlaceholder: 'vous@pharmacie.ca',
  codeLabel: "Code d'invitation à 8 caractères",
  paste: 'Coller',
  optimize: 'Optimiser la route',
  themeDark: 'Mode nuit',
  themeLight: 'Mode jour',

  // --- session ------------------------------------------------------------
  signingIn: 'Connexion en cours…',
  signOut: 'Déconnexion',
  signOutConfirmTitle: 'Se déconnecter ?',
  signOutConfirmBody:
    'Les livraisons non synchronisées seront conservées et envoyées à la prochaine connexion.',
  cancel: 'Annuler',
  restoring: 'Restauration de la session…',

  // --- registration (PRD §4.2) --------------------------------------------
  registerTitle: 'Créer votre compte',
  registerIntro:
    "Entrez le code d'invitation à 8 caractères fourni par votre pharmacie.",
  firstName: 'Prénom',
  lastName: 'Nom',
  phoneOptional: 'Téléphone (facultatif)',
  choosePassword: 'Choisir un mot de passe',
  passwordRule: 'Au moins 12 caractères.',
  createAccount: 'Créer le compte',
  creatingAccount: 'Création du compte…',
  registered: 'Compte créé. Connectez-vous pour commencer.',
  backToSignIn: 'Retour à la connexion',

  // --- queue --------------------------------------------------------------
  loadingQueue: 'Chargement de la tournée…',
  retry: 'Réessayer',
  readyEmptyTitle: 'Rien à ramasser',
  readyEmptyBody: 'Aucun colis ne vous attend au comptoir.',
  onTheWayEmptyTitle: 'Aucune livraison en cours',
  onTheWayEmptyBody: 'Prenez un colis en charge pour le voir ici.',
  doneEmptyTitle: 'Rien de terminé',
  doneEmptyBody: "Les livraisons terminées et les retours apparaîtront ici.",

  // --- errors, keyed by server code ---------------------------------------
  errors: {
    INVALID_CREDENTIALS: 'Identifiant ou mot de passe incorrect.',
    ACCOUNT_DISABLED:
      'Ce compte a été désactivé. Contactez votre pharmacie.',
    LOGIN_THROTTLED: (seconds: number | null) =>
      seconds === null
        ? 'Trop de tentatives. Réessayez dans quelques minutes.'
        : `Trop de tentatives. Réessayez dans ${minutes(seconds)} minute${minutes(seconds) > 1 ? 's' : ''}.`,
    RATE_LIMITED: (seconds: number | null) =>
      seconds === null
        ? 'Trop de requêtes. Réessayez dans quelques minutes.'
        : `Trop de requêtes. Réessayez dans ${minutes(seconds)} minute${minutes(seconds) > 1 ? 's' : ''}.`,
    // Three distinct codes, three distinct messages: "code invalide" sends the
    // driver back to the pharmacist to regenerate a code that may be fine.
    INVITE_CODE_INVALID:
      "Ce code d'invitation n'existe pas. Vérifiez les caractères saisis.",
    INVITE_CODE_EXPIRED:
      "Ce code d'invitation a expiré. Demandez-en un nouveau à votre pharmacie.",
    INVITE_CODE_REDEEMED:
      "Ce code d'invitation a déjà été utilisé. Demandez-en un nouveau.",
    EMAIL_ALREADY_REGISTERED:
      'Cette adresse est déjà associée à un compte. Connectez-vous.',
    VALIDATION_FAILED: 'Vérifiez les champs saisis.',
    OFFLINE: 'Aucune connexion. Vérifiez le réseau et réessayez.',
    UNKNOWN: 'Une erreur est survenue. Réessayez.',
    requestId: (id: string) => `Référence : ${id}`,
  },
  sessionEnded: {
    ACCOUNT_DISABLED: 'Votre compte a été désactivé. Contactez votre pharmacie.',
    DEFAULT: 'Votre session a expiré. Reconnectez-vous.',
  },
};

/**
 * French is the shape of record. Declaring English as `Strings` rather than
 * inferring it is what makes a missing or misspelled key a build error instead
 * of an `undefined` rendered into a button at 6am.
 */
export type Strings = typeof fr;

const en: Strings = {
  tabs: { ready: 'Ready', on_the_way: 'On the way', done: 'Done' },
  pharmacy: 'Central branch',
  settings: 'Settings',
  nextStop: 'Next stop',
  upcoming: 'Upcoming sequence',
  selected: (n: number) => `${n} selected`,
  takeCharge: 'Take in charge',
  collect: 'Collect:',
  cooler: 'Cooler bag',
  contact: 'Contact',
  navigate: 'Navigate',
  callClient: 'Call client',
  callPharmacy: 'Pharmacy',
  client: 'Client:',
  window: 'Delivery window',
  amountDue: 'Amount due:',
  paymentAtDoor: 'Payment required upon delivery',
  statusOnTheWay: 'Active delivery',
  delivered: 'Delivered',
  returnOrder: 'Return order',
  accessibilityPrefix: 'Delivery for',
  completed: 'Delivered',
  returned: 'Returned',
  cancelled: 'Cancelled',
  coolerPending: 'Cooler bag check pending',
  returnToPharmacy: 'Hand back at the counter',
  degraded: 'Route not optimized — using previous order',
  pendingSync: '2 updates pending sync',
  offline: 'Offline — deliveries keep working',
  emptyTitle: 'Nothing to deliver',
  emptyBody: 'No orders are assigned to you right now. Pull to refresh.',
  signIn: 'Sign in',
  inviteCode: 'Invite code',
  tagline: 'Secure medical logistics network.',
  driverId: 'Driver ID / Email',
  password: 'Password',
  emailPlaceholder: 'you@pharmacy.ca',
  codeLabel: '8-character invite code',
  paste: 'Paste',
  optimize: 'Optimize route',
  themeDark: 'Night mode',
  themeLight: 'Day mode',

  signingIn: 'Signing in…',
  signOut: 'Sign out',
  signOutConfirmTitle: 'Sign out?',
  signOutConfirmBody:
    'Any unsynced deliveries are kept and sent the next time you sign in.',
  cancel: 'Cancel',
  restoring: 'Restoring your session…',

  registerTitle: 'Create your account',
  registerIntro: 'Enter the 8-character invite code your pharmacy gave you.',
  firstName: 'First name',
  lastName: 'Last name',
  phoneOptional: 'Phone (optional)',
  choosePassword: 'Choose a password',
  passwordRule: 'At least 12 characters.',
  createAccount: 'Create account',
  creatingAccount: 'Creating account…',
  registered: 'Account created. Sign in to get started.',
  backToSignIn: 'Back to sign in',

  loadingQueue: 'Loading your run…',
  retry: 'Try again',
  readyEmptyTitle: 'Nothing to pick up',
  readyEmptyBody: 'No packages are waiting for you at the counter.',
  onTheWayEmptyTitle: 'No active deliveries',
  onTheWayEmptyBody: 'Take a package in charge to see it here.',
  doneEmptyTitle: 'Nothing finished yet',
  doneEmptyBody: 'Completed deliveries and returns show up here.',

  errors: {
    INVALID_CREDENTIALS: 'Incorrect email or password.',
    ACCOUNT_DISABLED: 'This account has been disabled. Contact your pharmacy.',
    LOGIN_THROTTLED: (seconds: number | null) =>
      seconds === null
        ? 'Too many attempts. Try again in a few minutes.'
        : `Too many attempts. Try again in ${minutes(seconds)} minute${minutes(seconds) > 1 ? 's' : ''}.`,
    RATE_LIMITED: (seconds: number | null) =>
      seconds === null
        ? 'Too many requests. Try again in a few minutes.'
        : `Too many requests. Try again in ${minutes(seconds)} minute${minutes(seconds) > 1 ? 's' : ''}.`,
    INVITE_CODE_INVALID: 'That invite code does not exist. Check the characters.',
    INVITE_CODE_EXPIRED:
      'That invite code has expired. Ask your pharmacy for a new one.',
    INVITE_CODE_REDEEMED:
      'That invite code has already been used. Ask your pharmacy for a new one.',
    EMAIL_ALREADY_REGISTERED:
      'That email already has an account. Sign in instead.',
    VALIDATION_FAILED: 'Check the fields above.',
    OFFLINE: 'No connection. Check the network and try again.',
    UNKNOWN: 'Something went wrong. Try again.',
    requestId: (id: string) => `Reference: ${id}`,
  },
  sessionEnded: {
    ACCOUNT_DISABLED: 'Your account has been disabled. Contact your pharmacy.',
    DEFAULT: 'Your session expired. Sign in again.',
  },
};

export const STRINGS: Record<Locale, Strings> = { fr, en };
