import { LockKeyhole } from 'lucide-react';
import StoreEmptyState from '../../components/store/StoreEmptyState';
import StorePageShell from '../../components/store/StorePageShell';

const AdminUnavailable = () => (
  <StorePageShell
    eyebrow="XSHOP / ADMIN"
    title="Admin tools are not enabled"
    description="No full administration dashboard is included in this phase. Payment review, inventory import, and manual fulfillment remain restricted to trusted database roles."
  >
    <StoreEmptyState
      icon={LockKeyhole}
      title="Administration stays server-controlled"
      description="No admin dashboard is exposed here. Sensitive payment verification, digital-inventory import, and manual-delivery RPCs enforce admin roles inside Supabase; this placeholder grants no elevated access."
      actionLabel="Return to the storefront"
      actionTo="/"
    />
  </StorePageShell>
);

export default AdminUnavailable;
