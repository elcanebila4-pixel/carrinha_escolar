import L from 'leaflet'

export function createMapBaseLayers() {
  return {
    street: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }),
    satellite: L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community',
        maxZoom: 19
      }
    )
  }
}

export function setMapSatellite(map, layers, enabled) {
  layers.street.remove()
  layers.satellite.remove()
  const activeLayer = enabled ? layers.satellite : layers.street
  activeLayer.addTo(map)
}
