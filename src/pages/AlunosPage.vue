<template>
  <q-page class="students-page">
    <header class="page-heading">
      <div>
        <div class="page-kicker">GESTÃO ESCOLAR</div>
        <h1>Alunos</h1>
        <p>Organize os dados dos alunos e associe os encarregados.</p>
      </div>
      <div class="heading-actions">
        <q-btn
          flat
          no-caps
          icon="family_restroom"
          label="Encarregados"
          class="guardians-link"
          to="/dashboard/encarregados"
        />
        <q-btn
          unelevated
          no-caps
          icon="add"
          label="Adicionar aluno"
          class="add-button"
          @click="openCreate"
        />
      </div>
    </header>

    <q-banner
      v-if="errorMessage"
      rounded
      class="feedback feedback-error"
      role="alert"
    >
      <template #avatar><q-icon name="error_outline" /></template>
      {{ errorMessage }}
      <template #action
        ><q-btn
          flat
          dense
          round
          icon="close"
          aria-label="Fechar mensagem"
          @click="errorMessage = ''"
      /></template>
    </q-banner>
    <q-banner v-if="successMessage" rounded class="feedback feedback-success">
      <template #avatar><q-icon name="check_circle" /></template>
      {{ successMessage }}
      <template #action
        ><q-btn
          flat
          dense
          round
          icon="close"
          aria-label="Fechar mensagem"
          @click="successMessage = ''"
      /></template>
    </q-banner>

    <section class="summary-grid">
      <q-card flat bordered class="summary-card">
        <span class="summary-icon green"><q-icon name="school" /></span>
        <span class="summary-label">Alunos registados</span>
        <strong>{{ students.length }}</strong>
      </q-card>
      <q-card flat bordered class="summary-card">
        <span class="summary-icon blue"><q-icon name="class" /></span>
        <span class="summary-label">Turmas</span>
        <strong>{{ classCount }}</strong>
      </q-card>
      <q-card flat bordered class="summary-card">
        <span class="summary-icon yellow"
          ><q-icon name="family_restroom"
        /></span>
        <span class="summary-label">Com encarregado</span>
        <strong>{{ studentsWithGuardian }}</strong>
      </q-card>
    </section>

    <q-card flat bordered class="list-card">
      <div class="list-toolbar">
        <div>
          <h2>Lista de alunos</h2>
          <p
            >{{ students.length }}
            {{ students.length === 1 ? 'registo' : 'registos' }}</p
          >
        </div>
        <q-input
          v-model="search"
          outlined
          dense
          clearable
          placeholder="Pesquisar aluno..."
          class="search-input"
          aria-label="Pesquisar alunos"
        >
          <template #prepend><q-icon name="search" /></template>
        </q-input>
      </div>

      <q-table
        flat
        :rows="filteredStudents"
        :columns="columns"
        row-key="id"
        :loading="loading"
        :pagination="{ rowsPerPage: 10 }"
        no-data-label="Ainda não há alunos registados"
        no-results-label="Nenhum aluno corresponde à pesquisa"
        class="students-table"
      >
        <template #body-cell-name="props">
          <q-td :props="props">
            <div class="student-cell">
              <q-avatar size="34px" class="student-avatar">{{
                initials(props.row.name)
              }}</q-avatar>
              <span
                ><strong>{{ props.row.name }}</strong
                ><small>{{
                  props.row.birth_date
                    ? formatDate(props.row.birth_date)
                    : 'Data de nascimento não indicada'
                }}</small></span
              >
            </div>
          </q-td>
        </template>
        <template #body-cell-class_name="props">
          <q-td :props="props">
            <span v-if="props.row.class_name" class="class-pill">{{
              props.row.class_name
            }}</span>
            <span v-else class="muted-value">—</span>
          </q-td>
        </template>
        <template #body-cell-guardian_name="props">
          <q-td :props="props">
            <span v-if="props.row.guardian_name" class="guardian-cell">
              <strong>{{ props.row.guardian_name }}</strong>
              <small>{{ props.row.guardian_phone || 'Sem telefone' }}</small>
            </span>
            <span v-else class="muted-value">Não indicado</span>
          </q-td>
        </template>
        <template #body-cell-route_name="props">
          <q-td :props="props">
            <span v-if="props.row.route_name" class="class-pill">{{ props.row.route_name }}</span>
            <span v-else class="muted-value">Sem rota</span>
          </q-td>
        </template>
        <template #body-cell-actions="props">
          <q-td :props="props" class="text-right">
            <q-btn
              flat
              round
              dense
              icon="edit"
              color="grey-7"
              aria-label="Editar aluno"
              @click="openEdit(props.row)"
            >
              <q-tooltip>Editar aluno</q-tooltip>
            </q-btn>
            <q-btn
              flat
              round
              dense
              icon="delete_outline"
              color="negative"
              aria-label="Excluir aluno"
              @click="confirmDelete(props.row)"
            >
              <q-tooltip>Excluir aluno</q-tooltip>
            </q-btn>
          </q-td>
        </template>
        <template #no-data="{ message }">
          <div class="empty-state">
            <q-icon name="school" />
            <strong>{{
              search ? 'Nenhum resultado' : 'Comece por adicionar um aluno'
            }}</strong>
            <span>{{
              search
                ? message
                : 'Os alunos registados vão aparecer nesta lista.'
            }}</span>
            <q-btn
              v-if="!search"
              flat
              no-caps
              label="Adicionar primeiro aluno"
              icon="add"
              color="primary"
              @click="openCreate"
            />
          </div>
        </template>
      </q-table>
    </q-card>

    <q-dialog v-model="formDialog" persistent>
      <q-card class="student-dialog">
        <q-form @submit="saveStudent">
          <q-banner
            v-if="dialogError"
            dense
            rounded
            class="feedback feedback-error dialog-error"
            role="alert"
          >
            <template #avatar><q-icon name="error_outline" /></template>
            {{ dialogError }}
          </q-banner>
          <q-card-section class="dialog-heading">
            <div>
              <div class="page-kicker">FICHA DO ALUNO</div>
              <h2>{{ editingId ? 'Editar aluno' : 'Adicionar aluno' }}</h2>
              <p>Preencha os dados para manter a ficha atualizada.</p>
            </div>
            <q-btn
              flat
              round
              dense
              icon="close"
              aria-label="Fechar"
              @click="formDialog = false"
            />
          </q-card-section>

          <q-card-section class="form-fields">
            <div class="field-grid">
              <q-input
                v-model="form.name"
                outlined
                dense
                label="Nome completo *"
                autocomplete="name"
                maxlength="160"
                :rules="[value => !!value?.trim() || 'Informe o nome do aluno']"
                lazy-rules
              />
              <q-input
                v-model="form.class_name"
                outlined
                dense
                label="Turma / classe"
                maxlength="80"
              />
              <q-input
                v-model="form.school_name"
                outlined
                dense
                label="Escola"
                maxlength="160"
              />
              <q-input
                v-model="form.school_phone"
                outlined
                dense
                label="Telefone da escola"
                maxlength="40"
              />
              <q-input
                v-model="form.photo_url"
                outlined
                dense
                label="URL da fotografia do aluno"
                maxlength="2048"
                class="wide-field"
              />
              <q-input
                v-model="form.birth_date"
                outlined
                dense
                type="date"
                label="Data de nascimento"
                stack-label
              />
              <q-select
                v-model="form.guardian_id"
                :options="guardianOptions"
                outlined
                dense
                clearable
                emit-value
                map-options
                option-value="id"
                option-label="label"
                label="Encarregado de educação"
                class="wide-field"
                hint="Pode associar um encarregado depois."
              >
                <template #no-option
                  ><q-item
                    ><q-item-section class="text-grey"
                      >Nenhum encarregado registado</q-item-section
                    ></q-item
                  ></template
                >
              </q-select>
              <q-select
                v-model="form.route_id"
                :options="routeOptions"
                outlined
                dense
                clearable
                emit-value
                map-options
                option-value="id"
                option-label="label"
                label="Rota da carrinha"
                class="wide-field"
                hint="O motorista verá os alunos associados à sua rota."
              />
              <q-input
                v-model="form.pickup_address"
                outlined
                dense
                label="Morada / local de recolha"
                maxlength="250"
                class="wide-field"
              />
              <q-input
                v-model="form.emergency_contact_name"
                outlined
                dense
                label="Contacto de emergência autorizado"
                maxlength="160"
              />
              <q-input
                v-model="form.emergency_contact_phone"
                outlined
                dense
                label="Telefone de emergência"
                maxlength="40"
              />
              <q-input
                v-model="form.notes"
                outlined
                dense
                type="textarea"
                label="Observações"
                maxlength="1000"
                autogrow
                class="wide-field"
              />
            </div>
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
              :label="editingId ? 'Guardar alterações' : 'Guardar aluno'"
              type="submit"
              class="save-button"
              :loading="saving"
            />
          </q-card-actions>
        </q-form>
      </q-card>
    </q-dialog>

    <q-dialog v-model="deleteDialog">
      <q-card class="delete-dialog">
        <q-card-section>
          <div class="delete-icon"><q-icon name="delete_outline" /></div>
          <h2>Excluir aluno?</h2>
          <p
            >O registo de <strong>{{ selectedStudent?.name }}</strong> será
            removido. Esta ação não pode ser desfeita.</p
          >
        </q-card-section>
        <q-banner
          v-if="dialogError"
          dense
          rounded
          class="feedback feedback-error dialog-error"
          role="alert"
        >
          <template #avatar><q-icon name="error_outline" /></template>
          {{ dialogError }}
        </q-banner>
        <q-card-actions align="right">
          <q-btn
            flat
            no-caps
            label="Cancelar"
            color="grey-7"
            :disable="deleting"
            @click="deleteDialog = false"
          />
          <q-btn
            unelevated
            no-caps
            label="Excluir"
            color="negative"
            :loading="deleting"
            @click="deleteStudent"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { obterSessaoLocal, requestLocalApi } from '../services/database.js'
import { apiFetch } from '../services/api-url.js'

const students = ref([])
const guardians = ref([])
const routes = ref([])
const search = ref('')
const loading = ref(false)
const saving = ref(false)
const deleting = ref(false)
const formDialog = ref(false)
const deleteDialog = ref(false)
const editingId = ref(null)
const selectedStudent = ref(null)
const errorMessage = ref('')
const successMessage = ref('')
const dialogError = ref('')
const form = ref(emptyStudent())

const columns = [
  {
    name: 'name',
    label: 'ALUNO',
    field: 'name',
    align: 'left',
    sortable: true
  },
  {
    name: 'class_name',
    label: 'TURMA',
    field: 'class_name',
    align: 'left',
    sortable: true
  },
  {
    name: 'guardian_name',
    label: 'ENCARREGADO',
    field: 'guardian_name',
    align: 'left'
  },
  { name: 'route_name', label: 'ROTA', field: 'route_name', align: 'left' },
  { name: 'actions', label: '', field: 'id', align: 'right' }
]

const filteredStudents = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  if (!query) return students.value
  return students.value.filter(student =>
    [
      student.name,
      student.class_name,
      student.guardian_name,
      student.guardian_phone
    ].some(value => value?.toLocaleLowerCase().includes(query))
  )
})
const classCount = computed(
  () =>
    new Set(students.value.map(student => student.class_name).filter(Boolean))
      .size
)
const studentsWithGuardian = computed(
  () =>
    students.value.filter(
      student => student.guardian_name || student.guardian_phone
    ).length
)
const guardianOptions = computed(() =>
  guardians.value.map(guardian => ({
    id: guardian.id,
    label: guardian.phone
      ? `${guardian.name} · ${guardian.phone}`
      : guardian.name
  }))
)
const routeOptions = computed(() =>
  routes.value.map(route => ({
    id: route.id,
    label: `${route.name} · ${route.start_point} → ${route.end_point}${route.vehicle_plate ? ` · ${route.vehicle_plate}` : ''}${route.driver_name ? ` · ${route.driver_name}` : ''}`
  }))
)

onMounted(loadStudents)

function emptyStudent() {
  return {
    name: '',
    birth_date: '',
    class_name: '',
    school_name: '',
    school_phone: '',
    photo_url: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    guardian_id: null,
    route_id: null,
    pickup_address: '',
    notes: ''
  }
}

function initials(name = '') {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(part => part.charAt(0))
      .join('')
      .toUpperCase() || 'A'
  )
}

function formatDate(value) {
  const date = new Date(`${value}T00:00:00`)
  return new Intl.DateTimeFormat('pt-MZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(date)
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
  if (!result)
    throw new Error(
      'Resposta inválida do servidor. Confirme se a API de login está iniciada.'
    )
  if (!response.ok)
    throw new Error(result.message || 'Não foi possível concluir o pedido.')
  return result
}

async function loadStudents() {
  loading.value = true
  errorMessage.value = ''
  try {
    const [studentResult, guardianResult, routeResult] = await Promise.all([
      request('/api/students'),
      request('/api/guardians'),
      request('/api/routes')
    ])
    students.value = studentResult.students
    guardians.value = guardianResult.guardians
    routes.value = routeResult.routes
  } catch (error) {
    errorMessage.value =
      error.message ||
      'Não foi possível carregar os alunos. Confirme se a API está em execução.'
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingId.value = null
  form.value = emptyStudent()
  errorMessage.value = ''
  dialogError.value = ''
  formDialog.value = true
}

function openEdit(student) {
  editingId.value = student.id
  form.value = { ...emptyStudent(), ...student }
  errorMessage.value = ''
  dialogError.value = ''
  formDialog.value = true
}

async function saveStudent() {
  saving.value = true
  errorMessage.value = ''
  try {
    const isEditing = editingId.value !== null
    await request(
      isEditing ? `/api/students/${editingId.value}` : '/api/students',
      {
        method: isEditing ? 'PUT' : 'POST',
        body: JSON.stringify(form.value)
      }
    )
    formDialog.value = false
    successMessage.value = isEditing
      ? 'Os dados do aluno foram atualizados.'
      : 'Aluno adicionado com sucesso.'
    await loadStudents()
  } catch (error) {
    dialogError.value = error.message || 'Não foi possível guardar o aluno.'
  } finally {
    saving.value = false
  }
}

function confirmDelete(student) {
  selectedStudent.value = student
  dialogError.value = ''
  deleteDialog.value = true
}

async function deleteStudent() {
  if (!selectedStudent.value) return
  deleting.value = true
  errorMessage.value = ''
  try {
    await request(`/api/students/${selectedStudent.value.id}`, {
      method: 'DELETE'
    })
    deleteDialog.value = false
    successMessage.value = 'O aluno foi excluído.'
    selectedStudent.value = null
    await loadStudents()
  } catch (error) {
    dialogError.value = error.message || 'Não foi possível excluir o aluno.'
  } finally {
    deleting.value = false
  }
}
</script>

<style scoped>
.students-page {
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
.heading-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.page-kicker {
  color: #8b998f;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 1.25px;
}
.page-heading h1 {
  margin: 7px 0 5px;
  color: #26392f;
  font-size: 26px;
  font-weight: 720;
  letter-spacing: -0.9px;
}
.page-heading p {
  margin: 0;
  color: #87938b;
  font-size: 11px;
}
.add-button,
.save-button {
  min-height: 40px;
  padding: 0 14px;
  border-radius: 9px;
  color: #fff;
  background: #214e3d;
  font-size: 10px;
  font-weight: 650;
}
.guardians-link {
  color: #51734c;
  font-size: 10px;
}
.feedback {
  margin: 0 0 14px;
  font-size: 11px;
}
.feedback-error {
  border: 1px solid #f0d3ce;
  color: #9a4235;
  background: #fff5f3;
}
.feedback-success {
  border: 1px solid #d9e8ca;
  color: #42653c;
  background: #f3f8ed;
}
.dialog-error {
  margin: 12px 18px 0;
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 17px;
}
.summary-card {
  display: grid;
  grid-template-columns: 38px 1fr;
  grid-template-rows: auto auto;
  align-items: center;
  column-gap: 11px;
  padding: 14px 15px;
  border-color: #e8ece7;
  border-radius: 11px;
  background: #fff;
}
.summary-icon {
  display: grid;
  grid-row: span 2;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 11px;
  font-size: 18px;
}
.summary-icon.green {
  color: #5d813d;
  background: #eff5e7;
}
.summary-icon.blue {
  color: #507897;
  background: #edf4f8;
}
.summary-icon.yellow {
  color: #a18034;
  background: #faf5e5;
}
.summary-label {
  color: #829087;
  font-size: 9px;
}
.summary-card strong {
  color: #293b31;
  font-size: 18px;
  line-height: 1.2;
}
.list-card {
  overflow: hidden;
  border-color: #e8ece7;
  border-radius: 12px;
  background: #fff;
}
.list-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 17px 18px 14px;
}
.list-toolbar h2 {
  margin: 0 0 4px;
  color: #2d3d33;
  font-size: 13px;
  font-weight: 700;
}
.list-toolbar p {
  margin: 0;
  color: #9aa49d;
  font-size: 9px;
}
.search-input {
  width: min(100%, 250px);
}
.search-input :deep(.q-field__control) {
  border-radius: 8px;
}
.search-input :deep(.q-field__native),
.search-input :deep(.q-field__prepend) {
  color: #758279;
  font-size: 10px;
}
.students-table :deep(thead tr th) {
  height: 38px;
  color: #929e95;
  background: #fafbf9;
  font-size: 8px;
  font-weight: 750;
  letter-spacing: 0.65px;
}
.students-table :deep(tbody td) {
  height: 60px;
  color: #58665d;
  font-size: 10px;
}
.student-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 190px;
}
.student-avatar {
  color: #557342;
  background: #eef4e7;
  font-size: 10px;
  font-weight: 700;
}
.student-cell > span,
.guardian-cell {
  display: grid;
  gap: 4px;
}
.student-cell strong,
.guardian-cell strong {
  color: #3b4a40;
  font-size: 10px;
  font-weight: 650;
}
.student-cell small,
.guardian-cell small {
  color: #9ba59e;
  font-size: 8px;
}
.class-pill {
  padding: 5px 8px;
  border-radius: 6px;
  color: #607747;
  background: #f1f5e9;
  font-size: 9px;
}
.muted-value {
  color: #a6afa9;
  font-size: 9px;
}
.empty-state {
  display: grid;
  justify-items: center;
  width: 100%;
  padding: 30px 15px;
  color: #87938b;
  text-align: center;
}
.empty-state > .q-icon {
  color: #9bb27a;
  font-size: 29px;
}
.empty-state strong {
  margin-top: 11px;
  color: #45544a;
  font-size: 11px;
}
.empty-state span {
  margin-top: 5px;
  font-size: 9px;
}
.empty-state .q-btn {
  margin-top: 9px;
  font-size: 10px;
}
.student-dialog {
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
.form-fields {
  padding: 14px 24px 8px;
}
.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 14px;
}
.wide-field {
  grid-column: 1 / -1;
}
.form-fields :deep(.q-field__control) {
  border-radius: 8px;
}
.form-fields :deep(.q-field__label),
.form-fields :deep(.q-field__native) {
  font-size: 11px;
}
.dialog-actions {
  padding: 12px 24px 20px;
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
@media (max-width: 720px) {
  .students-page {
    padding: 22px 18px 40px;
  }
  .summary-grid {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .summary-card {
    grid-template-columns: 36px 1fr auto;
    grid-template-rows: auto;
  }
  .summary-icon {
    grid-row: auto;
    width: 34px;
    height: 34px;
  }
  .summary-card strong {
    grid-column: 3;
    grid-row: 1;
  }
  .list-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }
  .search-input {
    width: 100%;
  }
}
@media (max-width: 520px) {
  .page-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .heading-actions {
    width: 100%;
    justify-content: space-between;
  }
  .page-heading h1 {
    font-size: 23px;
  }
  .add-button {
    min-height: 36px;
    padding: 0 9px;
    font-size: 9px;
  }
  .add-button :deep(.q-icon) {
    font-size: 15px;
  }
  .field-grid {
    grid-template-columns: 1fr;
  }
  .wide-field {
    grid-column: auto;
  }
  .dialog-heading {
    padding-right: 17px;
    padding-left: 17px;
  }
  .form-fields {
    padding-right: 17px;
    padding-left: 17px;
  }
  .dialog-actions {
    padding-right: 17px;
    padding-left: 17px;
  }
}
</style>
