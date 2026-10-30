/**
 * Icônes : SF Symbols sur iOS (expo-symbols), Lucide ailleurs. Un seul nom
 * logique par icône pour que les écrans ne connaissent pas la plateforme.
 */

import { SymbolView, type SymbolWeight } from 'expo-symbols';
import {
  ArrowUpRight,
  Bell,
  Calendar,
  CalendarPlus,
  Camera,
  Car,
  ChartBar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Ellipsis,
  Euro,
  Eye,
  Flag,
  Gauge,
  Lock,
  MessageSquare,
  Mic,
  MicOff,
  Package,
  Paperclip,
  Pause,
  Phone,
  PhoneCall,
  Play,
  PhoneOff,
  Plus,
  RotateCcw,
  RotateCw,
  Search,
  Settings,
  Sparkles,
  TriangleAlert,
  Undo2,
  Users,
  Volume2,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { Platform } from 'react-native';

import { useTheme } from '@/theme/tokens';

export type NomIcone =
  | 'planning'
  | 'clients'
  | 'appels'
  | 'activite'
  | 'cloche'
  | 'plus'
  | 'chevron.droite'
  | 'chevron.gauche'
  | 'chevron.bas'
  | 'fermer'
  | 'valider'
  | 'voiture'
  | 'cle'
  | 'camera'
  | 'piece-jointe'
  | 'cadenas'
  | 'reglages'
  | 'recherche'
  | 'alerte'
  | 'horloge'
  | 'lien'
  | 'telephone'
  | 'message'
  | 'pause'
  | 'oeil'
  | 'menu'
  | 'drapeau'
  | 'lecture'
  | 'reculer'
  | 'avancer'
  | 'micro'
  | 'micro.coupe'
  | 'haut-parleur'
  | 'decrocher'
  | 'raccrocher'
  | 'compteur'
  | 'annuler'
  | 'colis'
  | 'euro'
  | 'calendrier'
  | 'redaction';

const SF: Record<NomIcone, string> = {
  planning: 'calendar',
  clients: 'person.2',
  appels: 'phone',
  activite: 'chart.bar',
  cloche: 'bell',
  plus: 'plus',
  'chevron.droite': 'chevron.right',
  'chevron.gauche': 'chevron.left',
  'chevron.bas': 'chevron.down',
  fermer: 'xmark',
  valider: 'checkmark',
  voiture: 'car',
  cle: 'wrench.and.screwdriver',
  camera: 'camera',
  'piece-jointe': 'paperclip',
  cadenas: 'lock',
  reglages: 'gearshape',
  recherche: 'magnifyingglass',
  alerte: 'exclamationmark.triangle',
  horloge: 'clock',
  lien: 'arrow.up.right',
  telephone: 'phone.arrow.up.right',
  message: 'message',
  pause: 'pause.fill',
  oeil: 'eye',
  menu: 'ellipsis',
  drapeau: 'flag.fill',
  lecture: 'play.fill',
  reculer: 'gobackward.10',
  avancer: 'goforward.10',
  micro: 'mic.fill',
  'micro.coupe': 'mic.slash.fill',
  'haut-parleur': 'speaker.wave.2.fill',
  decrocher: 'phone.fill',
  raccrocher: 'phone.down.fill',
  compteur: 'gauge.with.dots.needle.33percent',
  annuler: 'arrow.uturn.backward',
  colis: 'shippingbox',
  euro: 'eurosign',
  calendrier: 'calendar.badge.plus',
  redaction: 'sparkles',
};

const LUCIDE: Record<NomIcone, LucideIcon> = {
  planning: Calendar,
  clients: Users,
  appels: Phone,
  activite: ChartBar,
  cloche: Bell,
  plus: Plus,
  'chevron.droite': ChevronRight,
  'chevron.gauche': ChevronLeft,
  'chevron.bas': ChevronDown,
  fermer: X,
  valider: Check,
  voiture: Car,
  cle: Wrench,
  camera: Camera,
  'piece-jointe': Paperclip,
  cadenas: Lock,
  reglages: Settings,
  recherche: Search,
  alerte: TriangleAlert,
  horloge: Clock,
  lien: ArrowUpRight,
  telephone: PhoneCall,
  message: MessageSquare,
  pause: Pause,
  oeil: Eye,
  menu: Ellipsis,
  drapeau: Flag,
  lecture: Play,
  reculer: RotateCcw,
  avancer: RotateCw,
  micro: Mic,
  'micro.coupe': MicOff,
  'haut-parleur': Volume2,
  decrocher: Phone,
  raccrocher: PhoneOff,
  compteur: Gauge,
  annuler: Undo2,
  colis: Package,
  euro: Euro,
  calendrier: CalendarPlus,
  redaction: Sparkles,
};

/** Nom SF Symbol pour les onglets natifs. */
export const sfSymbol = (nom: NomIcone) => SF[nom];

type Props = { nom: NomIcone; taille?: number; couleur?: string; poids?: SymbolWeight };

export function Icone({ nom, taille = 20, couleur, poids = 'medium' }: Props) {
  const t = useTheme();
  const c = couleur ?? t.ink;
  if (Platform.OS === 'ios') {
    return <SymbolView name={SF[nom] as never} size={taille} tintColor={c} weight={poids} resizeMode="scaleAspectFit" />;
  }
  const L = LUCIDE[nom];
  return <L size={taille} color={c} strokeWidth={poids === 'bold' ? 2.5 : 2} />;
}
