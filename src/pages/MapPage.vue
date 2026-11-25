<template>
  <q-page class="map-page">
    <header class="page-heading">
      <div>
        <div class="eyebrow">ACOMPANHAMENTO</div>
        <h1><q-icon name="map" /> Mapa de localizações</h1>
        <p>Acompanhe no mapa apenas as carrinhas que estão a partilhar GPS.</p>
      </div>
      <q-btn flat no-caps icon="refresh" label="Atualizar" :loading="loading" @click="refreshMap" />
    </header>

    <q-banner v-if="error" rounded class="error-banner" role="alert">
      <template #avatar><q-icon name="error_outline" /></template>{{ error }}
    </q-banner>

    <q-card flat bordered class="tracker-card">
      <div class="tracker-copy"><strong>GPS da carrinha</strong><span>Abra esta página no telemóvel do motorista durante uma viagem em andamento.</span></div>
      <q-select v-model="selectedTrip" dense outlined emit-value map-options :options="tripOptions" option-value="id" option-label="label" label="Viagem em andamento" class="trip-select" :disable="tracking" />
      <q-btn v-if="!tracking" unelevated no-caps icon="my_location" label="Iniciar GPS" class="gps-button" :disable="!selectedTrip" @click="startTracking" />
      <q-btn v-else outline no-caps icon="location_disabled" label="Parar GPS" color="negative" @click="stopTracking" />
      <span v-if="tracking" class="tracking-status"><i></i> A enviar posição GPS</span>
    </q-card>

    <section class="map-layout">
      <q-card flat bordered class="map-card">
        <div ref="mapViewport" class="map-viewport">
          <div class="map-controls"><q-btn dense round color="white" text-color="grey-8" icon="add" aria-label="Aumentar zoom" @click.stop="zoomIn" /><q-btn dense round color="white" text-color="grey-8" icon="remove" aria-label="Diminuir zoom" @click.stop="zoomOut" /><q-btn v-if="currentPosition || liveLocations.length" dense round color="white" text-color="primary" icon="my_location" aria-label="Centrar na carrinha" @click.stop="centerOnVan" /><q-btn dense no-caps color="white" text-color="dark" :icon="satelliteEnabled ? 'map' : 'satellite'" :label="satelliteEnabled ? 'Mapa' : 'Satélite'" @click.stop="toggleBasemap" /></div>
          <div class="map-legend" aria-label="Legenda do mapa"><span><i class="legend-van"><q-icon name="airport_shuttle" /></i> Carrinha</span></div>
          <div v-if="mapError" class="map-error" role="alert"><q-icon name="map" /><strong>OpenStreetMap indisponível</strong><span>{{ mapError }}</span></div>
        </div>
        <div class="map-caption"><q-icon name="place" /> {{ mapCaption }}</div>
      </q-card>

      <q-card flat bordered class="locations-card">
        <div class="card-heading">
          <div><div class="eyebrow">GPS ACTIVO</div><h2>Carrinhas no mapa</h2></div>
          <q-spinner-dots v-if="loading" color="primary" />
        </div>

        <div v-if="!loading && !locations.length" class="empty-state">
          <q-icon name="location_searching" />
          <strong>Nenhuma carrinha a partilhar GPS</strong>
          <span>As carrinhas aparecerão aqui quando o motorista iniciar a partilha durante uma viagem.</span>
        </div>
        <div v-else class="location-list">
          <article v-for="item in locations" :key="item.key" class="location-item">
            <span class="location-icon" :class="item.kind"><q-icon :name="item.icon" /></span>
            <div class="location-copy">
              <strong>{{ item.title }}</strong>
              <span>{{ item.place }}</span>
              <small>{{ item.detail }}</small>
              <small v-if="item.eta" class="eta-label">Chegada prevista: {{ item.eta }}</small>
            </div>
            <q-btn v-if="item.latitude != null && item.longitude != null" flat round dense icon="my_location" color="primary" :aria-label="`Ver ${item.title} no mapa`" @click="focusLocation(item)" />
          </article>
        </div>

        <div class="gps-note"><q-icon name="info_outline" /> O mapa apresenta apenas as posições GPS das carrinhas.</div>
      </q-card>
    </section>
  </q-page>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { createMapBaseLayers, setMapSatellite } from '../mapBaseLayers.js'
import { apiFetch } from '../services/api-url.js'

const locations = ref([])
const loading = ref(false)
const error = ref('')
const trips = ref([])
const selectedTrip = ref(null)
const tracking = ref(false)
const currentPosition = ref(null)
const liveLocations = ref([])
let watchId = null
let refreshTimer = null
const tripOptions = computed(() => trips.value.filter((trip) => trip.status === 'in_progress').map((trip) => ({ ...trip, label: `${trip.route_name} · ${trip.vehicle_plate || 'Sem carrinha'}` })))
const mapViewport = ref(null)
const mapCenter = ref({ latitude: -25.0519, longitude: 33.6442 })
const zoom = ref(13)
const mapReady = ref(false)
const mapError = ref('')
let mapInstance = null
const markerInstances = new Map()
const satelliteEnabled = ref(false)
let baseLayers = null
const gpsMarkers = computed(() => [
  ...(currentPosition.value ? [{ ...currentPosition.value, key: 'current-gps', kind: 'van', title: 'Carrinha (este dispositivo)' }] : []),
  ...liveLocations.value.map((point) => ({
    ...point,
    key: `gps-${point.trip_id}`,
    kind: 'van',
    icon: 'airport_shuttle',
    title: `${point.vehicle_plate || 'Carrinha'} · ${point.route_name}`
  }))
])
watch(gpsMarkers, syncMapMarkers, { deep: true })
const mapCaption = computed(() => currentPosition.value || liveLocations.value.length ? 'Posição GPS atual da carrinha.' : 'Vista inicial: Xai-Xai, Gaza. Inicie o GPS para acompanhar uma carrinha.')

function markerIcon(kind) {
  return L.divIcon({
    className: 'gps-marker-wrap',
    html: '<span class="gps-marker" style="--marker-color:#467d47">V</span>',
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  })
}

function syncMapMarkers() {
  if (!mapInstance) return
  const markers = new Map(gpsMarkers.value.map((marker) => [marker.key, marker]))
  for (const [key, instance] of markerInstances) {
    if (!markers.has(key)) {
      instance.remove()
      markerInstances.delete(key)
    }
  }
  for (const [key, marker] of markers) {
    const position = [Number(marker.latitude), Number(marker.longitude)]
    const instance = markerInstances.get(key)
    if (instance) {
      instance.setLatLng(position)
      instance.setTitle(marker.title)
      instance.setTooltipContent(marker.title)
    } else {
      markerInstances.set(key, L.marker(position, { icon: markerIcon(marker.kind), title: marker.title }).addTo(mapInstance).bindTooltip(marker.title))
    }
  }
}

async function loadLocations() {
  loading.value = true
  error.value = ''
  try {
    const tripsResponse = await apiFetch('/api/trips')
    if (!tripsResponse.ok) throw new Error('Não foi possível carregar as viagens. Inicie sessão e tente novamente.')
    const tripsResult = await tripsResponse.json()
    trips.value = tripsResult.trips || []
    locations.value = []
  } catch (loadError) {
    error.value = loadError.message || 'Ocorreu um erro ao carregar as localizações.'
  } finally {
    loading.value = false
  }
}

function zoomIn() {
  if (mapInstance) mapInstance.setZoom(Math.min(19, (mapInstance.getZoom() || zoom.value) + 1))
}
function toggleBasemap() {
  if (!mapInstance || !baseLayers) return
  satelliteEnabled.value = !satelliteEnabled.value
  setMapSatellite(mapInstance, baseLayers, satelliteEnabled.value)
}
function zoomOut() {
  if (mapInstance) mapInstance.setZoom(Math.max(3, (mapInstance.getZoom() || zoom.value) - 1))
}
function centerOnVan() {
  const activeTrip = liveLocations.value.find((point) => Number(point.trip_id) === Number(selectedTrip.value)) || liveLocations.value[0]
  const point = currentPosition.value || activeTrip
  if (!point) return
  const center = { latitude: Number(point.latitude), longitude: Number(point.longitude) }
  mapCenter.value = center
  zoom.value = 15
  mapInstance?.setView([center.latitude, center.longitude], zoom.value)
}

function focusLocation(point) {
  if (point.latitude == null || point.longitude == null) return
  mapCenter.value = { latitude: Number(point.latitude), longitude: Number(point.longitude) }
  zoom.value = 16
  mapInstance?.setView([mapCenter.value.latitude, mapCenter.value.longitude], zoom.value)
}

async function loadGpsLocations() {
  try {
    const response = await apiFetch('/api/gps/locations')
    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      error.value = result.message || 'Não foi possível obter as posições GPS das carrinhas.'
      return
    }
    error.value = ''
    const hadLocations = liveLocations.value.length > 0
    liveLocations.value = (result.locations || []).filter((point) =>
      Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude))
    )
    if (!hadLocations && !currentPosition.value && liveLocations.value[0]) centerOnVan()
    const vans = await Promise.all(liveLocations.value.map(async (point) => {
      const eta = await estimateArrival(point)
      return { key: `van-${point.trip_id}`, kind: 'van', icon: 'airport_shuttle', title: point.vehicle_plate || 'Carrinha',
        latitude: Number(point.latitude), longitude: Number(point.longitude),
        place: `${Number(point.latitude).toFixed(5)}, ${Number(point.longitude).toFixed(5)}`,
        detail: `${point.route_name} · atualizado ${new Date(point.recorded_at).toLocaleTimeString('pt-MZ', { hour: '2-digit', minute: '2-digit' })}`, eta }
    }))
    locations.value = vans
  } catch { /* GPS voltará a ser consultado no próximo ciclo. */ }
}

async function refreshMap() { await loadLocations(); await loadGpsLocations() }

async function estimateArrival(point) {
  if (point.end_latitude == null || point.end_longitude == null) return ''
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${point.longitude},${point.latitude};${point.end_longitude},${point.end_latitude}?overview=false`
    const response = await fetch(url)
    const route = (await response.json()).routes?.[0]
    return response.ok && route ? new Date(Date.now() + route.duration * 1000).toLocaleTimeString('pt-MZ', { hour: '2-digit', minute: '2-digit' }) : ''
  } catch { return '' }
}

function startTracking() {
  if (!navigator.geolocation) { error.value = 'Este dispositivo não disponibiliza GPS.'; return }
  error.value = ''
  tracking.value = true
  watchId = navigator.geolocation.watchPosition(async ({ coords }) => {
    const position = { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy }
    if (!currentPosition.value) {
      mapCenter.value = { latitude: position.latitude, longitude: position.longitude }
      mapInstance?.setView([position.latitude, position.longitude], zoom.value)
    }
    currentPosition.value = position
    try {
      const response = await apiFetch(`/api/trips/${selectedTrip.value}/location`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(position) })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        const gpsError = new Error(result.message || 'Não foi possível enviar a posição GPS.')
        gpsError.status = response.status
        throw gpsError
      }
      await loadGpsLocations()
    } catch (gpsError) {
      error.value = gpsError.message
      if ([401, 403, 409].includes(gpsError.status)) stopTracking()
    }
  }, (gpsError) => {
    if (gpsError.code === 1) {
      error.value = 'Permita o acesso à localização neste dispositivo.'
      stopTracking()
      return
    }
    error.value = gpsError.code === 3
      ? 'O GPS ainda está a procurar sinal. A partilha continua ativa.'
      : 'Não foi possível obter uma posição agora. A partilha continua ativa.'
  }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 60000 })
}

function stopTracking() {
  if (watchId !== null) navigator.geolocation?.clearWatch(watchId)
  watchId = null
  tracking.value = false
}

let resizeObserver
onMounted(async () => {
  resizeObserver = new ResizeObserver(() => {
    mapInstance?.invalidateSize()
  })
  if (mapViewport.value) resizeObserver.observe(mapViewport.value)
  try {
    mapInstance = L.map(mapViewport.value, { center: [mapCenter.value.latitude, mapCenter.value.longitude], zoom: zoom.value, zoomControl: false })
    baseLayers = createMapBaseLayers()
    baseLayers.street.addTo(mapInstance)
    mapInstance.on('zoomend', () => { zoom.value = mapInstance.getZoom() })
    mapInstance.on('moveend', () => {
      const center = mapInstance.getCenter()
      mapCenter.value = { latitude: center.lat, longitude: center.lng }
    })
    mapReady.value = true
    syncMapMarkers()
  } catch (mapLoadError) {
    mapError.value = mapLoadError.message || 'Não foi possível carregar o mapa.'
  }
  await loadLocations()
  await loadGpsLocations()
  refreshTimer = setInterval(loadGpsLocations, 15000)
})
onUnmounted(() => {
  stopTracking()
  if (refreshTimer) clearInterval(refreshTimer)
  resizeObserver?.disconnect()
  for (const marker of markerInstances.values()) marker.remove()
  markerInstances.clear()
  mapInstance?.remove()
  mapInstance = null
})
</script>

<style>
.gps-marker-wrap { background: transparent; border: 0; }
.gps-marker { display:grid; width:28px; height:28px; place-items:center; border:2px solid #fff; border-radius:50%; background:var(--marker-color); box-shadow:0 1px 5px #0005; color:white; font:700 11px/1 Arial,sans-serif; }
</style>

<style scoped>
.map-page { width: min(100%, 1240px); margin: 0 auto; padding: 30px 34px 54px; }
.page-heading { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-bottom: 22px; }
.eyebrow { color: #91a096; font-size: 9px; font-weight: 800; letter-spacing: 1px; }
.page-heading h1 { display: flex; align-items: center; gap: 9px; margin: 7px 0 5px; color: #26392f; font-size: 25px; font-weight: 700; }
.page-heading h1 :deep(.q-icon) { color: #66834d; }
.page-heading p { margin: 0; color: #87938b; font-size: 11px; }
.map-layout { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(320px, .8fr); gap: 16px; align-items: stretch; }
.map-card, .locations-card { overflow: hidden; border-color: #e8ece7; border-radius: 13px; background: #fff; }
.map-viewport { position: relative; height: 520px; overflow: hidden; background: #e8eee5; }
.map-legend { position:absolute; z-index:3; bottom:14px; left:12px; display:flex; flex-wrap:wrap; gap:12px; padding:8px 10px; border:1px solid #e7ebe5; border-radius:10px; color:#526158; background:#ffffffed; box-shadow:0 3px 12px #1c392010; font-size:10px; }
.map-legend span { display:flex; align-items:center; gap:6px; }
.map-legend i { display:grid; place-items:center; width:20px; height:20px; border-radius:7px; color:#fff; font-style:normal; }
.map-legend :deep(.q-icon) { font-size:13px; }
.legend-van { background:#467d47; }
.map-controls { position: absolute; z-index: 3; top: 12px; right: 12px; display: grid; gap: 7px; }
.map-error { position:absolute; z-index:4; inset:0; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:10px; padding:24px; color:#6f7c73; background:#f4f7f2; text-align:center; }
.map-error > .q-icon { color:#78945c; font-size:36px; }
.map-error strong { color:#35483b; font-size:15px; }
.map-error span { max-width:360px; font-size:12px; line-height:1.6; }
.map-caption { display: flex; align-items: center; gap: 6px; padding: 11px 14px; color: #839087; font-size: 10px; }
.map-caption :deep(.q-icon) { color: #6d8a51; }
.locations-card { display: flex; flex-direction: column; padding: 17px; }
.card-heading { display: flex; align-items: center; justify-content: space-between; padding-bottom: 12px; border-bottom: 1px solid #edf0ec; }
.card-heading h2 { margin: 5px 0 0; color: #2d3d33; font-size: 14px; }
.location-list { flex: 1; max-height: 400px; overflow: auto; }
.location-item { display: flex; align-items: center; gap: 10px; padding: 12px 2px; border-bottom: 1px solid #f0f2ef; }
.location-icon { display: grid; flex: 0 0 34px; place-items: center; width: 34px; height: 34px; border-radius: 10px; color: #5d813d; background: #eff5e7; }
.location-icon.route { color: #7180a2; background: #f0f2f8; }
.location-copy { display: grid; flex: 1; gap: 3px; min-width: 0; }
.location-copy strong, .location-copy span, .location-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.location-copy strong { color: #425147; font-size: 10px; }
.location-copy span { color: #718078; font-size: 9px; }
.location-copy small { color: #a0aaa2; font-size: 8px; }
.location-item a { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 8px; color: #67804f; text-decoration: none; }
.location-item a:hover { background: #f3f6ed; }
.empty-state { display: grid; justify-items: center; gap: 8px; padding: 55px 15px; color: #8d9a91; text-align: center; }
.empty-state :deep(.q-icon) { color: #88a16d; font-size: 30px; }
.empty-state strong { color: #536258; font-size: 11px; }
.empty-state span { max-width: 260px; font-size: 9px; line-height: 1.6; }
.gps-note { display: flex; align-items: flex-start; gap: 7px; margin-top: auto; padding: 12px 10px 0; border-top: 1px solid #edf0ec; color: #87938b; font-size: 9px; line-height: 1.5; }
.gps-note :deep(.q-icon) { flex: 0 0 auto; color: #779257; font-size: 15px; }
.error-banner { margin-bottom: 14px; color: #873f38; background: #fff1ef; }
.tracker-card { display: flex; align-items: center; gap: 12px; margin-bottom: 15px; padding: 13px 16px; border-color: #e8ece7; border-radius: 12px; background: #fff; }
.tracker-copy { display: grid; flex: 1; gap: 4px; min-width: 180px; }
.tracker-copy strong { color: #35483b; font-size: 11px; }
.tracker-copy span { color: #89958d; font-size: 9px; }
.trip-select { width: 220px; }
.gps-button { color: #fff; background: #214e3d; font-size: 10px; }
.tracking-status { display: flex; align-items: center; gap: 6px; color: #547a3f; font-size: 9px; white-space: nowrap; }
.tracking-status i { width: 7px; height: 7px; border-radius: 50%; background: #77a64d; box-shadow: 0 0 0 3px #77a64d24; }
.eta-label { color: #568045 !important; font-weight: 700; }
@media (max-width: 850px) { .map-layout { grid-template-columns: 1fr; } .map-viewport { height: 380px; } .location-list { max-height: 360px; } }
@media (max-width: 650px) { .tracker-card { align-items: stretch; flex-direction: column; } .trip-select { width: 100%; } }
@media (max-width: 520px) { .map-page { padding: 22px 16px 40px; } .page-heading { align-items: flex-start; } .page-heading h1 { font-size: 21px; } .map-viewport { height: 320px; } }
</style>
