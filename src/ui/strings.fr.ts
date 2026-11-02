// Textes de l'interface (français), centralisés.
export const fr = {
  appName: 'Cavavin',
  nav: { cave: 'Cave', list: 'Liste', add: 'Ajouter', settings: 'Réglages' },
  signIn: {
    title: 'Ma cave',
    tagline: 'Votre stock de vin, partout, même sans réseau.',
    button: 'Se connecter avec Google',
    connecting: 'Connexion en cours…',
    checking: 'Vérification de l’accès à la feuille…',
    denied:
      'Accès refusé. Ce compte Google n’a pas accès à la feuille de la cave. Demandez le partage en édition, ou changez de compte.',
    expired: 'Votre session Google a expiré.',
    reconnect: 'Reconnecter',
    apiDisabled:
      'L’API Google Sheets n’est pas activée dans le projet Google Cloud. Activez-la (API et services, Bibliothèque), patientez une minute, puis réessayez.',
    scope:
      'L’autorisation d’accès à Google Sheets n’a pas été accordée. Reconnectez-vous et laissez la case « Afficher, modifier, créer et supprimer vos feuilles de calcul » cochée.',
    deniedAccount: 'Compte utilisé :',
    deniedDetail: 'Détail renvoyé par Google :',
    popupBlocked: 'La fenêtre de connexion a été bloquée. Réessayez en touchant le bouton.',
    cancelled: 'Connexion annulée.',
    initTitle: 'Initialiser ma cave',
    initExplain:
      'Des onglets propres à l’application vont être ajoutés à la feuille. Vos onglets existants ne seront jamais modifiés.',
    initButton: 'Initialiser ma cave',
    initializing: 'Initialisation…',
    syncing: 'Première synchronisation…',
    offline: 'Impossible de joindre Google. Vérifiez votre connexion.',
    unexpected: 'Une erreur est survenue',
  },
  soon: 'Cet écran arrive bientôt.',
  settings: {
    title: 'Réglages',
    account: 'Compte',
    notConnected: 'Non connecté',
    pending: 'Modifications en attente',
    lastSync: 'Dernière synchronisation',
    never: 'jamais',
    syncNow: 'Synchroniser maintenant',
    syncing: 'Synchronisation…',
    syncDone: 'Synchronisation terminée.',
    signOut: 'Se déconnecter',
    contents: 'Contenu local',
  },
} as const;
