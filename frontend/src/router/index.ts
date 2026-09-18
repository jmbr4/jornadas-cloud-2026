import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'auth',
    component: () => import('../views/AuthView.vue'),
    meta: { public: true, chrome: false },
  },
  {
    path: '/acceso',
    name: 'magic-link',
    component: () => import('../views/MagicLinkView.vue'),
    // Aquí aterriza el enlace del correo. Se deja pasar aunque ya haya sesión:
    // si no, el guard redirigiría y el enlace se ignoraría en silencio.
    meta: { public: true, chrome: false, allowAuthenticated: true },
  },
  {
    path: '/perfil',
    name: 'profile',
    component: () => import('../views/ProfileView.vue'),
    // Hace falta sesión, pero no perfil: es donde se crea.
    meta: { chrome: false, needsProfile: false },
  },
  { path: '/sets', name: 'lobby', component: () => import('../views/LobbyView.vue') },
  { path: '/play/:setId', name: 'play', component: () => import('../views/PlayView.vue'), props: true },
  { path: '/result', name: 'result', component: () => import('../views/ResultView.vue') },
  { path: '/leaderboard', name: 'board', component: () => import('../views/LeaderboardView.vue') },
  {
    path: '/admin',
    name: 'admin',
    component: () => import('../views/AdminView.vue'),
    meta: { admin: true },
  },
  { path: '/:pathMatch(.*)*', redirect: '/sets' },
]

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.restore()

  if (!to.meta.public && !auth.isAuthenticated) return { name: 'auth' }
  if (to.meta.public && auth.isAuthenticated && !to.meta.allowAuthenticated) {
    return { name: 'lobby' }
  }
  if (to.meta.admin && !auth.user?.isAdmin) return { name: 'lobby' }

  // Quien ha entrado pero no ha elegido nombre pasa primero por el perfil.
  const needsProfile = auth.isAuthenticated && !auth.user?.profileComplete
  if (needsProfile && to.meta.needsProfile !== false && !to.meta.public) {
    return { name: 'profile' }
  }
  if (!needsProfile && to.name === 'profile') return { name: 'lobby' }

  return true
})
