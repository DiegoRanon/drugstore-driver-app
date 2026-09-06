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
  tabs: {
    ready: 'À livrer',
    on_the_way: 'En route',
    to_hand_back: 'À rapporter',
    done: 'Terminé',
  },
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
  // Counts only. A banner sits on screen while the phone is on a dashboard
  // mount, so no patient name goes in one (PRD §8.1).
  newOrders: (n: number) =>
    n > 1
      ? `${n} nouvelles commandes vous ont été assignées`
      : 'Une nouvelle commande vous a été assignée',
  backToPharmacy: (n: number) =>
    n > 1
      ? `${n} commandes vous attendent en pharmacie`
      : 'Une commande vous attend en pharmacie',
  dismiss: 'Masquer',
  readyEmptyTitle: 'Rien à ramasser',
  readyEmptyBody: 'Aucun colis ne vous attend au comptoir.',
  onTheWayEmptyTitle: 'Aucune livraison en cours',
  onTheWayEmptyBody: 'Prenez un colis en charge pour le voir ici.',
  doneEmptyTitle: 'Rien de terminé',
  doneEmptyBody: 'Les livraisons terminées apparaîtront ici.',
  toHandBackEmptyTitle: 'Rien à rapporter',
  toHandBackEmptyBody: 'Bonne fin de tournée.',

  // --- prise en charge (domain_workflow.md, §Pendant prise en charge) ------
  priority: 'Prioritaire',
  markPriority: 'Marquer prioritaire',
  unmarkPriority: 'Retirer la priorité',
  packages: 'colis',
  packageTypes: {
    bag: 'Sac',
    cooler: 'Glacière',
    tote: 'Bac',
    envelope: 'Enveloppe',
  },
  pickupTitle: 'Vérifier les étiquettes',
  pickupIntro:
    "Cochez chaque étiquette avec l'employé. Les colis sur le comptoir font foi.",
  countMismatch: (checked: number, expected: number) =>
    `${checked} étiquette${checked > 1 ? 's' : ''} cochée${checked > 1 ? 's' : ''} sur ${expected}. Prise en charge quand même.`,
  takeChargeCount: (n: number) => `Prendre en charge (${n})`,
  selectAll: 'Tout sélectionner',
  batchProgress: (done: number, total: number) => `${done} / ${total}`,
  takeTerminal: (stops: number, amount: string) =>
    `Prenez le terminal — ${stops} arrêt${stops > 1 ? 's' : ''}, ${amount} à percevoir`,

  // --- à l'adresse (§à l'adresse, scénarios A et B) -----------------------
  cash: 'Comptant',
  card: 'Carte',
  amountCollected: 'Montant perçu',
  recordPayment: 'Enregistrer le paiement',
  confirmDelivery: 'Confirmer la livraison',
  collectedOf: (collected: string, due: string) => `Perçu ${collected} sur ${due}`,
  cannotPay: 'Le client ne peut pas payer',
  callPharmacyFirst:
    "Appelez la pharmacie et demandez quoi faire. Enregistrez ensuite leur réponse.",
  paymentExceptions: {
    waived_by_pharmacy: 'Donnée gratuitement (autorisé)',
    deferred_to_pharmacy: 'À régler avec la pharmacie',
  },
  bringItBack: 'Rapporter la commande',
  returnReasonTitle: 'Pourquoi la livraison a-t-elle échoué ?',
  returnReasonHint: 'La commande restera dans votre véhicule jusqu’au retour en pharmacie.',
  failureReasons: {
    customer_absent: 'Client absent',
    customer_refused: 'Client a refusé',
    wrong_address: 'Mauvaise adresse',
    payment_refused: 'Paiement refusé',
    other: 'Autre',
  },
  noteOptional: 'Note (facultatif)',
  noteRemaining: (n: number) => `${n} caractères restants`,
  confirmReturn: 'Marquer non livrée',
  coolerQuestion: 'Avez-vous récupéré le sac réfrigérant ?',
  yes: 'Oui',
  no: 'Non',
  later: 'Plus tard',

  // --- retour en pharmacie (§Retour en pharmacie) -------------------------
  returnBefore: (time: string) => `À rapporter avant ${time}`,
  returnDeadlinePassed: (time: string) => `Heure limite dépassée (${time})`,
  packagesToReturn: (n: number) =>
    n > 1 ? `${n} colis à rapporter` : 'Un colis à rapporter',
  handedBack: 'Rendu',
  handBackAll: (n: number) => `Tout rendre (${n})`,
  returned_to_pharmacy: 'Rapporté',

  // --- notifications ------------------------------------------------------
  notifications: 'Notifications',
  notificationsEmptyTitle: 'Aucune notification',
  notificationsEmptyBody: 'Vous serez prévenu quand la pharmacie vous assigne une commande.',
  markAllRead: 'Tout marquer comme lu',
  notificationTypes: {
    order_assigned: 'Une commande vous a été assignée',
    order_ready: 'Une commande est prête au comptoir',
    order_unassigned: 'Une commande vous a été retirée',
    order_cancelled: 'Une commande a été annulée',
  },
  orderNoLongerInQueue: "Cette commande n'est plus dans votre tournée d'aujourd'hui.",

  // --- itinéraire (§En route) ---------------------------------------------
  reorderTitle: 'Ordonner la tournée',
  reorderHint:
    'Les arrêts prioritaires restent en tête. Toute la journée est enregistrée, pas seulement le véhicule.',
  saveOrder: 'Enregistrer l’ordre',
  moveUp: 'Monter',
  moveDown: 'Descendre',
  /** Fenêtre promise au patient, plus précise que le créneau AM/PM. */
  promisedWindow: 'Promis entre',
  /** Whole-run estimate, above the list. */
  finishBy: 'Fin estimée',
  etaPartial: (count: number) =>
    count === 1
      ? '1 arrêt sans estimation (adresse non localisée)'
      : `${count} arrêts sans estimation (adresses non localisées)`,
  /** Predicted arrival on a card. */
  arriveAt: (time: string) => `Arrivée ~${time}`,
  noCoordinates: 'Adresse non localisée',
  navigateUnavailable: "Cette adresse n'a pas de position — ouvrez la carte manuellement.",

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
    // --- the delivery verbs -----------------------------------------------
    /*
      A driver never sees ORDER_NOT_READY: the repository excludes `scheduled`
      orders before the state machine is reached, so an unpacked order answers
      404 like one that does not exist. There is deliberately no string for it,
      and NOT_FOUND must never say "pas encore prête" — the honest reading is
      that the order left this driver's queue.
    */
    NOT_FOUND: "Cette commande ne vous est plus assignée. Actualisez votre tournée.",
    ORDER_FORBIDDEN: "Cette commande est assignée à un autre livreur.",
    ORDER_NOT_ASSIGNED: "Cette commande n'a pas de livreur. Contactez la pharmacie.",
    ORDER_ALREADY_TERMINAL: 'Cette commande est déjà clôturée.',
    ORDER_INVALID_TRANSITION: 'Cette action ne correspond plus à l’état de la commande.',
    FAILURE_REASON_REQUIRED: 'Choisissez un motif de non-livraison.',
    PAYMENT_ALREADY_COLLECTED: 'Le paiement a déjà été enregistré.',
    PAYMENT_DETAILS_REQUIRED: 'Indiquez le mode de paiement et le montant.',
    COOLER_BAG_NOT_REQUIRED: 'Cette commande ne comporte pas de sac réfrigérant.',
    IDEMPOTENCY_KEY_CONFLICT: 'Une action différente a déjà été envoyée. Actualisez.',
    IDEMPOTENCY_REQUEST_IN_FLIGHT: 'Envoi en cours. Réessayez dans un instant.',
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
  tabs: {
    ready: 'Ready',
    on_the_way: 'On the way',
    to_hand_back: 'Hand back',
    done: 'Done',
  },
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
  newOrders: (n: number) =>
    n > 1 ? `${n} new orders were assigned to you` : 'A new order was assigned to you',
  backToPharmacy: (n: number) =>
    n > 1
      ? `${n} orders are waiting at the pharmacy`
      : 'An order is waiting at the pharmacy',
  dismiss: 'Dismiss',
  readyEmptyTitle: 'Nothing to pick up',
  readyEmptyBody: 'No packages are waiting for you at the counter.',
  onTheWayEmptyTitle: 'No active deliveries',
  onTheWayEmptyBody: 'Take a package in charge to see it here.',
  doneEmptyTitle: 'Nothing finished yet',
  doneEmptyBody: 'Completed deliveries show up here.',
  toHandBackEmptyTitle: 'Nothing to hand back',
  toHandBackEmptyBody: 'Have a good end of shift.',

  priority: 'Priority',
  markPriority: 'Mark priority',
  unmarkPriority: 'Remove priority',
  packages: 'packages',
  packageTypes: {
    bag: 'Bag',
    cooler: 'Cooler',
    tote: 'Tote',
    envelope: 'Envelope',
  },
  pickupTitle: 'Check the labels',
  pickupIntro:
    'Tick each label with the employee. The packages on the counter are the truth.',
  countMismatch: (checked: number, expected: number) =>
    `${checked} of ${expected} labels ticked. Taking charge anyway.`,
  takeChargeCount: (n: number) => `Take in charge (${n})`,
  selectAll: 'Select all',
  batchProgress: (done: number, total: number) => `${done} / ${total}`,
  takeTerminal: (stops: number, amount: string) =>
    `Take the terminal — ${stops} stop${stops > 1 ? 's' : ''}, ${amount} to collect`,

  cash: 'Cash',
  card: 'Card',
  amountCollected: 'Amount collected',
  recordPayment: 'Record payment',
  confirmDelivery: 'Confirm delivery',
  collectedOf: (collected: string, due: string) => `Collected ${collected} of ${due}`,
  cannotPay: 'The client cannot pay',
  callPharmacyFirst:
    'Call the pharmacy and ask what to do. Then record their answer.',
  paymentExceptions: {
    waived_by_pharmacy: 'Given free of charge (authorised)',
    deferred_to_pharmacy: 'To be settled with the pharmacy',
  },
  bringItBack: 'Bring the order back',
  returnReasonTitle: 'Why did the delivery fail?',
  returnReasonHint: 'The package stays in your vehicle until you get back to the pharmacy.',
  failureReasons: {
    customer_absent: 'Client absent',
    customer_refused: 'Client refused',
    wrong_address: 'Wrong address',
    payment_refused: 'Payment refused',
    other: 'Other',
  },
  noteOptional: 'Note (optional)',
  noteRemaining: (n: number) => `${n} characters left`,
  confirmReturn: 'Mark undelivered',
  coolerQuestion: 'Did you retrieve the cooler bag?',
  yes: 'Yes',
  no: 'No',
  later: 'Later',

  returnBefore: (time: string) => `Hand back before ${time}`,
  returnDeadlinePassed: (time: string) => `Past the deadline (${time})`,
  packagesToReturn: (n: number) =>
    n > 1 ? `${n} packages to hand back` : 'One package to hand back',
  handedBack: 'Handed back',
  handBackAll: (n: number) => `Hand back all (${n})`,
  returned_to_pharmacy: 'Handed back',

  notifications: 'Notifications',
  notificationsEmptyTitle: 'No notifications',
  notificationsEmptyBody: 'You will be told when the pharmacy assigns you an order.',
  markAllRead: 'Mark all as read',
  notificationTypes: {
    order_assigned: 'An order was assigned to you',
    order_ready: 'An order is ready at the counter',
    order_unassigned: 'An order was taken off you',
    order_cancelled: 'An order was cancelled',
  },
  orderNoLongerInQueue: 'That order is no longer in today’s run.',

  reorderTitle: 'Order your run',
  reorderHint:
    'Priority stops stay at the top. The whole day is saved, not just the vehicle.',
  saveOrder: 'Save order',
  moveUp: 'Move up',
  moveDown: 'Move down',
  promisedWindow: 'Promised between',
  finishBy: 'Estimated finish',
  etaPartial: (count: number) =>
    count === 1
      ? '1 stop not estimated (address not located)'
      : `${count} stops not estimated (addresses not located)`,
  arriveAt: (time: string) => `Arrive ~${time}`,
  noCoordinates: 'Address not located',
  navigateUnavailable: 'This address has no location — open your map manually.',

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
    NOT_FOUND: 'That order is no longer assigned to you. Refresh your run.',
    ORDER_FORBIDDEN: 'That order belongs to another driver.',
    ORDER_NOT_ASSIGNED: 'That order has no driver. Contact the pharmacy.',
    ORDER_ALREADY_TERMINAL: 'That order is already closed.',
    ORDER_INVALID_TRANSITION: 'That action no longer matches the order’s state.',
    FAILURE_REASON_REQUIRED: 'Pick a reason the delivery failed.',
    PAYMENT_ALREADY_COLLECTED: 'The payment was already recorded.',
    PAYMENT_DETAILS_REQUIRED: 'Give the payment method and the amount.',
    COOLER_BAG_NOT_REQUIRED: 'That order has no cooler bag.',
    IDEMPOTENCY_KEY_CONFLICT: 'A different action was already sent. Refresh.',
    IDEMPOTENCY_REQUEST_IN_FLIGHT: 'Still sending. Try again in a moment.',
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
