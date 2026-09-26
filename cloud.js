(() => {
  'use strict';

  const CONFIG_KEY = 'tabaja_cloud_config_v101';
  const ACCOUNT_KEY = 'tabaja_card_designer_account_v10';
  const ADMIN_USER_ID = '74cdabd7-4fb6-4016-bf68-cfac6bb17c14';
  const DEFAULT_CONFIG = Object.freeze({
    url: 'https://svekgqddidlxlpfbxwtp.supabase.co',
    anonKey: 'sb_publishable_TUaRRN6OZtxw2dsxa3Uwbg_Q7zRsxRi'
  });
  let client = null;

  function readConfig() {
    try {
      const stored = localStorage.getItem(CONFIG_KEY);
      if (stored !== null) return JSON.parse(stored) || {};
      return { ...DEFAULT_CONFIG };
    } catch { return { ...DEFAULT_CONFIG }; }
  }

  function saveConfig(config) {
    const clean = {
      url: String(config.url || '').trim().replace(/\/$/, ''),
      anonKey: String(config.anonKey || '').trim()
    };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(clean));
    client = null;
    return clean;
  }

  function isConfigured() {
    const config = readConfig();
    return /^https:\/\/.+\.supabase\.co$/i.test(config.url || '') && (config.anonKey || '').length > 40;
  }

  function getClient() {
    if (!isConfigured() || !window.supabase) return null;
    if (!client) {
      const config = readConfig();
      client = window.supabase.createClient(config.url, config.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    }
    return client;
  }

  async function getSession() {
    const supabase = getClient();
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session || null;
  }

  async function loadWorkspace(userId) {
    const supabase = getClient();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('company_members')
      .select('role, companies(id,name,country,phone,plan,status,licence_expires_at,max_users,trial_started_at,trial_expires_at,feature_nfc,feature_batch,feature_qr,feature_barcode,feature_elements)')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    const company = data?.companies;
    if (!company) return null;
    return {
      company: company.name,
      companyId: company.id,
      country: company.country || '',
      phone: company.phone || '',
      plan: company.plan || 'Professional',
      status: String(company.status || 'active').toLowerCase() === 'suspended' ? 'SUSPENDED' : String(company.status || 'active').toLowerCase() === 'expired' ? 'EXPIRED' : (company.trial_expires_at ? 'TRIAL' : 'ACTIVE'),
      licenceExpiresAt: company.licence_expires_at || null,
      maxUsers: company.max_users || 1,
      trialStartedAt: company.trial_started_at || null,
      trialExpiresAt: company.trial_expires_at || company.licence_expires_at || null,
      features: { nfc: company.feature_nfc === true, batch: company.feature_batch === true, qr: company.feature_qr === true, barcode: company.feature_barcode === true, elements: company.feature_elements === true },
      role: data.role || 'owner'
    };
  }

  async function createWorkspaceForUser(user, fallback = {}) {
    const supabase = getClient();
    if (!supabase || !user?.id) return null;

    // FIX 5.4: never write company rows until the Supabase client has a real
    // authenticated session. RLS checks auth.uid() from the request JWT.
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const sessionUser = sessionData?.session?.user;
    if (!sessionUser?.id) throw new Error('Authenticated session is not ready. Please sign in again.');

    const { data: verifiedData, error: verifiedError } = await supabase.auth.getUser();
    if (verifiedError) throw verifiedError;
    const authenticatedUser = verifiedData?.user;
    if (!authenticatedUser?.id || authenticatedUser.id !== sessionUser.id) {
      throw new Error('Authenticated user could not be verified. Please sign in again.');
    }

    user = authenticatedUser;
    const existing = await loadWorkspace(user.id);
    if (existing) return existing;

    const meta = user.user_metadata || {};
    const companyName = String(meta.company || fallback.company || '').trim();
    if (!companyName) return null;

    const country = String(meta.country || fallback.country || '').trim();
    const phone = String(meta.phone || fallback.phone || '').trim();
    const trialStartedAt = new Date().toISOString();
    const trialExpiresAt = new Date(Date.now() + 5 * 86400000).toISOString();

    // FIX 5.5: provision company + initial owner membership atomically on the
    // database side. The RPC derives the owner from auth.uid(), so the browser
    // never needs to bypass RLS and cannot provision a company for another user.
    const { error: provisionError } = await supabase.rpc('provision_my_company', {
      p_name: companyName,
      p_country: country,
      p_phone: phone,
      p_trial_started_at: trialStartedAt,
      p_trial_expires_at: trialExpiresAt
    });
    if (provisionError) throw provisionError;

    const workspace = await loadWorkspace(user.id);
    if (!workspace) throw new Error('Company workspace provisioning did not complete. Please sign in again.');
    return workspace;
  }

  async function signIn(email, password) {
    const supabase = getClient();
    if (!supabase) throw new Error('Cloud is not configured. Open Cloud Setup first.');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    // FIX 5.4: explicitly bind the returned session before any RLS-protected insert.
    if (data.session?.access_token && data.session?.refresh_token) {
      const { error: setSessionError } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token
      });
      if (setSessionError) throw setSessionError;
    }

    if (data.user?.id === ADMIN_USER_ID) {
      return { cloudAdmin: true, userId: data.user.id, email: data.user.email, cloud: true };
    }

    let workspace = await loadWorkspace(data.user.id);
    if (!workspace) workspace = await createWorkspaceForUser(data.user);
    const account = {
      ...(workspace || {}),
      owner: data.user.user_metadata?.full_name || data.user.email,
      email: data.user.email,
      cloud: true
    };
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
    return account;
  }

  async function signUp(payload) {
    const supabase = getClient();
    if (!supabase) throw new Error('Cloud is not configured. Open Cloud Setup first.');
    const redirectTo = `${location.origin}${location.pathname}`;
    const { data, error } = await supabase.auth.signUp({
      email: payload.email,
      password: payload.password,
      options: {
        emailRedirectTo: redirectTo,
        data: {
          full_name: payload.owner,
          company: payload.company,
          country: payload.country,
          phone: payload.phone
        }
      }
    });
    if (error) throw error;
    if (!data.user) throw new Error('Account creation did not return a user.');

    // With email confirmation enabled Supabase does not provide an authenticated
    // session yet. Company + membership are created automatically on first sign-in
    // after confirmation, when RLS has a real auth.uid().
    if (!data.session) return { pendingConfirmation: true, email: payload.email };

    const workspace = await createWorkspaceForUser(data.user, payload);
    const account = {
      ...(workspace || {}),
      owner: payload.owner,
      email: payload.email,
      cloud: true
    };
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
    return account;
  }

  async function signOut() {
    const supabase = getClient();
    if (supabase) await supabase.auth.signOut();
  }

  async function updatePassword(password) {
    const supabase = getClient();
    if (!supabase) throw new Error('Cloud is not configured.');
    if (String(password || '').length < 8) throw new Error('Password must be at least 8 characters.');
    const { data, error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    return data.user || null;
  }

  async function resetPassword(email) {
    const supabase = getClient();
    if (!supabase) throw new Error('Cloud is not configured.');
    const redirectTo = `${location.origin}${location.pathname}`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
  }

  async function connectionTest(config) {
    saveConfig(config);
    const supabase = getClient();
    if (!supabase) throw new Error('The Supabase URL or anon key format is invalid.');
    const { error } = await supabase.auth.getSession();
    if (error) throw error;
    return true;
  }

  window.TabajaCloud = {
    readConfig, saveConfig, isConfigured, getClient, getSession,
    loadWorkspace, createWorkspaceForUser, signIn, signUp, signOut, resetPassword, updatePassword, connectionTest, ADMIN_USER_ID
  };
})();
