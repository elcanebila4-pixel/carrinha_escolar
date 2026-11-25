<template>
  <q-layout view="lHh Lpr lFf">
    <q-page-container>
      <q-page class="login-page">
        <section class="login-card">
          <main class="form-panel">
            <div class="form-content">
              <router-link to="/" class="mobile-home"
                >← Voltar ao início</router-link
              >
              <div class="brand-heading">
                <div class="brand-mark"
                  ><q-icon name="directions_bus" size="25px"
                /></div>
                <div class="brand-name">Carrinha <span>Escolar</span></div>
              </div>
              <div class="welcome-label">ÁREA DA ESCOLA</div>
              <h2>Entre na sua conta</h2>
              <p class="form-subtitle">Aceda à gestão do transporte escolar.</p>

              <q-banner
                v-if="loginError"
                dense
                rounded
                class="login-error"
                role="alert"
              >
                <template #avatar><q-icon name="error_outline" /></template>
                {{ loginError }}
              </q-banner>

              <q-form class="login-form" @submit="onSubmit">
                <label class="field-label" for="email">E-mail</label>
                <q-input
                  id="email"
                  v-model="email"
                  type="email"
                  placeholder="nome@exemplo.com"
                  outlined
                  autocomplete="email"
                  :rules="[value => !!value || 'Informe o seu e-mail']"
                  lazy-rules
                >
                  <template #prepend><q-icon name="mail_outline" /></template>
                </q-input>

                <div class="password-heading">
                  <label class="field-label" for="password"
                    >Palavra-passe</label
                  >
                  <a href="#" @click.prevent="showRecovery = true"
                    >Esqueceu-se?</a
                  >
                </div>
                <q-input
                  id="password"
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  placeholder="Introduza a sua palavra-passe"
                  outlined
                  autocomplete="current-password"
                  :rules="[value => !!value || 'Informe a sua palavra-passe']"
                  lazy-rules
                >
                  <template #prepend><q-icon name="lock_outline" /></template>
                  <template #append>
                    <q-icon
                      :name="showPassword ? 'visibility_off' : 'visibility'"
                      class="cursor-pointer"
                      @click="showPassword = !showPassword"
                    />
                  </template>
                </q-input>

                <q-checkbox
                  v-model="rememberMe"
                  label="Manter sessão iniciada"
                  color="primary"
                />
                <q-btn
                  class="submit-button"
                  type="submit"
                  label="Entrar"
                  :loading="loading"
                  :disable="loading"
                  unelevated
                  no-caps
                />
                <q-btn
                  class="local-button"
                  type="button"
                  label="Acessar dados deste telefone"
                  icon="smartphone"
                  outline
                  no-caps
                  @click="enterLocalMode"
                />
                <p class="local-note"
                  >O modo local guarda os dados apenas neste telefone e não
                  sincroniza com o servidor.</p
                >
                <p class="help-copy">
                  Precisa de ajuda?
                  <a href="mailto:suporte@carrinhaescolar.co.mz"
                    >Contacte o suporte</a
                  >
                </p>
              </q-form>
            </div>
            <div class="copyright"
              >© {{ new Date().getFullYear() }} Carrinha Escolar</div
            >
          </main>
        </section>

        <q-dialog v-model="showRecovery">
          <q-card class="recovery-card">
            <q-card-section>
              <div class="text-h6">Recuperar acesso</div>
              <div class="text-body2 q-mt-sm"
                >Contacte o suporte para recuperar a sua palavra-passe.</div
              >
            </q-card-section>
            <q-card-actions align="right">
              <q-btn
                v-close-popup
                flat
                label="Fechar"
                color="primary"
                no-caps
              />
            </q-card-actions>
          </q-card>
        </q-dialog>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { iniciarSessaoLocal } from '../services/database.js'
import { apiFetch } from '../services/api-url.js'

const router = useRouter()
const email = ref('')
const password = ref('')
const rememberMe = ref(false)
const showPassword = ref(false)
const showRecovery = ref(false)
const loading = ref(false)
const loginError = ref('')

async function enterLocalMode() {
  iniciarSessaoLocal()
  await router.push('/dashboard')
}

async function onSubmit() {
  loading.value = true
  loginError.value = ''
  try {
    const response = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        email: email.value,
        password: password.value,
        rememberMe: rememberMe.value
      })
    })
    const result = await response.json().catch(() => null)
    if (!result) throw new TypeError('Resposta inválida do servidor de login.')
    if (!response.ok)
      throw new Error(result.message || 'Não foi possível iniciar sessão.')
    if (result.token) {
      localStorage.setItem('carrinha_api_session_token', result.token)
    } else {
      localStorage.removeItem('carrinha_api_session_token')
    }
    const destinations = {
      admin: '/dashboard',
      guardian: '/familia',
      driver: '/motorista'
    }
    await router.push(destinations[result.user.role] || '/dashboard')
  } catch (error) {
    loginError.value =
      error instanceof TypeError
        ? 'Não foi possível contactar o servidor de login. Inicie a API com “npm run auth:server” e tente novamente.'
        : error.message || 'Não foi possível iniciar sessão. Tente novamente.'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background:
    radial-gradient(ellipse at 15% 12%, #e9f0de 0, transparent 35%), #f5f7f4;
  font-family: Inter, 'Segoe UI', sans-serif;
}
.login-card {
  display: block;
  width: min(100%, 510px);
  overflow: hidden;
  border: 1px solid #e3eae3;
  border-radius: 22px;
  background: #fff;
  box-shadow: 0 28px 90px #203b2b18;
}
.login-story {
  position: relative;
  display: flex;
  min-height: 660px;
  flex-direction: column;
  overflow: hidden;
  padding: 36px 40px 28px;
  color: #f4f7f0;
  background: linear-gradient(145deg, #183d34, #285c48 78%, #39735a);
}
.story-brand {
  display: flex;
  align-items: center;
  gap: 11px;
  color: inherit;
  text-decoration: none;
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.6px;
}
.story-mark {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 13px;
  color: #244f42;
  background: #d6ed9c;
  font-size: 22px;
}
.story-plus {
  color: #d6ed9c;
}
.story-copy {
  position: relative;
  z-index: 1;
  margin-top: 74px;
  max-width: 390px;
}
.story-kicker {
  display: flex;
  align-items: center;
  gap: 9px;
  color: #d5e3d9;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 1.2px;
}
.story-kicker i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #d6ed9c;
  box-shadow: 0 0 0 5px #d6ed9c24;
}
.story-copy h1 {
  margin: 20px 0 12px;
  font-size: clamp(30px, 3vw, 40px);
  line-height: 1.08;
  letter-spacing: -1.7px;
  font-weight: 700;
}
.story-copy p {
  max-width: 340px;
  margin: 0;
  color: #c4d6cb;
  font-size: 14px;
  line-height: 1.7;
}
.story-visual {
  position: relative;
  flex: 1;
  min-height: 230px;
  margin: 10px -15px 0;
}
.story-visual svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  filter: drop-shadow(0 15px 20px #102d2430);
}
.visual-grid {
  position: absolute;
  inset: 0;
  opacity: 0.16;
  background-image:
    linear-gradient(#ffffff28 1px, transparent 1px),
    linear-gradient(90deg, #ffffff28 1px, transparent 1px);
  background-size: 32px 32px;
  mask-image: linear-gradient(transparent, #000 20%, #000 80%, transparent);
}
.route-chip {
  position: absolute;
  left: 2%;
  bottom: 18%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid #ffffff22;
  border-radius: 12px;
  color: #eff5ec;
  background: #ffffff14;
  font-size: 10px;
  backdrop-filter: blur(10px);
}
.route-chip .q-icon {
  color: #d6ed9c;
  font-size: 16px;
}
.route-chip span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #a6de91;
}
.visual-pin {
  position: absolute;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid #ffffff50;
  border-radius: 10px;
  color: #d6ed9c;
  background: #ffffff18;
  backdrop-filter: blur(8px);
}
.pin-one {
  top: 20%;
  right: 16%;
}
.pin-two {
  bottom: 23%;
  right: 8%;
}
.story-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #bed0c4;
  font-size: 10px;
}
.story-foot span:first-child {
  display: flex;
  align-items: center;
  gap: 7px;
}
.story-foot .q-icon {
  color: #d6ed9c;
  font-size: 16px;
}
.mobile-home {
  display: none;
  margin-bottom: 24px;
  color: #5c7968;
  font-size: 12px;
  text-decoration: none;
}
.login-card a:focus-visible {
  outline: 3px solid #b5d879;
  outline-offset: 4px;
  border-radius: 4px;
}
.login-form :deep(.q-field__control) {
  min-height: 52px;
}
.login-form :deep(.q-field--focused .q-field__control) {
  box-shadow: 0 0 0 4px #eaf2e2;
}
.submit-button {
  box-shadow: 0 8px 18px #9dbb5b30;
}
.submit-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 11px 22px #9dbb5b3b;
}
.local-button:hover {
  background: #f8faf6;
}
.brand-heading {
  justify-content: center;
}
.welcome-label,
.form-content h2,
.form-subtitle {
  text-align: center;
}
.form-content h2 {
  font-size: 32px;
}
.form-panel {
  min-height: 560px;
  padding: 42px 46px 24px;
}
.form-content {
  max-width: 360px;
}
.copyright {
  text-align: center;
  max-width: 360px;
  width: 100%;
  margin: 22px auto 0;
}
.brand-heading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 40px;
}
.brand-mark {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 13px;
  color: #19392f;
  background: #d2f179;
}
.brand-name {
  color: #1d3128;
  font-size: 16px;
  font-weight: 750;
  letter-spacing: -0.4px;
}
.brand-name span {
  color: #397258;
}
.form-panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 560px;
  padding: 42px 46px 24px;
}
.form-content {
  width: 100%;
  max-width: 370px;
  margin: auto;
}
.welcome-label {
  color: #758273;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 1.5px;
  text-align: center;
}
.form-content h2 {
  margin: 12px 0 7px;
  color: #1d3128;
  font-size: 30px;
  letter-spacing: -1.1px;
  text-align: center;
}
.form-subtitle {
  margin: 0 0 32px;
  color: #77847e;
  font-size: 14px;
  text-align: center;
}
.login-error {
  margin: -14px 0 20px;
  border: 1px solid #f0d3ce;
  border-radius: 9px;
  color: #9a4235;
  background: #fff5f3;
  font-size: 12px;
  line-height: 1.5;
}
.field-label {
  display: block;
  margin: 0 0 8px;
  color: #344c42;
  font-size: 13px;
  font-weight: 650;
}
.login-form :deep(.q-field) {
  margin-bottom: 19px;
}
.login-form :deep(.q-field--outlined .q-field__control) {
  border-radius: 9px;
}
.login-form :deep(.q-field__prepend),
.login-form :deep(.q-field__append) {
  color: #8a9b93;
}
.password-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
a {
  color: #397258;
  font-size: 12px;
  font-weight: 650;
  text-decoration: none;
}
.login-form :deep(.q-checkbox) {
  margin: -6px 0 20px -10px;
  color: #65776e;
  font-size: 13px;
}
.submit-button {
  width: 100%;
  min-height: 48px;
  border-radius: 9px;
  color: #19392f;
  background: #d2f179;
  font-weight: 750;
}
.submit-button:hover {
  background: #c5e76a;
}
.local-button {
  width: 100%;
  min-height: 46px;
  margin-top: 10px;
  border-color: #d9e3dc;
  border-radius: 9px;
  color: #315b47;
  font-weight: 650;
}
.local-note {
  margin: 8px 0 0;
  color: #89968e;
  font-size: 10px;
  line-height: 1.5;
  text-align: center;
}
.help-copy {
  margin: 23px 0 0;
  color: #7b8982;
  text-align: center;
  font-size: 12px;
}
.help-copy a {
  font-size: inherit;
}
.copyright {
  margin-top: 25px;
  color: #98a49e;
  text-align: center;
  font-size: 11px;
}
.recovery-card {
  width: min(100%, 380px);
  border-radius: 14px;
}
@media (max-width: 700px) {
  .login-page {
    padding: 18px;
  }
  .login-card {
    display: block;
    width: min(100%, 470px);
    border-radius: 15px;
  }
  .mobile-home {
    display: inline-block;
  }
  .form-panel {
    min-height: 0;
    padding: 30px 26px 20px;
  }
  .brand-heading {
    justify-content: center;
    margin-bottom: 34px;
  }
  .welcome-label,
  .form-content h2,
  .form-subtitle {
    text-align: center;
  }
  .form-content h2 {
    font-size: 25px;
  }
  .copyright {
    text-align: center;
  }
  .form-content h2 {
    font-size: 25px;
  }
}
</style>
