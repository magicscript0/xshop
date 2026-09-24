import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, BadgePercent, Boxes, PackageOpen,
  ShieldCheck, ShoppingCart, Users, Wallet2, Gift,
} from 'lucide-react';
import { adminService } from '../../services/adminService';
import { formatMoney, formatNumber } from '../../lib/format';
import { AdminCard, AdminTable, EmptyNote, ErrorNote, LoadingNote, StatCard } from '../../components/admin/AdminUI';

const revenueSummary = (revenue) => {
  const entries = Object.entries(revenue ?? {});
  if (!entries.length) return 'No verified revenue yet';
  return entries.map(([currency, total]) => formatMoney(total, currency)).join(' · ');
};

const AdminOverview = () => {
  const [metrics, setMetrics] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [inventory, setInventory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([
      adminService.getDashboardMetrics(),
      adminService.getSalesAnalytics(30),
      adminService.getInventorySummary(),
    ])
      .then(([metricsData, analyticsData, inventoryData]) => {
        setMetrics(metricsData);
        setAnalytics(analyticsData);
        setInventory(inventoryData);
      })
      .catch((loadError) => setError(loadError.message || 'The dashboard could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingNote label="Loading store metrics…" />;
  if (error) return <ErrorNote message={error} onRetry={load} />;

  const orders = metrics?.orders ?? {};
  const lowStock = [
    ...(inventory?.digital ?? []).filter((row) => row.low_stock),
    ...(inventory?.tracked ?? []).filter((row) => row.low_stock),
  ];
  const daily = analytics?.daily ?? [];
  const recentDays = daily.slice(-14);
  const topProducts = analytics?.top_products ?? [];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={ShoppingCart} label="Total orders" value={formatNumber(orders.total)} hint={`${formatNumber(orders.verified)} verified · ${formatNumber(orders.fulfilled)} fulfilled`} />
        <StatCard icon={ShieldCheck} label="Awaiting payment review" value={formatNumber(metrics?.payment_review_queue)} hint={`${formatNumber(orders.pending)} sessions pending payment`} tone={Number(metrics?.payment_review_queue) > 0 ? 'amber' : 'purple'} />
        <StatCard icon={Wallet2} label="Verified revenue" value={revenueSummary(metrics?.revenue)} hint="Sum of verified orders, per currency" />
        <StatCard icon={Users} label="Customers" value={formatNumber(metrics?.customers)} hint="All registered profiles" />
        <StatCard icon={PackageOpen} label="Published products" value={formatNumber(metrics?.products?.active_public)} hint={`${formatNumber(metrics?.products?.total)} total · ${formatNumber(metrics?.products?.draft)} draft`} />
        <StatCard icon={Boxes} label="Inventory available" value={formatNumber(metrics?.inventory?.available)} hint={`${formatNumber(metrics?.inventory?.reserved)} reserved · ${formatNumber(metrics?.inventory?.assigned)} sold`} />
        <StatCard icon={BadgePercent} label="Coupon redemptions" value={formatNumber(metrics?.coupons?.redemptions)} hint={`${formatNumber(metrics?.coupons?.active)} active coupons`} />
        <StatCard icon={Gift} label="Reward points issued" value={formatNumber(metrics?.rewards?.points_issued)} hint={`${formatNumber(metrics?.rewards?.points_spent)} spent · ${formatNumber(metrics?.referrals?.qualified)} referrals qualified`} />
      </div>

      {lowStock.length > 0 && (
        <AdminCard
          title="Inventory needs attention"
          description={`Options at or below the low-stock threshold (${inventory?.threshold}).`}
          actions={<Link to="/admin/inventory" className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-200 transition hover:text-white">Manage inventory <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>}
        >
          <ul className="space-y-2">
            {lowStock.slice(0, 8).map((row) => (
              <li key={row.price_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300/15 bg-amber-400/[0.05] px-4 py-2.5 text-sm">
                <span className="flex items-center gap-2 text-amber-100">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {row.product_name}{row.variant_name ? ` — ${row.variant_name}` : ''}
                </span>
                <span className="text-xs text-amber-200/90">
                  {row.stock_on_hand != null ? `${formatNumber(row.stock_on_hand)} tracked units` : `${formatNumber(row.available)} codes available`}
                </span>
              </li>
            ))}
          </ul>
        </AdminCard>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <AdminCard title="Last 14 days" description="Orders created and verified per day. Empty days simply have no orders.">
          {recentDays.length === 0 ? (
            <EmptyNote title="No orders yet" description="Daily activity appears once real orders exist." />
          ) : (
            <AdminTable headers={['Day', 'Created', 'Verified', 'Verified total']} caption="Daily order activity">
              {recentDays.map((day) => (
                <tr key={day.day}>
                  <td className="px-3 py-2.5 text-gray-300">{day.day}</td>
                  <td className="px-3 py-2.5 text-gray-300">{formatNumber(day.orders_created)}</td>
                  <td className="px-3 py-2.5 text-gray-300">{formatNumber(day.orders_verified)}</td>
                  <td className="px-3 py-2.5 text-white">{formatNumber(day.verified_total)}</td>
                </tr>
              ))}
            </AdminTable>
          )}
        </AdminCard>

        <AdminCard title="Top products (30 days)" description="Ranked by verified revenue.">
          {topProducts.length === 0 ? (
            <EmptyNote title="No verified sales yet" description="Product performance appears after verified orders exist." />
          ) : (
            <AdminTable headers={['Product', 'Quantity', 'Revenue']} caption="Top products by verified revenue">
              {topProducts.map((product) => (
                <tr key={`${product.product_name}-${product.currency_code}`}>
                  <td className="px-3 py-2.5 text-gray-200">{product.product_name}</td>
                  <td className="px-3 py-2.5 text-gray-300">{formatNumber(product.quantity)}</td>
                  <td className="px-3 py-2.5 text-white">{formatMoney(product.revenue, product.currency_code)}</td>
                </tr>
              ))}
            </AdminTable>
          )}
        </AdminCard>
      </div>
    </div>
  );
};

export default AdminOverview;
