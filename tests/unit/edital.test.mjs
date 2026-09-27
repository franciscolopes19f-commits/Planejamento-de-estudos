import { test } from 'node:test';
import assert from 'node:assert/strict';

// parseTopics vive na view, que importa módulos de UI; testamos isoladamente com um DOM mínimo ausente.
const { parseTopics } = await import('../../app/js/views/subjects.js');

test('converte texto do edital em assuntos', () => {
  const t = parseTopics('1. Princípios fundamentais. 2. Direitos e garantias fundamentais; 3. Organização do Estado\n- Controle de constitucionalidade');
  assert.deepEqual(t, ['Princípios fundamentais', 'Direitos e garantias fundamentais', 'Organização do Estado', 'Controle de constitucionalidade']);
});
