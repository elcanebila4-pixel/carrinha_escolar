<template>
  <q-page class="family-page">
    <header class="page-heading">
      <div>
        <div class="eyebrow">ACOMPANHAMENTO ESCOLAR</div>
        <h1>Bom dia, {{ guardian?.name || 'encarregado' }}</h1>
        <p>Consulte os dados escolares associados à sua conta.</p>
      </div>
      <span class="student-total"
        ><q-icon name="school" /> {{ students.length }}</span
      >
    </header>

    <section class="summary-grid" aria-label="Resumo do dia">
      <q-card flat bordered class="summary-card">
        <span class="summary-icon"><q-icon name="school" /></span>
        <div
          ><strong>{{ students.length }}</strong
          ><small>Alunos associados</small></div
        >
      </q-card>
      <q-card flat bordered class="summary-card">
        <span class="summary-icon summary-live"
          ><q-icon name="airport_shuttle"
        /></span>
        <div
          ><strong>{{ activeTripsCount }}</strong
          ><small>Viagens em andamento</small></div
        >
      </q-card>
      <q-card flat bordered class="summary-card">
        <span class="summary-icon summary-alert"
          ><q-icon name="notifications_active"
        /></span>
        <div
          ><strong>{{ notifications.length }}</strong
          ><small>Avisos recentes</small></div
        >
      </q-card>
    </section>

    <q-banner v-if="errorMessage" rounded class="error-banner" role="alert">
      <template #avatar><q-icon name="error_outline" /></template>
      {{ errorMessage }}
    </q-banner>

    <q-card flat bordered class="guardian-map-card">
      <div class="map-card-heading">
        <div>
          <div class="eyebrow">ACOMPANHAMENTO EM TEMPO REAL</div>
          <h2>Mapa da rota</h2>
        </div>
        <div class="map-heading-actions">
          <q-btn
            dense
            outline
            no-caps
            color="primary"
            :icon="satelliteEnabled ? 'map' : 'satellite'"
            :label="satelliteEnabled ? 'Mapa normal' : 'Satélite'"
            @click="toggleBasemap"
          />
          <span class="map-refresh-note"
            ><q-icon name="sync" /> Atualiza a cada 15 segundos</span
          >
        </div>
      </div>
      <div
        ref="mapElement"
        class="guardian-map"
        aria-label="Mapa com a posição da carrinha e o destino da rota"
      />
      <div v-if="mapError" class="map-message" role="alert">
        <q-icon name="map" /> {{ mapError }}
      </div>
      <div v-else-if="!mapReady" class="map-message">
        <q-spinner-dots color="primary" /> A carregar mapa…
      </div>
      <div v-else-if="!hasLiveGps" class="map-message map-message-info">
        <q-icon name="location_searching" /> A posição da carrinha aparecerá
        aqui quando o motorista iniciar a partilha do GPS.
      </div>
      <div v-if="hasLiveGps" class="map-legend">
        <span><i class="van-dot" /> Carrinha</span>
        <span><i class="destination-dot" /> Destino</span>
      </div>
      <div v-if="activeRouteEtas.length" class="map-route-etas">
        <div v-for="route in activeRouteEtas" :key="route.trip_id">
          <q-icon name="schedule" /> <strong>{{ route.route_name }}</strong>
          <span
            >{{ route.eta.remaining }} restantes · chegada às
            {{ route.eta.arrival }}</span
          >
        </div>
      </div>
    </q-card>

    <q-card flat bordered class="guardian-map-card guardian-location-card">
      <div class="map-card-heading">
        <div>
          <div class="eyebrow">MORADA DE RECOLHA</div>
          <h2>Marque a sua localização</h2>
          <p class="location-hint"
            >Clique no mapa para escolher o ponto da sua morada. Guarde para o
            associar à sua conta.</p
          >
        </div>
        <div class="location-actions">
          <q-btn
            outline
            no-caps
            color="primary"
            icon="my_location"
            label="Usar GPS deste dispositivo"
            :loading="locationLoading"
            :disable="locationSaving"
            @click="useDeviceLocation"
          />
          <q-btn
            unelevated
            no-caps
            color="primary"
            icon="save"
            label="Guardar localização"
            :loading="locationSaving"
            :disable="!pendingGuardianLocation || locationLoading"
            @click="saveGuardianLocation"
          />
        </div>
      </div>
      <MapaLocalizacao
        class="guardian-location-map"
        selectable
        :center="pendingGuardianLocation || undefined"
        :locations="guardianLocationMarkers"
        @location-select="pendingGuardianLocation = $event"
      />
      <q-banner
        v-if="locationMessage"
        dense
        rounded
        class="location-feedback"
        :class="{ 'location-feedback-error': locationError }"
        role="status"
      >
        <template #avatar
          ><q-icon :name="locationError ? 'error_outline' : 'place'"
        /></template>
        {{ locationMessage }}
      </q-banner>
    </q-card>

    <section
      v-if="loading"
      class="students-grid"
      aria-label="A carregar alunos"
      aria-busy="true"
    >
      <q-card
        v-for="placeholder in 2"
        :key="placeholder"
        flat
        bordered
        class="student-card skeleton-card"
      >
        <q-skeleton type="QAvatar" size="42px" />
        <div class="student-content skeleton-lines">
          <q-skeleton type="text" width="76px" />
          <q-skeleton type="text" width="180px" height="24px" />
          <q-skeleton type="text" width="220px" />
          <q-skeleton type="text" width="160px" />
        </div>
      </q-card>
    </section>
    <section v-else-if="students.length" class="students-grid">
      <q-card
        v-for="student in students"
        :key="student.id"
        flat
        bordered
        class="student-card"
      >
        <q-avatar size="54px" class="student-photo">
          <img
            v-if="student.photo_url"
            :src="student.photo_url"
            :alt="`Fotografia de ${student.name}`"
          />
          <span v-else>{{ initials(student.name) }}</span>
        </q-avatar>
        <div class="student-content">
          <div class="student-class">{{
            student.class_name || 'Turma não indicada'
          }}</div>
          <h2>{{ student.name }}</h2>
          <div class="status-line">
            <q-badge
              rounded
              :color="studentState(student).color"
              :label="studentState(student).label"
            />
            <small
              >Atualizado
              {{
                formatTime(student.attendance_at || student.location_at) || '—'
              }}</small
            >
          </div>
          <div v-if="student.school_name" class="student-detail">
            <q-icon name="domain" /> {{ student.school_name }}
          </div>
          <div v-if="student.birth_date" class="student-detail">
            <q-icon name="cake" /> {{ formatDate(student.birth_date) }}
          </div>
          <div v-if="student.pickup_address" class="student-detail">
            <q-icon name="place" /> {{ student.pickup_address }}
          </div>
          <div v-if="student.next_trip_id" class="next-trip">
            <q-icon name="event_upcoming" />
            <span
              >Próxima viagem: {{ formatDate(student.next_trip_date)
              }}<small v-if="student.next_trip_time">
                · {{ student.next_trip_time }}</small
              ></span
            >
          </div>
          <q-separator v-if="student.trip_id" class="tracking-separator" />
          <div v-if="student.route_name" class="tracking-panel">
            <div class="tracking-heading">
              <q-icon name="route" />
              <strong>{{ student.route_name }}</strong>
              <q-badge
                v-if="student.trip_status === 'in_progress'"
                color="positive"
                rounded
                label="Em andamento"
              />
              <q-badge
                v-else-if="student.trip_status === 'completed'"
                color="blue-grey"
                rounded
                label="Concluída"
              />
              <q-badge v-else color="grey-6" rounded label="Sem viagem ativa" />
            </div>
            <div class="student-detail route-points">
              <q-icon name="trip_origin" />
              <span>{{ student.start_point || 'Partida não definida' }}</span>
              <q-icon name="place" />
              <span>{{ student.end_point || 'Destino não definido' }}</span>
            </div>
            <div class="boarding-status">
              <q-icon :name="attendanceIcon(student.attendance_status)" />
              <span>{{ attendanceLabel(student.attendance_status) }}</span>
              <small v-if="student.attendance_at">{{
                formatTime(student.attendance_at)
              }}</small>
            </div>
            <div
              v-if="student.trip_status === 'in_progress'"
              class="van-location"
            >
              <small v-if="etaByTrip[student.trip_id]" class="eta-copy"
                >{{ etaByTrip[student.trip_id].remaining }} restantes · chegada
                estimada às {{ etaByTrip[student.trip_id].arrival }}</small
              >
              <div class="student-detail">
                <q-icon name="airport_shuttle" />
                <span>{{ student.vehicle_plate || 'Carrinha' }}</span>
              </div>
              <div v-if="student.latitude != null" class="location-copy">
                <span
                  >Localização atualizada
                  {{ formatTime(student.location_at) }}</span
                >
                <a
                  :href="mapsUrl(student.latitude, student.longitude)"
                  target="_blank"
                  rel="noopener noreferrer"
                  >Ver carrinha no mapa <q-icon name="open_in_new"
                /></a>
              </div>
              <small v-else class="location-pending"
                >A aguardar a primeira posição GPS da carrinha.</small
              >
            </div>
          </div>
          <div v-else class="tracking-panel tracking-unassigned">
            <q-icon name="info_outline" />
            <span>Este aluno ainda não está associado a uma rota.</span>
          </div>
        </div>
      </q-card>
    </section>
    <q-card v-else flat bordered class="empty-state">
      <q-icon name="family_restroom" />
      <h2>Ainda não há alunos associados</h2>
      <p>Peça à administração da escola para associar os alunos à sua conta.</p>
    </q-card>
    <section class="dashboard-lower-grid">
      <q-card flat bordered class="dashboard-panel">
        <div class="panel-heading"
          ><div
            ><div class="eyebrow">ATIVIDADE RECENTE</div
            ><h2>Notificações</h2></div
          ><q-badge color="primary" rounded>{{
            visibleNotifications.length
          }}</q-badge></div
        >
        <div v-if="visibleNotifications.length" class="activity-list">
          <article
            v-for="item in visibleNotifications"
            :key="`${item.id}-${item.type}-${item.created_at}`"
            class="activity-item"
          >
            <span class="activity-icon" :class="item.type"
              ><q-icon :name="notificationIcon(item.type)"
            /></span>
            <span
              ><strong>{{ notificationLabel(item) }}</strong
              ><small
                >{{ item.route_name }} ·
                {{ formatTime(item.created_at) }}</small
              ><small v-if="item.description">{{
                item.description
              }}</small></span
            >
          </article>
        </div>
        <p v-else class="panel-empty">Ainda não há avisos de viagens.</p>
        <q-separator class="panel-separator" />
        <q-toggle
          v-model="preferences.tripUpdates"
          label="Início, fim, embarque e presença"
          color="positive"
          @update:model-value="savePreferences"
        />
        <q-toggle
          v-model="preferences.routeProblems"
          label="Atrasos e problemas na rota"
          color="positive"
          @update:model-value="savePreferences"
        />
      </q-card>

      <q-card flat bordered class="dashboard-panel">
        <div class="panel-heading"
          ><div
            ><div class="eyebrow">PRESENÇAS</div
            ><h2>Histórico de viagens</h2></div
          ></div
        >
        <div v-if="history.length" class="history-list">
          <article
            v-for="item in history"
            :key="`${item.trip_id}-${item.student_id}`"
            class="history-item"
          >
            <span class="history-date">{{ formatDate(item.trip_date) }}</span>
            <div
              ><strong>{{ item.student_name }} · {{ item.route_name }}</strong
              ><small
                >{{ item.departure_time || 'Hora não indicada' }} ·
                {{ tripStatusLabel(item.trip_status) }}</small
              >
              <small v-if="item.started_at"
                >Partida: {{ formatTime(item.started_at) }}</small
              >
              <small v-if="item.finished_at"
                >Chegada: {{ formatTime(item.finished_at) }}</small
              >
              <small v-if="item.boarded_at"
                >Entrou: {{ formatTime(item.boarded_at) }}</small
              >
              <small v-if="item.alighted_at"
                >Saiu: {{ formatTime(item.alighted_at) }}</small
              >
              <small
                v-if="
                  item.attendance_at && !item.boarded_at && !item.alighted_at
                "
                >Presença atualizada:
                {{ formatTime(item.attendance_at) }}</small
              >
              <small
                v-if="
                  item.attendance_status &&
                  !item.boarded_at &&
                  !item.alighted_at
                "
                >Presença: {{ attendanceLabel(item.attendance_status) }}</small
              >
            </div>
          </article>
        </div>
        <p v-else class="panel-empty">As viagens concluídas aparecerão aqui.</p>
      </q-card>

      <q-card flat bordered class="dashboard-panel profile-panel">
        <div class="panel-heading"
          ><div
            ><div class="eyebrow">DADOS E AJUDA</div
            ><h2>Perfil e definições</h2></div
          ></div
        >
        <div class="profile-row"
          ><q-icon name="person" /><span
            ><strong>{{ guardian?.name || 'Encarregado' }}</strong
            ><small>{{
              guardian?.relationship || 'Encarregado associado'
            }}</small></span
          ></div
        >
        <div class="profile-row"
          ><q-icon name="email" /><span
            ><strong>{{
              guardian?.account_email ||
              guardian?.email ||
              'E-mail não indicado'
            }}</strong
            ><small>Conta do encarregado</small></span
          ></div
        >
        <div class="profile-row"
          ><q-icon name="call" /><span
            ><strong>{{ guardian?.phone || 'Telefone não indicado' }}</strong
            ><small v-if="guardian?.secondary_phone"
              >Contacto alternativo: {{ guardian.secondary_phone }}</small
            ></span
          ></div
        >
        <div
          v-for="student in students"
          :key="`emergency-${student.id}`"
          class="profile-row"
          ><q-icon name="contact_phone" /><span
            ><strong
              >{{ student.name }} ·
              {{
                student.emergency_contact_name ||
                'Contacto de emergência não indicado'
              }}</strong
            ><small>{{
              student.emergency_contact_phone ||
              'Peça à escola para atualizar este contacto.'
            }}</small></span
          ></div
        >
        <div class="help-row"
          ><strong>Ajuda da escola</strong
          ><span>{{
            schoolContact?.school_name || 'Contacte a administração da escola.'
          }}</span
          ><a
            v-if="schoolContact?.school_phone"
            :href="`tel:${schoolContact.school_phone}`"
            ><q-icon name="call" /> {{ schoolContact.school_phone }}</a
          ></div
        >
        <q-btn
          flat
          no-caps
          icon="lock_reset"
          label="Alterar palavra-passe"
          class="password-button"
          @click="passwordDialog = true"
        />
      </q-card>
    </section>

    <q-dialog v-model="passwordDialog">
      <q-card class="password-dialog">
        <q-form @submit="changePassword">
          <q-card-section
            ><div class="eyebrow">SEGURANÇA DA CONTA</div
            ><h2>Alterar palavra-passe</h2></q-card-section
          >
          <q-banner v-if="passwordError" dense rounded class="error-banner">{{
            passwordError
          }}</q-banner>
          <q-banner
            v-if="passwordSuccess"
            dense
            rounded
            class="success-banner"
            >{{ passwordSuccess }}</q-banner
          >
          <q-card-section class="password-fields">
            <q-input
              v-model="currentPassword"
              outlined
              dense
              type="password"
              label="Palavra-passe atual"
              autocomplete="current-password"
              :rules="[value => !!value || 'Informe a palavra-passe atual']"
            />
            <q-input
              v-model="newPassword"
              outlined
              dense
              type="password"
              label="Nova palavra-passe"
              autocomplete="new-password"
              :rules="[
                value => value?.length >= 10 || 'Use pelo menos 10 caracteres'
              ]"
            />
          </q-card-section>
          <q-card-actions align="right"
            ><q-btn
              flat
              no-caps
              label="Fechar"
              @click="passwordDialog = false" /><q-btn
              unelevated
              no-caps
              label="Guardar"
              type="submit"
              :loading="passwordBusy"
          /></q-card-actions>
        </q-form>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import MapaLocalizacao from '../components/MapaLocalizacao.vue'
import { createMapBaseLayers, setMapSatellite } from '../mapBaseLayers.js'
import { apiFetch } from '../services/api-url.js'

const students = ref([])
const guardian = ref(null)
const history = ref([])
const notifications = ref([])
const loading = ref(true)
const errorMessage = ref('')
const preferences = ref(loadPreferences())
const passwordDialog = ref(false)
const passwordError = ref('')
const passwordSuccess = ref('')
const passwordBusy = ref(false)
const currentPassword = ref('')
const newPassword = ref('')
const pendingGuardianLocation = ref(null)
const locationSaving = ref(false)
const locationLoading = ref(false)
const locationMessage = ref('')
const locationError = ref(false)
const guardianLocationMarkers = computed(() =>
  pendingGuardianLocation.value
    ? [
        {
          id: 'guardian-home',
          ...pendingGuardianLocation.value,
          title: 'Morada do encarregado'
        }
      ]
    : []
)
const activeTripsCount = computed(
  () =>
    new Set(
      students.value
        .filter(student => student.trip_status === 'in_progress')
        .map(student => student.trip_id)
    ).size
)
const schoolContact = computed(() =>
  students.value.find(student => student.school_name || student.school_phone)
)
const visibleNotifications = computed(() =>
  notifications.value.filter(item =>
    [
      'trip_started',
      'trip_finished',
      'boarded',
      'no_show',
      'alighted'
    ].includes(item.type)
      ? preferences.value.tripUpdates
      : preferences.value.routeProblems
  )
)
const mapElement = ref(null)
const mapError = ref('')
const mapReady = ref(false)
const satelliteEnabled = ref(false)
const etaByTrip = ref({})
const activeRouteEtas = computed(() => {
  const seen = new Set()
  return students.value
    .filter(
      student =>
        student.trip_status === 'in_progress' &&
        etaByTrip.value[student.trip_id]
    )
    .filter(student => {
      const id = String(student.trip_id)
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
    .map(student => ({
      trip_id: student.trip_id,
      route_name: student.route_name,
      eta: etaByTrip.value[student.trip_id]
    }))
})
const hasLiveGps = computed(() =>
  students.value.some(
    student =>
      student.trip_status === 'in_progress' &&
      student.latitude != null &&
      student.longitude != null
  )
)

let refreshTimer
let mapInstance = null
let baseLayers = null
let hasCenteredOnTrip = false
const mapMarkers = new Map()
const routePolylines = new Map()
const routeRequests = new Map()

onMounted(() => {
  loadStudents()
  loadGuardianMap()
  refreshTimer = setInterval(loadStudents, 15000)
})
onUnmounted(() => {
  clearInterval(refreshTimer)
  for (const marker of mapMarkers.values()) marker.remove()
  mapMarkers.clear()
  for (const line of routePolylines.values()) line.remove()
  routePolylines.clear()
  mapInstance?.remove()
  mapInstance = null
})

async function loadStudents() {
  errorMessage.value = ''
  try {
    const response = await apiFetch('/api/guardian/students', {
      credentials: 'include'
    })
    const result = await response.json().catch(() => null)
    if (!response.ok)
      throw new Error(result?.message || 'Não foi possível carregar os alunos.')
    students.value = result.students
    guardian.value = result.guardian || null
    if (
      !pendingGuardianLocation.value &&
      guardian.value?.latitude != null &&
      guardian.value?.longitude != null
    ) {
      pendingGuardianLocation.value = {
        latitude: Number(guardian.value.latitude),
        longitude: Number(guardian.value.longitude)
      }
    }
    history.value = result.history || []
    notifications.value = result.notifications || []
    syncGuardianMarkers()
  } catch (error) {
    errorMessage.value =
      error.message || 'Não foi possível contactar o servidor.'
  } finally {
    loading.value = false
  }
}

async function saveGuardianLocation() {
  if (!pendingGuardianLocation.value || locationSaving.value) return
  locationSaving.value = true
  locationError.value = false
  locationMessage.value = ''
  try {
    const response = await apiFetch('/api/guardians/me/location', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pendingGuardianLocation.value)
    })
    const result = await response.json().catch(() => null)
    if (!response.ok)
      throw new Error(
        result?.message || 'Não foi possível guardar a localização.'
      )
    guardian.value = { ...guardian.value, ...result.location }
    locationMessage.value = 'Localização guardada com sucesso.'
  } catch (error) {
    locationError.value = true
    locationMessage.value =
      error.message || 'Não foi possível contactar o servidor.'
  } finally {
    locationSaving.value = false
  }
}

function useDeviceLocation() {
  if (!navigator.geolocation) {
    locationError.value = true
    locationMessage.value =
      'Este dispositivo não disponibiliza localização GPS.'
    return
  }

  locationLoading.value = true
  locationError.value = false
  locationMessage.value = 'A obter a localização do dispositivo…'

  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      pendingGuardianLocation.value = {
        latitude: coords.latitude,
        longitude: coords.longitude
      }
      locationLoading.value = false
      locationMessage.value = `Localização obtida. Precisão estimada: ${Math.round(coords.accuracy)} m. Confirme o ponto no mapa e guarde.`
    },
    error => {
      locationError.value = true
      locationLoading.value = false
      locationMessage.value =
        error.code === 1
          ? 'Permita o acesso à localização nas definições do navegador e tente novamente.'
          : error.code === 3
            ? 'O GPS demorou demasiado tempo a responder. Tente novamente num local com melhor sinal.'
            : 'Não foi possível obter a localização. Verifique o GPS e tente novamente.'
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
  )
}

function loadGuardianMap() {
  try {
    if (!mapElement.value) return
    mapInstance = L.map(mapElement.value).setView([-25.0519, 33.6442], 12)
    baseLayers = createMapBaseLayers()
    baseLayers.street.addTo(mapInstance)
    mapReady.value = true
    syncGuardianMarkers()
    requestAnimationFrame(() => mapInstance?.invalidateSize())
  } catch (error) {
    mapError.value = error.message || 'Não foi possível carregar o mapa.'
  }
}

function toggleBasemap() {
  if (!mapInstance || !baseLayers) return
  satelliteEnabled.value = !satelliteEnabled.value
  setMapSatellite(mapInstance, baseLayers, satelliteEnabled.value)
}

function guardianMarkerIcon(label, color) {
  return L.divIcon({
    className: 'guardian-marker-wrap',
    html: `<span class="guardian-marker" style="--marker-color:${color}">${label}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  })
}

function syncGuardianMarkers() {
  if (!mapInstance) return
  const points = new Map()
  const activeTripIds = new Set()
  for (const student of students.value) {
    if (student.trip_status !== 'in_progress') continue
    activeTripIds.add(String(student.trip_id))
    if (student.latitude != null && student.longitude != null) {
      points.set(`van-${student.trip_id}`, {
        position: [Number(student.latitude), Number(student.longitude)],
        title: `${student.vehicle_plate || 'Carrinha'} · ${student.route_name}`,
        label: 'C',
        color: '#467d47'
      })
      loadRoadRoute(student)
    }
    if (student.end_latitude != null && student.end_longitude != null) {
      points.set(`destination-${student.trip_id}`, {
        position: [Number(student.end_latitude), Number(student.end_longitude)],
        title: `Destino · ${student.route_name}`,
        label: 'D',
        color: '#bd7544'
      })
    }
  }

  for (const [tripId, line] of routePolylines) {
    if (!activeTripIds.has(tripId)) {
      line.remove()
      routePolylines.delete(tripId)
      routeRequests.delete(tripId)
      delete etaByTrip.value[tripId]
    }
  }

  for (const [key, marker] of mapMarkers) {
    if (!points.has(key)) {
      marker.remove()
      mapMarkers.delete(key)
    }
  }
  for (const [key, point] of points) {
    const marker = mapMarkers.get(key)
    if (marker) {
      marker.setLatLng(point.position)
      marker.setTitle(point.title)
      marker.setTooltipContent(point.title)
      marker.setIcon(guardianMarkerIcon(point.label, point.color))
    } else {
      mapMarkers.set(
        key,
        L.marker(point.position, {
          title: point.title,
          icon: guardianMarkerIcon(point.label, point.color)
        })
          .addTo(mapInstance)
          .bindTooltip(point.title)
      )
    }
  }

  if (!points.size) hasCenteredOnTrip = false
  if (!hasCenteredOnTrip && points.size) {
    const bounds = L.latLngBounds(
      [...points.values()].map(point => point.position)
    )
    if (points.size === 1) mapInstance.setView(bounds.getCenter(), 15)
    else mapInstance.fitBounds(bounds, { padding: [48, 48], maxZoom: 16 })
    hasCenteredOnTrip = true
  }
}

async function loadRoadRoute(student) {
  if (student.end_latitude == null || student.end_longitude == null) return
  const tripId = String(student.trip_id)
  const positionKey = `${Number(student.latitude).toFixed(4)},${Number(student.longitude).toFixed(4)}`
  const previous = routeRequests.get(tripId)
  if (
    previous?.inFlight ||
    (previous && Date.now() - previous.requestedAt < 60000)
  )
    return
  routeRequests.set(tripId, { ...previous, inFlight: true })
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${student.longitude},${student.latitude};${student.end_longitude},${student.end_latitude}?overview=full&geometries=geojson`
    const response = await fetch(url)
    const result = await response.json()
    const route = response.ok ? result.routes?.[0] : null
    if (!route || !mapInstance) {
      routeRequests.set(tripId, { ...previous, inFlight: false })
      return
    }
    routeRequests.set(tripId, {
      position: positionKey,
      requestedAt: Date.now(),
      inFlight: false
    })
    const path = route.geometry.coordinates.map(([longitude, latitude]) => [
      latitude,
      longitude
    ])
    const existingLine = routePolylines.get(tripId)
    if (existingLine) existingLine.setLatLngs(path)
    else
      routePolylines.set(
        tripId,
        L.polyline(path, {
          color: '#547e48',
          opacity: 0.82,
          weight: 4
        }).addTo(mapInstance)
      )
    const arrival = new Intl.DateTimeFormat('pt-MZ', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(Date.now() + route.duration * 1000))
    const remaining = `${Math.max(1, Math.ceil(route.duration / 60))} min`
    etaByTrip.value = {
      ...etaByTrip.value,
      [student.trip_id]: { arrival, remaining }
    }
  } catch {
    routeRequests.set(tripId, { ...previous, inFlight: false })
    // GPS tracking remains available if the route service is temporarily offline.
  }
}

function initials(name = '') {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(part => part[0])
      .join('')
      .toUpperCase() || 'A'
  )
}

function studentState(student) {
  if (student.attendance_status === 'no_show')
    return { label: 'Não compareceu', color: 'negative' }
  if (student.attendance_status === 'alighted')
    return { label: 'Na escola', color: 'positive' }
  if (
    student.attendance_status === 'boarded' &&
    student.trip_status === 'in_progress'
  ) {
    return { label: 'A caminho da escola', color: 'primary' }
  }
  if (student.trip_status === 'in_progress')
    return { label: 'Na carrinha', color: 'positive' }
  return { label: 'Em casa', color: 'blue-grey' }
}

function notificationLabel(item) {
  if (item.type === 'trip_started') return 'A viagem começou'
  if (item.type === 'trip_finished') return 'A viagem terminou'
  if (item.type === 'boarded') return `${item.student_name} entrou na carrinha`
  if (item.type === 'no_show')
    return `${item.student_name} não compareceu à recolha`
  if (item.type === 'alighted') return `${item.student_name} saiu da carrinha`
  if (item.type === 'delay') return 'Atraso no percurso'
  if (item.type === 'breakdown') return 'Problema com a carrinha'
  return item.type === 'other'
    ? 'Aviso do motorista'
    : item.description || 'Atualização da viagem'
}

function notificationIcon(type) {
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

function tripStatusLabel(status) {
  if (status === 'in_progress') return 'Em andamento'
  if (status === 'completed') return 'Concluída'
  return 'Agendada'
}

function loadPreferences() {
  try {
    return {
      tripUpdates: true,
      routeProblems: true,
      ...JSON.parse(
        localStorage.getItem('guardian_notification_preferences') || '{}'
      )
    }
  } catch {
    return { tripUpdates: true, routeProblems: true }
  }
}

function savePreferences() {
  localStorage.setItem(
    'guardian_notification_preferences',
    JSON.stringify(preferences.value)
  )
}

async function changePassword() {
  passwordBusy.value = true
  passwordError.value = ''
  passwordSuccess.value = ''
  try {
    const response = await apiFetch('/api/guardian/password', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        current_password: currentPassword.value,
        new_password: newPassword.value
      })
    })
    const result = await response.json().catch(() => null)
    if (!response.ok)
      throw new Error(
        result?.message || 'Não foi possível alterar a palavra-passe.'
      )
    passwordSuccess.value = 'Palavra-passe alterada com sucesso.'
    currentPassword.value = ''
    newPassword.value = ''
  } catch (error) {
    passwordError.value = error.message
  } finally {
    passwordBusy.value = false
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
  return new Intl.DateTimeFormat('pt-MZ', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

function attendanceLabel(status) {
  if (status === 'boarded') return 'A bordo da carrinha'
  if (status === 'no_show') return 'Não compareceu à recolha'
  if (status === 'alighted') return 'Desembarcou da carrinha'
  return 'A aguardar embarque'
}

function attendanceIcon(status) {
  if (status === 'boarded') return 'check_circle'
  if (status === 'no_show') return 'person_off'
  if (status === 'alighted') return 'task_alt'
  return 'schedule'
}

function mapsUrl(latitude, longitude) {
  return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(latitude)}&mlon=${encodeURIComponent(longitude)}#map=17/${encodeURIComponent(latitude)}/${encodeURIComponent(longitude)}`
}
</script>

<style>
.guardian-marker-wrap {
  background: transparent;
  border: 0;
}
.guardian-marker {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 2px solid #fff;
  border-radius: 50%;
  background: var(--marker-color);
  box-shadow: 0 1px 5px #0005;
  color: white;
  font:
    700 11px/1 Arial,
    sans-serif;
}
</style>

<style scoped>
.family-page {
  width: min(100%, 1120px);
  margin: 0 auto;
  padding: 34px 28px 58px;
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 20px;
}
.summary-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-color: #e4ebe3;
  border-radius: 16px;
  box-shadow: 0 5px 18px #30473308;
}
.summary-card > div {
  display: grid;
  gap: 3px;
}
.summary-card strong {
  color: #2d4035;
  font-size: 20px;
}
.summary-card small {
  color: #7b8980;
  font-size: 10px;
}
.summary-icon {
  display: grid;
  flex: 0 0 38px;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 11px;
  color: #668044;
  background: #f1f6e6;
  font-size: 19px;
}
.summary-live {
  color: #426f86;
  background: #eaf4f7;
}
.summary-alert {
  color: #b6744f;
  background: #fbf0e9;
}
.page-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
}
.eyebrow {
  color: #849187;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 1.2px;
}
.page-heading h1 {
  margin: 8px 0 5px;
  color: #253a30;
  font-size: 28px;
  font-weight: 720;
}
.page-heading p {
  margin: 0;
  color: #7b8980;
  font-size: 12px;
}
.student-total {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 13px;
  border: 1px solid #e4ebe3;
  border-radius: 9px;
  color: #476a4c;
  background: #fff;
  font-size: 12px;
  font-weight: 700;
}
.student-total .q-icon {
  font-size: 17px;
}
.error-banner {
  margin-bottom: 16px;
  border: 1px solid #f0d3ce;
  color: #9a4235;
  background: #fff5f3;
}
.guardian-map-card {
  position: relative;
  margin-bottom: 20px;
  overflow: hidden;
  border-color: #e4ebe3;
  border-radius: 20px;
  box-shadow: 0 8px 28px #3047330b;
}
.map-card-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 19px 12px;
}
.location-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.map-card-heading h2 {
  margin: 5px 0 0;
  color: #2d4035;
  font-size: 17px;
  font-weight: 700;
}
.location-hint {
  margin: 6px 0 0;
  color: #7b8980;
  font-size: 11px;
}
.guardian-location-map {
  height: 340px;
}
.location-feedback {
  margin: 10px 16px 14px;
  color: #476a4c;
  background: #f1f6e6;
}
.location-feedback-error {
  color: #9a4235;
  background: #fff5f3;
}
.map-refresh-note {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #7b8980;
  font-size: 10px;
}
.map-heading-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
}
.guardian-map {
  width: 100%;
  height: 360px;
  background: #edf1ed;
}
.map-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  color: #9a4235;
  background: #fff5f3;
  font-size: 11px;
}
.map-message-info {
  color: #61745f;
  background: #f5f8f2;
}
.map-legend {
  display: flex;
  gap: 18px;
  padding: 11px 18px;
  color: #66786b;
  font-size: 10px;
}
.map-route-etas {
  display: grid;
  gap: 6px;
  padding: 0 18px 14px;
  color: #557d43;
  font-size: 12px;
}
.map-route-etas div {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.map-route-etas strong {
  color: #35483b;
}
.map-legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.map-legend i {
  width: 9px;
  height: 9px;
  border: 2px solid #fff;
  border-radius: 50%;
  box-shadow: 0 0 0 1px #9aa99a;
}
.van-dot {
  background: #467d47;
}
.destination-dot {
  background: #bd7544;
}
.students-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.student-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  min-width: 0;
  padding: 20px;
  border-color: #e4ebe3;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 6px 22px #30473308;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease;
}
.student-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 26px #30473312;
}
.student-photo {
  flex: 0 0 54px;
  color: #557d43;
  background: #eff5e7;
  font-size: 15px;
  font-weight: 800;
}
.student-photo img {
  object-fit: cover;
}
.status-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin: -7px 0 11px;
}
.status-line small {
  color: #849187;
  font-size: 10px;
}
.next-trip {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 10px;
  color: #577247;
  font-size: 11px;
}
.next-trip small {
  color: #7b8980;
}
.eta-copy {
  color: #557d43;
  font-size: 10px;
  font-weight: 700;
}
.skeleton-card {
  min-height: 152px;
}
.skeleton-lines {
  flex: 1;
  display: grid;
  gap: 7px;
}
.student-icon {
  display: grid;
  flex: 0 0 42px;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  color: #557d43;
  background: #eff5e7;
  font-size: 21px;
}
.student-content {
  flex: 1;
  min-width: 0;
}
.tracking-separator {
  margin: 15px 0 12px;
  background: #e7ece5;
}
.tracking-panel {
  display: grid;
  gap: 10px;
}
.tracking-heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
  color: #405b48;
  font-size: 11px;
}
.tracking-heading > .q-icon {
  color: #789364;
}
.route-points {
  display: grid;
  grid-template-columns: 16px 1fr;
  row-gap: 5px;
}
.boarding-status {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #4c7146;
  font-size: 11px;
  font-weight: 700;
}
.boarding-status > .q-icon {
  font-size: 17px;
}
.boarding-status small {
  margin-left: auto;
  color: #849187;
  font-size: 10px;
  font-weight: 400;
}
.van-location {
  display: grid;
  gap: 7px;
  padding: 12px;
  border: 1px solid #e9efe2;
  border-radius: 12px;
  background: #f5f8f2;
}
.location-copy {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 5px 12px;
  color: #849187;
  font-size: 10px;
}
.location-copy a {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #486f43;
  font-weight: 700;
  text-decoration: none;
}
.location-copy a:hover {
  text-decoration: underline;
}
.location-pending {
  color: #849187;
  font-size: 10px;
}
.tracking-unassigned {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #849187;
  font-size: 11px;
}
.dashboard-lower-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: 14px;
  margin-top: 18px;
}
.dashboard-panel {
  min-width: 0;
  padding: 18px;
  border-color: #e4ebe3;
  border-radius: 18px;
  box-shadow: 0 6px 22px #30473308;
}
.profile-panel {
  grid-column: 1 / -1;
}
.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.panel-heading h2 {
  margin: 5px 0 0;
  color: #2d4035;
  font-size: 17px;
}
.activity-list,
.history-list {
  display: grid;
  gap: 0;
  max-height: 370px;
  overflow-y: auto;
}
.activity-item,
.history-item,
.profile-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 0;
  border-bottom: 1px solid #edf0eb;
}
.activity-item > span:last-child,
.history-item > div,
.profile-row > span {
  display: grid;
  min-width: 0;
  gap: 4px;
}
.activity-item strong,
.history-item strong,
.profile-row strong {
  color: #405243;
  font-size: 11px;
}
.activity-item small,
.history-item small,
.profile-row small {
  color: #849187;
  font-size: 10px;
  line-height: 1.45;
}
.activity-icon {
  display: grid;
  flex: 0 0 34px;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  color: #537d48;
  background: #eff5e7;
}
.activity-icon.delay,
.activity-icon.breakdown,
.activity-icon.other {
  color: #b6744f;
  background: #fbf0e9;
}
.history-date {
  flex: 0 0 78px;
  padding-top: 2px;
  color: #577247;
  font-size: 10px;
  font-weight: 700;
}
.panel-empty {
  margin: 0;
  padding: 15px 0;
  color: #849187;
  font-size: 11px;
}
.panel-separator {
  margin: 11px 0;
  background: #edf0eb;
}
.profile-row > .q-icon {
  flex: 0 0 18px;
  color: #77905d;
  font-size: 17px;
}
.help-row {
  display: grid;
  gap: 5px;
  margin-top: 14px;
  padding: 12px;
  border-radius: 8px;
  color: #657566;
  background: #f5f8f2;
  font-size: 11px;
}
.password-button {
  margin-top: 8px;
  color: #557d43;
}
.password-dialog {
  width: min(100%, 420px);
  padding: 8px;
  border-radius: 12px;
}
.password-dialog h2 {
  margin: 5px 0 0;
  color: #2d4035;
  font-size: 19px;
}
.password-fields {
  display: grid;
  gap: 12px;
}
.success-banner {
  margin: 0 16px;
  color: #466f43;
  background: #eff6e9;
}
.student-class {
  color: #738478;
  font-size: 10px;
  font-weight: 700;
}
.student-card h2 {
  margin: 4px 0 13px;
  color: #2d4035;
  font-size: 17px;
  font-weight: 700;
}
.student-detail {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin-top: 8px;
  color: #78867d;
  font-size: 11px;
  line-height: 1.5;
}
.student-detail .q-icon {
  flex: 0 0 auto;
  color: #8ca175;
  font-size: 15px;
}
.loading-state {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 70px 20px;
  color: #7b8980;
  font-size: 11px;
}
.empty-state {
  display: grid;
  justify-items: center;
  padding: 58px 20px;
  border-color: #e4ebe3;
  border-radius: 10px;
  text-align: center;
}
.empty-state > .q-icon {
  color: #77905d;
  font-size: 38px;
}
.empty-state h2 {
  margin: 14px 0 5px;
  color: #35483b;
  font-size: 16px;
}
.empty-state p {
  margin: 0;
  color: #7b8980;
  font-size: 11px;
}
@media (max-width: 640px) {
  .family-page {
    padding: 22px 14px 36px;
  }
  .students-grid {
    grid-template-columns: 1fr;
  }
  .summary-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .summary-card {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    min-height: 112px;
    padding: 11px;
    border-radius: 14px;
  }
  .summary-card strong {
    font-size: 18px;
  }
  .summary-card small {
    font-size: 9px;
    line-height: 1.35;
  }
  .summary-icon {
    flex-basis: 32px;
    width: 32px;
    height: 32px;
    border-radius: 10px;
    font-size: 17px;
  }
  .dashboard-lower-grid {
    grid-template-columns: 1fr;
  }
  .profile-panel {
    grid-column: auto;
  }
  .guardian-map {
    height: 280px;
  }
  .guardian-map-card {
    border-radius: 17px;
  }
  .map-card-heading {
    padding: 15px 15px 11px;
  }
  .map-refresh-note {
    align-self: flex-start;
  }
  .guardian-location-map {
    height: 290px;
  }
  .student-card {
    gap: 11px;
    padding: 15px;
    border-radius: 16px;
  }
  .student-photo {
    flex-basis: 46px;
    width: 46px;
    height: 46px;
  }
  .student-card h2 {
    font-size: 16px;
  }
  .dashboard-panel {
    padding: 15px;
    border-radius: 16px;
  }
  .map-card-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .map-heading-actions {
    width: 100%;
    justify-content: space-between;
  }
  .location-actions {
    width: 100%;
    justify-content: flex-start;
  }
  .page-heading h1 {
    font-size: 24px;
  }
}
</style>
