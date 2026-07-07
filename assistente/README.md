# Assistente de voz — "Jarvis" da Lux Vision

Um assistente que **escuta sua voz**, entende com o Claude (usando toda a memória do
MazyOS sobre o negócio) e **responde falando**. Roda local, no seu navegador.

## Como rodar (3 passos)

1. **Pegar uma chave da Anthropic** (uma vez só)
   - Entre em https://console.anthropic.com → **API Keys** → cria uma chave.
   - Precisa ter créditos na conta (é barato pra uso pessoal — centavos por conversa).
   - Abra o arquivo `.env` na raiz do MazyOS e cole:
     ```
     ANTHROPIC_API_KEY=sk-ant-...
     ```

2. **Instalar a dependência** (uma vez só) — na pasta do MazyOS:
   ```
   npm install
   ```

3. **Ligar o assistente:**
   ```
   npm run assistente
   ```
   Depois abra **http://localhost:5173** no **Chrome** ou **Edge**
   (são os que reconhecem voz), toque no microfone e fale.

## Dicas

- **Modo conversa:** marque a caixinha pra ele voltar a escutar sozinho depois de responder — aí é só ir falando.
- **Sem microfone?** Dá pra digitar no campo de baixo — funciona igual.
- Ele responde curto porque é feito pra voz. Peça "me explica melhor" quando quiser detalhe.

## Configuração (opcional, no `.env`)

| Variável | Padrão | Pra quê |
|---|---|---|
| `ASSISTENTE_MODELO` | `claude-sonnet-5` | Modelo do cérebro. Rápido, ideal pra voz. |
| `ASSISTENTE_PORTA` | `5173` | Porta do servidor local. |

O assistente lê o contexto do negócio de `_memoria/` e `identidade/design-guide.md`
automaticamente — então quanto mais atualizada a memória, melhor ele responde.

## O que ele ainda NÃO faz

Hoje ele conversa e ajuda a pensar/escrever. Ainda **não executa ações sozinho**
(postar no Instagram, gerar carrossel). Esse é o próximo passo: ligar a voz nas
skills que o MazyOS já tem (`/carrossel`, `/aprovar-post`).
