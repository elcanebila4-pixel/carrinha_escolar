# Configurar o Google Maps

O mapa da aplicação usa a Google Maps JavaScript API. Para o ativar:

1. No Google Cloud Console, crie ou escolha um projeto, ative **Maps JavaScript API** e configure a faturação.
2. Crie uma chave de API. Restrinja-a ao site da aplicação (por exemplo, `http://localhost:9000/*` durante o desenvolvimento e o domínio real em produção) e limite a chave à **Maps JavaScript API**.
3. No ficheiro `.env` da raiz do projeto, adicione:

   ```env
   VITE_GOOGLE_MAPS_API_KEY=cole_a_chave_aqui
   ```

4. Reinicie `npm run dev` para o Vite carregar a variável.

A chave `VITE_` é incluída no JavaScript enviado ao navegador. As restrições de domínio e de API são necessárias; não use uma chave sem restrições em produção.
