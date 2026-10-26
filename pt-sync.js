/**
 * PT Treinos — Módulo "Clientes online"
 * -------------------------------------
 * Junta este ficheiro à pasta da PT Treinos no GitHub e, no index.html,
 * mesmo antes de </body>, acrescenta:
 *
 *     <script src="pt-sync.js"></script>
 *
 * Aparece um botão "📊 Clientes" no canto inferior direito com:
 *   • Progresso  — quem treinou, quando, esforço, comentários e detalhes
 *   • Clientes   — criar acesso, código pessoal, enviar link por WhatsApp
 *   • Plano      — publicar o plano de treino que o cliente vê no telemóvel
 *   • Ligação    — URL do Apps Script, token de treinador, link da página do cliente
 *
 * Ligação ao resto da app (opcional): se a PT Treinos definir
 *     window.PTSync.obterPlano = function(nomeCliente){ return { treinos:[...] } }
 * o separador "Plano" preenche o plano automaticamente a partir da app.
 *
 * Formato do plano:
 * {
 *   "ciclo": "Mesociclo 1 · Semana 2",          (opcional)
 *   "mensagem": "Foco na técnica esta semana",   (opcional)
 *   "treinos": [
 *     { "nome": "Treino A", "dia": "Segunda", "notas": "...",
 *       "exercicios": [
 *         { "nome": "Agachamento", "series": 4, "reps": "8-10", "carga": "40 kg",
 *           "descanso": "90 s", "notas": "...", "video": "https://..." }
 *       ] }
 *   ]
 * }
 */
(function () {
  'use strict';
  const CFG_KEY = 'ptsync_cfg';
  const PTSync = window.PTSync = window.PTSync || {};
  let st = { aba: 'progresso', clientes: [], registos: [], filtro: '', detalhe: null, carregado: false };

  /* ---------- utilitários ---------- */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function cfg() { try { return JSON.parse(localStorage.getItem(CFG_KEY)) || {}; } catch (e) { return {}; } }
  function guardarCfg(c) { try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch (e) {} }
  function iso(d) { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); }
  function hoje() { return iso(new Date()); }
  function diasAtras(n) { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); }
  function diasEntre(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }
  function fmtData(s) {
    if (!s) return '—';
    const [a, m, d] = s.split('-').map(Number);
    return new Date(a, m - 1, d).toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function inicioSemana() { const d = new Date(); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return iso(d); }

  async function api(acao, dados) {
    const c = cfg();
    if (!c.url) throw new Error('Configura primeiro o URL no separador Ligação.');
    const r = await fetch(c.url, { method: 'POST', body: JSON.stringify(Object.assign({ acao: acao, token: c.token }, dados || {})) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.erro || 'Erro no servidor.');
    return j;
  }
  PTSync.api = api;

  /* ---------- estilos ---------- */
  const css = `
  .pts-fab{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:99998;border:0;border-radius:99px;
    padding:12px 16px;background:#21E1B0;color:#062A22;font:700 15px system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.45);cursor:pointer}
  @media (max-width:780px){.pts-fab{bottom:calc(72px + env(safe-area-inset-bottom, 0px));right:max(12px, env(safe-area-inset-right, 0px));padding:8px 13px;font-size:13px;opacity:.96}}
  .pts-ov{position:fixed;inset:0;z-index:99999;background:var(--pts-bg);color:var(--pts-txt);overflow:auto;
    font:15px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    --pts-bg:#f4f6fa;--pts-card:#fff;--pts-txt:#0C1F2E;--pts-sub:#64748b;--pts-ln:#e2e8f0}
  @media (prefers-color-scheme: dark){.pts-ov{--pts-bg:#0b1120;--pts-card:#131c2e;--pts-txt:#e5e7eb;--pts-sub:#94a3b8;--pts-ln:#24324a}}
  .pts-ov *{box-sizing:border-box}
  .pts-hd{position:sticky;top:0;background:#0C1F2E;color:#fff;padding:calc(12px + env(safe-area-inset-top)) 16px 10px;z-index:2}
  .pts-hd .t{display:flex;align-items:center;gap:8px}
  .pts-hd h2{flex:1;margin:0;font-size:18px}
  .pts-hd button{background:transparent;border:1px solid #334155;color:#fff;border-radius:10px;padding:6px 10px;font:inherit;cursor:pointer}
  .pts-tabs{display:flex;gap:6px;margin-top:10px;overflow-x:auto}
  .pts-tabs button{flex:1;white-space:nowrap}
  .pts-tabs button.on{background:#fff;color:#0C1F2E;border-color:#fff}
  .pts-bd{max-width:820px;margin:0 auto;padding:16px}
  .pts-card{background:var(--pts-card);border:1px solid var(--pts-ln);border-radius:14px;padding:14px;margin-bottom:10px}
  .pts-sub{color:var(--pts-sub);font-size:13px}
  .pts-ov h3{margin:0 0 4px;font-size:16px}
  .pts-ov input,.pts-ov select,.pts-ov textarea{width:100%;font:inherit;color:var(--pts-txt);background:var(--pts-bg);
    border:1px solid var(--pts-ln);border-radius:10px;padding:10px 12px}
  .pts-ov textarea{min-height:220px;font:13px/1.4 ui-monospace,Menlo,monospace}
  .pts-ov label{display:block;font-size:13px;color:var(--pts-sub);margin:10px 0 4px}
  .pts-btn{border:0;border-radius:10px;padding:10px 14px;font:600 14px system-ui,sans-serif;cursor:pointer;background:#21E1B0;color:#062A22}
  .pts-btn.sec{background:transparent;color:#2563eb;border:1px solid var(--pts-ln)}
  .pts-btn.mini{padding:6px 10px;font-size:13px}
  .pts-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .pts-row > .f{flex:1;min-width:140px}
  .pts-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
  .pts-cli{cursor:pointer}
  .pts-cli .n{font-weight:600}
  .pts-kpi{display:flex;gap:12px;margin-top:8px}
  .pts-kpi div{flex:1;text-align:center;background:var(--pts-bg);border-radius:10px;padding:6px}
  .pts-kpi b{display:block;font-size:20px}
  .pts-kpi span{font-size:11px;color:var(--pts-sub)}
  .pts-dots{display:flex;gap:3px;margin-top:8px}
  .pts-dots i{flex:1;height:7px;border-radius:3px;background:var(--pts-ln)}
  .pts-dots i.on{background:#21E1B0}
  .pts-tag{display:inline-block;font-size:12px;padding:2px 8px;border-radius:99px;border:1px solid var(--pts-ln);color:var(--pts-sub)}
  .pts-tag.ok{color:#16a34a;border-color:#16a34a55}.pts-tag.warn{color:#d97706;border-color:#d9770655}.pts-tag.err{color:#dc2626;border-color:#dc262655}
  .pts-tb{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}
  .pts-tb td,.pts-tb th{text-align:left;padding:6px 4px;border-top:1px solid var(--pts-ln);vertical-align:top}
  .pts-msg{padding:10px 12px;border-radius:10px;margin:10px 0;font-size:14px;background:var(--pts-bg)}
  .pts-msg.err{color:#dc2626}.pts-msg.ok{color:#16a34a}
  .pts-code{font:700 18px ui-monospace,Menlo,monospace;letter-spacing:2px}
  `;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  /* ---------- estrutura ---------- */
  const fab = document.createElement('button');
  fab.className = 'pts-fab'; fab.textContent = '📊 Clientes'; fab.onclick = () => PTSync.abrir();
  const ov = document.createElement('div'); ov.className = 'pts-ov'; ov.hidden = true;
  function montar() { document.body.appendChild(fab); document.body.appendChild(ov); }
  if (document.body) montar(); else document.addEventListener('DOMContentLoaded', montar);

  PTSync.abrir = function (aba) {
    if (aba) st.aba = aba;
    if (!cfg().url || !cfg().token) st.aba = 'ligacao';
    ov.hidden = false; document.body.style.overflow = 'hidden';
    render();
    if (!st.carregado && cfg().url) atualizar();
  };
  PTSync.fechar = function () { ov.hidden = true; document.body.style.overflow = ''; };

  async function atualizar() {
    st.msg = { t: 'A carregar…' }; render();
    try {
      const [c, r] = await Promise.all([api('clientes'), api('registos', { desde: diasAtras(90) })]);
      st.clientes = c.clientes; st.registos = r.registos; st.carregado = true; st.msg = null;
    } catch (e) { st.msg = { t: e.message, err: true }; }
    render();
  }
  PTSync.atualizar = atualizar;

  function render() {
    if (ov.hidden) return;
    const tabs = [['progresso', 'Progresso'], ['clientes', 'Clientes'], ['plano', 'Plano'], ['ligacao', 'Ligação']];
    ov.innerHTML = `
      <div class="pts-hd"><div class="t"><h2>Clientes online</h2>
        <button data-a="atualizar">↻</button><button data-a="fechar">✕</button></div>
        <div class="pts-tabs">${tabs.map(([k, n]) => `<button data-aba="${k}" class="${st.aba === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      </div>
      <div class="pts-bd">
        ${st.msg ? `<div class="pts-msg ${st.msg.err ? 'err' : st.msg.ok ? 'ok' : ''}">${esc(st.msg.t)}</div>` : ''}
        ${({ progresso: vProgresso, clientes: vClientes, plano: vPlano, ligacao: vLigacao })[st.aba]()}
      </div>`;
  }

  /* ---------- Progresso ---------- */
  function resumoCliente(c) {
    const regs = st.registos.filter(r => r.codigo === c.codigo);
    const sem = inicioSemana(), mes = hoje().slice(0, 7);
    const ult = regs[0] ? regs[0].data_treino : (c.ultimoTreino || '').slice(0, 10);
    const dias = [...Array(28)].map((_, i) => diasAtras(27 - i));
    const datas = new Set(regs.map(r => r.data_treino));
    const rpes = regs.slice(0, 8).map(r => r.rpe_sessao).filter(Boolean);
    return {
      regs, ult,
      semana: regs.filter(r => r.data_treino >= sem).length,
      mes: regs.filter(r => r.data_treino.startsWith(mes)).length,
      semTreinar: ult ? diasEntre(ult, hoje()) : null,
      dias, datas,
      rpeMedio: rpes.length ? (rpes.reduce((a, b) => a + b, 0) / rpes.length).toFixed(1) : null
    };
  }

  function vProgresso() {
    if (!cfg().url) return `<p>Configura primeiro a ligação.</p>`;
    if (st.detalhe) return vDetalhe();
    const ativos = st.clientes.filter(c => c.ativo);
    if (!ativos.length) return `<div class="pts-card"><h3>Sem clientes</h3><p class="pts-sub">Cria o primeiro acesso no separador Clientes.</p></div>`;
    const f = st.filtro.toLowerCase();
    const lista = ativos.filter(c => !f || c.nome.toLowerCase().includes(f))
      .map(c => ({ c, r: resumoCliente(c) }))
      .sort((a, b) => (b.r.ult || '').localeCompare(a.r.ult || ''));
    const recentes = st.registos.filter(r => r.comentario).slice(0, 5);
    return `
      <input placeholder="Procurar cliente…" value="${esc(st.filtro)}" data-in="filtro" style="margin-bottom:10px">
      ${recentes.length ? `<div class="pts-card"><h3>💬 Comentários recentes</h3>${recentes.map(r =>
        `<p style="margin:8px 0 0;font-size:14px"><b>${esc(r.nome)}</b> <span class="pts-sub">${fmtData(r.data_treino)} · ${esc(r.treino)}</span><br>“${esc(r.comentario)}”</p>`).join('')}</div>` : ''}
      <div class="pts-grid">${lista.map(({ c, r }) => {
        const tag = r.semTreinar === null ? '<span class="pts-tag">sem registos</span>'
          : r.semTreinar <= 3 ? `<span class="pts-tag ok">há ${r.semTreinar === 0 ? 'hoje' : r.semTreinar + ' d'}</span>`
          : r.semTreinar <= 7 ? `<span class="pts-tag warn">há ${r.semTreinar} dias</span>`
          : `<span class="pts-tag err">há ${r.semTreinar} dias</span>`;
        return `<div class="pts-card pts-cli" data-det="${esc(c.codigo)}">
          <div class="pts-row"><span class="n f">${esc(c.nome)}</span>${tag}</div>
          <div class="pts-kpi"><div><b>${r.semana}</b><span>semana</span></div><div><b>${r.mes}</b><span>mês</span></div>
            <div><b>${r.rpeMedio || '—'}</b><span>esforço</span></div></div>
          <div class="pts-dots" title="Últimos 28 dias">${r.dias.map(d => `<i class="${r.datas.has(d) ? 'on' : ''}"></i>`).join('')}</div>
        </div>`;
      }).join('')}</div>
      <p class="pts-sub">Barras = últimos 28 dias. Esforço = média dos últimos treinos (1–10).</p>`;
  }

  function vDetalhe() {
    const c = st.clientes.find(x => x.codigo === st.detalhe);
    if (!c) { st.detalhe = null; return vProgresso(); }
    const r = resumoCliente(c);
    return `
      <button class="pts-btn sec mini" data-a="voltar">← Todos os clientes</button>
      <div class="pts-card" style="margin-top:10px"><h3>${esc(c.nome)}</h3>
        <p class="pts-sub">Código ${esc(c.codigo)} · ${r.regs.length} treinos nos últimos 90 dias · último ${fmtData(r.ult)}</p>
        <div class="pts-kpi"><div><b>${r.semana}</b><span>esta semana</span></div><div><b>${r.mes}</b><span>este mês</span></div>
          <div><b>${r.rpeMedio || '—'}</b><span>esforço médio</span></div></div>
        <div class="pts-dots">${r.dias.map(d => `<i class="${r.datas.has(d) ? 'on' : ''}" title="${d}"></i>`).join('')}</div>
      </div>
      ${r.regs.length ? r.regs.map(g => {
        const info = [g.exercicios_total ? `${g.exercicios_feitos}/${g.exercicios_total} exercícios` : '',
          g.duracao_min ? g.duracao_min + ' min' : '', g.rpe_sessao ? 'esforço ' + g.rpe_sessao + '/10' : ''].filter(Boolean).join(' · ');
        const exs = (g.exercicios || []).filter(x => x.feito === false || x.series || x.reps || x.carga || x.nota);
        return `<div class="pts-card">
          <div class="pts-row"><b class="f">${esc(g.treino)}</b><span class="pts-tag">${fmtData(g.data_treino)}</span></div>
          ${info ? `<div class="pts-sub" style="margin-top:4px">${info}</div>` : ''}
          ${g.comentario ? `<p style="margin:8px 0 0">“${esc(g.comentario)}”</p>` : ''}
          ${exs.length ? `<table class="pts-tb"><tr><th>Exercício</th><th>Séries</th><th>Reps</th><th>Carga</th><th>Nota</th></tr>
            ${exs.map(x => `<tr style="${x.feito === false ? 'opacity:.5;text-decoration:line-through' : ''}">
              <td>${esc(x.nome)}</td><td>${esc(x.series || '')}</td><td>${esc(x.reps || '')}</td><td>${esc(x.carga || '')}</td><td>${esc(x.nota || '')}</td></tr>`).join('')}</table>` : ''}
          <div style="text-align:right;margin-top:6px"><button class="pts-btn sec mini" data-apagar="${esc(g.id)}">Apagar</button></div>
        </div>`;
      }).join('') : '<p class="pts-sub">Sem treinos registados nos últimos 90 dias.</p>'}`;
  }

  /* ---------- Clientes ---------- */
  function linkCliente(codigo) {
    const base = cfg().linkCliente || '';
    return base ? base + (base.includes('?') ? '&' : '?') + 'c=' + encodeURIComponent(codigo) : '';
  }
  const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  function faltamAcesso() {
    if (typeof PTSync.listarClientes !== 'function') return [];
    let l = []; try { l = PTSync.listarClientes() || []; } catch (e) {}
    return l.filter(n => !st.clientes.some(c => { const a = norm(c.nome), b = norm(n); return a === b || a.indexOf(b) === 0 || b.indexOf(a) === 0; }));
  }
  function tipoCli(c) {
    let i = null; try { i = typeof PTSync.infoCliente === 'function' ? PTSync.infoCliente(c.nome) : null; } catch (e) {}
    if (!c.ativo || (i && i.susp)) return 'susp';
    return (i && !i.pt) ? 'normal' : 'pt';
  }
  function vClientes() {
    const falta = faltamAcesso();
    const cont = { pt: 0, normal: 0, susp: 0 }; st.clientes.forEach(c => cont[tipoCli(c)]++);
    const f = st.listaF || '';
    const lista = st.clientes.filter(c => !f || tipoCli(c) === f);
    const chip = (v, l) => `<button class="pts-btn mini ${f === v ? '' : 'sec'}" data-lf="${v}">${l}</button>`;
    return `
      <div class="pts-row" style="margin-bottom:10px">${chip('', 'Todos (' + st.clientes.length + ')')}${chip('pt', 'Clientes PT (' + cont.pt + ')')}${chip('normal', 'Clientes (' + cont.normal + ')')}${chip('susp', 'Clientes suspensos (' + cont.susp + ')')}</div>
      ${falta.length ? `<div class="pts-card"><h3>Clientes da CICLO sem acesso (${falta.length})</h3>
        <p class="pts-sub">Clientes PT com ciclo que ainda não têm código para a app do cliente.</p>
        ${falta.map(n => `<div class="pts-row" style="margin-top:6px"><span class="f">${esc(n)}</span><button class="pts-btn sec mini" data-criar="${esc(n)}">Criar acesso</button></div>`).join('')}
        <div style="margin-top:10px"><button class="pts-btn" data-a="criarTodos">Criar acesso a todos</button></div></div>` : ''}
      <div class="pts-card"><h3>Novo acesso</h3>
        <div class="pts-row"><input class="f" id="pts-novo" placeholder="Nome do cliente">
        <button class="pts-btn" data-a="criar">Criar código</button></div>
        <p class="pts-sub">Cada cliente recebe um código pessoal para entrar na página de treinos.</p>
      </div>
      ${lista.map(c => {
        const link = linkCliente(c.codigo);
        const msg = `Olá ${c.nome.split(' ')[0]}! Já podes ver o teu plano e registar os teus treinos aqui: ${link || '(link)'}\nO teu código é ${c.codigo}`;
        return `<div class="pts-card" style="${c.ativo ? '' : 'opacity:.55'}">
          <div class="pts-row"><div class="f"><b>${esc(c.nome)}</b><br><span class="pts-code">${esc(c.codigo)}</span></div>
            <span class="pts-sub">${c.planoAtualizado ? 'plano: ' + esc(c.planoAtualizado.slice(0, 10)) : 'sem plano'}</span></div>
          <div class="pts-row" style="margin-top:8px">
            ${link ? `<a class="pts-btn mini" style="text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg)}">WhatsApp</a>
              <button class="pts-btn sec mini" data-copiar="${esc(link)}">Copiar link</button>` : '<span class="pts-sub">Define o link da página do cliente em Ligação.</span>'}
            <button class="pts-btn sec mini" data-plano="${esc(c.codigo)}">Plano</button>
            <button class="pts-btn sec mini" data-ativo="${esc(c.codigo)}">${c.ativo ? 'Desativar' : 'Reativar'}</button>
            <button class="pts-btn sec mini" style="color:#dc2626" data-elim="${esc(c.codigo)}">Eliminar</button>
          </div></div>`;
      }).join('')}`;
  }

  /* ---------- Plano ---------- */
  const EXEMPLO = {
    ciclo: 'Mesociclo 1 · Semana 1',
    mensagem: '',
    treinos: [{ nome: 'Treino A', dia: 'Segunda', notas: '', exercicios: [
      { nome: 'Agachamento', series: 4, reps: '8-10', carga: '', descanso: '90 s', notas: '', video: '' }] }]
  };
  function vPlano() {
    const ativos = st.clientes.filter(c => c.ativo);
    if (!ativos.length) return `<p class="pts-sub">Cria primeiro um cliente.</p>`;
    if (!st.planoCod || !ativos.some(c => c.codigo === st.planoCod)) st.planoCod = ativos[0].codigo;
    const cli = ativos.find(c => c.codigo === st.planoCod);
    if (st.planoTxt === undefined) st.planoTxt = planoDaApp(cli) || JSON.stringify(EXEMPLO, null, 2);
    let n = '?';
    try { n = (JSON.parse(st.planoTxt).treinos || []).length; } catch (e) { n = 'erro no texto'; }
    return `
      <div class="pts-card">
        <label style="margin-top:0">Cliente</label>
        <select data-in="planoCod">${ativos.map(c => `<option value="${esc(c.codigo)}" ${c.codigo === st.planoCod ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select>
        ${typeof PTSync.obterPlano === 'function'
          ? `<div style="margin-top:10px"><button class="pts-btn sec mini" data-a="daApp">↺ Carregar plano da PT Treinos</button></div>` : ''}
        <label>Plano (${n} treino${n === 1 ? '' : 's'})</label>
        <textarea data-in="planoTxt" spellcheck="false">${esc(st.planoTxt)}</textarea>
        <div class="pts-row" style="margin-top:10px">
          <button class="pts-btn" data-a="publicar">Publicar para ${esc(cli.nome.split(' ')[0])}</button>
          <span class="pts-sub f">${cli.planoAtualizado ? 'Último publicado: ' + esc(cli.planoAtualizado) : 'Ainda sem plano publicado'}</span>
        </div>
      </div>`;
  }
  function planoDaApp(cli) {
    if (typeof PTSync.obterPlano !== 'function' || !cli) return '';
    try { const p = PTSync.obterPlano(cli.nome, cli.codigo); return p ? JSON.stringify(p, null, 2) : ''; }
    catch (e) { return ''; }
  }

  /* ---------- Ligação ---------- */
  function vLigacao() {
    const c = cfg();
    return `
      <div class="pts-card">
        <label style="margin-top:0">URL da aplicação web (Apps Script, termina em /exec)</label>
        <input id="pts-url" value="${esc(c.url || '')}" placeholder="https://script.google.com/macros/s/…/exec">
        <label>Token de treinador</label>
        <input id="pts-token" value="${esc(c.token || '')}" autocomplete="off">
        <label>Link da página do cliente (GitHub Pages)</label>
        <input id="pts-link" value="${esc(c.linkCliente || '')}" placeholder="https://utilizador.github.io/pt-treinos/cliente.html">
        <label style="display:flex;gap:8px;align-items:center;color:var(--pts-txt)"><input type="checkbox" id="pts-auto" style="width:auto" ${c.auto !== false ? 'checked' : ''}> Publicar os planos automaticamente (ao abrir a CICLO e ao guardar)</label>
        <div style="margin-top:12px"><button class="pts-btn" data-a="guardarCfg">Guardar e testar</button></div>
      </div>
      <p class="pts-sub">Estes dados ficam só neste dispositivo. Não partilhes o token com clientes.</p>`;
  }

  /* ---------- eventos ---------- */
  ov.addEventListener('click', async e => {
    const el = e.target.closest('[data-a],[data-aba],[data-det],[data-copiar],[data-ativo],[data-plano],[data-apagar],[data-criar],[data-elim],[data-lf]');
    if (!el) return;
    const d = el.dataset;
    if (d.lf !== undefined) { st.listaF = d.lf; return render(); }
    if (d.elim) {
      const c = st.clientes.find(x => x.codigo === d.elim);
      if (!c || !confirm(`Eliminar o acesso de ${c.nome} (${c.codigo})?\nO cliente deixa de entrar na app e o plano publicado é apagado. Os treinos que já registou ficam guardados na folha.`)) return;
      try { await api('apagarCliente', { codigo: d.elim }); st.clientes = st.clientes.filter(x => x.codigo !== d.elim); st.msg = { t: `Acesso de ${c.nome} eliminado.`, ok: true }; }
      catch (err) { st.msg = { t: /desconhecida/i.test(err.message) ? 'O servidor ainda não tem a versão nova do Code.gs. Atualiza-o no Apps Script (Nova versão).' : err.message, err: true }; }
      return render();
    }
    if (d.criar) {
      const dup0 = st.clientes.find(c => norm(c.nome) === norm(d.criar));
      if (dup0) { st.msg = { t: `Já existe um acesso para "${dup0.nome}" (código ${dup0.codigo}).`, err: true }; return render(); }
      try { const r = await api('guardarCliente', { cliente: { nome: d.criar } }); st.clientes.push({ codigo: r.codigo, nome: d.criar, ativo: true, ultimoTreino: '', planoAtualizado: '' }); st.msg = { t: `Acesso criado para ${d.criar}: código ${r.codigo}`, ok: true }; }
      catch (err) { st.msg = { t: err.message, err: true }; }
      return render();
    }
    if (d.aba) { st.aba = d.aba; st.detalhe = null; st.msg = null; return render(); }
    if (d.det) { st.detalhe = d.det; window.scrollTo && ov.scrollTo(0, 0); return render(); }
    if (d.plano) { st.aba = 'plano'; st.planoCod = d.plano; st.planoTxt = undefined; return render(); }
    if (d.copiar !== undefined) {
      try { await navigator.clipboard.writeText(d.copiar); st.msg = { t: 'Link copiado.', ok: true }; }
      catch (err) { prompt('Copia o link:', d.copiar); }
      return render();
    }
    if (d.ativo) {
      const c = st.clientes.find(x => x.codigo === d.ativo);
      try { await api('guardarCliente', { cliente: { codigo: c.codigo, nome: c.nome, ativo: !c.ativo } }); c.ativo = !c.ativo; st.msg = null; }
      catch (err) { st.msg = { t: err.message, err: true }; }
      return render();
    }
    if (d.apagar) {
      if (!confirm('Apagar este registo de treino?')) return;
      try { await api('apagarRegisto', { id: d.apagar }); st.registos = st.registos.filter(r => r.id !== d.apagar); st.msg = { t: 'Registo apagado.', ok: true }; }
      catch (err) { st.msg = { t: err.message, err: true }; }
      return render();
    }
    switch (d.a) {
      case 'fechar': return PTSync.fechar();
      case 'atualizar': return atualizar();
      case 'voltar': st.detalhe = null; return render();
      case 'criarTodos': {
        const lista = faltamAcesso(); let n = 0;
        for (const nome of lista) {
          try { const r = await api('guardarCliente', { cliente: { nome: nome } }); st.clientes.push({ codigo: r.codigo, nome: nome, ativo: true, ultimoTreino: '', planoAtualizado: '' }); n++; }
          catch (err) { st.msg = { t: err.message, err: true }; break; }
        }
        if (n) st.msg = { t: `${n} acesso${n === 1 ? '' : 's'} criado${n === 1 ? '' : 's'}.`, ok: true };
        return render();
      }
      case 'criar': {
        const nome = (ov.querySelector('#pts-novo').value || '').trim();
        if (!nome) return;
        const dup = st.clientes.find(c => norm(c.nome) === norm(nome));
        if (dup) { st.msg = { t: `Já existe um acesso para "${dup.nome}" (código ${dup.codigo}).`, err: true }; return render(); }
        try {
          const r = await api('guardarCliente', { cliente: { nome: nome } });
          st.clientes.push({ codigo: r.codigo, nome: nome, ativo: true, ultimoTreino: '', planoAtualizado: '' });
          st.msg = { t: `Acesso criado para ${nome}: código ${r.codigo}`, ok: true };
        } catch (err) { st.msg = { t: err.message, err: true }; }
        return render();
      }
      case 'daApp': {
        const cli = st.clientes.find(c => c.codigo === st.planoCod);
        const t = planoDaApp(cli);
        st.planoTxt = t || st.planoTxt;
        st.msg = t ? { t: 'Plano carregado da PT Treinos.', ok: true } : { t: 'Não encontrei plano para este cliente na app.', err: true };
        return render();
      }
      case 'publicar': {
        let plano;
        try { plano = JSON.parse(st.planoTxt); } catch (err) { st.msg = { t: 'O texto do plano tem um erro de formato.', err: true }; return render(); }
        try {
          const r = await api('publicarPlano', { codigo: st.planoCod, plano: plano });
          const c = st.clientes.find(x => x.codigo === st.planoCod);
          if (c) c.planoAtualizado = new Date().toLocaleString('pt-PT');
          st.msg = { t: `Plano publicado (${r.treinos} treinos). O cliente vê-o ao abrir a página.`, ok: true };
        } catch (err) { st.msg = { t: err.message, err: true }; }
        return render();
      }
      case 'guardarCfg': {
        const c = {
          url: ov.querySelector('#pts-url').value.trim(),
          token: ov.querySelector('#pts-token').value.trim(),
          linkCliente: ov.querySelector('#pts-link').value.trim(),
          auto: ov.querySelector('#pts-auto').checked
        };
        guardarCfg(c);
        try { await api('ping'); st.msg = { t: 'Ligação OK ✓', ok: true }; st.aba = 'progresso'; st.carregado = false; atualizar(); }
        catch (err) { st.msg = { t: 'Falhou: ' + err.message, err: true }; render(); }
        return;
      }
    }
  });

  ov.addEventListener('input', e => {
    const k = e.target.dataset.in;
    if (!k) return;
    if (k === 'filtro') {
      st.filtro = e.target.value;
      const pos = e.target.selectionStart; render();
      const inp = ov.querySelector('[data-in="filtro"]'); if (inp) { inp.focus(); inp.setSelectionRange(pos, pos); }
    } else if (k === 'planoTxt') {
      st.planoTxt = e.target.value;
    }
  });
  ov.addEventListener('change', e => {
    if (e.target.dataset.in === 'planoCod') { st.planoCod = e.target.value; st.planoTxt = undefined; render(); }
  });
})();
