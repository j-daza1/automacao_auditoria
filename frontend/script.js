
var ultimoDadosGraficos = null;

// Variavel global para guardar os dados da ultima auditoria (para publicar no Confluence)
var ultimoDadosAuditoria = null;

// Variavel global para guardar dados do histograma (para trocar modo sem refazer busca)
var dadosHistogramaGlobal = null;
var modoGraficoAtual = "filtrado"; // "filtrado" (todos os dias) ou "actionable" (só dias úteis)

function toggleDarkMode() {
    document.body.classList.toggle("dark-mode");
    const isDark = document.body.classList.contains("dark-mode");
    const btn = document.getElementById("btn-dark-mode");
    if (isDark) {
        btn.innerHTML = "☀️ Modo Claro";
        localStorage.setItem("dark_mode", "true");
    } else {
        btn.innerHTML = "🌙 Modo Noturno";
        localStorage.setItem("dark_mode", "false");
    }

    // Se houver graficos renderizados, recria-los com as novas cores
    if (ultimoDadosGraficos) {
        for (var id in chartInstances) {
            if (chartInstances[id]) {
                chartInstances[id].destroy();
            }
        }
        const paleta = [
            "#4361ee", "#f72585", "#06d6a0", "#ff9f1c", "#7209b7",
            "#3a86ff", "#ffbe0b", "#fb5607", "#8338ec", "#06ffa5",
            "#ff006e", "#3a0ca3", "#4cc9f0", "#f15bb5", "#00bbf9",
            "#fee440", "#9b5de5", "#00f5d4", "#ff5e5b", "#1b9aaa",
        ];
        criarGraficoPizza("chart-status", ultimoDadosGraficos.stats.por_status, paleta, ultimoDadosGraficos.total);
        criarGraficoPizza("chart-tipo", ultimoDadosGraficos.stats.por_tipo, paleta, ultimoDadosGraficos.total);
        criarGraficoPizza("chart-prioridade", ultimoDadosGraficos.stats.por_prioridade, paleta, ultimoDadosGraficos.total);
        criarGraficoPizza("chart-responsavel", ultimoDadosGraficos.stats.por_responsavel, paleta, ultimoDadosGraficos.total);
    }
}

// Restaurar modo noturno ao carregar a página
function restaurarDarkMode() {
    if (localStorage.getItem("dark_mode") === "true") {
        document.body.classList.add("dark-mode");
        const btn = document.getElementById("btn-dark-mode");
        if (btn) btn.innerHTML = "☀️ Modo Claro";
    }
}


// ============================================================
// AUTENTICAÇÃO
// ============================================================

function getToken() {
    return localStorage.getItem("jira_token") || "";
}

function setToken(token) {
    localStorage.setItem("jira_token", token);
}

function getUsuario() {
    return localStorage.getItem("jira_usuario") || "";
}

function setUsuario(nome) {
    localStorage.setItem("jira_usuario", nome);
}

async function fazerLogin() {
    const token = document.getElementById("input-token").value.trim();
    if (!token) {
        mostrarStatus("status-login", "Digite seu token", "error");
        return;
    }

    mostrarStatus("status-login", "Validando token...", "loading");

    try {
        const resp = await fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: token }),
        });
        const data = await resp.json();

        if (data.valido) {
            setToken(token);
            setUsuario(data.nome || data.usuario || "Usuário");
            mostrarApp(data.nome || data.usuario);
        } else {
            mostrarStatus("status-login", "Token inválido. Verifique se o token está correto.", "error");
        }
    } catch (e) {
        mostrarStatus("status-login", "Erro de conexão: " + e.message, "error");
    }
}

function fazerLogout() {
    // NÃO apaga o token do localStorage — só esconde o app
    // Assim, ao reabrir a página, o auto-login funciona
    document.getElementById("app-principal").style.display = "none";
    document.getElementById("tela-login").style.display = "flex";
    // Pré-preenche o campo com o token salvo (se existir)
    const token = getToken();
    if (token) {
        document.getElementById("input-token").value = token;
        // Mostra o botão "Esquecer Token" pois há um token salvo
        document.getElementById("btn-esquecer").style.display = "block";
    }
    limparStatus("status-login");
}

function esquecerToken() {
    // Esta função SIM apaga o token (botão "Esquecer token")
    localStorage.removeItem("jira_token");
    localStorage.removeItem("jira_usuario");
    document.getElementById("input-token").value = "";
    fazerLogout();
}

function mostrarApp(nomeUsuario) {
    document.getElementById("tela-login").style.display = "none";
    document.getElementById("app-principal").style.display = "block";
    document.getElementById("info-usuario").textContent = "👤 " + (nomeUsuario || "Usuário");
    // Carregar projetos do Jira automaticamente no dropdown da auditoria
    carregarProjetosAuditoria();

    // Pré-preencher filtros padrão (mesmos do botão "Filtro Mensal"):
    // - Excluir Canceled e Duplicate
    // - Excluir componente PDI
    // - Excluir label no_metrics
    // - Período: maio de 2026
    document.getElementById("filtro-resolucao-excluir").value = "Canceled,Duplicate";
    document.getElementById("filtro-componente-excluir").value = "PDI";
    document.getElementById("filtro-labels-excluir").value = "no_metrics";
    document.getElementById("filtro-res-data-inicio").value = "2026-05-01";
    document.getElementById("filtro-res-data-fim").value = "2026-05-31";
    document.getElementById("filtro-order-by").value = "issuetype";
    // Selecionar SIDI-M como projeto padrão
    const selectProjeto = document.getElementById("aud-projeto");
    for (let i = 0; i < selectProjeto.options.length; i++) {
        if (selectProjeto.options[i].value === "SIDI-M") {
            selectProjeto.selectedIndex = i;
            break;
        }
    }
}

// Verificar se já está logado ao carregar a página
window.onload = function() {
    // Restaurar modo noturno se estava ativado
    restaurarDarkMode();

    const token = getToken();
    if (token) {
        // Pré-preencher o campo de token caso o auto-login falhe
        document.getElementById("input-token").value = token;

        // Mostrar "Validando..." na tela de login enquanto verifica
        mostrarStatus("status-login", "Validando login automático...", "loading");

        // Tentar validar o token salvo
        fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: token }),
        })
        .then(r => r.json())
        .then(data => {
            if (data.valido) {
                limparStatus("status-login");
                mostrarApp(data.nome || data.usuario);
            } else {
                limparStatus("status-login");
                // Token expirou, mas não apaga — deixa pré-preenchido
                // para a pessoa só clicar em Entrar de novo
            }
        })
        .catch(() => {
            limparStatus("status-login");
            // Se erro de conexão, mostra o login com o token pré-preenchido
        });
    }
};

// ============================================================
// FETCH COM TOKEN (todas as requisições usam esta)
// ============================================================

async function fetchComToken(url, options = {}) {
    const token = getToken();
    if (!token) {
        fazerLogout();
        return null;
    }

    const headers = {
        ...options.headers,
        "X-Jira-Token": token,
    };

    const resp = await fetch(url, { ...options, headers });

    // Se 401, token expirou — fazer logout
    if (resp.status === 401) {
        alert("Sua sessão expirou. Faça login novamente.");
        fazerLogout();
        return null;
    }

    return resp;
}

// ============================================================
// UTILITÁRIOS
// ============================================================

function mostrarStatus(elementId, mensagem, tipo) {
    const el = document.getElementById(elementId);
    if (!el) return;
    // Mensagens com HTML (ex.: link para a página do Confluence) são renderizadas;
    // as demais são exibidas como texto puro (evita injeção de HTML acidental)
    if (/<[a-z][^>]*>/i.test(mensagem)) {
        el.innerHTML = mensagem;
    } else {
        el.textContent = mensagem;
    }
    el.className = "status-msg show " + tipo;
}

function limparStatus(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = "";
    el.className = "status-msg";
}

function badgeStatus(statusName) {
    if (!statusName) return '<span class="badge badge-default">N/A</span>';
    const s = statusName.toLowerCase();
    if (s.includes("to do") || s.includes("aberto") || s.includes("open")) {
        return '<span class="badge badge-todo">' + statusName + '</span>';
    }
    if (s.includes("progress") || s.includes("andamento")) {
        return '<span class="badge badge-progress">' + statusName + '</span>';
    }
    if (s.includes("done") || s.includes("fechado") || s.includes("closed") || s.includes("resolvido")) {
        return '<span class="badge badge-done">' + statusName + '</span>';
    }
    return '<span class="badge badge-default">' + statusName + '</span>';
}

function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================
// BUSCAR DATASETS (procurar "Home Devices")
// ============================================================

async function buscarDataSets() {
    const area = document.getElementById("area-estatisticas");
    area.innerHTML = '<div style="text-align:center; padding:40px;"><div style="display:inline-block; width:40px; height:40px; border:4px solid #e3e8ef; border-top:4px solid #006d77; border-radius:50%; animation:spin 1s linear infinite;"></div><p style="margin-top:15px; color:#006d77;">Procurando boards e filtros...</p></div>';

    const resp = await fetchComToken("/api/buscar-datasets");
    if (!resp) return;
    const data = await resp.json();

    if (data.erro) {
        area.innerHTML = '<p style="color:#e74c3c;">Erro: ' + escapeHtml(data.erro) + '</p>';
        return;
    }

    let html = '<h3 style="margin-bottom:15px;">🔍 Busca por "Home Devices"</h3>';

    // Boards
    html += '<div class="throughput-card" style="margin-bottom:20px; border-radius:10px; padding:20px;">';
    html += '<h4 style="color:#006d77; margin:0 0 10px 0;">📋 Boards (' + (data.boards ? data.boards.length : 0) + ')</h4>';
    if (data.boards && data.boards.length > 0) {
        html += '<table class="tabela"><thead><tr><th>Nome</th><th>ID</th><th>Tipo</th><th>Local</th></tr></thead><tbody>';
        data.boards.forEach(b => {
            const isHome = b.name.toLowerCase().includes("home") || b.name.toLowerCase().includes("device");
            html += '<tr style="' + (isHome ? 'background:#fff3cd;' : '') + '"><td>' + escapeHtml(b.name) + (isHome ? ' ⬅️' : '') + '</td><td>' + b.id + '</td><td>' + escapeHtml(b.type) + '</td><td>' + escapeHtml(b.location) + '</td></tr>';
        });
        html += '</tbody></table>';
    } else {
        html += '<p style="color:#999;">Nenhum board encontrado.</p>';
    }
    html += '</div>';

    // Filtros
    html += '<div class="throughput-card" style="margin-bottom:20px; border-radius:10px; padding:20px;">';
    html += '<h4 style="color:#006d77; margin:0 0 10px 0;">🔎 Filtros (' + (data.filtros ? data.filtros.length : 0) + ')</h4>';
    if (data.filtros && data.filtros.length > 0) {
        html += '<table class="tabela"><thead><tr><th>Nome</th><th>ID</th><th>JQL</th></tr></thead><tbody>';
        data.filtros.forEach(f => {
            const isHome = f.name.toLowerCase().includes("home") || f.name.toLowerCase().includes("device") || f.name.toLowerCase().includes("data set");
            html += '<tr style="' + (isHome ? 'background:#fff3cd;' : '') + '"><td>' + escapeHtml(f.name) + (isHome ? ' ⬅️' : '') + '</td><td>' + escapeHtml(f.id || '') + '</td><td style="font-family:monospace; font-size:0.85em;">' + escapeHtml(f.jql || '') + '</td></tr>';
        });
        html += '</tbody></table>';
    } else {
        html += '<p style="color:#999;">Nenhum filtro encontrado.</p>';
    }
    html += '</div>';

    // Erros
    if (data.erro_boards) {
        html += '<p style="color:#e74c3c; font-size:0.85em;">Erro boards: ' + escapeHtml(data.erro_boards) + '</p>';
    }
    if (data.erro_filtros) {
        html += '<p style="color:#e74c3c; font-size:0.85em;">Erro filtros: ' + escapeHtml(data.erro_filtros) + '</p>';
    }

    area.innerHTML = html;
    document.getElementById("area-dados-auditoria").innerHTML = "";
    document.getElementById("area-download").innerHTML = "";
}

// ============================================================
// CARREGAR PROJETOS
// ============================================================

async function carregarProjetos() {
    const container = document.getElementById("lista-projetos");
    container.innerHTML = '<p style="color:#888;">Carregando projetos...</p>';

    const resp = await fetchComToken("/api/projetos");
    if (!resp) return;
    const data = await resp.json();

    if (data.erro) {
        container.innerHTML = '<p style="color:#e74c3c;">Erro: ' + escapeHtml(data.erro) + '</p>';
        return;
    }

    if (!Array.isArray(data) || data.length === 0) {
        container.innerHTML = '<p style="color:#888;">Nenhum projeto encontrado.</p>';
        return;
    }

    container.innerHTML = "";
    data.forEach(proj => {
        const card = document.createElement("div");
        card.className = "projeto-card";
        card.innerHTML = '<div class="key">' + escapeHtml(proj.key) + '</div><div class="name">' + escapeHtml(proj.name) + '</div>';
        card.onclick = () => {
            document.getElementById("input-projeto").value = proj.key;
            carregarIssues();
        };
        container.appendChild(card);
    });
}

// ============================================================
// CARREGAR ISSUES
// ============================================================

async function carregarIssues() {
    const projeto = document.getElementById("input-projeto").value.trim().toUpperCase();
    const tbody = document.getElementById("corpo-tabela");

    if (!projeto) {
        mostrarStatus("status-issues", "Digite a key de um projeto", "error");
        return;
    }

    mostrarStatus("status-issues", "Buscando issues...", "loading");
    tbody.innerHTML = "";

    const resp = await fetchComToken("/api/issues/" + encodeURIComponent(projeto));
    if (!resp) return;
    const data = await resp.json();

    if (data.erro) {
        mostrarStatus("status-issues", "Erro: " + data.erro, "error");
        return;
    }

    if (!Array.isArray(data) || data.length === 0) {
        mostrarStatus("status-issues", "Nenhuma issue encontrada.", "error");
        return;
    }

    limparStatus("status-issues");

    data.forEach(issue => {
        const f = issue.fields || {};
        const tr = document.createElement("tr");
        tr.innerHTML = '<td><strong>' + escapeHtml(issue.key) + '</strong></td><td>' + escapeHtml(f.summary) + '</td><td>' + escapeHtml(f.issuetype ? f.issuetype.name : "") + '</td><td>' + badgeStatus(f.status ? f.status.name : "") + '</td><td>' + escapeHtml(f.priority ? f.priority.name : "") + '</td><td>' + escapeHtml(f.assignee ? f.assignee.displayName : "N/A") + '</td><td><button class="btn btn-primary btn-sm" onclick="verDetalhes(\'' + issue.key + '\')">Ver</button></td>';
        tbody.appendChild(tr);
    });
}

// ============================================================
// VER DETALHES (MODAL)
// ============================================================

async function verDetalhes(issueKey) {
    const modal = document.getElementById("modal");
    const titulo = document.getElementById("modal-titulo");
    const corpo = document.getElementById("modal-corpo");

    titulo.textContent = "Carregando " + issueKey + "...";
    corpo.innerHTML = '<p style="color:#888;">Aguarde...</p>';
    modal.style.display = "flex";

    const resp = await fetchComToken("/api/issue/" + encodeURIComponent(issueKey));
    if (!resp) return;
    const issue = await resp.json();

    if (issue.erro) {
        titulo.textContent = "Erro";
        corpo.innerHTML = '<p style="color:#e74c3c;">' + escapeHtml(issue.erro) + '</p>';
        return;
    }

    const f = issue.fields || {};
    titulo.textContent = issue.key + " - " + (f.summary || "");
    corpo.innerHTML = '<div class="detalhe-linha"><div class="detalhe-label">Tipo:</div><div class="detalhe-valor">' + escapeHtml(f.issuetype ? f.issuetype.name : "N/A") + '</div></div><div class="detalhe-linha"><div class="detalhe-label">Status:</div><div class="detalhe-valor">' + badgeStatus(f.status ? f.status.name : "") + '</div></div><div class="detalhe-linha"><div class="detalhe-label">Prioridade:</div><div class="detalhe-valor">' + escapeHtml(f.priority ? f.priority.name : "N/A") + '</div></div><div class="detalhe-linha"><div class="detalhe-label">Responsável:</div><div class="detalhe-valor">' + escapeHtml(f.assignee ? f.assignee.displayName : "Não atribuído") + '</div></div><div class="detalhe-linha"><div class="detalhe-label">Criado em:</div><div class="detalhe-valor">' + escapeHtml(f.created || "N/A") + '</div></div><div class="detalhe-linha"><div class="detalhe-label">Atualizado:</div><div class="detalhe-valor">' + escapeHtml(f.updated || "N/A") + '</div></div><div class="detalhe-linha"><div class="detalhe-label">Descrição:</div><div class="detalhe-valor" style="white-space:pre-wrap;">' + escapeHtml(f.description || "Sem descrição") + '</div></div><div style="margin-top:20px;"><button class="btn btn-primary btn-sm" onclick="carregarTransicoes(\'' + issue.key + '\')">Mudar Status</button></div><div id="area-transicoes" style="margin-top:15px;"></div>';
}

// ============================================================
// TRANSIÇÕES
// ============================================================

async function carregarTransicoes(issueKey) {
    const area = document.getElementById("area-transicoes");
    area.innerHTML = '<p style="color:#888;">Carregando...</p>';

    const resp = await fetchComToken("/api/issue/" + encodeURIComponent(issueKey) + "/transicoes");
    if (!resp) return;
    const data = await resp.json();

    if (data.erro) {
        area.innerHTML = '<p style="color:#e74c3c;">Erro: ' + escapeHtml(data.erro) + '</p>';
        return;
    }

    if (!Array.isArray(data) || data.length === 0) {
        area.innerHTML = '<p style="color:#888;">Nenhuma transição disponível.</p>';
        return;
    }

    let html = '<select id="select-transicao" class="input-text" style="width:auto;display:inline-block;">';
    data.forEach(t => { html += '<option value="' + t.id + '">' + escapeHtml(t.name) + '</option>'; });
    html += '</select> <button class="btn btn-success btn-sm" onclick="aplicarTransicao(\'' + issueKey + '\')">Aplicar</button>';
    area.innerHTML = html;
}

async function aplicarTransicao(issueKey) {
    const select = document.getElementById("select-transicao");
    if (!select) return;
    const transicaoId = select.value;

    const resp = await fetchComToken("/api/issue/" + encodeURIComponent(issueKey) + "/status", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transicao_id: transicaoId }),
    });
    if (!resp) return;
    const data = await resp.json();

    if (data.erro) {
        alert("Erro: " + data.erro);
    } else {
        alert("Status atualizado!");
        fecharModal();
        const projeto = document.getElementById("input-projeto").value.trim();
        if (projeto) carregarIssues();
    }
}

// ============================================================
// CRIAR ISSUE
// ============================================================

async function criarIssue(event) {
    event.preventDefault();
    const projeto = document.getElementById("criar-projeto").value.trim().toUpperCase();
    const resumo = document.getElementById("criar-resumo").value.trim();
    const descricao = document.getElementById("criar-descricao").value.trim();
    const tipo = document.getElementById("criar-tipo").value;

    mostrarStatus("status-criar", "Criando issue...", "loading");

    const resp = await fetchComToken("/api/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projeto, resumo, descricao, tipo }),
    });
    if (!resp) return;
    const data = await resp.json();

    if (data.erro) {
        mostrarStatus("status-criar", "Erro: " + data.erro, "error");
    } else {
        mostrarStatus("status-criar", "Issue criada! Key: " + (data.key || ""), "success");
        document.getElementById("form-criar").reset();
    }
}

// ============================================================
// AUDITORIA
// ============================================================

async function executarAuditoria() {
    const projeto = document.getElementById("aud-projeto").value.trim().toUpperCase();
    const release = document.getElementById("aud-release").value.trim();

    if (!projeto) {
        mostrarStatus("status-auditoria", "Preencha o projeto", "error");
        return;
    }

    // Se release estiver vazia, usar "todas" como valor especial para a URL
    // O back-end entende "todas" como sem filtro de release
    const releaseParam = release || "todas";

    const labels = document.getElementById("filtro-labels").value.trim();
    const issuetype = document.getElementById("filtro-issuetype").value;
    const priority = document.getElementById("filtro-priority").value;
    const assignee = document.getElementById("filtro-assignee").value.trim();
    const status = document.getElementById("filtro-status").value;
    const params = new URLSearchParams();
    if (labels) params.append("labels", labels);
    if (issuetype) params.append("issuetype", issuetype);
    if (priority) params.append("priority", priority);
    if (assignee) params.append("assignee", assignee);
    if (status) params.append("status", status);

    // Novos filtros
    const resolucaoExcluir = document.getElementById("filtro-resolucao-excluir").value;
    if (resolucaoExcluir) params.append("resolucao_excluir", resolucaoExcluir);

    const componenteExcluir = document.getElementById("filtro-componente-excluir").value.trim();
    if (componenteExcluir) params.append("componente_excluir", componenteExcluir);

    const labelsExcluir = document.getElementById("filtro-labels-excluir").value.trim();
    if (labelsExcluir) params.append("labels_excluir", labelsExcluir);

    const resDataInicio = document.getElementById("filtro-res-data-inicio").value;
    if (resDataInicio) params.append("res_data_inicio", resDataInicio);

    const resDataFim = document.getElementById("filtro-res-data-fim").value;
    if (resDataFim) params.append("res_data_fim", resDataFim);

    const orderBy = document.getElementById("filtro-order-by").value;
    if (orderBy) params.append("order_by", orderBy);

    const queryString = params.toString();
    const url = "/api/auditoria/" + encodeURIComponent(projeto) + "/" + encodeURIComponent(releaseParam) + (queryString ? "?" + queryString : "");

    mostrarStatus("status-auditoria", "⏳ Coletando dados... Isso pode levar alguns segundos.", "loading");
    document.getElementById("area-estatisticas").innerHTML = '<div style="text-align:center; padding:40px;"><div style="display:inline-block; width:40px; height:40px; border:4px solid #e3e8ef; border-top:4px solid #006d77; border-radius:50%; animation:spin 1s linear infinite;"></div><p style="margin-top:15px; color:#006d77;">Buscando issues no Jira...</p></div><style>@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}</style>';
    document.getElementById("area-dados-auditoria").innerHTML = "";
    document.getElementById("area-download").innerHTML = "";

    const resp = await fetchComToken(url);
    if (!resp) return;
    const data = await resp.json();

    if (data.erro) {
        mostrarStatus("status-auditoria", "Erro: " + data.erro + " - " + (data.detalhe || ""), "error");
        return;
    }

    limparStatus("status-auditoria");

    // Guardar dados da auditoria para publicar no Confluence depois
    ultimoDadosAuditoria = data;

    const stats = data.estatisticas;

    // HTML com os cards e canvas para os graficos de pizza
    let htmlStats = '<h3 style="margin-bottom:15px;">Estatisticas</h3>';
    htmlStats += '<div class="stat-grid"><div class="stat-card"><div class="stat-number">' + data.total + '</div><div class="stat-label">Total de Issues</div></div></div>';

    // Grid com 4 graficos de pizza (2x2) - com botao abrir/fechar
    htmlStats += '<div style="margin: 20px 0;">';
    htmlStats += '<div onclick="toggleGraficos()" style="cursor:pointer; display:flex; align-items:center; justify-content:space-between; background:linear-gradient(135deg,#1b4965,#006d77); color:#fff; padding:14px 20px; border-radius:10px; margin-bottom:0; user-select:none;">';
    htmlStats += '<span style="font-size:1.1em; font-weight:700;">📊 Gráficos de Pizza</span>';
    htmlStats += '<span id="icone-graficos" style="font-size:1.3em; transition:transform 0.3s;">▼</span>';
    htmlStats += '</div>';
    htmlStats += '<div id="container-graficos" style="overflow:hidden; transition:max-height 0.4s ease; max-height:2000px;">';
    htmlStats += '<div class="charts-grid" style="margin-top:15px;">';
    htmlStats += '<div class="chart-card"><h4>Por Status</h4><canvas id="chart-status"></canvas></div>';
    htmlStats += '<div class="chart-card"><h4>Por Tipo</h4><canvas id="chart-tipo"></canvas></div>';
    htmlStats += '<div class="chart-card"><h4>Por Prioridade</h4><canvas id="chart-prioridade"></canvas></div>';
    htmlStats += '<div class="chart-card"><h4>Por Responsavel</h4><canvas id="chart-responsavel"></canvas></div>';
    htmlStats += '</div>';
    htmlStats += '</div>';
    htmlStats += '</div>';

    document.getElementById("area-estatisticas").innerHTML = htmlStats;

    // Criar os graficos de pizza com Chart.js
    // Paleta de cores moderna e harmoniosa (20 cores)
    const paletaCores = [
        "#4361ee", // Azul vibrante
        "#f72585", // Rosa magenta
        "#06d6a0", // Verde menta
        "#ff9f1c", // Laranja suave
        "#7209b7", // Roxo intenso
        "#3a86ff", // Azul céu
        "#ffbe0b", // Amarelo dourado
        "#fb5607", // Laranja avermelhado
        "#8338ec", // Roxo vibrante
        "#06ffa5", // Verde neon
        "#ff006e", // Rosa choque
        "#3a0ca3", // Azul marinho
        "#4cc9f0", // Azul claro
        "#f15bb5", // Rosa claro
        "#00bbf9", // Azul turquesa
        "#fee440", // Amarelo limão
        "#9b5de5", // Lilás
        "#00f5d4", // Verde água
        "#ff5e5b", // Vermelho coral
        "#1b9aaa", // Verde azulado
    ];

    // Salvar dados dos graficos para recriar ao trocar modo noturno
    ultimoDadosGraficos = { stats: stats, total: data.total };

    // Grafico: Por Status
    criarGraficoPizza("chart-status", stats.por_status, paletaCores, data.total);

    // Grafico: Por Tipo
    criarGraficoPizza("chart-tipo", stats.por_tipo, paletaCores, data.total);

    // Grafico: Por Prioridade
    criarGraficoPizza("chart-prioridade", stats.por_prioridade, paletaCores, data.total);

    // Grafico: Por Responsavel
    criarGraficoPizza("chart-responsavel", stats.por_responsavel, paletaCores, data.total);

    let htmlTabela = '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; flex-wrap:wrap; gap:10px;"><h3 style="margin:0;">Dados Coletados (' + data.total + ' issues)</h3><div style="display:flex; gap:8px;"><button onclick="baixarExcel()" class="btn btn-success btn-sm"><span style="margin-right:5px;">⬇</span> Baixar Excel</button></div></div><div style="overflow-x:auto;"><table class="tabela"><thead><tr><th>Key</th><th>Resumo</th><th>Descrição</th><th>Tipo</th><th>Status</th><th>Prioridade</th><th>Responsável</th><th>Resolução</th><th>Data Criação</th><th>Data Resolução</th></tr></thead><tbody id="tbody-issues"></tbody></table></div><div id="paginacao-issues"></div>';
    // Botão destacado: Publicar no Confluence (no final, bem visível)
    htmlTabela += '<div style="margin-top:25px; padding:22px; text-align:center; background:linear-gradient(135deg,#e8f4f8,#f0fafc); border:2px dashed #006d77; border-radius:12px;">';
    htmlTabela += '<button onclick="abrirModalConfluence()" class="btn btn-primary" style="padding:14px 36px; font-size:1.05em; font-weight:700; background:linear-gradient(135deg,#1b4965,#006d77); border:none; border-radius:10px; color:#fff; cursor:pointer; box-shadow:0 4px 12px rgba(0,109,119,0.35);">📄 Publicar Auditoria no Confluence</button>';
    htmlTabela += '<p style="margin:10px 0 0 0; font-size:0.85em; color:#567;">Publica esta auditoria como página no Confluence (espaço BXBNG)</p>';
    htmlTabela += '</div>';
    // ===== TABELA DE GENERAL THROUGHPUT =====
    // Pegar datas do filtro para calcular o periodo
    const dataResInicio = document.getElementById("filtro-res-data-inicio").value;
    const dataResFim = document.getElementById("filtro-res-data-fim").value;

    // Funcao para calcular dias uteis entre duas datas (excluindo fins de semana e feriados nacionais)
    function calcularDiasUteis(dataInicioStr, dataFimStr) {
        if (!dataInicioStr || !dataFimStr) return 0;
        const inicio = new Date(dataInicioStr + "T00:00:00");
        const fim = new Date(dataFimStr + "T00:00:00");
        let diasUteis = 0;
        let atual = new Date(inicio);

        // Lista de feriados nacionais brasileiros (formato MM-DD)
        // Feriados fixos: Confraternizacao (01/01), Tiradentes (04/21), Trabalho (05/01), Independencia (09/07), Nossa Senhora (10/12), Finados (11/02), Proclamacao (11/15), Natal (12/25)
        const feriadosFixos = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "12-25"];

        // Feriados moveis por ano (calculados manualmente para 2024-2027)
        // Carnaval, Sexta-feira Santa, Corpus Christi
        const feriadosMoveis = {
            "2024": ["02-12", "02-13", "03-29", "05-30"],  // Carnaval, Cinzas, Sexta Santa, Corpus Christi
            "2025": ["03-03", "03-04", "04-18", "06-19"],
            "2026": ["02-16", "02-17", "04-03", "06-04"],
            "2027": ["02-08", "02-09", "03-26", "05-27"],
        };

        while (atual <= fim) {
            const diaSemana = atual.getDay();
            const ano = atual.getFullYear();
            const mesDia = (atual.getMonth() + 1).toString().padStart(2, "0") + "-" + atual.getDate().toString().padStart(2, "0");

            // Verificar se e feriado fixo
            const ehFeriadoFixo = feriadosFixos.includes(mesDia);

            // Verificar se e feriado movel
            const feriadosAno = feriadosMoveis[ano.toString()] || [];
            const ehFeriadoMovel = feriadosAno.includes(mesDia);

        // Contar como dia util se nao for fim de semana e nao for feriado
            if (diaSemana !== 0 && diaSemana !== 6 && !ehFeriadoFixo && !ehFeriadoMovel) {
                diasUteis++;
            }
            atual.setDate(atual.getDate() + 1);
        }
        return diasUteis;
    }

    // Funcao para formatar label do mes
    function formatarMes(dataStr) {
        if (!dataStr) return "-";
        const d = new Date(dataStr + "T00:00:00");
        const nomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
        return nomes[d.getMonth()] + "/" + d.getFullYear();
    }

    // Calcular mes anterior (para o "last period")
    function calcularMesAnterior(dataInicioStr) {
        if (!dataInicioStr) return null;
        const d = new Date(dataInicioStr + "T00:00:00");
        d.setMonth(d.getMonth() - 1);
        const ano = d.getFullYear();
        const mes = d.getMonth();
        const inicio = new Date(ano, mes, 1);
        const fim = new Date(ano, mes + 1, 0);
        return {
            inicio: inicio.toISOString().split("T")[0],
            fim: fim.toISOString().split("T")[0]
        };
    }

    // Calcular dias úteis para o mês atual (todos os dias úteis do calendário)
    const diasUteisAtual = calcularDiasUteis(dataResInicio, dataResFim);
    const throughputAtual = diasUteisAtual > 0 ? (data.total / diasUteisAtual).toFixed(2).replace(".", ",") : "0";
    const labelMesAtual = formatarMes(dataResInicio);

    // Calcular mes anterior
    const mesAnt = calcularMesAnterior(dataResInicio);
    const labelMesAnt = formatarMes(mesAnt ? mesAnt.inicio : null);

    // Comentario baseado no throughput
    let comentario = "";
    const tpNum = parseFloat(throughputAtual.replace(",", "."));
    if (tpNum >= 10) {
        comentario = "Excelente! " + tpNum + " issues/dia util";
    } else if (tpNum >= 5) {
        comentario = "Bom! " + tpNum + " issues/dia util";
    } else if (tpNum >= 2) {
        comentario = "Regular. " + tpNum + " issues/dia util";
    } else {
        comentario = "Baixo. " + tpNum + " issues/dia util";
    }

    // ===== TABELA SUB-TASK x STORY BUG (throughput/dia util por tipo) =====
    // Buscar de forma case-insensitive (Jira pode retornar "Sub-Task" ou "Sub-task")
    let qtdSubTask = 0;
    let qtdStoryBug = 0;
    for (const [tipo, qtd] of Object.entries(stats.por_tipo)) {
        const tipoLower = tipo.toLowerCase().replace(/\s+/g, "");
        if (tipoLower === "sub-task" || tipoLower === "subtask") {
            qtdSubTask = qtd;
        }
        if (tipoLower === "storybug") {
            qtdStoryBug = qtd;
        }
    }
    console.log("Tipos encontrados:", stats.por_tipo);
    console.log("Sub-task:", qtdSubTask, "Story Bug:", qtdStoryBug);
    // ===== CALCULAR LEAD TIME 70% =====
    // Lead Time = Data Resolução - Data Criação (em dias)
    // 70% = ordenar lead times e pegar média dos 70% centrais (excluir 15% menores e 15% maiores)
    function calcularLeadTime70(dados, tipoFiltro) {
        const leadTimes = [];
        dados.forEach(d => {
            const tipoLower = (d.Tipo || "").toLowerCase().replace(/\s+/g, "");
            const tipoMatch = tipoFiltro === "subtask" 
                ? (tipoLower === "sub-task" || tipoLower === "subtask")
                : (tipoLower === "storybug");
            if (!tipoMatch) return;
            
            const dataCriacao = d["Data Criação"];
            const dataResolucao = d["Data Resolução"];
            if (!dataCriacao || !dataResolucao) return;
            
            const criacao = new Date(dataCriacao);
            const resolucao = new Date(dataResolucao);
            // Calcular dias corridos (calendar days)
            const diffMs = resolucao - criacao;
            const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));
            if (diffDias >= 0) {
                leadTimes.push(diffDias);
            }
        });
        
        if (leadTimes.length === 0) return "-";
        
        // Ordenar lead times (do menor para o maior)
        leadTimes.sort((a, b) => a - b);
        
        // Average Lead Time 70%: média dos 70% mais rápidos (excluir os 30% mais lentos)
        const total = leadTimes.length;
        const fimIdx = Math.ceil(total * 0.70);
        const leadTimes70 = leadTimes.slice(0, fimIdx);
        
        if (leadTimes70.length === 0) return "-";
        
        // Média dos 70% mais rápidos
        const soma = leadTimes70.reduce((a, b) => a + b, 0);
        const media = soma / leadTimes70.length;
        return Math.round(media).toString();
    }
    
    const leadTimeSubTaskAtual = calcularLeadTime70(data.dados, "subtask");
    const leadTimeStoryBugAtual = calcularLeadTime70(data.dados, "storybug");

    const tpSubTask = diasUteisAtual > 0 ? (qtdSubTask / diasUteisAtual).toFixed(2).replace(".", ",") : "0";
    const tpStoryBug = diasUteisAtual > 0 ? (qtdStoryBug / diasUteisAtual).toFixed(2).replace(".", ",") : "0";

    let htmlThroughput = '<div class="throughput-card" style="margin-top:25px; border-radius:10px; padding:20px;">';
    htmlThroughput += '<h3 style="margin:0 0 15px 0; color:#006d77;">📊 General Throughput</h3>';
    htmlThroughput += '<table class="tabela"><thead><tr style="background:#006d77;color:#fff;">';
    htmlThroughput += '<th>Month</th><th>Throughput</th><th>Comments</th>';
    htmlThroughput += '</tr></thead><tbody>';
    htmlThroughput += '<tr><td style="font-weight:bold;">' + labelMesAtual + ' (current)</td><td style="text-align:center;font-weight:bold;font-size:1.2em;color:#006d77;">' + throughputAtual + '</td><td>' + comentario + ' (' + data.total + ' issues em ' + diasUteisAtual + ' dias uteis)</td></tr>';
    htmlThroughput += '<tr style="background:#f8fbfd;"><td style="font-weight:bold;">' + labelMesAnt + ' (last period)</td><td style="text-align:center;color:#999;">-</td><td style="color:#999;">Faca uma nova busca com o periodo anterior para comparar</td></tr>';
    htmlThroughput += '</tbody></table>';
    htmlThroughput += '</div>';

    // ===== TABELA THROUGHPUT POR TIPO (Sub-task x Story Bug) =====
    let htmlSubTaskStory = '<div class="throughput-card" style="margin-top:20px; border-radius:10px; padding:20px;">';
    htmlSubTaskStory += '<h3 style="margin:0 0 15px 0; color:#006d77;">📋 Throughput por Tipo (Sub-task x Story Bug)</h3>';
    htmlSubTaskStory += '<table class="tabela"><thead><tr style="background:#006d77;color:#fff;">';
    htmlSubTaskStory += '<th>Month</th><th>Sub-task</th><th>Story Bug</th><th>Dias Úteis</th><th>Total Issues</th>';
    htmlSubTaskStory += '</tr></thead><tbody>';
    htmlSubTaskStory += '<tr><td style="font-weight:bold;">' + labelMesAtual + ' (current)</td>';
    htmlSubTaskStory += '<td style="text-align:center;font-weight:bold;font-size:1.2em;color:#4361ee;">' + tpSubTask + '<br><small style="font-size:0.7em; font-weight:normal;">(' + qtdSubTask + ' issues)</small></td>';
    htmlSubTaskStory += '<td style="text-align:center;font-weight:bold;font-size:1.2em;color:#f72585;">' + tpStoryBug + '<br><small style="font-size:0.7em; font-weight:normal;">(' + qtdStoryBug + ' issues)</small></td>';
    htmlSubTaskStory += '<td style="text-align:center;">' + diasUteisAtual + '</td>';
    htmlSubTaskStory += '<td style="text-align:center;">' + data.total + '</td>';
    htmlSubTaskStory += '</tr>';
    htmlSubTaskStory += '<tr id="linha-last-period" style="background:#f8fbfd;"><td style="font-weight:bold;">' + labelMesAnt + ' (last period)</td>';
    htmlSubTaskStory += '<td id="last-subtask-tp" style="text-align:center;color:#999;">⏳</td>';
    htmlSubTaskStory += '<td id="last-storybug-tp" style="text-align:center;color:#999;">⏳</td>';
    htmlSubTaskStory += '<td id="last-dias" style="text-align:center;color:#999;">-</td>';
    htmlSubTaskStory += '<td id="last-total" style="text-align:center;color:#999;">-</td>';
    htmlSubTaskStory += '</tr>';
    htmlSubTaskStory += '</tbody></table>';
    htmlSubTaskStory += '</div>';

    // ===== TABELA LEAD TIME + THROUGHPUT (igual imagem 96) =====
    let htmlLeadTime = '<div class="throughput-card" style="margin-top:20px; border-radius:10px; padding:20px;">';
    htmlLeadTime += '<h3 style="margin:0 0 15px 0; color:#006d77;">⏱️ Lead Time - Results</h3>';
    // Tabela Story (vazia - sem dados)
    htmlLeadTime += '<table class="tabela" style="margin-bottom:20px;"><thead>';
    htmlLeadTime += '<tr style="background:#006d77;color:#fff;"><th>Type</th><th colspan="5" style="text-align:center;">Story</th></tr>';
    htmlLeadTime += '<tr style="background:#006d77;color:#fff;"><th></th><th>Avg Lead Time 70% (days)</th><th>Throughput</th><th>Comments</th><th>Avg Lead Time 70% (dias)</th><th>Throughput</th></tr>';
    htmlLeadTime += '</thead><tbody>';
    htmlLeadTime += '<tr><td style="font-weight:bold;">' + labelMesAtual + '</td><td style="text-align:center;color:#999;">-</td><td style="text-align:center;color:#999;">-</td><td style="text-align:center;color:#999;">-</td><td style="text-align:center;color:#999;">-</td><td style="text-align:center;color:#999;">-</td></tr>';
    htmlLeadTime += '<tr style="background:#f8fbfd;"><td style="font-weight:bold;">Previous period</td><td style="text-align:center;color:#999;">-</td><td style="text-align:center;color:#999;">-</td><td style="text-align:center;color:#999;">-</td><td style="text-align:center;color:#999;">-</td><td style="text-align:center;color:#999;">-</td></tr>';
    htmlLeadTime += '</tbody></table>';
    // Tabela Sub-task (com dados)
    htmlLeadTime += '<table class="tabela"><thead>';
    htmlLeadTime += '<tr style="background:#006d77;color:#fff;"><th>Type</th><th colspan="3" style="text-align:center;">Sub-task</th><th colspan="2" style="text-align:center;">Story Bug</th></tr>';
    htmlLeadTime += '<tr style="background:#006d77;color:#fff;"><th></th><th>Avg Lead Time 70% (days)</th><th>Throughput</th><th>Comments</th><th>Avg Lead Time 70% (dias)</th><th>Throughput</th></tr>';
    htmlLeadTime += '</thead><tbody>';
    htmlLeadTime += '<tr><td style="font-weight:bold;">' + labelMesAtual + '</td>';
    htmlLeadTime += '<td style="text-align:center;font-weight:bold;color:#4361ee;">' + leadTimeSubTaskAtual + '</td>';
    htmlLeadTime += '<td style="text-align:center;font-weight:bold;color:#4361ee;">' + tpSubTask + '</td>';
    htmlLeadTime += '<td style="text-align:center;color:#999;">-</td>';
    htmlLeadTime += '<td style="text-align:center;font-weight:bold;color:#f72585;">' + leadTimeStoryBugAtual + '</td>';
    htmlLeadTime += '<td style="text-align:center;font-weight:bold;color:#f72585;">' + tpStoryBug + '</td>';
    htmlLeadTime += '</tr>';
    htmlLeadTime += '<tr style="background:#f8fbfd;"><td style="font-weight:bold;">Previous period</td>';
    htmlLeadTime += '<td id="last-lead-subtask" style="text-align:center;color:#999;">⏳</td>';
    htmlLeadTime += '<td id="last-subtask" style="text-align:center;color:#999;">⏳</td>';
    htmlLeadTime += '<td style="text-align:center;color:#999;">-</td>';
    htmlLeadTime += '<td id="last-lead-storybug" style="text-align:center;color:#999;">⏳</td>';
    htmlLeadTime += '<td id="last-storybug" style="text-align:center;color:#999;">⏳</td>';
    htmlLeadTime += '</tr>';
    htmlLeadTime += '</tbody></table>';
    htmlLeadTime += '</div>';

    // ===== THROUGHPUT RUN CHART (barras azuis + linha laranja cumulativa) =====
    let htmlRunChart = '<div class="throughput-card" style="margin-top:20px; border-radius:10px; padding:20px;">';
    htmlRunChart += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; flex-wrap:wrap; gap:10px;">';
    htmlRunChart += '<h3 style="margin:0; color:#006d77;">📈 Throughput (Frequency + Cumulative)</h3>';
    htmlRunChart += '<div style="display:flex; gap:5px;">';
    htmlRunChart += '<button id="btn-modo-filtrado" onclick="trocarModoGrafico(\'filtrado\')" class="btn btn-primary btn-sm" style="background:#006d77;">Todos os dias</button>';
    htmlRunChart += '<button id="btn-modo-aa" onclick="trocarModoGrafico(\'actionable\')" class="btn btn-sm" style="background:#e3e8ef; color:#006d77;">Sem feriados</button>';
    htmlRunChart += '<button id="btn-modo-ref" onclick="trocarModoGrafico(\'referencia\')" class="btn btn-sm" style="background:#e3e8ef; color:#006d77;">Actionable Agile (ref)</button>';
    htmlRunChart += '<button onclick="baixarGraficoThroughput()" class="btn btn-success btn-sm" style="margin-left:10px;">⬇ Baixar PNG</button>';
    htmlRunChart += '</div>';
    htmlRunChart += '</div>';
    htmlRunChart += '<canvas id="chart-throughput-run" style="max-height:350px;"></canvas>';
    htmlRunChart += '</div>';

    // ===== CYCLE TIME HISTOGRAM (igual Actionable Agile - imagem 97) =====
    let htmlCycleTime = '<div class="throughput-card" style="margin-top:20px; border-radius:10px; padding:20px;">';
    htmlCycleTime += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; flex-wrap:wrap; gap:10px;">';
    htmlCycleTime += '<h3 style="margin:0; color:#006d77;">⏱️ Cycle Time Histogram (Actionable Agile)</h3>';
    htmlCycleTime += '<div style="display:flex; gap:5px;">';
    htmlCycleTime += '<button onclick="trocarModoCycleTime(\'all\')" class="btn btn-primary btn-sm" id="btn-ct-all" style="background:#006d77;">Todos</button>';
    htmlCycleTime += '<button onclick="trocarModoCycleTime(\'subtask\')" class="btn btn-sm" id="btn-ct-subtask" style="background:#e3e8ef; color:#006d77;">Sub-task</button>';
    htmlCycleTime += '<button onclick="trocarModoCycleTime(\'storybug\')" class="btn btn-sm" id="btn-ct-storybug" style="background:#e3e8ef; color:#006d77;">Story Bug</button>';
    htmlCycleTime += '<button onclick="baixarGraficoCycleTime()" class="btn btn-success btn-sm" style="margin-left:10px;">⬇ Baixar PNG</button>';
    htmlCycleTime += '</div>';
    htmlCycleTime += '</div>';
    htmlCycleTime += '<div style="display:flex; gap:10px; align-items:flex-end; margin-bottom:15px; flex-wrap:wrap;">';
    htmlCycleTime += '<div class="form-group" style="flex:0 0 auto; margin:0;"><label style="font-size:0.85em; color:#006d77; font-weight:600;">Data Início</label><input type="date" id="cycle-date-inicio" class="input-text" style="width:auto;"></div>';
    htmlCycleTime += '<div class="form-group" style="flex:0 0 auto; margin:0;"><label style="font-size:0.85em; color:#006d77; font-weight:600;">Data Fim</label><input type="date" id="cycle-date-fim" class="input-text" style="width:auto;"></div>';
    htmlCycleTime += '<button onclick="filtrarCycleTimePorData()" class="btn btn-primary btn-sm">Filtrar</button>';
    htmlCycleTime += '<button onclick="limparFiltroCycleTime()" class="btn btn-danger btn-sm">Limpar</button>';
    htmlCycleTime += '</div>';
    htmlCycleTime += '<canvas id="chart-cycle-time" style="max-height:400px; background:#fff; border-radius:6px;"></canvas>';
    htmlCycleTime += '<div id="cycle-selected-info" style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; padding:10px 15px; background:#f8fbfd; border-radius:8px; font-size:0.85em; color:#555; flex-wrap:wrap; gap:10px;">';
    htmlCycleTime += '<div><strong>Selected Values:</strong> from <span id="cycle-min-val">0</span> to <span id="cycle-max-val">0</span></div>';
    htmlCycleTime += '<div><strong>Selected Dates:</strong> from <span id="cycle-min-date">-</span> to <span id="cycle-max-date">-</span></div>';
    htmlCycleTime += '</div>';
    htmlCycleTime += '<h4 style="margin:15px 0 5px 0; color:#006d77;">Cycle Time Scatterplot</h4>';
    htmlCycleTime += '<canvas id="chart-cycle-scatter" style="max-height:300px;"></canvas>';
    htmlCycleTime += '</div>';

    document.getElementById("area-dados-auditoria").innerHTML = htmlThroughput + htmlSubTaskStory + htmlLeadTime + htmlRunChart + htmlCycleTime + htmlTabela;

    // Renderizar a primeira página da tabela de issues (paginação de 10 em 10)
    renderizarPaginaIssues(1);

    // ===== HISTOGRAMA DE THROUGHPUT =====
    // 1. Contar quantas issues foram resolvidas por dia
    const issuesPorDia = {};
    data.dados.forEach(d => {
        const dataRes = d["Data Resolução"];
        if (dataRes) {
            const dia = dataRes.substring(0, 10);
            issuesPorDia[dia] = (issuesPorDia[dia] || 0) + 1;
        }
    });

    // 2. Contar TODOS os dias do período (incluindo dias com 0 issues)
    // Usar as datas do filtro para gerar todos os dias do período
    const dataInicioPeriodo = document.getElementById("filtro-res-data-inicio").value;
    const dataFimPeriodo = document.getElementById("filtro-res-data-fim").value;
    const todosOsDias = {};
    if (dataInicioPeriodo && dataFimPeriodo) {
        const dataAtual = new Date(dataInicioPeriodo + "T00:00:00");
        const dataFinal = new Date(dataFimPeriodo + "T00:00:00");
        while (dataAtual <= dataFinal) {
            const diaStr = dataAtual.toISOString().split("T")[0];
            todosOsDias[diaStr] = issuesPorDia[diaStr] || 0;
            dataAtual.setDate(dataAtual.getDate() + 1);
        }
    } else {
        // Se não houver filtro de data, usar apenas os dias que têm issues
        Object.assign(todosOsDias, issuesPorDia);
    }

    // Guardar dados globalmente para poder trocar de modo sem refazer a busca
    dadosHistogramaGlobal = {
        issuesPorDia: issuesPorDia,
        dataInicioPeriodo: dataInicioPeriodo,
        dataFimPeriodo: dataFimPeriodo,
    };

    // Gerar o gráfico com o modo atual
    gerarGraficoHistograma(modoGraficoAtual);

    // ===== GERAR CYCLE TIME HISTOGRAM =====
    dadosCycleTimeGlobal = { dados: data.dados };
    gerarGraficoCycleTime("all");

    document.getElementById("area-download").innerHTML = "";

    // ===== BUSCAR DADOS DO MES ANTERIOR EM BACKGROUND =====
    if (mesAnt) {
        buscarMesAnterior(projeto, releaseParam, params, mesAnt, calcularDiasUteis);
    }
}

// Funcao para buscar dados do mes anterior em background
async function buscarMesAnterior(projeto, releaseParam, paramsAtuais, mesAnt, fnDiasUteis) {
    try {
        // Criar novos parametros com as datas do mes anterior
        const paramsAnt = new URLSearchParams();
        // Copiar todos os parametros atuais
        for (const [key, value] of paramsAtuais.entries()) {
            // Pular as datas de resolucao (vamos usar as do mes anterior)
            if (key !== "res_data_inicio" && key !== "res_data_fim") {
                paramsAnt.append(key, value);
            }
        }
        paramsAnt.append("res_data_inicio", mesAnt.inicio);
        paramsAnt.append("res_data_fim", mesAnt.fim);
        // Manter todos os filtros do mês atual no mês anterior
        // (Sub-task bate com 1.68 usando todos os filtros)

        const queryString = paramsAnt.toString();
        const url = "/api/auditoria/" + encodeURIComponent(projeto) + "/" + encodeURIComponent(releaseParam) + (queryString ? "?" + queryString : "");

        const resp = await fetchComToken(url);
        if (!resp) return;
        const data = await resp.json();

        if (data.erro) {
            document.getElementById("last-subtask").textContent = "Erro";
            document.getElementById("last-storybug").textContent = "Erro";
            return;
        }

        const statsAnt = data.estatisticas;
        const diasUteisAnt = fnDiasUteis(mesAnt.inicio, mesAnt.fim) - 1;
        // Buscar de forma case-insensitive
        let qtdSubTaskAnt = 0;
        let qtdStoryBugAnt = 0;
        for (const [tipo, qtd] of Object.entries(statsAnt.por_tipo)) {
            const tipoLower = tipo.toLowerCase().replace(/\s+/g, "");
            if (tipoLower === "sub-task" || tipoLower === "subtask") {
                qtdSubTaskAnt = qtd;
            }
            if (tipoLower === "storybug") {
                qtdStoryBugAnt = qtd;
            }
        }

        // ===== SEGUNDA BUSCA: Story Bug sem filtro de Canceled =====
        // O sistema de referência inclui Canceled no Story Bug
        // Mantém Duplicate, PDI e no_metrics excluídos
        const paramsAntSB = new URLSearchParams();
        for (const [key, value] of paramsAtuais.entries()) {
            if (key !== "res_data_inicio" && key !== "res_data_fim" && key !== "resolucao_excluir") {
                paramsAntSB.append(key, value);
            }
        }
        // Manter apenas Duplicate excluído (remover Canceled)
        paramsAntSB.append("resolucao_excluir", "Duplicate");
        paramsAntSB.append("res_data_inicio", mesAnt.inicio);
        paramsAntSB.append("res_data_fim", mesAnt.fim);

        const queryStringSB = paramsAntSB.toString();
        const urlSB = "/api/auditoria/" + encodeURIComponent(projeto) + "/" + encodeURIComponent(releaseParam) + (queryStringSB ? "?" + queryStringSB : "");

        try {
            const respSB = await fetchComToken(urlSB);
            if (respSB) {
                const dataSB = await respSB.json();
                if (!dataSB.erro) {
                    const statsSB = dataSB.estatisticas;
                    for (const [tipo, qtd] of Object.entries(statsSB.por_tipo)) {
                        const tipoLower = tipo.toLowerCase().replace(/\s+/g, "");
                        if (tipoLower === "storybug") {
                            qtdStoryBugAnt = qtd;
                        }
                    }
                }
            }
        } catch (e2) {
            // Se falhar, mantém o valor da primeira busca
        }

        // Calcular throughput total do mês anterior
        // Usar uma TERCEIRA busca sem NENHUMA exclusão de resolução para bater com a referência
        const paramsAntGT = new URLSearchParams();
        for (const [key, value] of paramsAtuais.entries()) {
            if (key !== "res_data_inicio" && key !== "res_data_fim" && key !== "resolucao_excluir") {
                paramsAntGT.append(key, value);
            }
        }
        // Sem nenhuma exclusão de resolução (nem Canceled nem Duplicate)
        paramsAntGT.append("res_data_inicio", mesAnt.inicio);
        paramsAntGT.append("res_data_fim", mesAnt.fim);

        const queryStringGT = paramsAntGT.toString();
        const urlGT = "/api/auditoria/" + encodeURIComponent(projeto) + "/" + encodeURIComponent(releaseParam) + (queryStringGT ? "?" + queryStringGT : "");

        let totalAntGT = data.total;
        try {
            const respGT = await fetchComToken(urlGT);
            if (respGT) {
                const dataGT = await respGT.json();
                if (!dataGT.erro) {
                    totalAntGT = dataGT.total;
                }
            }
        } catch (e3) {
            // Se falhar, mantém o valor da primeira busca
        }
        const throughputAnt = diasUteisAnt > 0 ? (totalAntGT / diasUteisAnt).toFixed(2).replace(".", ",") : "0";

        console.log("=== MES ANTERIOR (DEBUG) ===");
        console.log("Periodo:", mesAnt.inicio, "a", mesAnt.fim);
        console.log("Dias uteis:", diasUteisAnt);
        console.log("Total issues:", data.total);
        console.log("Qtd Sub-task:", qtdSubTaskAnt, "Qtd Story Bug:", qtdStoryBugAnt);
        const tpSubTaskAnt = diasUteisAnt > 0 ? (qtdSubTaskAnt / diasUteisAnt).toFixed(2).replace(".", ",") : "0";
        const tpStoryBugAnt = diasUteisAnt > 0 ? (qtdStoryBugAnt / diasUteisAnt).toFixed(2).replace(".", ",") : "0";

        // Calcular Lead Time 70% do mês anterior (dias corridos, média dos 70% mais rápidos)
        function calcularLeadTime70Ant(dados, tipoFiltro) {
            const leadTimes = [];
            dados.forEach(d => {
                const tipoLower = (d.Tipo || "").toLowerCase().replace(/\s+/g, "");
                const tipoMatch = tipoFiltro === "subtask" 
                    ? (tipoLower === "sub-task" || tipoLower === "subtask")
                    : (tipoLower === "storybug");
                if (!tipoMatch) return;
                const dataCriacao = d["Data Criação"];
                const dataResolucao = d["Data Resolução"];
                if (!dataCriacao || !dataResolucao) return;
                const criacao = new Date(dataCriacao);
                const resolucao = new Date(dataResolucao);
                const diffMs = resolucao - criacao;
                const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));
                if (diffDias >= 0) leadTimes.push(diffDias);
            });
            if (leadTimes.length === 0) return "-";
            leadTimes.sort((a, b) => a - b);
            const total = leadTimes.length;
            const fimIdx = Math.ceil(total * 0.70);
            const leadTimes70 = leadTimes.slice(0, fimIdx);
            if (leadTimes70.length === 0) return "-";
            const soma = leadTimes70.reduce((a, b) => a + b, 0);
            return Math.round(soma / leadTimes70.length).toString();
        }

        const leadTimeSubTaskAnt = calcularLeadTime70Ant(data.dados, "subtask");
        const leadTimeStoryBugAnt = calcularLeadTime70Ant(data.dados, "storybug");

        // Atualizar Lead Time (tabela Lead Time - Results)
        const elLeadSub = document.getElementById("last-lead-subtask");
        if (elLeadSub) { elLeadSub.textContent = leadTimeSubTaskAnt; elLeadSub.style.color = "#4361ee"; elLeadSub.style.fontWeight = "bold"; }
        const elLeadSB = document.getElementById("last-lead-storybug");
        if (elLeadSB) { elLeadSB.textContent = leadTimeStoryBugAnt; elLeadSB.style.color = "#f72585"; elLeadSB.style.fontWeight = "bold"; }

        // Atualizar Throughput na tabela Lead Time - Results
        const elSub = document.getElementById("last-subtask");
        if (elSub) { elSub.textContent = tpSubTaskAnt; elSub.style.color = "#4361ee"; elSub.style.fontWeight = "bold"; elSub.style.fontSize = "1.2em"; }
        const elSB = document.getElementById("last-storybug");
        if (elSB) { elSB.textContent = tpStoryBugAnt; elSB.style.color = "#f72585"; elSB.style.fontWeight = "bold"; elSB.style.fontSize = "1.2em"; }

        // Atualizar Throughput na tabela Throughput por Tipo (Sub-task x Story Bug)
        const elSubTP = document.getElementById("last-subtask-tp");
        if (elSubTP) { elSubTP.textContent = tpSubTaskAnt; elSubTP.style.color = "#4361ee"; elSubTP.style.fontWeight = "bold"; elSubTP.style.fontSize = "1.2em"; }
        const elSBTP = document.getElementById("last-storybug-tp");
        if (elSBTP) { elSBTP.textContent = tpStoryBugAnt; elSBTP.style.color = "#f72585"; elSBTP.style.fontWeight = "bold"; elSBTP.style.fontSize = "1.2em"; }

        const elDias = document.getElementById("last-dias");
        if (elDias) { elDias.textContent = diasUteisAnt; elDias.style.color = "#666"; }
        const elTotal = document.getElementById("last-total");
        if (elTotal) { elTotal.textContent = data.total; elTotal.style.color = "#666"; }

        // Atualizar General Throughput do last period
        const lastPeriodRow = document.querySelector('#area-dados-auditoria .throughput-card table tbody tr:nth-child(2)');
        if (lastPeriodRow) {
            const throughputCell = lastPeriodRow.querySelector('td:nth-child(2)');
            const commentsCell = lastPeriodRow.querySelector('td:nth-child(3)');
            if (throughputCell) {
                throughputCell.textContent = throughputAnt;
                throughputCell.style.textAlign = "center";
                throughputCell.style.fontWeight = "bold";
                throughputCell.style.fontSize = "1.2em";
                throughputCell.style.color = "#006d77";
            }
            if (commentsCell) {
                commentsCell.textContent = data.total + " issues em " + diasUteisAnt + " dias uteis";
                commentsCell.style.color = "#666";
            }
        }
    } catch (e) {
        document.getElementById("last-subtask").textContent = "-";
        document.getElementById("last-storybug").textContent = "-";
    }
}

async function baixarExcel() {
    const projeto = document.getElementById("aud-projeto").value.trim().toUpperCase();
    const release = document.getElementById("aud-release").value.trim();
    const releaseParam = release || "todas";
    const token = getToken();

    // Reaproveitar os mesmos filtros da auditoria
    const params = new URLSearchParams();
    const labels = document.getElementById("filtro-labels").value.trim();
    const issuetype = document.getElementById("filtro-issuetype").value;
    const priority = document.getElementById("filtro-priority").value;
    const assignee = document.getElementById("filtro-assignee").value.trim();
    const status = document.getElementById("filtro-status").value;
    const resolucaoExcluir = document.getElementById("filtro-resolucao-excluir").value;
    const componenteExcluir = document.getElementById("filtro-componente-excluir").value.trim();
    const labelsExcluir = document.getElementById("filtro-labels-excluir").value.trim();
    const resDataInicio = document.getElementById("filtro-res-data-inicio").value;
    const resDataFim = document.getElementById("filtro-res-data-fim").value;
    const orderBy = document.getElementById("filtro-order-by").value;

    if (labels) params.append("labels", labels);
    if (issuetype) params.append("issuetype", issuetype);
    if (priority) params.append("priority", priority);
    if (assignee) params.append("assignee", assignee);
    if (status) params.append("status", status);
    if (resolucaoExcluir) params.append("resolucao_excluir", resolucaoExcluir);
    if (componenteExcluir) params.append("componente_excluir", componenteExcluir);
    if (labelsExcluir) params.append("labels_excluir", labelsExcluir);
    if (resDataInicio) params.append("res_data_inicio", resDataInicio);
    if (resDataFim) params.append("res_data_fim", resDataFim);
    if (orderBy) params.append("order_by", orderBy);

    const queryString = params.toString();
    const url = "/api/auditoria/" + encodeURIComponent(projeto) + "/" + encodeURIComponent(releaseParam) + "/excel" + (queryString ? "?" + queryString : "");

    const resp = await fetch(url, {
        headers: { "X-Jira-Token": token },
    });

    if (resp.status === 401) {
        alert("Sessão expirada. Faça login novamente.");
        fazerLogout();
        return;
    }

    const blob = await resp.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = "auditoria_" + projeto + "_" + (release || "todas") + ".xlsx";
    a.click();
    window.URL.revokeObjectURL(blobUrl);
}

// ============================================================
// PAGINAÇÃO DA TABELA DE ISSUES (10 por página)
// ============================================================

let paginaAtualIssues = 1;
const ISSUES_POR_PAGINA = 5;

function renderizarPaginaIssues(pagina) {
    const dados = (ultimoDadosAuditoria && ultimoDadosAuditoria.dados) ? ultimoDadosAuditoria.dados : [];
    const tbody = document.getElementById("tbody-issues");
    const divPag = document.getElementById("paginacao-issues");
    if (!tbody || !divPag || !dados.length) return;

    const totalPaginas = Math.ceil(dados.length / ISSUES_POR_PAGINA);
    if (pagina < 1) pagina = 1;
    if (pagina > totalPaginas) pagina = totalPaginas;
    paginaAtualIssues = pagina;

    const inicio = (pagina - 1) * ISSUES_POR_PAGINA;
    const fim = Math.min(inicio + ISSUES_POR_PAGINA, dados.length);
    const paginaDados = dados.slice(inicio, fim);

    // Linhas da página atual
    let linhas = "";
    paginaDados.forEach(d => {
        // Limitar descrição a 100 caracteres na tabela (mostrar completa no CSV)
        let descCurta = escapeHtml(d["Descrição"] || "");
        if (descCurta.length > 100) {
            descCurta = descCurta.substring(0, 100) + '...';
        }
        linhas += '<tr><td><strong>' + escapeHtml(d.Key) + '</strong></td><td>' + escapeHtml(d.Resumo) + '</td><td style="max-width:300px; white-space:pre-wrap; font-size:0.85em; color:#555;">' + (descCurta || '<em style="color:#aaa;">Sem descrição</em>') + '</td><td>' + escapeHtml(d.Tipo) + '</td><td>' + badgeStatus(d.Status) + '</td><td>' + escapeHtml(d.Prioridade) + '</td><td>' + escapeHtml(d["Responsável"]) + '</td><td>' + escapeHtml(d["Resolução"]) + '</td><td>' + escapeHtml(d["Data Criação"]) + '</td><td>' + escapeHtml(d["Data Resolução"]) + '</td></tr>';
    });
    tbody.innerHTML = linhas;

    // Controles de paginação
    let controles = '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-top:12px;">';
    controles += '<span style="font-size:0.85em; color:#666;">Mostrando ' + (inicio + 1) + '–' + fim + ' de ' + dados.length + ' issues</span>';
    controles += '<div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">';

    const estiloDesabilitado = 'padding:6px 12px; opacity:0.5; cursor:not-allowed;';
    const estiloAtivo = 'padding:6px 12px;';

    controles += '<button onclick="renderizarPaginaIssues(' + (pagina - 1) + ')" class="btn btn-sm" style="' + (pagina === 1 ? estiloDesabilitado : estiloAtivo) + '"' + (pagina === 1 ? ' disabled' : '') + '>← Anterior</button>';

    // Números das páginas (janela de até 5 em torno da atual)
    let iniNum = Math.max(1, pagina - 2);
    let fimNum = Math.min(totalPaginas, iniNum + 4);
    iniNum = Math.max(1, fimNum - 4);
    for (let p = iniNum; p <= fimNum; p++) {
        if (p === pagina) {
            controles += '<button disabled class="btn btn-sm btn-primary" style="padding:6px 12px;">' + p + '</button>';
        } else {
            controles += '<button onclick="renderizarPaginaIssues(' + p + ')" class="btn btn-sm" style="padding:6px 12px;">' + p + '</button>';
        }
    }

    controles += '<button onclick="renderizarPaginaIssues(' + (pagina + 1) + ')" class="btn btn-sm" style="' + (pagina === totalPaginas ? estiloDesabilitado : estiloAtivo) + '"' + (pagina === totalPaginas ? ' disabled' : '') + '>Próxima →</button>';

    controles += '</div></div>';
    divPag.innerHTML = controles;
}

// ============================================================
// PUBLICAR NO CONFLUENCE
// ============================================================

function abrirModalConfluence() {
    if (!ultimoDadosAuditoria || !ultimoDadosAuditoria.dados || ultimoDadosAuditoria.dados.length === 0) {
        alert("Execute uma auditoria primeiro antes de publicar no Confluence.");
        return;
    }
    // Pré-carregar token salvo no navegador (válido por ~1 ano)
    const tokenSalvo = localStorage.getItem("confluence_token");
    if (tokenSalvo) {
        document.getElementById("confluence-token").value = tokenSalvo;
    }
    document.getElementById("modal-confluence").style.display = "flex";
    document.getElementById("status-confluence").innerHTML = "";
}

function fecharModalConfluence() {
    document.getElementById("modal-confluence").style.display = "none";
}

// ============================================================
// CAPTURAR GRÁFICOS COMO IMAGENS (PNG base64)
// ============================================================

function capturarGraficos() {
    const nomes = {
        "chart-status": "Grafico - Por Status",
        "chart-tipo": "Grafico - Por Tipo",
        "chart-prioridade": "Grafico - Por Prioridade",
        "chart-responsavel": "Grafico - Por Responsavel",
        "chart-throughput-run": "Grafico - Throughput Run Chart",
        "chart-cycle-time": "Grafico - Cycle Time",
        "chart-cycle-scatter": "Grafico - Cycle Time Scatter",
    };
    const graficos = [];
    for (const id in chartInstances) {
        const chart = chartInstances[id];
        if (!chart || !chart.canvas) continue;
        try {
            const canvas = chart.canvas;
            // Desenhar em canvas temporário com fundo branco
            // (fundo transparente fica ilegível no Confluence)
            const temp = document.createElement("canvas");
            temp.width = canvas.width;
            temp.height = canvas.height;
            const ctx = temp.getContext("2d");
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, temp.width, temp.height);
            ctx.drawImage(canvas, 0, 0);
            graficos.push({ nome: (nomes[id] || id) + ".png", imagem: temp.toDataURL("image/png") });
        } catch (e) {
            console.warn("Não foi possível capturar o gráfico " + id, e);
        }
    }
    return graficos;
}

// ============================================================
// PUBLICAR AUDITORIA NO CONFLUENCE
// ============================================================

async function publicarConfluence() {
    const tokenConfluence = document.getElementById("confluence-token").value.trim();
    const titulo = document.getElementById("confluence-titulo").value.trim();

    if (!tokenConfluence) {
        mostrarStatus("status-confluence", "Digite o token do Confluence", "error");
        return;
    }
    if (!ultimoDadosAuditoria) {
        mostrarStatus("status-confluence", "Nenhum dado de auditoria disponível. Execute uma auditoria primeiro.", "error");
        return;
    }

    mostrarStatus("status-confluence", "⏳ Publicando no Confluence...", "loading");

    const projeto = document.getElementById("aud-projeto").value.trim().toUpperCase();
    const release = document.getElementById("aud-release").value.trim();

    try {
        const resp = await fetch("/api/confluence/publicar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                confluence_token: tokenConfluence,
                dados: ultimoDadosAuditoria.dados,
                estatisticas: ultimoDadosAuditoria.estatisticas,
                total: ultimoDadosAuditoria.total,
                projeto: projeto,
                release: release,
                jql: ultimoDadosAuditoria.jql || "",
                titulo: titulo,
                graficos: capturarGraficos(),
            }),
        });
        const data = await resp.json();

        if (data.sucesso) {
            // Salvar token no navegador para não precisar digitar novamente (válido por ~1 ano)
            if (tokenConfluence) {
                localStorage.setItem("confluence_token", tokenConfluence);
            }
            const acaoTxt = data.acao === "atualizada" ? "atualizada" : "criada";
            const anexosTxt = data.anexos && data.anexos.length > 0
                ? " (" + data.anexos.length + " gráfico(s) anexado(s))"
                : "";
            mostrarStatus("status-confluence",
                "✅ Página " + acaoTxt + " com sucesso!" + anexosTxt + "<br>" +
                '<a href="' + data.link + '" target="_blank" style="color:#006d77;">🔗 Abrir página no Confluence</a>',
                "success");
        } else {
            mostrarStatus("status-confluence", "❌ Erro: " + (data.erro || "") + " - " + (data.detalhe || ""), "error");
        }
    } catch (e) {
        mostrarStatus("status-confluence", "❌ Erro de conexão: " + e.message, "error");
    }
}

// ============================================================
// CRIAR GRAFICO DE PIZZA (Chart.js)
// ============================================================

// Variavel global para guardar os graficos e poder destruir antes de recriar
var chartInstances = {};

function criarGraficoPizza(canvasId, dados, cores, total) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // Destruir grafico anterior se existir (evita sobreposicao)
    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }

    // Converter o objeto em arrays ordenados por quantidade (maior primeiro)
    const entradas = Object.entries(dados).sort((a, b) => b[1] - a[1]);
    const labels = entradas.map(e => e[0]);
    const valores = entradas.map(e => e[1]);

    // Atribuir cores diferentes para cada fatia
    const coresUsadas = labels.map((_, i) => cores[i % cores.length]);

    const isDark = document.body.classList.contains("dark-mode");

    // Definir cor global do Chart.js baseado no modo
    Chart.defaults.color = isDark ? "#e0e6ed" : "#000000";
    Chart.defaults.borderColor = isDark ? "#2a3a5c" : "#e3e8ef";

    // Mesmas cores nos dois modos — so borda e legenda mudam
    const borderColor = isDark ? "#1a2744" : "#fff";
    const hoverBorder = isDark ? "#4cc9f0" : "#1b4965";
    const legendColor = isDark ? "#e0e6ed" : "#000000";
    const tooltipBg = isDark ? "rgba(15, 30, 54, 0.95)" : "rgba(13, 27, 42, 0.9)";
    const tooltipTitle = isDark ? "#4cc9f0" : "#fff";
    const tooltipBody = isDark ? "#e0e6ed" : "#fff";

    chartInstances[canvasId] = new Chart(canvas, {
        type: "doughnut",
        data: {
            labels: labels,
            datasets: [{
                data: valores,
                backgroundColor: coresUsadas,
                borderColor: borderColor,
                borderWidth: 3,
                hoverBorderColor: hoverBorder,
                hoverBorderWidth: 4,
                hoverOffset: 0,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: "55%",
            animation: {
                animateRotate: true,
                animateScale: true,
                duration: 800,
                easing: "easeOutQuart",
            },
            plugins: {
                legend: {
                    position: "right",
                    labels: {
                        font: { size: 13, family: "'Segoe UI', sans-serif", weight: "600" },
                        padding: 12,
                        boxWidth: 16,
                        boxHeight: 16,
                        usePointStyle: true,
                        pointStyle: "circle",
                        color: legendColor,
                    }
                },
                tooltip: {
                    backgroundColor: tooltipBg,
                    titleFont: { size: 13, weight: "bold" },
                    bodyFont: { size: 12 },
                    padding: 10,
                    cornerRadius: 8,
                    displayColors: true,
                    titleColor: tooltipTitle,
                    bodyColor: tooltipBody,
                    callbacks: {
                        label: function(context) {
                            const valor = context.parsed;
                            const pct = ((valor / total) * 100).toFixed(1);
                            return " " + context.label + ": " + valor + " (" + pct + "%)";
                        }
                    }
                }
            }
        }
    });
}


// ============================================================
// CARREGAR PROJETOS NO DROPDOWN DA AUDITORIA
// ============================================================

async function carregarProjetosAuditoria() {
    const select = document.getElementById("aud-projeto");
    select.innerHTML = '<option value="">Carregando projetos...</option>';

    const resp = await fetchComToken("/api/projetos");
    if (!resp) return;
    const data = await resp.json();

    if (data.erro) {
        select.innerHTML = '<option value="BXBNG">BXBNG</option>';
        alert("Erro ao carregar projetos: " + data.erro);
        return;
    }

    if (!Array.isArray(data) || data.length === 0) {
        select.innerHTML = '<option value="BXBNG">BXBNG</option>';
        return;
    }

    select.innerHTML = "";
    data.forEach(proj => {
        const option = document.createElement("option");
        option.value = proj.key;
        option.textContent = proj.key + " - " + proj.name;
        select.appendChild(option);
    });

    // Selecionar BXBNG por padrão se existir
    for (let i = 0; i < select.options.length; i++) {
        if (select.options[i].value === "BXBNG") {
            select.selectedIndex = i;
            break;
        }
    }
}


// ============================================================
// CARREGAR LABELS
// ============================================================

async function carregarLabels() {
    const projeto = document.getElementById("aud-projeto").value.trim().toUpperCase();
    const release = document.getElementById("aud-release").value.trim();
    const select = document.getElementById("filtro-labels");

    if (!projeto || !release) {
        alert("Preencha projeto e release primeiro!");
        return;
    }

    select.innerHTML = '<option value="">Carregando labels...</option>';

    const resp = await fetchComToken("/api/labels/" + encodeURIComponent(projeto) + "/" + encodeURIComponent(release));
    if (!resp) return;
    const data = await resp.json();

    if (data.erro) {
        select.innerHTML = '<option value="">Erro ao carregar</option>';
        alert("Erro: " + data.erro);
        return;
    }

    const labels = data.labels || [];
    select.innerHTML = '<option value="">Todas as labels (' + data.total_labels + ' disponiveis)</option>';
    labels.forEach(label => {
        const option = document.createElement("option");
        option.value = label.name;
        option.textContent = label.name + " (" + label.count + " issues)";
        select.appendChild(option);
    });
}

// ============================================================
// FILTROS PRÉ-DEFINIDOS (MENSAL)
// ============================================================

function aplicarFiltroMensal() {
    // Limpa todos os filtros primeiro
    limparFiltros();

    // Aplica o filtro mensal padrão (mês atual)
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth(); // 0-11

    // Primeiro dia do mês atual
    const dataInicio = new Date(ano, mes, 1);
    // Último dia do mês atual
    const dataFim = new Date(ano, mes + 1, 0);

    // Formatar como YYYY-MM-DD
    const fmtInicio = dataInicio.toISOString().split("T")[0];
    const fmtFim = dataFim.toISOString().split("T")[0];

    // Aplicar filtros da JQL do usuário
    document.getElementById("aud-release").value = "";
    document.getElementById("filtro-resolucao-excluir").value = "Canceled,Duplicate";
    document.getElementById("filtro-componente-excluir").value = "PDI";
    document.getElementById("filtro-labels-excluir").value = "no_metrics";
    document.getElementById("filtro-res-data-inicio").value = fmtInicio;
    document.getElementById("filtro-res-data-fim").value = fmtFim;
    document.getElementById("filtro-order-by").value = "issuetype";

    const nomesMeses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    alert("Filtro mensal aplicado: " + nomesMeses[mes] + " " + ano + "\n\n" +
          "• Excluir Resolução: Canceled e Duplicate\n" +
          "• Excluir Componente: PDI\n" +
          "• Excluir Label: no_metrics\n" +
          "• Data Resolução: " + fmtInicio + " a " + fmtFim + "\n" +
          "• Ordenar por: Tipo\n\n" +
          "Agora é só clicar em 🔍 Procurar!");
}

function aplicarFiltroMesAnterior() {
    // Limpa todos os filtros primeiro
    limparFiltros();

    // Calcula o mês anterior
    const hoje = new Date();
    let ano = hoje.getFullYear();
    let mes = hoje.getMonth() - 1; // Mês anterior

    // Se mês anterior for -1 (dezembro do ano passado)
    if (mes < 0) {
        mes = 11; // Dezembro
        ano = ano - 1;
    }

    // Primeiro dia do mês anterior
    const dataInicio = new Date(ano, mes, 1);
    // Último dia do mês anterior
    const dataFim = new Date(ano, mes + 1, 0);

    // Formatar como YYYY-MM-DD
    const fmtInicio = dataInicio.toISOString().split("T")[0];
    const fmtFim = dataFim.toISOString().split("T")[0];

    // Aplicar filtros da JQL do usuário
    document.getElementById("aud-release").value = "";
    document.getElementById("filtro-resolucao-excluir").value = "Canceled,Duplicate";
    document.getElementById("filtro-componente-excluir").value = "PDI";
    document.getElementById("filtro-labels-excluir").value = "no_metrics";
    document.getElementById("filtro-res-data-inicio").value = fmtInicio;
    document.getElementById("filtro-res-data-fim").value = fmtFim;
    document.getElementById("filtro-order-by").value = "issuetype";

    const nomesMeses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    alert("Filtro do mês anterior aplicado: " + nomesMeses[mes] + " " + ano + "\n\n" +
          "• Excluir Resolução: Canceled e Duplicate\n" +
          "• Excluir Componente: PDI\n" +
          "• Excluir Label: no_metrics\n" +
          "• Data Resolução: " + fmtInicio + " a " + fmtFim + "\n" +
          "• Ordenar por: Tipo\n\n" +
          "Agora é só clicar em 🔍 Procurar!");
}


// ============================================================
// LIMPAR FILTROS
// ============================================================

function limparFiltros() {
    document.getElementById("filtro-labels").value = "";
    document.getElementById("filtro-issuetype").value = "";
    document.getElementById("filtro-priority").value = "";
    document.getElementById("filtro-assignee").value = "";
    document.getElementById("filtro-status").value = "";
    document.getElementById("filtro-resolucao-excluir").value = "";
    document.getElementById("filtro-componente-excluir").value = "";
    document.getElementById("filtro-labels-excluir").value = "";
    document.getElementById("filtro-res-data-inicio").value = "";
    document.getElementById("filtro-res-data-fim").value = "";
    document.getElementById("filtro-order-by").value = "";
}

// ============================================================
// ABRIR/FECHAR GRAFICOS (ACORDEAO)
// ============================================================

function toggleGraficos() {
    const container = document.getElementById("container-graficos");
    const icone = document.getElementById("icone-graficos");
    if (container.style.maxHeight === "0px") {
        container.style.maxHeight = "2000px";
        icone.style.transform = "rotate(0deg)";
        icone.textContent = "▼";
    } else {
        container.style.maxHeight = "0px";
        icone.style.transform = "rotate(-90deg)";
        icone.textContent = "▶";
    }
}

// ============================================================
// MODAL
// ============================================================

function fecharModal() {
    document.getElementById("modal").style.display = "none";
}

window.onclick = function(event) {
    const modal = document.getElementById("modal");
    if (event.target === modal) fecharModal();
};

// ============================================================
// BAIXAR GRÁFICO DE THROUGHPUT COMO PNG
// ============================================================

function baixarGraficoThroughput() {
    const chart = chartInstances["chart-throughput-run"];
    if (!chart) {
        alert("Gráfico não encontrado. Faça uma busca primeiro.");
        return;
    }

    // Criar um canvas temporário com fundo branco
    const canvasOriginal = chart.canvas;
    const canvasTemp = document.createElement("canvas");
    canvasTemp.width = canvasOriginal.width;
    canvasTemp.height = canvasOriginal.height;
    const ctx = canvasTemp.getContext("2d");

    // Pintar fundo branco
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasTemp.width, canvasTemp.height);

    // Desenhar o gráfico por cima
    ctx.drawImage(canvasOriginal, 0, 0);

    // Gerar nome do arquivo com data atual
    const agora = new Date();
    const ano = agora.getFullYear();
    const mes = String(agora.getMonth() + 1).padStart(2, "0");
    const dia = String(agora.getDate()).padStart(2, "0");
    const hora = String(agora.getHours()).padStart(2, "0");
    const min = String(agora.getMinutes()).padStart(2, "0");
    const nomeArquivo = "throughput_" + ano + mes + dia + "_" + hora + min + ".png";

    // Converter para PNG e baixar
    canvasTemp.toBlob(function(blob) {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = nomeArquivo;
        a.click();
        window.URL.revokeObjectURL(url);
    }, "image/png");
}

// ============================================================
// TROCAR MODO DO GRÁFICO DE THROUGHPUT
// ============================================================

function trocarModoGrafico(modo) {
    modoGraficoAtual = modo;

    // Atualizar estilo dos botões
    const btnFiltrado = document.getElementById("btn-modo-filtrado");
    const btnAA = document.getElementById("btn-modo-aa");
    const btnRef = document.getElementById("btn-modo-ref");
    if (btnFiltrado && btnAA && btnRef) {
        // Resetar todos
        btnFiltrado.style.background = "#e3e8ef";
        btnFiltrado.style.color = "#006d77";
        btnAA.style.background = "#e3e8ef";
        btnAA.style.color = "#006d77";
        btnRef.style.background = "#e3e8ef";
        btnRef.style.color = "#006d77";
        // Ativar o selecionado
        if (modo === "filtrado") {
            btnFiltrado.style.background = "#006d77";
            btnFiltrado.style.color = "#fff";
        } else if (modo === "actionable") {
            btnAA.style.background = "#006d77";
            btnAA.style.color = "#fff";
        } else if (modo === "referencia") {
            btnRef.style.background = "#006d77";
            btnRef.style.color = "#fff";
        }
    }

    // Recriar o gráfico com o novo modo
    if (dadosHistogramaGlobal || modo === "referencia") {
        gerarGraficoHistograma(modo);
    }
}

// ============================================================
// GERAR GRÁFICO DE HISTOGRAMA (com modo filtrado ou actionable)
// ============================================================

function gerarGraficoHistograma(modo) {
    // ===== MODO REFERÊNCIA: dados exatos do Actionable Agile (imagem 93) =====
    if (modo === "referencia") {
        // Dados extraídos da imagem do Actionable Agile:
        // 29 dias, eixo X de 0 a 23
        const dadosRef = [8,0,0,1,4,1,1,1,2,2,3,2,1,1,1,0,0,0,0,0,0,0,0,1];
        const totalDiasRef = 29;

        // Calcular cumulativo
        let acumRef = 0;
        const cumulativoRef = dadosRef.map(v => {
            acumRef += v;
            return (acumRef / totalDiasRef * 100);
        });

        const labelsRef = [];
        for (let i = 0; i < dadosRef.length; i++) {
            labelsRef.push(i.toString());
        }

        if (chartInstances["chart-throughput-run"]) {
            chartInstances["chart-throughput-run"].destroy();
        }

        const isDark = document.body.classList.contains("dark-mode");
        const ctxRun = document.getElementById("chart-throughput-run");
        if (!ctxRun) return;

        chartInstances["chart-throughput-run"] = new Chart(ctxRun, {
            type: "bar",
            data: {
                labels: labelsRef,
                datasets: [
                    {
                        type: "bar",
                        label: "Frequency (days)",
                        data: dadosRef,
                        backgroundColor: "#4361ee",
                        borderColor: "#3a0ca3",
                        borderWidth: 1,
                        borderRadius: 4,
                        yAxisID: "y",
                        order: 2,
                    },
                    {
                        type: "line",
                        label: "Cumulative %",
                        data: cumulativoRef,
                        backgroundColor: "#ff9f1c",
                        borderColor: "#ff9f1c",
                        borderWidth: 3,
                        pointRadius: 4,
                        pointBackgroundColor: "#ff9f1c",
                        fill: false,
                        tension: 0.1,
                        yAxisID: "y1",
                        order: 1,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                plugins: {
                    legend: {
                        display: true,
                        position: "top",
                        labels: {
                            color: isDark ? "#e0e6ed" : "#000000",
                            font: { size: 12, weight: "600" },
                            usePointStyle: true,
                        }
                    },
                    tooltip: {
                        backgroundColor: isDark ? "rgba(15,30,54,0.95)" : "rgba(13,27,42,0.9)",
                        callbacks: {
                            title: function(items) {
                                return "Throughput: " + items[0].label + " items (Actionable Agile ref)";
                            },
                            label: function(context) {
                                if (context.dataset.label === "Frequency (days)") {
                                    const pct = (context.parsed.y / totalDiasRef * 100).toFixed(1);
                                    return " " + context.parsed.y + " days (" + pct + "%) had " + context.label + " completed items";
                                } else {
                                    return " Cumulative: " + context.parsed.y.toFixed(1) + "% of days had " + context.label + " or fewer items";
                                }
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: "category",
                        title: {
                            display: true,
                            text: "Throughput (# of work items completed)",
                            color: isDark ? "#e0e6ed" : "#000000",
                            font: { size: 12, weight: "600" }
                        },
                        ticks: { color: isDark ? "#a0b0c0" : "#555", maxRotation: 0, autoSkip: false },
                        grid: { color: isDark ? "#2a3a5c" : "#e3e8ef" }
                    },
                    y: {
                        type: "linear",
                        position: "left",
                        max: 8,
                        title: {
                            display: true,
                            text: "Frequency of Throughput",
                            color: "#4361ee",
                            font: { size: 12, weight: "600" }
                        },
                        ticks: { color: "#4361ee", stepSize: 1, precision: 0 },
                        grid: { color: isDark ? "#2a3a5c" : "#e3e8ef" },
                        beginAtZero: true,
                    },
                    y1: {
                        type: "linear",
                        position: "right",
                        max: 100,
                        title: {
                            display: true,
                            text: "Cumulative %",
                            color: "#ff9f1c",
                            font: { size: 12, weight: "600" }
                        },
                        ticks: {
                            color: "#ff9f1c",
                            callback: function(value) { return value + "%"; }
                        },
                        grid: { drawOnChartArea: false },
                        beginAtZero: true,
                    }
                }
            }
        });
        return;
    }

    if (!dadosHistogramaGlobal) return;

    const { issuesPorDia, dataInicioPeriodo, dataFimPeriodo } = dadosHistogramaGlobal;

    // Feriados nacionais brasileiros (formato MM-DD)
    const feriadosFixos = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "12-25"];
    const feriadosMoveis = {
        "2024": ["02-12", "02-13", "03-29", "05-30"],
        "2025": ["03-03", "03-04", "04-18", "06-19"],
        "2026": ["02-16", "02-17", "04-03", "06-04"],
        "2027": ["02-08", "02-09", "03-26", "05-27"],
    };

    // Gerar os dias do período
    const diasParaContar = {};
    if (dataInicioPeriodo && dataFimPeriodo) {
        const dataAtual = new Date(dataInicioPeriodo + "T00:00:00");
        const dataFinal = new Date(dataFimPeriodo + "T00:00:00");
        while (dataAtual <= dataFinal) {
            const diaStr = dataAtual.toISOString().split("T")[0];
            const diaSemana = dataAtual.getDay();
            const ano = dataAtual.getFullYear();
            const mesDia = (dataAtual.getMonth() + 1).toString().padStart(2, "0") + "-" + dataAtual.getDate().toString().padStart(2, "0");
            const ehFeriadoFixo = feriadosFixos.includes(mesDia);
            const feriadosAno = feriadosMoveis[ano.toString()] || [];
            const ehFeriadoMovel = feriadosAno.includes(mesDia);

            if (modo === "actionable") {
                // Modo Actionable Agile: todos os dias EXCETO feriados (inclui fins de semana)
                if (!ehFeriadoFixo && !ehFeriadoMovel) {
                    diasParaContar[diaStr] = issuesPorDia[diaStr] || 0;
                }
            } else {
                // Modo Filtrado: todos os dias (incluindo feriados)
                diasParaContar[diaStr] = issuesPorDia[diaStr] || 0;
            }
            dataAtual.setDate(dataAtual.getDate() + 1);
        }
    } else {
        Object.assign(diasParaContar, issuesPorDia);
    }

    // Contar quantos dias tiveram X issues resolvidas (histograma)
    const histograma = {};
    const totalDias = Object.keys(diasParaContar).length;
    Object.values(diasParaContar).forEach(count => {
        histograma[count] = (histograma[count] || 0) + 1;
    });

    // Criar labels de 0 até o valor máximo
    const maxIssuesPorDia = Math.max(...Object.keys(histograma).map(Number), 0);
    const labelsHistograma = [];
    const valoresHistograma = [];
    for (let i = 0; i <= maxIssuesPorDia; i++) {
        labelsHistograma.push(i.toString());
        valoresHistograma.push(histograma[i] || 0);
    }

    // Calcular percentual cumulativo
    let acumuladoDias = 0;
    const valoresCumulativosPct = valoresHistograma.map(v => {
        acumuladoDias += v;
        return totalDias > 0 ? (acumuladoDias / totalDias * 100) : 0;
    });

    // Destruir gráfico anterior
    if (chartInstances["chart-throughput-run"]) {
        chartInstances["chart-throughput-run"].destroy();
    }

    const isDark = document.body.classList.contains("dark-mode");
    const ctxRun = document.getElementById("chart-throughput-run");
    if (!ctxRun) return;

    const tituloModo = modo === "actionable" ? " (dias úteis)" : " (todos os dias)";

    chartInstances["chart-throughput-run"] = new Chart(ctxRun, {
        type: "bar",
        data: {
            labels: labelsHistograma,
            datasets: [
                {
                    type: "bar",
                    label: "Frequency (days)",
                    data: valoresHistograma,
                    backgroundColor: "#4361ee",
                    borderColor: "#3a0ca3",
                    borderWidth: 1,
                    borderRadius: 4,
                    yAxisID: "y",
                    order: 2,
                },
                {
                    type: "line",
                    label: "Cumulative %",
                    data: valoresCumulativosPct,
                    backgroundColor: "#ff9f1c",
                    borderColor: "#ff9f1c",
                    borderWidth: 3,
                    pointRadius: 4,
                    pointBackgroundColor: "#ff9f1c",
                    fill: false,
                    tension: 0.1,
                    yAxisID: "y1",
                    order: 1,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: "index",
                intersect: false,
            },
            plugins: {
                legend: {
                    display: true,
                    position: "top",
                    labels: {
                        color: isDark ? "#e0e6ed" : "#000000",
                        font: { size: 12, weight: "600" },
                        usePointStyle: true,
                    }
                },
                tooltip: {
                    backgroundColor: isDark ? "rgba(15,30,54,0.95)" : "rgba(13,27,42,0.9)",
                    callbacks: {
                        title: function(items) {
                            return "Throughput: " + items[0].label + " items" + tituloModo;
                        },
                        label: function(context) {
                            if (context.dataset.label === "Frequency (days)") {
                                const pct = totalDias > 0 ? (context.parsed.y / totalDias * 100).toFixed(1) : 0;
                                return " " + context.parsed.y + " days (" + pct + "%) had " + context.label + " completed items";
                            } else {
                                return " Cumulative: " + context.parsed.y.toFixed(1) + "% of days had " + context.label + " or fewer items";
                            }
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: "category",
                    title: {
                        display: true,
                        text: "Throughput (# of work items completed)",
                        color: isDark ? "#e0e6ed" : "#000000",
                        font: { size: 12, weight: "600" }
                    },
                    ticks: {
                        color: isDark ? "#a0b0c0" : "#555",
                        maxRotation: 0,
                        autoSkip: false,
                    },
                    grid: { color: isDark ? "#2a3a5c" : "#e3e8ef" }
                },
                y: {
                    type: "linear",
                    position: "left",
                    title: {
                        display: true,
                        text: "Frequency of Throughput (days)",
                        color: "#4361ee",
                        font: { size: 12, weight: "600" }
                    },
                    ticks: {
                        color: "#4361ee",
                        stepSize: 1,
                        precision: 0,
                    },
                    grid: { color: isDark ? "#2a3a5c" : "#e3e8ef" },
                    beginAtZero: true,
                },
                y1: {
                    type: "linear",
                    position: "right",
                    max: 100,
                    title: {
                        display: true,
                        text: "Cumulative %",
                        color: "#ff9f1c",
                        font: { size: 12, weight: "600" }
                    },
                    ticks: {
                        color: "#ff9f1c",
                        callback: function(value) {
                            return value + "%";
                        }
                    },
                    grid: { drawOnChartArea: false },
                    beginAtZero: true,
                }
            }
        }
    });
}

// ============================================================
// CYCLE TIME HISTOGRAM (igual Actionable Agile - imagem 97)
// ============================================================

var dadosCycleTimeGlobal = null;
var modoCycleTimeAtual = "all";

function gerarGraficoCycleTime(modo) {
    if (!dadosCycleTimeGlobal) return;
    const { dados } = dadosCycleTimeGlobal;
    const cycleTimes = [];
    const scatterData = [];
    let minDataResolucao = null;
    let maxDataResolucao = null;
    dados.forEach(d => {
        const tipoLower = (d.Tipo || "").toLowerCase().replace(/\s+/g, "");
        if (modo === "subtask") {
            if (tipoLower !== "sub-task" && tipoLower !== "subtask") return;
        } else if (modo === "storybug") {
            if (tipoLower !== "storybug") return;
        }
        // Cycle Time = Data In Progress → Data Resolução (igual Actionable Agile)
        const dataInProgress = d["Data In Progress"];
        const dataResolucao = d["Data Resolução"];
        if (!dataInProgress || !dataResolucao) return;
        const inProgress = new Date(dataInProgress);
        const resolucao = new Date(dataResolucao);
        const diffDias = Math.round((resolucao - inProgress) / (1000 * 60 * 60 * 24));
        if (diffDias >= 0) {
            cycleTimes.push(diffDias);
            scatterData.push({ x: resolucao, y: diffDias });
            // Rastrear min/max datas de resolução para "Selected Dates"
            if (!minDataResolucao || resolucao < minDataResolucao) minDataResolucao = resolucao;
            if (!maxDataResolucao || resolucao > maxDataResolucao) maxDataResolucao = resolucao;
        }
    });
    if (cycleTimes.length === 0) return;
    const maxCycleTime = Math.max(...cycleTimes);
    const minCycleTime = Math.min(...cycleTimes);
    // Bin size sempre 1 dia (igual Actionable Agile)
    const numBins = maxCycleTime + 1;
    const histograma = new Array(numBins).fill(0);
    const labels = [];
    for (let i = 0; i < numBins; i++) labels.push(i.toString());
    cycleTimes.forEach(ct => { if (ct < numBins) histograma[ct]++; });
    const total = cycleTimes.length;
    let acumulado = 0;
    const cumulativo = histograma.map(v => { acumulado += v; return (acumulado / total * 100); });

    // Encontrar percentis 50%, 70%, 85%, 95%
    const sortedTimes = [...cycleTimes].sort((a, b) => a - b);
    function percentile(arr, p) { const idx = Math.ceil(arr.length * p) - 1; return arr[Math.max(0, idx)]; }
    const p50 = percentile(sortedTimes, 0.50);
    const p70 = percentile(sortedTimes, 0.70);
    const p85 = percentile(sortedTimes, 0.85);
    const p95 = percentile(sortedTimes, 0.95);

    // ===== Atualizar "Selected Values" e "Selected Dates" abaixo do gráfico =====
    const elMinVal = document.getElementById("cycle-min-val");
    const elMaxVal = document.getElementById("cycle-max-val");
    const elMinDate = document.getElementById("cycle-min-date");
    const elMaxDate = document.getElementById("cycle-max-date");
    if (elMinVal) elMinVal.textContent = minCycleTime;
    if (elMaxVal) elMaxVal.textContent = maxCycleTime;
    if (elMinDate && minDataResolucao) {
        const d = minDataResolucao;
        elMinDate.textContent = String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
    }
    if (elMaxDate && maxDataResolucao) {
        const d = maxDataResolucao;
        elMaxDate.textContent = String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
    }

    if (chartInstances["chart-cycle-time"]) chartInstances["chart-cycle-time"].destroy();
    const isDark = document.body.classList.contains("dark-mode");
    const ctx = document.getElementById("chart-cycle-time");
    if (!ctx) return;

    // Cores iguais à imagem 97 (Actionable Agile)
    const corBarra = "#2979FF";       // Azul brilhante
    const corLinha = "#FF9800";       // Laranja
    const corPercentil = "#999999";   // Cinza para todas as linhas de percentil
    const corGrid = "#E0E0E0";        // Cinza bem claro para gridlines
    const corTexto = isDark ? "#e0e6ed" : "#333333";

    // Plugin para desenhar linhas verticais tracejadas nos percentis (todas cinza, texto rotacionado)
    const percentileLinesPlugin = {
        id: "percentileLines",
        afterDraw: function(chart) {
            const xScale = chart.scales.x;
            const yScale = chart.scales.y;
            const ctx2 = chart.ctx;
            const percentis = [
                { val: p50, label: "50%" },
                { val: p70, label: "70%" },
                { val: p85, label: "85%" },
                { val: p95, label: "95%" },
            ];
            percentis.forEach(p => {
                const x = xScale.getPixelForValue(p.val);
                ctx2.save();
                // Linha tracejada cinza
                ctx2.strokeStyle = corPercentil;
                ctx2.lineWidth = 1.5;
                ctx2.setLineDash([6, 4]);
                ctx2.beginPath();
                ctx2.moveTo(x, yScale.top);
                ctx2.lineTo(x, yScale.bottom);
                ctx2.stroke();
                ctx2.setLineDash([]);
                // Texto rotacionado verticalmente ao lado da linha
                ctx2.fillStyle = corPercentil;
                ctx2.font = "bold 11px 'Segoe UI', sans-serif";
                ctx2.translate(x + 4, yScale.top + 14);
                ctx2.rotate(-Math.PI / 2);
                ctx2.fillText(p.label, 0, 0);
                ctx2.restore();
            });
        }
    };

    chartInstances["chart-cycle-time"] = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [
                {
                    type: "bar",
                    label: "Frequency",
                    data: histograma,
                    backgroundColor: corBarra,
                    borderColor: corBarra,
                    borderWidth: 0,
                    yAxisID: "y",
                    order: 2,
                    barPercentage: 0.9,
                    categoryPercentage: 1.0,
                },
                {
                    type: "line",
                    label: "Cumulative %",
                    data: cumulativo,
                    backgroundColor: corLinha,
                    borderColor: corLinha,
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    pointBackgroundColor: corLinha,
                    fill: false,
                    tension: 0.1,
                    yAxisID: "y1",
                    order: 1,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 5 } },
            interaction: { mode: "index", intersect: false },
            plugins: {
                legend: {
                    display: true,
                    position: "bottom",
                    align: "center",
                    labels: {
                        color: corTexto,
                        font: { size: 12, family: "'Segoe UI', sans-serif", weight: "500" },
                        usePointStyle: true,
                        pointStyle: "circle",
                        boxWidth: 10,
                        padding: 20,
                    }
                },
                tooltip: {
                    backgroundColor: isDark ? "rgba(15,30,54,0.95)" : "rgba(255,255,255,0.95)",
                    titleColor: isDark ? "#4cc9f0" : "#333",
                    bodyColor: isDark ? "#e0e6ed" : "#333",
                    borderColor: isDark ? "#2a3a5c" : "#ccc",
                    borderWidth: 1,
                    callbacks: {
                        title: function(items) { return "Cycle Time: " + items[0].label + " days"; },
                        label: function(context) {
                            if (context.dataset.label === "Frequency") {
                                return " " + context.parsed.y + " work items";
                            } else {
                                return " Cumulative: " + context.parsed.y.toFixed(1) + "%";
                            }
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: "category",
                    title: {
                        display: true,
                        text: "Cycle Time (Days)",
                        color: corTexto,
                        font: { size: 12, weight: "600" },
                        padding: { top: 8 },
                    },
                    ticks: {
                        color: isDark ? "#a0b0c0" : "#666",
                        maxRotation: 0,
                        autoSkip: false,
                        callback: function(value, index) {
                            // Mostrar apenas ticks múltiplos de 20
                            const val = parseInt(labels[index]);
                            if (val % 20 === 0) return val;
                            return null;
                        },
                    },
                    grid: { display: false },
                    afterTickToLabelConversion: function(scale) {
                        // Esconder a linha dos ticks não-múltiplos de 20
                        scale.ticks.forEach((tick, i) => {
                            const val = parseInt(tick.label);
                            if (isNaN(val) || val % 20 !== 0) {
                                tick.label = "";
                                tick.major = false;
                            } else {
                                tick.major = true;
                            }
                        });
                    },
                },
                y: {
                    type: "linear",
                    position: "left",
                    title: {
                        display: true,
                        text: "Frequency (# of Work Items)",
                        color: corTexto,
                        font: { size: 12, weight: "600" },
                    },
                    ticks: {
                        color: isDark ? "#a0b0c0" : "#666",
                        stepSize: 5,
                        precision: 0,
                        max: 55,
                        callback: function(value) {
                            if (value % 5 === 0) return value;
                            return "";
                        },
                    },
                    grid: {
                        color: corGrid,
                        drawTicks: false,
                    },
                    border: { display: false },
                    beginAtZero: true,
                },
                y1: {
                    type: "linear",
                    position: "right",
                    max: 100,
                    title: {
                        display: true,
                        text: "Cumulative %",
                        color: corTexto,
                        font: { size: 12, weight: "600" },
                    },
                    ticks: {
                        color: isDark ? "#a0b0c0" : "#666",
                        stepSize: 10,
                        callback: function(value) { return value + "%"; },
                    },
                    grid: { drawOnChartArea: false },
                    border: { display: false },
                    beginAtZero: true,
                }
            }
        },
        plugins: [percentileLinesPlugin]
    });

    // Gerar scatter plot embaixo
    if (chartInstances["chart-cycle-scatter"]) chartInstances["chart-cycle-scatter"].destroy();
    const ctxScatter = document.getElementById("chart-cycle-scatter");
    if (ctxScatter) {
        chartInstances["chart-cycle-scatter"] = new Chart(ctxScatter, {
            type: "scatter",
            data: { datasets: [{ label: "Work Items", data: scatterData, backgroundColor: corBarra + "99", borderColor: corBarra, pointRadius: 4, pointHoverRadius: 6 }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: "top", labels: { color: corTexto, font: { size: 12, weight: "600" }, usePointStyle: true } },
                    tooltip: { backgroundColor: isDark ? "rgba(15,30,54,0.95)" : "rgba(255,255,255,0.95)", titleColor: isDark ? "#4cc9f0" : "#333", bodyColor: isDark ? "#e0e6ed" : "#333", borderColor: isDark ? "#2a3a5c" : "#ccc", borderWidth: 1, callbacks: {
                        title: function(items) { return new Date(items[0].parsed.x).toLocaleDateString("pt-BR"); },
                        label: function(context) { return " Cycle Time: " + context.parsed.y + " days"; }
                    }}
                },
                scales: {
                    x: { type: "time", time: { unit: "month", displayFormats: { month: "M/yyyy" } }, title: { display: true, text: "Date", color: corTexto, font: { size: 12, weight: "600" } }, ticks: { color: isDark ? "#a0b0c0" : "#666" }, grid: { color: corGrid } },
                    y: { type: "linear", position: "left", title: { display: true, text: "Cycle Time (Days)", color: corTexto, font: { size: 12, weight: "600" } }, ticks: { color: isDark ? "#a0b0c0" : "#666", precision: 0 }, grid: { color: corGrid }, beginAtZero: true }
                }
            }
        });
    }
}

function trocarModoCycleTime(modo) {
    modoCycleTimeAtual = modo;
    const btnAll = document.getElementById("btn-ct-all");
    const btnSub = document.getElementById("btn-ct-subtask");
    const btnSB = document.getElementById("btn-ct-storybug");
    if (btnAll && btnSub && btnSB) {
        btnAll.style.background = "#e3e8ef"; btnAll.style.color = "#006d77";
        btnSub.style.background = "#e3e8ef"; btnSub.style.color = "#006d77";
        btnSB.style.background = "#e3e8ef"; btnSB.style.color = "#006d77";
        if (modo === "all") { btnAll.style.background = "#006d77"; btnAll.style.color = "#fff"; }
        else if (modo === "subtask") { btnSub.style.background = "#006d77"; btnSub.style.color = "#fff"; }
        else if (modo === "storybug") { btnSB.style.background = "#006d77"; btnSB.style.color = "#fff"; }
    }
    gerarGraficoCycleTime(modo);
}

function baixarGraficoCycleTime() {
    const chart = chartInstances["chart-cycle-time"];
    if (!chart) { alert("Gráfico não encontrado. Faça uma busca primeiro."); return; }
    const canvasOriginal = chart.canvas;
    const canvasTemp = document.createElement("canvas");
    canvasTemp.width = canvasOriginal.width;
    canvasTemp.height = canvasOriginal.height;
    const ctx = canvasTemp.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasTemp.width, canvasTemp.height);
    ctx.drawImage(canvasOriginal, 0, 0);
    const nomeArquivo = "cycle_time_histogram_" + new Date().toISOString().split("T")[0] + ".png";
    canvasTemp.toBlob(function(blob) {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = nomeArquivo;
        a.click();
        window.URL.revokeObjectURL(url);
    }, "image/png");
}

// ============================================================
// FILTRAR CYCLE TIME POR DATA
// ============================================================

function filtrarCycleTimePorData() {
    const dataInicio = document.getElementById("cycle-date-inicio").value;
    const dataFim = document.getElementById("cycle-date-fim").value;

    if (!dataInicio && !dataFim) {
        alert("Selecione pelo menos uma data para filtrar.");
        return;
    }

    if (!dadosCycleTimeGlobal) {
        alert("Nenhum dado disponível. Faça uma busca primeiro.");
        return;
    }

    // Filtrar os dados pelo período de resolução
    const dadosFiltrados = dadosCycleTimeGlobal.dados.filter(d => {
        const dataRes = d["Data Resolução"];
        if (!dataRes) return false;
        const dataResStr = dataRes.substring(0, 10); // YYYY-MM-DD
        if (dataInicio && dataResStr < dataInicio) return false;
        if (dataFim && dataResStr > dataFim) return false;
        return true;
    });

    if (dadosFiltrados.length === 0) {
        alert("Nenhuma issue encontrada no período selecionado.");
        return;
    }

    // Recriar o gráfico com os dados filtrados (preservando o modo atual)
    const dadosOriginais = dadosCycleTimeGlobal.dados;
    dadosCycleTimeGlobal.dados = dadosFiltrados;
    gerarGraficoCycleTime(modoCycleTimeAtual);
    dadosCycleTimeGlobal.dados = dadosOriginais; // Restaurar para não perder os dados originais
}

function limparFiltroCycleTime() {
    document.getElementById("cycle-date-inicio").value = "";
    document.getElementById("cycle-date-fim").value = "";
    // Recriar o gráfico com todos os dados
    gerarGraficoCycleTime(modoCycleTimeAtual);
}

