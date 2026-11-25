
import { boot } from 'quasar/wrappers'
import axios from 'axios'
import { apiUrl } from '../services/api-url'

const api = axios.create({
  baseURL: apiUrl(''),
  timeout: 15000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
})

export default boot(({ app }) => {
  app.config.globalProperties.$axios = axios
  app.config.globalProperties.$api = api
})

export { api }
