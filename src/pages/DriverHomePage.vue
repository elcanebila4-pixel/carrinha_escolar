<template>
  <q-page class="driver-page">
    <header class="page-heading">
      <div>
        <div class="eyebrow">ÁREA DO MOTORISTA</div>
        <h1>As minhas viagens</h1>
        <p>Consulte as rotas, acompanhe os estudantes e atualize a viagem.</p>
      </div>
      <q-icon name="airport_shuttle" size="34px" color="primary" />
    </header>

    <section
      v-if="driver"
      class="driver-profile"
      aria-label="Perfil do motorista"
    >
      <q-avatar size="56px" class="driver-avatar">
        <img
          v-if="driver.photo_url"
          :src="driver.photo_url"
          :alt="`Fotografia de ${driver.name}`"
        />
        <span v-else>{{ initials(driver.name) }}</span>
      </q-avatar>
      <div>
        <strong>{{ driver.name }}</strong>
        <a v-if="driver.phone" :href="`tel:${driver.phone}`">{{
          driver.phone
        }}</a>
      </div>
    </section>

    <q-banner v-if="errorMessage" rounded class="error-banner" role="alert">
      <template #avatar><q-icon name="error_outline" /></template>
      {{ errorMessage }}
      <template #action
        ><q-btn
          flat
          round
          dense
          icon="close"
          aria-label="Fechar"
          @click="errorMessage = ''"
      /></template>
    </q-banner>

    <section
      v-if="loading"
      class="trips-grid"
      aria-label="A carregar viagens"
      aria-busy="true"
    >
      <q-card
        v-for="placeholder in 2"
        :key="placeholder"
        flat
        bordered
        class="trip-card trip-skeleton"
      >
        <div class="trip-topline"
          ><q-skeleton type="QAvatar" size="28px" /><q-skeleton
            type="QBadge"
            width="76px"
        /></div>
        <q-skeleton type="text" width="58%" height="28px" />
        <q-skeleton type="text" width="42%" />
        <q-skeleton v-for="line in 3" :key="line" type="text" width="82%" />
        <q-separator class="section-separator" />
        <q-skeleton type="text" width="48%" />
        <q-skeleton
          v-for="line in 2"
          :key="`student-${line}`"
          type="rect"
          height="48px"
        />
      </q-card>
    </section>
    <section v-else-if="trips.length" class="trips-grid">
      <q-card
        v-for="trip in trips"
        :key="trip.id"
        flat
        bordered
        class="trip-card"
      >
        <div class="trip-topline">
          <q-icon name="route" color="primary" />
          <q-badge rounded :color="statusColor(trip.status)">{{
            statusLabel(trip.status)
          }}</q-badge>
        </div>
        <h2>{{ trip.route_name }}</h2>
        <p class="trip-date"
          >{{ formatDate(trip.trip_date)
          }}<span v-if="trip.departure_time">
            · {{ trip.departure_time }}</span
          ></p
        >
        <div class="trip-detail"
          ><q-icon name="trip_origin" /> {{ trip.start_point }}</div
        >
        <div class="trip-detail"
          ><q-icon name="place" /> {{ trip.end_point }}</div
        >
        <div v-if="trip.vehicle_plate || trip.vehicle_model" class="trip-detail"
          ><q-icon name="airport_shuttle" />
          {{
            [trip.vehicle_plate, trip.vehicle_model]
              .filter(Boolean)
              .join(' · ')
          }}<span v-if="trip.vehicle_capacity">
            · {{ trip.students.length }}/{{
              trip.vehicle_capacity
            }}
            lugares</span
          ></div
        >
        <div v-if="trip.started_at" class="trip-detail trip-time"
          ><q-icon name="play_arrow" /> Partida:
          {{ formatTime(trip.started_at) }}</div
        >
        <div v-if="trip.finished_at" class="trip-detail trip-time"
          ><q-icon name="flag" /> Chegada:
          {{ formatTime(trip.finished_at) }}</div
        >

        <q-separator class="section-separator" />
        <div class="section-heading"
          ><h3>Estudantes da rota</h3
          ><q-badge color="grey-7">{{ trip.students.length }}</q-badge></div
        >
        <div v-if="trip.students.length" class="student-list">
          <div
            v-for="student in trip.students"
            :key="student.id"
            class="student-row"
          >
            <div class="student-copy">
              <strong>{{ student.name }}</strong>
              <small>{{
                [student.class_name, student.pickup_address]
                  .filter(Boolean)
                  .join(' · ') || 'Sem detalhes de recolha'
              }}</small>
              <q-badge
                :color="studentStatusColor(student.status)"
                class="student-state"
                >{{ studentStatusLabel(student.status) }}</q-badge
              >
              <small v-if="student.guardian_name"
                >Encarregado: {{ student.guardian_name }}</small
              >
              <a
                v-if="student.guardian_phone"
                class="guardian-phone"
                :href="`tel:${student.guardian_phone}`"
                >{{ student.guardian_phone }}</a
              >
            </div>
            <q-btn
              v-if="
                trip.status === 'in_progress' &&
                ['awaiting_pickup', 'no_show'].includes(student.status)
              "
              dense
              flat
              no-caps
              color="positive"
              icon="login"
              label="Embarcou"
              :loading="busyKey === `student-${student.id}`"
              @click="setStudentStatus(trip, student, 'boarded')"
            />
            <q-btn
              v-if="
                trip.status === 'in_progress' &&
                student.status === 'awaiting_pickup'
              "
              dense
              flat
              no-caps
              color="negative"
              icon="person_off"
              label="Não compareceu"
              :loading="busyKey === `student-${student.id}`"
              @click="setStudentStatus(trip, student, 'no_show')"
            />
            <q-btn
              v-if="
                trip.status === 'in_progress' && student.status === 'boarded'
              "
              dense
              flat
              no-caps
              color="blue-grey"
              icon="logout"
              label="Desembarcou"
              :loading="busyKey === `student-${student.id}`"
              @click="setStudentStatus(trip, student, 'alighted')"
            />
          </div>
        </div>
        <p v-else class="muted-copy"
          >Ainda não há estudantes associados a esta rota. A administração pode
          associá-los no cadastro de alunos.</p
        >

        <div
          v-if="trip.status === 'in_progress' || trip.pickup_points?.length"
          class="pickup-map-section"
        >
          <div class="section-heading"
            ><h3>Pontos de recolha</h3
            ><span class="map-key"
              ><i class="pickup-dot" /> Recolha
              <i class="van-dot" /> Carrinha</span
            ></div
          >
          <MapaLocalizacao
            class="driver-pickup-map"
            :locations="mapLocations(trip)"
            :destination="tripDestination(trip)"
          />
          <p v-if="!trip.pickup_points?.length" class="muted-copy">
            {{
              trip.pickup_points_error ||
              'Os pontos de recolha aparecem quando os encarregados marcarem as coordenadas no mapa.'
            }}
          </p>
          <p v-if="!tripDestination(trip)" class="muted-copy">
            Defina as coordenadas do destino no cadastro da rota para mostrar o
            trajecto e o tempo restante.
          </p>
        </div>

        <q-separator class="section-separator" />
        <div class="trip-actions">
          <q-btn
            v-if="trip.status === 'scheduled'"
            unelevated
            no-caps
            color="primary"
            icon="play_arrow"
            label="Iniciar viagem"
            :loading="busyKey === `trip-${trip.id}`"
            @click="changeTripStatus(trip, 'start')"
          />
          <q-btn
            v-else-if="trip.status === 'in_progress'"
            unelevated
            no-caps
            color="negative"
            icon="stop"
            label="Finalizar viagem"
            :loading="busyKey === `trip-${trip.id}`"
            @click="changeTripStatus(trip, 'finish')"
          />
          <q-btn
            v-if="trip.status === 'in_progress'"
            outline
            no-caps
            color="primary"
            :icon="trackingTripId === trip.id ? 'gps_fixed' : 'my_location'"
            :label="trackingTripId === trip.id ? 'GPS ativo' : 'Partilhar GPS'"
            :loading="busyKey === `gps-${trip.id}`"
            @click="
              trackingTripId === trip.id ? stopTracking() : startTracking(trip)
            "
          />
          <q-btn
            v-if="trip.status === 'in_progress'"
            flat
            no-caps
            color="deep-orange"
            icon="report_problem"
            label="Informar problema"
            @click="openReport(trip)"
          />
        </div>
        <p v-if="trip.location" class="gps-caption">
          GPS atualizado {{ formatTime(trip.location.recorded_at) }}
          <span v-if="trip.location.latitude != null">
            · {{ Number(trip.location.latitude).toFixed(5) }},
            {{ Number(trip.location.longitude).toFixed(5) }}</span
          >
        </p>
        <p v-if="trip.status === 'in_progress'" class="gps-caption">
          Mantenha esta página aberta durante a viagem. Se o telefone suspender
          a aplicação, volte a abri-la para atualizar o GPS.
        </p>
        <div v-if="trip.notifications?.length" class="activity-list">
          <strong>Atividade recente</strong>
          <div
            v-for="(item, index) in trip.notifications.slice(0, 5)"
            :key="`${item.created_at}-${index}`"
            class="activity-row"
          >
            <q-icon :name="activityIcon(item.type)" />
            <span
              >{{ activityLabel(item)
              }}<small>{{ formatTime(item.created_at) }}</small></span
            >
          </div>
        </div>
        <div v-if="trip.reports.length" class="reports-list">
          <strong>Ocorrências comunicadas</strong>
          <div
            v-for="(report, index) in trip.reports"
            :key="`${report.created_at}-${index}`"
            class="report-row"
          >
            <q-icon :name="reportIcon(report.type)" />
            <span
              ><b>{{ reportLabel(report.type) }}</b> · {{ report.description
              }}<small>{{ formatTime(report.created_at) }}</small></span
            >
          </div>
        </div>
      </q-card>
    </section>
    <q-card v-else flat bordered class="empty-state">
      <q-icon name="event_busy" />
      <h2>Não há viagens atribuídas</h2>
      <p
        >Quando a administração lhe atribuir uma rota e uma viagem, elas
        aparecerão aqui.</p
      >
    </q-card>

    <q-dialog v-model="reportDialog" persistent>
      <q-card class="report-dialog">
        <q-form @submit="submitReport">
          <q-card-section>
            <div class="eyebrow">COMUNICAR OCORRÊNCIA</div>
            <h2>Problema durante a viagem</h2>
            <p>{{ selectedTrip?.route_name }}</p>
          </q-card-section>
          <q-banner v-if="dialogError" dense rounded class="error-banner">{{
            dialogError
          }}</q-banner>
          <q-card-section class="report-fields">
            <q-select
              v-model="reportType"
              :options="reportTypes"
              outlined
              dense
              emit-value
              map-options
              label="Tipo de ocorrência"
            />
            <q-input
              v-model="reportDescription"
              outlined
              type="textarea"
              autogrow
              maxlength="1000"
              label="Descreva o atraso, avaria ou outro problema *"
              :rules="[value => !!value?.trim() || 'Descreva a ocorrência']"
            />
          </q-card-section>
          <q-card-actions align="right">
            <q-btn
              flat
              no-caps
              label="Cancelar"
              :disable="busyKey === 'report'"
              @click="reportDialog = false"
            />
            <q-btn
              unelevated
              no-caps
              color="primary"
              label="Enviar ocorrência"
              type="submit"
              :loading="busyKey === 'report'"
            />
          </q-card-actions>
        </q-form>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import MapaLocalizacao from '../components/MapaLocalizacao.vue'
import { apiFetch } from '../services/api-url.js'

const trips = ref([])
const driver = ref(null)
const loading = ref(true)
const errorMessage = ref('')
const busyKey = ref('')
const trackingTripId = ref(null)
const reportDialog = ref(false)
const selectedTrip = ref(null)
const reportType = ref('other')
const reportDescription = ref('')
let geolocationWatchId = null
let refreshTimer = null
let trackingTrip = null
let gpsRequestInFlight = false
let attemptedInitialTracking = false

const reportTypes = [
  { label: 'Atraso', value: 'delay' },
  { label: 'Avaria da carrinha', value: 'breakdown' },
  { label: 'Outro problema', value: 'other' }
]

onMounted(() => {
  document.addEventListener('visibilitychange', refreshGpsWhenVisible)
  loadTrips()
  refreshTimer = setInterval(() => {
    if (!busyKey.value) loadTrips(true)
  }, 15000)
})
onUnmounted(() => {
  document.removeEventListener('visibilitychange', refreshGpsWhenVisible)
  if (refreshTimer) clearInterval(refreshTimer)
  stopTracking()
})

async function api(path, options = {}) {
  const response = await apiFetch(path, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  })
  const result = await response.json().catch(() => null)
  if (!result) throw new Error('Resposta inválida da API.')
  if (!response.ok) {
    const error = new Error(result.message || 'Pedido recusado pela API.')
    error.status = response.status
    throw error
  }
  return result
}

async function loadTrips(silent = false) {
  if (!silent) {
    loading.value = true
    errorMessage.value = ''
  }
  try {
    const result = await api('/api/driver/trips')
    driver.value = result.driver || null
    trips.value = await Promise.all(
      result.trips.map(async trip => {
        try {
          const pickupResult = await api(
            `/api/driver/trips/${trip.id}/pickup-points`
          )
          return { ...trip, pickup_points: pickupResult.points || [] }
        } catch (error) {
          return {
            ...trip,
            pickup_points: [],
            pickup_points_error: `Não foi possível carregar os pontos de recolha: ${error.message}`
          }
        }
      })
    )
    if (!attemptedInitialTracking) {
      attemptedInitialTracking = true
      const activeTrip = trips.value.find(trip => trip.status === 'in_progress')
      if (activeTrip) startTracking(activeTrip)
    }
  } catch (error) {
    if (!silent)
      errorMessage.value =
        error.message || 'Não foi possível carregar as viagens.'
  } finally {
    if (!silent) loading.value = false
  }
}

function mapLocations(trip) {
  const locations = []
  if (trip.location?.latitude != null && trip.location?.longitude != null) {
    locations.push({
      id: `van-${trip.id}`,
      kind: 'van',
      latitude: Number(trip.location.latitude),
      longitude: Number(trip.location.longitude),
      title: `Carrinha · ${trip.route_name}`
    })
  }
  for (const point of trip.pickup_points || []) {
    locations.push({
      id: `pickup-${point.student_id}`,
      kind: 'pickup',
      latitude: Number(point.latitude),
      longitude: Number(point.longitude),
      title: `Recolha · ${point.student_name}${point.pickup_address ? ` · ${point.pickup_address}` : ''}`
    })
  }
  if (trip.end_latitude != null && trip.end_longitude != null) {
    locations.push({
      id: `destination-${trip.id}`,
      kind: 'destination',
      latitude: Number(trip.end_latitude),
      longitude: Number(trip.end_longitude),
      title: `Destino · ${trip.end_point}`
    })
  }
  return locations
}

function tripDestination(trip) {
  if (trip.end_latitude == null || trip.end_longitude == null) return null
  return {
    latitude: Number(trip.end_latitude),
    longitude: Number(trip.end_longitude),
    name: trip.end_point
  }
}

async function changeTripStatus(trip, action) {
  busyKey.value = `trip-${trip.id}`
  errorMessage.value = ''
  try {
    await api(`/api/driver/trips/${trip.id}/${action}`, { method: 'POST' })
    if (action === 'finish' && trackingTripId.value === trip.id) stopTracking()
    await loadTrips()
    if (action === 'start') startTracking(trip)
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    busyKey.value = ''
  }
}

async function setStudentStatus(trip, student, status) {
  busyKey.value = `student-${student.id}`
  errorMessage.value = ''
  try {
    await api(
      `/api/driver/trips/${trip.id}/students/${student.id}/attendance`,
      {
        method: 'POST',
        body: JSON.stringify({ status })
      }
    )
    student.status = status
    student.status_at = new Date().toISOString()
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    busyKey.value = ''
  }
}

function startTracking(trip) {
  if (!navigator.geolocation) {
    errorMessage.value = 'Este dispositivo não disponibiliza GPS.'
    return
  }
  errorMessage.value = ''
  if (geolocationWatchId !== null) navigator.geolocation.clearWatch(geolocationWatchId)
  trackingTrip = trip
  trackingTripId.value = trip.id
  geolocationWatchId = navigator.geolocation.watchPosition(
    ({ coords }) => sendGpsPosition(trip, coords),
    gpsError => {
      if (gpsError.code === 1) {
        errorMessage.value =
          'Permita o acesso \u00e0 localiza\u00e7\u00e3o neste dispositivo.'
        stopTracking()
        return
      }

      errorMessage.value =
        gpsError.code === 3
          ? 'O GPS ainda est\u00e1 a procurar sinal. A partilha continua ativa.'
          : 'N\u00e3o foi poss\u00edvel obter uma posi\u00e7\u00e3o agora. A partilha continua ativa.'
    },
    { enableHighAccuracy: true, maximumAge: 15000, timeout: 60000 }
  )
}

async function sendGpsPosition(trip, coords) {
  if (gpsRequestInFlight || trackingTripId.value !== trip.id) return
  gpsRequestInFlight = true
  busyKey.value = `gps-${trip.id}`
  try {
    const position = {
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy
    }
    const result = await api(`/api/trips/${trip.id}/location`, {
      method: 'POST',
      body: JSON.stringify(position)
    })
    trip.location = { ...position, recorded_at: result.recorded_at }
  } catch (error) {
    errorMessage.value = error.message
    if ([401, 403, 409].includes(error.status)) stopTracking()
  } finally {
    gpsRequestInFlight = false
    busyKey.value = ''
  }
}

function refreshGpsWhenVisible() {
  if (document.visibilityState !== 'visible' || !trackingTrip || !navigator.geolocation) return
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => sendGpsPosition(trackingTrip, coords),
    () => {},
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
  )
}

function stopTracking() {
  if (geolocationWatchId !== null)
    navigator.geolocation?.clearWatch(geolocationWatchId)
  geolocationWatchId = null
  trackingTripId.value = null
  trackingTrip = null
}

function openReport(trip) {
  selectedTrip.value = trip
  reportType.value = 'other'
  reportDescription.value = ''
  dialogError.value = ''
  reportDialog.value = true
}

async function submitReport() {
  if (!selectedTrip.value) return
  busyKey.value = 'report'
  dialogError.value = ''
  try {
    await api(`/api/driver/trips/${selectedTrip.value.id}/reports`, {
      method: 'POST',
      body: JSON.stringify({
        type: reportType.value,
        description: reportDescription.value
      })
    })
    reportDialog.value = false
    await loadTrips()
  } catch (error) {
    dialogError.value = error.message
  } finally {
    busyKey.value = ''
  }
}

function formatDate(value) {
  return new Intl.DateTimeFormat('pt-MZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date(`${value}T00:00:00`))
}
function formatTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleTimeString('pt-MZ', {
    hour: '2-digit',
    minute: '2-digit'
  })
}
function initials(name = '') {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(part => part[0])
      .join('')
      .toUpperCase() || 'M'
  )
}
function studentStatusLabel(status) {
  return (
    {
      awaiting_pickup: 'A aguardar recolha',
      boarded: 'Embarcou',
      no_show: 'Não compareceu',
      alighted: 'Desembarcou'
    }[status] || 'A aguardar recolha'
  )
}
function studentStatusColor(status) {
  return (
    {
      awaiting_pickup: 'grey-7',
      boarded: 'positive',
      no_show: 'negative',
      alighted: 'blue-grey'
    }[status] || 'grey-7'
  )
}
function activityLabel(item) {
  if (item.type === 'trip_started') return 'Viagem iniciada'
  if (item.type === 'trip_finished') return 'Viagem finalizada'
  if (item.type === 'boarded') return `${item.student_name} embarcou`
  if (item.type === 'no_show') return `${item.student_name} não compareceu`
  if (item.type === 'alighted') return `${item.student_name} desembarcou`
  return item.description || 'Atualização da viagem'
}
function activityIcon(type) {
  return (
    {
      trip_started: 'play_arrow',
      trip_finished: 'flag',
      boarded: 'login',
      no_show: 'person_off',
      alighted: 'logout'
    }[type] || 'report_problem'
  )
}
function statusLabel(status) {
  return (
    {
      scheduled: 'Agendada',
      in_progress: 'Em andamento',
      completed: 'Concluída',
      cancelled: 'Cancelada'
    }[status] || status
  )
}
function statusColor(status) {
  return (
    {
      scheduled: 'orange-8',
      in_progress: 'positive',
      completed: 'blue-grey',
      cancelled: 'negative'
    }[status] || 'grey'
  )
}
function reportLabel(type) {
  return (
    { delay: 'Atraso', breakdown: 'Avaria', other: 'Outro problema' }[type] ||
    type
  )
}
function reportIcon(type) {
  return (
    { delay: 'schedule', breakdown: 'build', other: 'report_problem' }[type] ||
    'info'
  )
}
</script>

<style scoped>
.driver-page {
  width: min(100%, 1120px);
  margin: 0 auto;
  padding: 38px 28px 58px;
  color: #20332a;
}
.page-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}
.driver-profile {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: -8px 0 22px;
}
.driver-avatar {
  background: #e7eee4;
  color: #355d3c;
  font-weight: 700;
}
.driver-profile > div {
  display: grid;
  gap: 3px;
}
.driver-profile strong {
  font-size: 15px;
}
.driver-profile a,
.guardian-phone {
  color: #547a3f;
  font-size: 12px;
  text-decoration: none;
}
.eyebrow {
  color: #718179;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1.2px;
}
h1 {
  margin: 8px 0;
  font-size: clamp(25px, 4vw, 34px);
}
.page-heading p,
.trip-date,
.empty-state p,
.muted-copy {
  color: #718179;
}
.trips-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
}
.trip-card {
  padding: 20px;
  border-radius: 14px;
}
.trip-topline,
.section-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.trip-topline :deep(.q-icon) {
  font-size: 22px;
}
.trip-card h2 {
  margin: 18px 0 4px;
  font-size: 19px;
}
.trip-date {
  margin: 0 0 17px;
  font-size: 13px;
}
.trip-detail {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 11px;
  font-size: 14px;
}
.trip-time {
  color: #547a3f;
  font-size: 12px;
}
.section-separator {
  margin: 17px 0;
}
.section-heading h3 {
  margin: 0;
  font-size: 14px;
}
.student-list {
  display: grid;
  gap: 8px;
  margin-top: 9px;
}
.student-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px;
  border-radius: 9px;
  background: #f6f8f5;
}
.student-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.student-copy strong {
  font-size: 13px;
}
.student-copy small {
  color: #718179;
  font-size: 11px;
  overflow-wrap: anywhere;
}
.student-copy .guardian-phone {
  justify-self: start;
}
.student-state {
  justify-self: start;
}
.muted-copy {
  font-size: 12px;
  line-height: 1.5;
}
.pickup-map-section {
  display: grid;
  gap: 9px;
  margin-top: 18px;
}
.pickup-map-section .section-heading {
  gap: 8px;
}
.map-key {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #718179;
  font-size: 10px;
}
.map-key i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}
.pickup-dot {
  background: #6275aa;
}
.van-dot {
  background: #467d47;
}
.driver-pickup-map {
  height: 250px;
  min-height: 250px;
  border-radius: 10px;
}
.trip-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.trip-actions :deep(.q-btn) {
  font-size: 11px;
}
.gps-caption {
  margin: 12px 0 0;
  color: #547a3f;
  font-size: 10px;
}
.reports-list {
  display: grid;
  gap: 8px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #edf0ec;
}
.reports-list > strong {
  font-size: 12px;
}
.report-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: #65756b;
  font-size: 11px;
  line-height: 1.5;
}
.report-row > :deep(.q-icon) {
  flex: 0 0 auto;
  color: #c17734;
}
.report-row span {
  display: grid;
}
.report-row small {
  color: #98a39b;
}
.activity-list {
  display: grid;
  gap: 8px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #edf0ec;
}
.activity-list > strong {
  font-size: 12px;
}
.activity-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: #65756b;
  font-size: 11px;
  line-height: 1.5;
}
.activity-row > :deep(.q-icon) {
  flex: 0 0 auto;
  color: #5e7f4c;
}
.activity-row span {
  display: grid;
}
.activity-row small {
  color: #98a39b;
}
.empty-state {
  padding: 38px 24px;
  border-radius: 14px;
  text-align: center;
}
.empty-state > :deep(.q-icon) {
  color: #829087;
  font-size: 38px;
}
.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px;
}
.error-banner {
  margin-bottom: 14px;
  color: #873f38;
  background: #fff1ef;
}
.report-dialog {
  width: min(100%, 460px);
  border-radius: 14px;
}
.report-dialog h2 {
  margin: 6px 0;
  font-size: 21px;
}
.report-dialog p {
  margin: 0;
  color: #718179;
}
.report-fields {
  display: grid;
  gap: 15px;
}
@media (max-width: 600px) {
  .driver-page {
    padding: 26px 16px 40px;
  }
  .trips-grid {
    grid-template-columns: 1fr;
  }
  .student-row {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
