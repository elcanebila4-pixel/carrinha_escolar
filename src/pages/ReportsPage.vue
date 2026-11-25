<template>
  <q-page class="reports-page">
    <header class="page-heading">
      <div>
        <div class="eyebrow">VISÃO DA OPERAÇÃO</div>
        <h1>Relatórios</h1>
        <p>Acompanhe os registos e as viagens da escola.</p>
      </div>
      <div class="report-actions">
        <q-input v-model="reportDate" outlined dense type="date" label="Data das viagens" stack-label class="date-input" @update:model-value="loadReport" />
        <q-btn flat no-caps icon="download" label="Exportar CSV" class="export-button" :disable="!report || !report.today_trips.length" @click="exportCsv" />
      </div>
    </header>

    <q-banner v-if="errorMessage" rounded class="error-message" role="alert">
      <template #avatar><q-icon name="error_outline" /></template>{{ errorMessage }}
    </q-banner>

    <div v-if="loading && !report" class="loading-state"><q-spinner-dots color="primary" size="34px" /><span>A carregar o relatório...</span></div>
    <template v-else-if="report">
      <section class="summary-grid">
        <q-card v-for="item in summaries" :key="item.label" flat bordered class="summary-card">
          <span class="summary-icon" :class="item.tone"><q-icon :name="item.icon" /></span>
          <span class="summary-copy"><small>{{ item.label }}</small><strong>{{ report.summary[item.key] }}</strong></span>
        </q-card>
      </section>

      <section class="report-grid">
        <q-card flat bordered class="report-card trips-card">
          <div class="card-heading">
            <div><div class="card-kicker">{{ formattedSelectedDate }}</div><h2>Viagens do dia</h2></div>
            <span class="trip-total">{{ report.summary.trips_today }} {{ report.summary.trips_today === 1 ? 'viagem' : 'viagens' }}</span>
          </div>

          <q-table flat :rows="report.today_trips" :columns="columns" row-key="id" :loading="loading" :pagination="{ rowsPerPage: 10 }" no-data-label="Não há viagens para esta data" class="trips-table">
            <template #body-cell-departure_time="props"><q-td :props="props"><span class="time-pill">{{ props.row.departure_time || '—' }}</span></q-td></template>
            <template #body-cell-route_name="props"><q-td :props="props"><div class="route-cell"><strong>{{ props.row.route_name }}</strong><small>{{ props.row.start_point }} → {{ props.row.end_point }}</small></div></q-td></template>
            <template #body-cell-status="props"><q-td :props="props"><span class="status-pill" :class="`status-${props.row.status}`">{{ statusLabel(props.row.status) }}</span></q-td></template>
            <template #no-data="{ message }"><div class="empty-table"><q-icon name="event_available" /><strong>Dia livre de viagens</strong><span>{{ message }}</span></div></template>
          </q-table>
        </q-card>

        <q-card flat bordered class="report-card completion-card">
          <div class="card-kicker">EXECUÇÃO</div>
          <h2>Viagens concluídas</h2>
          <div class="completion-visual">
            <q-circular-progress
              :value="completionRate"
              size="142px"
              :thickness="0.12"
              color="positive"
              track-color="grey-3"
              rounded
            >
              <div class="completion-value">{{ completionRate }}<small>%</small></div>
            </q-circular-progress>
          </div>
          <p><strong>{{ report.summary.completed_today }}</strong> de <strong>{{ report.summary.trips_today }}</strong> viagens marcadas como concluídas.</p>
          <div v-if="report.summary.trips_today === 0" class="no-trip-note"><q-icon name="info_outline" /> O indicador aparece quando existirem viagens nesta data.</div>
        </q-card>
      </section>

      <q-card flat bordered class="incidents-card">
        <div class="incidents-heading">
          <div><div class="card-kicker">COMUNICAÇÕES DOS MOTORISTAS</div><h2>Ocorrências da data</h2></div>
          <q-badge color="deep-orange">{{ report.incidents?.length || 0 }}</q-badge>
        </div>
        <div v-if="report.incidents?.length" class="incidents-list">
          <article v-for="incident in report.incidents" :key="incident.id" class="incident-row">
            <q-icon :name="incidentIcon(incident.type)" />
            <div><strong>{{ incidentLabel(incident.type) }} · {{ incident.route_name }}</strong><p>{{ incident.description }}</p><small>{{ incident.driver_name || 'Motorista' }} · {{ formatIncidentTime(incident.created_at) }}</small></div>
          </article>
        </div>
        <p v-else class="no-incidents">Não foram comunicadas ocorrências nesta data.</p>
      </q-card>

      <section class="module-links">
        <div><h2>Dados da escola</h2><p>Os totais são atualizados a partir dos registos do sistema.</p></div>
        <div class="link-row">
          <router-link to="/dashboard/alunos">Alunos <q-icon name="arrow_forward" /></router-link>
          <router-link to="/dashboard/encarregados">Encarregados <q-icon name="arrow_forward" /></router-link>
          <router-link to="/dashboard/carrinhas">Carrinhas <q-icon name="arrow_forward" /></router-link>
          <router-link to="/dashboard/rotas">Rotas <q-icon name="arrow_forward" /></router-link>
        </div>
      </section>
    </template>
  </q-page>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { apiFetch } from '../services/api-url.js'

const reportDate = ref(maputoToday())
const report = ref(null)
const loading = ref(false)
const errorMessage = ref('')

const summaries = [
  { key: 'students', label: 'Alunos', icon: 'school', tone: 'green' },
  { key: 'guardians', label: 'Encarregados', icon: 'family_restroom', tone: 'blue' },
  { key: 'drivers', label: 'Motoristas', icon: 'badge', tone: 'yellow' },
  { key: 'vehicles', label: 'Carrinhas', icon: 'airport_shuttle', tone: 'purple' },
  { key: 'routes', label: 'Rotas', icon: 'route', tone: 'orange' },
  { key: 'trips_today', label: 'Viagens na data', icon: 'commute', tone: 'blue' }
]

const columns = [
  { name: 'departure_time', label: 'HORA', field: 'departure_time', align: 'left', sortable: true },
  { name: 'route_name', label: 'ROTA', field: 'route_name', align: 'left' },
  { name: 'vehicle_plate', label: 'CARRINHA', field: 'vehicle_plate', align: 'left' },
  { name: 'driver_name', label: 'MOTORISTA', field: 'driver_name', align: 'left' },
  { name: 'status', label: 'ESTADO', field: 'status', align: 'left' }
]
const completionRate = computed(() => report.value?.summary.trips_today
  ? Math.round((report.value.summary.completed_today / report.value.summary.trips_today) * 100)
  : 0)
const formattedSelectedDate = computed(() => new Intl.DateTimeFormat('pt-MZ', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Maputo'
}).format(new Date(`${reportDate.value}T12:00:00+02:00`)))

onMounted(loadReport)

function maputoToday() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Africa/Maputo'
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function statusLabel(status) {
  return ({ scheduled: 'Agendada', in_progress: 'Em andamento', completed: 'Concluída', cancelled: 'Cancelada' })[status] || status
}
function incidentLabel(type) {
  return ({ delay: 'Atraso', breakdown: 'Avaria da carrinha', other: 'Outro problema' })[type] || type
}
function incidentIcon(type) {
  return ({ delay: 'schedule', breakdown: 'build', other: 'report_problem' })[type] || 'info'
}
function formatIncidentTime(value) {
  return new Date(value).toLocaleString('pt-MZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Maputo' })
}

async function loadReport() {
  if (!reportDate.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await apiFetch(`/api/reports/overview?date=${encodeURIComponent(reportDate.value)}`)
    const result = await response.json().catch(() => null)
    if (!result) throw new Error('Resposta inválida do servidor.')
    if (!response.ok) throw new Error(result.message || 'Não foi possível carregar o relatório.')
    report.value = result
  } catch (error) {
    errorMessage.value = error.message || 'Não foi possível contactar a API de relatórios.'
  } finally {
    loading.value = false
  }
}

function exportCsv() {
  const rows = [
    ['Hora', 'Rota', 'Partida', 'Destino', 'Carrinha', 'Motorista', 'Estado'],
    ...report.value.today_trips.map((trip) => [
      trip.departure_time || '', trip.route_name, trip.start_point, trip.end_point,
      trip.vehicle_plate || '', trip.driver_name || '', statusLabel(trip.status)
    ])
  ]
  const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(';')).join('\r\n')
  const file = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(file)
  link.download = `viagens-${reportDate.value}.csv`
  link.click()
  URL.revokeObjectURL(link.href)
}
</script>

<style scoped>
.reports-page { width: min(100%, 1240px); margin: 0 auto; padding: 30px 34px 54px; }
.page-heading { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 21px; }
.eyebrow, .card-kicker { color: #8b998f; font-size: 8px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; }
.page-heading h1 { margin: 7px 0 5px; color: #26392f; font-size: 26px; font-weight: 720; letter-spacing: -.9px; }
.page-heading p { margin: 0; color: #87938b; font-size: 11px; }
.report-actions { display: flex; align-items: center; gap: 9px; }
.date-input { width: 175px; }
.date-input :deep(.q-field__control) { border-radius: 8px; }
.date-input :deep(.q-field__label), .date-input :deep(.q-field__native) { font-size: 10px; }
.export-button { color: #527248; font-size: 10px; }
.error-message { margin-bottom: 16px; border: 1px solid #f0d3ce; color: #9a4235; background: #fff5f3; font-size: 11px; }
.loading-state { display: grid; justify-items: center; gap: 8px; padding: 80px 20px; color: #87938b; font-size: 10px; }
.summary-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 11px; margin-bottom: 15px; }
.summary-card { display: flex; align-items: center; gap: 11px; padding: 13px 14px; border-color: #e8ece7; border-radius: 11px; background: #fff; }
.summary-icon { display: grid; flex: 0 0 36px; place-items: center; width: 36px; height: 36px; border-radius: 10px; font-size: 17px; }
.summary-icon.green { color: #5d813d; background: #eff5e7; }
.summary-icon.blue { color: #507897; background: #edf4f8; }
.summary-icon.yellow { color: #a18034; background: #faf5e5; }
.summary-icon.purple { color: #7b6c9d; background: #f3eff8; }
.summary-icon.orange { color: #b77946; background: #fbf1e9; }
.summary-copy { display: grid; gap: 4px; }
.summary-copy small { color: #829087; font-size: 8px; }
.summary-copy strong { color: #293b31; font-size: 17px; line-height: 1; }
.report-grid { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(245px, .65fr); gap: 13px; }
.report-card { min-width: 0; border-color: #e8ece7; border-radius: 12px; background: #fff; }
.trips-card { overflow: hidden; padding-top: 17px; }
.card-heading { display: flex; align-items: center; justify-content: space-between; padding: 0 17px 14px; }
.card-heading h2, .completion-card h2 { margin: 5px 0 0; color: #2d3d33; font-size: 14px; font-weight: 700; }
.trip-total { padding: 6px 9px; border-radius: 7px; color: #5a774a; background: #f0f5e8; font-size: 8px; }
.trips-table :deep(thead tr th) { color: #929e95; background: #fafbf9; font-size: 8px; font-weight: 750; letter-spacing: .6px; }
.trips-table :deep(tbody td) { height: 54px; color: #5f6c63; font-size: 9px; }
.time-pill { padding: 5px 7px; border-radius: 6px; color: #5d7847; background: #f0f5e8; font-size: 9px; }
.route-cell { display: grid; gap: 4px; min-width: 140px; }
.route-cell strong { color: #39493e; font-size: 9px; font-weight: 650; }
.route-cell small { color: #9aa59d; font-size: 8px; }
.status-pill { display: inline-block; padding: 5px 7px; border-radius: 6px; color: #89713a; background: #faf5e4; font-size: 8px; white-space: nowrap; }
.status-completed { color: #4d7240; background: #eff5e7; }
.status-in_progress { color: #4d7892; background: #edf4f8; }
.status-cancelled { color: #a45d50; background: #fff0ed; }
.empty-table { display: grid; justify-items: center; width: 100%; padding: 34px 12px; color: #87938b; text-align: center; }
.empty-table .q-icon { color: #9bb27a; font-size: 25px; }
.empty-table strong { margin-top: 8px; color: #46564b; font-size: 10px; }
.empty-table span { margin-top: 4px; font-size: 8px; }
.completion-card { display: flex; flex-direction: column; align-items: center; padding: 19px 17px; text-align: center; }
.completion-card .card-kicker { align-self: flex-start; }
.completion-card h2 { align-self: flex-start; }
.completion-visual { display: grid; place-items: center; flex: 1; min-height: 180px; }
.completion-value { color: #314839; font-size: 26px; font-weight: 750; letter-spacing: -1px; }
.completion-value small { font-size: 12px; }
.completion-card > p { margin: 0; color: #849087; font-size: 9px; line-height: 1.6; }
.completion-card > p strong { color: #485a4d; }
.no-trip-note { display: flex; align-items: flex-start; gap: 5px; margin-top: 10px; color: #9aa49d; font-size: 8px; line-height: 1.5; text-align: left; }
.no-trip-note .q-icon { flex: 0 0 auto; font-size: 13px; }
.module-links { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-top: 17px; padding: 15px 17px; border: 1px solid #e8ece7; border-radius: 11px; background: #fff; }
.incidents-card { margin-top: 15px; padding: 17px; border-color: #e8ece7; border-radius: 12px; }
.incidents-heading { display: flex; align-items: center; justify-content: space-between; padding-bottom: 12px; border-bottom: 1px solid #edf0ec; }
.incidents-heading h2 { margin: 5px 0 0; color: #2d3d33; font-size: 14px; }
.incidents-list { display: grid; gap: 10px; padding-top: 12px; }
.incident-row { display: flex; align-items: flex-start; gap: 10px; padding: 10px; border-radius: 8px; background: #fff8f3; }
.incident-row > :deep(.q-icon) { color: #bf763b; }
.incident-row strong { color: #46564b; font-size: 10px; }
.incident-row p { margin: 4px 0; color: #68756c; font-size: 10px; white-space: pre-wrap; }
.incident-row small, .no-incidents { color: #8b978e; font-size: 9px; }
.no-incidents { margin: 14px 0 2px; }
.module-links h2 { margin: 0 0 4px; color: #35453a; font-size: 10px; }
.module-links p { margin: 0; color: #929e95; font-size: 8px; }
.link-row { display: flex; flex-wrap: wrap; gap: 7px; }
.link-row a { display: flex; align-items: center; gap: 5px; padding: 7px 8px; border-radius: 7px; color: #5a744c; background: #f5f8ef; font-size: 8px; text-decoration: none; }
.link-row .q-icon { font-size: 12px; }
@media (max-width: 950px) {
  .report-grid { grid-template-columns: 1fr; }
  .completion-card { min-height: 255px; }
  .completion-visual { min-height: 160px; }
  .module-links { align-items: flex-start; flex-direction: column; }
}
@media (max-width: 700px) {
  .reports-page { padding: 22px 18px 40px; }
  .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .page-heading { align-items: flex-start; flex-direction: column; }
  .report-actions { width: 100%; }
  .date-input { flex: 1; width: auto; }
}
</style>
