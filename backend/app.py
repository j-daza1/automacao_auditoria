
import os
import io
import time
from flask import Flask, jsonify, request, send_from_directory, Response
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from flask_cors import CORS
from dotenv import load_dotenv

from jira_client import (
    buscar_issues,
    obter_issue,
    listar_projetos,
    criar_issue,
    atualizar_status,
    listar_transicoes,
    validar_token,
)
from confluence_client import (
    validar_token as validar_token_confluence,
    publicar_auditoria,
)
from auditoria import (
    coletar_issues_release,
    processar_dados_auditoria,
)
import auditoria as aud_mod

load_dotenv()

app = Flask(__name__, static_folder="../frontend", static_url_path="")
CORS(app)


def get_token():
    """Extrai o token do header X-Jira-Token de cada requisição."""
    token = request.headers.get("X-Jira-Token", "")
    if not token:
        return None
    return token


# ============================================================
# ROTA PRINCIPAL - Serve o front-end
# ============================================================
@app.route("/")
def index():
    return send_from_directory("../frontend", "index.html")


@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory("../frontend", filename)


# ============================================================
# AUTENTICAÇÃO
# ============================================================

@app.route("/api/login", methods=["POST"])
def login():
    """Valida o token do usuário e retorna os dados dele."""
    data = request.json
    token = data.get("token", "")
    if not token:
        return jsonify({"erro": "Token não fornecido"}), 400

    resultado = validar_token(token)
    if resultado.get("valido"):
        return jsonify(resultado)
    else:
        return jsonify({"valido": False, "erro": "Token inválido. Verifique se o token está correto."}), 401


# ============================================================
# API ENDPOINTS - Issues
# ============================================================

@app.route("/api/buscar-datasets")
def buscar_datasets():
    """Busca boards e filtros do Jira para encontrar 'Home Devices'."""
    import requests
    import urllib3
    urllib3.disable_warnings()

    token = get_token()
    if not token:
        return jsonify({"erro": "Token não fornecido. Faça login."}), 401

    JIRA_URL = os.environ.get("JIRA_URL", "").rstrip("/")
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {token}",
    }

    resultado = {"boards": [], "filtros": [], "projetos": []}

    # Buscar boards
    try:
        r = requests.get(
            f"{JIRA_URL}/rest/agile/1.0/board",
            headers=headers,
            params={"maxResults": 100},
            verify=False,
            timeout=15
        )
        if r.status_code == 200:
            boards = r.json().get("values", [])
            for b in boards:
                resultado["boards"].append({
                    "id": b.get("id"),
                    "name": b.get("name", ""),
                    "type": b.get("type", ""),
                    "location": b.get("location", {}).get("name", "") if b.get("location") else "",
                })
    except Exception as e:
        resultado["erro_boards"] = str(e)

    # Buscar filtros favoritos
    try:
        r = requests.get(
            f"{JIRA_URL}/rest/api/2/filter/favourite",
            headers=headers,
            verify=False,
            timeout=15
        )
        if r.status_code == 200:
            filtros = r.json()
            for f in filtros:
                resultado["filtros"].append({
                    "id": f.get("id"),
                    "name": f.get("name", ""),
                    "jql": f.get("jql", ""),
                })
    except Exception as e:
        resultado["erro_filtros"] = str(e)

    # Buscar todos os filtros
    try:
        r = requests.get(
            f"{JIRA_URL}/rest/api/2/filter",
            headers=headers,
            params={"expand": "jql", "maxResults": 100},
            verify=False,
            timeout=15
        )
        if r.status_code == 200:
            filtros = r.json()
            if isinstance(filtros, list):
                for f in filtros:
                    nome = f.get("name", "")
                    # So adicionar se nao estiver duplicado
                    if not any(x["name"] == nome for x in resultado["filtros"]):
                        resultado["filtros"].append({
                            "id": f.get("id"),
                            "name": nome,
                            "jql": f.get("jql", ""),
                        })
    except Exception as e:
        resultado["erro_filtros_todos"] = str(e)

    return jsonify(resultado)


@app.route("/api/projetos")
def get_projetos():
    token = get_token()
    if not token:
        return jsonify({"erro": "Token não fornecido. Faça login."}), 401
    resultado = listar_projetos(token)
    if isinstance(resultado, dict) and "erro" in resultado:
        return jsonify(resultado), 500
    return jsonify(resultado)


@app.route("/api/issues/<projeto>")
def get_issues(projeto):
    token = get_token()
    if not token:
        return jsonify({"erro": "Token não fornecido. Faça login."}), 401
    max_results = request.args.get("max", 50, type=int)
    resultado = buscar_issues(projeto, token, max_results)
    if isinstance(resultado, dict) and "erro" in resultado:
        return jsonify(resultado), 500
    return jsonify(resultado)


@app.route("/api/issue/<issue_key>")
def get_issue(issue_key):
    token = get_token()
    if not token:
        return jsonify({"erro": "Token não fornecido. Faça login."}), 401
    resultado = obter_issue(issue_key, token)
    if isinstance(resultado, dict) and "erro" in resultado:
        return jsonify(resultado), 500
    return jsonify(resultado)


@app.route("/api/issue", methods=["POST"])
def post_issue():
    token = get_token()
    if not token:
        return jsonify({"erro": "Token não fornecido. Faça login."}), 401
    data = request.json
    projeto = data.get("projeto", "")
    resumo = data.get("resumo", "")
    descricao = data.get("descricao", "")
    tipo = data.get("tipo", "Task")
    if not projeto or not resumo:
        return jsonify({"erro": "Campos 'projeto' e 'resumo' são obrigatórios"}), 400
    resultado = criar_issue(projeto, resumo, descricao, token, tipo)
    if isinstance(resultado, dict) and "erro" in resultado:
        return jsonify(resultado), 500
    return jsonify(resultado), 201


@app.route("/api/issue/<issue_key>/transicoes")
def get_transicoes(issue_key):
    token = get_token()
    if not token:
        return jsonify({"erro": "Token não fornecido. Faça login."}), 401
    resultado = listar_transicoes(issue_key, token)
    if isinstance(resultado, dict) and "erro" in resultado:
        return jsonify(resultado), 500
    return jsonify(resultado)


@app.route("/api/issue/<issue_key>/status", methods=["PUT"])
def put_status(issue_key):
    token = get_token()
    if not token:
        return jsonify({"erro": "Token não fornecido. Faça login."}), 401
    data = request.json
    transicao_id = data.get("transicao_id")
    if not transicao_id:
        return jsonify({"erro": "Campo 'transicao_id' é obrigatório"}), 400
    resultado = atualizar_status(issue_key, transicao_id, token)
    if isinstance(resultado, dict) and "erro" in resultado:
        return jsonify(resultado), 500
    return jsonify({"sucesso": True, "mensagem": f"Status da issue {issue_key} atualizado"})


# ============================================================
# API ENDPOINTS - LABELS
# ============================================================

@app.route("/api/labels/<projeto>/<release>")
def get_labels(projeto, release):
    token = get_token()
    if not token:
        return jsonify({"erro": "Token não fornecido. Faça login."}), 401
    from collections import Counter
    issues = coletar_issues_release(projeto, release, token)
    if not issues:
        return jsonify({"erro": "Nenhuma issue encontrada"}), 404
    labels_counter = Counter()
    for issue in issues:
        labels = issue.get("fields", {}).get("labels", [])
        for label in labels:
            labels_counter[label] += 1
    labels_list = [{"name": k, "count": v} for k, v in labels_counter.most_common()]
    return jsonify({"total_labels": len(labels_list), "labels": labels_list})


# ============================================================
# FUNÇÃO AUXILIAR - Extrair filtros da requisição
# ============================================================

def extrair_filtros():
    """Extrai os filtros dos query params da requisição HTTP."""
    filtros = {}

    labels = request.args.get("labels")
    if labels:
        filtros["labels"] = labels.split(",")

    issuetype = request.args.get("issuetype")
    if issuetype:
        filtros["issuetype"] = issuetype

    priority = request.args.get("priority")
    if priority:
        filtros["priority"] = priority

    assignee = request.args.get("assignee")
    if assignee:
        filtros["assignee"] = assignee

    status = request.args.get("status")
    if status:
        filtros["status"] = status

    data_inicio = request.args.get("data_inicio")
    if data_inicio:
        filtros["data_inicio"] = data_inicio

    data_fim = request.args.get("data_fim")
    if data_fim:
        filtros["data_fim"] = data_fim

    resolucao_excluir = request.args.get("resolucao_excluir")
    if resolucao_excluir:
        filtros["resolucao_excluir"] = resolucao_excluir.split(",")

    componente_excluir = request.args.get("componente_excluir")
    if componente_excluir:
        filtros["componente_excluir"] = componente_excluir.split(",")

    labels_excluir = request.args.get("labels_excluir")
    if labels_excluir:
        filtros["labels_excluir"] = labels_excluir.split(",")

    res_data_inicio = request.args.get("res_data_inicio")
    if res_data_inicio:
        filtros["res_data_inicio"] = res_data_inicio

    res_data_fim = request.args.get("res_data_fim")
    if res_data_fim:
        filtros["res_data_fim"] = res_data_fim

    order_by = request.args.get("order_by")
    if order_by:
        filtros["order_by"] = order_by

    return filtros if filtros else None


# ============================================================
# API ENDPOINTS - AUDITORIA
# ============================================================

@app.route("/api/auditoria/<projeto>/<release>")
def get_auditoria(projeto, release):
    token = get_token()
    if not token:
        return jsonify({"erro": "Token não fornecido. Faça login."}), 401

    filtros = extrair_filtros()

    t0 = time.time()
    issues = coletar_issues_release(projeto, release, token, filtros if filtros else None)
    t1 = time.time()
    print(f"  ⏱️ Coleta de issues: {t1 - t0:.2f}s ({len(issues)} issues)")

    if not issues:
        return jsonify({"erro": "Nenhuma issue encontrada", "detalhe": f"Verifique projeto '{projeto}', release '{release}' e filtros aplicados"}), 404

    dados = processar_dados_auditoria(issues)
    t2 = time.time()
    print(f"  ⏱️ Processamento: {t2 - t1:.2f}s")

    total = len(dados)
    por_status = {}
    por_tipo = {}
    por_prioridade = {}
    por_responsavel = {}

    for d in dados:
        por_status[d["Status"]] = por_status.get(d["Status"], 0) + 1
        por_tipo[d["Tipo"]] = por_tipo.get(d["Tipo"], 0) + 1
        por_prioridade[d["Prioridade"]] = por_prioridade.get(d["Prioridade"], 0) + 1
        por_responsavel[d["Responsável"]] = por_responsavel.get(d["Responsável"], 0) + 1

    t3 = time.time()
    print(f"  ⏱️ Estatísticas: {t3 - t2:.2f}s")
    print(f"  ⏱️ TOTAL: {t3 - t0:.2f}s")

    return jsonify({
        "total": total,
        "jql": aud_mod._ultima_jql,
        "dados": dados,
        "estatisticas": {
            "por_status": por_status,
            "por_tipo": por_tipo,
            "por_prioridade": por_prioridade,
            "por_responsavel": por_responsavel,
        },
    })


@app.route("/api/auditoria/<projeto>/<release>/excel")
def get_auditoria_excel(projeto, release):
    token = get_token()
    if not token:
        return jsonify({"erro": "Token não fornecido. Faça login."}), 401

    filtros = extrair_filtros()

    issues = coletar_issues_release(projeto, release, token, filtros)
    if not issues:
        return jsonify({"erro": "Nenhuma issue encontrada"}), 404
    dados = processar_dados_auditoria(issues)

    # Criar arquivo Excel com formatação
    wb = Workbook()

    # Estilos
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="006D77", end_color="006D77", fill_type="solid")
    header_align = Alignment(horizontal="center", vertical="center", wrap_text=True)
    cell_align = Alignment(vertical="top", wrap_text=True)
    thin_border = Border(
        left=Side(style="thin", color="CCCCCC"),
        right=Side(style="thin", color="CCCCCC"),
        top=Side(style="thin", color="CCCCCC"),
        bottom=Side(style="thin", color="CCCCCC"),
    )

    # Aba 1: Dados
    ws = wb.active
    ws.title = "Dados"

    # Cabeçalho
    colunas = list(dados[0].keys())
    for col_idx, col_name in enumerate(colunas, 1):
        cell = ws.cell(row=1, column=col_idx, value=col_name)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_align
        cell.border = thin_border

    # Dados
    for row_idx, d in enumerate(dados, 2):
        for col_idx, col_name in enumerate(colunas, 1):
            cell = ws.cell(row=row_idx, column=col_idx, value=d.get(col_name, ""))
            cell.alignment = cell_align
            cell.border = thin_border

    # Largura das colunas
    larguras = {
        "Key": 15, "Resumo": 40, "Descrição": 60, "Tipo": 15, "Status": 15,
        "Prioridade": 12, "Resolução": 15, "Release": 12, "Componentes": 20,
        "Labels": 20, "Responsável": 20, "Reportador": 20,
        "Data Criação": 20, "Data Atualização": 20, "Data Resolução": 20,
        "Prazo (Due Date)": 15, "Estimativa Original": 15, "Tempo Gasto": 15,
        "Tempo Restante": 15, "Qtd Sub-tasks": 12, "URL": 50,
    }
    for col_idx, col_name in enumerate(colunas, 1):
        ws.column_dimensions[ws.cell(row=1, column=col_idx).column_letter].width = larguras.get(col_name, 20)

    # Congelar primeira linha
    ws.freeze_panes = "A2"

    # Aba 2: Resumo
    ws2 = wb.create_sheet("Resumo")
    ws2.cell(row=1, column=1, value="Resumo da Auditoria").font = Font(size=14, bold=True, color="006D77")
    ws2.cell(row=3, column=1, value="Projeto:").font = Font(bold=True)
    ws2.cell(row=3, column=2, value=projeto)
    ws2.cell(row=4, column=1, value="Release:").font = Font(bold=True)
    ws2.cell(row=4, column=2, value=release if release != "todas" else "Todas")
    ws2.cell(row=5, column=1, value="Total de Issues:").font = Font(bold=True)
    ws2.cell(row=5, column=2, value=len(dados))
    ws2.cell(row=6, column=1, value="Data Geração:").font = Font(bold=True)
    ws2.cell(row=6, column=2, value=time.strftime("%d/%m/%Y %H:%M:%S"))

    # Estatísticas na aba Resumo
    ws2.cell(row=8, column=1, value="Por Status").font = Font(size=12, bold=True, color="006D77")
    row = 9
    for d in dados:
        ws2.cell(row=row, column=1, value=d["Status"])
        ws2.cell(row=row, column=2, value=1)
        row += 1

    ws2.column_dimensions["A"].width = 30
    ws2.column_dimensions["B"].width = 15

    # Salvar em memória
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    return Response(
        output,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=auditoria_{projeto}_{release}.xlsx"},
    )


# ============================================================
# API ENDPOINTS - CONFLUENCE
# ============================================================

@app.route("/api/confluence/validar", methods=["POST"])
def confluence_validar():
    """Valida o token do Confluence."""
    data = request.json
    token = data.get("token", "")
    if not token:
        return jsonify({"erro": "Token do Confluence não fornecido"}), 400
    resultado = validar_token_confluence(token)
    if resultado.get("valido"):
        return jsonify(resultado)
    return jsonify(resultado), 401


@app.route("/api/confluence/publicar", methods=["POST"])
def confluence_publicar():
    """Publica os dados da auditoria no Confluence."""
    data = request.json
    token_confluence = data.get("confluence_token", "")
    if not token_confluence:
        return jsonify({"erro": "Token do Confluence não fornecido"}), 400

    dados = data.get("dados", [])
    estatisticas = data.get("estatisticas", {})
    total = data.get("total", 0)
    projeto = data.get("projeto", "")
    release = data.get("release", "")
    jql = data.get("jql", "")
    titulo = data.get("titulo", "")
    space_key = data.get("space_key")
    parent_id = data.get("parent_id")

    if not dados:
        return jsonify({"erro": "Nenhum dado de auditoria para publicar"}), 400

    resultado = publicar_auditoria(
        dados, estatisticas, total, projeto, release, jql, token_confluence,
        space_key=space_key, parent_id=parent_id, titulo=titulo,
    )

    if resultado.get("sucesso"):
        return jsonify(resultado)
    return jsonify(resultado), 500


# ============================================================
# INICIALIZAÇÃO
# ============================================================
if __name__ == "__main__":
    print("\n" + "=" * 50)
    print("  Automação Jira - Servidor Flask")
    print("  Acesse: http://localhost:5000")
    print("=" * 50 + "\n")
    app.run(debug=True, host="0.0.0.0", port=5000)
