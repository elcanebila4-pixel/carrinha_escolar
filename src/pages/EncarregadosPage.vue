<template>
  <q-page class="guardians-page">
    <header class="page-heading">
      <div>
        <div class="eyebrow">GESTÃO ESCOLAR</div>
        <h1>Encarregados</h1>
        <p>Guarde os contactos das famílias e associe-os aos alunos.</p>
        <p v-if="localMode" class="local-warning"
          >A criação de contas requer ligação ao servidor.</p
        >
      </div>
      <q-btn
        unelevated
        no-caps
        icon="add"
        label="Adicionar encarregado"
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

    <section class="summary-grid">
      <q-card flat bordered class="summary-card"
        ><q-icon name="family_restroom" class="summary-icon green" /><span
          >Encarregados registados</span
        ><strong>{{ guardians.length }}</strong></q-card
      >
      <q-card flat bordered class="summary-card"
        ><q-icon name="link" class="summary-icon blue" /><span
          >Alunos associados</span
        ><strong>{{ linkedStudents }}</strong></q-card
      >
      <q-card flat bordered class="summary-card"
        ><q-icon name="alternate_email" class="summary-icon gold" /><span
          >Com e-mail</span
        ><strong>{{ withEmail }}</strong></q-card
      >
    </section>

    <q-card flat bordered class="list-card">
      <div class="list-toolbar">
        <div
          ><h2>Lista de encarregados</h2
          ><p
            >{{ guardians.length }}
            {{ guardians.length === 1 ? 'registo' : 'registos' }}</p
          ></div
        >
        <q-input
          v-model="search"
          outlined
          dense
          clearable
          placeholder="Pesquisar encarregado..."
          class="search-input"
          aria-label="Pesquisar encarregados"
        >
          <template #prepend><q-icon name="search" /></template>
        </q-input>
      </div>

      <q-table
        flat
        :rows="filteredGuardians"
        :columns="columns"
        row-key="id"
        :loading="loading"
        :pagination="{ rowsPerPage: 10 }"
        no-data-label="Ainda não há encarregados registados"
        no-results-label="Nenhum encarregado corresponde à pesquisa"
      >
        <template #body-cell-name="props">
          <q-td :props="props"
            ><div class="person-cell"
              ><q-avatar size="35px" class="person-avatar">{{
                initials(props.row.name)
              }}</q-avatar
              ><span
                ><strong>{{ props.row.name }}</strong
                ><small>{{
                  props.row.relationship || 'Encarregado de educação'
                }}</small></span
              ></div
            ></q-td
          >
        </template>
        <template #body-cell-phone="props">
          <q-td :props="props"
            ><a
              v-if="props.row.phone"
              :href="`tel:${props.row.phone}`"
              class="contact-link"
              ><q-icon name="call" /> {{ props.row.phone }}</a
            ><span v-else class="muted">—</span></q-td
          >
        </template>
        <template #body-cell-email="props">
          <q-td :props="props"
            ><a
              v-if="props.row.email"
              :href="`mailto:${props.row.email}`"
              class="contact-link"
              >{{ props.row.email }}</a
            ><span v-else class="muted">—</span></q-td
          >
        </template>
        <template #body-cell-student_count="props"
          ><q-td :props="props"
            ><span class="count-pill">{{
              props.row.student_count || 0
            }}</span></q-td
          ></template
        >
        <template #body-cell-account="props">
          <q-td :props="props" class="text-center">
            <q-icon
              v-if="props.row.has_account"
              name="verified_user"
              color="positive"
              size="18px"
            >
              <q-tooltip>Conta ativa</q-tooltip>
            </q-icon>
            <span v-else class="muted">Sem acesso</span>
          </q-td>
        </template>
        <template #body-cell-actions="props">
          <q-td :props="props" class="text-right">
            <q-btn
              v-if="!localMode && props.row.email && !props.row.has_account"
              flat
              round
              dense
              icon="person_add_alt"
              color="primary"
              aria-label="Criar acesso do encarregado"
              @click="openAccount(props.row)"
            />
            <q-btn
              flat
              round
              dense
              icon="edit"
              color="grey-7"
              aria-label="Editar encarregado"
              @click="openEdit(props.row)"
            />
            <q-btn
              flat
              round
              dense
              icon="delete_outline"
              color="negative"
              aria-label="Excluir encarregado"
              @click="confirmDelete(props.row)"
            />
          </q-td>
        </template>
        <template #no-data="{ message }">
          <div class="empty-state"
            ><q-icon name="family_restroom" /><strong>{{
              search ? 'Nenhum resultado' : 'Adicione o primeiro encarregado'
            }}</strong
            ><span>{{
              search
                ? message
                : 'Os contactos das famílias aparecerão nesta lista.'
            }}</span
            ><q-btn
              v-if="!search"
              flat
              no-caps
              icon="add"
              label="Adicionar encarregado"
              color="primary"
              @click="openCreate"
          /></div>
        </template>
      </q-table>
    </q-card>

    <q-dialog v-model="formDialog" persistent>
      <q-card class="form-dialog">
        <q-form @submit="saveGuardian">
          <q-banner
            v-if="dialogError"
            dense
            rounded
            class="message error-message dialog-message"
            role="alert"
            ><template #avatar><q-icon name="error_outline" /></template
            >{{ dialogError }}</q-banner
          >
          <q-card-section class="dialog-heading"
            ><div
              ><div class="eyebrow">CONTACTO DA FAMÍLIA</div
              ><h2>{{
                editingId ? 'Editar encarregado' : 'Adicionar encarregado'
              }}</h2
              ><p>O contacto pode ser associado a vários alunos.</p></div
            ><q-btn
              flat
              round
              dense
              icon="close"
              aria-label="Fechar"
              @click="formDialog = false"
          /></q-card-section>
          <q-card-section class="fields-grid">
            <q-input
              v-model="form.name"
              outlined
              dense
              label="Nome completo *"
              autocomplete="name"
              maxlength="160"
              :rules="[
                value => !!value?.trim() || 'Informe o nome do encarregado'
              ]"
              lazy-rules
            />
            <q-select
              v-model="form.relationship"
              outlined
              dense
              label="Grau de parentesco"
              :options="relationshipOptions"
              clearable
              use-input
              new-value-mode="add-unique"
            />
            <q-input
              v-model="form.phone"
              outlined
              dense
              type="tel"
              label="Telefone principal *"
              autocomplete="tel"
              maxlength="40"
              :rules="[value => !!value?.trim() || 'Informe um telefone']"
              lazy-rules
            />
            <q-input
              v-model="form.secondary_phone"
              outlined
              dense
              type="tel"
              label="Telefone alternativo"
              maxlength="40"
            />
            <q-input
              v-model="form.email"
              outlined
              dense
              type="email"
              label="E-mail"
              autocomplete="email"
              maxlength="160"
            />
            <q-input
              v-model="form.address"
              outlined
              dense
              label="Morada"
              autocomplete="street-address"
              maxlength="250"
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
          </q-card-section>
          <q-card-actions align="right" class="dialog-actions"
            ><q-btn
              flat
              no-caps
              label="Cancelar"
              color="grey-7"
              :disable="saving"
              @click="formDialog = false" /><q-btn
              unelevated
              no-caps
              :label="editingId ? 'Guardar alterações' : 'Guardar encarregado'"
              type="submit"
              class="primary-button"
              :loading="saving"
          /></q-card-actions>
        </q-form>
      </q-card>
    </q-dialog>

    <q-dialog v-model="deleteDialog">
      <q-card class="delete-dialog">
        <q-card-section
          ><div class="delete-icon"><q-icon name="delete_outline" /></div
          ><h2>Excluir encarregado?</h2
          ><p
            ><strong>{{ selectedGuardian?.name }}</strong> será removido. Os
            alunos associados serão mantidos, mas ficarão sem encarregado
            selecionado.</p
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
            @click="deleteGuardian"
        /></q-card-actions>
      </q-card>
    </q-dialog>
    <q-dialog v-model="accountDialog" persistent>
      <q-card class="form-dialog account-dialog">
        <q-form @submit="createAccount">
          <q-card-section class="dialog-heading">
            <div>
              <div class="eyebrow">ACESSO À ÁREA DA FAMÍLIA</div>
              <h2>Criar conta do encarregado</h2>
              <p>{{ selectedGuardian?.email }}</p>
            </div>
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
              >Partilhe a palavra-passe inicial diretamente com o encarregado.
              Ele poderá entrar com o e-mail indicado e esta palavra-passe.</p
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
  </q-page>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { obterSessaoLocal, requestLocalApi } from '../services/database.js'
import { apiFetch } from '../services/api-url.js'

const guardians = ref([])
const search = ref('')
const loading = ref(false)
const saving = ref(false)
const deleting = ref(false)
const formDialog = ref(false)
const deleteDialog = ref(false)
const editingId = ref(null)
const selectedGuardian = ref(null)
const errorMessage = ref('')
const successMessage = ref('')
const dialogError = ref('')
const accountDialog = ref(false)
const accountPassword = ref('')
const creatingAccount = ref(false)
const localMode = Boolean(obterSessaoLocal())
const relationshipOptions = [
  'Mãe',
  'Pai',
  'Avó',
  'Avô',
  'Tia',
  'Tio',
  'Tutor(a)',
  'Outro'
]
const form = ref(emptyGuardian())

const columns = [
  {
    name: 'name',
    label: 'ENCARREGADO',
    field: 'name',
    align: 'left',
    sortable: true
  },
  { name: 'phone', label: 'TELEFONE', field: 'phone', align: 'left' },
  { name: 'email', label: 'E-MAIL', field: 'email', align: 'left' },
  {
    name: 'student_count',
    label: 'ALUNOS',
    field: 'student_count',
    align: 'center',
    sortable: true
  },
  { name: 'account', label: 'ACESSO', field: 'has_account', align: 'center' },
  { name: 'actions', label: '', field: 'id', align: 'right' }
]
const filteredGuardians = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  if (!query) return guardians.value
  return guardians.value.filter(guardian =>
    [
      guardian.name,
      guardian.relationship,
      guardian.phone,
      guardian.secondary_phone,
      guardian.email
    ].some(value => value?.toLocaleLowerCase().includes(query))
  )
})
const linkedStudents = computed(() =>
  guardians.value.reduce(
    (total, guardian) => total + Number(guardian.student_count || 0),
    0
  )
)
const withEmail = computed(
  () => guardians.value.filter(guardian => guardian.email).length
)

onMounted(loadGuardians)

function emptyGuardian() {
  return {
    name: '',
    relationship: '',
    phone: '',
    secondary_phone: '',
    email: '',
    address: '',
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
      .toUpperCase() || 'E'
  )
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
async function loadGuardians() {
  loading.value = true
  errorMessage.value = ''
  try {
    guardians.value = (await request('/api/guardians')).guardians
  } catch (error) {
    errorMessage.value =
      error.message || 'Não foi possível carregar os encarregados.'
  } finally {
    loading.value = false
  }
}
function openCreate() {
  editingId.value = null
  form.value = emptyGuardian()
  dialogError.value = ''
  formDialog.value = true
}
function openEdit(guardian) {
  editingId.value = guardian.id
  form.value = { ...emptyGuardian(), ...guardian }
  dialogError.value = ''
  formDialog.value = true
}
function openAccount(guardian) {
  selectedGuardian.value = guardian
  accountPassword.value = ''
  dialogError.value = ''
  accountDialog.value = true
}
async function createAccount() {
  if (!selectedGuardian.value) return
  creatingAccount.value = true
  dialogError.value = ''
  try {
    await request(`/api/guardians/${selectedGuardian.value.id}/account`, {
      method: 'POST',
      body: JSON.stringify({ password: accountPassword.value })
    })
    accountDialog.value = false
    successMessage.value = `Acesso criado para ${selectedGuardian.value.email}.`
    await loadGuardians()
  } catch (error) {
    dialogError.value = error.message || 'Não foi possível criar o acesso.'
  } finally {
    creatingAccount.value = false
  }
}
async function saveGuardian() {
  saving.value = true
  dialogError.value = ''
  try {
    const editing = editingId.value !== null
    await request(
      editing ? `/api/guardians/${editingId.value}` : '/api/guardians',
      { method: editing ? 'PUT' : 'POST', body: JSON.stringify(form.value) }
    )
    formDialog.value = false
    successMessage.value = editing
      ? 'Os dados do encarregado foram atualizados.'
      : 'Encarregado adicionado com sucesso.'
    await loadGuardians()
  } catch (error) {
    dialogError.value =
      error.message || 'Não foi possível guardar o encarregado.'
  } finally {
    saving.value = false
  }
}
function confirmDelete(guardian) {
  selectedGuardian.value = guardian
  dialogError.value = ''
  deleteDialog.value = true
}
async function deleteGuardian() {
  if (!selectedGuardian.value) return
  deleting.value = true
  dialogError.value = ''
  try {
    await request(`/api/guardians/${selectedGuardian.value.id}`, {
      method: 'DELETE'
    })
    deleteDialog.value = false
    successMessage.value = 'O encarregado foi excluído.'
    selectedGuardian.value = null
    await loadGuardians()
  } catch (error) {
    dialogError.value =
      error.message || 'Não foi possível excluir o encarregado.'
  } finally {
    deleting.value = false
  }
}
</script>

<style scoped>
.guardians-page {
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
.page-heading .local-warning {
  margin-top: 6px;
  color: #a66f3f;
  font-size: 10px;
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
.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 17px;
}
.summary-card {
  display: grid;
  grid-template-columns: 38px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 14px 15px;
  border-color: #e8ece7;
  border-radius: 11px;
  background: #fff;
  color: #829087;
  font-size: 9px;
}
.summary-card strong {
  color: #293b31;
  font-size: 18px;
}
.summary-icon {
  display: grid;
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
.summary-icon.gold {
  color: #a18034;
  background: #faf5e5;
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
:deep(.q-table thead tr th) {
  height: 38px;
  color: #929e95;
  background: #fafbf9;
  font-size: 8px;
  font-weight: 750;
  letter-spacing: 0.65px;
}
:deep(.q-table tbody td) {
  height: 60px;
  color: #58665d;
  font-size: 10px;
}
.person-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 180px;
}
.person-avatar {
  color: #557342;
  background: #eef4e7;
  font-size: 10px;
  font-weight: 700;
}
.person-cell > span {
  display: grid;
  gap: 4px;
}
.person-cell strong {
  color: #3b4a40;
  font-size: 10px;
  font-weight: 650;
}
.person-cell small {
  color: #9ba59e;
  font-size: 8px;
}
.contact-link {
  color: #55754b;
  font-size: 9px;
  text-decoration: none;
}
.contact-link .q-icon {
  font-size: 13px;
}
.muted {
  color: #a6afa9;
  font-size: 9px;
}
.count-pill {
  display: inline-grid;
  min-width: 24px;
  height: 24px;
  place-items: center;
  border-radius: 7px;
  color: #5c7849;
  background: #f0f5e8;
  font-size: 9px;
  font-weight: 700;
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
.dialog-message {
  margin: 0 18px 12px;
}
.account-dialog {
  width: min(100%, 520px);
}
.account-hint {
  grid-column: 1 / -1;
  margin: -6px 0 0;
  color: #7b8980;
  font-size: 11px;
  line-height: 1.5;
}
@media (max-width: 720px) {
  .guardians-page {
    padding: 22px 18px 40px;
  }
  .summary-grid {
    grid-template-columns: 1fr;
    gap: 8px;
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
