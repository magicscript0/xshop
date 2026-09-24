import { isSupabaseConfigured, supabase } from '../lib/supabase/client';
import { catalogService } from './catalogService';

const ORDER_FIELDS = 'id,created_at,updated_at,contact_email,currency_code,subtotal_amount,discount_amount,total_amount,payment_status,fulfillment_status';

const requireStore = () => {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Your XSHOP account services are not connected in this environment. Configure Supabase to continue.');
  }
  return supabase;
};

const throwServiceError = (error, fallback) => {
  if (!error) return;
  const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
  if (message.includes('not found')) throw new Error('This record is unavailable or does not belong to your account.');
  if (message.includes('authentication')) throw new Error('Sign in to continue.');
  throw new Error(fallback);
};

const callRpc = async (name, args, fallback) => {
  const client = requireStore();
  const { data, error } = await client.rpc(name, args);
  throwServiceError(error, fallback);
  return data;
};

export const customerService = {
  async createOrderFromCart(contactEmail, idempotencyKey) {
    return callRpc('create_order_from_cart', {
      _contact_email: contactEmail,
      _idempotency_key: idempotencyKey,
    }, 'Your order could not be created. Review your cart and try again.');
  },

  async listOrders() {
    const client = requireStore();
    const { data, error } = await client
      .from('orders')
      .select(ORDER_FIELDS)
      .order('created_at', { ascending: false })
      .limit(100);
    throwServiceError(error, 'Your order history could not be loaded.');
    return data ?? [];
  },

  async getOrderDetails(orderId) {
    const client = requireStore();
    // Expiry is evaluated by the database clock. Failure to run this convenience
    // cleanup does not bypass order ownership or payment-session checks.
    await client.rpc('expire_my_payment_sessions');

    const { data: order, error: orderError } = await client
      .from('orders')
      .select(ORDER_FIELDS)
      .eq('id', orderId)
      .maybeSingle();
    throwServiceError(orderError, 'This order could not be loaded.');
    if (!order) return null;

    const [itemsResult, sessionsResult, fulfillmentsResult] = await Promise.all([
      client.from('order_items')
        .select('id,product_id,product_price_id,variant_id,product_name_snapshot,variant_name_snapshot,sku_snapshot,denomination_value_snapshot,quantity,unit_price_amount,unit_discount_amount,line_total_amount,currency_code,created_at')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true }),
      client.from('payment_sessions')
        .select('id,method_id,asset_code,network_code,expected_amount,order_currency_code,receiving_address,asset_decimals,status,transaction_hash,created_at,expires_at,submitted_at,verified_at,rejection_reason')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false }),
      client.from('fulfillments')
        .select('id,status,failure_code,created_at,updated_at,fulfilled_at')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false })
        .limit(1),
    ]);

    throwServiceError(itemsResult.error, 'Order items could not be loaded.');
    throwServiceError(sessionsResult.error, 'Payment information could not be loaded.');
    throwServiceError(fulfillmentsResult.error, 'Fulfillment information could not be loaded.');

    const fulfillment = fulfillmentsResult.data?.[0] ?? null;
    let fulfillmentItems = [];
    let fulfillmentEvents = [];
    if (fulfillment) {
      const [deliveryResult, eventResult] = await Promise.all([
        client.from('fulfillment_items')
          .select('id,order_item_id,delivery_index,digital_inventory_id,manual_delivery_content,created_at')
          .eq('fulfillment_id', fulfillment.id)
          .order('order_item_id', { ascending: true })
          .order('delivery_index', { ascending: true }),
        client.from('fulfillment_events')
          .select('id,event_type,from_status,to_status,created_at')
          .eq('fulfillment_id', fulfillment.id)
          .order('created_at', { ascending: true }),
      ]);
      throwServiceError(deliveryResult.error, 'Digital deliveries could not be loaded.');
      throwServiceError(eventResult.error, 'Fulfillment history could not be loaded.');
      fulfillmentItems = deliveryResult.data ?? [];
      fulfillmentEvents = eventResult.data ?? [];

      const inventoryIds = fulfillmentItems.map((item) => item.digital_inventory_id).filter(Boolean);
      if (inventoryIds.length) {
        const { data: inventoryRows, error: inventoryError } = await client
          .from('digital_inventory')
          .select('id,delivery_payload')
          .in('id', inventoryIds);
        throwServiceError(inventoryError, 'Digital deliveries could not be loaded.');
        const inventoryById = new Map((inventoryRows ?? []).map((row) => [row.id, row.delivery_payload]));
        fulfillmentItems = fulfillmentItems.map((item) => ({
          ...item,
          delivery_payload: item.digital_inventory_id ? inventoryById.get(item.digital_inventory_id) ?? null : item.manual_delivery_content,
        }));
      } else {
        fulfillmentItems = fulfillmentItems.map((item) => ({ ...item, delivery_payload: item.manual_delivery_content }));
      }
    }

    return {
      ...order,
      items: itemsResult.data ?? [],
      payment_sessions: sessionsResult.data ?? [],
      fulfillment,
      fulfillment_items: fulfillmentItems,
      fulfillment_events: fulfillmentEvents,
    };
  },

  async listWishlist() {
    const client = requireStore();
    const { data: items, error: wishlistError } = await client
      .from('wishlist_items')
      .select('id,product_id,created_at')
      .order('created_at', { ascending: false });
    throwServiceError(wishlistError, 'Your wishlist could not be loaded.');
    if (!items?.length) return [];

    const productIds = [...new Set(items.map((item) => item.product_id))];
    const { data: products, error: productError } = await client
      .from('products')
      .select('id,slug')
      .in('id', productIds);
    throwServiceError(productError, 'Wishlist products could not be loaded.');
    const slugById = new Map((products ?? []).map((product) => [product.id, product.slug]));
    const productBySlug = new Map();
    await Promise.all([...new Set((products ?? []).map((product) => product.slug))].map(async (slug) => {
      productBySlug.set(slug, await catalogService.getProductBySlug(slug));
    }));

    return items
      .map((item) => ({ ...item, product: productBySlug.get(slugById.get(item.product_id)) ?? null }))
      .filter((item) => item.product);
  },

  async addToWishlist(productId) {
    return callRpc('wishlist_add_product', { _product_id: productId }, 'This product could not be saved to your wishlist.');
  },

  async removeFromWishlist(productId) {
    return callRpc('wishlist_remove_product', { _product_id: productId }, 'This product could not be removed from your wishlist.');
  },

  async listNotifications() {
    const client = requireStore();
    const { data, error } = await client
      .from('customer_notifications')
      .select('id,notification_type,title,message,related_order_id,read_at,created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    throwServiceError(error, 'Your notifications could not be loaded.');
    return data ?? [];
  },

  async markNotificationRead(notificationId) {
    return callRpc('notification_mark_read', { _notification_id: notificationId }, 'This notification could not be updated.');
  },

  async listPaymentMethods(currencyCode) {
    const client = requireStore();
    const { data, error } = await client
      .from('payment_methods')
      .select('id,asset_code,network_code,display_name,fiat_currency_code,asset_decimals,receiving_address')
      .eq('status', 'active')
      .eq('fiat_currency_code', currencyCode)
      .order('asset_code', { ascending: true })
      .order('network_code', { ascending: true });
    throwServiceError(error, 'Configured payment methods could not be loaded.');
    return data ?? [];
  },

  async createPaymentSession(orderId, methodId) {
    return callRpc('create_payment_session', {
      _order_id: orderId,
      _method_id: methodId,
    }, 'A payment session could not be created. Confirm the order and configured payment method, then try again.');
  },

  async submitPaymentTransaction(sessionId, transactionHash) {
    return callRpc('submit_payment_transaction', {
      _session_id: sessionId,
      _transaction_hash: transactionHash,
    }, 'The transaction reference could not be submitted. Check the hash and session expiry, then try again.');
  },
};

export { ORDER_FIELDS };
