/* probe temporário de verificação — não versionar */
(function () {
  const out = [];
  let fails = 0;
  const t = (name, cond, extra = '') => {
    if (!cond) fails++;
    out.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${cond ? '' : ` :: ${extra}`}`);
  };
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const byId = id => document.getElementById(id);
  const click = node => {
    if (!node) throw new Error('click em null');
    node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  };
  const submit = form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  const input = (node, v) => {
    node.value = v;
    node.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const change = (node, v) => {
    if (node.type === 'checkbox') node.checked = v;
    else node.value = v;
    node.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const rows = () => $$('#note-list .note-row');
  const rowFor = title => rows().find(r => r.textContent.includes(title));
  const previewHtml = () => byId('note-preview').innerHTML;
  const openNoteByTitle = title => click(rowFor(title));
  const nbBtn = name => $$('#notebook-tree [data-notebook]').find(b => b.textContent.includes(name));
  const tagBtn = tag => $$('#tag-list [data-tag]').find(b => b.dataset.tag === tag);
  const errors = [];
  window.addEventListener('error', e => errors.push(e.message));
  let crash = null;
  try {

  /* ---- 1. boot + seed ---- */
  t('app sem erro de JS no boot', errors.length === 0, errors.join(' | '));
  t('seed criou 5 notas', byId('nav-count-notes').textContent === '5', byId('nav-count-notes').textContent);
  t('lista mostra 5 linhas', rows().length === 5, String(rows().length));
  t('nota fixada vem primeiro', rows()[0].textContent.includes('Bem-vindo'), rows()[0].textContent.slice(0, 40));
  t('título carregado no editor', byId('note-title').value === 'Bem-vindo ao NeoDrop', byId('note-title').value);
  t('4 pastas na árvore', $$('#notebook-tree [data-toggle-nb]').length === 4, String($$('#notebook-tree [data-toggle-nb]').length));
  t('subpasta com profundidade 1',
    nbBtn('Async & Promises').closest('.tree-row').style.getPropertyValue('--depth') === '1',
    nbBtn('Async & Promises').closest('.tree-row').style.cssText);
  t('contador "sem pasta" correto', nbBtn('Sem pasta').querySelector('.n').textContent === '1',
    nbBtn('Sem pasta').querySelector('.n').textContent);
  t('contador recursivo de subpastas',
    nbBtn('JavaScript').querySelector('.n').textContent === '2',
    nbBtn('JavaScript').querySelector('.n').textContent);

  /* ---- 2. markdown ---- */
  t('preview com h1', !!$('#note-preview h1'));
  t('preview com tabela', !!$('#note-preview table td'));
  t('preview com bloco de código + lang', !!$('#note-preview pre[data-lang="js"]'));
  t('preview com negrito', !!$('#note-preview strong'));
  t('preview com citação', !!$('#note-preview blockquote'));
  t('preview com wiki-link clicável', !!$('#note-preview .md-wiki[data-open-note]'));
  t('preview com tag clicável', !!$('#note-preview .md-tag[data-tag="neodrop"]'));
  t('realce tem título colorido', !!$('#editor-hl .tk-head'));
  t('realce tem código inline', !!$('#editor-hl .tk-code'));
  t('realce tem marcador de lista', !!$('#editor-hl .tk-punct'));
  t('realce não injeta HTML', !byId('editor-hl').innerHTML.includes('<script'));
  t('textarea tem cor transparente (overlay visível)',
    getComputedStyle(byId('note-content')).color === 'rgba(0, 0, 0, 0)',
    getComputedStyle(byId('note-content')).color);

  t('lista aninhada vira ul dentro de li',
    mdToHtml('- a\n  - b\n- c').includes('<ul><li>b</li></ul>'), mdToHtml('- a\n  - b\n- c'));
  t('lista numerada com start', mdToHtml('3. x\n4. y').includes('<ol start="3">'), mdToHtml('3. x\n4. y'));
  t('checklist marcado', mdToHtml('- [x] feito').includes('checked'), mdToHtml('- [x] feito'));
  t('heading setext', mdToHtml('Titulo\n=====').includes('<h1'), mdToHtml('Titulo\n====='));
  t('hr', mdToHtml('---').includes('<hr>'), mdToHtml('---'));
  t('frontmatter some do preview', mdToHtml('---\ntitle: x\n---\ncorpo').trim() === '<p>corpo</p>',
    mdToHtml('---\ntitle: x\n---\ncorpo'));
  t('del e mark', mdToHtml('~~x~~ e ==y==').includes('<del>x</del>') && mdToHtml('~~x~~ e ==y==').includes('<mark>y</mark>'));
  t('link externo com rel seguro', mdToHtml('[a](https://x.com)').includes('rel="noopener noreferrer"'));
  t('javascript: bloqueado', mdToHtml('[a](javascript:alert(1))').includes('href="#"'));
  t('html escapado', !mdToHtml('<img src=x onerror=alert(1)>').includes('<img src=x'));
  t('tag dentro de código não vira botão', !mdToHtml('`#tag`').includes('md-tag'), mdToHtml('`#tag`'));
  t('link inexistente vira texto', mdToHtml('[[Nada Aqui]]').includes('is-missing'));
  t('tabela com alinhamento', mdToHtml('| a | b |\n| :-- | --: |\n| 1 | 2 |').includes('text-align:right'));
  t('realce: **forte**', !!$('#editor-hl .tk-strong'));
  t('realce: ==marca==', highlightMd('a ==b==').includes('tk-mark'), highlightMd('a ==b=='));
  t('realce: [[wiki]]', highlightMd('a [[B]]').includes('tk-wiki'), highlightMd('a [[B]]'));
  t('realce: #tag', highlightMd('a #b').includes('tk-tag'), highlightMd('a #b'));
  t('realce: **forte** e *itálico*',
    highlightMd('**a** e *b*').includes('tk-strong') && highlightMd('**a** e *b*').includes('tk-em'),
    highlightMd('**a** e *b*'));
  t('realce: link e citação',
    highlightMd('[a](https://x.com)').includes('tk-link') && highlightMd('> a').includes('tk-quote'),
    highlightMd('[a](https://x.com)') + ' | ' + highlightMd('> a'));
  t('realce escapa HTML', highlightMd('<b>x</b>').includes('&lt;b&gt;'), highlightMd('<b>x</b>'));

  /* ---- 3. busca e filtros ---- */
  input(byId('global-search'), 'bisect');
  t('busca filtra a lista', rows().length === 1, String(rows().length));
  t('chip de filtro de busca visível', $$('#filter-note .fchip').length === 1);
  click($('#filter-note .fchip button'));
  t('limpar busca volta 5 notas', rows().length === 5, String(rows().length));

  click(nbBtn('JavaScript'));
  t('filtro por pasta (direta)', rows().length === 1, String(rows().length));
  click(nbBtn('Async & Promises'));
  t('filtro por subpasta', rows().length === 1, String(rows().length));
  click(nbBtn('Sem pasta'));
  t('filtro sem pasta', rows().length === 1, String(rows().length));
  click(nbBtn('Todas as notas'));
  t('volta para todas', rows().length === 5, String(rows().length));

  click(tagBtn('git'));
  t('filtro por tag no sidebar', rows().length === 1, String(rows().length));
  click(tagBtn('git'));
  t('clicar de novo limpa a tag', rows().length === 5, String(rows().length));
  click(tagBtn('javascript'));
  t('tag com 2 notas', rows().length === 2, String(rows().length));
  click($('[data-action="clear-tag-filter"]'));
  t('botão limpa filtro de tag', rows().length === 5, String(rows().length));

  /* ---- 4. editar ---- */
  openNoteByTitle('Roadmap');
  const ta = byId('note-content');
  input(ta, 'linha um\nlinha dois #novatag');
  t('contador de palavras atualiza', byId('note-meta').textContent.startsWith('5 palavras'), byId('note-meta').textContent);
  t('nova tag aparece no cabeçalho', !!$('#note-tags-row [data-tag="novatag"]'));
  t('nova tag entra no sidebar', !!tagBtn('novatag'));
  t('preview acompanha digitação', previewHtml().includes('linha um'));
  t('conteúdo do usuário não injeta HTML',
    !previewHtml().includes('<img') && window.__xss === undefined, previewHtml().slice(0, 90));

  const ta2 = byId('note-content');
  ta2.setSelectionRange(0, 5);
  click($('.tool[data-wrap="**"]'));
  t('ferramenta negrito insere **', ta2.value.startsWith('**linha**'), ta2.value);
  ta2.setSelectionRange(ta2.value.length, ta2.value.length);
  click($('.tool[data-prefix="- "]'));
  t('ferramenta lista converte a linha atual', ta2.value.endsWith('- linha dois #novatag'), JSON.stringify(ta2.value));
  click($('.tool[data-prefix="- [ ] "]'));
  t('ferramenta tarefa converte a linha', ta2.value.endsWith('- [ ] linha dois #novatag'), JSON.stringify(ta2.value));
  click($('.tool[data-prefix="- [ ] "]'));
  t('ferramenta tarefa remove o marcador', ta2.value.endsWith('linha dois #novatag'), JSON.stringify(ta2.value));
  click($('.tool[data-prefix="- "]'));
  t('ferramenta lista alterna de volta', ta2.value.endsWith('linha dois #novatag'), JSON.stringify(ta2.value));
  click($('.tool[data-prefix="# "]'));
  t('ferramenta título aplica no início', ta2.value.endsWith('# linha dois #novatag'), JSON.stringify(ta2.value));
  ta2.setSelectionRange(ta2.value.length, ta2.value.length);
  click($('.tool[data-wrap="`"]'));
  t('ferramenta código insere crase dupla', ta2.value.endsWith('``'), JSON.stringify(ta2.value));

  click($('.mode-btn[data-mode="preview"]'));
  t('modo preview esconde o textarea', byId('editor-body').dataset.mode === 'preview');
  click($('.mode-btn[data-mode="split"]'));
  t('modo dividir volta', byId('editor-body').dataset.mode === 'split');

  change(byId('note-notebook'), $$('#note-notebook option')[1].value);
  t('mover nota para pasta', $('#note-notebook').value === $$('#note-notebook option')[1].value);
  t('opções da select mostram hierarquia',
    $$('#note-notebook option').some(o => o.textContent.includes('— ')),
    $$('#note-notebook option').map(o => o.textContent).join('|'));

  /* ---- 5. backlinks e wiki-link ---- */
  openNoteByTitle('Bem-vindo');
  const wiki = $$('#note-preview .md-wiki')[0];
  const wikiTitle = wiki && wiki.dataset.openNote;
  click(wiki);
  t('wiki-link abre a nota', byId('note-title').value === wikiTitle, `${byId('note-title').value} != ${wikiTitle}`);
  t('backlinks listam quem aponta para a nota', $$('#backlinks .bl-list li').length >= 1,
    String($$('#backlinks .bl-list li').length));
  t('backlinks mostram caminho de origem', !!$('#backlinks .bl-list button span'));
  openNoteByTitle('Roadmap');
  t('backlinks sem origem mostra ajuda', !!$('#backlinks .bl-empty'), $('#backlinks').textContent.slice(0, 60));

  /* ---- 6. nova nota + pin + xss ---- */
  const before = Number(byId('nav-count-notes').textContent);
  click($('[data-action="new-note"]'));
  t('nova nota aumenta o contador', Number(byId('nav-count-notes').textContent) === before + 1);
  t('nova nota abre vazia', byId('note-title').value === '' && byId('note-content').value === '');
  t('nova nota entra na lista', rows().length === 6, String(rows().length));
  t('sem nota o estado fica coerente', rows().some(r => r.textContent.includes('Sem título')),
    rows().map(r => r.textContent.slice(0, 12)).join(' | '));
  input(byId('note-title'), 'Nota de teste');
  t('título aparece na lista', !!rowFor('Nota de teste'), rows().map(r => r.textContent.slice(0, 16)).join(' | '));
  click($('[data-action="toggle-pin"]'));
  t('fixar marca a nota com pin', !!rowFor('Nota de teste') && rowFor('Nota de teste').textContent.includes('📌'));
  t('botão fixar fica ativo', byId('btn-pin').classList.contains('is-active'));
  click($('[data-action="toggle-pin"]'));
  t('desafixar remove o pin', !rowFor('Nota de teste').textContent.includes('📌'));
  t('desafixar desativa o botão', !byId('btn-pin').classList.contains('is-active'));
  input(byId('note-content'), 'conteúdo novo');
  t('conteúdo salvo na nota', notes.find(n => n.id === ui.activeId).content === 'conteúdo novo');

  /* ---- 7. pastas: criar, mover, renomear, excluir ---- */
  const nbCount = notebooks.length;
  click($('[data-action="open-notebooks"]'));
  t('modal de pastas abre pelo botão lateral', byId('notebook-modal').classList.contains('is-open'));
  submit(byId('notebook-add-form'));
  t('nome vazio é recusado', notebooks.length === nbCount && !!$('#toasts .toast'), String(notebooks.length));
  input(byId('notebook-new'), 'Teste');
  submit(byId('notebook-add-form'));
  t('criar pasta', notebooks.length === nbCount + 1, String(notebooks.length));
  const created = notebooks.find(x => x.name === 'Teste');
  t('pasta aparece na árvore', !!$(`#notebook-tree [data-notebook="${created.id}"]`));
  const row = $(`.nb-row[data-nb="${created.id}"]`);
  t('gerenciador mostra a linha', !!row);
  t('campo de nome recebe foco', document.activeElement === byId('notebook-new') || document.activeElement === row.querySelector('.nb-name'),
    document.activeElement.className);

  const target = notebooks.find(nb => nb.name === 'Receitas');
  change(row.querySelector('.nb-parent'), target.id);
  t('reparentar a pasta', notebooks.find(nb => nb.id === created.id).parentId === target.id);
  t('árvore reflete o novo nível',
    $(`#notebook-tree [data-notebook="${created.id}"]`).closest('.tree-row').style.getPropertyValue('--depth') === '1',
    $(`#notebook-tree [data-notebook="${created.id}"]`).closest('.tree-row').style.cssText);
  change(row.querySelector('.nb-name'), 'Renomeada');
  t('renomear pasta', !!nbBtn('Renomeada'), notebooks.map(x => x.name).join('|'));

  const nbBefore2 = notebooks.length;
  click($$(`#notebook-tree [data-notebook="${target.id}"]`)[0].closest('.tree-row').querySelector('[data-add-child]'));
  t('criar subpasta pelo botão da linha', notebooks.length === nbBefore2 + 1);
  t('gerenciador aberto com a subpasta', byId('notebook-modal').classList.contains('is-open'));
  const sub = notebooks[notebooks.length - 1];
  const nbBefore3 = notebooks.length;
  click($(`.nb-row[data-nb="${sub.id}"] .nb-del`));
  t('excluir subpasta pede confirmação', byId('confirm-modal').classList.contains('is-open'));
  click(byId('confirm-ok'));
  t('excluir subpasta remove da lista', notebooks.length === nbBefore3 - 1, String(notebooks.length));
  t('subpasta deletada some do gerenciador', !$(`.nb-row[data-nb="${sub.id}"]`));

  click(nbBtn('Renomeada').closest('.tree-row').querySelector('[data-del-nb]'));
  t('excluir pede confirmação', byId('confirm-modal').classList.contains('is-open'));
  click(byId('confirm-ok'));
  t('excluir pasta remove da árvore', !nbBtn('Renomeada'), notebooks.map(x => x.name).join('|'));

  /* ---- 8. lixeira ---- */
  openNoteByTitle('Nota de teste');
  click($('[data-action="note-trash"]'));
  click(byId('confirm-ok'));
  t('nota vai para a lixeira', Number(byId('nav-count-trash').textContent) === 1, byId('nav-count-trash').textContent);
  click($('.nav-item[data-view="trash"]'));
  t('lista da lixeira mostra 1 nota', $$('#trash-list .note-row').length === 1, String($$('#trash-list .note-row').length));
  t('nota excluída some da lista de notas', !rowFor('Nota de teste'));
  click($('[data-restore]'));
  t('restaurar volta a nota', Number(byId('nav-count-trash').textContent) === 0, byId('nav-count-trash').textContent);
  click($('.nav-item[data-view="notes"]'));
  t('nota restaurada reaparece', !!rowFor('Nota de teste'));

  openNoteByTitle('Nota de teste');
  click($('[data-action="note-trash"]'));
  click(byId('confirm-ok'));
  click($('.nav-item[data-view="trash"]'));
  click($('[data-purge]'));
  t('excluir de vez pede confirmação', byId('confirm-modal').classList.contains('is-open'));
  click(byId('confirm-ok'));
  t('excluir de vez remove a nota', !notes.some(n => n.title === 'Nota de teste'));
  click($('.nav-item[data-view="notes"]'));

  /* ---- 9. criar nota a partir de outra view ---- */
  click($('.nav-item[data-view="settings"]'));
  const cnt2 = Number(byId('nav-count-notes').textContent);
  click($('[data-action="new-note"]'));
  t('criar nota da view Ajustes volta para Notas', ui.view === 'notes');
  t('contador cresce', Number(byId('nav-count-notes').textContent) === cnt2 + 1);
  t('editor mostra a nota nova', byId('note-content').disabled === false && !$('#note-preview').closest('.is-hidden'));
  byId('note-title').blur();
  click($('[data-action="note-trash"]'));
  click(byId('confirm-ok'));

  /* ---- 10. prefs ---- */
  click($('.nav-item[data-view="settings"]'));
  click($('[data-theme-id="paper"]'));
  t('trocar tema', document.documentElement.dataset.theme === 'paper');
  t('cartão do tema fica marcado', $('[data-theme-id="paper"]').classList.contains('is-active'));
  click($('[data-theme-id="midnight"]'));
  const sizeInput = byId('opt-editor-size');
  input(sizeInput, '18');
  t('tamanho da fonte do editor', getComputedStyle(document.documentElement).getPropertyValue('--editor-size').trim() === '18px');
  t('textarea usa a variável de fonte', getComputedStyle(byId('note-content')).fontSize === '18px',
    getComputedStyle(byId('note-content')).fontSize);
  change(byId('opt-font'), 'mono');
  t('fonte da interface', document.documentElement.dataset.font === 'mono');
  change(byId('opt-font'), 'system');
  change(byId('opt-autosync'), false);
  t('autosync desligado', prefs.autosync === false);
  change(byId('opt-autosync'), true);
  change(byId('opt-compact'), true);
  t('densidade compacta', document.documentElement.dataset.density === 'compact');
  change(byId('opt-compact'), false);
  change(byId('opt-motion'), false);
  t('movimento desligado', document.documentElement.dataset.motion === 'off');
  change(byId('opt-motion'), true);
  input(byId('accent-picker-2'), '#ff8800');
  t('accent customizado', document.documentElement.style.getPropertyValue('--accent') === '#ff8800',
    document.documentElement.style.getPropertyValue('--accent'));
  t('accent marca prefs como customizado', prefs.accentCustom === true);
  t('prefs de tema salvo', JSON.parse(localStorage.getItem('neodrop.prefs')).density === 'normal',
    JSON.parse(localStorage.getItem('neodrop.prefs')).density);

  /* ---- 11. disco (.md) ---- */
  const nb = notebooks.find(x => x.name === 'Receitas');
  const note = notes.find(x => x.notebookId === nb.id);
  const md = noteToMd(note);
  t('frontmatter tem id/title/tags',
    /^---\nid: .+\ntitle: ".+"\ntags: \[/.test(md), md.split('\n').slice(0, 5).join(' / '));
  t('frontmatter tem notebook', md.includes(`notebook: "${nbPath(nb.id)}"`),
    md.split('\n').filter(l => l.startsWith('notebook')).join(''));
  const parsed = parseFrontmatter(md);
  t('parse: id confere', parsed.data.id === note.id, String(parsed.data.id));
  t('parse: title confere', parsed.data.title === note.title, String(parsed.data.title));
  t('parse: tags viram lista', Array.isArray(parsed.data.tags) && parsed.data.tags.join(',') === noteTags(note).join(','),
    `${JSON.stringify(parsed.data.tags)} vs ${JSON.stringify(noteTags(note))}`);
  t('parse: notebook confere', parsed.data.notebook === nbPath(nb.id), String(parsed.data.notebook));
  t('parse: corpo limpo', parsed.body.trim() === note.content.trim());
  const parsed2 = parseFrontmatter('---\ntags:\n  - a\n  - b\ntitle: "x"\n---\n\ncorpo');
  t('parse: lista YAML com "- "', JSON.stringify(parsed2.data.tags) === '["a","b"]', JSON.stringify(parsed2.data.tags));
  t('parse: sem frontmatter devolve o texto', parseFrontmatter('só texto').data.id === undefined);
  t('slug de nome de arquivo', fileNameFor(note) === `${slugKey(note.title)}.md`, fileNameFor(note));
  t('títulos iguais não colidem', fileNameFor({ title: 'a/b c' }) !== fileNameFor({ title: 'ab c' }),
    `${fileNameFor({ title: 'a/b c' })} vs ${fileNameFor({ title: 'ab c' })}`);
  t('pasta física sanitizada', folderSegments(nb.id).join('/') === 'Receitas', folderSegments(nb.id).join('/'));
  t('aviso de suporte do disco', byId('fs-support').textContent.length > 20, byId('fs-support').textContent);
  t('sem pasta mostra aviso do navegador', byId('disk-name').textContent === 'Sem pasta', byId('disk-name').textContent);
  t('botão sincronizar desabilitado sem pasta', byId('disk-sync').disabled);
  t('botão escolher pasta presente', !!$('[data-action="pick-folder"]'));

  /* ---- 12. teclado e statusbar ---- */
  click($('.nav-item[data-view="notes"]'));
  byId('global-search').blur();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
  t('"/" foca a busca', document.activeElement === byId('global-search'), document.activeElement.id);
  input(byId('global-search'), '');
  const cnt3 = Number(byId('nav-count-notes').textContent);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true }));
  t('Ctrl+N cria nota', Number(byId('nav-count-notes').textContent) === cnt3 + 1);
  const ta3 = byId('note-content');
  ta3.focus();
  ta3.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true, cancelable: true }));
  t('Ctrl+B aplica negrito no editor', ta3.value.startsWith('****'), JSON.stringify(ta3.value));
  ta3.value = '';
  ta3.dispatchEvent(new Event('input', { bubbles: true }));
  ta3.focus();
  ta3.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', ctrlKey: true, bubbles: true, cancelable: true }));
  t('Ctrl+I aplica itálico no editor', ta3.value === '**', JSON.stringify(ta3.value));
  ta3.value = '';
  ta3.dispatchEvent(new Event('input', { bubbles: true }));
  ta3.focus();
  ta3.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  t('Tab insere dois espaços', ta3.value.startsWith('  '), JSON.stringify(ta3.value.slice(0, 6)));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
  t('Ctrl+S avisa que falta a pasta', $$('#toasts .toast').some(x => /pasta/i.test(x.textContent)),
    $$('#toasts .toast').map(x => x.textContent).join(' | '));
  t('statusbar mostra atalhos', /Ctrl/.test(document.querySelector('.statusbar').textContent));
  t('statusbar mostra contagem de notas', byId('status-left').textContent.length > 0, byId('status-left').textContent);

  /* ---- 13. persistência ---- */
  t('notas salvas no localStorage', JSON.parse(localStorage.getItem('neodrop.notes')).length === notes.length);
  t('pastas salvas no localStorage', JSON.parse(localStorage.getItem('neodrop.notebooks')).length === notebooks.length);
  t('prefs salvas no localStorage', JSON.parse(localStorage.getItem('neodrop.prefs')).theme === 'midnight');
  const payload = exportPayload();
  t('export JSON tem as chaves', !!payload.notes && !!payload.notebooks && !!payload.prefs && payload.version === 1,
    Object.keys(payload).join(','));
  t('export JSON serializa sem erro', (() => { try { return JSON.parse(JSON.stringify(payload)).notes.length === notes.length; } catch (e) { return false; } })());
  t('export dispara download sem erro', (() => { try { exportData(); return $$('#toasts .toast').some(x => /exportado/i.test(x.textContent)); } catch (e) { return false; } })());

  t('nenhum erro de JS no fim', errors.length === 0, errors.join(' | '));

  } catch (e) { crash = e && (e.stack || e.message || String(e)); }
  if (crash) { fails++; out.push('EXCEÇÃO — ' + String(crash).replace(/\n/g, ' ⏎ ')); }
  const pre = document.createElement('pre');
  pre.id = 'probe-results';
  pre.textContent = `\n===${fails === 0 ? ' TODOS PASSARAM' : ` ${fails} FALHAS`} ===\n` + out.join('\n');
  document.body.appendChild(pre);
})();