import { createClient } from '@supabase/supabase-js'

const missingConfigError = new Error(
  'Godwit is missing its Supabase configuration. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env.local file.'
)

const configuredSupabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const configuredSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const hasSupabaseConfig = Boolean(configuredSupabaseUrl && configuredSupabaseAnonKey)
export const supabaseUrlValue = configuredSupabaseUrl || ''
export const supabaseAnonKeyValue = configuredSupabaseAnonKey || ''

function createMissingSupabaseClient() {
  const emptyResult = { data: null, error: missingConfigError }
  const emptyQuery = {
    then(resolve) {
      return Promise.resolve(emptyResult).then(resolve)
    },
    catch(handler) {
      return Promise.resolve(emptyResult).catch(handler)
    },
    finally(handler) {
      return Promise.resolve(emptyResult).finally(handler)
    },
    select() {
      return emptyQuery
    },
    insert() {
      return emptyQuery
    },
    update() {
      return emptyQuery
    },
    upsert() {
      return emptyQuery
    },
    delete() {
      return emptyQuery
    },
    eq() {
      return emptyQuery
    },
    neq() {
      return emptyQuery
    },
    gt() {
      return emptyQuery
    },
    gte() {
      return emptyQuery
    },
    lt() {
      return emptyQuery
    },
    lte() {
      return emptyQuery
    },
    like() {
      return emptyQuery
    },
    ilike() {
      return emptyQuery
    },
    order() {
      return emptyQuery
    },
    limit() {
      return emptyQuery
    },
    range() {
      return emptyQuery
    },
    single() {
      return Promise.resolve(emptyResult)
    },
    maybeSingle() {
      return Promise.resolve(emptyResult)
    }
  }

  return {
    auth: {
      async getSession() {
        return { data: { session: null }, error: null }
      },
      async signInWithPassword() {
        return { data: { user: null, session: null }, error: missingConfigError }
      },
      async signOut() {
        return { error: null }
      },
      async getUser() {
        return { data: { user: null }, error: missingConfigError }
      },
      onAuthStateChange() {
        return {
          data: {
            subscription: {
              unsubscribe() {}
            }
          },
          error: null
        }
      }
    },
    from() {
      return emptyQuery
    },
    async rpc() {
      return emptyResult
    },
    storage: {
      from() {
        return {
          async upload() {
            return emptyResult
          },
          async download() {
            return emptyResult
          },
          async remove() {
            return emptyResult
          },
          async list() {
            return emptyResult
          },
          getPublicUrl() {
            return { data: { publicUrl: '' }, error: missingConfigError }
          }
        }
      }
    }
  }
}

export const supabaseUrl = supabaseUrlValue
export const supabaseAnonKey = supabaseAnonKeyValue
export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrlValue, supabaseAnonKeyValue)
  : createMissingSupabaseClient()
