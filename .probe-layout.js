/* probe temporário de layout/CSS — não versionar */
(() => {
  const out = [];
  let fails = 0;
  const t = (name, cond, extra = '') => {
    if (!cond) fails++;
    out.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${cond ? '' : ` :: ${extra}`}`);
  };
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const byId = id => document.getElementById(id);
  const box = n => { const r = n.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
  const cs = (n, p) => getComputedStyle(n)[p];
  const cssVar = (n, v) => getComputedStyle(n).getPropertyValue(v).trim();
  const rgbFirst = n => parseInt((getComputedStyle(n)[n === document.body ? 'backgroundColor' : 'color'].match(/[\d.]+/) || [0])[0], 10);
  const calm = () => { document.documentElement.dataset.motion = 'off'; };
  calm();
  const vis = n => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && cs(n, 'visibility') !== 'hidden' && cs(n, 'display') !== 'none'; };

  try {
  /* ---- overlay do editor alinhado com o textarea ---- */
  const hl = byId('editor-hl');
  const ta = byId('note-content');
  const bh = box(hl);
  const bt = box(ta);
  t('overlay e textarea na mesma caixa',
    bh.x === bt.x && bh.y === bt.y && bh.w === bt.w && bh.h === bt.h, `${JSON.stringify(bh)} vs ${JSON.stringify(bt)}`);
  const props = ['fontFamily', 'fontSize', 'lineHeight', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'letterSpacing', 'wordSpacing', 'tabSize', 'whiteSpace', 'textTransform', 'fontVariantLigatures'];
  const diffs = props.filter(p => cs(hl, p) !== cs(ta, p));
  t('largura de texto igual nas duas camadas', hl.clientWidth === ta.clientWidth, `${hl.clientWidth} vs ${ta.clientWidth}`);
  t('métricas de texto idênticas', diffs.length === 0, diffs.map(p => `${p}: ${cs(hl, p)} != ${cs(ta, p)}`).join(' | '));
  const deltaPx = Math.abs(hl.scrollHeight - ta.scrollHeight);
  const lineH = parseFloat(cs(ta, 'lineHeight'));
  t('altura do overlay acompanha o texto (tolerância de 1 linha)', deltaPx <= lineH + 2,
    `${hl.scrollHeight} vs ${ta.scrollHeight} (linha ${lineH})`);
  ta.scrollTop = ta.scrollHeight;
  ta.dispatchEvent(new Event('scroll', { bubbles: true }));
  t('rolagem sincronizada com o overlay', hl.scrollTop === ta.scrollTop && hl.scrollTop > 0,
    `${hl.scrollTop} vs ${ta.scrollTop}`);
  ta.scrollTop = 0;
  ta.dispatchEvent(new Event('scroll', { bubbles: true }));
  t('volta ao topo sincronizado', hl.scrollTop === 0, String(hl.scrollTop));
  t('texto do textarea é transparente', cs(ta, 'color') === 'rgba(0, 0, 0, 0)', cs(ta, 'color'));
  t('caret visível', cs(ta, 'caretColor') !== 'transparent', cs(ta, 'caretColor'));
  t('overlay não captura o mouse', cs(hl, 'pointerEvents') === 'none', cs(hl, 'pointerEvents'));

  /* ---- texto longo e quebras de linha ---- */
  ta.value = ['linha muito longa para testar a quebra automática '.repeat(6),
    '', '- item com `código` e [[Nota]] e #tag',
    'uma linha ridiculously-longa-sem-espacos-que-deve-quebrar-so-em-barramento-para-nao-estourar-a-caixa',
    'acentuação: çãõéêíú àéîõü'].join('\n');
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  t('overlay acompanha texto longo', Math.abs(hl.scrollHeight - ta.scrollHeight) < 4, `${hl.scrollHeight} vs ${ta.scrollHeight}`);
  t('sem estouro horizontal no editor', ta.scrollWidth <= ta.clientWidth + 2, `${ta.scrollWidth} > ${ta.clientWidth}`);
  t('preview sem estouro horizontal', byId('note-preview').scrollWidth <= byId('note-preview').clientWidth + 2,
    `${byId('note-preview').scrollWidth} > ${byId('note-preview').clientWidth}`);

  /* ---- layout geral ---- */
  t('sidebar com largura definida', box(byId('sidebar')).w >= 200, String(box(byId('sidebar')).w));
  t('sidebar ocupa a altura toda', Math.abs(box(byId('sidebar')).h - window.innerHeight) < 2, String(box(byId('sidebar')).h));
  t('topbar sticky no topo', box($('.topbar')).y <= 1, String(box($('.topbar')).y));
  t('painel de notas visível', vis($('.notes-side')));
  t('painel do editor visível', vis($('.notes-editor')));
  const sideBySide = window.innerWidth > 860;
  t(sideBySide ? 'lista e editor lado a lado' : 'lista e editor empilhados no mobile',
    sideBySide ? box($('.notes-editor')).x > box($('.notes-side')).x
      : box($('.notes-editor')).y > box($('.notes-side')).y,
    `${JSON.stringify(box($('.notes-side')))} / ${JSON.stringify(box($('.notes-editor')))}`);
  t('lista de notas com altura útil', byId('note-list').clientHeight > 150, String(byId('note-list').clientHeight));
  t('editor tem altura útil', byId('note-content').clientHeight >= (narrowVar() ? 150 : 290),
    String(byId('note-content').clientHeight));
  function narrowVar() { return window.innerWidth <= 900; }
  out.push(`DIAG alturas topbar=${box($('.topbar')).h} content=${box($('.content')).h} layout=${box($('.notes-layout')).h} side=${box($('.notes-side')).h} editor=${box($('.notes-editor')).h} statusbar=${box($('.statusbar')).y} innerH=${window.innerHeight}`);
  const sb = box($('.statusbar'));
  t('statusbar visível', sb.h > 0 && vis($('.statusbar')), JSON.stringify(sb));
  if (window.innerWidth > 860) {
    t('statusbar no fim da página no desktop', sb.y + sb.h <= window.innerHeight + 2, `${sb.y} + ${sb.h} > ${window.innerHeight}`);
  }
  t('sem rolagem horizontal na página', document.documentElement.scrollWidth <= window.innerWidth + 1,
    `${document.documentElement.scrollWidth} > ${window.innerWidth}`);
  t('relogio com hora', /\d\d:\d\d:\d\d/.test(byId('clock-time').textContent), byId('clock-time').textContent);
  t('tag-chip com estilo', cs($('.tag-chip'), 'borderRadius') !== '0px');

  /* ---- modos de visualização ---- */
  const editorBody = byId('editor-body');
  const cols = () => cs(editorBody, 'gridTemplateColumns').split(' ').length;
  click('.mode-btn[data-mode="split"]');
  const narrow = window.innerWidth <= 900;
  t(narrow ? 'modo dividido vira 2 linhas no mobile' : 'modo dividido tem 2 colunas',
    narrow ? (cs(editorBody, 'gridTemplateRows').split(' ').length === 2 && cols() === 1)
      : cols() === 2,
    `${cs(editorBody, 'gridTemplateColumns')} / ${cs(editorBody, 'gridTemplateRows')}`);
  click('.mode-btn[data-mode="edit"]');
  t('modo edição tem 1 coluna', cols() === 1 && vis(byId('note-content')) && !vis(byId('note-preview')),
    `${cs(editorBody, 'gridTemplateColumns')} prev=${vis(byId('note-preview'))}`);
  click('.mode-btn[data-mode="preview"]');
  t('modo preview tem 1 coluna e esconde o editor',
    cols() === 1 && vis(byId('note-preview')) && !vis(byId('note-content')), cs(editorBody, 'gridTemplateColumns'));
  click('.mode-btn[data-mode="split"]');
  t('volta para dividido', vis(byId('note-content')) && vis(byId('note-preview')) && cs(editorBody, 'gridTemplateColumns').split(' ').length === (narrow ? 1 : 2),
    cs(editorBody, 'gridTemplateColumns'));

  /* ---- modais ---- */
  document.querySelector('[data-action="open-notebooks"]').click();
  const modal = byId('notebook-modal');
  calm();
  t('modal visível', vis(modal) && cs(modal, 'pointerEvents') === 'auto', `${cs(modal, 'opacity')} ${cs(modal, 'pointerEvents')}`);
  const bm = box(modal);
  const vp = box(byId('backdrop'));
  t('modal centralizado no viewport',
    Math.abs((bm.x + bm.w / 2) - (vp.x + vp.w / 2)) < 2 && Math.abs((bm.y + bm.h / 2) - (vp.y + vp.h / 2)) < 2,
    `${JSON.stringify(bm)} vs ${JSON.stringify(vp)}`);
  t('fundo do modal cobre a tela', vp.w >= window.innerWidth - 12 && vp.h >= window.innerHeight - 1, JSON.stringify(vp));
  t('linhas do gerenciador visíveis', $$('#notebook-manager .nb-row').length === notebooks.length,
    `${$$('#notebook-manager .nb-row').length} vs ${notebooks.length}`);
  t('select de pasta pai tem opções', $$('#notebook-manager .nb-parent').length === notebooks.length);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  t('Esc fecha o modal', cs(modal, 'pointerEvents') === 'none', cs(modal, 'pointerEvents'));

  /* ---- toasts ---- */
  const toastsBefore = $$('#toasts .toast').length;
  calm();
  toast('mensagem de teste', 'ok');
  const lastToast = $$('#toasts .toast').pop();
  const toastBox = box(lastToast);
  t('toast novo aparece', $$('#toasts .toast').length === toastsBefore + 1);
  t('toast no canto inferior direito',
    toastBox.x + toastBox.w <= window.innerWidth + 1 && toastBox.y + toastBox.h <= window.innerHeight && toastBox.y + toastBox.h > window.innerHeight - 120,
    JSON.stringify(toastBox));
  t('toast tem ícone e texto', !!$('#toasts .toast svg') && lastToast.textContent.includes('teste'), lastToast.textContent);


  /* ---- grid de temas ---- */
  document.querySelector('.nav-item[data-view="settings"]').click();
  t('6 cartões de tema', $$('[data-theme-id]').length === 6, String($$('[data-theme-id]').length));
  const card = $('[data-theme-id="matrix"]');
  t('cartão de tema visível', vis(card));
  t('miniatura do tema com altura', box($('.theme-prev')).h > 40, String(box($('.theme-prev')).h));
  t('tema ativo marcado', $('[data-theme-id="midnight"]').classList.contains('is-active'));
  t('painel de ajustes visível', vis($('#view-settings')));
  t('grade de ajustes em 1 coluna larga', cs($('#view-settings'), 'display') === 'flex');

  /* ---- temas mudam as variáveis ---- */
  const readVars = () => {
    const s = getComputedStyle(document.documentElement);
    return ['--bg', '--bg-2', '--text', '--muted', '--border', '--accent'].map(v => s.getPropertyValue(v).trim()).join('|');
  };
  const antes = readVars();
  document.querySelector('[data-theme-id="paper"]').click();
  const depois = readVars();
  t('tema claro muda as variáveis', antes !== depois);
  t('tema claro tem fundo claro', rgbFirst(document.body) > 180, cs(document.body, 'backgroundColor'));
  t('tema claro tem texto escuro', parseInt((cs(document.body, 'color').match(/[\d.]+/) || [999])[0], 10) < 80, cs(document.body, 'color'));
  document.querySelector('[data-theme-id="amber"]').click();
  t('tema âmbar aplicado', cssVar(document.documentElement, '--accent') === '#f59e0b', cssVar(document.documentElement, '--accent'));
  document.querySelector('[data-theme-id="midnight"]').click();

  /* ---- responsivo ---- */
  calm();
  const sidebarBox = box(byId('sidebar'));
  if (window.innerWidth <= 900) {
    t('sidebar some da tela no mobile', sidebarBox.x + sidebarBox.w <= 1, JSON.stringify(sidebarBox));
    t('botão de menu visível no mobile', vis(byId('btn-menu')));
    document.querySelector('#btn-menu').click();
    out.push(`DIAG sidebar classes="${byId('sidebar').className}" transform=${cs(byId('sidebar'), 'transform')} box=${JSON.stringify(box(byId('sidebar')))}`);
    t('menu abre no mobile', box(byId('sidebar')).x >= -1, JSON.stringify(box(byId('sidebar'))));
    document.querySelector('#btn-menu').click();
  } else {
    t('sidebar fixa no desktop', sidebarBox.x === 0);
    t('botão de menu escondido no desktop', !vis(byId('btn-menu')));
  }

  /* ---- fonte monoespaçada e tamanho ---- */
  const s1 = cs(byId('note-content'), 'fontSize');
  document.getElementById('opt-editor-size').value = '20';
  document.getElementById('opt-editor-size').dispatchEvent(new Event('input', { bubbles: true }));
  t('fonte do editor acompanha o ajuste', cs(byId('note-content'), 'fontSize') === '20px' && cs(byId('editor-hl'), 'fontSize') === '20px',
    `${s1} -> ${cs(byId('note-content'), 'fontSize')}`);
  t('altura de linha continua 1.75', cs(byId('note-content'), 'lineHeight') === `${Math.round(20 * 1.75)}px`, cs(byId('note-content'), 'lineHeight'));

  } catch (e) { fails++; out.push('EXCEÇÃO — ' + String(e && e.stack || e).replace(/\n/g, ' ⏎ ')); }

  const pre = document.createElement('pre');
  pre.id = 'probe-results';
  pre.textContent = `\n===${fails === 0 ? ' TODOS PASSARAM' : ` ${fails} FALHAS`} ===\n` + out.join('\n');
  document.body.appendChild(pre);

  function click(sel) {
    const n = typeof sel === 'string' ? $(sel) : sel;
    n.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }
})();