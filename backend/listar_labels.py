"""Lista todas as labels existentes nas issues da release r26E do BXBNG."""
import os
import requests
from dotenv import load_dotenv
from collections import Counter

load_dotenv()

JIRA_URL = os.environ.get("JIRA_URL", "").rstrip("/")
JIRA_TOKEN = os.environ.get("JIRA_TOKEN", "")

headers = {
    "Accept": "application/json",
    "Authorization": f"Bearer {JIRA_TOKEN}",
}

# Buscar todas as issues da release r26E
url = f"{JIRA_URL}/rest/api/2/search"
params = {
    "jql": 'project = BXBNG AND fixVersion = "r26E"',
    "maxResults": 200,
    "fields": "labels,summary",
}

resp = requests.get(url, headers=headers, params=params, timeout=30)
print(f"Status: {resp.status_code}")

if resp.status_code != 200:
    print(f"Erro: {resp.text}")
    exit(1)

data = resp.json()
issues = data.get("issues", [])
print(f"Total de issues: {len(issues)}")

# Coletar todas as labels
todas_labels = Counter()
issues_com_label = 0
issues_sem_label = 0

for issue in issues:
    labels = issue.get("fields", {}).get("labels", [])
    if labels:
        issues_com_label += 1
    else:
        issues_sem_label += 1
    for label in labels:
        todas_labels[label] += 1

print(f"\nIssues com label: {issues_com_label}")
print(f"Issues sem label: {issues_sem_label}")

print(f"\n{'='*60}")
print(f"  LABELS ENCONTRADAS ({len(todas_labels)} labels unicas)")
print(f"{'='*60}")

for label, count in todas_labels.most_common():
    print(f"  {label:40s} {count:4d} issues")

# Verificar especificamente SELMAO
print(f"\n{'='*60}")
print(f"  Verificando 'SELMAO':")
if "SELMAO" in todas_labels:
    print(f"  ✅ Encontrado! {todas_labels['SELMAO']} issues")
else:
    print(f"  ❌ Label 'SELMAO' NAO existe nesta release")
    # Buscar labels parecidas
    print(f"  Labels parecidas:")
    for label in todas_labels:
        if "SELM" in label.upper() or "SELMA" in label.upper():
            print(f"    → {label} ({todas_labels[label]} issues)")
