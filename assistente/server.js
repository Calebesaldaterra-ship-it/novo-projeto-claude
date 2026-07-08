// Assistente de voz da Lux Vision — "Jarvis" do MazyOS
// Servidor local: serve a página e conversa com o Claude usando a memória do negócio.
//
// Rodar:  npm run assistente   (na raiz do MazyOS)
// Abrir:  http://localhost:5173

import { createServer } from 'node:http';
import { readFile, appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, '..');

// Onde o Aslam guarda o que aprende sozinho sobre o usuário e o negócio.
const MEM_APRENDIZADO = join(raiz, '_memoria', 'aprendizado.md');

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
      const conteudo = (await readFile(join(raiz, a), 'utf8')).trim();
      if (conteudo) partes.push(`## ${a}\n${conteudo}`);
    } catch {
      /* arquivo pode não existir ainda */
    }
  }

  // Memória aprendida = fatos que o Aslam JÁ SABE sobre o usuário. Vai por último
  // e com destaque forte, pra o modelo tratar como conhecimento próprio (não como doc).
  let aprendido = '';
  try {
    const linhas = (await readFile(MEM_APRENDIZADO, 'utf8'))
      .split('\n')
      .filter((l) => l.trim().startsWith('- '))
      .map((l) => l.replace(/^-\s*(\(\d{4}-\d{2}-\d{2}\)\s*)?/, '').trim())
      .filter(Boolean);
    if (linhas.length) {
      aprendido =
        `\n\n# O QUE VOCÊ JÁ SABE SOBRE O USUÁRIO (fatos reais — use com confiança)\n` +
        linhas.map((l) => '- ' + l).join('\n') +
        `\n\nEstes são fatos que você aprendeu com o próprio usuário. Quando ele perguntar algo que está aqui, responda direto com o fato. NUNCA diga que não tem acesso a essas informações — você tem.`;
    }
  } catch {
    /* ainda não aprendeu nada */
  }

  return `${PROMPT_BASE}\n\n# Contexto do negócio (memória do MazyOS)\n\n${partes.join('\n\n')}${aprendido}`;
}

async function responder(historico) {
  if (!SYSTEM) SYSTEM = await montarSystem();
  return chamarLLM(SYSTEM, historico);
}

// Chama o cérebro (Claude ou Ollama) com um system prompt qualquer.
function chamarLLM(system, historico, temp) {
  return BACKEND === 'ollama' ? responderOllama(system, historico, temp) : responderAnthropic(system, historico, temp);
}

async function responderAnthropic(system, historico, temp) {
  const params = {
    model: MODELO,
    max_tokens: 500,
    system,
    messages: historico,
  };
  if (typeof temp === 'number') params.temperature = temp;
  // Voz precisa ser rápida: desliga o "thinking" (não suportado no Fable 5).
  if (!MODELO.includes('fable')) params.thinking = { type: 'disabled' };

  const resp = await client.messages.create(params);
  return resp.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join(' ')
    .trim();
}

async function responderOllama(system, historico, temp) {
  const mensagens = [{ role: 'system', content: system }, ...historico];
  let r;
  try {
    r = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODELO,
        messages: mensagens,
        stream: false,
        options: { temperature: typeof temp === 'number' ? temp : 0.6 },
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

// ---------- Memória de longo prazo: o Aslam aprende sozinho ----------
const PROMPT_MEMORIA = `Você é o módulo de memória do Aslam — assistente de uma agência digital. Sua função é transformar a conversa em UMA anotação curta pra lembrar depois.

Guarde coisas como: preferências do usuário, clientes, serviços, metas, prazos, hábitos, decisões, nome, empresa.

Formato da resposta: UMA frase curta, em terceira pessoa. Exemplos:
- Cliente novo: Padaria do João.
- Prefere respostas curtas.
- Meta do mês: fechar três clientes.

Se a conversa for só saudação ou papo trivial, responda apenas: NADA
Nunca invente. Baseie-se só no que o usuário disse.`;

// Palavras que sinalizam claramente algo pra lembrar.
const GATILHOS = /(anota|anote|lembr|guarda|guarde|n[ãa]o esque|meu cliente|cliente novo|clientes?:|prefiro|prefer[êe]ncia|gosto de|n[ãa]o gosto|minha meta|meta d|objetivo|prazo|importante|sempre que|a partir de agora|meu nome [ée]|me chamo|minha empresa|trabalho com|foco )/i;

function normaliza(s) {
  return s.toLowerCase().replace(/[^0-9a-zà-ú ]/gi, '').replace(/\s+/g, ' ').trim();
}

// Limpa o texto num fato curto de memória (ou null se não presta).
function limpaFato(s) {
  if (!s) return null;
  let f = String(s).trim().replace(/^["'\s\-*•]+|["'\s]+$/g, '');
  // tira prefixos de comando ("Aslam, anota aí:", "lembra que", etc.)
  f = f.replace(/^(aslam[,:\s]+)?(anota( a[ií])?|anote|lembra( que)?|lembre( que)?|guarda( que)?|guarde( que)?|n[ãa]o esque[çc]a( que)?)[\s:,]+/i, '').trim();
  if (!f || /^nada\b/i.test(f) || f.length < 5 || f.length > 220) return null;
  return f.charAt(0).toUpperCase() + f.slice(1);
}

// Analisa a conversa e, se achar um fato permanente novo, grava na memória.
async function aprender(historico) {
  const recente = historico.slice(-6);
  if (!recente.length) return null;
  const ultimaUser = [...recente].reverse().find((m) => m.role === 'user');
  if (!ultimaUser) return null;
  const fala = ultimaUser.content.trim();
  const mandouGuardar = /(anota|anote|guarda|guarde|n[ãa]o esque)/i.test(fala);
  const ehPergunta = /\?\s*$/.test(fala) || /^\s*(voc[eê]|qual|quais|quando|onde|quem|o que|cad[êe]|por que|como)\b/i.test(fala);
  // Perguntas (inclusive "você lembra...?") não viram memória — a não ser que você mande guardar.
  if (ehPergunta && !mandouGuardar) return null;
  const temGatilho = mandouGuardar || (GATILHOS.test(fala) && !ehPergunta);
  const texto = recente.map((m) => (m.role === 'user' ? 'Usuário' : 'Aslam') + ': ' + m.content).join('\n');

  const instrucao = temGatilho
    ? 'O usuário quer que você guarde algo. Resuma em UMA frase curta, em terceira pessoa, o fato pra lembrar depois.'
    : 'Se o usuário revelou um fato permanente (preferência, cliente, meta, prazo, hábito, nome, empresa), resuma em UMA frase curta em terceira pessoa. Se for só conversa ou saudação, responda NADA.';

  let fato = null;
  try {
    fato = await chamarLLM(PROMPT_MEMORIA, [{ role: 'user', content: 'Conversa:\n' + texto + '\n\n' + instrucao }], 0.2);
  } catch { /* cérebro falhou; cai na rede de segurança abaixo */ }
  fato = limpaFato(fato);

  // rede de segurança: se você pediu claramente e o modelo fraco flopou, guarda sua própria fala
  if (!fato && temGatilho) fato = limpaFato(ultimaUser.content);
  if (!fato) return null;

  // não repete algo que já está guardado
  let existentes = '';
  try { existentes = await readFile(MEM_APRENDIZADO, 'utf8'); } catch { /* ainda não existe */ }
  const nf = normaliza(fato);
  const repetido = existentes.split('\n').some((l) => {
    const nl = normaliza(l);
    return nl.length > 3 && (nl.includes(nf) || nf.includes(nl));
  });
  if (repetido) return null;

  const data = new Date().toISOString().slice(0, 10);
  try {
    if (!existentes) await appendFile(MEM_APRENDIZADO, '# Aprendizado do Aslam\n\nO que o Aslam foi aprendendo sozinho nas conversas:\n\n', 'utf8');
    await appendFile(MEM_APRENDIZADO, `- (${data}) ${fato}\n`, 'utf8');
  } catch {
    return null;
  }
  SYSTEM = null; // recarrega o contexto com a nova memória na próxima resposta
  console.log(`  🧠 memória nova: ${fato}`);
  return fato;
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
      // Aprende em segundo plano — não atrasa a resposta ao usuário.
      aprender([...msgs, { role: 'assistant', content: resposta }]).catch(() => {});
      return;
    }

    // Lista o que o Aslam já aprendeu (pra mostrar no painel de memória).
    if (req.method === 'GET' && req.url === '/memoria') {
      let linhas = [];
      try {
        const txt = await readFile(MEM_APRENDIZADO, 'utf8');
        linhas = txt.split('\n')
          .filter((l) => l.trim().startsWith('- '))
          .map((l) => l.replace(/^-\s*(\(\d{4}-\d{2}-\d{2}\)\s*)?/, '').trim())
          .filter(Boolean);
      } catch { /* ainda não aprendeu nada */ }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ total: linhas.length, ultimas: linhas.slice(-5) }));
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
