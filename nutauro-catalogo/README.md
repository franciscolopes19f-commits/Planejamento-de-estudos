# Nutauro Suplementos — catálogo digital e loja virtual

Primeira versão navegável do catálogo da Nutauro (Duque de Caxias – RJ): o cliente encontra produtos,
escolhe sabor e tamanho, monta o carrinho e envia o pedido organizado pelo WhatsApp — ou paga pelo site,
quando um provedor de pagamento estiver configurado. A equipe administra tudo pelo celular, inclusive
cadastro e entrada de estoque lendo o código de barras.

## Sumário

1. [Entendimento](#1-entendimento)
2. [Arquitetura](#2-arquitetura)
3. [Executar](#3-executar)
4. [Versão de demonstração (arquivo único)](#4-versão-de-demonstração-arquivo-único)
5. [Configurar a loja](#5-configurar-a-loja)
6. [Cadastrar produtos](#6-cadastrar-produtos)
7. [Pedidos, reservas e estoque](#7-pedidos-reservas-e-estoque)
8. [Entrega](#8-entrega)
9. [Pagamento pelo site](#9-pagamento-pelo-site)
10. [Código de barras: fontes de dados](#10-código-de-barras-fontes-de-dados)
11. [Identidade visual e mascote](#11-identidade-visual-e-mascote)
12. [O que funciona, o que é demonstrativo, o que está pendente](#12-o-que-funciona-o-que-é-demonstrativo-o-que-está-pendente)
13. [O que foi testado](#13-o-que-foi-testado)
14. [Publicação: próximos passos](#14-publicação-próximos-passos)
15. [Evolução da gestão](#15-evolução-da-gestão)

---

## 1. Entendimento

- **Problema atual:** fotos, preços e informações são enviados manualmente pelo WhatsApp.
- **Solução:** um link público com o catálogo; o cliente monta o pedido e a mensagem chega pronta no WhatsApp
  da loja, com número do pedido, itens, sabores, tamanhos, quantidades, preços e total.
- **Canais configuráveis:** só WhatsApp, só site ou os dois — **todos usam o mesmo cadastro e o mesmo estoque**.
- **Prioridade entregue:** catálogo → produto → carrinho → pedido pelo WhatsApp, com painel de administração,
  leitura de código de barras e estrutura de checkout com pagamento pronta para ativar.

**Referências (Growth e Kyte):** os dois sites estavam bloqueados pela rede deste ambiente (DNS/proxy) e não
puderam ser analisados. O projeto seguiu apenas o briefing; nenhuma observação sobre eles foi inventada.

## 2. Arquitetura

| Parte | Escolha | Por quê |
|---|---|---|
| Servidor | Node.js 22 **sem dependências** (`node:http`) | Nada para atualizar além do próprio Node; roda em qualquer VPS ou PaaS. |
| Banco | SQLite embutido (`node:sqlite`), arquivo em `DATA_DIR` | Transações reais (reserva/baixa de estoque atômicas), backup = copiar um arquivo. Suficiente para uma loja; migra para PostgreSQL se crescer muito. |
| Frontend | HTML/CSS/JS puro, sem etapa de build | Fácil de manter; carrega rápido no celular. |
| Regras compartilhadas | `public/shared/` (preço, frete, GTIN, mensagem, status) | A mesma regra roda no navegador (prévia) e no servidor (decisão final). |

Pastas principais:

```
server/            API, banco, pedidos, estoque, pagamentos, código de barras, CSV, autenticação
public/            loja (index.html, js/store), painel (admin/, js/admin), regras compartilhadas (shared/)
public/assets/     logos oficiais (recortes transparentes), mascote provisório, imagens de demonstração
test/              testes automatizados (node --test)
demo/, scripts/    geração da demonstração em arquivo único
```

O servidor sempre recalcula preço, estoque, frete e total; valores enviados pelo navegador são ignorados.
Custo e margem só existem na API do painel. O `localStorage` guarda apenas o carrinho e o rascunho do
checkout no aparelho do cliente — não é usado como banco.

## 3. Executar

Requisitos: **Node.js 22.13 ou superior** (traz o SQLite embutido).

```bash
cd nutauro-catalogo
ADMIN_EMAIL=voce@exemplo.com ADMIN_PASSWORD='uma-senha-forte' npm start
# Loja:   http://localhost:3000
# Painel: http://localhost:3000/admin
```

- Sem `ADMIN_PASSWORD`, o servidor cria `admin@nutauro.local` com senha aleatória e a mostra **uma vez** no terminal.
- Na primeira execução são criados: categorias sugeridas, seções da vitrine, o banner com o mascote
  (provisório), páginas institucionais em rascunho e **9 produtos de demonstração** (marcados “DEMO”).
  Para começar sem eles: `SEED_DEMO=0`. Para removê-los depois: Painel → Início → “Remover demonstração”.
- Testes: `npm test`. Variáveis disponíveis: veja `.env.example`.

## 4. Versão de demonstração (arquivo único)

`dist/nutauro-demo.html` abre direto no navegador, sem servidor: loja completa e painel (`#/admin`, ou o atalho
`#painel`). `dist/catalogo-nutauro.html` é a mesma demonstração no formato de página publicada (link privado).
Os produtos de demonstração usam códigos de barras fictícios da faixa 200 (uso interno GS1), e a tela de leitura
lista códigos para testar. Sem câmera ao vivo (página publicada), use “Foto do código”: o celular tira a foto e o
leitor decodifica.
É gerada com `npm install && npm run build:demo` e usa um “servidor simulado” que guarda dados **só naquele
navegador** — serve para avaliar telas e fluxos, não para vender. Na demonstração:

- só o pedido pelo WhatsApp vem ligado; o pagamento simulado pode ser ligado no painel e nunca cobra nada;
- o WhatsApp da loja não vem configurado (não inventamos número): cadastre o seu próprio número no painel para testar o envio;
- consulta externa de código de barras, CEP, importação CSV e backup ficam desativados.

## 5. Configurar a loja

Painel → **Mais**:

1. **Dados da loja:** WhatsApp de pedidos (obrigatório para o canal WhatsApp), endereço, horário, CNPJ, e-mail,
   Instagram e domínio. Campos vazios simplesmente não aparecem na loja.
2. **Vendas e pagamentos:** modo de venda (só WhatsApp / só site / os dois), tempo de reserva, pedido mínimo,
   desconto no Pix, parcelamento e formas aceitas no pedido via WhatsApp. Pix e parcelamento só aparecem
   na vitrine quando configurados.
3. **Entrega e retirada:** regiões por faixa de CEP, taxas, frete grátis, horário limite, dias de operação,
   feriados, tempo de preparo e retirada na loja. Há um campo para testar um CEP.
4. **Banners e vitrine:** banner principal (texto e botão separados da imagem), versão para celular, período
   de exibição; ordem e títulos de Ofertas, Destaques, Novidades e Kits.
5. **Categorias e marcas:** a seção de marcas na página inicial é opcional e só mostra marcas marcadas
   e com produto publicado — cadastre apenas fabricantes que a loja realmente vende.
6. **Páginas da loja:** Sobre, Entregas, Trocas, Privacidade, Atendimento. Vêm em rascunho com texto modelo;
   o painel não deixa publicar enquanto o texto modelo não for substituído. Valide com contador/advogado
   (CDC art. 49, LGPD).

O Início do painel mostra a lista **“Para publicar a loja”** com o que ainda falta.

## 6. Cadastrar produtos

**Pelo código de barras (aba Escanear):**

1. Leia pela **câmera** (exige HTTPS), use um **leitor físico** USB/Bluetooth (funciona como teclado) ou digite.
2. O sistema valida o EAN/GTIN (dígito verificador).
3. **Já cadastrado:** botões “Entrada de estoque” e “Editar produto”.
4. **Não cadastrado:** consulta as fontes externas conectadas e mostra o que encontrou, com a origem.
   “Usar estes dados e completar” abre o cadastro preenchido, com cada campo importado marcado
   “importado — revise”. Sem dados: “Cadastro manual” (já com o código) ou “Vincular a produto existente”.
5. Complete preço, custo, estoque inicial e categoria → **Salvar rascunho** ou **Publicar**.

**Manual (Produtos → Novo):** um formulário só, com um quadro no topo que mostra **o que falta para publicar**
(nome, categoria, preço em todas as opções; sabor/tamanho quando há mais de uma opção) e o que é recomendado
(foto, marca, apresentação, descrição, custo, código). “Gerar combinações” cria várias opções de uma vez
(ex.: 3 sabores × 2 tamanhos). Fotos são reduzidas no próprio celular antes do envio.

Tabela nutricional, ingredientes e alergênicos só aparecem na loja quando preenchidos — use o rótulo do fabricante.

**Planilha (Mais → Importar/exportar):** exporte para obter o modelo; a importação mostra uma prévia com erros
por linha antes de aplicar. Diferenças de estoque viram “ajuste” no histórico.

Também no painel: duplicar, arquivar (sai da loja, mantém histórico), histórico de estoque por produto.

## 7. Pedidos, reservas e estoque

Três informações independentes em cada pedido:

| Campo | Valores | Significa |
|---|---|---|
| Situação | Pedido criado → Venda confirmada → Em separação → Pronto/Saiu → Entregue; Cancelado; Reserva expirada; Requer revisão | Fluxo comercial |
| Pagamento | Não iniciado, Pendente, **Recebido**, Recusado, Estornado | Dinheiro |
| Estoque | Reservado, **Baixado**, Liberado | Mercadoria |

**Regra de reserva e baixa:**

- Ao registrar o pedido, os itens ficam **reservados** (padrão: 2 h no WhatsApp, 30 min aguardando pagamento no site).
  O disponível na loja = saldo − reservas ativas. Não dá para pedir acima do disponível.
- **Abrir o WhatsApp não baixa estoque nem confirma nada.** A baixa só acontece quando a loja toca em
  “Confirmar venda” no painel ou quando o provedor aprova o pagamento (confirmado pelo servidor).
- Reservas vencidas são liberadas automaticamente (verificação a cada minuto). A loja ainda pode confirmar um
  pedido expirado se houver estoque.
- Cancelar uma venda confirmada devolve os itens ao estoque. Se havia pagamento, o painel alerta para registrar o estorno.
- Recebimento fora do site (Pix na conta, dinheiro, maquininha) é registrado em “Registrar recebimento”.
- Estoque nunca fica negativo; toda alteração gera movimento (entrada, saída com motivo, ajuste, venda, devolução).

## 8. Entrega

Configuração inicial (ajuste antes de divulgar — as faixas de CEP são um ponto de partida):

| Região | CEPs iniciais | Prazo | Taxa |
|---|---|---|---|
| Duque de Caxias | 25000-000 a 25299-999 | mesmo dia se confirmado até 15:00 (com preparo de 60 min), senão próximo dia útil | a confirmar |
| Rio de Janeiro (regiões atendidas) | 20000-000 a 23799-999 | até 48 horas corridas após a confirmação | a confirmar |
| Demais regiões do Brasil | 01000-000 a 99999-999 | conforme transportadora | a confirmar |
| Retirada na loja | — | após confirmação | grátis |

- Fuso **America/Sao_Paulo**. Horas corridas ≠ dias úteis (estes pulam dias sem operação e feriados).
- “Mesmo dia” só aparece se: região configurada + dentro do horário limite + dia de operação + itens em estoque.
- Taxa em branco = **“a confirmar”**: o total mostra “+ frete a confirmar” e o pedido segue pelo WhatsApp. A compra
  pelo site exige frete definido (ou retirada), porque o valor cobrado precisa ser exato.
- Consulta de endereço por CEP usa o ViaCEP (gratuito); o cliente sempre pode corrigir o endereço.
- **Não há integração com transportadora.** Para calcular frete nacional automaticamente, opções a avaliar:
  Melhor Envio, contrato com os Correios ou outra plataforma de fretes (requer cadastro, peso/medidas dos produtos e
  tem custos próprios).

## 9. Pagamento pelo site

**Integração escolhida: Mercado Pago — Checkout Pro** (Pix e cartão na página do Mercado Pago).

- A loja **nunca** recebe nem guarda dados de cartão.
- O valor enviado é o total calculado pelo servidor; o pedido fica reservado durante o pagamento.
- Confirmação: o Mercado Pago envia uma notificação (webhook) **assinada** (`x-signature`, HMAC); o servidor valida a
  assinatura e **reconsulta o pagamento na API** antes de alterar o pedido. Eventos repetidos são ignorados
  (chave única por pagamento+status) e a baixa de estoque é idempotente.
- Pagamento aprovado sem estoque (ex.: Pix pago após a reserva vencer e o item ser vendido) vai para
  **“Requer revisão”**, sem estoque negativo.

**Para ativar:**

1. Conta Mercado Pago (de preferência PJ) → “Suas integrações” → criar aplicação (Checkout Pro).
2. Copiar o **Access Token** de produção → variável `MP_ACCESS_TOKEN` no servidor.
3. Em Webhooks, cadastrar `https://SEU-DOMINIO/api/webhooks/mercadopago` (evento “Pagamentos”) e copiar a
   **assinatura secreta** → `MP_WEBHOOK_SECRET`.
4. Painel → Vendas e pagamentos → Provedor “Mercado Pago” e modo “Só site” ou “Os dois”.
5. Testar com credenciais de teste antes de usar as de produção.

**Custos:** o Mercado Pago cobra tarifa por venda, que varia por meio de pagamento, prazo de recebimento e
parcelamento. Confira a tabela vigente na sua conta antes de definir desconto no Pix e parcelas sem juros.

Sem credenciais, a compra pelo site fica desativada. Existe um provedor **“Demonstração”** (não cobra nada, a loja
mostra o aviso), bloqueado automaticamente com `NODE_ENV=production`.

## 10. Código de barras: fontes de dados

Ler o código só traz o número. Dados como nome, marca e foto dependem de uma base externa — e nenhuma cobre todos
os produtos. O sistema mostra a origem e exige revisão antes de publicar.

| Fonte | Situação | Cobertura para suplementos | Custo / limites |
|---|---|---|---|
| **Open Food Facts** | Conectada (sem chave) | Parcial: base colaborativa de alimentos; muitos suplementos brasileiros não estão lá ou estão incompletos | Gratuita. Dados sob licença ODbL, imagens CC BY-SA (exigem atribuição). Dados colaborativos: confira com o rótulo. |
| **Cosmos (Bluesoft)** | Preparada; ativa com `COSMOS_TOKEN` | Tende a ser melhor para produtos vendidos no Brasil (nome, marca, foto, NCM) | Requer cadastro e token; há limite de consultas conforme o plano. Confira planos e preços atuais no site da Bluesoft. |

- Não existe integração com o Kyte (não há API pública conhecida para isso; nada foi simulado).
- Neste ambiente de desenvolvimento a rede externa estava bloqueada: a consulta real ao Open Food Facts **não pôde
  ser testada ao vivo** (os testes usam respostas simuladas). O sistema trata falha de rede sem travar o cadastro.
- Fotos importadas de fontes externas apontam para o servidor delas; prefira fotografar o produto ou usar imagens
  autorizadas pelo fabricante.
- Respostas ficam em cache (30 dias quando encontrado, 1 dia quando não encontrado) para economizar consultas.

## 11. Identidade visual e mascote

- **Logo:** usadas as versões oficiais enviadas, sem redesenho — versão amarela/creme no cabeçalho e rodapé pretos,
  versão preta/amarela em fundo claro (login), e as mesmas proporções do manual. Favicon e imagem de compartilhamento
  são a logo inteira sobre preto.
- **Cores:** preto, amarelo `#FDE500` e creme `#FFFBD4` extraídos dos arquivos da logo.
- **Fontes:** o manual pede **Uniform Medium/Ultra**, fonte comercial cujos arquivos não foram enviados (o PDF traz só
  um recorte embutido, que não pode ser reutilizado). Foi usada **Montserrat** (licença OFL, hospedada no próprio
  site), geometricamente próxima. Com os arquivos e a licença web da Uniform, basta trocar os `@font-face` em
  `public/css/store.css` e `public/css/admin.css`.
- **Mascote:** a composição 2×2 (com marca d’água de banco de imagens) **não foi usada**. O banner usa um recorte
  da composição com logos de fabricantes, **sem** os logos, marcado na loja como **“Arte provisória”** e listado
  como pendência no painel.
  - **Arquivo necessário:** mascote final licenciado, PNG ou WebP, mínimo 1600 × 1600 px, fundo transparente ou
    preto, sem textos de terceiros; opcionalmente uma versão vertical para celular.
  - **Atenção:** no tênis do mascote há um traço semelhante ao símbolo de uma marca esportiva. Recomenda-se
    corrigir na arte final.
- As marcas de fabricantes da arte original **não** foram usadas como “parceiros”; a seção de marcas é configurável.
- Sem avaliações, depoimentos, contadores de vendas ou urgência de estoque inventados. Produtos demo usam
  fabricantes fictícios (“Fabricante Demo A/B/C”) e imagens ilustrativas.

## 12. O que funciona, o que é demonstrativo, o que está pendente

**Funcionando (com servidor):**

- Loja mobile primeiro: busca (produto, marca, categoria, sabor, código), categorias, banner editável, seções
  Ofertas/Destaques/Novidades/Kits, filtros (marca, categoria, preço, disponibilidade, ofertas), ordenação,
  limpar filtros, links compartilháveis com metadados (Open Graph, JSON-LD, sitemap).
- Produto: galeria, sabores/tamanhos com estoque por opção, quantidade, preço/promoção/Pix/parcelas quando
  configurados, consulta de entrega, dúvida no WhatsApp identificando produto e opção, relacionados.
- Carrinho persistente (sobrevive a recarregar), revalidação de preço e estoque no servidor.
- Pedido pelo WhatsApp com número, reserva com expiração e página de acompanhamento.
- Checkout pelo site sem senha: retirada/entrega, CEP com correção, resumo, Pix/cartão (via provedor), confirmação e
  consulta do pedido.
- Painel protegido (senha com scrypt, sessão HttpOnly/SameSite=Strict, proteção CSRF, limite de tentativas):
  produtos, opções, fotos, custo/margem, promoção com validade, estoque com histórico e alertas, pedidos e estados,
  clientes, banners, seções, páginas, configurações, CSV, backup, código de barras (câmera/leitor/digitação).

**Demonstrativo:** produtos “DEMO”, provedor “Demonstração”, arte provisória do mascote, textos modelo das páginas,
`dist/nutauro-demo.html`.

**Pendente / depende de terceiros:**

- Credenciais do Mercado Pago (pagamento real) — código pronto, não testado contra a API real.
- Token Cosmos (opcional) e teste ao vivo do Open Food Facts.
- Integração de frete nacional (hoje: “a confirmar”).
- Número de WhatsApp, endereço, CNPJ, taxas por região, textos das páginas — preenchimento pela loja.
- Arte final do mascote e (opcional) arquivos da fonte Uniform.
- Recuperação de senha por e-mail e múltiplos usuários com permissões diferentes (a tabela de usuários já tem papel).

## 13. O que foi testado

Automatizado (`npm test`, 16 testes, todos passando):

- GTIN válido/inválido (EAN-13, EAN-8, UPC-A); preço promocional com validade; Pix e parcelas só quando configurados.
- Frete: mesmo dia antes/depois do horário limite, sem estoque, domingo, feriado; horas corridas; transportadora;
  CEP inválido; frete grátis; faixa bloqueada.
- Mensagem do WhatsApp com itens, sabores, tamanhos, quantidades, preços, frete e total.
- Pedido: preço do navegador ignorado; reserva sem baixa; bloqueio acima do disponível e de item esgotado; custo
  ausente da API pública.
- Expiração libera reserva; confirmação baixa uma vez; recebimento separado; cancelamento devolve.
- Venda acima do estoque bloqueada entre pedidos concorrentes.
- Pagamento: evento repetido não duplica pagamento nem baixa; segundo “aprovado” ignorado; assinatura falsa
  recusada; pagamento sem estoque vai para revisão; webhook do Mercado Pago com assinatura HMAC e reconsulta (API simulada).
- Painel: login, cookie seguro, bloqueio sem cabeçalho anti-CSRF, publicação exige cadastro mínimo, código
  duplicado/inválido recusado, entrada/saída/ajuste, arquivamento, página do produto com metadados.
- Código de barras: interno, inválido, externo encontrado com origem, cache, falha de rede (fonte simulada).
- CSV: exportação, prévia com erro por linha, importação com ajuste rastreável.

No navegador (Chromium automatizado, celular 390 px e desktop 1366 px): busca e filtros, seleção de variação
(bloqueio de esgotado e de escolha pendente), adição rápida, carrinho após recarregar, pedido pelo WhatsApp completo,
compra pelo site com pagamento simulado, estados vazios (sem resultado, carrinho vazio), painel (login, código
inválido/desconhecido/conhecido, cadastro e publicação, entrada de estoque, confirmação de venda) e a demonstração em
arquivo único.

**Não testado:** câmera real (não há câmera no ambiente — a leitura usa `BarcodeDetector` ou a biblioteca ZXing),
consulta real às APIs externas (rede bloqueada), Mercado Pago real, navegadores iOS/Safari reais.

## 14. Publicação: próximos passos

1. **Hospedagem com disco persistente** (o banco e as fotos ficam em `DATA_DIR`): VPS (ex.: com Docker ou PM2 +
   Nginx/Caddy) ou PaaS com volume persistente. Node.js 22.13+.
2. **Domínio e HTTPS** (obrigatório para câmera, cookies seguros e Mercado Pago). Definir `PUBLIC_URL`, `COOKIE_SECURE=1`, `NODE_ENV=production`.
3. Definir `ADMIN_EMAIL`/`ADMIN_PASSWORD` fortes; `SEED_DEMO=0` (ou remover a demonstração no painel).
4. Preencher o checklist “Para publicar a loja” no painel; conferir faixas de CEP e taxas.
5. Substituir o banner provisório pela arte final do mascote.
6. Cadastrar produtos reais (código de barras ou CSV) com fotos próprias ou autorizadas.
7. **Backup:** Painel → Importar/exportar → “Baixar backup” e/ou cópia diária automática de `DATA_DIR` na hospedagem.
8. Ativar o Mercado Pago (seção 9) se for vender pelo site.
9. Escrever e publicar as páginas de entregas, trocas e privacidade.

## 15. Evolução da gestão

Preparado na estrutura, sem telas que fingem funcionar:

- `orders.channel` já aceita `balcao` (venda presencial com o mesmo estoque e a mesma reserva/baixa).
- `payments` registra cada recebimento (provedor, método, valor, estorno) separado da situação do pedido:
  base para caixa, formas de pagamento e conciliação.
- `order_items` guarda o custo da época da venda → margem estimada e mais vendidos por período.
- `stock_movements` registra toda alteração com motivo, usuário e pedido → relatórios de estoque.
- Próximos módulos sugeridos: abertura/fechamento de caixa, receitas e despesas, relatórios por período.
