// =========================================
// Хмара: єдиний модуль, що знає про Supabase
// Бібліотеку вантажимо лише тоді, коли вона потрібна (людина входить або вже увійшла),
// тож гість і офлайн-старт від неї не залежать.
// =========================================
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const LIBRARY = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm';
let clientPromise = null;

export function loadClient() {
  clientPromise ??= import(LIBRARY)
    .then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    }))
    .catch((error) => {
      clientPromise = null; // наступна спроба знову спробує завантажити
      throw error;
    });
  return clientPromise;
}

// Помилки Supabase → короткі коди, які інтерфейс перекладає людською мовою
export function errorCode(error) {
  if (!navigator.onLine) return 'offline';
  const code = error?.code ?? '';
  if (code === 'invalid_credentials') return 'invalid';
  if (code === 'user_already_exists' || code === 'email_exists') return 'exists';
  if (code === 'weak_password') return 'weak';
  if (code === 'email_address_invalid' || code === 'validation_failed') return 'email';
  if (error?.name === 'AuthRetryableFetchError' || error instanceof TypeError) return 'offline';
  return 'unavailable';
}

async function withClient(action) {
  try {
    return await action(await loadClient());
  } catch (error) {
    return { error: errorCode(error) };
  }
}

export function signUp(email, password) {
  return withClient(async (client) => {
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) return { error: errorCode(error) };
    if (!data.session) return { error: 'unavailable' }; // підтвердження пошти мало б бути вимкнене
    return { user: data.user };
  });
}

export function signIn(email, password) {
  return withClient(async (client) => {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) return { error: errorCode(error) };
    return { user: data.user };
  });
}

// Вихід лише на цьому пристрої: працює й без мережі
export function signOut() {
  return withClient(async (client) => {
    await client.auth.signOut({ scope: 'local' });
    return {};
  });
}

export function deleteAccount() {
  return withClient(async (client) => {
    const { error } = await client.rpc('delete_account');
    return error ? { error: errorCode(error) } : {};
  });
}

// Хто увійшов на цьому пристрої (без запиту в мережу: сесію зберігає бібліотека)
export async function getUser() {
  try {
    const client = await loadClient();
    const { data } = await client.auth.getSession();
    return data.session?.user ?? null;
  } catch {
    return null;
  }
}
