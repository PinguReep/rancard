/**
 * Importé tout en haut du layout racine : sur iPhone, le registre PushKit du
 * SDK Twilio doit exister dès le lancement, pour qu'un appel arrivé app tuée
 * (iOS relance l'app en arrière-plan) soit signalé à CallKit sans attendre la
 * session. Sans effet sur le web, sur Android, sans le module natif et dans
 * « Rencar » (App Store, version 1, `extra.sonnerie` faux) : le SDK n’y est
 * jamais chargé.
 */

import { moteurTwilio } from './twilio';

void moteurTwilio()?.demarrer();
