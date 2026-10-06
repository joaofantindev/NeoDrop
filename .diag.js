const d = {
  notesType: typeof notes,
  notesLen: (typeof notes !== 'undefined' && notes.length),
  notebooksLen: (typeof notebooks !== 'undefined' && notebooks.length),
  lsNotes: String(localStorage.getItem('neodrop.notes')).slice(0, 120),
  lsKeys: Object.keys(localStorage).join(','),
  navCount: (document.getElementById('nav-count-notes') || {}).textContent,
  rows: document.querySelectorAll('#note-list .note-row').length,
  editorTitle: (document.getElementById('note-title') || {}).value,
  errors: window.__err,
};
const pre = document.createElement('pre');
pre.id = 'diag';
pre.textContent = 'DIAG ' + JSON.stringify(d, null, 1);
document.body.appendChild(pre);
