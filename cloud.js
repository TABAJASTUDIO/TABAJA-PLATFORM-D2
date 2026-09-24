(() => {
  'use strict';

  const CONFIG_KEY = 'tabaja_cloud_config_v101';
  const ACCOUNT_KEY = 'tabaja_card_designer_account_v10';
  const ADMIN_USER_ID = '74cdabd7-4fb6-4016-bf68-cfac6bb17c14';

  let client = null;

  function readConfig() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG_KEY)) || {};
    } catch {
      return {};
    }
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

    return (
      /^https:\/\/.+\.supabase\.co$/i.test(config.url || '') &&
      (config.anonKey || '').length > 40
    );
  }

  function getClient() {
    if (!isConfigured() || !window.supabase) return null;

    if (!client) {
      const config = readConfig();

      client = window.supabase.createClient(
        config.url,
        config.anonKey,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        }
      );
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
      .select(
        'role, companies(id,name,country,phone,plan,status,licence_expires_at,max_users,feature_nfc,feature_batch)'
      )
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
      status: company.status || 'active',
      licenceExpiresAt: company.licence_expires_at || null,
      maxUsers: company.max_users || 1,
feature_nfc: company.feature_nfc === true,
feature_batch: company.feature_batch === true,
      role: data.role || 'owner'
    };
  }

  async function createWorkspaceIfNeeded(user) {
    const supabase = getClient();

    if (!supabase || !user) {
      throw new Error('Authenticated user is required.');
    }

    if (user.id === ADMIN_USER_ID) {
      return null;
    }

    const existing = await loadWorkspace(user.id);

    if (existing) {
      return existing;
    }

    const metadata = user.user_metadata || {};

    const companyName = String(metadata.company || '').trim();
    const country = String(metadata.country || '').trim();
    const phone = String(metadata.phone || '').trim();

    if (!companyName) {
      return null;
    }

    const trialExpiresAt = new Date();
    trialExpiresAt.setDate(trialExpiresAt.getDate() + 5);

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .insert({
        name: companyName,
        country: country,
        phone: phone,
        plan: 'Professional Trial',
        status: 'active',
        licence_expires_at: trialExpiresAt.toISOString(),
        max_users: 3,
        owner_user_id: user.id
      })
      .select()
      .single();

    if (companyError) throw companyError;

    const { error: memberError } = await supabase
      .from('company_members')
      .insert({
        company_id: company.id,
        user_id: user.id,
        role: 'owner'
      });

    if (memberError) throw memberError;

    return {
      company: company.name,
      companyId: company.id,
      country: company.country || '',
      phone: company.phone || '',
      plan: company.plan,
      status: company.status,
      licenceExpiresAt: company.licence_expires_at || null,
      maxUsers: company.max_users,
      role: 'owner'
    };
  }

  async function signIn(email, password) {
    const supabase = getClient();

    if (!supabase) {
      throw new Error(
        'Cloud is not configured. Open Cloud Setup first.'
      );
    }

    const { data, error } =
      await supabase.auth.signInWithPassword({
        email,
        password
      });

    if (error) throw error;

    if (data.user?.id === ADMIN_USER_ID) {
      return {
        cloudAdmin: true,
        userId: data.user.id,
        email: data.user.email,
        cloud: true
      };
    }

    const workspace =
      (await loadWorkspace(data.user.id)) ||
      (await createWorkspaceIfNeeded(data.user));

    const account = {
      ...(workspace || {}),
      owner:
        data.user.user_metadata?.full_name ||
        data.user.email,
      email: data.user.email,
      cloud: true
    };

    localStorage.setItem(
      ACCOUNT_KEY,
      JSON.stringify(account)
    );

    return account;
  }

  async function signUp(payload) {
    const supabase = getClient();

    if (!supabase) {
      throw new Error(
        'Cloud is not configured. Open Cloud Setup first.'
      );
    }

    const { data, error } = await supabase.auth.signUp({
      email: payload.email,
      password: payload.password,

      options: {
        data: {
          full_name: payload.owner,
          company: payload.company,
          country: payload.country,
          phone: payload.phone
        }
      }
    });

    if (error) throw error;

    if (!data.user) {
      throw new Error(
        'Account creation did not return a user.'
      );
    }

    /*
      When email confirmation is enabled, Supabase creates
      the Auth user but normally does not create an authenticated
      session until the email is confirmed.

      Therefore we MUST NOT insert into companies while there is
      no authenticated session. RLS will correctly reject it.
    */

    if (!data.session) {
      return {
        pendingConfirmation: true,
        email: payload.email,
        owner: payload.owner,
        company: payload.company,
        cloud: true
      };
    }

    /*
      If email confirmation is disabled and Supabase returned
      a valid session immediately, it is safe to create the
      workspace now.
    */

    const workspace =
      await createWorkspaceIfNeeded(data.user);

    const account = {
      ...(workspace || {}),
      owner: payload.owner,
      email: payload.email,
      cloud: true
    };

    localStorage.setItem(
      ACCOUNT_KEY,
      JSON.stringify(account)
    );

    return account;
  }

  async function signOut() {
    const supabase = getClient();

    if (supabase) {
      await supabase.auth.signOut();
    }
  }

  async function updatePassword(password) {
    const supabase = getClient();

    if (!supabase) {
      throw new Error('Cloud is not configured.');
    }

    if (String(password || '').length < 8) {
      throw new Error(
        'Password must be at least 8 characters.'
      );
    }

    const { data, error } =
      await supabase.auth.updateUser({
        password
      });

    if (error) throw error;

    return data.user || null;
  }

  async function resetPassword(email) {
    const supabase = getClient();

    if (!supabase) {
      throw new Error('Cloud is not configured.');
    }

    const redirectTo =
      `${location.origin}${location.pathname}`;

    const { error } =
      await supabase.auth.resetPasswordForEmail(
        email,
        { redirectTo }
      );

    if (error) throw error;
  }

  async function connectionTest(config) {
    saveConfig(config);

    const supabase = getClient();

    if (!supabase) {
      throw new Error(
        'The Supabase URL or anon key format is invalid.'
      );
    }

    const { error } =
      await supabase.auth.getSession();

    if (error) throw error;

    return true;
  }

  window.TabajaCloud = {
    readConfig,
    saveConfig,
    isConfigured,
    getClient,
    getSession,
    loadWorkspace,
    createWorkspaceIfNeeded,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updatePassword,
    connectionTest,
    ADMIN_USER_ID
  };
})();