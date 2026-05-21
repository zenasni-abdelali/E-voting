// ═══════════════════════════════════════════════════
//  elector-dashboard.js — E-Voting Elector Dashboard
// ═══════════════════════════════════════════════════

/* ─── Config ─────────────────────────────────────── */
const API_BASE_URL = "https://8586-154-121-77-33.ngrok-free.app";

/* ─── State ─────────────────────────────────────── */
let currentElector = null;
let lastDashboardElections = [];
let voteTarget = null;
let resultsTarget = null;
let choiceTarget = null;

/* ─── Utilities ─────────────────────────────────── */

function showToast(message, type = "info") {
    const stack = document.getElementById("toast-stack");
    if (!stack) return;
    const color = type === "error" ? "bg-red-600" : "bg-emerald-600";
    const t = document.createElement("div");
    t.className = `${color} text-white px-4 py-3 rounded-xl shadow-xl text-sm font-medium max-w-sm pointer-events-auto`;
    t.textContent = message;
    stack.appendChild(t);
    setTimeout(() => {
        t.classList.add("opacity-0", "translate-x-2", "transition-all", "duration-300");
        setTimeout(() => t.remove(), 320);
    }, 2600);
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/* ─── Confirmation Dialog ────────────────────────── */

function askConfirmation({ title, message }) {
    return new Promise((resolve) => {
        const overlay = document.getElementById("confirm-overlay");
        const titleEl = document.getElementById("confirm-title");
        const msgEl = document.getElementById("confirm-message");
        const noBtn = document.getElementById("confirm-no");
        const yesBtn = document.getElementById("confirm-yes");

        if (!overlay || !titleEl || !msgEl || !noBtn || !yesBtn) { resolve(false); return; }

        titleEl.textContent = title || "Confirmation";
        msgEl.textContent = message || "";
        overlay.classList.remove("hidden");
        overlay.classList.add("flex");

        const done = (v) => {
            overlay.classList.add("hidden");
            overlay.classList.remove("flex");
            noBtn.removeEventListener("click", onNo);
            yesBtn.removeEventListener("click", onYes);
            overlay.removeEventListener("click", onBackdrop);
            resolve(v);
        };

        const onNo = () => done(false);
        const onYes = () => done(true);
        const onBackdrop = (e) => { if (e.target === overlay) done(false); };

        noBtn.addEventListener("click", onNo);
        yesBtn.addEventListener("click", onYes);
        overlay.addEventListener("click", onBackdrop);
    });
}

/* ─── Logout Permission Dialog ───────────────────── */

window.askLogoutPermission = function () {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.className = "fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-md px-4";
        overlay.innerHTML = `
            <div class="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl transform transition-all scale-100 border border-slate-100">
                <div class="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                    <svg class="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                </div>
                <h3 class="text-2xl font-bold text-slate-800 text-center mb-2">Déconnexion</h3>
                <p class="text-slate-500 text-center mb-8">Êtes-vous sûr de vouloir quitter votre session électeur ?</p>
                <div class="flex gap-4">
                    <button id="cancel-logout" class="flex-1 px-6 py-3.5 rounded-xl font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all">Annuler</button>
                    <button id="confirm-logout" class="flex-1 px-6 py-3.5 rounded-xl font-semibold text-white bg-red-500 hover:bg-red-600 shadow-lg shadow-red-200 transition-all">Se déconnecter</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        document.getElementById("cancel-logout").onclick = () => { overlay.remove(); resolve(false); };
        document.getElementById("confirm-logout").onclick = () => { overlay.remove(); resolve(true); };
    });
};

async function handleLogout() {
    const permitted = await askLogoutPermission();
    if (!permitted) return;
    const ok = await askConfirmation({ title: tElector("CONFIRMATION"), message: tElector("Voulez-vous vraiment quitter ?") });
    if (ok) {
        if (typeof clearElectorVoteSession === "function") await clearElectorVoteSession();
        localStorage.removeItem("evote_user");
        sessionStorage.removeItem("evote_elector_vote_session");
        currentElector = null;
        window.location.href = "index.html";
    }
}

/* ─── Vote Modal ─────────────────────────────────── */

async function refreshVoteUnlockUI() {
    const pwdPanel = document.getElementById("vote-password-panel");
    const banner = document.getElementById("vote-session-banner");
    if (!pwdPanel || !banner || !currentElector) return;
    const ok =
        typeof isElectorSigningReady === "function" &&
        (await isElectorSigningReady(currentElector.email));
    pwdPanel.classList.toggle("hidden", ok);
    banner.classList.toggle("hidden", !ok);
}

function candidateAvatarSvg(optionIndex) {
    const hues = ["#64748b", "#6366f1", "#8b5cf6", "#0d9488", "#0891b2", "#4f46e5"];
    const c1 = hues[optionIndex % hues.length];
    const c2 = hues[(optionIndex + 2) % hues.length];
    return `
        <div class="relative w-14 h-14 rounded-2xl mx-auto mb-3 ring-[3px] ring-white shadow-md" style="background: radial-gradient(circle at 32% 22%, rgba(255,255,255,0.45) 0%, transparent 48%), linear-gradient(145deg, ${c1}, ${c2});">
            <div class="absolute inset-0 flex items-center justify-center">
                <svg class="w-8 h-8 text-white drop-shadow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"/>
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 20.625c1.591-4.29 13.909-4.29 15.5 0"/>
                </svg>
            </div>
        </div>`;
}

async function openVoteModal(election, options = {}) {
    const mode = options.mode || "vote";
    const choiceData = options.choiceData || null;
    const isChoiceMode = mode === "choice";

    voteTarget = isChoiceMode ? null : election;
    choiceTarget = isChoiceMode ? election : null;

    document.getElementById("vote-modal-election-title").textContent = election.titre || "Élection";
    document.getElementById("vote-password").value = "";

    const verifyPanel = document.getElementById("vote-verification-panel");
    if (verifyPanel) { verifyPanel.classList.add("hidden"); verifyPanel.innerHTML = ""; }

    if (isChoiceMode) {
        document.getElementById("vote-password-panel")?.classList.add("hidden");
        document.getElementById("vote-session-banner")?.classList.add("hidden");
    } else {
        await refreshVoteUnlockUI();
    }

    const errEl = document.getElementById("vote-modal-error");
    errEl.classList.add("hidden");
    errEl.textContent = "";

    const list = document.getElementById("vote-candidates-list");
    const cands = election.candidats || [];

    if (!cands.length) {
        list.innerHTML = `
            <div class="rounded-2xl border border-dashed border-slate-200 bg-white py-14 text-center text-slate-500 text-sm w-full">
                Aucun choix configuré pour cette élection.
            </div>`;
    } else {
        list.innerHTML = cands.map((c, i) => {
            const label = c.nom || `Candidat ${i + 1}`;
            const selected = isChoiceMode && Number(c.id) === Number(choiceData?.candidat_id);
            const cardClass = selected
                ? "border-emerald-400 bg-emerald-50 shadow-lg shadow-emerald-500/10"
                : "border-slate-200 bg-white";
            return `
                <article class="vote-cand-card group min-w-[190px] max-w-[220px] flex flex-col rounded-2xl border ${cardClass} p-5 text-center transition-all duration-200 ${isChoiceMode ? "" : "hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-500/10"}" data-candidat-id="${c.id}">
                    ${candidateAvatarSvg(i)}
                    <p class="text-lg font-bold ${selected ? "text-emerald-900" : "text-slate-900"} tracking-tight">${escapeHtml(label)}</p>
                    <p class="text-xs font-medium ${selected ? "text-emerald-700" : "text-slate-500"} mt-1.5">Candidat</p>
                    ${isChoiceMode
                        ? selected
                            ? `<div class="mt-5 w-full py-3 rounded-xl text-sm font-bold text-emerald-800 bg-white border border-emerald-300 shadow-sm">&#10003; vote accept&eacute;</div>`
                            : `<div class="mt-5 w-full py-3 rounded-xl text-sm font-semibold text-slate-400 bg-slate-50 border border-slate-200">Non choisi</div>`
                        : `<button type="button" class="vote-candidate-btn mt-5 w-full py-3 rounded-xl text-sm font-bold text-white shadow-md shadow-indigo-900/25 bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 hover:from-indigo-500 hover:via-violet-500 hover:to-indigo-500 active:scale-[0.98] transition-all disabled:opacity-55 disabled:pointer-events-none">
                                Voter
                           </button>`}
                </article>`;
        }).join("");

        if (!isChoiceMode) {
            list.querySelectorAll(".vote-candidate-btn").forEach((btn) => {
                btn.addEventListener("click", () => {
                    const id = parseInt(btn.closest("[data-candidat-id]").dataset.candidatId, 10);
                    if (Number.isFinite(id)) submitVoteForCandidate(id, btn);
                });
            });
        }
    }

    document.getElementById("vote-overlay").classList.remove("hidden");
    if (isChoiceMode) await runChoiceVerification(election, choiceData);
}

function closeVoteModal() {
    voteTarget = null;
    choiceTarget = null;
    document.getElementById("vote-overlay").classList.add("hidden");
}

/* ─── Results Modal ──────────────────────────────── */

function closeResultsModal() {
    resultsTarget = null;
    document.getElementById("results-overlay").classList.add("hidden");
}

function renderResultsData(election, payload) {
    const data = payload?.results || null;
    const rows = Array.isArray(data?.tally) ? data.tally : [];
    const content = document.getElementById("results-content");
    const empty = document.getElementById("results-empty");
    const loading = document.getElementById("results-loading");
    const tableWrap = document.getElementById("results-table-wrap");
    const barsWrap = document.getElementById("results-bars-wrap");
    const dateLine = document.getElementById("results-published-at");

    loading.classList.add("hidden");

    if (!rows.length) {
        empty.classList.remove("hidden");
        content.classList.add("hidden");
        return;
    }

    const totalVotes = rows.reduce((acc, r) => acc + (Number(r.votes) || 0), 0);
    const winnerVotes = Math.max(0, ...rows.map((r) => Number(r.votes) || 0));
    dateLine.textContent = `${payload?.date_publication || "-"} ${payload?.temps_publication || ""}`.trim();
    empty.classList.add("hidden");
    content.classList.remove("hidden");

    const mode = (election?.affichage_resultats || "").toLowerCase();
    const useTable = mode === "complet" || mode === "tableau_detaille";

    const detailedRows = rows.map((r) => {
        const votes = Number(r.votes) || 0;
        const pct = totalVotes > 0 ? ((votes * 100) / totalVotes).toFixed(1) : "0.0";
        const isWinner = votes === winnerVotes && winnerVotes > 0;
        const rowClass = isWinner ? "bg-emerald-50/70" : "";
        const nameClass = isWinner ? "text-emerald-800" : "text-slate-800";
        const voteClass = isWinner ? "text-emerald-700 font-bold" : "text-slate-700";
        return `<tr class="border-t border-slate-100 ${rowClass}">
            <td class="py-3 px-4 font-medium ${nameClass}">${escapeHtml(r.nom || `Candidat ${r.candidat_id}`)}${isWinner ? ' <span class="text-[10px] font-bold uppercase tracking-wide text-emerald-700">(gagnant)</span>' : ""}</td>
            <td class="py-3 px-4 text-center ${voteClass}">${votes}</td>
            <td class="py-3 px-4 text-center text-indigo-600 font-semibold">${pct}%</td>
        </tr>`;
    }).join("");

    const rankingRows = [...rows]
        .sort((a, b) => (Number(b.votes) || 0) - (Number(a.votes) || 0))
        .map((r, idx) => {
            const votes = Number(r.votes) || 0;
            const isWinner = votes === winnerVotes && winnerVotes > 0;
            const rowClass = isWinner ? "bg-emerald-50/70" : "";
            const rankClass = isWinner ? "text-emerald-700" : "text-slate-700";
            const nameClass = isWinner ? "text-emerald-800 font-bold" : "text-slate-800";
            return `<tr class="border-t border-slate-100 ${rowClass}">
                <td class="py-3 px-4 ${rankClass} font-semibold">${idx + 1}</td>
                <td class="py-3 px-4 font-medium ${nameClass}">${escapeHtml(r.nom || `Candidat ${r.candidat_id}`)}${isWinner ? ' <span class="text-[10px] font-bold uppercase tracking-wide text-emerald-700">(gagnant)</span>' : ""}</td>
            </tr>`;
        }).join("");

    tableWrap.innerHTML = useTable
        ? `<table class="w-full text-sm">
               <thead><tr class="text-left text-slate-500 bg-slate-50"><th class="py-3 px-4">Candidat</th><th class="py-3 px-4 text-center">Voix</th><th class="py-3 px-4 text-center">Part</th></tr></thead>
               <tbody>${detailedRows}</tbody>
           </table>`
        : `<table class="w-full text-sm">
               <thead><tr class="text-left text-slate-500 bg-slate-50"><th class="py-3 px-4">Rang</th><th class="py-3 px-4">Candidat</th></tr></thead>
               <tbody>${rankingRows}</tbody>
           </table>`;
    tableWrap.classList.remove("hidden");
    barsWrap.classList.add("hidden");
}

async function openResultsModal(election) {
    resultsTarget = election;
    const titleEl = document.getElementById("results-modal-election-title");
    const loading = document.getElementById("results-loading");
    const empty = document.getElementById("results-empty");
    const content = document.getElementById("results-content");

    titleEl.textContent = election?.titre || "Résultats";
    loading.classList.remove("hidden");
    empty.classList.add("hidden");
    content.classList.add("hidden");
    document.getElementById("results-overlay").classList.remove("hidden");

    try {
        const response = await fetch(`${API_BASE_URL}/api/public/elections/${election.id}/published-results`, {
            headers: { "ngrok-skip-browser-warning": "true" },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            loading.classList.add("hidden");
            empty.classList.remove("hidden");
            return;
        }
        renderResultsData(election, data);
    } catch (_) {
        loading.classList.add("hidden");
        empty.classList.remove("hidden");
    }
}

/* ─── Vote Submission ────────────────────────────── */

async function submitVoteForCandidate(candidatId, triggerBtn) {
    if (!voteTarget || !currentElector) return;
    const pwd = document.getElementById("vote-password").value;
    const errEl = document.getElementById("vote-modal-error");
    errEl.classList.add("hidden");

    const hasSk =
        typeof isElectorSigningReady === "function" &&
        currentElector &&
        (await isElectorSigningReady(currentElector.email));

    if (!hasSk && !pwd) {
        errEl.textContent = "Reconnectez-vous avec votre mot de passe, ou saisissez-le ci-dessus pour cette session.";
        errEl.classList.remove("hidden");
        return;
    }
    if (!Number.isFinite(candidatId)) return;

    const labelHtml = triggerBtn.innerHTML;
    triggerBtn.innerHTML = "Envoi sécurisé…";
    setVoteCandidateButtonsDisabled(true);

    try {
        await submitEncryptedVote({
            email: currentElector.email,
            password: hasSk ? undefined : pwd,
            election_id: voteTarget.id,
            cle_publique_election: voteTarget.cle_publique_election,
            participation_id: voteTarget.participation_id,
            vote_ordinal: voteTarget.vote_ordinal,
            candidat_id: candidatId,
        });
        showToast(tElector("vote Accepté"), "success");
        closeVoteModal();
        await loadElectorDashboard();
    } catch (e) {
        errEl.textContent = e.message || "Erreur";
        errEl.classList.remove("hidden");
    } finally {
        triggerBtn.innerHTML = labelHtml;
        setVoteCandidateButtonsDisabled(false);
    }
}

function setVoteCandidateButtonsDisabled(disabled) {
    document.querySelectorAll(".vote-candidate-btn").forEach((b) => { b.disabled = disabled; });
}

/* ─── Choice Verification ────────────────────────── */

function renderChoiceVerificationPanel(html) {
    const panel = document.getElementById("vote-verification-panel");
    if (!panel) return;
    panel.innerHTML = html;
    panel.classList.remove("hidden");
}

async function sha256TextHex(text) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyZkpPacket(packet) {
    const proof = String(packet?.proof_pi || "");
    if (!proof.startsWith("ZKP_V1|")) return false;
    const expectedBody = {
        H_B: String(packet.hash_b_hex || "").trim().toLowerCase(),
        N: String(packet.nullifier_hex || "").trim().toLowerCase(),
        election_id: Number(packet.election_id),
        schema: "EVOTE_ZKP_V1",
        status: packet.vote_status || "",
    };
    const canonical = JSON.stringify(expectedBody, Object.keys(expectedBody).sort());
    const expected = `ZKP_V1|${await sha256TextHex(canonical)}`;
    return proof === expected;
}

async function runChoiceVerification(election, choiceData) {
    if (!choiceData?.nullifier_hex) {
        renderChoiceVerificationPanel(`
            <p class="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">DS-V&eacute;rification</p>
            <p class="text-sm text-amber-800 mt-2">N introuvable pour ce bulletin.</p>
        `);
        return;
    }

    renderChoiceVerificationPanel(`
        <p class="text-xs font-bold uppercase tracking-[0.18em] text-indigo-700">DS-V&eacute;rification</p>
        <p class="text-sm text-slate-600 mt-2">Demande de v&eacute;rification envoy&eacute;e avec N. R&eacute;cup&eacute;ration de H(B) et &pi;...</p>
    `);

    try {
        const packet = await requestVoteVerificationPacket({
            email: currentElector.email,
            election_id: election.id,
            nullifier_hex: choiceData.nullifier_hex,
        });
        const active = String(packet.vote_status || "").toLowerCase() === "actif";
        const proofValid = active && await verifyZkpPacket(packet);
        const statusClass = proofValid ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900";
        const statusText = proofValid
            ? "Preuve valide : H(B) et &pi; correspondent &agrave; N pour cette &eacute;lection."
            : "Preuve invalide ou bulletin non actif : vous pouvez signaler l'erreur.";
        renderChoiceVerificationPanel(`
            <div class="rounded-xl border ${statusClass} p-4">
                <p class="text-xs font-bold uppercase tracking-[0.18em]">DS-V&eacute;rification</p>
                <p class="text-sm font-semibold mt-2">${statusText}</p>
                <p class="text-[11px] mt-2 opacity-80 break-all">N: ${escapeHtml(packet.nullifier_hex || "-")}</p>
                <p class="text-[11px] mt-1 opacity-80 break-all">H(B): ${escapeHtml(packet.hash_b_hex || "-")}</p>
                <p class="text-[11px] mt-1 opacity-80 break-all">&pi;: ${escapeHtml(packet.proof_pi || "-")}</p>
            </div>
            <div class="flex flex-wrap justify-end gap-2 mt-4">
                ${proofValid ? `<button type="button" id="choice-proof-confirm" class="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white">Preuve confirm&eacute;e</button>` : ""}
                <button type="button" id="choice-proof-signal" class="px-4 py-2 rounded-lg text-sm font-semibold ${proofValid ? "border border-red-200 text-red-700 hover:bg-red-50" : "bg-red-600 hover:bg-red-700 text-white"}">Erreur signal&eacute;e</button>
            </div>
        `);
        document.getElementById("choice-proof-confirm")?.addEventListener("click", () => confirmChoiceVerification(election, packet));
        document.getElementById("choice-proof-signal")?.addEventListener("click", () => signalChoiceVerification(election, packet));
    } catch (error) {
        renderChoiceVerificationPanel(`
            <p class="text-xs font-bold uppercase tracking-[0.18em] text-red-700">DS-V&eacute;rification</p>
            <p class="text-sm text-red-700 mt-2">${escapeHtml(error.message || "V&eacute;rification impossible.")}</p>
        `);
    }
}

async function confirmChoiceVerification(election, choiceData) {
    try {
        await submitVoteVerificationDecision({
            email: currentElector.email,
            election_id: election.id,
            nullifier_hex: choiceData.nullifier_hex,
            proof_valid: true,
            reason: "",
        });
        showToast("Preuve confirmee.", "success");
        await loadElectorDashboard();
    } catch (error) {
        showToast(error.message || "Confirmation impossible.", "error");
    }
}

async function signalChoiceVerification(election, choiceData) {
    const ok = await askConfirmation({
        title: "Signaler une erreur",
        message: "Le serveur invalidera ce bulletin et recalculera les resultats publies si necessaire.",
    });
    if (!ok) return;
    try {
        await submitVoteVerificationDecision({
            email: currentElector.email,
            election_id: election.id,
            nullifier_hex: choiceData.nullifier_hex,
            proof_valid: false,
            reason: "Erreur signalee depuis l'espace electeur",
        });
        showToast("Erreur signalee, bulletin invalide.", "success");
        closeVoteModal();
        await loadElectorDashboard();
    } catch (error) {
        showToast(error.message || "Signalement impossible.", "error");
    }
}

async function openChoiceModal(election) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/elector/elections/${election.id}/my-choice?elector_email=${encodeURIComponent(currentElector.email)}`, {
            headers: { "ngrok-skip-browser-warning": "true" },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) { showToast(data.detail || "Choix introuvable.", "error"); return; }
        await openVoteModal(election, { mode: "choice", choiceData: data });
    } catch (error) {
        showToast(error.message || "Choix introuvable.", "error");
    }
}

/* ─── Profile Modal ──────────────────────────────── */

function resetElectorPasswordFlow() {
    document.getElementById("elector-pass-step-1")?.classList.remove("hidden");
    document.getElementById("elector-pass-step-2")?.classList.add("hidden");
    document.getElementById("elector-pass-step-3")?.classList.add("hidden");
    const fields = ["elector-password-otp", "elector-new-password", "elector-confirm-password"];
    fields.forEach((id) => { const el = document.getElementById(id); if (el) el.value = ""; });
}

function openElectorProfileModal() {
    document.getElementById("elector-profile-name").value = currentElector?.nom || "Électeur";
    document.getElementById("elector-profile-email").value = currentElector?.email || "-";
    document.getElementById("elector-email-change-panel")?.classList.add("hidden");
    document.getElementById("elector-password-change-panel")?.classList.add("hidden");
    resetElectorPasswordFlow();
    document.getElementById("elector-profile-overlay")?.classList.remove("hidden");
}

function closeElectorProfileModal() {
    document.getElementById("elector-profile-overlay")?.classList.add("hidden");
}

function toggleElectorEmailPanel() {
    document.getElementById("elector-password-change-panel")?.classList.add("hidden");
    document.getElementById("elector-email-change-panel")?.classList.toggle("hidden");
}

function toggleElectorPasswordPanel() {
    document.getElementById("elector-email-change-panel")?.classList.add("hidden");
    document.getElementById("elector-password-change-panel")?.classList.toggle("hidden");
    resetElectorPasswordFlow();
}

async function saveElectorEmailChange() {
    const oldEmail = (currentElector?.email || "").trim().toLowerCase();
    const newEmail = (document.getElementById("elector-new-email")?.value || "").trim().toLowerCase();
    const confirmEmail = (document.getElementById("elector-confirm-email")?.value || "").trim().toLowerCase();
    if (!newEmail || !confirmEmail) { showToast(tElector("profileFillEmails"), "error"); return; }

    const response = await fetch(`${API_BASE_URL}/api/elector/profile/change-email`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({ current_email: oldEmail, new_email: newEmail, confirm_email: confirmEmail }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { showToast(data.detail || "Changement email impossible.", "error"); return; }

    currentElector.email = data.email || newEmail;
    localStorage.setItem("evote_user", JSON.stringify(currentElector));
    document.getElementById("elector-email-display").textContent = currentElector.email;
    document.getElementById("elector-profile-email").value = currentElector.email;
    showToast(tElector("profileEmailChanged"), "success");
    document.getElementById("elector-email-change-panel")?.classList.add("hidden");
    await loadElectorDashboard();
}

async function sendElectorPasswordOtp() {
    const response = await fetch(`${API_BASE_URL}/api/elector/password-reset/request`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({ email: currentElector.email }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { showToast(data.detail || "Envoi OTP impossible.", "error"); return; }
    showToast(tElector("otpSent"), "success");
    document.getElementById("elector-pass-step-1")?.classList.add("hidden");
    document.getElementById("elector-pass-step-2")?.classList.remove("hidden");
}

async function verifyElectorPasswordOtp() {
    const otp = (document.getElementById("elector-password-otp")?.value || "").trim();
    const response = await fetch(`${API_BASE_URL}/api/elector/password-reset/verify`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({ email: currentElector.email, otp }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { showToast(data.detail || "OTP invalide", "error"); return; }
    showToast(tElector("otpValidated"), "success");
    document.getElementById("elector-pass-step-2")?.classList.add("hidden");
    document.getElementById("elector-pass-step-3")?.classList.remove("hidden");
}

function electorU8ToB64(u8) {
    let s = "";
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s);
}

async function electorDeriveAesWrapKeyFromPassword(password, saltU8) {
    const pwKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), { name: "PBKDF2" }, false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: saltU8, iterations: 100000, hash: "SHA-256" },
        pwKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["wrapKey", "unwrapKey"]
    );
}

async function buildElectorPasswordResetPayload(newPassword, email) {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const wrapKey = await electorDeriveAesWrapKeyFromPassword(newPassword, salt);
    const wrapped = await crypto.subtle.wrapKey("pkcs8", pair.privateKey, wrapKey, { name: "AES-GCM", iv });
    const spki = await crypto.subtle.exportKey("spki", pair.publicKey);
    return {
        email,
        cle_publique: "WC_P256." + electorU8ToB64(new Uint8Array(spki)),
        sel: forge.util.encode64(String.fromCharCode(...salt)),
        iv: forge.util.encode64(String.fromCharCode(...iv)),
        enc_k: JSON.stringify({ v: 3, w: electorU8ToB64(new Uint8Array(wrapped)) }),
    };
}

async function saveElectorPasswordChange() {
    const np = document.getElementById("elector-new-password")?.value || "";
    const cp = document.getElementById("elector-confirm-password")?.value || "";
    if (!np || !cp || np !== cp) { showToast(tElector("pwdMismatch"), "error"); return; }

    const payload = await buildElectorPasswordResetPayload(np, currentElector.email);
    const response = await fetch(`${API_BASE_URL}/api/elector/password-reset/confirm`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { showToast(data.detail || "Changement mot de passe impossible.", "error"); return; }

    showToast(tElector("pwdChanged"), "success");
    document.getElementById("elector-password-change-panel")?.classList.add("hidden");
    resetElectorPasswordFlow();
}

/* ─── i18n ───────────────────────────────────────── */

const electorI18n = (window.EVOTE_I18N && window.EVOTE_I18N.dictionaries.electorDashboard) || { fr: {}, en: {} };

function getElectorLang() {
    if (window.EVOTE_I18N?.getLanguage) return window.EVOTE_I18N.getLanguage();
    return "fr";
}

function setElectorText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function tElector(key) {
    const lang = getElectorLang();
    const bucket = electorI18n[lang] || electorI18n.fr;
    return bucket[key] || electorI18n.fr[key] || key;
}

function applyElectorLanguage() {
    const lang = getElectorLang();
    const t = electorI18n[lang];
    setElectorText("elector-help-label", t.helpLabel);
    setElectorText("elector-participation-title", t.participationTitle);
    setElectorText("elector-language-header-label", t.languageHeaderLabel);
    document.documentElement.lang = lang === "en" ? "en" : "fr";
    if (currentElector) {
        const welcomeEl = document.getElementById("elector-welcome");
        if (welcomeEl) welcomeEl.textContent = `${t.welcomePrefix}, ${currentElector.nom || "Électeur"}`;
    }
}

function toggleElectorLanguage() {
    const next = getElectorLang() === "fr" ? "en" : "fr";
    if (window.EVOTE_I18N?.setLanguage) window.EVOTE_I18N.setLanguage(next);
    else localStorage.setItem("evote_lang", next);
    applyElectorLanguage();
}

/* ─── Identity / Session ─────────────────────────── */

function loadElectorIdentity() {
    const storedUser = JSON.parse(localStorage.getItem("evote_user") || "null");
    if (!storedUser || storedUser.role !== "elector") {
        window.location.href = "Inscription-Electeur.html";
        return;
    }
    currentElector = storedUser;
    const t = electorI18n[getElectorLang()];
    const welcomeEl = document.getElementById("elector-welcome");
    if (welcomeEl) welcomeEl.textContent = `${t.welcomePrefix}, ${storedUser.nom || "Électeur"}`;
    const emailEl = document.getElementById("elector-email-display");
    if (emailEl) emailEl.textContent = storedUser.email || "-";
}



/* ─── Dashboard Rendering ────────────────────────── */

function statusStyle(status) {
    if (status === "Active") return "bg-green-100 text-green-700";
    if (status === "Planifiée") return "bg-yellow-100 text-yellow-700";
    return "bg-slate-100 text-slate-600";
}

function participationStyle(status) {
    if (status === "Accepté") return "bg-emerald-100 text-emerald-700";
    if (status === "Refusé") return "bg-red-100 text-red-700";
    if (status === "En attente") return "bg-amber-100 text-amber-700";
    return "bg-slate-100 text-slate-600";
}

async function requestParticipation(electionId, adminEmail) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/elector/participations/request`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "ngrok-skip-browser-warning": "true",
            },
            body: JSON.stringify({ elector_email: currentElector.email, admin_email: adminEmail, election_id: electionId }),
        });
        const data = await response.json();
        if (!response.ok) { showToast(data.detail || "Demande impossible.", "error"); return; }
        showToast(tElector("Demande envoyée"), "success");
        await loadElectorDashboard();
    } catch (error) {
        showToast(tElector("serverError"), "error");
    }
}

async function loadElectorDashboard() {
    const feedback = document.getElementById("elector-dashboard-feedback");
    const container = document.getElementById("elector-elections-list");
    feedback.textContent = tElector("loading");
    container.innerHTML = "";

    try {
        const response = await fetch(`${API_BASE_URL}/api/elector/elections/dashboard?elector_email=${encodeURIComponent(currentElector.email)}`, {
            headers: { "ngrok-skip-browser-warning": "true" },
        });
        const data = await response.json();
        if (!response.ok) {
            feedback.textContent = data.detail || "Impossible de charger les élections.";
            feedback.className = "mt-3 text-sm font-medium text-red-600";
            return;
        }

        if (!data.elections.length) {
            container.innerHTML = '<div class="lg:col-span-2 bg-white rounded-[2rem] p-8 card-shadow text-slate-400 text-center">Aucune élection disponible.</div>';
            feedback.textContent = tElector("noData");
            return;
        }

        const sortedElections = [...data.elections].sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
        lastDashboardElections = sortedElections;

        sortedElections.forEach((election) => {
            const canRequest = election.participation_status === "Aucune demande";
            const isAccepted = election.participation_status === "Accepté";
            const canVote = !!election.can_vote;
            const closeDateTime = new Date(`${election.date_cloture}T${election.temps_cloture || "00:00"}`);
            const isClosed = !Number.isNaN(closeDateTime.getTime()) && closeDateTime < new Date();
            const arLabel = election.affichage_resultats_label || "Complet";
            const inhElig = election.eligibility_reason
                ? `<p class="text-xs text-amber-700 mt-2">${escapeHtml(election.eligibility_reason)}</p>`
                : "";

            const card = document.createElement("div");
            card.className = "bg-white rounded-[2rem] p-6 card-shadow border border-slate-100";
            card.innerHTML = `
                <div class="flex justify-between items-start mb-4">
                    <h3 class="text-xl font-bold text-slate-800">${escapeHtml(election.titre)}</h3>
                    <span class="px-3 py-1 rounded-full text-xs font-bold ${statusStyle(election.status)}">${escapeHtml(election.status)}</span>
                </div>
                <div class="flex flex-wrap gap-2 mb-3">
                    <span class="text-xs font-semibold px-2.5 py-1 rounded-lg bg-fuchsia-50 text-fuchsia-800">Résultats : ${escapeHtml(arLabel)}</span>
                </div>
                <p class="text-sm text-slate-500 mb-2">Administrateur: <span class="font-semibold">${escapeHtml(election.admin_nom || "-")}</span></p>
                <p class="text-sm text-slate-500">Ouverture: ${escapeHtml(election.date_ouverture)} ${escapeHtml(election.temps_ouverture)}</p>
                <p class="text-sm text-slate-500 mb-4">Clôture: ${escapeHtml(election.date_cloture)} ${escapeHtml(election.temps_cloture)}</p>
                <div class="flex flex-wrap items-center gap-2 justify-between">
                    <span class="px-3 py-1 rounded-full text-xs font-bold ${participationStyle(election.participation_status)}">${escapeHtml(election.participation_status)}</span>
                    <div class="flex flex-wrap gap-2 justify-end flex-1">
                        ${canRequest ? `<button class="request-btn bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-semibold" data-election-id="${election.id}" data-admin-email="${escapeHtml(election.admin_email)}">Demander participation</button>` : ""}
                        ${isAccepted ? `<span class="text-xs font-semibold text-emerald-700 self-center hidden sm:inline">Accès accordé</span>` : ""}
                        ${isAccepted && canVote ? `<button type="button" class="vote-open-btn px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white" data-election-id="${election.id}">Voter</button>` : ""}
                        ${isClosed ? `<button type="button" class="results-open-btn px-4 py-2 rounded-lg text-sm font-semibold bg-fuchsia-600 hover:bg-fuchsia-700 text-white" data-election-id="${election.id}">Voir résultats</button>` : ""}
                    </div>
                </div>
                ${isAccepted && !canVote && election.eligibility_reason ? `<div class="mt-2">${inhElig}</div>` : ""}
            `;
            container.appendChild(card);
        });

        document.querySelectorAll(".request-btn").forEach((btn) => {
            btn.addEventListener("click", () => requestParticipation(parseInt(btn.dataset.electionId, 10), btn.dataset.adminEmail));
        });

        document.querySelectorAll(".vote-open-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const id = parseInt(btn.dataset.electionId, 10);
                const el = lastDashboardElections.find((e) => e.id === id);
                if (el) openVoteModal(el);
            });
        });

        document.querySelectorAll(".results-open-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const id = parseInt(btn.dataset.electionId, 10);
                const el = lastDashboardElections.find((e) => e.id === id);
                if (el) openResultsModal(el);
            });
        });

        document.querySelectorAll(".choice-open-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const id = parseInt(btn.dataset.electionId, 10);
                const el = lastDashboardElections.find((e) => e.id === id);
                if (el) openChoiceModal(el);
            });
        });

        feedback.textContent = `Dernière mise à jour (${new Date().toLocaleTimeString()})`;
        feedback.className = "mt-3 text-sm font-medium text-emerald-600";
    } catch (error) {
        feedback.textContent = tElector("serverError");
        feedback.className = "mt-3 text-sm font-medium text-red-600";
    }
}

/* ─── Event Bindings ─────────────────────────────── */

document.getElementById("elector-open-profile")?.addEventListener("click", openElectorProfileModal);
document.getElementById("elector-profile-close")?.addEventListener("click", closeElectorProfileModal);
document.getElementById("elector-edit-email-btn")?.addEventListener("click", toggleElectorEmailPanel);
document.getElementById("elector-edit-password-btn")?.addEventListener("click", toggleElectorPasswordPanel);
document.getElementById("elector-save-email-btn")?.addEventListener("click", saveElectorEmailChange);
document.getElementById("elector-send-otp-btn")?.addEventListener("click", sendElectorPasswordOtp);
document.getElementById("elector-verify-otp-btn")?.addEventListener("click", verifyElectorPasswordOtp);
document.getElementById("elector-save-password-btn")?.addEventListener("click", saveElectorPasswordChange);
document.getElementById("elector-language-toggle-header")?.addEventListener("click", toggleElectorLanguage);

/* ─── Init ───────────────────────────────────────── */

applyElectorLanguage();
loadElectorIdentity();
loadElectorDashboard();
setInterval(loadElectorDashboard, 60000);