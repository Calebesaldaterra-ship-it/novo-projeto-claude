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

const MODELO = process.env.ASSISTENTE_MODELO || 'claude-sonnet-5';
const PORTA = Number(process.env.ASSISTENTE_PORTA || 5173);
const SEM_CHAVE = !process.env.ANTHROPIC_API_KEY;

const client = SEM_CHAVE ? null : new Anthropic();

// Personalidade + regras de fala do assistente.
const PROMPT_BASE = `Você é o assistente de voz da Lux Vision — uma agência digital solo. Pense em você como o "Jarvis" do negócio: prático, confiante e direto.

Estas respostas são FALADAS em voz alta, então:
- Fale como uma pessoa conversando, em português do Brasil. Frases curtas.
- NUNCA use markdown, listas com hífen, asteriscos, emojis, links ou títulos. Só texto corrido, do jeito que se fala.
- Seja breve por padrão: 1 a 3 frases. Só se estenda se o usuário pedir detalhe.
- Se faltar uma informação essencial pra executar, faça UMA pergunta objetiva. Não faça questionário.
- Mantenha o tom premium e direto da Lux Vision — sem exagero, sem enrolação.
- Você conhece o negócio pelo contexto abaixo. Use naturalmente, sem recitar os arquivos.
- Se pedirem uma ação que este assistente ainda não executa (postar, criar carrossel, etc.), diga em uma frase o que dá pra fazer e ofereça o próximo passo.`;

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

    if (req.method === 'POST' && req.url === '/conversar') {
      if (SEM_CHAVE) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ erro: 'Falta ANTHROPIC_API_KEY no arquivo .env do MazyOS.' }));
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
  console.log('\n  ✦ Lux Vision — Assistente de voz');
  console.log(`  Abra no navegador:  http://localhost:${PORTA}`);
  console.log(`  Modelo:  ${MODELO}`);
  if (SEM_CHAVE) {
    console.log('\n  ⚠  Falta ANTHROPIC_API_KEY no arquivo .env — o assistente vai abrir,');
    console.log('     mas só responde depois que você adicionar a chave. Veja assistente/README.md.\n');
  } else {
    console.log('');
  }
});
