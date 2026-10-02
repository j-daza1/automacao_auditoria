"""
jira_client.py - Comunicação com a API REST do Jira Server/DC (Samsung)

Este módulo encapsula todas as chamadas à API do Jira.
O token NÃO é mais fixo no .env — cada usuário envia o próprio token
via header Authorization, que o app.py repassa para estas funções.
"""

import os
import logging
import requests
from dotenv import load_dotenv

load_dotenv()

JIRA_URL = os.environ.get("JIRA_URL", "").rstrip("/")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def get_headers(token):
    """Retorna headers com Bearer Token do usuário."""
    if not token:
        raise ValueError("Token não fornecido! Faça login com seu token do Jira.")
    return {
        "Accept": "application/json",
        "Authorization": f"Bearer {token}",
    }


# ============================================================
# BUSCAR DADOS
# ============================================================

def buscar_issues(projeto, token, max_results=50):
    """Busca issues de um projeto usando JQL."""
    url = f"{JIRA_URL}/rest/api/2/search"
    params = {
        "jql": f"project = {projeto}",
        "maxResults": max_results,
        "fields": "summary,status,assignee,priority,created,updated,issuetype",
    }
    try:
        response = requests.get(url, headers=get_headers(token), params=params, timeout=30)
        response.raise_for_status()
        issues = response.json().get("issues", [])
        logger.info("Projeto '%s': %d issues encontradas", projeto, len(issues))
        return issues
    except requests.exceptions.HTTPError as e:
        logger.error("Erro HTTP ao buscar issues: %s - %s", e.response.status_code, e.response.text)
        return {"erro": f"HTTP {e.response.status_code}", "detalhe": e.response.text}
    except requests.exceptions.RequestException as e:
        logger.error("Erro de conexão ao buscar issues: %s", e)
        return {"erro": "Erro de conexão", "detalhe": str(e)}


def obter_issue(issue_key, token):
    """Obtém detalhes de uma issue específica."""
    url = f"{JIRA_URL}/rest/api/2/issue/{issue_key}"
    try:
        response = requests.get(url, headers=get_headers(token), timeout=30)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.HTTPError as e:
        logger.error("Erro HTTP ao obter issue %s: %s - %s", issue_key, e.response.status_code, e.response.text)
        return {"erro": f"HTTP {e.response.status_code}", "detalhe": e.response.text}
    except requests.exceptions.RequestException as e:
        logger.error("Erro de conexão ao obter issue: %s", e)
        return {"erro": "Erro de conexão", "detalhe": str(e)}


def listar_projetos(token):
    """Lista todos os projetos disponíveis no Jira."""
    url = f"{JIRA_URL}/rest/api/2/project"
    try:
        response = requests.get(url, headers=get_headers(token), timeout=30)
        response.raise_for_status()
        projetos = response.json()
        logger.info("Projetos encontrados: %d", len(projetos))
        return projetos
    except requests.exceptions.HTTPError as e:
        logger.error("Erro HTTP ao listar projetos: %s - %s", e.response.status_code, e.response.text)
        return {"erro": f"HTTP {e.response.status_code}", "detalhe": e.response.text}
    except requests.exceptions.RequestException as e:
        logger.error("Erro de conexão ao listar projetos: %s", e)
        return {"erro": "Erro de conexão", "detalhe": str(e)}


# ============================================================
# CRIAR / ATUALIZAR DADOS
# ============================================================

def criar_issue(projeto, resumo, descricao, token, tipo="Task"):
    """Cria uma nova issue no Jira."""
    url = f"{JIRA_URL}/rest/api/2/issue"
    data = {
        "fields": {
            "project": {"key": projeto},
            "summary": resumo,
            "description": descricao,
            "issuetype": {"name": tipo},
        }
    }
    try:
        response = requests.post(url, json=data, headers=get_headers(token), timeout=30)
        response.raise_for_status()
        resultado = response.json()
        logger.info("Issue criada: %s", resultado.get("key"))
        return resultado
    except requests.exceptions.HTTPError as e:
        logger.error("Erro HTTP ao criar issue: %s - %s", e.response.status_code, e.response.text)
        return {"erro": f"HTTP {e.response.status_code}", "detalhe": e.response.text}
    except requests.exceptions.RequestException as e:
        logger.error("Erro de conexão ao criar issue: %s", e)
        return {"erro": "Erro de conexão", "detalhe": str(e)}


def atualizar_status(issue_key, transicao_id, token):
    """Atualiza o status de uma issue via transição."""
    url = f"{JIRA_URL}/rest/api/2/issue/{issue_key}/transitions"
    data = {"transition": {"id": transicao_id}}
    try:
        response = requests.post(url, json=data, headers=get_headers(token), timeout=30)
        response.raise_for_status()
        logger.info("Status da issue %s atualizado (transição %s)", issue_key, transicao_id)
        return True
    except requests.exceptions.HTTPError as e:
        logger.error("Erro HTTP ao atualizar status: %s - %s", e.response.status_code, e.response.text)
        return {"erro": f"HTTP {e.response.status_code}", "detalhe": e.response.text}
    except requests.exceptions.RequestException as e:
        logger.error("Erro de conexão ao atualizar status: %s", e)
        return {"erro": "Erro de conexão", "detalhe": str(e)}


def listar_transicoes(issue_key, token):
    """Lista as transições disponíveis para uma issue."""
    url = f"{JIRA_URL}/rest/api/2/issue/{issue_key}/transitions"
    try:
        response = requests.get(url, headers=get_headers(token), timeout=30)
        response.raise_for_status()
        return response.json().get("transitions", [])
    except requests.exceptions.HTTPError as e:
        logger.error("Erro HTTP ao listar transições: %s - %s", e.response.status_code, e.response.text)
        return {"erro": f"HTTP {e.response.status_code}", "detalhe": e.response.text}
    except requests.exceptions.RequestException as e:
        logger.error("Erro de conexão ao listar transições: %s", e)
        return {"erro": "Erro de conexão", "detalhe": str(e)}


def validar_token(token):
    """Valida se o token é válido tentando buscar o usuário atual."""
    url = f"{JIRA_URL}/rest/api/2/myself"
    try:
        response = requests.get(url, headers=get_headers(token), timeout=15)
        if response.status_code == 200:
            data = response.json()
            return {
                "valido": True,
                "nome": data.get("displayName", ""),
                "email": data.get("emailAddress", ""),
                "usuario": data.get("name", data.get("key", "")),
            }
        else:
            return {"valido": False, "erro": f"HTTP {response.status_code}"}
    except requests.exceptions.RequestException as e:
        return {"valido": False, "erro": str(e)}
