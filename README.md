# Rumo · estudos para concursos

Aplicativo pessoal (PWA) para responder, todos os dias: **o que vou estudar hoje, quanto já estudei e se estou mais perto da aprovação.** Ele junta o plano de estudos, o radar de concursos, as inscrições e a rotina de trabalho e faculdade.

Funciona no iPhone e no computador, em português, com datas no horário de Brasília.

## Como abrir

| Onde | Como |
|---|---|
| **Publicado (uso diário)** | `https://franciscolopes19f-commits.github.io/Planejamento-de-estudos/`. Fica disponível depois de ativar o GitHub Pages (veja abaixo). |
| **iPhone** | Abra o endereço no Safari → Compartilhar → **Adicionar à Tela de Início**. O app abre em tela cheia, funciona offline e pode enviar notificações (iOS 16.4+). |
| **Demonstração** | Acrescente `?demo=1` ao endereço para ver o app com dados fictícios. Nada é salvo nesse modo. |
| **No computador, localmente** | `npm install` e depois `npm start`. Acesse http://localhost:8080 |

### Primeiro uso: configuração inicial
Ao abrir o app pela primeira vez, a tela **Configuração inicial** pergunta:
- a que horas você acorda e dorme;
- dias e horários do trabalho e do almoço;
- dias e horários da faculdade (vem preenchido 18h20–22h, editável);
- deslocamentos;
- **em quais períodos você realmente consegue estudar**.

O app não presume nenhum horário. Ele calcula as janelas de estudo e sugere uma meta semanal de 75% do tempo livre, para sobrar folga. Dá para refazer em **Minha rotina → Refazer configuração inicial**.

O concurso **Contador – Prefeitura de Queimados** já vem como prioridade do plano. Para trocar, use **Configurações → Concurso prioritário** ou **Meus concursos → Definir como prioridade**.

### Ativar a publicação (uma vez)
1. Faça o merge desta branch na `main`.
2. No GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Em **Actions**, rode o workflow “Publicar app e atualizar radar” (ou aguarde o próximo push).

## O que já funciona

- **Hoje (painel):** “O que estudar hoje” com o botão **Iniciar estudo**, tempo estudado (hoje e semana) separado do tempo com o app aberto, metas diária e semanal, constância, questões e % de acertos, avanço no edital, revisões, lembretes, dias até as provas, inscrições perto do fim e compromissos do dia. Uma frase curta por dia. Mensagem gentil de retomada quando você fica dias sem estudar.
- **Estudar:** cronômetro com matéria, assunto, concurso e modalidade (teoria, questões, revisão ou simulado). Você pode pausar, retomar e encerrar. Ao encerrar, registra questões, acertos, erros e observações. O tempo só conta com o cronômetro ativo. A cada N minutos (padrão 25) o app pergunta “ainda estudando?”: sem resposta em 3 minutos, o cronômetro pausa e o intervalo não conta. Se você sai do app, ao voltar decide se aquele tempo conta. Também dá para registrar estudo feito fora do app.
- **Plano:** o plano semanal é gerado a partir das janelas livres e dos compromissos, da meta semanal, do peso e da dificuldade das matérias, dos erros nas questões e da data da prova-alvo. Cada sessão mostra matéria, assunto, modalidade e duração. Dá para editar, mover de dia, adicionar e excluir sessões. **Recuperar pendentes** remarca no máximo uma sessão atrasada por dia, para não virar bola de neve. Há também o modo **ciclo de estudos** e a exportação das sessões para o calendário (.ics).
- **Concursos, Radar:** os concursos são organizados por situação (previsto, edital publicado, inscrições abertas, encerradas, prova próxima), com órgão, cargo, local, banca, vagas, remuneração, datas, link oficial, fonte e data da conferência. Cada item traz um selo que separa **Oficial**, **Notícia** (a confirmar) e **Previsão**. Há busca, filtros, inclusão manual com aviso de duplicata e filtro pelas preferências (áreas, localidades, cargos e locais excluídos, como a BA).
- **Meus concursos:** os status são tenho interesse, vou me inscrever, inscrito, prova realizada e desisti. Cada concurso guarda nº de inscrição, taxa, vencimento, pagamento, comprovante (link ou arquivo de até 500 KB), local e horário de prova e outras datas. Os alertas de inscrição, pagamento e prova têm antecedência configurável e podem ser exportados para o calendário do celular com alarmes.
- **Edital e matérias:** lista de assuntos para marcar como estudados. Você pode colar o conteúdo do edital, e o texto é separado em assuntos automaticamente. Cada matéria tem peso, dificuldade e os concursos a que se aplica.
- **Revisões:** revisões automáticas em 1, 7 e 30 dias após estudar um assunto. A tela mostra as pendentes e destaca as matérias com mais erros.
- **Evolução:** gráficos de minutos por dia e horas por semana, frequência, questões, % de acertos, ranking de erros, progresso por disciplina e por concurso, e registro de simulados.
- **Minha rotina:** compromissos do escritório, da faculdade e pessoais (recorrentes ou em data específica), janelas para estudar e tarefas ou lembretes. Ao salvar, o plano se reajusta.
- **Configurações:** metas, concurso prioritário, preferências do radar, notificações (no máximo 2 por dia, com horário de silêncio), tema claro/escuro, backup e restauração, e conta com sincronização.

## Radar automático: quem consulta e quando

O workflow **`.github/workflows/publicar-e-radar.yml`** roda no **GitHub Actions** às 06h17 e às 18h17 (horário de Brasília), mesmo com o app fechado:

1. `scripts/radar-update.mjs` lê os feeds RSS listados em `scripts/radar-fontes.json` (blogs e portais especializados).
2. Guarda só as notícias das áreas de interesse, detecta a UF ou esfera federal e remove duplicatas.
3. Salva `app/data/radar.json` no repositório e republica o app.

As notícias entram como **“a confirmar”**: o robô não inventa vagas, salários nem datas. Os dados estruturados (datas, banca, vagas) vêm de cadastros conferidos, seus ou curados, sempre com fonte e data de conferência. Para incluir ou trocar fontes, edite `scripts/radar-fontes.json`. O status de cada fonte aparece no fim da tela Radar.

## Alertas com o app fechado

- **Recomendado:** em Meus concursos, toque em **Exportar datas e alertas (.ics)** e abra o arquivo no iPhone. As provas, os fins de inscrição e os pagamentos entram no app Calendário com alarmes nativos.
- **Notificações do app:** funcionam com o app aberto ou instalado na Tela de Início.

## Seus dados e segurança

- Os dados ficam salvos no aparelho. Com a conta conectada, ficam também no **seu** projeto Supabase, onde a regra de acesso (RLS) garante que só o seu login lê e grava. Este repositório é público e **não contém dados pessoais nem senhas**.
- **Configurações → Baixar backup (.json)** continua disponível, com ou sem conta.

## Sincronização iPhone ↔ notebook (Supabase)

O login é feito com o **e-mail + um código de 6 dígitos**, digitado dentro do app. Isso funciona inclusive no app instalado na Tela de Início do iPhone, porque não depende de abrir link. A sincronização é automática: ao abrir o app, ao voltar para ele e depois de cada alteração. Edições feitas nos dois aparelhos são juntadas item a item, e exclusões são respeitadas.

### Limites do plano gratuito (sem serviço de e-mail próprio)
- O e-mail padrão do Supabase **só envia para os e-mails da equipe do projeto**. Entre no app com o **mesmo e-mail da sua conta Supabase**.
- Envia **poucos e-mails por hora** (cerca de 2). Como a sessão fica salva, você só pede código ao conectar um aparelho novo ou depois de sair. Se aparecer “limite atingido”, espere e tente de novo.
- O e-mail pode cair no spam. O remetente é do Supabase.
- Projetos gratuitos com **pouca atividade no banco por 7 dias** podem ser pausados. O workflow agendado faz uma consulta leve ao banco 2x por dia (`rumo_ping`). Se mesmo assim pausar, é só reativar no painel do Supabase; os dados continuam lá e no aparelho.
- Para enviar a outros e-mails ou tirar o limite, configure um SMTP próprio (ex.: Resend, Brevo). Não é necessário para uso pessoal.

### Passo a passo (uma vez)
1. Crie uma conta em **supabase.com**. Se entrar com o GitHub, confira em *Organization → Team* qual e-mail ficou cadastrado: é esse que recebe os códigos.
2. **New project**: nome `rumo`, região **South America (São Paulo)**, guarde a senha do banco (o app não usa essa senha).
3. **SQL Editor → New query**: cole o conteúdo de `supabase/setup.sql` e clique em **Run**.
4. **Authentication → Emails (Templates)**: nos modelos **Magic Link** e **Confirm signup**, inclua o código no texto, por exemplo `Seu código do Rumo: {{ .Token }}`. Sem isso, o e-mail chega só com um link, que não serve para o app instalado.
5. **Project Settings → API**: copie o **Project URL** e a chave **anon / publishable** (pública). **Nunca** use a chave `service_role` / `secret`.
6. No GitHub: **Settings → Secrets and variables → Actions → aba Variables → New repository variable**: `SUPABASE_URL` (Project URL) e `SUPABASE_ANON_KEY` (a chave pública). Rode o workflow “Publicar app e atualizar radar” (Actions → Run workflow).
7. No iPhone (app instalado): **Configurações → Conta e sincronização**, digite o e-mail, depois o código. No notebook, repita e escolha **“Usar os dados da conta”**.
8. Depois de conectar os dois aparelhos, desligue novos cadastros em **Authentication → Sign In / Providers → Allow new users to sign up**.

## Estrutura

```
app/                 PWA estático (HTML + CSS + JavaScript sem etapa de build)
  js/planner.js      geração do plano, recuperação de pendentes, ciclo e revisões
  js/radar.js        situação, filtros, preferências e remoção de duplicatas
  js/timer.js        cronômetro com tempo efetivo e inatividade
  js/alerts.js       alertas e exportação .ics
  js/cloud.js        login por código e sincronização (Supabase, sem bibliotecas)
  js/merge.js        mesclagem em 3 vias entre aparelhos
  js/routine.js      rotina e janelas de estudo a partir da configuração inicial
  js/views/          telas
  config.js          URL e chave pública do Supabase (gravado na publicação)
  data/radar.json    dados do radar (atualizados pelo Actions)
scripts/             atualização automática do radar
supabase/setup.sql   tabela, regras de acesso (RLS) e ping
tests/unit/          testes das regras (node --test)
tests/e2e/flows.mjs  fluxos principais em navegador real, com tela de iPhone
```

## Testes

```
npm install
npm test            # regras: fuso de Brasília, situação, preferências, plano, recuperação, cronômetro, alertas
npm start & npm run test:e2e   # fluxos: configuração inicial → cadastrar concurso → inscrito → gerar plano → iniciar/pausar → registrar questões → evolução
npm run test:sync   # login por código e sincronização iPhone ↔ notebook contra um servidor que imita o Supabase
```
