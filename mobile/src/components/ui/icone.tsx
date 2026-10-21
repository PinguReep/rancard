/**
 * Icônes : SF Symbols sur iOS (expo-symbols), Lucide ailleurs. Un seul nom
 * logique par icône pour que les écrans ne connaissent pas la plateforme.
 */

import { SymbolView, type SymbolWeight } from 'expo-symbols';
import {
  ArrowUpRight,
  Bell,
  Calendar,
  Camera,
  Car,
  ChartBar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Ellipsis,
  Eye,
  Flag,
  Lock,
  MessageSquare,
  Paperclip,
  Pause,
  Phone,
  PhoneCall,
  Plus,
  Search,
  Settings,
  TriangleAlert,
  Users,
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
  | 'drapeau';

const SF: Record<NomIcone, string> = {
  planning: 'calendar',
  clients: 'person.2',
  appels: 'phone',
  activite: 'chart.bar',
  cloche: 'bell',
  plus: 'plus',
  'chevron.droite': 'chevron.right',
  'chevron.gauche': 'chevron.left',
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
