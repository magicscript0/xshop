import { isSupabaseConfigured, supabase } from '../lib/supabase/client';

const requireStore = () => {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Rewards and referrals are not connected in this environment. Configure Supabase to continue.');
  }
  return supabase;
};

const callRpc = async (name, args, fallback) => {
  const client = requireStore();
  const { data, error } = await client.rpc(name, args);
  if (error) {
    const message = typeof error.message === 'string' ? error.message : '';
    const lowered = message.toLowerCase();
    if (lowered.includes('authentication')) throw new Error('Sign in to continue.');
    if (lowered.includes('too many requests')) throw new Error('Too many requests. Please wait a moment and try again.');
    // Business-rule errors raised by the database are safe, human-readable messages.
    if (error.code && ['P0001', '22023'].includes(error.code)) throw new Error(message || fallback);
    throw new Error(fallback);
  }
  return data;
};

export const growthService = {
  async previewCoupon(code) {
    return callRpc('preview_coupon', { _code: code }, 'This coupon could not be checked. Please try again.');
  },

  async getMyRewards() {
    return callRpc('get_my_rewards', {}, 'Your rewards could not be loaded.');
  },

  async getMyReferralCode() {
    return callRpc('get_my_referral_code', {}, 'Your referral code could not be loaded.');
  },

  async applyReferralCode(code) {
    return callRpc('apply_referral_code', { _code: code }, 'This referral code could not be applied.');
  },
};
