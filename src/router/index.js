import { defineRouter } from '#q-app'
import {
  createMemoryHistory,
  createRouter,
  createWebHashHistory,
  createWebHistory
} from 'vue-router'

import routes from './routes.js'
import { obterSessaoLocal } from '../services/database.js'
import { apiFetch } from '../services/api-url.js'

/*
 * If not building with SSR mode, you can
 * directly export the Router instantiation;
 *
 * The function below can be async too; either use
 * async/await or return a Promise which resolves
 * with the Router instance.
 */

export default defineRouter((/* { store, ssrContext } */) => {
  const createHistory = import.meta.env.QUASAR_SERVER
    ? createMemoryHistory
    : import.meta.env.QUASAR_VUE_ROUTER_MODE === 'history'
      ? createWebHistory
      : createWebHashHistory

  const Router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,

    // Leave this as is and make changes in quasar.conf.js instead!
    // quasar.conf.js -> build -> vueRouterMode
    // quasar.conf.js -> build -> publicPath
    history: createHistory(import.meta.env.QUASAR_VUE_ROUTER_BASE)
  })

  Router.beforeEach(async to => {
    if (!to.matched.some(route => route.meta.requiresAuth)) return true
    const requestedRole = to.matched.find(route => route.meta.role)?.meta.role
    if (obterSessaoLocal()) {
      return requestedRole && requestedRole !== 'admin' ? '/dashboard' : true
    }

    try {
      const response = await apiFetch('/api/auth/me')
      if (response.ok) {
        const { user } = await response.json()
        if (requestedRole && requestedRole !== user.role) {
          return user.role === 'guardian'
            ? '/familia'
            : user.role === 'driver'
              ? '/motorista'
              : '/dashboard'
        }
        return true
      }
    } catch {
      // Se a API estiver indisponível, a área privada continua protegida.
    }

    return { path: '/login', query: { redirect: to.fullPath } }
  })

  return Router
})
