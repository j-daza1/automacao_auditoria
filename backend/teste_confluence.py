"""
teste_confluence.py - Teste de integração com a API REST do Confluence

Cria uma página de TESTE no espaço BXBNG, verifica se foi criada e DELETA em seguida.
Nenhuma sujeira fica no Confluence após o teste.

Como rodar:
    cd backend
    set CONFLUENCE_TOKEN=seu_token_aqui
    python teste_confluence.py

    # ou passando o token direto:
    python teste_confluence.py SEU_TOKEN_AQUI
"""

import os
import sys
import requests
import urllib3

# Desabilita warning de SSL (rede interna Samsung)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ============================================================
# CONFIGURAÇÕES
# ============================================================
CONFLUENCE_URL = "https://confluence-la.secext.samsung.net"
SPACE_KEY = "BXBNG"
TITULO_TESTE = "TESTE - Automação (remover)"
CONTEUDO_TESTE = """
<p>Esta é uma página de <strong>teste</strong> da automação Jira → Confluence.</p>
<p>Ela será <strong>deletada automaticamente</strong> após a verificação.</p>
<ul>
    <li>Item de teste 1</li>
    <li>Item de teste 2</li>
</ul>
<table>
    <tr><th>Key</th><th>Status</th></tr>
    <tr><td>HD-123</td><td>Done</td></tr>
    <tr><td>HD-456</td><td>In Progress</td></tr>
</table>
"""


def get_token():
    """Pega o token do argumento ou da variável de ambiente."""
    if len(sys.argv) > 1:
        return sys.argv[1]
    return os.environ.get("CONFLUENCE_TOKEN", "")


def headers(token):
    return {
        "Accept": "application/json",
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def validar_token(token):
    """Testa se o token é válido buscando o usuário atual."""
    print("\n[1/4] Validando token...")
    url = f"{CONFLUENCE_URL}/rest/api/user/current"
    try:
        r = requests.get(url, headers=headers(token), verify=False, timeout=15)
        if r.status_code == 200:
            data = r.json()
            print(f"  ✅ Token válido! Usuário: {data.get('displayName', '?')} ({data.get('username', '?')})")
            return True
        else:
            print(f"  ❌ Token inválido. HTTP {r.status_code} - {r.text[:200]}")
            return False
    except Exception as e:
        print(f"  ❌ Erro de conexão: {e}")
        return False


def criar_pagina(token):
    """Cria uma página de teste no espaço BXBNG."""
    print("\n[2/4] Criando página de teste...")
    url = f"{CONFLUENCE_URL}/rest/api/content"
    payload = {
        "type": "page",
        "title": TITULO_TESTE,
        "space": {"key": SPACE_KEY},
        "body": {
            "storage": {
                "value": CONTEUDO_TESTE,
                "representation": "storage",
            }
        },
    }
    try:
        r = requests.post(url, json=payload, headers=headers(token), verify=False, timeout=30)
        if r.status_code in (200, 201):
            data = r.json()
            page_id = data.get("id")
            link = f"{CONFLUENCE_URL}{data.get('_links', {}).get('webui', '')}"
            print(f"  ✅ Página criada! ID: {page_id}")
            print(f"     Link: {link}")
            return page_id
        else:
            print(f"  ❌ Erro ao criar. HTTP {r.status_code} - {r.text[:300]}")
            return None
    except Exception as e:
        print(f"  ❌ Erro de conexão: {e}")
        return None


def buscar_pagina(token, page_id):
    """Busca a página criada para confirmar que existe."""
    print(f"\n[3/4] Buscando página (ID {page_id})...")
    url = f"{CONFLUENCE_URL}/rest/api/content/{page_id}?expand=space,body.storage"
    try:
        r = requests.get(url, headers=headers(token), verify=False, timeout=15)
        if r.status_code == 200:
            data = r.json()
            print(f"  ✅ Página encontrada!")
            print(f"     Título: {data.get('title')}")
            print(f"     Espaço: {data.get('space', {}).get('name')}")
            return True
        else:
            print(f"  ❌ Página não encontrada. HTTP {r.status_code}")
            return False
    except Exception as e:
        print(f"  ❌ Erro: {e}")
        return False


def deletar_pagina(token, page_id):
    """Deleta a página de teste."""
    print(f"\n[4/4] Deletando página de teste (ID {page_id})...")
    url = f"{CONFLUENCE_URL}/rest/api/content/{page_id}"
    try:
        r = requests.delete(url, headers=headers(token), verify=False, timeout=15)
        if r.status_code in (200, 204):
            print("  ✅ Página deletada com sucesso! Nenhuma sujeira deixada.")
            return True
        else:
            print(f"  ⚠️  Erro ao deletar. HTTP {r.status_code} - {r.text[:200]}")
            print("     (você pode deletar manualmente no Confluence)")
            return False
    except Exception as e:
        print(f"  ❌ Erro: {e}")
        return False


def main():
    print("=" * 60)
    print("  TESTE DE INTEGRAÇÃO CONFLUENCE")
    print(f"  URL: {CONFLUENCE_URL}")
    print(f"  Espaço: {SPACE_KEY}")
    print("=" * 60)

    token = get_token()
    if not token:
        print("\n❌ Token não fornecido!")
        print("   Uso: python teste_confluence.py SEU_TOKEN")
        print("   Ou:  set CONFLUENCE_TOKEN=seu_token && python teste_confluence.py")
        sys.exit(1)

    # 1. Validar token
    if not validar_token(token):
        print("\n🛑 Teste interrompido: token inválido.")
        sys.exit(1)

    # 2. Criar página
    page_id = criar_pagina(token)
    if not page_id:
        print("\n🛑 Teste interrompido: não foi possível criar a página.")
        sys.exit(1)

    # 3. Buscar página
    buscar_pagina(token, page_id)

    # 4. Deletar página
    deletar_pagina(token, page_id)

    print("\n" + "=" * 60)
    print("  TESTE CONCLUÍDO")
    print("=" * 60)


if __name__ == "__main__":
    main()
