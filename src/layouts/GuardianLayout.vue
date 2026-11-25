<template>
  <q-layout view="hHh lpR fFf" class="family-layout">
    <q-header class="family-header">
      <q-toolbar class="family-toolbar">
        <router-link :to="homePath" class="brand-lockup">
          <span class="brand-mark"><q-icon name="directions_bus" /></span>
          <span class="brand-name">Carrinha <strong>Escolar</strong></span>
        </router-link>
        <q-space />
        <span class="family-label">{{ areaLabel }}</span>
        <q-btn
          flat
          round
          dense
          icon="logout"
          aria-label="Terminar sessão"
          @click="logout"
        >
          <q-tooltip>Terminar sessão</q-tooltip>
        </q-btn>
      </q-toolbar>
    </q-header>
    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { terminarSessaoLocal } from '../services/database.js'
import { apiFetch } from '../services/api-url.js'

const router = useRouter()
const route = useRoute()
const homePath = computed(() => route.path.startsWith('/motorista') ? '/motorista' : '/familia')
const areaLabel = computed(() => route.path.startsWith('/motorista') ? 'ÁREA DO MOTORISTA' : 'ÁREA DA FAMÍLIA')

async function logout() {
  terminarSessaoLocal()
  await apiFetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include'
  }).catch(() => {})
  await router.replace('/login')
}
</script>

<style scoped>
.family-layout {
  min-height: 100vh;
  background: #f4f6f3;
  color: #20332a;
}
.family-header {
  color: #20332a;
  background: #fff;
  border-bottom: 1px solid #e5ebe5;
}
.family-toolbar {
  width: min(100%, 1120px);
  min-height: 66px;
  margin: 0 auto;
  padding: 0 24px;
}
.brand-lockup {
  display: flex;
  align-items: center;
  gap: 10px;
  color: inherit;
  text-decoration: none;
}
.brand-mark {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 11px;
  color: #19392f;
  background: #d2f179;
  font-size: 21px;
}
.brand-name {
  font-size: 14px;
  font-weight: 650;
}
.brand-name strong {
  color: #397258;
  font-weight: 800;
}
.family-label {
  margin-right: 12px;
  color: #829087;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 1px;
}
@media (max-width: 480px) {
  .family-toolbar {
    padding: 0 14px;
  }
  .family-label {
    display: none;
  }
}
</style>
