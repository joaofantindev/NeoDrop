const ta = document.getElementById('note-content');
const hl = document.getElementById('editor-hl');
const code = hl.querySelector('code');
const lineH = parseFloat(getComputedStyle(ta).lineHeight);
const rows = [];
for (const n of [3, 5, 12]) {
  ta.value = Array.from({length:n},(_,i)=>`linha ${i+1}`).join('\n');
  code.innerHTML = hlText(ta.value);
  rows.push({n, lineH, taSH: ta.scrollHeight, hlSH: hl.scrollHeight, esperado: n*lineH + 28,
    taCH: ta.clientHeight, hlCH: hl.clientHeight, delta: ta.scrollHeight - hl.scrollHeight});
}
ta.value = 'linha 1\n';
code.innerHTML = hlText(ta.value) + ' ';
rows.push({caso:'termina com \\n + espaco', taSH: ta.scrollHeight, hlSH: hl.scrollHeight});
ta.value = 'linha 1\n\n';
code.innerHTML = hlText(ta.value) + ' ';
rows.push({caso:'termina com \\n\\n + espaco', taSH: ta.scrollHeight, hlSH: hl.scrollHeight});
ta.value = Array.from({length:12},(_,i)=>`linha ${i+1}`).join('\n') + '\n';
code.innerHTML = hlText(ta.value) + ' ';
rows.push({caso:'12 linhas + \\n + espaco', taSH: ta.scrollHeight, hlSH: hl.scrollHeight});
const pre = document.createElement('pre');
pre.id='diag'; pre.textContent='DIAG '+JSON.stringify(rows,null,1);
document.body.appendChild(pre);
function hlText(v){ return document.createElement('div').innerHTML === '' ? '' : ''; }
