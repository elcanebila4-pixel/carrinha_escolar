<template>
  <q-page class="dashboard-page">
    <header class="page-heading">
      <div>
        <div class="date-line"><q-icon name="wb_sunny" /> {{ todayLabel }}</div>
        <h1
          >{{ greeting }}, <span>{{ firstName }}</span></h1
        >
        <p>Aqui está o resumo da sua operação escolar.</p>
      </div>
      <q-btn
        unelevated
        no-caps
        icon="school"
        label="Ir para alunos"
        class="new-record-button"
        @click="goToStudents"
      />
    </header>

    <section class="welcome-banner">
      <div class="banner-copy">
        <div class="banner-tag"><span></span> CARRINHA ESCOLAR</div>
        <h2
          >Uma escola organizada<br class="desktop-break" />
          começa por aqui.</h2
        >
        <p>Configure alunos, equipa e transporte num só lugar.</p>
        <q-btn
          flat
          no-caps
          label="Começar configuração"
          icon-right="arrow_forward"
          class="banner-link"
          to="/dashboard/alunos"
        />
      </div>
      <div class="banner-illustration" aria-hidden="true">
        <div class="illustration-orbit orbit-one"></div>
        <div class="illustration-orbit orbit-two"></div>
        <div class="illustration-sun"></div>
        <div class="illustration-road"></div>
        <div class="bus-art"><q-icon name="airport_shuttle" /></div>
        <div class="banner-sticker"
          ><q-icon name="favorite" /> Feito para a sua escola</div
        >
      </div>
    </section>

    <section class="metrics-grid" aria-label="Resumo do sistema">
      <article
        v-for="metric in metrics"
        :key="metric.label"
        class="metric-card"
      >
        <div class="metric-topline">
          <span class="metric-icon" :class="metric.tone"
            ><q-icon :name="metric.icon"
          /></span>
        </div>
        <div class="metric-label">{{ metric.label }}</div>
        <div class="metric-value">{{
          summary ? summary[metric.key] : '—'
        }}</div>
        <div class="metric-note">{{
          summary ? 'Dados atualizados' : 'A aguardar ligação ao servidor'
        }}</div>
      </article>
    </section>

    <section class="content-grid">
      <q-card flat bordered class="surface-card schedule-card">
        <div class="card-heading">
          <div>
            <div class="card-eyebrow">OPERAÇÃO</div>
            <h2>Viagens de hoje</h2>
          </div>
          <q-btn
            flat
            round
            dense
            icon="more_horiz"
            color="grey-7"
            aria-label="Mais opções"
          />
        </div>
        <div class="schedule-empty">
          <div class="empty-graphic">
            <span class="empty-sun"></span>
            <q-icon name="directions_bus" />
            <span class="empty-road"></span>
          </div>
          <h3>A agenda começa com a primeira rota</h3>
          <p
            >Quando configurar as rotas e viagens, o resumo do dia aparece
            aqui.</p
          >
          <q-btn
            outline
            no-caps
            label="Ver rotas"
            icon-right="arrow_forward"
            class="soft-button"
            to="/dashboard/rotas"
          />
        </div>
      </q-card>

      <q-card flat bordered class="surface-card setup-card">
        <div class="card-heading">
          <div>
            <div class="card-eyebrow">PRIMEIROS PASSOS</div>
            <h2>Prepare o sistema</h2>
          </div>
          <span class="setup-count">4 passos</span>
        </div>
        <p class="setup-intro"
          >Complete estas etapas para começar a organizar o transporte
          escolar.</p
        >
        <div class="setup-list">
          <router-link
            v-for="step in setupSteps"
            :key="step.title"
            :to="step.to"
            class="setup-step"
          >
            <span class="step-icon"><q-icon :name="step.icon" /></span>
            <span class="step-copy"
              ><strong>{{ step.title }}</strong
              ><small>{{ step.description }}</small></span
            >
            <q-icon name="chevron_right" class="step-arrow" />
          </router-link>
        </div>
      </q-card>
    </section>

    <section class="shortcuts-section">
      <div class="shortcuts-heading">
        <div>
          <div class="card-eyebrow">NAVEGAÇÃO</div>
          <h2>Acesso rápido</h2>
        </div>
        <span>Todos os módulos</span>
      </div>
      <div class="shortcuts-grid">
        <router-link
          v-for="item in shortcuts"
          :key="item.title"
          :to="item.to"
          class="shortcut-card"
        >
          <span class="shortcut-icon" :class="item.tone"
            ><q-icon :name="item.icon"
          /></span>
          <strong>{{ item.title }}</strong>
          <q-icon name="arrow_outward" class="shortcut-arrow" />
        </router-link>
      </div>
    </section>
  </q-page>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { obterResumoLocal, obterSessaoLocal } from '../services/database.js'
import { apiFetch } from '../services/api-url.js'

const router = useRouter()
const userEmail = ref('')
const summary = ref(null)
const now = new Date()

const todayLabel = new Intl.DateTimeFormat('pt-MZ', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'Africa/Maputo'
}).format(now)
const greeting = computed(() => {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      hourCycle: 'h23',
      timeZone: 'Africa/Maputo'
    }).format(now)
  )
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
})
const firstName = computed(() => {
  const name =
    userEmail.value.split('@')[0]?.split(/[._-]/)[0] || 'Administrador'
  return name.charAt(0).toUpperCase() + name.slice(1)
})

const metrics = [
  { label: 'Alunos', key: 'students', icon: 'school', tone: 'green' },
  { label: 'Motoristas', key: 'drivers', icon: 'badge', tone: 'blue' },
  {
    label: 'Carrinhas',
    key: 'vehicles',
    icon: 'airport_shuttle',
    tone: 'yellow'
  },
  { label: 'Viagens hoje', key: 'trips_today', icon: 'commute', tone: 'purple' }
]

const setupSteps = [
  {
    title: 'Registar alunos',
    description: 'Crie a lista de alunos',
    icon: 'school',
    to: '/dashboard/alunos'
  },
  {
    title: 'Adicionar encarregados',
    description: 'Associe as famílias',
    icon: 'family_restroom',
    to: '/dashboard/encarregados'
  },
  {
    title: 'Registar motoristas',
    description: 'Adicione a equipa',
    icon: 'badge',
    to: '/dashboard/motoristas'
  },
  {
    title: 'Criar rotas escolares',
    description: 'Prepare os percursos',
    icon: 'route',
    to: '/dashboard/rotas'
  }
]

const shortcuts = [
  { title: 'Alunos', icon: 'school', tone: 'green', to: '/dashboard/alunos' },
  {
    title: 'Encarregados',
    icon: 'family_restroom',
    tone: 'blue',
    to: '/dashboard/encarregados'
  },
  {
    title: 'Motoristas',
    icon: 'badge',
    tone: 'yellow',
    to: '/dashboard/motoristas'
  },
  {
    title: 'Carrinhas',
    icon: 'airport_shuttle',
    tone: 'purple',
    to: '/dashboard/carrinhas'
  },
  { title: 'Rotas', icon: 'route', tone: 'orange', to: '/dashboard/rotas' },
  { title: 'Viagens', icon: 'commute', tone: 'blue', to: '/dashboard/viagens' },
  {
    title: 'Relatórios',
    icon: 'bar_chart',
    tone: 'green',
    to: '/dashboard/relatorios'
  }
]

onMounted(async () => {
  const todayParts = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Africa/Maputo'
  }).formatToParts(new Date())
  const today = Object.fromEntries(
    todayParts.map(part => [part.type, part.value])
  )
  const todayDate = `${today.year}-${today.month}-${today.day}`
  const localSession = obterSessaoLocal()
  if (localSession) {
    userEmail.value = localSession.email
    summary.value = obterResumoLocal(todayDate)
    return
  }
  const [userResult, reportResult] = await Promise.allSettled([
    apiFetch('/api/auth/me'),
    apiFetch(`/api/reports/overview?date=${todayDate}`)
  ])
  if (userResult.status === 'fulfilled' && userResult.value.ok) {
    const result = await userResult.value.json()
    userEmail.value = result.user.email
  }
  if (reportResult.status === 'fulfilled' && reportResult.value.ok) {
    const result = await reportResult.value.json()
    summary.value = result.summary
  }
})

function goToStudents() {
  router.push('/dashboard/alunos')
}
</script>

<style scoped>
.dashboard-page {
  width: min(100%, 1240px);
  margin: 0 auto;
  padding: 30px 34px 54px;
}
.page-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 24px;
}
.date-line {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #8a968e;
  font-size: 10px;
  font-weight: 550;
  text-transform: capitalize;
}
.date-line .q-icon {
  color: #a4b95f;
  font-size: 15px;
}
.page-heading h1 {
  margin: 8px 0 5px;
  color: #26392f;
  font-size: clamp(23px, 3vw, 29px);
  font-weight: 700;
  letter-spacing: -1.1px;
}
.page-heading h1 span {
  color: #5a794a;
}
.page-heading p {
  margin: 0;
  color: #87938b;
  font-size: 11px;
}
.new-record-button {
  min-height: 40px;
  padding: 0 14px;
  border-radius: 9px;
  color: #fff;
  background: #214e3d;
  font-size: 11px;
  font-weight: 650;
}
.welcome-banner {
  position: relative;
  display: flex;
  min-height: 210px;
  overflow: hidden;
  border-radius: 17px;
  color: #f7f9f5;
  background: linear-gradient(112deg, #163b33 0%, #225844 64%, #34715a 100%);
}
.banner-copy {
  position: relative;
  z-index: 2;
  align-self: center;
  padding: 29px 36px;
}
.banner-tag {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #d6f17b;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 1.35px;
}
.banner-tag span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #d6f17b;
  box-shadow: 0 0 0 4px #d6f17b25;
}
.banner-copy h2 {
  margin: 14px 0 8px;
  font-size: clamp(22px, 3vw, 31px);
  font-weight: 680;
  letter-spacing: -1.1px;
  line-height: 1.13;
}
.banner-copy p {
  margin: 0;
  color: #c1d1c8;
  font-size: 11px;
}
.banner-link {
  margin: 15px 0 0 -10px;
  color: #ddf598;
  font-size: 10px;
  font-weight: 650;
}
.banner-illustration {
  position: absolute;
  inset: 0 0 0 auto;
  width: 42%;
  overflow: hidden;
}
.illustration-orbit {
  position: absolute;
  top: 50%;
  right: 60px;
  width: 190px;
  height: 190px;
  border: 1px solid #ffffff1c;
  border-radius: 50%;
  transform: translateY(-50%);
}
.orbit-two {
  right: 87px;
  width: 136px;
  height: 136px;
}
.illustration-sun {
  position: absolute;
  top: 25px;
  right: 60px;
  width: 35px;
  height: 35px;
  border-radius: 50%;
  background: #d6f17b;
  opacity: 0.9;
}
.illustration-road {
  position: absolute;
  right: -45px;
  bottom: 36px;
  width: 360px;
  height: 35px;
  border-top: 1px dashed #ffffff64;
  border-radius: 50%;
  transform: rotate(-14deg);
}
.bus-art {
  position: absolute;
  top: 50%;
  right: 132px;
  display: grid;
  place-items: center;
  width: 80px;
  height: 80px;
  border: 1px solid #ffffff25;
  border-radius: 24px;
  color: #d6f17b;
  background: #ffffff12;
  box-shadow: 0 12px 28px #0a271b30;
  transform: translateY(-44%) rotate(-5deg);
  backdrop-filter: blur(8px);
}
.bus-art .q-icon {
  font-size: 43px;
}
.banner-sticker {
  position: absolute;
  right: 24px;
  bottom: 22px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid #ffffff20;
  border-radius: 8px;
  color: #e2ebdf;
  background: #ffffff10;
  font-size: 8px;
}
.banner-sticker .q-icon {
  color: #d6f17b;
  font-size: 12px;
}
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 13px;
  margin: 18px 0 20px;
}
.metric-card {
  min-width: 0;
  padding: 15px 16px 14px;
  border: 1px solid #e8ece7;
  border-radius: 12px;
  background: #fff;
}
.metric-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.metric-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  font-size: 17px;
}
.metric-icon.green,
.shortcut-icon.green {
  color: #5d813d;
  background: #eff5e7;
}
.metric-icon.blue,
.shortcut-icon.blue {
  color: #507897;
  background: #edf4f8;
}
.metric-icon.yellow,
.shortcut-icon.yellow {
  color: #a18034;
  background: #faf5e5;
}
.metric-icon.purple,
.shortcut-icon.purple {
  color: #7b6c9d;
  background: #f3eff8;
}
.metric-icon.orange,
.shortcut-icon.orange {
  color: #b77946;
  background: #fbf1e9;
}
.metric-label {
  margin-top: 13px;
  color: #79867d;
  font-size: 10px;
  font-weight: 550;
}
.metric-value {
  margin-top: 1px;
  color: #293b31;
  font-size: 25px;
  font-weight: 700;
  letter-spacing: -0.9px;
}
.metric-note {
  overflow: hidden;
  color: #a1aaa3;
  font-size: 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(300px, 0.9fr);
  gap: 14px;
}
.surface-card {
  min-width: 0;
  border-color: #e8ece7;
  border-radius: 13px;
  background: #fff;
}
.schedule-card,
.setup-card {
  padding: 18px;
}
.card-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.card-eyebrow {
  color: #9aa69d;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 1.1px;
}
.card-heading h2,
.shortcuts-heading h2 {
  margin: 5px 0 0;
  color: #2d3d33;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.25px;
}
.schedule-empty {
  display: grid;
  justify-items: center;
  padding: 12px 15px 5px;
  text-align: center;
}
.empty-graphic {
  position: relative;
  display: grid;
  place-items: center;
  width: 120px;
  height: 92px;
  margin: 4px 0 6px;
  overflow: hidden;
  color: #73924c;
}
.empty-graphic::before {
  position: absolute;
  bottom: 12px;
  width: 87px;
  height: 46px;
  border-radius: 50%;
  background: #f0f5e5;
  content: '';
}
.empty-graphic > .q-icon {
  z-index: 1;
  margin-top: 5px;
  font-size: 43px;
}
.empty-sun {
  position: absolute;
  top: 8px;
  right: 19px;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background: #d9e99a;
}
.empty-road {
  position: absolute;
  bottom: 17px;
  left: 10px;
  width: 103px;
  border-top: 1px dashed #a8b995;
}
.schedule-empty h3 {
  margin: 3px 0 5px;
  color: #425147;
  font-size: 11px;
  font-weight: 700;
}
.schedule-empty p {
  max-width: 280px;
  margin: 0;
  color: #929e95;
  font-size: 9px;
  line-height: 1.6;
}
.soft-button {
  margin-top: 11px;
  border-color: #dce6d2;
  border-radius: 8px;
  color: #527248;
  font-size: 9px;
}
.setup-count {
  padding: 5px 8px;
  border-radius: 6px;
  color: #73834c;
  background: #f2f5e7;
  font-size: 8px;
  font-weight: 650;
}
.setup-intro {
  margin: 10px 0 11px;
  color: #929e95;
  font-size: 9px;
  line-height: 1.6;
}
.setup-list {
  display: grid;
  gap: 5px;
}
.setup-step {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 8px 7px;
  border-radius: 8px;
  color: inherit;
  text-decoration: none;
  transition: background 0.18s;
}
.setup-step:hover {
  background: #f7f9f4;
}
.step-icon {
  display: grid;
  flex: 0 0 30px;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  color: #66834d;
  background: #f0f5e8;
  font-size: 15px;
}
.step-copy {
  display: grid;
  flex: 1;
  gap: 3px;
  min-width: 0;
}
.step-copy strong {
  overflow: hidden;
  color: #48574d;
  font-size: 9px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.step-copy small {
  overflow: hidden;
  color: #a0aaa2;
  font-size: 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.step-arrow {
  color: #a4aea6;
  font-size: 16px;
}
.shortcuts-section {
  margin-top: 22px;
}
.shortcuts-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  margin-bottom: 12px;
}
.shortcuts-heading > span {
  color: #8c9990;
  font-size: 9px;
}
.shortcuts-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 10px;
}
.shortcut-card {
  position: relative;
  display: grid;
  justify-items: start;
  gap: 10px;
  min-width: 0;
  padding: 13px 12px;
  border: 1px solid #e8ece7;
  border-radius: 11px;
  color: inherit;
  background: #fff;
  text-decoration: none;
  transition:
    transform 0.18s,
    box-shadow 0.18s;
}
.shortcut-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px #173f360d;
}
.shortcut-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  font-size: 17px;
}
.shortcut-card strong {
  overflow: hidden;
  max-width: 100%;
  color: #4d5c51;
  font-size: 9px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.shortcut-arrow {
  position: absolute;
  top: 15px;
  right: 11px;
  color: #a7b0a9;
  font-size: 13px;
}
@media (max-width: 1050px) {
  .shortcuts-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .content-grid {
    grid-template-columns: minmax(0, 1fr) minmax(280px, 0.9fr);
  }
}
@media (max-width: 760px) {
  .dashboard-page {
    padding: 22px 18px 40px;
  }
  .metrics-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .content-grid {
    grid-template-columns: 1fr;
  }
  .shortcuts-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .banner-illustration {
    width: 38%;
    opacity: 0.75;
  }
  .bus-art {
    right: 50px;
  }
}
@media (max-width: 520px) {
  .page-heading {
    align-items: flex-start;
  }
  .new-record-button {
    min-height: 36px;
    padding: 0 9px;
    font-size: 9px;
  }
  .new-record-button :deep(.q-icon) {
    font-size: 15px;
  }
  .welcome-banner {
    min-height: 198px;
  }
  .banner-copy {
    padding: 25px 21px;
  }
  .banner-copy h2 {
    font-size: 22px;
  }
  .banner-copy p {
    max-width: 220px;
    font-size: 9px;
    line-height: 1.5;
  }
  .banner-sticker {
    right: 12px;
    bottom: 12px;
    font-size: 7px;
  }
  .illustration-orbit {
    right: -48px;
  }
  .orbit-two {
    right: -20px;
  }
  .illustration-sun {
    right: 17px;
  }
  .bus-art {
    right: 18px;
    width: 60px;
    height: 60px;
    border-radius: 18px;
  }
  .bus-art .q-icon {
    font-size: 34px;
  }
  .shortcuts-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
