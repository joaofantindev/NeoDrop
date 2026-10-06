const ta = document.getElementById('note-content');
const hl = document.getElementById('editor-hl');
const code = hl.querySelector('code');
document.getElementById('editor-body').style.height = '160px';
const lineH = parseFloat(getComputedStyle(ta).lineHeight);
const mk = n => Array.from({length:n},(_,i)=>`linha ${i+1}`).join('\n');
const rows = [];
for (const n of [8, 20, 40]) {
  ta.value = mk(n);
  code.innerHTML = highlightMd(ta.value);
  const semEspaco = [ta.scrollHeight, hl.scrollHeight];
  code.innerHTML = highlightMd(ta.value) + ' ';
  const comEspaco = [ta.scrollHeight, hl.scrollHeight];
  code.innerHTML = highlightMd(ta.value) + '\n';
  const comNl = [ta.scrollHeight, hl.scrollHeight];
  rows.push({n, lineH, semEspaco, comEspaco, comNl,
    deltaSem: semEspaco[0]-semEspaco[1], deltaEsp: comEspaco[0]-comEspaco[1], deltaNl: comNl[0]-comNl[1]});
}
const longo = 'palavra '.repeat(400);
ta.value = longo;
code.innerHTML = highlightMd(longo);
rows.push({caso:'texto longo sem espaços', taSH: ta.scrollHeight, hlSH: hl.scrollHeight});
const pre = document.createElement('pre');
pre.id='diag'; pre.textContent='DIAG '+JSON.stringify(rows,null,1);
document.body.appendChild(pre);
