# Setup — Publicação automática no Instagram e Facebook

Tempo estimado: 20–30 minutos (uma vez só).

---

## O que você vai precisar

| Serviço | Uso | Custo |
|---------|-----|-------|
| Instagram Business | Conta do negócio | Grátis |
| Página do Facebook | Vinculada ao Instagram | Grátis |
| Meta Developer App | Gera o token de acesso | Grátis |
| Cloudinary | Hospeda as imagens temporariamente | Grátis (25GB/mês) |

---

## Parte 1 — Cloudinary (hospedagem das imagens)

O Instagram exige URL pública pra receber as fotos via API. O Cloudinary faz isso.

### 1.1 Criar conta
1. Acesse [cloudinary.com](https://cloudinary.com)
2. Clique em **Sign Up for Free**
3. Preencha com email e senha
4. Confirme o email

### 1.2 Pegar as credenciais
1. Faça login → vá em **Dashboard** (página inicial)
2. Você vai ver três valores:
   - **Cloud name** → ex: `dxyz123abc`
   - **API Key** → ex: `123456789012345`
   - **API Secret** → ex: `abcDEFghiJKLmnoPQR`
3. Copie os três e guarde — vai entrar no `.env`

---

## Parte 2 — Meta Developer App

### 2.1 Criar o App
1. Acesse [developers.facebook.com/apps](https://developers.facebook.com/apps)
2. Clique em **Criar app**
3. Escolha **Outros** → **Próximo**
4. Escolha tipo **Negócios** → **Próximo**
5. Dê um nome (ex: `LuxVision Poster`) → **Criar app**

### 2.2 Adicionar produto Instagram
1. No painel do app, vá em **Adicionar produto**
2. Encontre **Instagram Graph API** → clique em **Configurar**

### 2.3 Conectar sua conta Instagram Business
> Seu Instagram já precisa estar em modo Business (não pessoal).
> Se ainda não estiver: Instagram → Configurações → Conta → Mudar para conta profissional → Empresa

1. Ainda no painel do app Meta, vá em **Instagram Graph API → Configurações básicas**
2. Em **Usuários do Instagram**, adicione sua conta @luxvisionhc
3. Clique em **Adicionar conta do Instagram** e autorize

### 2.4 Conectar a Página do Facebook
> Você precisa ter uma Página do Facebook para a Lux Vision.
> Se não tem: facebook.com → Criar → Página.

1. Em **Configurações básicas** do app → **Adicionar Página**
2. Selecione a Página da Lux Vision

### 2.5 Gerar o Page Access Token
1. Vá no [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Selecione seu app no dropdown superior direito
3. Em **User or Page**, selecione a **Página da Lux Vision**
4. Em permissões, adicione:
   - `instagram_basic`
   - `instagram_content_publish`
   - `pages_read_engagement`
   - `pages_manage_posts`
5. Clique em **Gerar Token de Acesso**
6. Autorize as permissões pedidas
7. Copie o token gerado (começa com `EAABsbCS...`)

> ⚠️ Esse token expira em 60 dias. Pra transformar em token de longa duração (nunca expira), veja o Passo 2.6.

### 2.6 Token de longa duração (recomendado)
Rode esse curl no terminal (ou use o Graph API Explorer):

```
GET https://graph.facebook.com/v19.0/oauth/access_token
  ?grant_type=fb_exchange_token
  &client_id={app-id}
  &client_secret={app-secret}
  &fb_exchange_token={short-lived-token}
```

Ou use o Graph API Explorer → **Exchange token** → troca por token longo.

O novo token dura ~60 dias mas pode ser renovado. Salve no `.env`.

### 2.7 Pegar o Page ID
1. Vá na sua Página do Facebook
2. **Sobre** → role pra baixo até encontrar o **ID da Página** (número longo)
3. Ou: Graph API Explorer → `GET /me?fields=id,name` com token da Página → veja o `id`

### 2.8 Pegar o Instagram User ID
1. Graph API Explorer com o token da página
2. Query: `GET /{page-id}?fields=instagram_business_account`
3. O valor de `id` dentro de `instagram_business_account` é o seu `META_IG_USER_ID`

---

## Parte 3 — Preencher o .env

Copie o arquivo `.env.example` para `.env`:

```
copy .env.example .env
```

Abra o `.env` e preencha:

```
CLOUDINARY_CLOUD_NAME=seu-cloud-name
CLOUDINARY_API_KEY=sua-api-key
CLOUDINARY_API_SECRET=seu-api-secret

META_PAGE_ACCESS_TOKEN=EAABsbCS...token-longo...
META_PAGE_ID=123456789012345
META_IG_USER_ID=987654321098765
```

---

## Parte 4 — Testar

Rode no terminal (dentro da pasta MazyOS):

```
node --env-file=.env scripts/postar-instagram.js "marketing/conteudo/carrossel-apresentacao-2026-06-05"
```

Se tudo estiver certo, o carrossel vai aparecer no @luxvisionhc em alguns segundos.

---

## Problemas comuns

| Erro | Causa provável | Solução |
|------|---------------|---------|
| `OAuthException: Invalid OAuth token` | Token expirado ou errado | Gerar novo token no Graph API Explorer |
| `Error: Media creation failed` | Imagem não acessível | Checar se o upload no Cloudinary funcionou |
| `Unsupported post request` | Conta não é Business | Converter Instagram pra Business |
| `Permission denied` | Falta permissão no app | Adicionar permissão no Graph API Explorer e gerar novo token |
| `CLOUDINARY_*` missing | Variáveis não preenchidas | Conferir o `.env` |
