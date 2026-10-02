"""
auditoria.py - Coleta de dados do Jira para auditoria

Este script coleta TODAS as issues de uma release (Fix Version) específica
de um projeto, gera um relatório em CSV e mostra estatísticas no console.

Uso:
    python auditoria.py

    (Configure PROJECT_KEY e RELEASE_NAME abaixo ou passe como argumento)
    python auditoria.py BXBNG e26
"""

import os
import sys
import csv
import logging
import requests
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

JIRA_URL = os.environ.get("JIRA_URL", "").rstrip("/")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Variavel global para guardar a ultima JQL gerada
_ultima_jql = ""


def get_headers(token):
    return {
        "Accept": "application/json",
        "Authorization": f"Bearer {token}",
    }


def coletar_issues_release(projeto, release, token, filtros=None, max_results=1000):
    """
    Coleta todas as issues de uma release (Fix Version) de um projeto, com filtros opcionais.

    Usa JQL: project = BXBNG AND fixVersion = "r26E" [AND filtros...]

    Args:
        projeto: Key do projeto (ex: BXBNG)
        release: Nome da release/versão (ex: r26E)
        filtros: Dict com filtros opcionais:
            - labels: lista de labels (ex: ["bug", "frontend"])
            - issuetype: tipo da issue (ex: "Bug")
            - priority: prioridade (ex: "Critical")
            - assignee: responsável (ex: "joao.silva")
            - status: status (ex: "Closed")
            - data_inicio: data de criação inicial (ex: "2026-01-01")
            - data_fim: data de criação final (ex: "2026-03-31")
        max_results: Máximo de issues a retornar

    Returns:
        Lista de issues com todos os campos
    """
    url = f"{JIRA_URL}/rest/api/2/search"

    # JQL base: projeto + release
    # Se release for "todas" ou vazia, busca todas as issues do projeto (sem fixVersion)
    if release and release.lower() != "todas":
        jql_parts = [f'project = {projeto} AND fixVersion = "{release}"']
    else:
        jql_parts = [f'project = {projeto}']

    # Aplicar filtros
    if filtros:
        # Labels (pode ser múltiplas — usa OR)
        if filtros.get("labels"):
            labels = filtros["labels"]
            if isinstance(labels, str):
                labels = [labels]
            label_conditions = " OR ".join([f'labels = "{l}"' for l in labels])
            jql_parts.append(f"({label_conditions})")

        # Labels a excluir (labels != no_metrics)
        if filtros.get("labels_excluir"):
            labels_ex = filtros["labels_excluir"]
            if isinstance(labels_ex, str):
                labels_ex = [labels_ex]
            for l in labels_ex:
                jql_parts.append(f'labels != "{l}"')

        # Tipo de issue
        if filtros.get("issuetype"):
            jql_parts.append(f'issuetype = "{filtros["issuetype"]}"')

        # Prioridade
        if filtros.get("priority"):
            jql_parts.append(f'priority = "{filtros["priority"]}"')

        # Responsável
        if filtros.get("assignee"):
            jql_parts.append(f'assignee = "{filtros["assignee"]}"')

        # Status
        if filtros.get("status"):
            jql_parts.append(f'status = "{filtros["status"]}"')

        # Resolução (excluir Canceled, Duplicate, etc.)
        if filtros.get("resolucao_excluir"):
            res_ex = filtros["resolucao_excluir"]
            if isinstance(res_ex, str):
                res_ex = [res_ex]
            res_list = ", ".join([f'"{r}"' for r in res_ex])
            jql_parts.append(f'resolution not in ({res_list})')

        # Componente (excluir PDI, etc.)
        if filtros.get("componente_excluir"):
            comp_ex = filtros["componente_excluir"]
            if isinstance(comp_ex, str):
                comp_ex = [comp_ex]
            for c in comp_ex:
                jql_parts.append(f'component != "{c}"')

        # Período de data (criação)
        if filtros.get("data_inicio") and filtros.get("data_fim"):
            jql_parts.append(f'created >= "{filtros["data_inicio"]}" AND created <= "{filtros["data_fim"]}"')
        elif filtros.get("data_inicio"):
            jql_parts.append(f'created >= "{filtros["data_inicio"]}"')
        elif filtros.get("data_fim"):
            jql_parts.append(f'created <= "{filtros["data_fim"]}"')

        # Período de data (resolução)
        if filtros.get("res_data_inicio") and filtros.get("res_data_fim"):
            jql_parts.append(f'resolutiondate >= "{filtros["res_data_inicio"]}" AND resolutiondate <= "{filtros["res_data_fim"]}"')
        elif filtros.get("res_data_inicio"):
            jql_parts.append(f'resolutiondate >= "{filtros["res_data_inicio"]}"')
        elif filtros.get("res_data_fim"):
            jql_parts.append(f'resolutiondate <= "{filtros["res_data_fim"]}"')

    jql = " AND ".join(jql_parts)

    # Ordenação
    order_by = filtros.get("order_by", "") if filtros else ""
    if order_by:
        jql += f' order by {order_by}'

    # DEBUG: imprimir a JQL gerada
    print(f"\n  🔍 JQL gerada: {jql}\n")

    # Guardar a JQL globalmente para retornar na resposta
    global _ultima_jql
    _ultima_jql = jql

    # Campos essenciais para auditoria (otimizado — sem campos pesados)
    fields = ",".join([
        "summary", "status", "assignee", "reporter", "priority", "created",
        "updated", "duedate", "resolution", "resolutiondate", "issuetype",
        "fixVersions", "components", "labels", "timeoriginalestimate",
        "timespent", "timeestimate", "subtasks", "description",
    ])

    # Expand changelog para extrair data de "In Progress" (Cycle Time)
    expand = "changelog"

    all_issues = []
    start_at = 0
    page_size = 200

    print(f"\n{'='*60}")
    print(f"  COLETA DE DADOS PARA AUDITORIA")
    print(f"  Projeto: {projeto}")
    print(f"  Release: {release}")
    print(f"{'='*60}\n")

    while True:
        params = {
            "jql": jql,
            "startAt": start_at,
            "maxResults": page_size,
            "fields": fields,
            "expand": expand,
        }

        try:
            response = requests.get(url, headers=get_headers(token), params=params, timeout=60)
            response.raise_for_status()
            data = response.json()

            issues = data.get("issues", [])
            total = data.get("total", 0)

            all_issues.extend(issues)
            print(f"  Coletadas {len(all_issues)} de {total} issues...", end="\r")

            if len(all_issues) >= total or len(issues) == 0:
                break

            start_at += page_size

        except requests.exceptions.HTTPError as e:
            print(f"\n❌ Erro HTTP: {e.response.status_code} - {e.response.text}")
            return []
        except requests.exceptions.RequestException as e:
            print(f"\n❌ Erro de conexão: {e}")
            return []

    print(f"  Coletadas {len(all_issues)} de {len(all_issues)} issues... ✅")
    return all_issues


def processar_dados_auditoria(issues):
    """
    Processa as issues brutas e extrai dados estruturados para auditoria.

    Returns:
        Lista de dicts com dados normalizados para CSV
    """
    dados = []

    for issue in issues:
        f = issue.get("fields", {})

        # Fix Versions (pode ter múltiplas)
        fix_versions = ", ".join([v.get("name", "") for v in f.get("fixVersions", [])])

        # Components
        components = ", ".join([c.get("name", "") for c in f.get("components", [])])

        # Labels
        labels = ", ".join(f.get("labels", []))

        # Subtasks count
        subtasks = f.get("subtasks", [])
        subtask_count = len(subtasks)

        # Time tracking (converte segundos para horas)
        original_estimate = f.get("timeoriginalestimate")
        time_spent = f.get("timespent")
        remaining = f.get("timeestimate")

        def seconds_to_hours(seconds):
            if seconds is None:
                return ""
            return f"{seconds / 3600:.2f}h"

        # Descrição (limpa tags HTML básicas)
        descricao = f.get("description", "") or ""
        # Remove tags HTML simples
        import re
        descricao = re.sub(r'<[^>]+>', '', descricao)

        # ===== Extrair data de "In Progress" do changelog (para Cycle Time) =====
        data_in_progress = ""
        changelog = issue.get("changelog", {})
        histories = changelog.get("histories", [])
        for history in histories:
            for item in history.get("items", []):
                if item.get("field") == "status":
                    to_string = item.get("toString", "")
                    # Procurar primeira transição para "In Progress"
                    if to_string and "progress" in to_string.lower():
                        data_in_progress = history.get("created", "")
                        break
            if data_in_progress:
                break

        dados.append({
            "Key": issue.get("key", ""),
            "Resumo": f.get("summary", ""),
            "Descrição": descricao,
            "Tipo": f.get("issuetype", {}).get("name", ""),
            "Status": f.get("status", {}).get("name", ""),
            "Prioridade": f.get("priority", {}).get("name", ""),
            "Resolução": f.get("resolution", {}).get("name", "Não resolvido") if f.get("resolution") else "Não resolvido",
            "Release": fix_versions,
            "Componentes": components,
            "Labels": labels,
            "Responsável": f.get("assignee", {}).get("displayName", "Não atribuído") if f.get("assignee") else "Não atribuído",
            "Reportador": f.get("reporter", {}).get("displayName", "N/A") if f.get("reporter") else "N/A",
            "Data Criação": f.get("created", ""),
            "Data In Progress": data_in_progress,
            "Data Atualização": f.get("updated", ""),
            "Data Resolução": f.get("resolutiondate", ""),
            "Prazo (Due Date)": f.get("duedate", ""),
            "Estimativa Original": seconds_to_hours(original_estimate),
            "Tempo Gasto": seconds_to_hours(time_spent),
            "Tempo Restante": seconds_to_hours(remaining),
            "Qtd Sub-tasks": subtask_count,
            "URL": f"{JIRA_URL}/browse/{issue.get('key', '')}",
        })

    return dados


def gerar_estatisticas(dados):
    """Gera estatísticas resumidas dos dados coletados."""
    if not dados:
        return

    total = len(dados)

    # Contar por status
    por_status = {}
    por_tipo = {}
    por_prioridade = {}
    por_responsavel = {}
    por_resolucao = {}

    for d in dados:
        # Status
        s = d["Status"]
        por_status[s] = por_status.get(s, 0) + 1

        # Tipo
        t = d["Tipo"]
        por_tipo[t] = por_tipo.get(t, 0) + 1

        # Prioridade
        p = d["Prioridade"]
        por_prioridade[p] = por_prioridade.get(p, 0) + 1

        # Responsável
        r = d["Responsável"]
        por_responsavel[r] = por_responsavel.get(r, 0) + 1

        # Resolução
        res = d["Resolução"]
        por_resolucao[res] = por_resolucao.get(res, 0) + 1

    print(f"\n{'='*60}")
    print(f"  📊 ESTATÍSTICAS DA AUDITORIA")
    print(f"{'='*60}")
    print(f"\n  Total de Issues: {total}")

    print(f"\n  📌 Por Status:")
    for k, v in sorted(por_status.items(), key=lambda x: -x[1]):
        pct = (v / total) * 100
        bar = "█" * int(pct / 2)
        print(f"     {k:30s} {v:4d} ({pct:5.1f}%) {bar}")

    print(f"\n  📌 Por Tipo:")
    for k, v in sorted(por_tipo.items(), key=lambda x: -x[1]):
        pct = (v / total) * 100
        print(f"     {k:30s} {v:4d} ({pct:5.1f}%)")

    print(f"\n  📌 Por Prioridade:")
    for k, v in sorted(por_prioridade.items(), key=lambda x: -x[1]):
        pct = (v / total) * 100
        print(f"     {k:30s} {v:4d} ({pct:5.1f}%)")

    print(f"\n  📌 Por Resolução:")
    for k, v in sorted(por_resolucao.items(), key=lambda x: -x[1]):
        pct = (v / total) * 100
        print(f"     {k:30s} {v:4d} ({pct:5.1f}%)")

    print(f"\n  📌 Por Responsável:")
    for k, v in sorted(por_responsavel.items(), key=lambda x: -x[1]):
        pct = (v / total) * 100
        print(f"     {k:30s} {v:4d} ({pct:5.1f}%)")

    print(f"\n{'='*60}\n")


def exportar_csv(dados, projeto, release):
    """Exporta os dados para um arquivo CSV."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"auditoria_{projeto}_{release}_{timestamp}.csv"
    filepath = os.path.join(os.path.dirname(__file__), "..", filename)

    if not dados:
        print("❌ Nenhum dado para exportar.")
        return None

    with open(filepath, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=dados[0].keys())
        writer.writeheader()
        writer.writerows(dados)

    print(f"✅ CSV exportado: {os.path.abspath(filepath)}")
    print(f"   Total de registros: {len(dados)}")
    return filepath


# ============================================================
# EXECUÇÃO PRINCIPAL
# ============================================================
if __name__ == "__main__":
    # Configuração via argumentos ou valores padrão
    # Uso: python auditoria.py BXBNG r26E [--labels bug,frontend] [--issuetype Bug] [--priority Critical]
    if len(sys.argv) >= 3:
        PROJECT_KEY = sys.argv[1].upper()
        RELEASE_NAME = sys.argv[2]
    else:
        PROJECT_KEY = "BXBNG"
        RELEASE_NAME = "r26E"

    # Parse de filtros via argumentos
    filtros = {}
    args = sys.argv[3:]
    i = 0
    while i < len(args):
        if args[i] == "--labels" and i + 1 < len(args):
            filtros["labels"] = args[i + 1].split(",")
            i += 2
        elif args[i] == "--issuetype" and i + 1 < len(args):
            filtros["issuetype"] = args[i + 1]
            i += 2
        elif args[i] == "--priority" and i + 1 < len(args):
            filtros["priority"] = args[i + 1]
            i += 2
        elif args[i] == "--assignee" and i + 1 < len(args):
            filtros["assignee"] = args[i + 1]
            i += 2
        elif args[i] == "--status" and i + 1 < len(args):
            filtros["status"] = args[i + 1]
            i += 2
        elif args[i] == "--data-inicio" and i + 1 < len(args):
            filtros["data_inicio"] = args[i + 1]
            i += 2
        elif args[i] == "--data-fim" and i + 1 < len(args):
            filtros["data_fim"] = args[i + 1]
            i += 2
        else:
            i += 1

    print(f"\n🔍 Iniciando coleta de dados...")
    print(f"   Projeto: {PROJECT_KEY}")
    print(f"   Release: {RELEASE_NAME}")
    if filtros:
        print(f"   Filtros: {filtros}")

    # Token do .env (para uso via linha de comando)
    JIRA_TOKEN = os.environ.get("JIRA_TOKEN", "")
    if not JIRA_TOKEN:
        print("❌ JIRA_TOKEN não configurado no arquivo .env!")
        sys.exit(1)

    # 1. Coletar issues da release (com filtros)
    issues = coletar_issues_release(PROJECT_KEY, RELEASE_NAME, JIRA_TOKEN, filtros)

    if not issues:
        print("\n❌ Nenhuma issue encontrada. Verifique:")
        print(f"   - O projeto '{PROJECT_KEY}' existe no Jira?")
        print(f"   - A release '{RELEASE_NAME}' existe no projeto?")
        print(f"   - Seu token tem permissão de acesso?")
        sys.exit(1)

    # 2. Processar dados para auditoria
    dados = processar_dados_auditoria(issues)

    # 3. Gerar estatísticas
    gerar_estatisticas(dados)

    # 4. Exportar para CSV
    exportar_csv(dados, PROJECT_KEY, RELEASE_NAME)

    print("\n✅ Auditoria concluída com sucesso!\n")
