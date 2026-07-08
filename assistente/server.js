// Assistente de voz da Lux Vision — "Jarvis" do MazyOS
// Servidor local: serve a página e conversa com o Claude usando a memória do negócio.
//
// Rodar:  npm run assistente   (na raiz do MazyOS)
// Abrir:  http://localhost:5173

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, '..');

// Carrega o .env da raiz do projeto (chaves de API). Node 20.12+ / 24.
try {
  process.loadEnvFile(join(raiz, '.env'));
} catch {
  /* .env é opcional — segue sem ele */
}

const PORTA = Number(process.env.ASSISTENTE_PORTA || 5173);

// Escolhe o "cérebro" do Aslam: Claude (Anthropic, pago) ou Ollama (IA local, grátis).
// Padrão: usa o Claude se houver chave; senão, cai pro Ollama local.
const BACKEND = process.env.ASSISTENTE_BACKEND || (process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'ollama');

// Config Claude
const MODELO = process.env.ASSISTENTE_MODELO || 'claude-sonnet-5';
const client = BACKEND === 'anthropic' && process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

// Config Ollama (IA local grátis)
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODELO = process.env.OLLAMA_MODELO || 'llama3.2';

// O Aslam está pronto pra responder?
const PRONTO = BACKEND === 'ollama' || !!client;

// Personalidade + regras de fala do assistente.
const PROMPT_BASE = `Você é o Aslam — o núcleo de inteligência da Lux Vision, uma agência digital solo. Aslam é um leão: presença, confiança e proteção do negócio. Por dentro, você opera pela doutrina ARCHON — um sistema de última geração: analítico, preciso e autônomo.

COMO VOCÊ PENSA (por dentro, sem narrar o processo):
- Antes de responder: entenda o problema, veja os riscos, monte um plano rápido, então responda. Nunca responda no impulso.
- Calcule a melhor opção. Se existir um caminho melhor do que o que foi pedido, proponha.
- Se algo estiver inconsistente, ou faltar um dado essencial, questione com UMA pergunta objetiva.
- Nunca entra em pânico. Fala com confiança e objetividade, sem arrogância.
- Você pensa como uma equipe de agentes (estratégico, programador, marketing, financeiro, jurídico, pesquisa) — traga o ângulo certo pra cada pergunta.

COMO VOCÊ FALA (isto vira VOZ, falado em voz alta):
- Português do Brasil, como uma pessoa conversando. Frases curtas. 1 a 3 frases por padrão.
- NUNCA use markdown, listas, asteriscos, emojis, links ou títulos. Só texto corrido, do jeito que se fala.
- Termine deixando claro o próximo passo, quando fizer sentido.
- Só dê resposta longa e estruturada (resumo, depois detalhes, depois próximo passo) se o usuário pedir pra "detalhar" ou "explicar".

MEMÓRIA:
- Você conhece o negócio pelo contexto abaixo (empresa, preferências, estratégia, identidade). Use naturalmente, sem recitar os arquivos.
- Quando aprender algo permanente sobre o usuário ou o negócio, ofereça salvar na memória, em uma frase.

CAPACIDADES REAIS AGORA: conversar, planejar, escrever textos e estratégias, revisar ideias e orientar os próximos passos. Se pedirem uma ação que ainda não dá pra executar por aqui (postar, gerar site, mexer em arquivos), diga em uma frase o que dá pra fazer hoje e ofereça o próximo passo concreto.

Mantenha sempre o tom premium e direto da Lux Vision: sem exagero, sem enrolação.`;

let SYSTEM = null;

async function montarSystem() {
  const arquivos = [
    '_memoria/empresa.md',
    '_memoria/preferencias.md',
    '_memoria/estrategia.md',
    'identidade/design-guide.md',
  ];
  const partes = [];
  for (const a of arquivos) {
    try {
      partes.push(`## ${a}\n${await readFile(join(raiz, a), 'utf8')}`);
    } catch {
      /* arquivo pode não existir ainda */
    }
  }
  return `${PROMPT_BASE}\n\n# Contexto do negócio (memória do MazyOS)\n\n${partes.join('\n\n')}`;
}

async function responder(historico) {
  if (!SYSTEM) SYSTEM = await montarSystem();
  return BACKEND === 'ollama' ? responderOllama(historico) : responderAnthropic(historico);
}

async function responderAnthropic(historico) {
  const params = {
    model: MODELO,
    max_tokens: 500,
    system: SYSTEM,
    messages: historico,
  };
  // Voz precisa ser rápida: desliga o "thinking" (não suportado no Fable 5).
  if (!MODELO.includes('fable')) params.thinking = { type: 'disabled' };

  const resp = await client.messages.create(params);
  return resp.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join(' ')
    .trim();
}

async function responderOllama(historico) {
  const mensagens = [{ role: 'system', content: SYSTEM }, ...historico];
  let r;
  try {
    r = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODELO,
        messages: mensagens,
        stream: false,
        options: { temperature: 0.6 },
      }),
    });
  } catch {
    throw new Error(`Não consegui falar com o Ollama em ${OLLAMA_URL}. Ele está aberto/rodando?`);
  }
  if (!r.ok) {
    throw new Error(`Ollama respondeu ${r.status}. O modelo '${OLLAMA_MODELO}' já foi baixado? (ollama pull ${OLLAMA_MODELO})`);
  }
  const dados = await r.json();
  return (dados.message?.content || '').trim();
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let dados = '';
    req.on('data', (c) => {
      dados += c;
      if (dados.length > 1_000_000) req.destroy();
    });
    req.on('end', () => resolve(dados));
    req.on('error', reject);
  });
}

const servidor = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      const html = await readFile(join(aqui, 'index.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    // Imagens (ex.: o leão do Aslam) servidas da pasta assistente/
    if (req.method === 'GET' && /^\/[\w.-]+\.(png|jpe?g|webp|svg)$/i.test(req.url)) {
      const nome = req.url.slice(1);
      const tipos = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' };
      const ext = nome.split('.').pop().toLowerCase();
      try {
        const img = await readFile(join(aqui, nome));
        res.writeHead(200, { 'Content-Type': tipos[ext] || 'application/octet-stream' });
        res.end(img);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('imagem não encontrada');
      }
      return;
    }

    if (req.method === 'POST' && req.url === '/conversar') {
      if (!PRONTO) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ erro: 'Cérebro não configurado: falta a chave da Anthropic OU o Ollama rodando.' }));
        return;
      }
      const { historico } = JSON.parse((await lerCorpo(req)) || '{}');
      const msgs = Array.isArray(historico) ? historico.slice(-20) : [];
      const resposta = await responder(msgs);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ resposta }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('não encontrado');
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ erro: String(e?.message || e) }));
  }
});

servidor.listen(PORTA, () => {
  console.log('\n  ✦ Aslam — Assistente de voz da Lux Vision 🦁');
  console.log(`  Abra no navegador:  http://localhost:${PORTA}`);
  console.log(`  Cérebro:  ${BACKEND === 'ollama' ? 'Ollama (local) · ' + OLLAMA_MODELO : 'Claude · ' + MODELO}`);
  if (!PRONTO) {
    console.log('\n  ⚠  Cérebro não pronto: adicione ANTHROPIC_API_KEY no .env, ou rode o Ollama.\n');
  } else if (BACKEND === 'ollama') {
    console.log(`  (Precisa do Ollama aberto e do modelo baixado: ollama pull ${OLLAMA_MODELO})\n`);
  } else {
    console.log('');
  }
});
