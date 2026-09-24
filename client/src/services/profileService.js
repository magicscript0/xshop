import { supabase } from '../lib/supabase/client';

const PROFILE_FIELDS = 'id,email,display_name,avatar_url,phone,role,created_at,updated_at';

export const profileService = {
  async getProfile(userId) {
    if (!supabase || !userId) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_FIELDS)
      .eq('id', userId)
      .maybeSingle();

    if (error) throw new Error('Profile information is temporarily unavailable.');
    return data;
  },

  async updateOwnProfile(userId, changes) {
    if (!supabase || !userId) throw new Error('You must be signed in to update your profile.');

    const updates = {};
    if (Object.hasOwn(changes, 'display_name')) {
      const displayName = typeof changes.display_name === 'string' ? changes.display_name.trim() : '';
      if (displayName.length > 120) throw new Error('Display name must be 120 characters or fewer.');
      updates.display_name = displayName || null;
    }
    if (Object.hasOwn(changes, 'phone')) {
      const phone = typeof changes.phone === 'string' ? changes.phone.trim() : '';
      if (phone.length > 32) throw new Error('Phone number must be 32 characters or fewer.');
      updates.phone = phone || null;
    }
    if (!Object.keys(updates).length) throw new Error('There are no profile changes to save.');

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select(PROFILE_FIELDS)
      .maybeSingle();

    if (error || !data) throw new Error('Profile changes could not be saved. Please try again.');
    return data;
  },
};
