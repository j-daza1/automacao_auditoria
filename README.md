# 🔧 Automação Jira - Samsung

Sistema web para coleta de dados do Jira (Server/DC) e geração de relatórios de auditoria com gráficos de throughput, estatísticas e exportação para Excel.

## 📂 Estrutura do Projeto

```
jira automacao/
├── main.py              # Ponto de entrada (inicia o servidor)
├── README.md            # Este arquivo
├── requirements.txt     # Dependências Python
├── .gitignore           # Arquivos ignorados pelo Git
├── backend/
│   ├── .env             # Configurações (URL do Jira) - NÃO commitar
│   ├── .env.example     # Template do .env (copiar para .env)
│   ├── app.py           # Servidor Flask (APIs e rotas)
│   ├── auditoria.py     # Lógica de coleta de dados do Jira
│   ├── jira_client.py   # Cliente da API do Jira (autenticação, requisições)
│   └── listar_labels.py # Listagem de labels de um projeto
└── frontend/
    ├── index.html       # Página principal (login + dashboard)
    ├── script.js        # Lógica do front-end (gráficos, tabelas, filtros)
    └── style.css        # Estilos visuais
```

## 🚀 Como Rodar

### Pré-requisitos
- Python 3.10+
- Acesso à rede da Samsung (para acessar o Jira)

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
   Edite o `.env` e ajuste a URL do Jira se necessário.

3. **Iniciar o servidor:**
   ```bash
   python main.py
   ```

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

## 📊 Funcionalidades

### Auditoria de Release
- Coleta todas as issues de um projeto/release
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

## 🛠️ Tecnologias

- **Backend**: Python, Flask, requests, openpyxl
- **Frontend**: HTML, CSS, JavaScript, Chart.js
- **API**: Jira REST API v2

## 📝 Notas

- O sistema foi ajustado para bater com os valores do Actionable Agile (referência)
- Mês atual (Maio/2026): Sub-task = 1.40, Story Bug = 3.50 ✅
- Mês anterior (Abril/2026): Sub-task = 1.68 ✅, Story Bug = 8.68 (referência: 8.78)
