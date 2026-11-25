<template>
  <div class="map-shell">
    <div ref="mapElement" class="map-canvas" role="application" aria-label="Mapa OpenStreetMap"></div>
    <div v-if="routeSummary" class="route-summary" role="status">
      <strong>Trajecto até {{ destination?.name || 'ao destino' }}</strong>
      <span>{{ routeSummary }}</span>
    </div>
    <q-btn
      class="basemap-toggle"
      dense
      unelevated
      no-caps
      color="white"
      text-color="dark"
      :icon="satelliteEnabled ? 'map' : 'satellite'"
      :label="satelliteEnabled ? 'Mapa normal' : 'Satélite'"
      @click="toggleBasemap"
    />
    <div v-if="error" class="map-message" role="status">
      <q-icon name="map" size="32px" />
      <strong>Mapa indisponível</strong>
      <span>{{ error }}</span>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { createMapBaseLayers, setMapSatellite } from '../mapBaseLayers.js'

const props = defineProps({
  locations: { type: Array, default: () => [] },
  selectable: { type: Boolean, default: false },
  center: {
    type: Object,
    default: () => ({ latitude: -25.0519, longitude: 33.6442 })
  },
  zoom: { type: Number, default: 13 },
  destination: { type: Object, default: null }
})
const emit = defineEmits(['location-select'])

const mapElement = ref(null)
const error = ref('')
let mapInstance = null
const markers = new Map()
let lastLocationKeys = ''
let routeLine = null
let routeRequestTimer = null
let lastRouteRequestAt = 0
let routeRequestKey = ''
let routeRequestVersion = 0
const routeSummary = ref('')
const satelliteEnabled = ref(false)
let baseLayers = null

function toggleBasemap() {
  if (!mapInstance || !baseLayers) return
  satelliteEnabled.value = !satelliteEnabled.value
  setMapSatellite(mapInstance, baseLayers, satelliteEnabled.value)
}

function markerIcon(kind) {
  const color = kind === 'van' ? '#467d47' : kind === 'pickup' ? '#6275aa' : '#bd7544'
  const label = kind === 'van' ? 'C' : kind === 'pickup' ? 'R' : kind ? 'D' : ''
  return L.divIcon({
    className: 'location-marker-wrap',
    html: `<span class="location-marker" style="--marker-color:${color}">${label}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  })
}

function syncMarkers() {
  if (!mapInstance) return

  const validLocations = props.locations.filter((location) =>
    location.latitude !== null && location.latitude !== '' &&
    location.longitude !== null && location.longitude !== '' &&
    Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude)) &&
    Number(location.latitude) >= -90 && Number(location.latitude) <= 90 &&
    Number(location.longitude) >= -180 && Number(location.longitude) <= 180
  )
  const currentKeys = new Set(validLocations.map((location, index) => location.id ?? location.key ?? index))

  for (const [key, marker] of markers) {
    if (!currentKeys.has(key)) {
      marker.remove()
      markers.delete(key)
    }
  }

  validLocations.forEach((location, index) => {
    const key = location.id ?? location.key ?? index
    const position = [Number(location.latitude), Number(location.longitude)]
    const marker = markers.get(key)
    if (marker) {
      marker.setLatLng(position)
      marker.setTooltipContent(location.title || location.name || 'Localização')
      marker.setIcon(markerIcon(location.kind))
    } else {
      markers.set(key, L.marker(position, {
        icon: markerIcon(location.kind),
        title: location.title || location.name || 'Localização'
      }).addTo(mapInstance).bindTooltip(location.title || location.name || 'Localização'))
    }
  })

  const locationKeys = [...currentKeys].map(String).sort().join('|')
  if (validLocations.length && locationKeys !== lastLocationKeys) {
    const bounds = L.latLngBounds(validLocations.map(({ latitude, longitude }) => [Number(latitude), Number(longitude)]))
    if (validLocations.length === 1) mapInstance.setView(bounds.getCenter(), Math.max(props.zoom, 15))
    else mapInstance.fitBounds(bounds, { padding: [32, 32], maxZoom: 16 })
  }
  lastLocationKeys = locationKeys
  scheduleRoadRoute()
}

function scheduleRoadRoute() {
  const van = props.locations.find(location => location.kind === 'van')
  const destination = props.destination
  if (!van || !destination) {
    routeLine?.remove()
    routeLine = null
    routeSummary.value = ''
    routeRequestKey = ''
    return
  }
  const key = [van.latitude, van.longitude, destination.latitude, destination.longitude]
    .map(value => Number(value).toFixed(5)).join(',')
  if (key === routeRequestKey && Date.now() - lastRouteRequestAt < 60000) return
  clearTimeout(routeRequestTimer)
  const wait = Math.max(0, 60000 - (Date.now() - lastRouteRequestAt))
  routeRequestTimer = setTimeout(() => loadRoadRoute(van, destination, key), wait)
}

async function loadRoadRoute(van, destination, key) {
  routeRequestKey = key
  lastRouteRequestAt = Date.now()
  const requestVersion = ++routeRequestVersion
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${Number(van.longitude)},${Number(van.latitude)};${Number(destination.longitude)},${Number(destination.latitude)}?overview=full&geometries=geojson`
    const response = await fetch(url)
    const result = await response.json()
    const route = response.ok ? result.routes?.[0] : null
    if (!route || !mapInstance || requestVersion !== routeRequestVersion) return
    const path = route.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude])
    if (routeLine) routeLine.setLatLngs(path)
    else routeLine = L.polyline(path, { color: '#547e48', opacity: 0.85, weight: 5 }).addTo(mapInstance)
    const minutes = Math.max(1, Math.ceil(route.duration / 60))
    const arrival = new Intl.DateTimeFormat('pt-MZ', { hour: '2-digit', minute: '2-digit' })
      .format(new Date(Date.now() + route.duration * 1000))
    routeSummary.value = `${minutes} min restantes · chegada estimada às ${arrival}`
  } catch {
    routeSummary.value = 'Não foi possível calcular o trajecto neste momento.'
  }
}

watch(() => props.locations, syncMarkers, { deep: true })
watch(() => props.center, (center) => {
  if (mapInstance && Number.isFinite(Number(center.latitude)) && Number.isFinite(Number(center.longitude))) {
    mapInstance.setView([Number(center.latitude), Number(center.longitude)], mapInstance.getZoom())
  }
}, { deep: true })
watch(() => props.zoom, (zoom) => mapInstance?.setZoom(zoom))

onMounted(() => {
  try {
    if (!mapElement.value) return
    mapInstance = L.map(mapElement.value, {
      center: [Number(props.center.latitude), Number(props.center.longitude)],
      zoom: props.zoom,
      zoomControl: true
    })
    baseLayers = createMapBaseLayers()
    baseLayers.street.addTo(mapInstance)
    if (props.selectable) {
      mapInstance.on('click', ({ latlng }) => emit('location-select', {
        latitude: latlng.lat,
        longitude: latlng.lng
      }))
    }
    syncMarkers()
    requestAnimationFrame(() => mapInstance?.invalidateSize())
  } catch (loadError) {
    error.value = loadError.message || 'O mapa não está disponível neste momento.'
  }
})

onUnmounted(() => {
  clearTimeout(routeRequestTimer)
  routeRequestVersion += 1
  routeLine?.remove()
  markers.clear()
  mapInstance?.remove()
  mapInstance = null
})
</script>

<style>
.location-marker-wrap { background: transparent; border: 0; }
.location-marker {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 2px solid #fff;
  border-radius: 50%;
  background: var(--marker-color);
  box-shadow: 0 1px 5px #0005;
  color: white;
  font: 700 11px/1 Arial, sans-serif;
}
</style>

<style scoped>
.map-shell { position: relative; min-height: 320px; height: 100%; overflow: hidden; border-radius: inherit; background: #e8eee5; }
.basemap-toggle { position: absolute; z-index: 500; top: 12px; right: 12px; border: 1px solid #dce6dc; border-radius: 10px; box-shadow: 0 2px 10px #20302020; }
.route-summary { position: absolute; z-index: 500; top: 12px; left: 50px; display: grid; gap: 3px; max-width: calc(100% - 66px); padding: 9px 12px; border: 1px solid #dce6dc; border-radius: 12px; background: #fff; box-shadow: 0 3px 14px #20302020; color: #35483b; font-size: 12px; }
.route-summary span { color: #557d43; }
.map-canvas { width: 100%; height: 100%; min-height: 320px; }
.map-message { position: absolute; z-index: 1000; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 24px; color: #6f7c73; background: #f4f7f2; text-align: center; }
.map-message strong { color: #35483b; }
.map-message span { max-width: 360px; font-size: 12px; line-height: 1.6; }
</style>
