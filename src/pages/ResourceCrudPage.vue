<template>
  <q-page class="resource-page">
    <header class="page-heading">
      <div>
        <div class="eyebrow">GESTÃO DO TRANSPORTE</div>
        <h1><q-icon :name="definition.icon" /> {{ definition.title }}</h1>
        <p>{{ definition.description }}</p>
      </div>
      <q-btn
        unelevated
        no-caps
        icon="add"
        :label="`Adicionar ${definition.singular.toLowerCase()}`"
        class="primary-button"
        @click="openCreate"
      />
    </header>

    <q-banner
      v-if="errorMessage"
      rounded
      class="message error-message"
      role="alert"
    >
      <template #avatar><q-icon name="error_outline" /></template
      >{{ errorMessage }}
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
    <q-banner v-if="successMessage" rounded class="message success-message">
      <template #avatar><q-icon name="check_circle" /></template
      >{{ successMessage }}
      <template #action
        ><q-btn
          flat
          round
          dense
          icon="close"
          aria-label="Fechar"
          @click="successMessage = ''"
      /></template>
    </q-banner>

    <section class="resource-summary">
      <q-card flat bordered class="summary-card">
        <span class="summary-icon"><q-icon :name="definition.icon" /></span>
        <span
          ><small>{{ definition.title }} registados</small
          ><strong>{{ records.length }}</strong></span
        >
      </q-card>
      <q-input
        v-model="search"
        outlined
        dense
        clearable
        placeholder="Pesquisar..."
        class="search-input"
        aria-label="Pesquisar registos"
      >
        <template #prepend><q-icon name="search" /></template>
      </q-input>
    </section>

    <div v-if="loading" class="loading-state"
      ><q-spinner-dots color="primary" size="34px" /><span
        >A carregar {{ definition.title.toLowerCase() }}...</span
      ></div
    >
    <section v-else-if="filteredRecords.length" class="records-grid">
      <q-card
        v-for="record in filteredRecords"
        :key="record.id"
        flat
        bordered
        class="record-card"
      >
        <div class="record-topline">
          <span class="record-icon"><q-icon :name="definition.icon" /></span>
          <q-badge
            v-if="statusLabel(record)"
            rounded
            class="status-badge"
            :class="statusTone(record)"
            >{{ statusLabel(record) }}</q-badge
          >
          <q-space />
          <q-btn
            flat
            round
            dense
            icon="edit"
            color="grey-7"
            :aria-label="`Editar ${definition.singular.toLowerCase()}`"
            @click="openEdit(record)"
          />
          <q-btn
            flat
            round
            dense
            icon="delete_outline"
            color="negative"
            :aria-label="`Excluir ${definition.singular.toLowerCase()}`"
            @click="confirmDelete(record)"
          />
        </div>
        <h2>{{ recordTitle(record) }}</h2>
        <p class="record-subtitle">{{ recordSubtitle(record) }}</p>
        <q-separator />
        <div class="record-details"
          ><q-icon name="info_outline" /><span>{{
            recordDetails(record)
          }}</span></div
        >
        <q-btn
          v-if="
            definition.endpoint === 'drivers' &&
            !record.has_account &&
            !obterSessaoLocal()
          "
          flat
          no-caps
          icon="person_add_alt"
          label="Criar acesso e palavra-passe"
          color="primary"
          class="q-mt-md"
          @click="openDriverAccount(record)"
        />
        <q-badge
          v-else-if="definition.endpoint === 'drivers' && record.has_account"
          color="positive"
          class="q-mt-md"
          >Acesso ativo</q-badge
        >
      </q-card>
    </section>
    <q-card v-else flat bordered class="empty-state">
      <span class="empty-icon"><q-icon :name="definition.icon" /></span>
      <h2>{{
        search
          ? 'Nenhum resultado encontrado'
          : `Ainda não há ${definition.title.toLowerCase()} registados`
      }}</h2>
      <p>{{
        search
          ? 'Tente pesquisar com outros termos.'
          : definition.emptyDescription
      }}</p>
      <q-btn
        v-if="!search"
        unelevated
        no-caps
        icon="add"
        :label="`Adicionar ${definition.singular.toLowerCase()}`"
        class="primary-button"
        @click="openCreate"
      />
    </q-card>

    <q-dialog v-model="accountDialog" persistent>
      <q-card class="form-dialog">
        <q-form @submit="createDriverAccount">
          <q-card-section class="dialog-heading">
            <div
              ><div class="eyebrow">ACESSO DO MOTORISTA</div><h2>Criar conta</h2
              ><p>{{ selectedDriver?.name }}</p></div
            >
            <q-btn
              flat
              round
              dense
              icon="close"
              aria-label="Fechar"
              @click="accountDialog = false"
            />
          </q-card-section>
          <q-banner
            v-if="dialogError"
            dense
            rounded
            class="message error-message dialog-message"
            role="alert"
          >
            <template #avatar><q-icon name="error_outline" /></template
            >{{ dialogError }}
          </q-banner>
          <q-card-section class="fields-grid">
            <q-input
              v-model="accountEmail"
              outlined
              dense
              type="email"
              label="E-mail de acesso *"
              autocomplete="email"
              :rules="[value => !!value || 'Informe o e-mail']"
              lazy-rules
              class="wide-field"
            />
            <q-input
              v-model="accountPassword"
              outlined
              dense
              type="password"
              label="Palavra-passe inicial *"
              autocomplete="new-password"
              minlength="10"
              :rules="[
                value => value?.length >= 10 || 'Use pelo menos 10 caracteres'
              ]"
              lazy-rules
              class="wide-field"
            />
            <p class="account-hint"
              >Partilhe estes dados de acesso diretamente com o motorista.</p
            >
          </q-card-section>
          <q-card-actions align="right" class="dialog-actions">
            <q-btn
              flat
              no-caps
              label="Cancelar"
              color="grey-7"
              :disable="creatingAccount"
              @click="accountDialog = false"
            />
            <q-btn
              unelevated
              no-caps
              label="Criar acesso"
              type="submit"
              class="primary-button"
              :loading="creatingAccount"
            />
          </q-card-actions>
        </q-form>
      </q-card>
    </q-dialog>

    <q-dialog v-model="formDialog" persistent>
      <q-card class="form-dialog">
        <q-form @submit="saveRecord">
          <q-banner
            v-if="dialogError"
            dense
            rounded
            class="message error-message dialog-message"
            role="alert"
          >
            <template #avatar><q-icon name="error_outline" /></template
            >{{ dialogError }}
          </q-banner>
          <q-card-section class="dialog-heading">
            <div
              ><div class="eyebrow">{{ definition.title.toUpperCase() }}</div
              ><h2>{{
                editingId
                  ? `Editar ${definition.singular.toLowerCase()}`
                  : `Adicionar ${definition.singular.toLowerCase()}`
              }}</h2
              ><p>{{ definition.formDescription }}</p></div
            >
            <q-btn
              flat
              round
              dense
              icon="close"
              aria-label="Fechar"
              @click="formDialog = false"
            />
          </q-card-section>
          <q-card-section class="fields-grid">
            <template v-for="field in definition.fields" :key="field.name">
              <q-select
                v-if="field.type === 'select'"
                v-model="form[field.name]"
                outlined
                dense
                clearable
                emit-value
                map-options
                :options="
                  field.source ? optionsFor(field.source) : field.options
                "
                :option-value="field.source ? 'id' : 'value'"
                :option-label="field.source ? 'option_label' : 'label'"
                :label="field.required ? `${field.label} *` : field.label"
                :rules="
                  field.required
                    ? [
                        value =>
                          (value !== null && value !== '') ||
                          `Selecione ${field.label.toLowerCase()}`
                      ]
                    : []
                "
                :class="{ 'wide-field': field.wide }"
                lazy-rules
                @update:model-value="handleFieldChange(field, $event)"
              >
                <template v-if="field.source" #no-option
                  ><q-item
                    ><q-item-section class="text-grey"
                      >Nenhum registo disponível</q-item-section
                    ></q-item
                  ></template
                >
              </q-select>
              <q-input
                v-else
                v-model="form[field.name]"
                outlined
                dense
                :type="field.type || 'text'"
                :label="field.required ? `${field.label} *` : field.label"
                :maxlength="field.max"
                :min="field.min"
                :max="field.maxValue"
                :rules="
                  field.required
                    ? [
                        value =>
                          (value !== null &&
                            value !== undefined &&
                            String(value).trim() !== '') ||
                          `Informe ${field.label.toLowerCase()}`
                      ]
                    : []
                "
                :class="{ 'wide-field': field.wide }"
                :autogrow="field.type === 'textarea'"
                lazy-rules
              />
            </template>
          </q-card-section>
          <q-card-actions align="right" class="dialog-actions">
            <q-btn
              flat
              no-caps
              label="Cancelar"
              color="grey-7"
              :disable="saving"
              @click="formDialog = false"
            />
            <q-btn
              unelevated
              no-caps
              :label="editingId ? 'Guardar alterações' : 'Guardar registo'"
              type="submit"
              class="primary-button"
              :loading="saving"
            />
          </q-card-actions>
        </q-form>
      </q-card>
    </q-dialog>

    <q-dialog v-model="deleteDialog">
      <q-card class="delete-dialog">
        <q-card-section
          ><div class="delete-icon"><q-icon name="delete_outline" /></div
          ><h2>Excluir {{ definition.singular.toLowerCase() }}?</h2
          ><p
            ><strong>{{
              selectedRecord ? recordTitle(selectedRecord) : ''
            }}</strong>
            será removido. Esta ação não pode ser desfeita.</p
          ></q-card-section
        >
        <q-banner
          v-if="dialogError"
          dense
          rounded
          class="message error-message dialog-message"
          role="alert"
          ><template #avatar><q-icon name="error_outline" /></template
          >{{ dialogError }}</q-banner
        >
        <q-card-actions align="right"
          ><q-btn
            flat
            no-caps
            label="Cancelar"
            color="grey-7"
            :disable="deleting"
            @click="deleteDialog = false" /><q-btn
            unelevated
            no-caps
            label="Excluir"
            color="negative"
            :loading="deleting"
            @click="deleteRecord"
        /></q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { obterSessaoLocal, requestLocalApi } from '../services/database.js'
import { apiFetch } from '../services/api-url.js'

const route = useRoute()
const definitions = {
  drivers: {
    endpoint: 'drivers',
    singular: 'Motorista',
    title: 'Motoristas',
    icon: 'badge',
    description: 'Registe e acompanhe a equipa responsável pelo transporte.',
    emptyDescription:
      'Adicione os motoristas e os dados da respetiva carta de condução.',
    formDescription: 'Informe os dados do motorista e da carta de condução.',
    fields: [
      { name: 'name', label: 'Nome completo', required: true, max: 160 },
      {
        name: 'phone',
        label: 'Telefone',
        type: 'tel',
        required: true,
        max: 40
      },
      {
        name: 'license_number',
        label: 'Número da carta de condução',
        required: true,
        max: 80
      },
      {
        name: 'license_expiry',
        label: 'Validade da carta',
        type: 'date',
        max: 10
      },
      {
        name: 'photo_url',
        label: 'Fotografia (URL)',
        max: 2048,
        wide: true
      },
      {
        name: 'notes',
        label: 'Observações',
        type: 'textarea',
        max: 1000,
        wide: true
      }
    ]
  },
  vehicles: {
    endpoint: 'vehicles',
    singular: 'Carrinha',
    title: 'Carrinhas',
    icon: 'airport_shuttle',
    description: 'Mantenha os veículos e a sua disponibilidade organizados.',
    emptyDescription:
      'Adicione as carrinhas que fazem parte do transporte escolar.',
    formDescription: 'Registe a identificação e a capacidade do veículo.',
    fields: [
      { name: 'plate', label: 'Matrícula', required: true, max: 30 },
      { name: 'model', label: 'Marca / modelo', required: true, max: 100 },
      {
        name: 'capacity',
        label: 'Lugares',
        type: 'number',
        required: true,
        min: 1,
        maxValue: 100
      },
      {
        name: 'year',
        label: 'Ano',
        type: 'number',
        min: 1950,
        maxValue: new Date().getFullYear() + 1
      },
      {
        name: 'status',
        label: 'Estado',
        type: 'select',
        required: true,
        options: [
          { label: 'Disponível', value: 'active' },
          { label: 'Em manutenção', value: 'maintenance' }
        ],
        default: 'active'
      },
      {
        name: 'driver_id',
        label: 'Motorista responsável',
        type: 'select',
        source: 'drivers'
      },
      {
        name: 'notes',
        label: 'Observações',
        type: 'textarea',
        max: 1000,
        wide: true
      }
    ]
  },
  routes: {
    endpoint: 'routes',
    singular: 'Rota',
    title: 'Rotas',
    icon: 'route',
    description: 'Defina os percursos, horários e equipa associada.',
    emptyDescription:
      'Crie percursos e associe uma carrinha e um motorista quando estiverem registados.',
    formDescription:
      'Defina o percurso e, se desejar, associe os recursos disponíveis.',
    fields: [
      { name: 'name', label: 'Nome da rota', required: true, max: 120 },
      {
        name: 'departure_time',
        label: 'Hora de partida',
        type: 'time',
        max: 5
      },
      {
        name: 'start_point',
        label: 'Ponto de partida',
        required: true,
        max: 180,
        wide: true
      },
      {
        name: 'end_point',
        label: 'Destino',
        required: true,
        max: 180,
        wide: true
      },
      {
        name: 'end_latitude',
        label: 'Latitude do destino',
        type: 'number',
        min: -90,
        maxValue: 90
      },
      {
        name: 'end_longitude',
        label: 'Longitude do destino',
        type: 'number',
        min: -180,
        maxValue: 180
      },
      {
        name: 'vehicle_id',
        label: 'Carrinha',
        type: 'select',
        source: 'vehicles'
      },
      {
        name: 'driver_id',
        label: 'Motorista',
        type: 'select',
        source: 'drivers'
      },
      {
        name: 'notes',
        label: 'Observações',
        type: 'textarea',
        max: 1000,
        wide: true
      }
    ]
  },
  trips: {
    endpoint: 'trips',
    singular: 'Viagem',
    title: 'Viagens',
    icon: 'commute',
    description: 'Planeie as viagens e acompanhe o estado de cada operação.',
    emptyDescription: 'Registe uma viagem depois de criar pelo menos uma rota.',
    formDescription: 'Escolha uma rota, a data e o estado da viagem.',
    fields: [
      {
        name: 'route_id',
        label: 'Rota',
        type: 'select',
        source: 'routes',
        required: true,
        wide: true
      },
      {
        name: 'trip_date',
        label: 'Data',
        type: 'date',
        required: true,
        max: 10
      },
      { name: 'departure_time', label: 'Hora', type: 'time', max: 5 },
      {
        name: 'status',
        label: 'Estado',
        type: 'select',
        required: true,
        options: [
          { label: 'Agendada', value: 'scheduled' },
          { label: 'Em andamento', value: 'in_progress' },
          { label: 'Concluída', value: 'completed' },
          { label: 'Cancelada', value: 'cancelled' }
        ],
        default: 'scheduled'
      },
      {
        name: 'notes',
        label: 'Observações',
        type: 'textarea',
        max: 1000,
        wide: true
      }
    ]
  }
}

const records = ref([])
const search = ref('')
const loading = ref(false)
const saving = ref(false)
const deleting = ref(false)
const formDialog = ref(false)
const deleteDialog = ref(false)
const editingId = ref(null)
const selectedRecord = ref(null)
const errorMessage = ref('')
const dialogError = ref('')
const successMessage = ref('')
const accountDialog = ref(false)
const selectedDriver = ref(null)
const accountEmail = ref('')
const accountPassword = ref('')
const creatingAccount = ref(false)
const related = reactive({ drivers: [], vehicles: [], routes: [] })
const form = ref({})

const definition = computed(
  () => definitions[route.meta.resource] || definitions.drivers
)
const fields = computed(() => definition.value.fields)
const filteredRecords = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  if (!query) return records.value
  return records.value.filter(record =>
    JSON.stringify(record).toLocaleLowerCase().includes(query)
  )
})

onMounted(loadRecords)
watch(
  () => route.meta.resource,
  () => {
    search.value = ''
    successMessage.value = ''
    loadRecords()
  }
)

function emptyRecord() {
  return Object.fromEntries(
    fields.value.map(field => [
      field.name,
      field.default ?? (field.source ? null : '')
    ])
  )
}
function optionsFor(source) {
  return related[source].map(record => ({
    ...record,
    option_label:
      source === 'vehicles'
        ? `${record.plate} · ${record.model}${record.driver_name ? ` · ${record.driver_name}` : ''}`
        : source === 'drivers'
          ? `${record.name} · ${record.phone}`
          : `${record.name} · ${record.start_point} → ${record.end_point}${record.vehicle_plate ? ` · ${record.vehicle_plate}` : ''}${record.driver_name ? ` · ${record.driver_name}` : ''}`
  }))
}
function handleFieldChange(field, value) {
  if (definition.value.endpoint === 'routes' && field.name === 'vehicle_id') {
    const vehicle = related.vehicles.find(
      item => String(item.id) === String(value)
    )
    if (vehicle?.driver_id) form.value.driver_id = vehicle.driver_id
  }
}
function recordTitle(record) {
  if (definition.value.endpoint === 'vehicles') return record.plate
  if (definition.value.endpoint === 'trips')
    return record.route_name || 'Viagem'
  return record.name
}
function recordSubtitle(record) {
  if (definition.value.endpoint === 'drivers') return record.phone
  if (definition.value.endpoint === 'vehicles') return record.model
  if (definition.value.endpoint === 'routes')
    return `${record.start_point} → ${record.end_point}`
  return `${formatDate(record.trip_date)}${record.departure_time ? ` · ${record.departure_time}` : ''}`
}
function recordDetails(record) {
  if (definition.value.endpoint === 'drivers')
    return `Carta ${record.license_number}${record.license_expiry ? ` · válida até ${formatDate(record.license_expiry)}` : ''}`
  if (definition.value.endpoint === 'vehicles')
    return `${record.capacity} lugares · ${record.status === 'active' ? 'Disponível' : 'Em manutenção'}${record.year ? ` · ${record.year}` : ''}${record.driver_name ? ` · Motorista: ${record.driver_name}` : ' · Sem motorista associado'}`
  if (definition.value.endpoint === 'routes')
    return (
      [record.departure_time, record.vehicle_plate, record.driver_name]
        .filter(Boolean)
        .join(' · ') || 'Sem carrinha ou motorista associados'
    )
  return (
    [
      record.start_point && record.end_point
        ? `${record.start_point} → ${record.end_point}`
        : '',
      record.vehicle_plate,
      record.driver_name
    ]
      .filter(Boolean)
      .join(' · ') || 'Sem recursos associados'
  )
}
function statusLabel(record) {
  if (definition.value.endpoint === 'vehicles')
    return record.status === 'active' ? 'Disponível' : 'Manutenção'
  if (definition.value.endpoint === 'trips')
    return (
      {
        scheduled: 'Agendada',
        in_progress: 'Em andamento',
        completed: 'Concluída',
        cancelled: 'Cancelada'
      }[record.status] || ''
    )
  return ''
}
function statusTone(record) {
  if (record.status === 'completed' || record.status === 'active')
    return 'tone-green'
  if (record.status === 'in_progress') return 'tone-blue'
  if (record.status === 'maintenance' || record.status === 'cancelled')
    return 'tone-orange'
  return 'tone-yellow'
}
function formatDate(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('pt-MZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(new Date(`${value}T00:00:00`))
}
async function request(path, options = {}) {
  if (obterSessaoLocal()) return requestLocalApi(path, options)

  let response
  try {
    response = await apiFetch(path, {
      ...options,
      credentials: 'include',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers
      }
    })
  } catch {
    throw new Error(
      'Não foi possível contactar a API. Confirme se “npm run auth:server” está em execução.'
    )
  }
  const result = await response.json().catch(() => null)
  if (!result) throw new Error('Resposta inválida do servidor de autenticação.')
  if (!response.ok)
    throw new Error(result.message || 'Não foi possível concluir o pedido.')
  return result
}
async function loadRecords() {
  loading.value = true
  errorMessage.value = ''
  try {
    const resource = definition.value
    const sources = [
      ...new Set(
        resource.fields.filter(field => field.source).map(field => field.source)
      )
    ]
    const [result, ...relations] = await Promise.all([
      request(`/api/${resource.endpoint}`),
      ...sources.map(source => request(`/api/${source}`))
    ])
    records.value = result[resource.endpoint]
    sources.forEach((source, index) => {
      related[source] = relations[index][source]
    })
  } catch (error) {
    errorMessage.value =
      error.message ||
      `Não foi possível carregar ${definition.value.title.toLowerCase()}.`
  } finally {
    loading.value = false
  }
}
function openCreate() {
  editingId.value = null
  form.value = emptyRecord()
  dialogError.value = ''
  formDialog.value = true
}
function openDriverAccount(driver) {
  selectedDriver.value = driver
  accountEmail.value = ''
  accountPassword.value = ''
  dialogError.value = ''
  accountDialog.value = true
}
async function createDriverAccount() {
  if (!selectedDriver.value) return
  creatingAccount.value = true
  dialogError.value = ''
  try {
    await request(`/api/drivers/${selectedDriver.value.id}/account`, {
      method: 'POST',
      body: JSON.stringify({
        email: accountEmail.value,
        password: accountPassword.value
      })
    })
    accountDialog.value = false
    successMessage.value = `Acesso criado para ${accountEmail.value}.`
    await loadRecords()
  } catch (error) {
    dialogError.value = error.message || 'Não foi possível criar o acesso.'
  } finally {
    creatingAccount.value = false
  }
}
function openEdit(record) {
  editingId.value = record.id
  form.value = Object.fromEntries(
    fields.value.map(field => [
      field.name,
      record[field.name] ?? (field.source ? null : '')
    ])
  )
  dialogError.value = ''
  formDialog.value = true
}
async function saveRecord() {
  saving.value = true
  dialogError.value = ''
  try {
    const editing = editingId.value !== null
    const result = await request(
      editing
        ? `/api/${definition.value.endpoint}/${editingId.value}`
        : `/api/${definition.value.endpoint}`,
      {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify(form.value)
      }
    )
    formDialog.value = false
    successMessage.value = `${definition.value.singular} ${editing ? 'atualizado' : 'adicionado'} com sucesso.`
    await loadRecords()
  } catch (error) {
    dialogError.value = error.message || 'Não foi possível guardar o registo.'
  } finally {
    saving.value = false
  }
}
function confirmDelete(record) {
  selectedRecord.value = record
  dialogError.value = ''
  deleteDialog.value = true
}
async function deleteRecord() {
  if (!selectedRecord.value) return
  deleting.value = true
  dialogError.value = ''
  try {
    await request(
      `/api/${definition.value.endpoint}/${selectedRecord.value.id}`,
      { method: 'DELETE' }
    )
    deleteDialog.value = false
    successMessage.value = `${definition.value.singular} excluído com sucesso.`
    selectedRecord.value = null
    await loadRecords()
  } catch (error) {
    dialogError.value = error.message || 'Não foi possível excluir o registo.'
  } finally {
    deleting.value = false
  }
}
</script>

<style scoped>
.resource-page {
  width: min(100%, 1240px);
  margin: 0 auto;
  padding: 30px 34px 54px;
}
.page-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 20px;
}
.eyebrow {
  color: #8b998f;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 1.25px;
}
.page-heading h1 {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 7px 0 5px;
  color: #26392f;
  font-size: 26px;
  font-weight: 720;
  letter-spacing: -0.9px;
}
.page-heading h1 .q-icon {
  color: #66864c;
  font-size: 23px;
}
.page-heading p {
  margin: 0;
  color: #87938b;
  font-size: 11px;
}
.primary-button {
  min-height: 40px;
  padding: 0 14px;
  border-radius: 9px;
  color: #fff;
  background: #214e3d;
  font-size: 10px;
  font-weight: 650;
}
.message {
  margin: 0 0 14px;
  font-size: 11px;
}
.error-message {
  border: 1px solid #f0d3ce;
  color: #9a4235;
  background: #fff5f3;
}
.success-message {
  border: 1px solid #d9e8ca;
  color: #42653c;
  background: #f3f8ed;
}
.resource-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  margin-bottom: 15px;
}
.summary-card {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 205px;
  padding: 10px 13px;
  border-color: #e8ece7;
  border-radius: 10px;
  background: #fff;
}
.summary-icon,
.record-icon {
  display: grid;
  flex: 0 0 36px;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  color: #5d7e45;
  background: #eff5e7;
  font-size: 17px;
}
.summary-card > span:last-child {
  display: grid;
  gap: 2px;
}
.summary-card small {
  color: #8a968e;
  font-size: 8px;
}
.summary-card strong {
  color: #293b31;
  font-size: 16px;
  line-height: 1.1;
}
.search-input {
  width: min(100%, 260px);
}
.search-input :deep(.q-field__control) {
  border-radius: 8px;
}
.search-input :deep(.q-field__native),
.search-input :deep(.q-field__prepend) {
  color: #758279;
  font-size: 10px;
}
.records-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.record-card {
  min-width: 0;
  padding: 14px;
  border-color: #e8ece7;
  border-radius: 12px;
  background: #fff;
}
.record-topline {
  display: flex;
  align-items: center;
  gap: 5px;
}
.status-badge {
  margin-left: 3px;
  padding: 5px 8px;
  font-size: 8px;
  font-weight: 650;
}
.tone-green {
  color: #4b713f;
  background: #eef5e6;
}
.tone-blue {
  color: #4e7791;
  background: #edf4f8;
}
.tone-orange {
  color: #a66f3f;
  background: #fbf1e7;
}
.tone-yellow {
  color: #957a39;
  background: #f8f4e5;
}
.record-card h2 {
  overflow: hidden;
  margin: 13px 0 4px;
  color: #34453a;
  font-size: 13px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.record-subtitle {
  overflow: hidden;
  min-height: 16px;
  margin: 0 0 12px;
  color: #79867d;
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.record-details {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding-top: 10px;
  color: #909c93;
  font-size: 8px;
  line-height: 1.5;
}
.record-details .q-icon {
  flex: 0 0 auto;
  color: #9bad81;
  font-size: 13px;
}
.loading-state {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 64px 20px;
  color: #87938b;
  font-size: 10px;
}
.empty-state {
  display: grid;
  justify-items: center;
  padding: 54px 18px;
  border-color: #e8ece7;
  border-radius: 13px;
  background: #fff;
  text-align: center;
}
.empty-icon {
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  border-radius: 17px;
  color: #64804b;
  background: #f0f5e8;
  font-size: 27px;
}
.empty-state h2 {
  margin: 15px 0 6px;
  color: #3b4b41;
  font-size: 14px;
}
.empty-state p {
  margin: 0 0 14px;
  color: #87938b;
  font-size: 10px;
}
.form-dialog {
  width: min(100%, 650px);
  max-width: 650px;
  border-radius: 14px;
}
.dialog-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 22px 24px 12px;
}
.dialog-heading h2 {
  margin: 7px 0 4px;
  color: #293b31;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.5px;
}
.dialog-heading p {
  margin: 0;
  color: #8b978f;
  font-size: 10px;
}
.fields-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 14px;
  padding: 14px 24px 8px;
}
.wide-field {
  grid-column: 1 / -1;
}
.fields-grid :deep(.q-field__control) {
  border-radius: 8px;
}
.fields-grid :deep(.q-field__label),
.fields-grid :deep(.q-field__native) {
  font-size: 11px;
}
.dialog-actions {
  padding: 12px 24px 20px;
}
.dialog-message {
  margin: 12px 18px 0;
}
.delete-dialog {
  width: min(100%, 390px);
  border-radius: 14px;
}
.delete-dialog .q-card__section {
  padding: 24px 24px 12px;
}
.delete-icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  color: #bd5c4e;
  background: #fff0ed;
  font-size: 21px;
}
.delete-dialog h2 {
  margin: 17px 0 7px;
  color: #293b31;
  font-size: 17px;
}
.delete-dialog p {
  margin: 0;
  color: #7d8981;
  font-size: 11px;
  line-height: 1.6;
}
.delete-dialog p strong {
  color: #46564b;
}
.delete-dialog .q-card__actions {
  padding: 12px 20px 20px;
}
@media (max-width: 900px) {
  .records-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 650px) {
  .resource-page {
    padding: 22px 18px 40px;
  }
  .page-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .resource-summary {
    align-items: stretch;
    flex-direction: column;
  }
  .summary-card,
  .search-input {
    width: 100%;
  }
  .records-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 520px) {
  .page-heading h1 {
    font-size: 23px;
  }
  .primary-button {
    min-height: 36px;
    padding: 0 9px;
    font-size: 9px;
  }
  .fields-grid {
    grid-template-columns: 1fr;
    padding-right: 17px;
    padding-left: 17px;
  }
  .wide-field {
    grid-column: auto;
  }
  .dialog-heading {
    padding-right: 17px;
    padding-left: 17px;
  }
  .dialog-actions {
    padding-right: 17px;
    padding-left: 17px;
  }
}
</style>
