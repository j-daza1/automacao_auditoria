# 🔧 Automação Jira - Samsung

Sistema web para coleta de dados do Jira (Server/DC) e geração de relatórios de auditoria com gráficos de throughput, estatísticas, exportação para Excel e **publicação automática no Confluence**.

## 📂 Estrutura do Projeto

```
automacao_auditoria/
├── main.py                  # Ponto de entrada alternativo (inicia o servidor pela raiz)
├── README.md                # Este arquivo
├── requirements.txt         # Dependências Python
├── .gitignore               # Arquivos ignorados pelo Git
├── backend/
│   ├── .env                 # Configurações (URLs e tokens) - NÃO commitar
│   ├── .env.example         # Template do .env (copiar para .env)
│   ├── app.py               # Servidor Flask (APIs e rotas, incluindo Confluence)
│   ├── auditoria.py         # Lógica de coleta de dados do Jira
│   ├── jira_client.py       # Cliente da API do Jira (autenticação, requisições)
│   ├── confluence_client.py # Cliente da API do Confluence (criar/atualizar páginas)
│   ├── teste_confluence.py  # Teste de integração com o Confluence (cria e deleta página de teste)
│   └── listar_labels.py     # Listagem de labels de um projeto
└── frontend/
    ├── index.html           # Página principal (login + dashboard + modal do Confluence)
    ├── script.js            # Lógica do front-end (gráficos, tabelas, filtros, publicação)
    └── style.css            # Estilos visuais
```

## 🚀 Como Rodar

### Pré-requisitos
- Python 3.10+
- Acesso à rede da Samsung (para acessar o Jira e o Confluence)

### Passo a Passo

1. **Instalar dependências:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Configurar o ambiente:**
   ```bash
   cd backend
   cp .env.example .env
   ```
   Edite o `.env` e ajuste a URL do Jira (e do Confluence, se necessário).

3. **Iniciar o servidor (a partir da pasta `backend/`):**
   ```bash
   python app.py
   ```
   > Alternativa: pela raiz do projeto, use `python main.py` (usa a porta definida em `FLASK_PORT`).

4. **Acessar no navegador:**
   ```
   http://localhost:5000
   ```

## 🔑 Autenticação

Cada usuário faz login com seu próprio **Personal Access Token** do Jira.

### Como gerar um token:
1. Acesse o [Jira](https://jira-la.secext.samsung.net/secure/ViewProfile.jspa?selectedTab=com.atlassian.pats.pats-plugin:jira-user-personal-access-tokens)
2. Clique em "Create Access Token"
3. Dê um nome (ex: "Automação")
4. Copie o token gerado
5. Cole na tela de login do sistema

O token é salvo no `localStorage` do navegador (não no servidor).

> **Confluence:** a publicação usa um token próprio do Confluence (PAT), que **pode ser diferente** do token do Jira. Ele é solicitado no modal de publicação e, após a primeira publicação bem-sucedida, fica salvo no `localStorage` do navegador (o token é válido por ~1 ano) — não é preciso digitá-lo novamente. Ele nunca fica salvo no servidor.

## 📊 Funcionalidades

### Auditoria de Release
- Coleta todas as issues de um projeto/release
- Tabela de issues com paginação (10 por página)
- Filtros por labels, tipo, prioridade, responsável, status
- Exclusões de resoluções (Canceled, Duplicate), componentes (PDI), labels (no_metrics)
- Filtro por período de resolução

### Gráficos
- **Pizza**: Por Status, Por Tipo, Por Prioridade, Por Responsável
- **Histograma de Throughput**: Frequência de items completados por dia + linha cumulativa
  - Modo "Todos os dias": inclui fins de semana e feriados
  - Modo "Sem feriados": exclui feriados nacionais
  - Modo "Actionable Agile (ref)": dados de referência

### Throughput por Tipo
- Sub-task e Story Bug por dia útil
- Comparação: mês atual (current) vs mês anterior (last period)
- Dias úteis calculados excluindo fins de semana e feriados nacionais brasileiros

### Exportação
- **Excel (.xlsx)**: Dados completos com formatação
- **PNG**: Gráfico de throughput como imagem

### 📄 Publicação no Confluence
Após executar uma auditoria, é possível publicar o resultado como página no Confluence:

1. Execute uma auditoria (projeto/release) normalmente — clique em **🔍 Procurar**
2. Role até o final dos resultados e clique no botão destacado **"📄 Publicar Auditoria no Confluence"**
3. Informe seu **token do Confluence (PAT)** e, opcionalmente, um título para a página
4. A página é criada no espaço configurado, abaixo da página pai definida

> ⚠️ **Importante:** o botão **🔍 Procurar** apenas executa a auditoria (coleta dados do Jira e mostra gráficos/estatísticas). A publicação no Confluence é um passo **separado e manual**, feito pelo botão **"Publicar no Confluence"**.

**Comportamento:**
- Se já existir uma página com o mesmo título no espaço, ela é **atualizada** (nova versão)
- Caso contrário, uma **nova página é criada**
- A página inclui: resumo, estatísticas (status, tipo, prioridade, responsável), tabela completa das issues com links e a JQL utilizada
- **📊 Gráficos anexados:** todos os gráficos exibidos no front-end (por status, tipo, prioridade, responsável, throughput/run chart, cycle time e scatter) são capturados como imagens PNG (fundo branco), anexados à página e exibidos na seção **"📊 Gráficos"** — em republicações, os anexos com mesmo nome ganham nova versão automaticamente

**Testar a integração** (cria uma página de teste e a deleta em seguida — não deixa sujeira):
```bash
cd backend
python teste_confluence.py SEU_TOKEN_CONFLUENCE
```

## ⚙️ Configurações do Confluence (opcionais)

O cliente do Confluence usa estes valores (com padrões já definidos no código, configuráveis no `backend/.env`):

| Variável | Padrão | Descrição |
|---|---|---|
| `CONFLUENCE_URL` | `https://confluence-la.secext.samsung.net` | URL do Confluence Server/DC |
| `CONFLUENCE_SPACE_KEY` | `BXBNG` | Espaço onde a página será publicada |
| `CONFLUENCE_PARENT_ID` | `404561599` | ID da página pai (Service Delivery Review) |

## ⚙️ Cálculos Importantes

### Dias Úteis
- Exclui sábados e domingos
- Exclui feriados nacionais brasileiros (fixos e móveis)
- **Mês atual**: usa todos os dias úteis do calendário
- **Mês anterior**: subtrai 1 dia e remove filtros de Canceled/PDI/no_metrics (para bater com sistema de referência Actionable Agile)

### Throughput
```
Throughput = Total de Issues ÷ Dias Úteis
```

## 🔌 Endpoints da API

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/login` | Valida token do Jira |
| GET | `/api/buscar-datasets` | Busca boards, filtros e projetos do Jira |
| GET | `/api/projetos` | Lista projetos |
| GET | `/api/issues/<projeto>` | Lista issues de um projeto |
| GET | `/api/issue/<key>` | Detalha uma issue |
| POST | `/api/issue` | Cria uma issue |
| GET | `/api/issue/<key>/transicoes` | Lista transições de status |
| PUT | `/api/issue/<key>/status` | Atualiza status de uma issue |
| GET | `/api/labels/<projeto>/<release>` | Lista labels de um projeto/release |
| GET | `/api/auditoria/<projeto>/<release>` | Executa a auditoria |
| GET | `/api/auditoria/<projeto>/<release>/excel` | Exporta auditoria para Excel |
| POST | `/api/confluence/validar` | Valida token do Confluence |
| POST | `/api/confluence/publicar` | Publica/atualiza a auditoria no Confluence |

## 🛠️ Tecnologias

- **Backend**: Python, Flask, requests, openpyxl
- **Frontend**: HTML, CSS, JavaScript, Chart.js
- **APIs**: Jira REST API v2, Confluence REST API

## 📝 Notas

- O sistema foi ajustado para bater com os valores do Actionable Agile (referência)
- Mês atual (Maio/2026): Sub-task = 1.40, Story Bug = 3.50 ✅
- Mês anterior (Abril/2026): Sub-task = 1.68 ✅, Story Bug = 8.68 (referência: 8.78)
