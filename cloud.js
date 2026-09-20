(() => {
  'use strict';

  const CONFIG_KEY = 'tabaja_cloud_config_v101';
  const ACCOUNT_KEY = 'tabaja_card_designer_account_v10';
  let client = null;

  function readConfig() {
    try { return JSON.parse(localStorage.getItem(CONFIG_KEY)) || {}; }
    catch { return {}; }
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
      .select('role, companies(id,name,country,phone,plan,status,licence_expires_at,max_users)')
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
      role: data.role || 'owner'
    };
  }

  async function signIn(email, password) {
    const supabase = getClient();
    if (!supabase) throw new Error('Cloud is not configured. Open Cloud Setup first.');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const workspace = await loadWorkspace(data.user.id);
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
    const { data, error } = await supabase.auth.signUp({
      email: payload.email,
      password: payload.password,
      options: { data: { full_name: payload.owner } }
    });
    if (error) throw error;
    if (!data.user) throw new Error('Account creation did not return a user.');

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .insert({
        name: payload.company,
        country: payload.country,
        phone: payload.phone,
        plan: 'Professional Trial',
        status: 'active',
        max_users: 3,
        owner_user_id: data.user.id
      })
      .select()
      .single();
    if (companyError) throw companyError;

    const { error: memberError } = await supabase.from('company_members').insert({
      company_id: company.id,
      user_id: data.user.id,
      role: 'owner'
    });
    if (memberError) throw memberError;

    const account = {
      company: company.name,
      companyId: company.id,
      owner: payload.owner,
      email: payload.email,
      country: payload.country,
      phone: payload.phone,
      plan: company.plan,
      status: company.status,
      maxUsers: company.max_users,
      role: 'owner',
      cloud: true
    };
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
    return account;
  }

  async function signOut() {
    const supabase = getClient();
    if (supabase) await supabase.auth.signOut();
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
    loadWorkspace, signIn, signUp, signOut, resetPassword, connectionTest
  };
})();
