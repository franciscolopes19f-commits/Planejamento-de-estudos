// Estados de pedido, pagamento e estoque — mantidos separados de propósito:
// "pedido criado" ≠ "venda confirmada" ≠ "dinheiro recebido".

export const ORDER_STATUS = {
  novo: { label: 'Pedido criado', hint: 'Aguardando a loja confirmar disponibilidade e pagamento.' },
  aguardando_pagamento: { label: 'Aguardando pagamento', hint: 'O pagamento ainda não foi confirmado pelo provedor.' },
  confirmado: { label: 'Venda confirmada', hint: 'Estoque baixado. Pedido em preparação.' },
  em_separacao: { label: 'Em separação', hint: '' },
  pronto_retirada: { label: 'Pronto para retirada', hint: '' },
  saiu_entrega: { label: 'Saiu para entrega', hint: '' },
  entregue: { label: 'Entregue', hint: '' },
  cancelado: { label: 'Cancelado', hint: '' },
  expirado: { label: 'Reserva expirada', hint: 'Os itens deixaram de estar reservados.' },
  revisar: { label: 'Requer revisão', hint: 'Algo precisa de atenção manual da loja (ex.: pagamento sem estoque).' },
};

export const PAYMENT_STATUS = {
  nao_iniciado: 'Pagamento não iniciado',
  pendente: 'Pagamento pendente',
  aprovado: 'Pagamento recebido',
  recusado: 'Pagamento recusado',
  estornado: 'Pagamento estornado',
};

export const STOCK_STATE = {
  reserved: 'Itens reservados',
  committed: 'Estoque baixado',
  released: 'Reserva liberada',
};

// Transições permitidas no painel (as automáticas — pagamento e expiração — são feitas pelo servidor).
export const ADMIN_TRANSITIONS = {
  novo: ['confirmado', 'cancelado'],
  aguardando_pagamento: ['confirmado', 'cancelado'],
  expirado: ['confirmado', 'cancelado'],
  revisar: ['confirmado', 'cancelado'],
  confirmado: ['em_separacao', 'pronto_retirada', 'saiu_entrega', 'cancelado'],
  em_separacao: ['pronto_retirada', 'saiu_entrega', 'cancelado'],
  pronto_retirada: ['entregue', 'cancelado'],
  saiu_entrega: ['entregue', 'cancelado'],
  entregue: [],
  cancelado: [],
};

export const FINAL_STATUSES = ['entregue', 'cancelado'];
