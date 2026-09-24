import { isSupabaseConfigured, supabase } from '../lib/supabase/client';

const FRIENDLY_MESSAGES = {
  invalid_credentials: 'The email or password is incorrect.',
  email_not_confirmed: 'Verify your email address before signing in.',
  user_already_exists: 'We could not create an account with those details. Try signing in or use the password reset link.',
  email_exists: 'We could not create an account with those details. Try signing in or use the password reset link.',
  weak_password: 'Choose a stronger password and try again.',
  over_email_send_rate_limit: 'Too many email requests. Please wait a little before trying again.',
  over_request_rate_limit: 'Too many attempts. Please wait a little before trying again.',
  otp_expired: 'This link has expired. Request a new email and try again.',
  bad_code_verifier: 'This sign-in link could not be verified in this browser. Restart the sign-in flow and try again.',
  provider_disabled: 'Google sign-in is not enabled for this project yet.',
  email_address_invalid: 'Enter a valid email address.',
};

export class AuthActionError extends Error {
  constructor(message, code = 'unknown') {
    super(message);
    this.name = 'AuthActionError';
    this.code = code;
  }
}

const clientOrThrow = () => {
  if (!isSupabaseConfigured || !supabase) {
    throw new AuthActionError('Authentication is not configured yet. Please try again later.', 'not_configured');
  }
  return supabase;
};

const friendlyError = (error) => {
  const code = typeof error?.code === 'string' ? error.code : 'unknown';
  const normalizedMessage = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  const message = FRIENDLY_MESSAGES[code]
    || (error?.status === 429 ? FRIENDLY_MESSAGES.over_request_rate_limit : null)
    || (normalizedMessage.includes('fetch') || normalizedMessage.includes('network')
      ? 'We could not reach the authentication service. Check your connection and try again.'
      : 'We could not complete that request. Please try again.');

  return new AuthActionError(message, code);
};

const getRedirectUrl = (path) => `${window.location.origin}${path}`;
const throwIfError = ({ error }) => {
  if (error) throw friendlyError(error);
};

export const authService = {
  async signUp({ email, password, displayName }) {
    const client = clientOrThrow();
    const result = await client.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { display_name: displayName.trim() },
        emailRedirectTo: getRedirectUrl('/auth/callback'),
      },
    });
    throwIfError(result);
    return {
      ...result.data,
      emailConfirmationRequired: Boolean(result.data.user && !result.data.session),
    };
  },

  async signInWithPassword({ email, password }) {
    const client = clientOrThrow();
    const result = await client.auth.signInWithPassword({ email: email.trim(), password });
    throwIfError(result);
    return result.data;
  },

  async signInWithGoogle() {
    const client = clientOrThrow();
    const result = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: getRedirectUrl('/auth/callback') },
    });
    throwIfError(result);
    return result.data;
  },

  async signOut() {
    const client = clientOrThrow();
    const result = await client.auth.signOut();
    throwIfError(result);
  },

  async resendVerification(email) {
    const client = clientOrThrow();
    const result = await client.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: getRedirectUrl('/auth/callback') },
    });
    throwIfError(result);
  },

  async requestPasswordReset(email) {
    const client = clientOrThrow();
    const result = await client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: getRedirectUrl('/reset-password'),
    });
    throwIfError(result);
  },

  async updatePassword(password) {
    const client = clientOrThrow();
    const result = await client.auth.updateUser({ password });
    throwIfError(result);
    return result.data;
  },

  async verifyEmailLink(tokenHash, type) {
    const client = clientOrThrow();
    const supportedTypes = new Set(['signup', 'email', 'email_change', 'recovery', 'invite', 'magiclink']);
    if (!tokenHash || !supportedTypes.has(type)) {
      throw new AuthActionError('This verification link is invalid or has expired. Request a new one and try again.', 'invalid_link');
    }

    const result = await client.auth.verifyOtp({ token_hash: tokenHash, type });
    throwIfError(result);
    return result.data;
  },
};

export { friendlyError as toFriendlyAuthError };
