# API pública gratuita para o APK

Esta configuração usa um serviço web gratuito no Render e uma base TiDB Cloud
Starter compatível com o protocolo MySQL. O APK passa a chamar a API por HTTPS;
os dados ficam na base gerida, não no armazenamento temporário do serviço web.

## Limites do plano gratuito

- O TiDB Cloud Starter MySQL inclui até 5 GiB de dados em linhas e 50 milhões
  de Request Units por mês. Ao atingir a quota, novas ligações podem ser
  recusadas até a quota mensal reiniciar.
- O Render suspende o serviço gratuito depois de 15 minutos sem tráfego. A
  primeira chamada após esse período pode levar cerca de um minuto.
- O Render pode suspender serviços gratuitos que iniciem um volume invulgarmente
  alto de tráfego externo, incluindo ligações a bases externas. Acompanhe o uso
  no painel dos dois fornecedores.

## 1. Criar a base de dados

1. Crie uma conta no [TiDB Cloud](https://tidbcloud.com/) e crie um recurso
   **Starter** no modo **MySQL Compatible**. Mantenha o limite de gastos em zero.
2. Na consola do recurso, abra **Connect** e copie o host, a porta, o nome de
   utilizador com o prefixo gerado e a palavra-passe.
3. Crie a base `carrinha_escolar` e importe o esquema e os dados do MySQL que a
   aplicação usa atualmente. O servidor cria algumas tabelas auxiliares, mas
   precisa que as tabelas principais já existam.
4. Autorize no TiDB as ligações externas necessárias. Se ativar uma lista de IPs
   permitidos, use os intervalos de saída do Render para a região escolhida.
5. O TiDB exige TLS. A configuração da API ativa-o com `DB_SSL=true`.

## 2. Criar o serviço da API

1. Envie este repositório para uma conta GitHub ou GitLab sua.
2. No [Render](https://render.com/), escolha **New → Blueprint** e ligue o
   repositório. O ficheiro `render.yaml` cria a API no plano **Free**.
3. Na criação, preencha `DB_HOST`, `DB_USER`, `DB_PASSWORD` e `DB_NAME` com os
   dados do TiDB. `DB_PORT` deve ser `4000` e `DB_SSL` deve permanecer `true`.
4. Depois do deploy, abra `https://<nome-do-serviço>.onrender.com/health`.
   Uma resposta `{"ok":true}` confirma que a API está acessível.

Não coloque a palavra-passe da base no repositório, no APK ou em variáveis
`VITE_*`. O Render guarda as credenciais no painel do serviço.

## 3. Gerar o APK apontado para a API pública

No PowerShell, na pasta do projeto, use o endereço HTTPS do serviço:

```powershell
$env:VITE_API_BASE_URL = 'https://<nome-do-serviço>.onrender.com/api'
npm.cmd run build
npx.cmd cap sync android
```

Depois gere o APK debug:

```powershell
Set-Location android
./gradlew.bat assembleDebug
```

O APK fica em `android/app/build/outputs/apk/debug/app-debug.apk`. Essa URL
pública é incluída no APK; as credenciais da base de dados ficam apenas no
servidor.

## Estado da base MySQL local

O projecto esta ligado a um MySQL local com os dados operacionais actuais. O
ficheiro `deploy/mysql-schema.sql` exporta somente a estrutura das 13 tabelas;
nao inclui registos de alunos, encarregados ou contas. Crie primeiro essa
estrutura na base remota e depois migre os dados do MySQL local por um canal
seguro. Nao copie a tabela `sessions`: os utilizadores terao de iniciar sessao
novamente no servico publicado.

## 4. Abrir a aplicacao no navegador de qualquer telefone

O Blueprint do Render tambem publica o site estatico `carrinha-escolar-web` em
`https://carrinha-escolar-web.onrender.com`. Depois de ligar o repositorio ao
Render, o mesmo deploy cria a API e o site. Abra esse endereco no Android ou
iPhone; nao e preciso instalar um APK.

O site e compilado com `VITE_API_BASE_URL` a apontar para a API publica e o
servidor aceita a origem web configurada em `CORS_ORIGINS`. Se mudar o nome do
servico, usar um dominio proprio ou se o Render acrescentar um sufixo por
conflito de nome, actualize ambos os enderecos no `render.yaml` e sincronize o
Blueprint.

Para publicar, o codigo precisa estar num repositorio GitHub ou GitLab ligado ao
Render. Tambem e necessario criar/configurar a base MySQL gerida e fornecer as
variaveis `DB_HOST`, `DB_USER`, `DB_PASSWORD` e `DB_NAME` no painel; nunca grave
essas credenciais no repositorio. A API espera que as tabelas principais e os
dados existentes ja tenham sido importados para essa base.

O endereco do site pode ser guardado no ecra inicial do telefone pelo menu do
navegador. O Render Free pode suspender a API quando fica sem uso; por isso, a
primeira abertura apos algum tempo pode demorar enquanto o servidor acorda.
