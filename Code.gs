/**
 * PT Treinos — Servidor (Google Apps Script + Google Sheet)
 * ---------------------------------------------------------
 * 1. Cria uma Google Sheet nova (ex.: "PT Treinos — Dados").
 * 2. Extensões > Apps Script > apaga o que lá está e cola este ficheiro.
 * 3. Escolhe a função "setup" e carrega em Executar (autoriza quando pedir).
 *    No registo de execução aparece o teu TOKEN DE TREINADOR — guarda-o.
 * 4. Implementar > Nova implementação > Tipo: Aplicação Web
 *      Executar como: Eu
 *      Quem tem acesso: Qualquer pessoa
 *    Copia o URL que termina em /exec.
 *
 * Sempre que alterares este código: Implementar > Gerir implementações >
 * editar (lápis) > Versão: Nova versão. Assim o URL mantém-se.
 */

const TZ = 'Europe/Lisbon';

const ABAS = {
  Clientes: ['codigo', 'nome', 'ativo', 'criado'],
  Planos:   ['codigo', 'plano_json', 'atualizado'],
  Registos: ['id', 'data_hora', 'data_treino', 'codigo', 'nome', 'treino',
             'duracao_min', 'rpe_sessao', 'comentario', 'exercicios_feitos',
             'exercicios_total', 'exercicios_json']
};

/* ---------- Configuração inicial ---------- */

function setup() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(ABAS).forEach(nome => {
    let sh = ss.getSheetByName(nome);
    if (!sh) sh = ss.insertSheet(nome);
    const cab = ABAS[nome];
    sh.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold');
    sh.setFrozenRows(1);
    // Colunas de códigos e datas como texto, para o Sheets não as converter
    sh.getRange('A:A').setNumberFormat('@');
    if (nome === 'Registos') sh.getRange('C:D').setNumberFormat('@');
  });
  const s1 = ss.getSheetByName('Sheet1') || ss.getSheetByName('Folha1');
  if (s1 && s1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s1);

  const props = PropertiesService.getScriptProperties();
  let token = props.getProperty('ADMIN_TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '').slice(0, 16).toUpperCase();
    props.setProperty('ADMIN_TOKEN', token);
  }
  Logger.log('TOKEN DE TREINADOR: ' + token);
}

/** Corre esta função se quiseres trocar o token (ex.: se o perderes). */
function novoToken() {
  PropertiesService.getScriptProperties().deleteProperty('ADMIN_TOKEN');
  setup();
}

/* ---------- Entrada da aplicação web ---------- */

function doGet() {
  return json_({ ok: true, app: 'PT Treinos', hora: agora_() });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, erro: 'Pedido inválido.' });
  }
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const res = rotear_(req || {});
    return json_(Object.assign({ ok: true }, res));
  } catch (err) {
    return json_({ ok: false, erro: String((err && err.message) || err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

function rotear_(req) {
  // Ações do cliente (entram com o código pessoal)
  switch (req.acao) {
    case 'login':     return login_(req.codigo);
    case 'registar':  return registar_(req.codigo, req.registo);
    case 'historico': return historico_(req.codigo);
  }
  // Ações do treinador (precisam do token)
  verificarToken_(req.token);
  switch (req.acao) {
    case 'ping':           return { treinador: true };
    case 'clientes':       return listarClientes_();
    case 'guardarCliente': return guardarCliente_(req.cliente || {});
    case 'publicarPlano':  return publicarPlano_(req.codigo, req.plano);
    case 'registos':       return listarRegistos_(req.desde, req.codigo);
    case 'apagarRegisto':  return apagarRegisto_(req.id);
    case 'apagarCliente':  return apagarCliente_(req.codigo);
  }
  throw new Error('Ação desconhecida: ' + req.acao);
}

/* ---------- Cliente ---------- */

function login_(codigo) {
  const cli = obterCliente_(codigo);
  const plano = obterPlano_(cli.codigo);
  return {
    cliente: { codigo: cli.codigo, nome: cli.nome },
    plano: plano ? plano.plano : null,
    planoAtualizado: plano ? plano.atualizado : null
  };
}

function registar_(codigo, r) {
  const cli = obterCliente_(codigo);
  if (!r || typeof r !== 'object') throw new Error('Registo vazio.');

  const sh = aba_('Registos');
  const id = String(r.id || Utilities.getUuid());

  // Evita duplicados se o telemóvel reenviar um registo que estava pendente
  if (sh.getLastRow() > 1) {
    const existe = sh.getRange(2, 1, sh.getLastRow() - 1, 1)
      .createTextFinder(id).matchEntireCell(true).findNext();
    if (existe) return { id: id, duplicado: true };
  }

  const ex = Array.isArray(r.exercicios) ? r.exercicios : [];
  const feitos = ex.filter(x => x && x.feito).length;
  const dataTreino = /^\d{4}-\d{2}-\d{2}$/.test(r.data || '') ? r.data : hoje_();

  sh.appendRow([
    id,
    agora_(),
    dataTreino,
    cli.codigo,
    cli.nome,
    limpar_(r.treino, 120) || 'Treino',
    numOuVazio_(r.duracao),
    numOuVazio_(r.rpe),
    limpar_(r.comentario, 1000),
    ex.length ? feitos : '',
    ex.length ? ex.length : '',
    ex.length ? JSON.stringify(ex).slice(0, 45000) : ''
  ]);
  return { id: id };
}

function historico_(codigo) {
  const cli = obterCliente_(codigo);
  const regs = lerTabela_('Registos')
    .filter(r => r.codigo === cli.codigo)
    .map(formatarRegisto_)
    .sort((a, b) => (b.data_treino + b.data_hora).localeCompare(a.data_treino + a.data_hora))
    .slice(0, 60);
  return { registos: regs };
}

/* ---------- Treinador ---------- */

function listarClientes_() {
  const regs = lerTabela_('Registos');
  const ultimo = {};
  regs.forEach(r => {
    const d = texto_(r.data_treino);
    if (!ultimo[r.codigo] || d > ultimo[r.codigo]) ultimo[r.codigo] = d;
  });
  const planos = {};
  lerTabela_('Planos').forEach(p => { planos[p.codigo] = texto_(p.atualizado); });

  const clientes = lerTabela_('Clientes').map(c => ({
    codigo: c.codigo,
    nome: c.nome,
    ativo: c.ativo !== false && String(c.ativo).toUpperCase() !== 'FALSE',
    ultimoTreino: ultimo[c.codigo] || '',
    planoAtualizado: planos[c.codigo] || ''
  }));
  return { clientes: clientes };
}

function guardarCliente_(c) {
  const nome = limpar_(c.nome, 120);
  if (!nome) throw new Error('Falta o nome do cliente.');
  const sh = aba_('Clientes');
  const dados = lerTabela_('Clientes');
  let codigo = normCodigo_(c.codigo);
  const ativo = c.ativo !== false;

  if (codigo) {
    const i = dados.findIndex(x => x.codigo === codigo);
    if (i >= 0) {
      sh.getRange(i + 2, 2, 1, 2).setValues([[nome, ativo]]);
      return { codigo: codigo, atualizado: true };
    }
  } else {
    // Evita clientes duplicados: mesmo nome já registado
    const igual = dados.find(x => normNome_(x.nome) === normNome_(nome));
    if (igual && !c.forcar) {
      throw new Error('Já existe um acesso para "' + igual.nome + '" (código ' + igual.codigo + ').');
    }
    const usados = new Set(dados.map(x => x.codigo));
    do { codigo = gerarCodigo_(); } while (usados.has(codigo));
  }
  sh.appendRow([codigo, nome, ativo, agora_()]);
  return { codigo: codigo, criado: true };
}

function apagarCliente_(codigo) {
  const cod = normCodigo_(codigo);
  if (!cod) throw new Error('Falta o código do cliente.');
  const shC = aba_('Clientes');
  const i = lerTabela_('Clientes').findIndex(x => x.codigo === cod);
  if (i < 0) throw new Error('Cliente não encontrado.');
  shC.deleteRow(i + 2);
  // Apaga também o plano publicado. Os registos de treino ficam guardados.
  const shP = aba_('Planos');
  const j = lerTabela_('Planos').findIndex(p => p.codigo === cod);
  if (j >= 0) shP.deleteRow(j + 2);
  return { apagado: cod };
}

function publicarPlano_(codigo, plano) {
  const cli = obterCliente_(codigo, true);
  if (!plano || !Array.isArray(plano.treinos)) {
    throw new Error('O plano tem de ter uma lista "treinos".');
  }
  const txt = JSON.stringify(plano);
  if (txt.length > 45000) throw new Error('O plano é demasiado grande (máx. ~45 000 caracteres).');

  const sh = aba_('Planos');
  const dados = lerTabela_('Planos');
  const i = dados.findIndex(p => p.codigo === cli.codigo);
  const linha = [cli.codigo, txt, agora_()];
  if (i >= 0) sh.getRange(i + 2, 1, 1, 3).setValues([linha]);
  else sh.appendRow(linha);
  return { codigo: cli.codigo, treinos: plano.treinos.length };
}

function listarRegistos_(desde, codigo) {
  const cod = normCodigo_(codigo);
  const limite = /^\d{4}-\d{2}-\d{2}$/.test(desde || '') ? desde : '';
  const regs = lerTabela_('Registos')
    .map(formatarRegisto_)
    .filter(r => (!limite || r.data_treino >= limite) && (!cod || r.codigo === cod))
    .sort((a, b) => (b.data_treino + b.data_hora).localeCompare(a.data_treino + a.data_hora));
  return { registos: regs };
}

function apagarRegisto_(id) {
  const sh = aba_('Registos');
  if (!id || sh.getLastRow() < 2) throw new Error('Registo não encontrado.');
  const cel = sh.getRange(2, 1, sh.getLastRow() - 1, 1)
    .createTextFinder(String(id)).matchEntireCell(true).findNext();
  if (!cel) throw new Error('Registo não encontrado.');
  sh.deleteRow(cel.getRow());
  return { apagado: id };
}

/* ---------- Auxiliares ---------- */

function verificarToken_(token) {
  const certo = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  if (!certo) throw new Error('Corre primeiro a função setup no Apps Script.');
  if (!token || String(token).trim().toUpperCase() !== certo) {
    throw new Error('Token de treinador inválido.');
  }
}

function obterCliente_(codigo, aceitarInativo) {
  const cod = normCodigo_(codigo);
  if (!cod) throw new Error('Indica o teu código.');
  const c = lerTabela_('Clientes').find(x => x.codigo === cod);
  if (!c) throw new Error('Código não encontrado. Confirma com o teu treinador.');
  const ativo = c.ativo !== false && String(c.ativo).toUpperCase() !== 'FALSE';
  if (!ativo && !aceitarInativo) throw new Error('Este acesso está desativado. Fala com o teu treinador.');
  return { codigo: c.codigo, nome: c.nome };
}

function obterPlano_(codigo) {
  const p = lerTabela_('Planos').find(x => x.codigo === codigo);
  if (!p || !p.plano_json) return null;
  try {
    return { plano: JSON.parse(p.plano_json), atualizado: texto_(p.atualizado) };
  } catch (e) {
    return null;
  }
}

function formatarRegisto_(r) {
  let ex = [];
  if (r.exercicios_json) { try { ex = JSON.parse(r.exercicios_json); } catch (e) {} }
  return {
    id: String(r.id),
    data_hora: texto_(r.data_hora),
    data_treino: dataTexto_(r.data_treino),
    codigo: r.codigo,
    nome: r.nome,
    treino: r.treino,
    duracao_min: r.duracao_min === '' ? null : Number(r.duracao_min),
    rpe_sessao: r.rpe_sessao === '' ? null : Number(r.rpe_sessao),
    comentario: r.comentario || '',
    exercicios_feitos: r.exercicios_feitos === '' ? null : Number(r.exercicios_feitos),
    exercicios_total: r.exercicios_total === '' ? null : Number(r.exercicios_total),
    exercicios: ex
  };
}

function aba_(nome) {
  const sh = SpreadsheetApp.getActive().getSheetByName(nome);
  if (!sh) throw new Error('Falta a folha "' + nome + '". Corre a função setup.');
  return sh;
}

function lerTabela_(nome) {
  const sh = aba_(nome);
  const v = sh.getDataRange().getValues();
  if (v.length < 2) return [];
  const cab = v[0].map(String);
  return v.slice(1)
    .filter(l => l.some(x => x !== '' && x !== null))
    .map(l => {
      const o = {};
      cab.forEach((k, i) => { o[k] = l[i]; });
      if (o.codigo !== undefined) o.codigo = normCodigo_(o.codigo);
      return o;
    });
}

function gerarCodigo_() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sem I e O
  const nums = '23456789';                   // sem 0 e 1
  let c = '';
  for (let i = 0; i < 3; i++) c += letras[Math.floor(Math.random() * letras.length)];
  for (let i = 0; i < 3; i++) c += nums[Math.floor(Math.random() * nums.length)];
  return c;
}

function normNome_(n) { return String(n || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
function normCodigo_(c) { return String(c || '').trim().toUpperCase().replace(/\s+/g, ''); }
function limpar_(t, max) { return String(t || '').trim().slice(0, max || 500); }
function numOuVazio_(n) { const x = Number(n); return (n === '' || n === null || n === undefined || isNaN(x)) ? '' : x; }
function agora_() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm"); }
function hoje_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function texto_(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm') : String(v || ''); }
function dataTexto_(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : String(v || ''); }

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}
