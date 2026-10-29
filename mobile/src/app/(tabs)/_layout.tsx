import AppTabs from '@/components/app-tabs';
import { useNotificationsQuiSuivent } from '@/components/notifications/traitees';

/** Les quatre onglets. L'implémentation dépend de la plateforme (voir components/app-tabs*). */
export default function TabsLayout() {
  useNotificationsQuiSuivent();
  return <AppTabs />;
}
