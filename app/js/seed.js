// Dados iniciais (editáveis). Horários NÃO são presumidos: vêm da configuração inicial.
// As matérias são um modelo da área fiscal/contábil para ajustar ao edital do concurso-alvo.
export const QUEIMADOS_ID = 'radar-queimados-2026-contador';

export function createSeed(uid) {
  const subj = (nome, peso, dificuldade, topics) => ({
    id: uid('mat'), nome, peso, dificuldade, contestIds: [],
    topics: topics.map(t => ({ id: uid('ass'), nome: t, done: false, doneAt: null })),
  });
  return {
    seeded: true,
    profile: { name: '', dailyGoalMin: 90, weeklyGoalMin: 600, sessionMin: 50, inactivityMin: 25, planMode: 'calendario', notify: true, quietStart: '22:30', quietEnd: '07:00', targetContestId: QUEIMADOS_ID },
    prefs: {
      areas: ['fiscal', 'contabil', 'financeira', 'controle', 'policial'],
      locais: ['RJ', 'RS', 'SC', 'PR', 'Federal'],
      excluirLocais: ['BA'],
      cargos: ['Auditor', 'Analista', 'Fiscal', 'Contador', 'Agente', 'Escrivão', 'Policial'],
    },
    events: [],        // preenchidos na configuração inicial (sem presumir horários)
    availability: [],
    setupDone: false,
    my: { [QUEIMADOS_ID]: { status: 'interesse' } },
    tasks: [],
    subjects: [
      { ...subj('Legislação Municipal de Queimados', 3, 3, []), contestIds: [QUEIMADOS_ID], hint: 'Cole o conteúdo de Legislação Municipal do edital (IAN) em Editar.' },
      subj('Contabilidade Geral', 5, 1, ['Estrutura conceitual (CPC 00)', 'Balanço patrimonial', 'DRE e DRA', 'DFC', 'DVA', 'Estoques (CPC 16)', 'Ativo imobilizado e depreciação', 'Ativo intangível', 'Provisões e contingências (CPC 25)', 'Investimentos: MEP e consolidação']),
      subj('Direito Tributário', 5, 3, ['Sistema Tributário Nacional e espécies tributárias', 'Competência tributária', 'Limitações ao poder de tributar', 'Impostos da União, Estados e Municípios', 'Obrigação tributária e fato gerador', 'Sujeição passiva e responsabilidade', 'Crédito tributário e lançamento', 'Suspensão, extinção e exclusão do crédito', 'Garantias, privilégios e administração tributária', 'Reforma tributária: IBS, CBS e IS']),
      subj('Auditoria', 4, 3, ['Normas brasileiras de auditoria', 'Planejamento de auditoria', 'Risco e materialidade', 'Evidência e procedimentos', 'Amostragem', 'Relatório e opinião do auditor']),
      subj('Direito Constitucional', 3, 2, ['Princípios fundamentais', 'Direitos e garantias fundamentais', 'Organização do Estado', 'Organização dos Poderes', 'Controle de constitucionalidade', 'Administração Pública (arts. 37 a 41)', 'Finanças públicas na CF']),
      subj('Direito Administrativo', 3, 2, ['Princípios da Administração', 'Atos administrativos', 'Poderes administrativos', 'Licitações (Lei 14.133/2021)', 'Contratos administrativos', 'Agentes públicos', 'Improbidade administrativa', 'Responsabilidade civil do Estado']),
      subj('AFO e Contabilidade Pública', 3, 3, ['Orçamento público e princípios', 'Ciclo orçamentário: PPA, LDO e LOA', 'Receita pública', 'Despesa pública', 'Lei de Responsabilidade Fiscal', 'PCASP e MCASP']),
      subj('Língua Portuguesa', 3, 2, ['Interpretação de textos', 'Ortografia e acentuação', 'Concordância verbal e nominal', 'Regência e crase', 'Pontuação', 'Colocação pronominal']),
      subj('Raciocínio Lógico e Matemática Financeira', 2, 3, ['Proposições e conectivos', 'Equivalências e negações', 'Juros simples e compostos', 'Descontos', 'Sistemas de amortização', 'Estatística descritiva']),
    ],
  };
}

// Rotina de exemplo usada só no modo demonstração.
export function exampleRoutine(uid) {
  const weekdays = [1, 2, 3, 4, 5];
  return {
    events: [
      { id: uid('evt'), title: 'Escritório', type: 'escritorio', dows: weekdays, start: '08:00', end: '12:00', remind: false },
      { id: uid('evt'), title: 'Escritório', type: 'escritorio', dows: weekdays, start: '13:00', end: '18:00', remind: false },
      { id: uid('evt'), title: 'Faculdade de Direito', type: 'faculdade', dows: weekdays, start: '19:00', end: '22:30', remind: false },
    ],
    availability: [
      ...weekdays.map(d => ({ id: uid('disp'), dow: d, start: '06:00', end: '07:30' })),
      ...weekdays.map(d => ({ id: uid('disp'), dow: d, start: '12:10', end: '12:55' })),
      { id: uid('disp'), dow: 6, start: '08:00', end: '12:00' },
      { id: uid('disp'), dow: 6, start: '14:00', end: '16:30' },
      { id: uid('disp'), dow: 0, start: '09:00', end: '11:30' },
    ],
  };
}
