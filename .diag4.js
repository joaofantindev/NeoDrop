const ta = document.getElementById('note-content');
const hl = document.getElementById('editor-hl');
const code = hl.querySelector('code');
const linhaH = parseFloat(getComputedStyle(ta).lineHeight);
const linhas = [
  'linha muito longa para testar a quebra automática '.repeat(6),
  '',
  '- item com `código` e [[Nota]] e #tag',
  'uma linha ridiculously-longa-sem-espacos-que-deve-quebrar-so-em-barramento-para-nao-estourar-a-caixa',
  'acentuação: çãõéêíú àéîõü'
];
const out = [];
const medir = (rotulo, texto, sufixo) => {
  ta.value = texto;
  code.innerHTML = highlightMd(texto) + sufixo;
  out.push({rotulo, sufixo: JSON.stringify(sufixo), taSH: ta.scrollHeight, hlSH: hl.scrollHeight,
    delta: ta.scrollHeight - hl.scrollHeight, clientH: ta.clientHeight, clientW: ta.clientWidth, hlW: hl.clientWidth});
};
medir('texto completo', linhas.join('\n'), '');
medir('texto completo + espaço', linhas.join('\n'), ' ');
medir('texto completo + \\n', linhas.join('\n'), '\n');
medir('só linhas curtas', 'a\n'.repeat(40), '');
medir('uma linha só', 'palavra '.repeat(300), '');
medir('com código', '```js\n' + 'const x = 1;\n'.repeat(20) + '```', '');
medir('com tabela', '| a | b |\n| - | - |\n' + '| x | y |\n'.repeat(20), '');
medir('sem pontuação final', 'texto sem pontuação', '');
medir('com pontuação final', 'texto com pontuação.', '');
const pre = document.createElement('pre');
pre.id='diag'; pre.textContent='DIAG '+JSON.stringify(out,null,1)+`\nlineH=${linhaH}`;
document.body.appendChild(pre);
