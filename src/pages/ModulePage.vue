<template>
  <q-page class="module-page">
    <div class="module-heading">
      <div class="module-icon"><q-icon :name="route.meta.icon || 'widgets'" /></div>
      <div>
        <h1>{{ route.meta.title }}</h1>
        <p>{{ route.meta.description }}</p>
      </div>
    </div>

    <q-card flat bordered class="module-placeholder">
      <div class="placeholder-icon"><q-icon :name="route.meta.icon || 'widgets'" /></div>
      <h2>{{ route.meta.title }} da escola</h2>
      <p>Esta área está criada. Os formulários e dados de gestão serão adicionados aqui.</p>
    </q-card>
  </q-page>
</template>

<script setup>
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<style scoped>
.module-page { width: min(100%, 1120px); margin: 0 auto; padding: 36px 34px 56px; }
.module-heading { display: flex; align-items: center; gap: 14px; margin-bottom: 28px; }
.module-icon { display: grid; place-items: center; width: 46px; height: 46px; border-radius: 13px; color: #47733d; background: #eaf2df; font-size: 22px; }
h1 { margin: 0 0 5px; color: #25372d; font-size: 21px; letter-spacing: -.6px; }
.module-heading p { margin: 0; color: #87938b; font-size: 12px; }
.module-placeholder { display: grid; justify-items: center; padding: 58px 20px; border-color: #e7ebe6; border-radius: 14px; background: #fff; text-align: center; }
.placeholder-icon { display: grid; place-items: center; width: 58px; height: 58px; border-radius: 17px; color: #6c894a; background: #f0f5e8; font-size: 27px; }
.module-placeholder h2 { margin: 17px 0 6px; color: #35463a; font-size: 15px; font-weight: 700; }
.module-placeholder p { margin: 0; color: #87938b; font-size: 11px; }
@media (max-width: 600px) { .module-page { padding: 24px 18px 40px; } }
</style>
