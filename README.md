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
- **Configurações:** metas, preferências do radar, notificações (no máximo 2 por dia, com horário de silêncio), tema claro/escuro, backup e restauração, e sincronização criptografada opcional.

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

- Tudo fica salvo **somente no seu aparelho**. Este repositório é público e **não contém nenhum dado pessoal nem senha**.
- Use **Configurações → Baixar backup** periodicamente.
- **Sincronizar celular e computador (opcional):** os dados são criptografados no aparelho (AES-256-GCM, chave derivada da sua frase-senha com PBKDF2) e enviados para um **Gist secreto** da sua conta. Você precisa de um token do GitHub **só com permissão de Gists**, criado em GitHub → Settings → Developer settings → Personal access tokens. Token e frase-senha ficam apenas no aparelho e não entram no backup.

## Estrutura

```
app/                 PWA estático (HTML + CSS + JavaScript sem etapa de build)
  js/planner.js      geração do plano, recuperação de pendentes, ciclo e revisões
  js/radar.js        situação, filtros, preferências e remoção de duplicatas
  js/timer.js        cronômetro com tempo efetivo e inatividade
  js/alerts.js       alertas e exportação .ics
  js/views/          telas
  data/radar.json    dados do radar (atualizados pelo Actions)
scripts/             atualização automática do radar
tests/unit/          testes das regras (node --test)
tests/e2e/flows.mjs  fluxos principais em navegador real, com tela de iPhone
```

## Testes

```
npm install
npm test            # regras: fuso de Brasília, situação, preferências, plano, recuperação, cronômetro, alertas
npm start & npm run test:e2e   # fluxos: cadastrar concurso → inscrito → gerar plano → iniciar/pausar → registrar questões → evolução
```
