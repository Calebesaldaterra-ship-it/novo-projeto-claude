# Aslam 🦁 — Assistente de voz da Lux Vision

Um assistente que **escuta sua voz**, entende usando toda a memória do MazyOS sobre o
negócio e **responde falando**. Roda local, no seu navegador.

## Dois jeitos de dar "cérebro" ao Aslam

A voz (ouvir + falar) é sempre grátis e local. O que muda é quem "pensa":

- **Claude (Anthropic)** — melhor qualidade, mas precisa de créditos (pago). Veja abaixo.
- **Ollama (IA local)** — grátis e offline, roda no seu PC. Qualidade menor, mas não custa nada.

O Aslam escolhe sozinho: se houver `ANTHROPIC_API_KEY` no `.env`, usa o Claude; senão, usa o Ollama.

### Usar o Ollama (grátis)
1. Instale o Ollama: https://ollama.com/download (ou `winget install Ollama.Ollama`).
2. Baixe um modelo: no terminal, `ollama pull llama3.2`.
3. Deixe o `ANTHROPIC_API_KEY` vazio no `.env` e rode `npm run assistente`.

## Como rodar com o Claude (3 passos)

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
