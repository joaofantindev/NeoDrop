/* probe temporário da camada de disco — não versionar */
(async () => {
  const out = [];
  let fails = 0;
  const pre0 = { el: null };
  const flush = () => {
    if (!pre0.el) return;
    pre0.el.textContent = `\n===${fails === 0 ? ' TODOS PASSARAM' : ` ${fails} FALHAS`} ===\n` + out.join('\n');
  };
  const t = (name, cond, extra = '') => {
    if (!cond) fails++;
    out.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${cond ? '' : ` :: ${extra}`}`);
    flush();
  };
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const byId = id => document.getElementById(id);
  const nbBtn = name => Array.from(document.querySelectorAll('#notebook-tree [data-notebook]'))
    .find(b => b.textContent.includes(name));
  const click = node => node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  const errors = [];
  window.addEventListener('error', e => errors.push(e.message));
  window.addEventListener('unhandledrejection', e => errors.push('rejection: ' + (e.reason && e.reason.message || e.reason)));
  const pre = document.createElement('pre');
  pre.id = 'probe-results';
  pre0.el = pre;
  pre.textContent = 'rodando...';
  document.body.appendChild(pre);
  let crash = null;

  /* ---- mock em memória da File System Access API ---- */
  const store = new Map();          // caminho relativo -> texto
  const dirs = new Set(['']);        // caminho relativo de diretório ('' = raiz)
  class FileMock {
    constructor(path) { this.kind = 'file'; this.name = path.split('/').pop(); this.path = path; }
    async getFile() { return new File([store.get(this.path) ?? ''], this.name, { type: 'text/markdown' }); }
    async createWritable() {
      let buf = '';
      const path = this.path;
      return {
        async write(d) { buf += typeof d === 'string' ? d : new TextDecoder().decode(d); },
        async truncate() { buf = ''; },
        async close() { store.set(path, buf); },
        async abort() {}
      };
    }
  }
  class DirMock {
    constructor(path) {
      this.kind = 'directory';
      this.name = path === '' ? 'Notas' : path.split('/').pop();
      this.path = path;
    }
    get _pre() { return this.path === '' ? '' : `${this.path}/`; }
    async queryPermission() { return 'granted'; }
    async requestPermission() { return 'granted'; }
    async getDirectoryHandle(name, opts = {}) {
      const p = this._pre + name;
      if (!dirs.has(p) && !opts.create) { const e = new Error('nf'); e.name = 'NotFoundError'; throw e; }
      dirs.add(p);
      return new DirMock(p);
    }
    async getFileHandle(name, opts = {}) {
      const p = this._pre + name;
      if (!store.has(p) && !opts.create) { const e = new Error('nf'); e.name = 'NotFoundError'; throw e; }
      return new FileMock(p);
    }
    async removeEntry(name) { store.delete(this._pre + name); }
    async *values() {
      const pre = this._pre;
      const seen = new Set();
      for (const p of [...dirs, ...store.keys()]) {
        if (p === this.path || !p.startsWith(pre)) continue;
        const seg = p.slice(pre.length).split('/')[0];
        if (!seg || seen.has(seg)) continue;
        seen.add(seg);
        const child = pre + seg;
        yield dirs.has(child) ? new DirMock(child) : new FileMock(child);
      }
    }
  }
  const root = new DirMock('');
  window.showDirectoryPicker = async () => root;

  try {
    /* ---- 1. conectar a pasta ---- */
    const beforeCount = notes.length;
    await pickFolder();
    t('pasta conectada', disk.ready === true && disk.name === 'Notas', `${disk.ready} ${disk.name}`);
    t('handle salvo no IndexedDB', (await idb.get('rootDir')) !== undefined);
    t('UI mostra a pasta', byId('disk-name').textContent === 'Notas', byId('disk-name').textContent);
    t('botão sincronizar habilita', byId('disk-sync').disabled === false);
    t('escolher pasta não duplica notas', notes.length === beforeCount, String(notes.length));

    /* ---- 2. gravar todas as notas ---- */
    await syncDisk(true);
    t('todas as notas foram gravadas', store.size === notes.filter(n => !n.trashed).length, `${store.size} arquivos`);
    const paths = [...store.keys()];
    const semPasta = notes.filter(n => !n.trashed && !n.notebookId).map(n => n.diskPath);
    t('só notas sem pasta vão para a raiz', paths.filter(p => !p.includes('/')).sort().join() === semPasta.sort().join(),
      `${paths.filter(p => !p.includes('/')).join('|')} vs ${semPasta.join('|')}`);
    t('notas com pasta vão para subpastas', paths.filter(p => p.includes('/')).length === notes.filter(n => !n.trashed && n.notebookId).length);
    t('subpasta criada no disco', dirs.has('JavaScript/Async & Promises'), [...dirs].join(' | '));
    const recPath = paths.find(p => p.startsWith('Receitas/'));
    const recFile = store.get(recPath);
    t('arquivo .md com frontmatter', /^---\nid: /.test(recFile), recFile.slice(0, 40));
    t('arquivo tem pasta no frontmatter', /^notebook: ".*"$/m.test(recFile), recFile.split('\n').filter(l => l.startsWith('notebook')).join(''));
    const recNote = notes.find(n => n.diskPath === recPath);
    t('corpo do arquivo é o conteúdo da nota', recFile.includes(recNote.content.slice(0, 30)), recPath);
    t('diskPath registrado na nota', notes.every(n => !n.trashed || !n.diskPath) && notes.filter(n => !n.trashed).every(n => n.diskPath));

    /* ---- 3. renomear apaga o arquivo antigo ---- */
    const target = notes.find(n => n.title === 'Receita: git bisect');
    const oldPath = target.diskPath;
    target.title = 'Receita: git bisect (editada)';
    await writeNoteToDisk(target);
    t('arquivo novo após renomear', store.has(target.diskPath) && target.diskPath !== oldPath, `${oldPath} -> ${target.diskPath}`);
    t('arquivo antigo removido', !store.has(oldPath), oldPath);
    t('nenhum arquivo duplicado', store.size === notes.filter(n => !n.trashed).length, `${store.size}`);

    /* ---- 4. sincronização automática por fila ---- */
    const q = notes.find(n => n.title === 'Roadmap do Inkdrop');
    q.content += '\n\nlinha nova';
    queueDiskWrite(q.id);
    t('nota entrou na fila de gravação', disk.pending.has(q.id));
    await syncDisk(true);
    t('fila esvazia após sincronizar', disk.pending.size === 0, String(disk.pending.size));
    t('conteúdo novo gravado', store.get(q.diskPath).includes('linha nova'));
    t('nota marcada como salva', byId('note-saved').textContent.length > 0, byId('note-saved').textContent);

    /* ---- 5. importar da pasta ---- */
    const n1 = notes.length;
    store.set('externamente/nova-nota.md', '---\ntitle: "Nota Externa"\ntags: [externo]\nnotebook: "Externas"\n---\n\nconteúdo vindo do disco\n');
    dirs.add('externamente');
    await importFromDisk();
    t('importa arquivo novo', notes.length === n1 + 1, `${n1} -> ${notes.length}`);
    const imported = notes.find(n => n.title === 'Nota Externa');
    t('título vem do frontmatter', !!imported);
    t('corpo vem do arquivo', imported.content === 'conteúdo vindo do disco', JSON.stringify(imported.content));
    t('tags importadas', noteTags(imported).includes('externo'), noteTags(imported).join(','));
    t('pasta criada a partir do caminho do arquivo', !!nbBtn('externamente'), notebooks.map(nb => nb.name).join('|'));
    t('nota importada fica dentro da pasta criada', notebookForPath(['externamente']).length > 0);
    t('diskPath importado', imported.diskPath === 'externamente/nova-nota.md', imported.diskPath);

    await importFromDisk();
    t('reimportar não duplica', notes.length === n1 + 1, String(notes.length));
    t('reimportar mantém o conteúdo', imported.content === 'conteúdo vindo do disco');

    store.set('externamente/sem-frontmatter.md', '# Só título\n\ncorpo solto\n');
    await importFromDisk();
    const semFm = notes.find(n => n.title === 'Só título');
    t('arquivo sem frontmatter usa o heading', !!semFm, notes.map(n => n.title).join('|'));
    t('corpo sem frontmatter preserva o texto', semFm.content.includes('corpo solto'), JSON.stringify(semFm.content));

    /* ---- 6. mover de pasta move o arquivo ---- */
    const mover = notes.find(n => n.title === 'Nota Externa');
    const antes = mover.diskPath;
    mover.notebookId = notebooks.find(nb => nb.name === 'Receitas').id;
    await writeNoteToDisk(mover);
    t('mover muda o caminho no disco',
      mover.diskPath === 'Receitas/nota-externa.md' && !store.has(antes), `${antes} -> ${mover.diskPath}`);

    /* ---- 7. lixeira e exclusão ---- */
    const lixeira = notes.find(n => n.title === 'Nota Externa');
    const pathLixeira = lixeira.diskPath;
    lixeira.trashed = Date.now();
    await removeFileFromDisk(lixeira);
    t('nota na lixeira perde o arquivo', !store.has(pathLixeira) && lixeira.diskPath === '');
    lixeira.trashed = 0;
    await writeNoteToDisk(lixeira);
    t('restaurar regrava o arquivo', store.has(lixeira.diskPath));

    /* ---- 8. desconectar ---- */
    await forgetFolder();
    t('desconectar limpa o estado', disk.ready === false && disk.name === '');
    t('desconectar apaga o handle', (await idb.get('rootDir')) === undefined);
    t('notas continuam no navegador', notes.length > 0 && localStorage.getItem('neodrop.notes').length > 10);
    t('escrever sem pasta falha silenciosamente', (await writeNoteToDisk(notes[0])) === false);

    /* ---- 9. cancelar o seletor ---- */
    window.showDirectoryPicker = async () => { const e = new Error('cancelado'); e.name = 'AbortError'; throw e; };
    const nAntes = notes.length;
    await pickFolder();
    t('cancelar o seletor não muda nada', disk.ready === false && notes.length === nAntes);
    t('cancelar não mostra erro', !$$('#toasts .toast').some(x => /não foi possível abrir/i.test(x.textContent)),
      $$('#toasts .toast').map(x => x.textContent).join(' | '));

    /* ---- 10. navegador sem suporte ---- */
    const savedSupported = disk.supported;
    disk.supported = false;
    window.showDirectoryPicker = undefined;
    await pickFolder();
    disk.supported = savedSupported;
    t('avisa quando o navegador não suporta', $$('#toasts .toast').some(x => /não grava pastas/i.test(x.textContent)),
      $$('#toasts .toast').map(x => x.textContent).join(' | '));

    t('nenhum erro de JS no fim', errors.length === 0, errors.join(' | '));
  } catch (e) {
    crash = e && (e.stack || e.message || String(e));
  }

  if (crash) { fails++; out.push('EXCEÇÃO — ' + String(crash).replace(/\n/g, ' ⏎ ')); }
  flush();
})();