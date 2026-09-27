import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, classify } from '../../scripts/radar-update.mjs';

const XML = `<?xml version="1.0"?><rss><channel>
<item><title><![CDATA[Concurso Sefaz SC: inscrições abertas para Auditor]]></title><link>https://ex.com/a</link><pubDate>Mon, 21 Sep 2026 10:00:00 +0000</pubDate><description>50 vagas</description></item>
<item><title>Concurso PRF 2026: pedido de novo edital</title><link>https://ex.com/b</link><pubDate>Tue, 22 Sep 2026 10:00:00 +0000</pubDate></item>
<item><title>Concurso Prefeitura de Salvador - BA: professor</title><link>https://ex.com/c</link></item>
<item><title>Concurso TCE RJ: banca definida</title><link>https://ex.com/d</link></item>
<item><title>Dicas de estudo para a semana</title><link>https://ex.com/e</link></item>
</channel></rss>`;

test('lê RSS e classifica área, UF e órgão sem inventar dados', () => {
  const items = parseFeed(XML);
  assert.equal(items.length, 5);
  assert.equal(items[0].titulo, 'Concurso Sefaz SC: inscrições abertas para Auditor');
  const c = items.map(classify);
  assert.deepEqual(c[0], { area: 'fiscal', uf: 'SC', orgao: 'Sefaz SC' });
  assert.equal(c[1].area, 'policial'); assert.equal(c[1].uf, 'Federal'); assert.equal(c[1].orgao, 'PRF');
  assert.equal(c[2], null); // professor: fora das áreas
  assert.deepEqual(c[3], { area: 'controle', uf: 'RJ', orgao: 'TCE RJ' });
  assert.equal(c[4], null);
});
