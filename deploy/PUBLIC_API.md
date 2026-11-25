# API pública gratuita para o APK

Esta configuração usa um serviço web gratuito no Render e uma base TiDB Cloud
Starter compatível com o protocolo MySQL. O APK passa a chamar a API por HTTPS;
os dados ficam na base gerida, não no armazenamento temporário do serviço web.

## Limites do plano gratuito

- As primeiras cinco instâncias TiDB Cloud Starter MySQL da organização têm,
  cada uma, uma quota sem custo de 5 GiB de dados em linhas, 5 GiB de dados
  colunares e 50 milhões de Request Units (RUs) por mês. Com o limite mensal de
  gastos definido como zero, exceder a quota bloqueia novas ligações ou limita
  as existentes até à reposição mensal. Ativar gastos acima de zero exige um
  método de pagamento.
- O Render suspende o serviço gratuito depois de 15 minutos sem tráfego. A
  primeira chamada após esse período pode demorar cerca de um minuto. O sistema
  de ficheiros do serviço é temporário e perde alterações quando reinicia.
- O Render classifica os serviços gratuitos como adequados para testes e
  protótipos, não para produção. Também pode suspender um serviço gratuito que
  inicie um volume invulgarmente alto de tráfego externo, incluindo ligações à
  base de dados. Acompanhe uso e quotas nos dois painéis.

## 1. Criar a base de dados

1. Crie uma conta no [TiDB Cloud](https://tidbcloud.com/) e crie um recurso
   **Starter** no modo **MySQL Compatible**. Mantenha o limite de gastos em zero.
2. Na consola do recurso, abra **Connect** e copie o host, a porta, o nome de
   utilizador com o prefixo da instância e a palavra-passe. Use a porta `4000`.
3. Ative o **Public Endpoint** e crie a base `carrinha_escolar`. O Starter exige
   TLS nas ligações ao endpoint público.
4. Importe `deploy/mysql-schema.sql`. Esse ficheiro contém apenas a estrutura;
   não contém alunos, encarregados, contas nem outros registos. Migre os dados
   do MySQL local por um canal seguro, excluindo a tabela `sessions` para que
   todos voltem a iniciar sessão.
5. O endpoint público do TiDB permite todas as origens IP por omissão. Se
   restringir o acesso, autorize os intervalos de saída do serviço Render na
   região escolhida. O Render pode usar qualquer IP dos intervalos dessa região.

## 2. Criar o serviço da API

1. Envie este repositório para uma conta GitHub ou GitLab sua.
2. No [Render](https://render.com/), escolha **New → Blueprint** e ligue o
   repositório. O ficheiro `render.yaml` cria a API no plano **Free**.
3. Na criação, preencha `DB_HOST`, `DB_USER`, `DB_PASSWORD` e `DB_NAME` com os
   dados do TiDB. `DB_PORT` deve ser `4000` e `DB_SSL` deve permanecer `true`.
   `DB_USER` é o nome completo fornecido pelo TiDB, incluindo o prefixo da
   instância. O Node.js verifica TLS a partir da versão 1.2; `DB_SSL_CA` é
   opcional para TiDB Cloud Starter. Se precisar defini-lo, use o conteúdo PEM
   do certificado, não um caminho de ficheiro local. O Render define `PORT`
   automaticamente.
4. Depois do deploy, abra `https://<nome-do-serviço>.onrender.com/health`.
   Uma resposta `{"ok":true,"database":"connected"}` confirma que a API e a
   ligação à base de dados estão acessíveis.

Não coloque a palavra-passe da base no repositório, no APK ou em variáveis
`VITE_*`. O Render guarda as credenciais no painel do serviço.

Em produção, o servidor recusa iniciar se faltar uma variável de ligação, se
`DB_HOST` apontar para `localhost` ou se `DB_SSL` não estiver ativo. Assim, um
deploy sem a base remota configurada não usa por engano o MySQL do computador.

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
