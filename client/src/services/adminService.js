import { isSupabaseConfigured, supabase } from '../lib/supabase/client';

const requireStore = () => {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Admin tools are not connected in this environment. Configure Supabase to continue.');
  }
  return supabase;
};

// Client-side messages only; the database raises its own authoritative errors.
const throwServiceError = (error, fallback) => {
  if (!error) return;
  const message = typeof error.message === 'string' ? error.message : '';
  const lowered = message.toLowerCase();
  if (lowered.includes('not authorized')) throw new Error('Your account is not authorized for this operation.');
  if (lowered.includes('too many requests')) throw new Error('Too many requests. Please wait a moment and try again.');
  if (lowered.includes('row-level security') || lowered.includes('permission denied')) {
    throw new Error('Your account is not authorized for this operation.');
  }
  // Raised business-rule messages from RPCs are safe and human-readable.
  if (error.code && String(error.code).startsWith('P0')) throw new Error(message || fallback);
  if (error.code === '22023' || error.code === '54000' || error.code === '42501') throw new Error(message || fallback);
  if (error.code === '23505') throw new Error('A record with the same unique value already exists (check slug, code, or SKU).');
  if (error.code === '23514') throw new Error('A field value is outside the allowed range. Review the form and try again.');
  throw new Error(fallback);
};

const rpc = async (name, args, fallback) => {
  const client = requireStore();
  const { data, error } = await client.rpc(name, args);
  throwServiceError(error, fallback);
  return data;
};

const ADMIN_ORDER_FIELDS = 'id,customer_id,created_at,updated_at,contact_email,currency_code,subtotal_amount,discount_amount,coupon_code_snapshot,coupon_discount_amount,reward_points_redeemed,reward_discount_amount,total_amount,payment_status,fulfillment_status';

export const adminService = {
  // ---- Overview / analytics -------------------------------------------------
  async getDashboardMetrics() {
    return rpc('admin_dashboard_metrics', {}, 'Store metrics could not be loaded.');
  },

  async getSalesAnalytics(days = 30) {
    return rpc('admin_sales_analytics', { _days: days }, 'Analytics could not be loaded.');
  },

  // ---- Categories -----------------------------------------------------------
  async listCategoriesAdmin() {
    const client = requireStore();
    const { data, error } = await client
      .from('categories')
      .select('id,name,slug,description,status,visibility,sort_order,created_at,updated_at')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    throwServiceError(error, 'Categories could not be loaded.');
    return data ?? [];
  },

  async saveCategory(category) {
    const client = requireStore();
    const payload = {
      name: category.name?.trim(),
      slug: category.slug?.trim(),
      description: category.description?.trim() || null,
      status: category.status,
      visibility: category.visibility,
      sort_order: Number.isFinite(Number(category.sort_order)) ? Number(category.sort_order) : 0,
    };
    const query = category.id
      ? client.from('categories').update(payload).eq('id', category.id)
      : client.from('categories').insert(payload);
    const { data, error } = await query.select().maybeSingle();
    throwServiceError(error, 'The category could not be saved.');
    return data;
  },

  // ---- Products ---------------------------------------------------------------
  async listProductsAdmin() {
    const client = requireStore();
    const { data, error } = await client
      .from('products')
      .select('id,slug,name,short_description,product_type,currency_code,status,visibility,resale_rights_verified,sort_order,created_at,updated_at')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(500);
    throwServiceError(error, 'Products could not be loaded.');
    return data ?? [];
  },

  async getProductAdmin(productId) {
    const client = requireStore();
    const [productResult, variantResult, priceResult, mediaResult, dealResult, linkResult] = await Promise.all([
      client.from('products').select('*').eq('id', productId).maybeSingle(),
      client.from('product_variants').select('*').eq('product_id', productId).order('sort_order').order('created_at'),
      client.from('product_prices').select('*').eq('product_id', productId).order('created_at'),
      client.from('product_media').select('*').eq('product_id', productId).order('sort_order').order('created_at'),
      client.from('product_deals').select('*').eq('product_id', productId).order('created_at', { ascending: false }),
      client.from('product_categories').select('category_id').eq('product_id', productId),
    ]);
    throwServiceError(productResult.error, 'The product could not be loaded.');
    if (!productResult.data) throw new Error('Product not found.');
    throwServiceError(variantResult.error, 'Product variants could not be loaded.');
    throwServiceError(priceResult.error, 'Product prices could not be loaded.');
    throwServiceError(mediaResult.error, 'Product media could not be loaded.');
    throwServiceError(dealResult.error, 'Product deals could not be loaded.');
    throwServiceError(linkResult.error, 'Product categories could not be loaded.');
    return {
      product: productResult.data,
      variants: variantResult.data ?? [],
      prices: priceResult.data ?? [],
      media: (mediaResult.data ?? []).map((item) => ({
        ...item,
        url: supabase?.storage.from(item.bucket_id).getPublicUrl(item.object_path).data?.publicUrl ?? null,
      })),
      deals: dealResult.data ?? [],
      categoryIds: (linkResult.data ?? []).map((row) => row.category_id),
    };
  },

  async saveProduct(product, actorId) {
    const client = requireStore();
    const verified = Boolean(product.resale_rights_verified);
    const payload = {
      name: product.name?.trim(),
      slug: product.slug?.trim(),
      short_description: product.short_description?.trim() || null,
      description: product.description?.trim() || null,
      product_type: product.product_type,
      currency_code: product.currency_code?.trim().toUpperCase(),
      status: product.status,
      visibility: product.visibility,
      sort_order: Number.isFinite(Number(product.sort_order)) ? Number(product.sort_order) : 0,
      resale_rights_verified: verified,
      resale_rights_verified_by: verified ? (product.resale_rights_verified_by || actorId) : null,
      resale_rights_verified_at: verified ? (product.resale_rights_verified_at || new Date().toISOString()) : null,
    };
    const query = product.id
      ? client.from('products').update(payload).eq('id', product.id)
      : client.from('products').insert(payload);
    const { data, error } = await query.select().maybeSingle();
    throwServiceError(error, 'The product could not be saved.');
    return data;
  },

  async setProductCategories(productId, categoryIds) {
    const client = requireStore();
    const { data: current, error: readError } = await client
      .from('product_categories').select('category_id').eq('product_id', productId);
    throwServiceError(readError, 'Product categories could not be loaded.');
    const existing = new Set((current ?? []).map((row) => row.category_id));
    const wanted = new Set(categoryIds);
    const toAdd = [...wanted].filter((id) => !existing.has(id));
    const toRemove = [...existing].filter((id) => !wanted.has(id));
    if (toAdd.length) {
      const { error } = await client.from('product_categories')
        .insert(toAdd.map((categoryId) => ({ product_id: productId, category_id: categoryId })));
      throwServiceError(error, 'Category assignments could not be saved.');
    }
    if (toRemove.length) {
      const { error } = await client.from('product_categories')
        .delete().eq('product_id', productId).in('category_id', toRemove);
      throwServiceError(error, 'Category assignments could not be removed.');
    }
  },

  async saveVariant(variant) {
    const client = requireStore();
    const payload = {
      product_id: variant.product_id,
      variant_name: variant.variant_name?.trim(),
      sku: variant.sku?.trim() || null,
      denomination_value: variant.denomination_value === '' || variant.denomination_value == null ? null : Number(variant.denomination_value),
      status: variant.status,
      sort_order: Number.isFinite(Number(variant.sort_order)) ? Number(variant.sort_order) : 0,
    };
    const query = variant.id
      ? client.from('product_variants').update(payload).eq('id', variant.id)
      : client.from('product_variants').insert(payload);
    const { data, error } = await query.select().maybeSingle();
    throwServiceError(error, 'The variant could not be saved.');
    return data;
  },

  async savePrice(price) {
    const client = requireStore();
    const availability = price.availability_mode;
    const payload = {
      product_id: price.product_id,
      variant_id: price.variant_id || null,
      amount: Number(price.amount),
      availability_mode: availability,
      stock_on_hand: availability === 'tracked' ? Math.max(0, Math.trunc(Number(price.stock_on_hand ?? 0))) : null,
      fulfillment_mode: availability === 'digital' ? 'inventory' : 'manual',
    };
    if (!Number.isFinite(payload.amount) || payload.amount <= 0) throw new Error('Enter a price greater than zero.');
    const query = price.id
      ? client.from('product_prices').update(payload).eq('id', price.id)
      : client.from('product_prices').insert(payload);
    const { data, error } = await query.select().maybeSingle();
    throwServiceError(error, 'The price could not be saved.');
    return data;
  },

  async deletePrice(priceId) {
    const client = requireStore();
    const { error } = await client.from('product_prices').delete().eq('id', priceId);
    throwServiceError(error, 'This price is referenced by orders or inventory and cannot be deleted. Archive the product instead.');
  },

  async deleteVariant(variantId) {
    const client = requireStore();
    const { error } = await client.from('product_variants').delete().eq('id', variantId);
    throwServiceError(error, 'This variant is referenced by existing records and cannot be deleted. Archive it instead.');
  },

  async saveDeal(deal) {
    const client = requireStore();
    const payload = {
      product_id: deal.product_id,
      variant_id: deal.variant_id || null,
      discount_type: deal.discount_type,
      discount_value: Number(deal.discount_value),
      currency_code: deal.discount_type === 'amount' ? deal.currency_code?.trim().toUpperCase() : null,
      status: deal.status,
      starts_at: deal.starts_at || null,
      ends_at: deal.ends_at || null,
      priority: Number.isFinite(Number(deal.priority)) ? Number(deal.priority) : 0,
    };
    const query = deal.id
      ? client.from('product_deals').update(payload).eq('id', deal.id)
      : client.from('product_deals').insert(payload);
    const { data, error } = await query.select().maybeSingle();
    throwServiceError(error, 'The deal could not be saved.');
    return data;
  },

  async deleteDeal(dealId) {
    const client = requireStore();
    const { error } = await client.from('product_deals').delete().eq('id', dealId);
    throwServiceError(error, 'The deal could not be deleted.');
  },

  async uploadProductMedia(productId, file, altText) {
    const client = requireStore();
    if (!file || !file.type?.startsWith('image/')) throw new Error('Choose an image file.');
    if (file.size > 10 * 1024 * 1024) throw new Error('Images must be 10 MB or smaller.');
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-80);
    const objectPath = `products/${productId}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await client.storage.from('product-media').upload(objectPath, file, { upsert: false });
    if (uploadError) throw new Error('The image could not be uploaded. Confirm your admin role and storage configuration.');
    const { data, error } = await client.from('product_media')
      .insert({ product_id: productId, object_path: objectPath, alt_text: altText?.trim() || null })
      .select().maybeSingle();
    throwServiceError(error, 'The image record could not be saved.');
    return data;
  },

  async deleteProductMedia(mediaItem) {
    const client = requireStore();
    const { error } = await client.from('product_media').delete().eq('id', mediaItem.id);
    throwServiceError(error, 'The image could not be removed.');
    await client.storage.from(mediaItem.bucket_id).remove([mediaItem.object_path]).catch(() => {});
  },

  // ---- Orders -----------------------------------------------------------------
  async listOrdersAdmin({ paymentStatus = null, limit = 50, offset = 0 } = {}) {
    const client = requireStore();
    let query = client.from('orders').select(ADMIN_ORDER_FIELDS, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (paymentStatus) query = query.eq('payment_status', paymentStatus);
    const { data, error, count } = await query;
    throwServiceError(error, 'Orders could not be loaded.');
    return { orders: data ?? [], totalCount: count ?? 0 };
  },

  async getOrderAdmin(orderId) {
    const client = requireStore();
    const { data: order, error: orderError } = await client
      .from('orders').select(ADMIN_ORDER_FIELDS).eq('id', orderId).maybeSingle();
    throwServiceError(orderError, 'The order could not be loaded.');
    if (!order) throw new Error('Order not found.');

    const [items, sessions, events, fulfillments, profile] = await Promise.all([
      client.from('order_items').select('*').eq('order_id', orderId).order('created_at'),
      client.from('payment_sessions').select('*').eq('order_id', orderId).order('created_at', { ascending: false }),
      client.from('payment_events').select('*').eq('order_id', orderId).order('created_at'),
      client.from('fulfillments').select('id,status,failure_code,created_at,updated_at,fulfilled_at').eq('order_id', orderId).limit(1),
      client.from('profiles').select('id,email,display_name,role').eq('id', order.customer_id).maybeSingle(),
    ]);
    throwServiceError(items.error, 'Order items could not be loaded.');
    throwServiceError(sessions.error, 'Payment sessions could not be loaded.');
    throwServiceError(events.error, 'Payment history could not be loaded.');
    throwServiceError(fulfillments.error, 'Fulfillment information could not be loaded.');

    const priceIds = [...new Set((items.data ?? []).map((item) => item.product_price_id))];
    let priceModes = new Map();
    if (priceIds.length) {
      const { data: prices, error: priceError } = await client
        .from('product_prices').select('id,availability_mode,fulfillment_mode').in('id', priceIds);
      throwServiceError(priceError, 'Order item configuration could not be loaded.');
      priceModes = new Map((prices ?? []).map((price) => [price.id, price]));
    }

    return {
      ...order,
      customer: profile.data ?? null,
      items: (items.data ?? []).map((item) => ({
        ...item,
        availability_mode: priceModes.get(item.product_price_id)?.availability_mode ?? null,
        fulfillment_mode: priceModes.get(item.product_price_id)?.fulfillment_mode ?? null,
      })),
      payment_sessions: sessions.data ?? [],
      payment_events: events.data ?? [],
      fulfillment: fulfillments.data?.[0] ?? null,
    };
  },

  async reviewPayment(sessionId, approve, rejectionReason) {
    return rpc('verify_payment_session', {
      _session_id: sessionId,
      _approve: approve,
      _rejection_reason: rejectionReason ?? null,
    }, 'The payment review could not be recorded.');
  },

  async manualFulfill(orderId, deliveries) {
    return rpc('fulfillment_manual_complete', {
      _order_id: orderId,
      _deliveries: deliveries,
    }, 'Manual fulfillment could not be completed.');
  },

  async listReviewQueue() {
    const client = requireStore();
    const { data, error } = await client
      .from('payment_sessions')
      .select('id,order_id,customer_id,asset_code,network_code,expected_amount,order_currency_code,receiving_address,asset_decimals,status,transaction_hash,created_at,expires_at,submitted_at')
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: true });
    throwServiceError(error, 'The payment review queue could not be loaded.');
    return data ?? [];
  },

  // ---- Payment methods ----------------------------------------------------------
  async listPaymentMethodsAdmin() {
    const client = requireStore();
    const { data, error } = await client.from('payment_methods').select('*')
      .order('asset_code').order('network_code');
    throwServiceError(error, 'Payment methods could not be loaded.');
    return data ?? [];
  },

  async savePaymentMethod(method) {
    const client = requireStore();
    const payload = {
      asset_code: method.asset_code,
      network_code: method.network_code,
      display_name: method.display_name?.trim(),
      fiat_currency_code: method.fiat_currency_code?.trim().toUpperCase(),
      crypto_units_per_fiat: Number(method.crypto_units_per_fiat),
      asset_decimals: Math.trunc(Number(method.asset_decimals)),
      receiving_address: method.receiving_address?.trim(),
      status: method.status,
      starts_at: method.starts_at || null,
      ends_at: method.ends_at || null,
    };
    const query = method.id
      ? client.from('payment_methods').update(payload).eq('id', method.id)
      : client.from('payment_methods').insert(payload);
    const { data, error } = await query.select().maybeSingle();
    throwServiceError(error, 'The payment method could not be saved. Check the asset/network pairing and field limits.');
    return data;
  },

  async deletePaymentMethod(methodId) {
    const client = requireStore();
    const { error } = await client.from('payment_methods').delete().eq('id', methodId);
    throwServiceError(error, 'This method is referenced by payment sessions. Disable it instead of deleting.');
  },

  // ---- Digital inventory ----------------------------------------------------------
  async getInventorySummary() {
    return rpc('admin_inventory_summary', {}, 'The inventory summary could not be loaded.');
  },

  async importInventory(priceId, payloads) {
    const batchId = window.crypto?.randomUUID?.();
    if (!batchId) throw new Error('This browser could not create a secure batch id.');
    return rpc('admin_import_digital_inventory', {
      _price_id: priceId,
      _batch_id: batchId,
      _payloads: payloads,
    }, 'The inventory import failed. Check the product option and entries, then try again.');
  },

  async listInventoryBatches() {
    const client = requireStore();
    const { data, error } = await client
      .from('digital_inventory_batches')
      .select('batch_id,product_price_id,payload_count,imported_by,created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    throwServiceError(error, 'Inventory batches could not be loaded.');
    return data ?? [];
  },

  async listInventoryItems(priceId) {
    const client = requireStore();
    // Metadata only — delivery payloads are intentionally not selected here.
    const { data, error } = await client
      .from('digital_inventory')
      .select('id,product_price_id,status,import_batch_id,batch_index,reservation_expires_at,assigned_at,created_at')
      .eq('product_price_id', priceId)
      .order('created_at')
      .limit(500);
    throwServiceError(error, 'Inventory items could not be loaded.');
    return data ?? [];
  },

  async voidInventoryItem(inventoryId, reason) {
    return rpc('admin_void_inventory_item', {
      _inventory_id: inventoryId,
      _reason: reason,
    }, 'This inventory item could not be invalidated.');
  },

  // ---- Customers / roles ----------------------------------------------------------
  async listCustomers({ search = '', limit = 50, offset = 0 } = {}) {
    const client = requireStore();
    let query = client.from('profiles')
      .select('id,email,display_name,phone,role,created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    const term = search.trim();
    if (term) query = query.or(`email.ilike.%${term.replaceAll('%', '')}%,display_name.ilike.%${term.replaceAll('%', '')}%`);
    const { data, error, count } = await query;
    throwServiceError(error, 'Customers could not be loaded.');
    return { customers: data ?? [], totalCount: count ?? 0 };
  },

  async getCustomerDetail(customerId) {
    const client = requireStore();
    const [profile, orders, rewards, referrals] = await Promise.all([
      client.from('profiles').select('id,email,display_name,phone,role,created_at').eq('id', customerId).maybeSingle(),
      client.from('orders').select(ADMIN_ORDER_FIELDS).eq('customer_id', customerId).order('created_at', { ascending: false }).limit(25),
      client.from('reward_transactions').select('id,entry_type,points_delta,description,related_order_id,created_at').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(25),
      client.from('referral_attributions').select('id,status,code_snapshot,created_at,qualified_at').eq('referred_customer_id', customerId),
    ]);
    throwServiceError(profile.error, 'The customer profile could not be loaded.');
    if (!profile.data) throw new Error('Customer not found.');
    return {
      profile: profile.data,
      orders: orders.data ?? [],
      rewards: rewards.data ?? [],
      referral: referrals.data?.[0] ?? null,
      rewardBalance: (rewards.data ?? []).reduce((sum, entry) => sum + entry.points_delta, 0),
    };
  },

  async setUserRole(userId, role) {
    return rpc('admin_set_user_role', { _user_id: userId, _new_role: role }, 'The role change was refused.');
  },

  async adjustRewardPoints(customerId, pointsDelta, reason) {
    return rpc('admin_adjust_reward_points', {
      _customer_id: customerId,
      _points_delta: pointsDelta,
      _reason: reason,
    }, 'The reward adjustment was refused.');
  },

  // ---- Coupons ----------------------------------------------------------------------
  async listCoupons() {
    const client = requireStore();
    const [coupons, redemptions] = await Promise.all([
      client.from('coupons').select('*').order('created_at', { ascending: false }),
      client.from('coupon_redemptions').select('coupon_id,status'),
    ]);
    throwServiceError(coupons.error, 'Coupons could not be loaded.');
    throwServiceError(redemptions.error, 'Coupon usage could not be loaded.');
    const usage = new Map();
    (redemptions.data ?? []).forEach((row) => {
      if (row.status === 'released') return;
      usage.set(row.coupon_id, (usage.get(row.coupon_id) ?? 0) + 1);
    });
    return (coupons.data ?? []).map((coupon) => ({ ...coupon, redemption_count: usage.get(coupon.id) ?? 0 }));
  },

  async saveCoupon(coupon) {
    const client = requireStore();
    const payload = {
      code: coupon.code?.trim().toUpperCase(),
      description: coupon.description?.trim() || null,
      discount_type: coupon.discount_type,
      discount_value: Number(coupon.discount_value),
      currency_code: coupon.discount_type === 'amount' ? coupon.currency_code?.trim().toUpperCase() : null,
      min_order_amount: coupon.min_order_amount === '' || coupon.min_order_amount == null ? null : Number(coupon.min_order_amount),
      max_discount_amount: coupon.max_discount_amount === '' || coupon.max_discount_amount == null ? null : Number(coupon.max_discount_amount),
      usage_limit: coupon.usage_limit === '' || coupon.usage_limit == null ? null : Math.trunc(Number(coupon.usage_limit)),
      per_customer_limit: Math.max(1, Math.trunc(Number(coupon.per_customer_limit || 1))),
      status: coupon.status,
      starts_at: coupon.starts_at || null,
      ends_at: coupon.ends_at || null,
    };
    const query = coupon.id
      ? client.from('coupons').update(payload).eq('id', coupon.id)
      : client.from('coupons').insert(payload);
    const { data, error } = await query.select().maybeSingle();
    throwServiceError(error, 'The coupon could not be saved. Check the code format and limits.');
    return data;
  },

  async deleteCoupon(couponId) {
    const client = requireStore();
    const { error } = await client.from('coupons').delete().eq('id', couponId);
    throwServiceError(error, 'This coupon has redemptions and cannot be deleted. Disable it instead.');
  },

  // ---- Settings / audit -----------------------------------------------------------------
  async listSettings() {
    const client = requireStore();
    const { data, error } = await client.from('store_settings').select('*').order('key');
    throwServiceError(error, 'Store settings could not be loaded.');
    return data ?? [];
  },

  async saveSetting(key, value, extras = {}) {
    const client = requireStore();
    const { data, error } = await client.from('store_settings')
      .upsert({ key, value, ...extras }, { onConflict: 'key' })
      .select().maybeSingle();
    throwServiceError(error, 'The setting could not be saved.');
    return data;
  },

  async listAuditLog({ limit = 100 } = {}) {
    const client = requireStore();
    const { data, error } = await client
      .from('admin_audit_log')
      .select('id,actor_id,action,entity_type,entity_id,metadata,created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    throwServiceError(error, 'The audit log could not be loaded.');
    return data ?? [];
  },
};
