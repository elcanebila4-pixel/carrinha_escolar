<template>
  <q-layout view="hHh Lpr lFf" class="app-layout">
    <q-drawer
      v-model="drawerOpen"
      show-if-above
      :width="258"
      :breakpoint="900"
      bordered
      class="app-drawer"
    >
      <div class="drawer-content">
        <router-link
          to="/dashboard"
          class="brand-lockup"
          @click="closeDrawerOnMobile"
        >
          <span class="brand-mark"><q-icon name="directions_bus" /></span>
          <span class="brand-name">Carrinha <strong>Escolar</strong></span>
        </router-link>

        <div class="nav-section-label">SISTEMA ESCOLAR</div>
        <q-list class="nav-list">
          <q-item
            v-for="item in mainNavigation"
            :key="item.label"
            :to="item.to"
            exact
            clickable
            v-ripple
            active-class="nav-item-active"
            class="nav-item"
            @click="closeDrawerOnMobile"
          >
            <q-item-section avatar><q-icon :name="item.icon" /></q-item-section>
            <q-item-section>{{ item.label }}</q-item-section>
          </q-item>
        </q-list>

        <div class="drawer-spacer"></div>
        <div class="drawer-note">
          <q-icon name="lightbulb" />
          <span
            >Organização para a escola e tranquilidade para as famílias.</span
          >
        </div>
        <q-separator class="drawer-separator" />
        <button class="account-button" type="button" @click="logout">
          <q-avatar size="38px" class="account-avatar">{{
            userInitial
          }}</q-avatar>
          <span class="account-details">
            <strong>{{ userEmail || 'Administrador' }}</strong>
            <small>Administrador</small>
          </span>
          <q-icon name="logout" class="account-logout" />
        </button>
      </div>
    </q-drawer>

    <q-header class="app-header">
      <q-toolbar class="header-toolbar">
        <q-btn
          flat
          round
          dense
          icon="menu"
          aria-label="Abrir menu"
          class="menu-toggle"
          @click="drawerOpen = !drawerOpen"
        />
        <div class="header-heading">
          <div class="header-eyebrow">CARRINHA ESCOLAR</div>
          <div class="header-title">{{ pageTitle }}</div>
        </div>
        <q-space />
        <div class="header-date"><q-icon name="event" /> {{ todayLabel }}</div>
      </q-toolbar>
    </q-header>

    <q-page-container class="page-container">
      <router-view />
    </q-page-container>

    <q-footer v-if="$q.screen.lt.md" class="mobile-footer">
      <nav class="mobile-nav" aria-label="Navegação principal">
        <q-btn
          v-for="item in mobileNavigation"
          :key="item.to"
          flat
          no-caps
          :to="item.to"
          :icon="item.icon"
          :label="item.label"
          class="mobile-nav-item"
          :class="{ 'mobile-nav-active': route.path === item.to }"
        />
        <q-btn
          flat
          no-caps
          icon="more_horiz"
          label="Mais"
          class="mobile-nav-item"
          :class="{
            'mobile-nav-active': !mobileNavigation.some(
              item => route.path === item.to
            )
          }"
          @click="drawerOpen = true"
        />
      </nav>
    </q-footer>
  </q-layout>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { obterSessaoLocal, terminarSessaoLocal } from '../services/database.js'
import { useQuasar } from 'quasar'
import { useRoute, useRouter } from 'vue-router'
import { apiFetch } from '../services/api-url.js'

const $q = useQuasar()
const route = useRoute()
const router = useRouter()
const drawerOpen = ref(false)
const userEmail = ref('')

const mainNavigation = [
  { label: 'Visão geral', icon: 'space_dashboard', to: '/dashboard' },
  { label: 'Alunos', icon: 'school', to: '/dashboard/alunos' },
  {
    label: 'Encarregados',
    icon: 'family_restroom',
    to: '/dashboard/encarregados'
  },
  { label: 'Motoristas', icon: 'badge', to: '/dashboard/motoristas' },
  { label: 'Carrinhas', icon: 'airport_shuttle', to: '/dashboard/carrinhas' },
  { label: 'Mapa', icon: 'map', to: '/dashboard/mapa' },
  { label: 'Rotas', icon: 'route', to: '/dashboard/rotas' },
  { label: 'Viagens', icon: 'commute', to: '/dashboard/viagens' },
  { label: 'Relatórios', icon: 'bar_chart', to: '/dashboard/relatorios' }
]
const mobileNavigation = [
  { label: 'Início', icon: 'home', to: '/dashboard' },
  { label: 'Alunos', icon: 'school', to: '/dashboard/alunos' },
  { label: 'Carrinhas', icon: 'airport_shuttle', to: '/dashboard/carrinhas' },
  { label: 'Mapa', icon: 'map', to: '/dashboard/mapa' }
]

const pageTitle = computed(() => route.meta.title || 'Visão geral')
const userInitial = computed(
  () => userEmail.value.charAt(0).toUpperCase() || 'A'
)
const todayLabel = new Intl.DateTimeFormat('pt-MZ', {
  day: 'numeric',
  month: 'long',
  year: 'numeric'
}).format(new Date())

onMounted(async () => {
  const localSession = obterSessaoLocal()
  if (localSession) {
    userEmail.value = localSession.email
    return
  }
  try {
    const response = await apiFetch('/api/auth/me')
    if (response.ok) {
      const result = await response.json()
      userEmail.value = result.user.email
    }
  } catch {
    // A proteção da rota trata sessões inválidas ou indisponibilidade da API.
  }
})

function closeDrawerOnMobile() {
  if ($q.screen.lt.md) drawerOpen.value = false
}

async function logout() {
  terminarSessaoLocal()
  await apiFetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include'
  }).catch(() => {})
  localStorage.removeItem('carrinha_api_session_token')
  await router.replace('/login')
}
</script>

<style scoped>
.app-layout {
  background: #f4f6f3;
  color: #20332a;
}
.app-drawer {
  border-right: 1px solid #e8ece7;
  background: #fff;
}
.drawer-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  padding: 25px 16px 15px;
}
.brand-lockup {
  display: flex;
  align-items: center;
  gap: 11px;
  min-height: 46px;
  margin: 0 8px 39px;
  color: inherit;
  text-decoration: none;
}
.brand-mark {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 13px;
  color: #19392f;
  background: #d2f179;
  font-size: 23px;
}
.brand-name {
  color: #1d3128;
  font-size: 15px;
  font-weight: 650;
  letter-spacing: -0.45px;
}
.brand-name strong {
  color: #397258;
  font-weight: 800;
}
.nav-section-label {
  margin: 0 10px 12px;
  color: #9aa69e;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 1.2px;
}
.nav-list {
  display: grid;
  gap: 5px;
}
.nav-item {
  min-height: 44px;
  border-radius: 9px;
  color: #637168;
  font-size: 13px;
  font-weight: 550;
}
.nav-item :deep(.q-item__section--avatar) {
  min-width: 38px;
  color: #86938a;
}
.nav-item-active {
  color: #1e503e;
  background: #eef5e5;
  font-weight: 700;
}
.nav-item-active :deep(.q-item__section--avatar) {
  color: #53813a;
}
.drawer-spacer {
  flex: 1;
  min-height: 42px;
}
.drawer-note {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin: 0 3px 16px;
  padding: 12px;
  border-radius: 10px;
  color: #6e795e;
  background: #f5f7e9;
  font-size: 10px;
  line-height: 1.55;
}
.drawer-note .q-icon {
  color: #9ab64d;
  font-size: 17px;
}
.drawer-separator {
  background: #edf0ed;
}
.account-button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 14px 3px 2px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.account-avatar {
  color: #285541;
  background: #e5f0d8;
  font-size: 14px;
  font-weight: 750;
}
.account-details {
  display: grid;
  flex: 1;
  gap: 4px;
  min-width: 0;
}
.account-details strong {
  overflow: hidden;
  color: #39483f;
  font-size: 10px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.account-details small {
  color: #98a39b;
  font-size: 9px;
}
.account-logout {
  color: #8f9a92;
  font-size: 17px;
}
.app-header {
  border-bottom: 1px solid #e9ede8;
  background: #ffffffed;
  color: #22362c;
}
.header-toolbar {
  min-height: 74px;
  padding: 0 34px;
}
.menu-toggle {
  display: none;
  margin-right: 12px;
  color: #53645a;
}
.header-heading {
  display: grid;
  gap: 4px;
}
.header-eyebrow {
  color: #8d9a91;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 1.1px;
}
.header-title {
  color: #26382e;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.35px;
}
.header-date {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #77847b;
  font-size: 11px;
  text-transform: capitalize;
}
.header-date .q-icon {
  color: #8aa25a;
  font-size: 17px;
}
.page-container {
  min-height: 100vh;
}
.mobile-footer {
  display: none;
}
.page-container :deep(.page-heading h1) {
  font-size: clamp(23px, 2.2vw, 28px);
}
.page-container :deep(.page-heading p) {
  font-size: 13px;
  line-height: 1.55;
}
.page-container :deep(.page-kicker),
.page-container :deep(.eyebrow),
.page-container :deep(.card-eyebrow) {
  font-size: 10px;
}
@media (max-width: 900px) {
  .menu-toggle {
    display: inline-flex;
  }
  .header-toolbar {
    min-height: 66px;
    padding: 0 18px;
  }
  .mobile-footer {
    display: block;
    border-top: 1px solid #e8ece7;
    background: #fffffffa;
    color: #66766b;
    padding-bottom: env(safe-area-inset-bottom);
  }
  .mobile-nav {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    min-height: 62px;
  }
  .mobile-nav-item {
    min-height: 58px;
    border-radius: 0;
    color: #758178;
    font-size: 10px;
  }
  .mobile-nav-item :deep(.q-icon) {
    margin-bottom: 2px;
    font-size: 20px;
  }
  .mobile-nav-active {
    color: #285640;
    background: #f1f6ea;
    font-weight: 700;
  }
  .page-container :deep(.q-page) {
    padding-bottom: max(
      92px,
      calc(70px + env(safe-area-inset-bottom))
    ) !important;
  }
  .page-container :deep(.q-btn:not(.q-btn--round)) {
    min-height: 42px;
  }
  .page-container :deep(.page-heading h1) {
    font-size: 25px;
  }
  .page-container :deep(.page-heading p) {
    font-size: 13px;
  }
  .page-container :deep(.q-field__label),
  .page-container :deep(.q-field__native) {
    font-size: 14px;
  }
  .page-container :deep(.q-table thead th) {
    font-size: 10px;
  }
  .page-container :deep(.q-table tbody td) {
    font-size: 12px;
  }
  .page-container :deep(.surface-card),
  .page-container :deep(.list-card),
  .page-container :deep(.report-card),
  .page-container :deep(.locations-card) {
    border-radius: 14px;
  }
}
@media (max-width: 480px) {
  .header-date {
    display: none;
  }
  .header-toolbar {
    min-height: 60px;
    padding: 0 12px;
  }
  .header-title {
    font-size: 15px;
  }
  .mobile-nav {
    min-height: 58px;
  }
  .mobile-nav-item {
    min-height: 55px;
    font-size: 9px;
  }
  .page-container :deep(.page-heading h1) {
    font-size: 23px;
  }
  .page-container :deep(.page-heading p) {
    font-size: 12px;
  }
  .page-container :deep(.q-page) {
    padding-right: 15px !important;
    padding-left: 15px !important;
  }
}
</style>
