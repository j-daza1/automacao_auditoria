"""
confluence_client.py - Comunicação com a API REST do Confluence Server/DC (Samsung)

Este módulo encapsula todas as chamadas à API do Confluence.
O token do Confluence é enviado pelo front-end a cada requisição (header X-Confluence-Token),
pois pode ser diferente do token do Jira.
"""

import os
import html
import base64
import logging
from io import BytesIO

import requests
import urllib3
from datetime import datetime

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

CONFLUENCE_URL = os.environ.get(
    "CONFLUENCE_URL", "https://confluence-la.secext.samsung.net"
).rstrip("/")

# Espaço e página pai padrão (BXBNG - Service Delivery Review)
CONFLUENCE_SPACE_KEY = os.environ.get("CONFLUENCE_SPACE_KEY", "BXBNG")
CONFLUENCE_PARENT_ID = os.environ.get("CONFLUENCE_PARENT_ID", "404561599")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def get_headers(token):
    """Retorna headers com Bearer Token do Confluence."""
    if not token:
        raise ValueError("Token do Confluence não fornecido!")
    return {
        "Accept": "application/json",
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


# ============================================================
# VALIDAR TOKEN
# ============================================================

def validar_token(token):
    """Valida se o token do Confluence é válido buscando o usuário atual."""
    url = f"{CONFLUENCE_URL}/rest/api/user/current"
    try:
        r = requests.get(url, headers=get_headers(token), verify=False, timeout=15)
        if r.status_code == 200:
            data = r.json()
            return {
                "valido": True,
                "nome": data.get("displayName", ""),
                "usuario": data.get("username", ""),
            }
        return {"valido": False, "erro": f"HTTP {r.status_code}"}
    except requests.exceptions.RequestException as e:
        logger.error("Erro ao validar token Confluence: %s", e)
        return {"valido": False, "erro": str(e)}


# ============================================================
# BUSCAR PÁGINA
# ============================================================

def buscar_pagina_por_titulo(space_key, titulo, token):
    """Busca uma página pelo título dentro de um espaço. Retorna o ID+version ou None."""
    url = f"{CONFLUENCE_URL}/rest/api/content"
    params = {"type": "page", "spaceKey": space_key, "title": titulo, "expand": "version"}
    try:
        r = requests.get(url, headers=get_headers(token), params=params, verify=False, timeout=15)
        if r.status_code == 200:
            results = r.json().get("results", [])
            if results:
                page = results[0]
                return {"id": page.get("id"), "version": page.get("version", {}).get("number", 1)}
        return None
    except requests.exceptions.RequestException as e:
        logger.error("Erro ao buscar página: %s", e)
        return None



# ============================================================
# CRIAR PÁGINA
# ============================================================

def criar_pagina(space_key, titulo, conteudo_html, parent_id, token):
    """Cria uma nova página no Confluence."""
    url = f"{CONFLUENCE_URL}/rest/api/content"
    payload = {
        "type": "page",
        "title": titulo,
        "space": {"key": space_key},
        "body": {"storage": {"value": conteudo_html, "representation": "storage"}},
    }
    if parent_id:
        payload["ancestors"] = [{"id": str(parent_id)}]

    try:
        r = requests.post(url, json=payload, headers=get_headers(token), verify=False, timeout=30)
        if r.status_code in (200, 201):
            data = r.json()
            page_id = data.get("id")
            link = CONFLUENCE_URL + data.get("_links", {}).get("webui", "")
            logger.info("Página criada no Confluence: %s (ID %s)", titulo, page_id)
            return {"sucesso": True, "page_id": page_id, "link": link, "titulo": titulo}
        logger.error("Erro ao criar página: %s - %s", r.status_code, r.text[:300])
        return {"sucesso": False, "erro": f"HTTP {r.status_code}", "detalhe": r.text[:500]}
    except requests.exceptions.RequestException as e:
        logger.error("Erro de conexão ao criar página: %s", e)
        return {"sucesso": False, "erro": "Erro de conexão", "detalhe": str(e)}


# ============================================================
# ATUALIZAR PÁGINA
# ============================================================

def atualizar_pagina(page_id, titulo, conteudo_html, version, token):
    """Atualiza uma página existente no Confluence."""
    url = f"{CONFLUENCE_URL}/rest/api/content/{page_id}"
    payload = {
        "id": str(page_id),
        "type": "page",
        "title": titulo,
        "body": {"storage": {"value": conteudo_html, "representation": "storage"}},
        "version": {"number": int(version) + 1},
    }
    try:
        r = requests.put(url, json=payload, headers=get_headers(token), verify=False, timeout=30)
        if r.status_code in (200, 201):
            data = r.json()
            link = CONFLUENCE_URL + data.get("_links", {}).get("webui", "")
            logger.info("Página atualizada no Confluence: %s (ID %s)", titulo, page_id)
            return {"sucesso": True, "page_id": page_id, "link": link, "titulo": titulo}
        logger.error("Erro ao atualizar página: %s - %s", r.status_code, r.text[:300])
        return {"sucesso": False, "erro": f"HTTP {r.status_code}", "detalhe": r.text[:500]}
    except requests.exceptions.RequestException as e:
        logger.error("Erro de conexão ao atualizar página: %s", e)
        return {"sucesso": False, "erro": "Erro de conexão", "detalhe": str(e)}


# ============================================================
# ANEXAR IMAGEM (GRÁFICO) À PÁGINA
# ============================================================

def anexar_imagem(page_id, nome_arquivo, imagem_base64, token):
    """Anexa uma imagem PNG (base64) a uma página do Confluence via API REST."""
    # Remover prefixo de data URL, se presente (ex: "data:image/png;base64,....")
    if "," in imagem_base64 and imagem_base64.strip().startswith("data:"):
        imagem_base64 = imagem_base64.split(",", 1)[1]

    try:
        conteudo_binario = base64.b64decode(imagem_base64)
    except Exception as e:
        logger.error("Base64 inválido para %s: %s", nome_arquivo, e)
        return {"sucesso": False, "erro": "Imagem base64 inválida", "detalhe": str(e)}

    url = f"{CONFLUENCE_URL}/rest/api/content/{page_id}/child/attachment"
    headers = {
        "Authorization": f"Bearer {token}",
        # Necessário para upload de anexos (bypass da checagem XSRF do Confluence)
        "X-Atlassian-Token": "no-check",
    }
    try:
        r = requests.post(
            url,
            headers=headers,
            files={"file": (nome_arquivo, BytesIO(conteudo_binario), "image/png")},
            verify=False,
            timeout=60,
        )
        if r.status_code in (200, 201):
            logger.info("Imagem anexada à página %s: %s", page_id, nome_arquivo)
            return {"sucesso": True, "nome": nome_arquivo}
        logger.error("Erro ao anexar %s: HTTP %s - %s", nome_arquivo, r.status_code, r.text[:300])
        return {"sucesso": False, "erro": f"HTTP {r.status_code}", "detalhe": r.text[:500]}
    except requests.exceptions.RequestException as e:
        logger.error("Erro de conexão ao anexar imagem %s: %s", nome_arquivo, e)
        return {"sucesso": False, "erro": "Erro de conexão", "detalhe": str(e)}


# ============================================================
# GERAR HTML DA AUDITORIA
# ============================================================

def _esc(valor):
    """Escapa caracteres especiais (<, >, &, ", ') para o formato XHTML (storage) do Confluence.

    Sem isso, resumos/descrições com '<' ou '>' quebram o parse da página
    (erro: 'Error parsing xhtml: Unexpected character ...').
    """
    if valor is None:
        return ""
    return html.escape(str(valor), quote=True)


def gerar_html_auditoria(dados, estatisticas, total, projeto, release, jql="", graficos=None):
    """Gera o conteúdo HTML (formato storage do Confluence) com os dados da auditoria.

    'graficos' é uma lista de dicts {nome, imagem} — as imagens são anexadas à página
    e referenciadas no HTML via <ac:image><ri:attachment .../></ac:image>.
    """
    data_geracao = datetime.now().strftime("%d/%m/%Y %H:%M")

    # ---- Resumo ----
    conteudo = (
        f"<h1>{_esc(projeto)} - Service Delivery Review - {datetime.now().strftime('%d - %b-%Y')}</h1>"
        f"<p><em>Página gerada automaticamente pela Automação Jira em {data_geracao}</em></p>"
        f"<h2>📊 Resumo</h2>"
        f"<table><tbody>"
        f'<tr><th>Total de Issues</th><td style="text-align:center"><strong>{total}</strong></td></tr>'
        f"<tr><th>Projeto</th><td>{_esc(projeto)}</td></tr>"
        f"<tr><th>Release</th><td>{_esc(release if release and release != 'todas' else 'Todas')}</td></tr>"
        f"<tr><th>Data de Geração</th><td>{data_geracao}</td></tr>"
        f"</tbody></table>"
    )

    # ---- Estatísticas ----
    def tabela_stats(titulo, obj):
        if not obj:
            return f"<h3>{titulo}</h3><p>Sem dados</p>"
        linhas = ""
        for k, v in sorted(obj.items(), key=lambda x: -x[1]):
            pct = (v / total * 100) if total > 0 else 0
            linhas += f"<tr><td>{_esc(k)}</td><td style='text-align:center'>{v}</td><td style='text-align:center'>{pct:.1f}%</td></tr>"
        return f"<h3>{titulo}</h3><table><tbody><tr><th>Categoria</th><th>Qtd</th><th>%</th></tr>{linhas}</tbody></table>"

    conteudo += tabela_stats("📌 Por Status", estatisticas.get("por_status", {}))
    conteudo += tabela_stats("📌 Por Tipo", estatisticas.get("por_tipo", {}))
    conteudo += tabela_stats("📌 Por Prioridade", estatisticas.get("por_prioridade", {}))
    conteudo += tabela_stats("📌 Por Responsável", estatisticas.get("por_responsavel", {}))

    # ---- Tabela de Issues ----
    conteudo += "<h2>📋 Issues da Auditoria</h2>"
    conteudo += "<table><tbody><tr><th>Key</th><th>Resumo</th><th>Tipo</th><th>Status</th><th>Prioridade</th><th>Resolução</th><th>Responsável</th><th>Data Criação</th><th>Data Resolução</th></tr>"

    for d in dados:
        key = d.get("Key", "")
        url_issue = d.get("URL") or f"https://jira-la.secext.samsung.net/browse/{key}"
        conteudo += (
            f"<tr>"
            f'<td><a href="{_esc(url_issue)}">{_esc(key)}</a></td>'
            f"<td>{_esc(d.get('Resumo', ''))}</td>"
            f"<td>{_esc(d.get('Tipo', ''))}</td>"
            f"<td>{_esc(d.get('Status', ''))}</td>"
            f"<td>{_esc(d.get('Prioridade', ''))}</td>"
            f"<td>{_esc(d.get('Resolução', ''))}</td>"
            f"<td>{_esc(d.get('Responsável', ''))}</td>"
            f"<td>{_esc(d.get('Data Criação', ''))}</td>"
            f"<td>{_esc(d.get('Data Resolução', ''))}</td>"
            f"</tr>"
        )

    conteudo += "</tbody></table>"

    # ---- Gráficos (imagens anexadas à página) ----
    if graficos:
        conteudo += "<h2>📊 Gráficos</h2>"
        for g in graficos:
            nome = _esc(g.get("nome", "grafico.png"))
            conteudo += f'<p><ac:image><ri:attachment ri:filename="{nome}"/></ac:image></p>'

    # ---- JQL usada ----
    if jql:
        conteudo += f"<h2>🔍 JQL Utilizada</h2><ac:structured-macro ac:name='code'><ac:plain-text-body><![CDATA[{jql}]]></ac:plain-text-body></ac:structured-macro>"

    conteudo += "<hr/><p><em>Gerado por Automação Jira - Samsung</em></p>"
    return conteudo


# ============================================================
# PUBLICAR AUDITORIA (criar ou atualizar)
# ============================================================

def publicar_auditoria(dados, estatisticas, total, projeto, release, jql, token,
                       space_key=None, parent_id=None, titulo=None, graficos=None):
    """
    Publica os dados da auditoria no Confluence.
    Se já existir uma página com o mesmo título, atualiza. Caso contrário, cria nova.
    Se 'graficos' for informado (lista de {nome, imagem}), anexa as imagens à página
    após a criação/atualização.
    """
    space = space_key or CONFLUENCE_SPACE_KEY
    parent = parent_id or CONFLUENCE_PARENT_ID

    if not titulo:
        titulo = f"{projeto} - Service Delivery Review - {datetime.now().strftime('%d - %b-%Y')}"

    conteudo = gerar_html_auditoria(dados, estatisticas, total, projeto, release, jql, graficos=graficos)

    # Verificar se já existe uma página com esse título
    existente = buscar_pagina_por_titulo(space, titulo, token)

    if existente:
        resultado = atualizar_pagina(existente["id"], titulo, conteudo, existente["version"], token)
        if resultado.get("sucesso"):
            resultado["acao"] = "atualizada"
    else:
        resultado = criar_pagina(space, titulo, conteudo, parent, token)
        if resultado.get("sucesso"):
            resultado["acao"] = "criada"

    # Anexar os gráficos (imagens PNG) à página, somente após ela existir
    if resultado.get("sucesso") and graficos:
        page_id = resultado.get("page_id")
        anexos_ok = []
        anexos_erro = []
        for g in graficos:
            nome = g.get("nome") or "grafico.png"
            res = anexar_imagem(page_id, nome, g.get("imagem", ""), token)
            if res.get("sucesso"):
                anexos_ok.append(nome)
            else:
                anexos_erro.append(f"{nome}: {res.get('erro', 'erro desconhecido')}")
        resultado["anexos"] = anexos_ok
        if anexos_erro:
            resultado["anexos_erro"] = anexos_erro

    return resultado