/**
 * Importé tout en haut du layout racine : sur iPhone, le registre PushKit du
 * SDK Twilio doit exister dès le lancement, pour qu'un appel arrivé app tuée
 * (iOS relance l'app en arrière-plan) soit signalé à CallKit sans attendre la
 * session. Sans effet sur le web, sur Android et sans le module natif.
 */

import { moteurTwilio } from './twilio';

void moteurTwilio()?.demarrer();
