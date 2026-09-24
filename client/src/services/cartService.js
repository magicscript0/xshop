import { isSupabaseConfigured, supabase } from '../lib/supabase/client';

const requireStore = () => {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Your cart is not connected in this environment. Configure Supabase to continue.');
  }
  return supabase;
};

const rpcError = (error, fallback) => {
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  if (message.includes('unavailable') || message.includes('availability')) return 'This product option is no longer available in the requested quantity.';
  if (message.includes('quantity')) return 'Choose a quantity from 1 to 20 and try again.';
  if (message.includes('authentication')) return 'Sign in to use your saved cart.';
  if (message.includes('empty')) return 'Your cart is empty.';
  if (message.includes('currency')) return 'All items in an order must use the same currency.';
  return fallback;
};

const callRpc = async (name, args, fallback) => {
  const client = requireStore();
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(rpcError(error, fallback));
  return data;
};

export const cartService = {
  async getMyCart() {
    return callRpc('get_my_cart', {}, 'Your cart could not be loaded. Please try again.');
  },

  async addItem(productId, variantId, quantity = 1) {
    return callRpc('cart_add_item', {
      _product_id: productId,
      _variant_id: variantId ?? null,
      _quantity: quantity,
    }, 'This product could not be added to your cart. Please try again.');
  },

  async updateItem(itemId, quantity) {
    return callRpc('cart_update_item', {
      _item_id: itemId,
      _quantity: quantity,
    }, 'This cart item could not be updated. Please try again.');
  },

  async removeItem(itemId) {
    return callRpc('cart_remove_item', { _item_id: itemId }, 'This cart item could not be removed. Please try again.');
  },
};
