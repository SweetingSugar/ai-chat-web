import { createRouter, createWebHistory } from 'vue-router'
import { getAuthState } from '../api/client'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/chat' },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/Login.vue'),
      meta: { public: true },
    },
    {
      path: '/chat',
      name: 'chat',
      component: () => import('../views/Chat.vue'),
      meta: { requiresAuth: true },
    },
    { path: '/:pathMatch(.*)*', redirect: '/chat' },
  ],
})

router.beforeEach((to) => {
  const isAuthenticated = !!getAuthState()
  if (to.meta.requiresAuth && !isAuthenticated) {
    return { name: 'login', query: to.fullPath === '/chat' ? {} : { redirect: to.fullPath } }
  }
  if (to.name === 'login' && isAuthenticated) {
    return { name: 'chat' }
  }
  return true
})

export default router
