// Assistente de voz da Lux Vision — "Jarvis" do MazyOS
// Servidor local: serve a página e conversa com o Claude usando a memória do negócio.
//
// Rodar:  npm run assistente   (na raiz do MazyOS)
// Abrir:  http://localhost:5173

import { createServer } from 'node:http';
import { readFile, appendFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, sep } from 'node:path';
import { homedir, platform } from 'node:os';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
// O SDK da Anthropic (Claude) é carregado só quando o backend for 'anthropic'.
// Assim o Aslam roda sem instalar nada quando usa o Gemini ou o Ollama.

const aqui = dirname(fileURLToPath(import.meta.url));
// Versão portátil: se houver _memoria ao lado do server.js, está tudo numa pasta só.
// Senão, é a estrutura do MazyOS (a memória fica um nível acima).
const raiz = existsSync(join(aqui, '_memoria')) ? aqui : join(aqui, '..');

// Onde o Aslam guarda o que aprende sozinho sobre o usuário e o negócio.
const MEM_APRENDIZADO = join(raiz, '_memoria', 'aprendizado.md');

// Carrega o .env da raiz do projeto (chaves de API). Node 20.12+ / 24.
try {
  process.loadEnvFile(join(raiz, '.env'));
} catch {
  /* .env é opcional — segue sem ele */
}

const PORTA = Number(process.env.ASSISTENTE_PORTA || 5173);

// Escolhe o "cérebro" do Aslam. Ele decide sozinho:
//   1) Claude/Anthropic (pago)                   se tiver ANTHROPIC_API_KEY
//   2) Google Gemini (grátis, esperto e rápido)  se tiver GEMINI_API_KEY
//   3) Ollama (IA local grátis)                  se não tiver chave nenhuma
const BACKEND = process.env.ASSISTENTE_BACKEND || (
  process.env.ANTHROPIC_API_KEY ? 'anthropic'
    : process.env.GEMINI_API_KEY ? 'gemini'
      : 'ollama'
);

// Config Claude — carregado só quando precisa (mantém o Aslam leve no Gemini/Ollama).
const MODELO = process.env.ASSISTENTE_MODELO || 'claude-sonnet-5';
let client = null;
async function garantirClienteAnthropic() {
  if (!client) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    client = new Anthropic();
  }
  return client;
}

// Config Google Gemini (grátis, na nuvem — esperto e rápido, ótimo pra voz)
const GEMINI_MODELO = process.env.GEMINI_MODELO || 'gemini-2.5-flash';

// Config Ollama (IA local grátis)
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODELO = process.env.OLLAMA_MODELO || 'llama3.2';

// Pasta onde o Aslam pode agir (criar pastas, procurar arquivos). Padrão: sua pasta de usuário.
const BASE_ACOES = process.env.ASLAM_BASE || homedir();

// O Aslam está pronto pra responder?
const PRONTO = BACKEND === 'ollama'
  || (BACKEND === 'gemini' && !!process.env.GEMINI_API_KEY)
  || (BACKEND === 'anthropic' && !!process.env.ANTHROPIC_API_KEY);

// Personalidade + regras de fala do assistente.
const PROMPT_BASE = `Você é o Aslam — o assistente pessoal e inteligente do usuário. Você é um leão: presença, confiança e lealdade. Por dentro, opera pela doutrina ARCHON: analítico, preciso e direto.

Você ajuda com QUALQUER coisa do usuário: dúvidas do dia a dia, ideias, planejamento, contas, textos, decisões, estudos, lembretes — e também com o negócio dele, a Lux Vision (agência digital solo), quando for o caso. Não force o assunto do negócio; siga o que o usuário quiser falar.

COMO VOCÊ PENSA (sem narrar o processo):
- Entenda o pedido, pense rápido e responda com a melhor opção. Não responda no impulso.
- Se faltar um dado essencial, faça UMA pergunta objetiva. Se houver um caminho melhor, proponha.
- Nunca entra em pânico. Fala com confiança e objetividade, sem arrogância.

COMO VOCÊ FALA (isto vira VOZ em voz alta):
- Português do Brasil, conversando. Frases curtas, 1 a 3 por padrão.
- NUNCA use markdown, listas, asteriscos, emojis, links ou títulos. Só texto corrido.
- Termine deixando claro o próximo passo, quando fizer sentido.
- Só se estenda (resumo, detalhes, próximo passo) se pedirem pra "detalhar".

MEMÓRIA:
- Você conhece o usuário e o negócio pelo contexto abaixo. Use naturalmente, sem recitar arquivos.
- Quando aprender algo permanente sobre o usuário, guarde na memória.

VOCÊ PODE AGIR NO COMPUTADOR do usuário (só dentro da pasta dele): criar pastas, procurar arquivos, listar e abrir pastas/arquivos. Use as ferramentas quando ele pedir uma dessas ações, e depois confirme em uma frase curta o que fez.

Se pedirem algo que ainda não dá (mandar mensagem, apagar arquivos, postar online), diga em uma frase o que dá pra fazer hoje e ofereça o próximo passo.`;

let SYSTEM = null;

async function montarSystem() {
  const arquivos = [
    '_memoria/empresa.md',
    '_memoria/preferencias.md',
    '_memoria/estrategia.md',
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

  return `${PROMPT_BASE}\n\n# Contexto sobre o usuário e o negócio dele\n\n${partes.join('\n\n')}${aprendido}`;
}

async function responder(historico) {
  if (!SYSTEM) SYSTEM = await montarSystem();
  return chamarLLM(SYSTEM, historico, { acoes: true });
}

// Chama o cérebro escolhido (Claude, Gemini ou Ollama) com um system prompt qualquer.
// opts.temp = criatividade (Ollama) · opts.acoes = pode usar ferramentas do PC (Gemini).
function chamarLLM(system, historico, opts = {}) {
  if (BACKEND === 'ollama') return responderOllama(system, historico, opts.temp);
  if (BACKEND === 'gemini') return responderGemini(system, historico, opts.acoes);
  return responderAnthropic(system, historico);
}

async function responderAnthropic(system, historico) {
  const ehFable = /fable|mythos/i.test(MODELO);
  const params = {
    model: MODELO,
    max_tokens: 500,
    system,
    messages: historico,
    output_config: { effort: 'low' }, // respostas rápidas — bom pra voz
  };
  // Modelos atuais (Sonnet 5, Opus 4.8) aceitam desligar o "thinking" pra ir mais rápido.
  // O Fable 5 pensa sempre: nele NÃO se manda o parâmetro (senão dá erro 400).
  // (Também não mandamos "temperature": foi removido nesses modelos e dá 400.)
  if (!ehFable) params.thinking = { type: 'disabled' };

  const cli = await garantirClienteAnthropic();
  let resp;
  if (ehFable) {
    // No Fable 5 um classificador pode recusar; ligamos o fallback automático:
    // o Opus 4.8 responde no lugar, na mesma chamada, com repreço de crédito.
    resp = await cli.beta.messages.create({
      ...params,
      betas: ['server-side-fallback-2026-06-01'],
      fallbacks: [{ model: 'claude-opus-4-8' }],
    });
  } else {
    resp = await cli.messages.create(params);
  }

  if (resp.stop_reason === 'refusal') {
    return 'Desculpa, não consigo te ajudar com isso agora. Pode me pedir de outro jeito?';
  }
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
        keep_alive: '30m',   // mantém o modelo na memória pra não recarregar entre falas
        options: { temperature: typeof temp === 'number' ? temp : 0.6, num_predict: 240 },
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

// ---------- Autonomia: ferramentas que o Aslam pode usar no computador ----------
// Só ações NÃO destrutivas, e só dentro da pasta do usuário (BASE_ACOES).
const FERRAMENTAS = [{
  function_declarations: [
    {
      name: 'criar_pasta',
      description: 'Cria uma pasta nova no computador do usuário (dentro da pasta do usuário).',
      parameters: { type: 'object', properties: { caminho: { type: 'string', description: 'Nome ou caminho da pasta, ex: Desktop/Clientes/Padaria do João' } }, required: ['caminho'] },
    },
    {
      name: 'procurar_arquivo',
      description: 'Procura arquivos e pastas pelo nome dentro do computador do usuário.',
      parameters: { type: 'object', properties: { termo: { type: 'string', description: 'Parte do nome a procurar' }, pasta: { type: 'string', description: 'Pasta onde procurar (opcional)' } }, required: ['termo'] },
    },
    {
      name: 'listar_pasta',
      description: 'Lista os arquivos e pastas dentro de uma pasta.',
      parameters: { type: 'object', properties: { caminho: { type: 'string', description: 'Caminho da pasta (opcional; padrão é a pasta do usuário)' } } },
    },
    {
      name: 'abrir',
      description: 'Abre uma pasta ou arquivo (no explorador de arquivos ou no programa padrão).',
      parameters: { type: 'object', properties: { caminho: { type: 'string', description: 'Caminho da pasta ou arquivo a abrir' } }, required: ['caminho'] },
    },
  ],
}];

// Garante que o caminho fica DENTRO da pasta permitida (nada de mexer no sistema).
function resolverSeguro(p) {
  const base = resolve(BASE_ACOES);
  const alvo = resolve(base, p && String(p).trim() ? String(p) : '.');
  if (alvo !== base && !alvo.startsWith(base + sep)) {
    throw new Error('Esse caminho está fora da sua pasta de usuário (não posso mexer aí).');
  }
  return alvo;
}

// Busca recursiva leve (limita profundidade e quantidade pra não travar).
async function procurarArquivos(raiz, termo, acc = [], prof = 0) {
  if (acc.length >= 30 || prof > 4) return acc;
  let itens;
  try { itens = await readdir(raiz, { withFileTypes: true }); } catch { return acc; }
  for (const d of itens) {
    if (acc.length >= 30) break;
    const nome = d.name;
    if (nome.startsWith('.') || nome === 'node_modules' || nome === 'AppData' || nome === '$RECYCLE.BIN') continue;
    const full = join(raiz, nome);
    if (nome.toLowerCase().includes(termo)) acc.push((d.isDirectory() ? '[pasta] ' : '') + full);
    if (d.isDirectory()) await procurarArquivos(full, termo, acc, prof + 1);
  }
  return acc;
}

function abrirNoSistema(alvo) {
  const so = platform();
  if (so === 'win32') execFile('explorer', [alvo], () => {});
  else if (so === 'darwin') execFile('open', [alvo], () => {});
  else execFile('xdg-open', [alvo], () => {});
}

async function execFerramenta(nome, args) {
  try {
    if (nome === 'criar_pasta') {
      const alvo = resolverSeguro(args.caminho);
      await mkdir(alvo, { recursive: true });
      return { ok: true, mensagem: 'Pasta criada em ' + alvo };
    }
    if (nome === 'listar_pasta') {
      const alvo = resolverSeguro(args.caminho || '.');
      const itens = await readdir(alvo, { withFileTypes: true });
      return { ok: true, pasta: alvo, itens: itens.slice(0, 80).map((d) => (d.isDirectory() ? '[pasta] ' : '') + d.name) };
    }
    if (nome === 'procurar_arquivo') {
      const raiz = resolverSeguro(args.pasta || '.');
      const achados = await procurarArquivos(raiz, String(args.termo || '').toLowerCase());
      return { ok: true, quantidade: achados.length, achados };
    }
    if (nome === 'abrir') {
      const alvo = resolverSeguro(args.caminho);
      abrirNoSistema(alvo);
      return { ok: true, mensagem: 'Abrindo ' + alvo };
    }
    return { ok: false, erro: 'ferramenta desconhecida: ' + nome };
  } catch (e) {
    return { ok: false, erro: String(e && e.message ? e.message : e) };
  }
}

// Chamada crua à API do Gemini.
async function chamarGemini(corpo) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODELO}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY || '')}`;
  let r;
  try {
    r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  } catch {
    throw new Error('Não consegui falar com o Google Gemini. Verifique a internet.');
  }
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`Gemini respondeu ${r.status}. A chave GEMINI_API_KEY está correta? ${txt.slice(0, 160)}`);
  }
  return r.json();
}

async function responderGemini(system, historico, acoes) {
  // Gemini usa papéis "user" e "model" (não "assistant").
  const contents = historico.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const corpoBase = {
    system_instruction: { parts: [{ text: system }] },
    generationConfig: { maxOutputTokens: acoes ? 800 : 500, temperature: 0.6 },
  };
  if (acoes) corpoBase.tools = FERRAMENTAS;

  // Loop de ações: se o Gemini pedir uma ferramenta, a gente executa e devolve o resultado.
  for (let passo = 0; passo < 6; passo++) {
    const dados = await chamarGemini({ ...corpoBase, contents });
    const cand = dados.candidates && dados.candidates[0];
    if (!cand || cand.finishReason === 'SAFETY' || dados.promptFeedback?.blockReason) {
      return 'Desculpa, não consigo responder isso agora. Pode me pedir de outro jeito?';
    }
    const parts = cand.content?.parts || [];
    const chamada = acoes ? parts.find((p) => p.functionCall) : null;
    if (chamada) {
      const { name, args } = chamada.functionCall;
      const resultado = await execFerramenta(name, args || {});
      console.log(`  🛠  ${name}(${JSON.stringify(args || {})}) → ${JSON.stringify(resultado).slice(0, 140)}`);
      contents.push({ role: 'model', parts });
      contents.push({ role: 'user', parts: [{ functionResponse: { name, response: resultado } }] });
      continue;
    }
    const texto = parts.map((p) => p.text || '').join(' ').trim();
    return texto || 'Feito.';
  }
  return 'Fiz o que dava, mas me enrolei no meio. Pode pedir de novo, passo a passo?';
}

// ---------- Memória de longo prazo: o Aslam aprende sozinho ----------
const PROMPT_MEMORIA = `Você é o módulo de memória do Aslam — assistente pessoal do usuário. Sua função é transformar a conversa em UMA anotação curta pra lembrar depois.

Guarde coisas como: nome, família, gostos e preferências, rotina, saúde, datas importantes, metas pessoais e do negócio, clientes, serviços, prazos, decisões e hábitos.

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
    fato = await chamarLLM(PROMPT_MEMORIA, [{ role: 'user', content: 'Conversa:\n' + texto + '\n\n' + instrucao }], { temp: 0.2 });
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
  const nomeCerebro = BACKEND === 'ollama' ? 'Ollama (local, grátis) · ' + OLLAMA_MODELO
    : BACKEND === 'gemini' ? 'Google Gemini (grátis) · ' + GEMINI_MODELO
      : 'Claude · ' + MODELO;
  console.log(`  Cérebro:  ${nomeCerebro}`);
  if (!PRONTO) {
    console.log('\n  ⚠  Cérebro não pronto: cole a GEMINI_API_KEY (grátis) no .env, ou rode o Ollama.\n');
  } else if (BACKEND === 'gemini') {
    console.log('  (Usando a chave grátis do Google Gemini — rápido e na nuvem.)\n');
  } else if (BACKEND === 'ollama') {
    console.log(`  (Precisa do Ollama aberto e do modelo baixado: ollama pull ${OLLAMA_MODELO})\n`);
    // Aquece o modelo (carrega na memória) pra a primeira resposta já sair rápida.
    fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODELO, messages: [{ role: 'user', content: 'oi' }], stream: false, keep_alive: '30m', options: { num_predict: 1 } }),
    }).then(() => console.log('  🔥 Modelo aquecido — pronto pra responder rápido.\n')).catch(() => {});
  } else {
    console.log('');
  }
});
