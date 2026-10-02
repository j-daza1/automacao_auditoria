"""
main.py - Ponto de entrada da Automação Jira

Inicia o servidor Flask que serve a API e o front-end.
O servidor roda em http://localhost:5000

Como rodar:
    pip install -r requirements.txt
    python main.py
"""

import os
import sys

# Adicionar o diretório backend ao path para importar app.py
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from app import app

if __name__ == "__main__":
    # Carregar configurações do .env
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "backend", ".env"))

    porta = int(os.environ.get("FLASK_PORT", "5000"))

    print("\n" + "=" * 50)
    print("  Automação Jira - Servidor Flask")
    print(f"  Acesse: http://localhost:{porta}")
    print("=" * 50 + "\n")

    app.run(debug=True, host="0.0.0.0", port=porta)
