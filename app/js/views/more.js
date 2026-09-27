import { icon } from '../ui.js';

const ITEMS = [
  ['evolucao', 'Evolução', 'Horas, questões e acertos', 'chart'],
  ['revisoes', 'Revisões', 'Agenda de revisões e pendências', 'repeat'],
  ['materias', 'Edital e matérias', 'Marque o que já estudou', 'list'],
  ['rotina', 'Minha rotina', 'Escritório, faculdade e horários', 'briefcase'],
  ['concursos/meus', 'Meus concursos', 'Inscrições, taxas e alertas', 'star'],
  ['estudar/manual', 'Registrar estudo', 'Estudo feito fora do app', 'plus'],
  ['config', 'Configurações', 'Metas, radar, backup e sincronização', 'settings'],
];

export default {
  title: 'Mais',
  render() {
    return `<h1>Mais</h1><div class="more-grid" style="margin-top:14px">${ITEMS.map(([r, l, d, i]) => `<a href="#/${r}"><span class="ico">${icon(i)}</span>${l}<small>${d}</small></a>`).join('')}</div>`;
  },
};
