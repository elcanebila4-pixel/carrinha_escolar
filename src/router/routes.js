const routes = [
  {
    path: '/',
    redirect: '/login'
  },
  {
    path: '/login',
    component: () => import('../pages/LoginPage.vue')
  },
  {
    path: '/dashboard',
    meta: { requiresAuth: true, role: 'admin' },
    component: () => import('../layouts/MainLayout.vue'),
    children: [
      {
        path: '',
        component: () => import('../pages/IndexPage.vue'),
        meta: { title: 'Visão geral' }
      },
      {
        path: 'alunos',
        component: () => import('../pages/AlunosPage.vue'),
        meta: {
          title: 'Alunos',
          icon: 'school',
          description: 'Cadastro e acompanhamento dos alunos da escola.'
        }
      },
      {
        path: 'encarregados',
        component: () => import('../pages/EncarregadosPage.vue'),
        meta: {
          title: 'Encarregados',
          icon: 'family_restroom',
          description: 'Contactos e informações dos encarregados de educação.'
        }
      },
      {
        path: 'motoristas',
        component: () => import('../pages/ResourceCrudPage.vue'),
        meta: { title: 'Motoristas', icon: 'badge', resource: 'drivers' }
      },
      {
        path: 'carrinhas',
        component: () => import('../pages/ResourceCrudPage.vue'),
        meta: {
          title: 'Carrinhas',
          icon: 'airport_shuttle',
          resource: 'vehicles'
        }
      },
      {
        path: 'mapa',
        component: () => import('../pages/MapPage.vue'),
        meta: { title: 'Mapa', icon: 'map' }
      },
      {
        path: 'rotas',
        component: () => import('../pages/ResourceCrudPage.vue'),
        meta: { title: 'Rotas', icon: 'route', resource: 'routes' }
      },
      {
        path: 'viagens',
        component: () => import('../pages/ResourceCrudPage.vue'),
        meta: { title: 'Viagens', icon: 'commute', resource: 'trips' }
      },
      {
        path: 'relatorios',
        component: () => import('../pages/ReportsPage.vue'),
        meta: {
          title: 'Relatórios',
          icon: 'bar_chart',
          description: 'Resumo das operações de transporte escolar.'
        }
      }
    ]
  },
  {
    path: '/familia',
    meta: { requiresAuth: true, role: 'guardian' },
    component: () => import('../layouts/GuardianLayout.vue'),
    children: [
      {
        path: '',
        component: () => import('../pages/GuardianHomePage.vue'),
        meta: { title: 'Meus alunos' }
      }
    ]
  },
  {
    path: '/motorista',
    meta: { requiresAuth: true, role: 'driver' },
    component: () => import('../layouts/GuardianLayout.vue'),
    children: [
      {
        path: '',
        component: () => import('../pages/DriverHomePage.vue'),
        meta: { title: 'As minhas viagens' }
      }
    ]
  },
  {
    path: '/:catchAll(.*)*',
    component: () => import('../pages/ErrorNotFound.vue')
  }
]

export default routes
