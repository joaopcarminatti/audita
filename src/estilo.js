'use strict';

const CORES_RESULTADO = {
  'Aprovado': '#16624C',
  'Aprovado com ressalvas': '#B4690E',
  'Reprovado': '#A62B1F',
};

const CORES_SEVERIDADE = {
  'Crítica': '#A62B1F',
  'Alta': '#B4690E',
  'Média': '#7A6A19',
  'Baixa': '#3F5A66',
};

const CSS = `
:root{
  --papel:#EEF1F0; --superficie:#FFFFFF; --tinta:#101A20; --apagado:#5B6B7A;
  --linha:#D3DAD8; --linha-fraca:#E7EBEA;
  --aprovado:#16624C; --ressalva:#B4690E; --reprovado:#A62B1F; --frio:#3F5A66;
}
*{box-sizing:border-box}
body{margin:0;background:var(--papel);color:var(--tinta);
  font-family:'Segoe UI',system-ui,-apple-system,'Helvetica Neue',sans-serif;
  font-size:15px;line-height:1.55;-webkit-font-smoothing:antialiased}
.folha{max-width:1080px;margin:0 auto;padding:32px 24px 72px}
h1{font-size:30px;line-height:1.15;font-weight:600;margin:0 0 6px;letter-spacing:-.01em}
h2{font-size:19px;font-weight:600;margin:40px 0 12px;padding-bottom:7px;border-bottom:1px solid var(--linha)}
h3{font-size:15px;font-weight:600;margin:0 0 4px}
p{margin:0 0 10px}
.sub{color:var(--apagado);font-size:14px}
.cabecalho{display:flex;flex-wrap:wrap;gap:24px;justify-content:space-between;align-items:flex-end;
  border-bottom:2px solid var(--tinta);padding-bottom:18px}
.meta{font-size:13.5px;color:var(--apagado);text-align:right;line-height:1.7}
.meta b{color:var(--tinta);font-weight:600}

/* Selo de aderência: o elemento central do relatório */
.selo-area{display:flex;gap:32px;align-items:center;flex-wrap:wrap;margin:28px 0 8px}
.selo{width:172px;height:172px;flex:none;border-radius:50%;display:grid;place-content:center;
  text-align:center;transform:rotate(-5deg);border:3px double currentColor;position:relative}
.selo::after{content:'';position:absolute;inset:7px;border-radius:50%;border:1px solid currentColor;opacity:.45}
.selo .num{font-size:46px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.selo .rot{font-size:11.5px;letter-spacing:.14em;margin-top:5px;text-transform:uppercase}
.selo .res{font-size:12.5px;font-weight:600;margin-top:9px;max-width:130px;margin-inline:auto;line-height:1.25}
.numeros{display:flex;flex-wrap:wrap;gap:30px 44px}
.numero .v{font-size:27px;font-weight:600;font-variant-numeric:tabular-nums;line-height:1.2}
.numero .r{font-size:13px;color:var(--apagado)}

table{width:100%;border-collapse:collapse;font-size:14px}
th{text-align:left;font-weight:600;color:var(--apagado);font-size:13px;
  padding:0 12px 8px 0;border-bottom:1px solid var(--linha)}
td{padding:11px 12px 11px 0;border-bottom:1px solid var(--linha-fraca);vertical-align:top}
tr:last-child td{border-bottom:none}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;padding-left:18px;padding-right:14px;white-space:nowrap}
td:last-child,th:last-child{padding-right:0}
.barra{height:6px;background:var(--linha-fraca);width:110px;display:inline-block;vertical-align:middle;margin-right:10px;flex:none}
.celula-barra{display:flex;align-items:center;white-space:nowrap}
.barra i{display:block;height:100%}
.chip{display:inline-block;font-size:12px;font-weight:600;padding:2px 8px;border:1px solid currentColor;
  border-radius:2px;white-space:nowrap}
.pendente{color:var(--reprovado)} .fechada{color:var(--aprovado)}
.evidencia{color:var(--apagado);font-size:13.5px;display:block;margin-top:3px}
.conforme{color:var(--aprovado);font-weight:600}
.naoconforme{color:var(--reprovado);font-weight:600}
.item-lista{margin:0;padding:0;list-style:none}
.item-lista li{padding:8px 0;border-bottom:1px solid var(--linha-fraca);display:flex;gap:12px}
.item-lista li:last-child{border-bottom:none}
.marca{flex:none;width:18px;font-weight:700}
.artefato-bloco{background:var(--superficie);border:1px solid var(--linha);padding:18px 20px;margin-bottom:14px}
.linha-topo{display:flex;justify-content:space-between;gap:16px;align-items:baseline;flex-wrap:wrap;margin-bottom:10px}
.rodape{margin-top:48px;padding-top:14px;border-top:1px solid var(--linha);font-size:13px;color:var(--apagado)}
/* Evolução entre auditorias */
.grafico{display:flex;gap:10px;align-items:flex-end;height:180px;padding:10px 0 0;border-bottom:1px solid var(--linha);overflow-x:auto}
.grafico .col{flex:1;min-width:52px;display:flex;flex-direction:column;justify-content:flex-end;height:100%;text-align:center}
.grafico .haste{width:100%;max-width:46px;margin:0 auto}
.grafico .valor{font-size:12px;font-variant-numeric:tabular-nums;color:var(--apagado);margin-bottom:4px}
.grafico .rot{font-size:11px;color:var(--apagado);margin-top:6px;white-space:nowrap}
.meta-linha{display:inline-block;font-size:13px;padding:3px 10px;border:1px solid currentColor;border-radius:2px;margin-left:8px}
.duas{display:flex;gap:36px;flex-wrap:wrap}
.duas > *{flex:1;min-width:560px}
@media (max-width:640px){
  .folha{padding:20px 16px 56px} h1{font-size:24px} .cabecalho{align-items:flex-start}
  .meta{text-align:left} .selo{width:140px;height:140px} .selo .num{font-size:38px}
  table{font-size:13px} .barra{width:70px} .duas{gap:0} .grafico{height:150px}
}
`;

function cor(percentual) {
  if (percentual >= 90) return CORES_RESULTADO['Aprovado'];
  if (percentual >= 70) return CORES_RESULTADO['Aprovado com ressalvas'];
  return CORES_RESULTADO['Reprovado'];
}

function selo(percentual, resultado) {
  return `<div class="selo" style="color:${cor(percentual)}">
    <div>
      <div class="num">${percentual}%</div>
      <div class="rot">aderência</div>
      <div class="res">${resultado}</div>
    </div>
  </div>`;
}

function barra(percentual) {
  return `<span class="barra"><i style="width:${Math.max(2, percentual)}%;background:${cor(percentual)}"></i></span>`;
}

function escapar(texto) {
  return String(texto == null ? '' : texto)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = { CSS, CORES_RESULTADO, CORES_SEVERIDADE, cor, selo, barra, escapar };
